import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

import type { SteamUserAccount } from '@/server/database/steam-user-repository';
import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface CandidateRow extends RowDataPacket {
  profileId: string;
  driverKey: string | null;
  playerId: string | number | null;
  steamGuid: string | null;
  driverName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  linkedUserId: string | number | null;
  legacyEmail: string | null;
  legacyDisplayName: string | null;
  legacyPilotPlayerId: string | number | null;
  legacyPilotSteamGuid: string | null;
  legacyPilotStrackerName: string | null;
  teamName: string | null;
  teamRole: string | null;
}

interface CountRow extends RowDataPacket {
  value: number | string | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function maskSteamId64(value: string): string {
  return `${value.slice(0, 5)}••••${value.slice(-4)}`;
}

function maskHash(value: string | null): string | null {
  if (!value) return null;
  const prefix = value.startsWith('sha256#') ? 'sha256#' : '';
  const body = prefix ? value.slice(prefix.length) : value;
  if (body.length < 12) return `${prefix}${body}`;
  return `${prefix}${body.slice(0, 6)}…${body.slice(-6)}`;
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface HistoricalProfileCandidate {
  profileId: string;
  displayName: string;
  driverName: string | null;
  playerId: string | null;
  steamGuidMasked: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  teamName: string | null;
  teamRole: string | null;
  linkedLegacyUser: boolean;
  legacyDisplayName: string | null;
  evidence: string[];
  confidence: 'exact' | 'strong' | 'manual';
  recommended: boolean;
}

export class HistoricalProfileMatchError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function auditHistoricalProfileMatch(
  account: SteamUserAccount
) {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new HistoricalProfileMatchError(
        stage,
        'DATABASE_NOT_CONFIGURED',
        'Database is not configured.'
      );
    }

    if (!/^\d{17}$/.test(account.steamId64)) {
      throw new HistoricalProfileMatchError(
        stage,
        'INVALID_STEAM_ID64',
        'Authenticated account does not contain a valid SteamID64.'
      );
    }

    const rawSha = sha256(account.steamId64);
    const deterministicCandidates = [
      account.steamId64,
      rawSha,
      `sha256#${rawSha}`
    ];

    const pool = getDatabasePool();

    stage = 'profile-candidates';

    const [rows] = await pool.query<CandidateRow[]>(`
      SELECT
        profiles.id AS profileId,
        profiles.driver_key AS driverKey,
        profiles.player_id AS playerId,
        profiles.steam_guid AS steamGuid,
        profiles.driver_name AS driverName,
        profiles.display_name AS displayName,
        profiles.avatar_url AS avatarUrl,
        profiles.country_code AS countryCode,
        profiles.linked_user_id AS linkedUserId,
        users.email AS legacyEmail,
        users.display_name AS legacyDisplayName,
        users.pilot_player_id AS legacyPilotPlayerId,
        users.pilot_steam_guid AS legacyPilotSteamGuid,
        users.pilot_stracker_name AS legacyPilotStrackerName,
        users.team_name AS teamName,
        users.team_role AS teamRole
      FROM gc_driver_profiles AS profiles
      LEFT JOIN gc_users AS users
        ON users.id = profiles.linked_user_id
      ORDER BY
        COALESCE(NULLIF(profiles.display_name, ''), profiles.driver_name),
        profiles.id
    `);

    stage = 'existing-links';

    const [linkedRows] = await pool.query<CountRow[]>(`
      SELECT COUNT(*) AS value
      FROM gc_driver_identities
      WHERE steam_user_id = ?
        AND driver_profile_id IS NOT NULL
        AND verification_status = 'verified'
    `, [account.id]);

    const existingVerifiedProfileLinks = numberValue(
      linkedRows[0]?.value
    );

    const exactRows = rows.filter((row) => {
      const profileGuid = normalize(row.steamGuid);
      const userGuid = normalize(row.legacyPilotSteamGuid);

      return deterministicCandidates.includes(profileGuid) ||
        deterministicCandidates.includes(userGuid);
    });

    const candidates: HistoricalProfileCandidate[] = rows.map((row) => {
      const evidence: string[] = [];
      const profileGuid = normalize(row.steamGuid);
      const legacyGuid = normalize(row.legacyPilotSteamGuid);
      const profilePlayerId = normalize(row.playerId);
      const legacyPlayerId = normalize(row.legacyPilotPlayerId);

      const directRaw =
        profileGuid === account.steamId64 ||
        legacyGuid === account.steamId64;

      const exactSha =
        profileGuid === `sha256#${rawSha}` ||
        legacyGuid === `sha256#${rawSha}`;

      const bareSha =
        profileGuid === rawSha ||
        legacyGuid === rawSha;

      if (directRaw) {
        evidence.push('SteamID64 histórico idéntico al SteamID64 verificado.');
      }

      if (exactSha) {
        evidence.push(
          'Coincidencia exacta con sha256#SHA256(SteamID64 verificado).'
        );
      }

      if (bareSha) {
        evidence.push(
          'Coincidencia exacta con SHA256(SteamID64 verificado) sin prefijo.'
        );
      }

      if (
        profilePlayerId &&
        legacyPlayerId &&
        profilePlayerId === legacyPlayerId
      ) {
        evidence.push(
          'El Player ID del perfil coincide con el Player ID de su usuario histórico enlazado.'
        );
      }

      if (
        profileGuid &&
        legacyGuid &&
        profileGuid === legacyGuid
      ) {
        evidence.push(
          'El Steam GUID del perfil coincide con el Steam GUID de su usuario histórico enlazado.'
        );
      }

      if (row.linkedUserId !== null) {
        evidence.push('El perfil tenía una cuenta histórica enlazada.');
      }

      const exact = directRaw || exactSha || bareSha;
      const confidence: HistoricalProfileCandidate['confidence'] =
        exact ? 'exact' :
        evidence.length >= 3 ? 'strong' :
        'manual';

      const recommended =
        exact &&
        exactRows.length === 1 &&
        existingVerifiedProfileLinks === 0;

      return {
        profileId: String(row.profileId),
        displayName:
          normalize(row.displayName) ||
          normalize(row.driverName) ||
          `Perfil ${String(row.profileId)}`,
        driverName: normalize(row.driverName) || null,
        playerId: profilePlayerId || null,
        steamGuidMasked: maskHash(profileGuid || null),
        avatarUrl: normalize(row.avatarUrl) || null,
        countryCode: normalize(row.countryCode) || null,
        teamName: normalize(row.teamName) || null,
        teamRole: normalize(row.teamRole) || null,
        linkedLegacyUser: row.linkedUserId !== null,
        legacyDisplayName: normalize(row.legacyDisplayName) || null,
        evidence,
        confidence,
        recommended
      };
    });

    const matchingCandidates = candidates.filter(
      (candidate) => candidate.confidence === 'exact'
    );

    const manualCandidates = candidates.filter(
      (candidate) => candidate.confidence !== 'exact'
    );

    const uniqueExactMatch =
      matchingCandidates.length === 1 &&
      existingVerifiedProfileLinks === 0;

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      account: {
        steamUserId: account.id,
        steamId64Masked: maskSteamId64(account.steamId64),
        displayName: account.displayName,
        status: account.status,
        currentlyLinkedProfileId: account.linkedProfileId
      },
      deterministicTest: {
        algorithm: 'SHA-256 UTF-8 sobre SteamID64 decimal',
        rawSteamId64Exposed: false,
        testedRepresentations: [
          'SteamID64 decimal',
          'SHA256(SteamID64)',
          'sha256#SHA256(SteamID64)'
        ],
        generatedHashMasked: maskHash(`sha256#${rawSha}`)
      },
      summary: {
        historicalProfiles: rows.length,
        exactMatches: matchingCandidates.length,
        otherProfiles: manualCandidates.length,
        existingVerifiedProfileLinks,
        uniqueExactMatch,
        safeToLinkAutomatically: uniqueExactMatch
      },
      exactMatches: matchingCandidates,
      profilesForManualReview: manualCandidates,
      blockers: [
        ...(existingVerifiedProfileLinks > 0
          ? ['La cuenta Steam ya tiene un perfil verificado enlazado.']
          : []),
        ...(matchingCandidates.length === 0
          ? ['No se encontró una coincidencia criptográfica exacta.']
          : []),
        ...(matchingCandidates.length > 1
          ? ['Más de un perfil coincide; no debe enlazarse automáticamente.']
          : []),
        'Esta versión es exclusivamente de solo lectura y no modifica vínculos.'
      ],
      nextStep: uniqueExactMatch
        ? 'Preparar una operación de reclamación explícita para el único perfil recomendado.'
        : 'Revisar los perfiles y preparar una asignación administrativa manual con confirmación.'
    };
  } catch (error) {
    if (error instanceof HistoricalProfileMatchError) {
      throw error;
    }

    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;

    throw new HistoricalProfileMatchError(
      stage,
      'HISTORICAL_PROFILE_MATCH_FAILED',
      error instanceof Error ? error.message : 'Unknown audit error.',
      databaseCode
    );
  }
}
