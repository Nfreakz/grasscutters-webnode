import { createHash } from 'node:crypto';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket
} from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface SteamUserRow extends RowDataPacket {
  id: string | number;
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  steamProfileUrl: string | null;
  role: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastLoginAt: Date | string | null;
}

interface LinkedProfileRow extends RowDataPacket {
  driverProfileId: string;
  displayName: string | null;
}

interface IdentityRow extends RowDataPacket {
  id: string | number;
  steamUserId: string | number;
  driverProfileId: string | null;
}

interface CandidateProfileRow extends RowDataPacket {
  profileId: string;
}

interface ProfileOwnerRow extends RowDataPacket {
  steamUserId: string | number;
}

export interface SteamUserAccount {
  id: string;
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  steamProfileUrl: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  linkedProfileId: string | null;
  linkedDisplayName: string | null;
}

export class SteamUserPersistenceError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function fallbackDisplayName(steamId64: string): string {
  return `Steam ${steamId64.slice(0, 5)}••••${steamId64.slice(-4)}`;
}

function mapSteamUser(
  row: SteamUserRow,
  linkedProfile?: LinkedProfileRow
): SteamUserAccount {
  return {
    id: String(row.id),
    steamId64: row.steamId64,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    steamProfileUrl: row.steamProfileUrl,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    lastLoginAt: toIso(row.lastLoginAt),
    linkedProfileId: linkedProfile?.driverProfileId ?? null,
    linkedDisplayName: linkedProfile?.displayName ?? null
  };
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

function steamHash(steamId64: string): string {
  return createHash('sha256')
    .update(steamId64, 'utf8')
    .digest('hex');
}

async function selectSteamUser(
  connection: PoolConnection,
  steamId64: string
): Promise<SteamUserRow | null> {
  const [rows] = await connection.query<SteamUserRow[]>(`
    SELECT
      CAST(id AS CHAR) AS id,
      steam_id64 AS steamId64,
      display_name AS displayName,
      avatar_url AS avatarUrl,
      steam_profile_url AS steamProfileUrl,
      role,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt,
      last_login_at AS lastLoginAt
    FROM gc_steam_users
    WHERE steam_id64 = ?
    LIMIT 1
  `, [steamId64]);

  return rows[0] ?? null;
}

async function selectSteamIdentityForUpdate(
  connection: PoolConnection,
  steamUserId: string,
  steamId64: string
): Promise<IdentityRow | null> {
  const [rows] = await connection.query<IdentityRow[]>(`
    SELECT
      id,
      CAST(steam_user_id AS CHAR) AS steamUserId,
      driver_profile_id AS driverProfileId
    FROM gc_driver_identities
    WHERE identity_type = 'steam_id64'
      AND identity_value = ?
    LIMIT 1
    FOR UPDATE
  `, [steamId64]);

  const identity = rows[0] ?? null;

  if (identity && String(identity.steamUserId) !== steamUserId) {
    throw new SteamUserPersistenceError(
      'ensure-identity',
      'STEAM_IDENTITY_COLLISION',
      'SteamID64 is already assigned to another Steam user.'
    );
  }

  return identity;
}

async function selectLinkedProfile(
  connection: PoolConnection,
  steamUserId: string,
  steamId64: string
): Promise<LinkedProfileRow | undefined> {
  const [rows] = await connection.query<LinkedProfileRow[]>(`
    SELECT
      identities.driver_profile_id AS driverProfileId,
      COALESCE(
        NULLIF(profiles.display_name, ''),
        NULLIF(profiles.driver_name, '')
      ) AS displayName
    FROM gc_driver_identities AS identities
    INNER JOIN gc_driver_profiles AS profiles
      ON profiles.id = identities.driver_profile_id
    WHERE identities.steam_user_id = ?
      AND identities.identity_type = 'steam_id64'
      AND identities.identity_value = ?
      AND identities.verification_status = 'verified'
      AND identities.driver_profile_id IS NOT NULL
    LIMIT 1
  `, [steamUserId, steamId64]);

  return rows[0];
}

async function findExactHistoricalProfilesForUpdate(
  connection: PoolConnection,
  steamId64: string
): Promise<string[]> {
  const hash = steamHash(steamId64);
  const representations = [
    steamId64,
    hash,
    `sha256#${hash}`
  ];

  const [rows] = await connection.query<CandidateProfileRow[]>(`
    SELECT DISTINCT
      profiles.id AS profileId
    FROM gc_driver_profiles AS profiles
    LEFT JOIN gc_users AS legacy_users
      ON legacy_users.id = profiles.linked_user_id
    WHERE profiles.steam_guid IN (?, ?, ?)
       OR legacy_users.pilot_steam_guid IN (?, ?, ?)
    ORDER BY profiles.id
    FOR UPDATE
  `, [
    ...representations,
    ...representations
  ]);

  return rows.map((row) => String(row.profileId));
}

async function tryAutomaticHistoricalLink(
  connection: PoolConnection,
  input: {
    identity: IdentityRow;
    steamUserId: string;
    steamId64: string;
  }
): Promise<string | null> {
  if (input.identity.driverProfileId) {
    return input.identity.driverProfileId;
  }

  const matches = await findExactHistoricalProfilesForUpdate(
    connection,
    input.steamId64
  );

  if (matches.length !== 1) {
    return null;
  }

  const profileId = matches[0];

  const [ownerRows] = await connection.query<ProfileOwnerRow[]>(`
    SELECT CAST(steam_user_id AS CHAR) AS steamUserId
    FROM gc_driver_identities
    WHERE driver_profile_id = ?
      AND verification_status = 'verified'
    FOR UPDATE
  `, [profileId]);

  const claimedByAnotherAccount = ownerRows.some(
    (row) => String(row.steamUserId) !== input.steamUserId
  );

  if (claimedByAnotherAccount) {
    return null;
  }

  const [result] = await connection.execute<ResultSetHeader>(`
    UPDATE gc_driver_identities
    SET
      driver_profile_id = ?,
      source = 'steam_openid_deterministic_auto',
      verification_status = 'verified',
      verified_at = NOW(3),
      updated_at = NOW(3)
    WHERE id = ?
      AND steam_user_id = ?
      AND identity_type = 'steam_id64'
      AND identity_value = ?
      AND driver_profile_id IS NULL
  `, [
    profileId,
    input.identity.id,
    input.steamUserId,
    input.steamId64
  ]);

  return result.affectedRows === 1 ? profileId : null;
}

export function isSteamPersistenceReady(): boolean {
  return (
    runtimeConfig.databaseConfigured &&
    runtimeConfig.database.steamAuthPersistenceEnabled
  );
}

export async function persistSteamLogin(
  steamId64: string
): Promise<SteamUserAccount> {
  if (!/^\d{17}$/.test(steamId64)) {
    throw new SteamUserPersistenceError(
      'input',
      'INVALID_STEAM_ID64',
      'SteamID64 must contain exactly 17 digits.'
    );
  }

  if (!runtimeConfig.databaseConfigured) {
    throw new SteamUserPersistenceError(
      'configuration',
      'DATABASE_NOT_CONFIGURED',
      'Database connection is not configured.'
    );
  }

  if (!runtimeConfig.database.steamAuthPersistenceEnabled) {
    throw new SteamUserPersistenceError(
      'configuration',
      'STEAM_PERSISTENCE_DISABLED',
      'STEAM_AUTH_PERSISTENCE_ENABLED is disabled.'
    );
  }

  const pool = getDatabasePool();
  const connection = await pool.getConnection();
  let stage = 'transaction';

  try {
    await connection.beginTransaction();

    stage = 'upsert-user';

    const fallbackName = fallbackDisplayName(steamId64);

    await connection.execute<ResultSetHeader>(`
      INSERT INTO gc_steam_users (
        steam_id64,
        display_name,
        role,
        status,
        created_at,
        updated_at,
        last_login_at
      )
      VALUES (?, ?, 'member', 'active', NOW(3), NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        last_login_at = NOW(3),
        updated_at = NOW(3)
    `, [steamId64, fallbackName]);

    const user = await selectSteamUser(connection, steamId64);

    if (!user) {
      throw new SteamUserPersistenceError(
        stage,
        'STEAM_USER_NOT_FOUND_AFTER_UPSERT',
        'Steam user could not be read after upsert.'
      );
    }

    if (user.status !== 'active') {
      throw new SteamUserPersistenceError(
        stage,
        'STEAM_USER_DISABLED',
        'Steam user is not active.'
      );
    }

    const steamUserId = String(user.id);

    stage = 'ensure-identity';

    let identity = await selectSteamIdentityForUpdate(
      connection,
      steamUserId,
      steamId64
    );

    if (!identity) {
      const [result] = await connection.execute<ResultSetHeader>(`
        INSERT INTO gc_driver_identities (
          steam_user_id,
          driver_profile_id,
          identity_type,
          identity_value,
          source,
          verification_status,
          verified_at,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          NULL,
          'steam_id64',
          ?,
          'steam_openid',
          'verified',
          NOW(3),
          NOW(3),
          NOW(3)
        )
      `, [steamUserId, steamId64]);

      identity = {
        id: String(result.insertId),
        steamUserId,
        driverProfileId: null
      } as IdentityRow;
    }

    stage = 'automatic-historical-link';

    await tryAutomaticHistoricalLink(connection, {
      identity,
      steamUserId,
      steamId64
    });

    stage = 'linked-profile';

    const linkedProfile = await selectLinkedProfile(
      connection,
      steamUserId,
      steamId64
    );

    await connection.commit();

    return mapSteamUser(user, linkedProfile);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original persistence error.
    }

    if (error instanceof SteamUserPersistenceError) {
      throw error;
    }

    throw new SteamUserPersistenceError(
      stage,
      'STEAM_LOGIN_PERSISTENCE_FAILED',
      error instanceof Error ? error.message : 'Unknown persistence error.',
      databaseCode(error)
    );
  } finally {
    connection.release();
  }
}

export async function findSteamUserAccount(input: {
  steamUserId: string;
  steamId64: string;
}): Promise<SteamUserAccount | null> {
  if (
    !runtimeConfig.databaseConfigured ||
    !/^\d+$/.test(input.steamUserId) ||
    !/^\d{17}$/.test(input.steamId64)
  ) {
    return null;
  }

  const pool = getDatabasePool();
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query<SteamUserRow[]>(`
      SELECT
        CAST(id AS CHAR) AS id,
        steam_id64 AS steamId64,
        display_name AS displayName,
        avatar_url AS avatarUrl,
        steam_profile_url AS steamProfileUrl,
        role,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_login_at AS lastLoginAt
      FROM gc_steam_users
      WHERE id = ?
        AND steam_id64 = ?
        AND status = 'active'
      LIMIT 1
    `, [input.steamUserId, input.steamId64]);

    const user = rows[0];

    if (!user) return null;

    const linkedProfile = await selectLinkedProfile(
      connection,
      String(user.id),
      input.steamId64
    );

    return mapSteamUser(user, linkedProfile);
  } finally {
    connection.release();
  }
}
