import { createHash } from 'node:crypto';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket
} from 'mysql2/promise';

import type { SteamUserAccount } from '@/server/database/steam-user-repository';
import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

export const HISTORICAL_PROFILE_CLAIM_CONFIRMATION =
  'CLAIM_UNIQUE_HISTORICAL_PROFILE_V1';

interface ProfileRow extends RowDataPacket {
  profileId: string;
  displayName: string | null;
  driverName: string | null;
  playerId: string | number | null;
  steamGuid: string | null;
  linkedUserId: string | number | null;
  legacyPilotPlayerId: string | number | null;
  legacyPilotSteamGuid: string | null;
}

interface IdentityLinkRow extends RowDataPacket {
  id: string | number;
  steamUserId: string | number;
  driverProfileId: string | null;
  verificationStatus: string;
}

interface ProfileOwnerRow extends RowDataPacket {
  steamUserId: string | number;
  identityValue: string;
}

export class HistoricalProfileClaimError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function databaseCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return null;
}

async function selectProfilesForUpdate(
  connection: PoolConnection
): Promise<ProfileRow[]> {
  const [rows] = await connection.query<ProfileRow[]>(`
    SELECT
      profiles.id AS profileId,
      profiles.display_name AS displayName,
      profiles.driver_name AS driverName,
      profiles.player_id AS playerId,
      profiles.steam_guid AS steamGuid,
      profiles.linked_user_id AS linkedUserId,
      users.pilot_player_id AS legacyPilotPlayerId,
      users.pilot_steam_guid AS legacyPilotSteamGuid
    FROM gc_driver_profiles AS profiles
    LEFT JOIN gc_users AS users
      ON users.id = profiles.linked_user_id
    ORDER BY profiles.id
    FOR UPDATE
  `);

  return rows;
}

function exactProfileMatches(
  rows: ProfileRow[],
  steamId64: string
): ProfileRow[] {
  const rawHash = sha256(steamId64);
  const representations = new Set([
    steamId64,
    rawHash,
    `sha256#${rawHash}`
  ]);

  return rows.filter((row) => {
    const profileGuid = normalize(row.steamGuid);
    const legacyGuid = normalize(row.legacyPilotSteamGuid);

    return (
      representations.has(profileGuid) ||
      representations.has(legacyGuid)
    );
  });
}

export async function claimUniqueHistoricalProfile(input: {
  account: SteamUserAccount;
  requestedProfileId: string;
  confirmation: string;
}) {
  let stage = 'configuration';

  if (
    runtimeConfig.appEnvironment !== 'local' &&
    runtimeConfig.appEnvironment !== 'production'
  ) {
    throw new HistoricalProfileClaimError(
      stage,
      'ENVIRONMENT_NOT_ALLOWED',
      'Historical profile claims are not enabled in this environment.'
    );
  }

  if (!runtimeConfig.databaseConfigured) {
    throw new HistoricalProfileClaimError(
      stage,
      'DATABASE_NOT_CONFIGURED',
      'Database connection is not configured.'
    );
  }

  if (!runtimeConfig.database.steamProfileClaimEnabled) {
    throw new HistoricalProfileClaimError(
      stage,
      'PROFILE_CLAIM_DISABLED',
      'STEAM_PROFILE_CLAIM_ENABLED is disabled.'
    );
  }

  if (
    input.confirmation !== HISTORICAL_PROFILE_CLAIM_CONFIRMATION
  ) {
    throw new HistoricalProfileClaimError(
      stage,
      'INVALID_CONFIRMATION',
      'The claim confirmation phrase is invalid.'
    );
  }

  if (!/^\d{17}$/.test(input.account.steamId64)) {
    throw new HistoricalProfileClaimError(
      stage,
      'INVALID_STEAM_ID64',
      'The authenticated account has an invalid SteamID64.'
    );
  }

  if (!input.requestedProfileId.startsWith('drv_')) {
    throw new HistoricalProfileClaimError(
      stage,
      'INVALID_PROFILE_ID',
      'The requested profile ID is invalid.'
    );
  }

  const pool = getDatabasePool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    stage = 'lock-steam-identity';

    const [identityRows] =
      await connection.query<IdentityLinkRow[]>(`
        SELECT
          id,
          steam_user_id AS steamUserId,
          driver_profile_id AS driverProfileId,
          verification_status AS verificationStatus
        FROM gc_driver_identities
        WHERE identity_type = 'steam_id64'
          AND identity_value = ?
        LIMIT 1
        FOR UPDATE
      `, [input.account.steamId64]);

    const identity = identityRows[0];

    if (!identity) {
      throw new HistoricalProfileClaimError(
        stage,
        'STEAM_IDENTITY_NOT_FOUND',
        'The verified Steam identity does not exist.'
      );
    }

    if (String(identity.steamUserId) !== input.account.id) {
      throw new HistoricalProfileClaimError(
        stage,
        'STEAM_IDENTITY_OWNER_MISMATCH',
        'The verified Steam identity belongs to another account.'
      );
    }

    if (
      identity.driverProfileId &&
      identity.driverProfileId !== input.requestedProfileId
    ) {
      throw new HistoricalProfileClaimError(
        stage,
        'ACCOUNT_ALREADY_LINKED',
        'The Steam account is already linked to another driver profile.'
      );
    }

    stage = 'lock-profiles';

    const profiles = await selectProfilesForUpdate(connection);
    const exactMatches = exactProfileMatches(
      profiles,
      input.account.steamId64
    );

    if (exactMatches.length === 0) {
      throw new HistoricalProfileClaimError(
        stage,
        'NO_EXACT_PROFILE_MATCH',
        'No deterministic historical profile match was found.'
      );
    }

    if (exactMatches.length > 1) {
      throw new HistoricalProfileClaimError(
        stage,
        'MULTIPLE_EXACT_PROFILE_MATCHES',
        'More than one deterministic historical profile match was found.'
      );
    }

    const matchedProfile = exactMatches[0];

    if (matchedProfile.profileId !== input.requestedProfileId) {
      throw new HistoricalProfileClaimError(
        stage,
        'REQUESTED_PROFILE_NOT_EXACT_MATCH',
        'The requested profile is not the unique deterministic match.'
      );
    }

    stage = 'check-profile-owner';

    const [ownerRows] = await connection.query<ProfileOwnerRow[]>(`
      SELECT
        steam_user_id AS steamUserId,
        identity_value AS identityValue
      FROM gc_driver_identities
      WHERE driver_profile_id = ?
        AND verification_status = 'verified'
      FOR UPDATE
    `, [matchedProfile.profileId]);

    const foreignOwner = ownerRows.find(
      (row) => String(row.steamUserId) !== input.account.id
    );

    if (foreignOwner) {
      throw new HistoricalProfileClaimError(
        stage,
        'PROFILE_ALREADY_CLAIMED',
        'The historical profile is already claimed by another Steam account.'
      );
    }

    stage = 'link-profile';

    if (!identity.driverProfileId) {
      const [result] =
        await connection.execute<ResultSetHeader>(`
          UPDATE gc_driver_identities
          SET
            driver_profile_id = ?,
            verification_status = 'verified',
            verified_at = NOW(3),
            source = 'steam_openid_deterministic_claim',
            updated_at = NOW(3)
          WHERE id = ?
            AND steam_user_id = ?
            AND identity_type = 'steam_id64'
            AND identity_value = ?
            AND driver_profile_id IS NULL
        `, [
          matchedProfile.profileId,
          identity.id,
          input.account.id,
          input.account.steamId64
        ]);

      if (result.affectedRows !== 1) {
        throw new HistoricalProfileClaimError(
          stage,
          'PROFILE_LINK_UPDATE_FAILED',
          'The historical profile link was not written.'
        );
      }
    }

    await connection.commit();

    const displayName =
      normalize(matchedProfile.displayName) ||
      normalize(matchedProfile.driverName) ||
      matchedProfile.profileId;

    return {
      ok: true,
      claimed: true,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      steamUserId: input.account.id,
      driverProfile: {
        id: matchedProfile.profileId,
        displayName,
        playerId: normalize(matchedProfile.playerId) || null
      },
      verification: {
        method: 'sha256_steamid64_exact_unique',
        exactMatches: 1,
        confirmationRequired: true
      },
      legacyTablesModified: false,
      historicalDataMoved: false,
      historicalDataPreserved: true,
      nextStep:
        'Disable STEAM_PROFILE_CLAIM_ENABLED, restart the server and verify /perfil/.'
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }

    if (error instanceof HistoricalProfileClaimError) {
      throw error;
    }

    throw new HistoricalProfileClaimError(
      stage,
      'HISTORICAL_PROFILE_CLAIM_FAILED',
      error instanceof Error ? error.message : 'Unknown claim error.',
      databaseCode(error)
    );
  } finally {
    connection.release();
  }
}
