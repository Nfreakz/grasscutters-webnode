import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';


interface SourceRow extends RowDataPacket {
  sourceKey: string;
  label: string;
  championshipKey: string | null;
  serverIp: string | null;
  dbSizeBytes: number | string | null;
  dbModifiedAt: Date | string | null;
  lastImportStartedAt: Date | string | null;
  lastImportFinishedAt: Date | string | null;
  lastImportStatus: string | null;
  lastImportMessage: string | null;
  updatedAt: Date | string | null;
}

interface SourceLapCountRow extends RowDataPacket {
  sourceKey: string;
  totalLaps: number | string;
  validLaps: number | string;
  drivers: number | string;
  tracks: number | string;
  cars: number | string;
  newestLapUnix: number | string | null;
  oldestLapUnix: number | string | null;
}

interface ChampionshipRow extends RowDataPacket {
  sourceKey: string;
  championshipKey: string | null;
  laps: number | string;
  drivers: number | string;
}

interface IdentityCoverageRow extends RowDataPacket {
  profiles: number | string;
  profilesWithSteam: number | string;
  profilesWithoutSteam: number | string;
  profilesWithPlayerId: number | string;
  profilesLinkedToUser: number | string;
  uniqueSteamIds: number | string;
  uniquePlayerIds: number | string;
}

interface DuplicateSteamRow extends RowDataPacket {
  steamGuid: string;
  profiles: number | string;
  driverKeys: string;
  names: string;
}

interface SteamNameRow extends RowDataPacket {
  steamGuid: string;
  distinctNames: number | string;
  names: string;
  lapRows: number | string;
}

interface ProfileSampleRow extends RowDataPacket {
  driverKey: string;
  playerId: number | null;
  steamGuid: string | null;
  driverName: string;
  displayName: string | null;
  linkedUserId: string | null;
}

interface RecentSessionRow extends RowDataPacket {
  sessionId: number;
  type: string;
  trackDisplay: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  playerCount: number;
  lapCount: number;
  bestLapMs: number;
}

interface RatingCoverageRow extends RowDataPacket {
  ratings: number | string;
  ratingsWithSteam: number | string;
  ratingsWithoutSteam: number | string;
  ratingsWithoutProfile: number | string;
  profilesWithoutRating: number | string;
}

interface TeamIntegrityRow extends RowDataPacket {
  teams: number | string;
  memberships: number | string;
  activeMemberships: number | string;
  membershipsWithoutTeam: number | string;
  membershipsWithoutProfile: number | string;
  membershipsWithoutUser: number | string;
}

interface UserLinkIntegrityRow extends RowDataPacket {
  users: number | string;
  usersWithSteam: number | string;
  usersWithPlayerId: number | string;
  usersLinkedByProfile: number | string;
  usersWithSteamWithoutProfile: number | string;
}

interface SyncStatusRow extends RowDataPacket {
  status: string;
  entries: number | string;
  latestStartedAt: Date | string | null;
  latestFinishedAt: Date | string | null;
}

interface OverlapRow extends RowDataPacket {
  matchedRows: number | string;
  oldLapRows: number | string;
  newLapRows: number | string;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}


export interface DatabaseDataAudit {
  ok: true;
  readOnly: true;
  databaseName: string;
  generatedAt: string;
  identity: {
    coverage: {
      profiles: number;
      profilesWithSteam: number;
      profilesWithoutSteam: number;
      profilesWithPlayerId: number;
      profilesLinkedToUser: number;
      uniqueSteamIds: number;
      uniquePlayerIds: number;
    };
    duplicateSteamIds: Array<{
      steamGuid: string;
      profiles: number;
      driverKeys: string[];
      names: string[];
    }>;
    steamIdsWithMultipleNames: Array<{
      steamGuid: string;
      distinctNames: number;
      names: string[];
      lapRows: number;
    }>;
    profileSample: Array<{
      driverKey: string;
      playerId: number | null;
      steamGuid: string | null;
      driverName: string;
      displayName: string | null;
      linkedUserId: string | null;
    }>;
  };
  sources: {
    configured: Array<{
      sourceKey: string;
      label: string;
      championshipKey: string | null;
      serverIp: string | null;
      dbSizeBytes: number;
      dbModifiedAt: string | null;
      lastImportStartedAt: string | null;
      lastImportFinishedAt: string | null;
      lastImportStatus: string | null;
      lastImportMessage: string | null;
      updatedAt: string | null;
    }>;
    lapCoverage: Array<{
      sourceKey: string;
      totalLaps: number;
      validLaps: number;
      drivers: number;
      tracks: number;
      cars: number;
      newestLapUnix: number | null;
      oldestLapUnix: number | null;
    }>;
    championships: Array<{
      sourceKey: string;
      championshipKey: string | null;
      laps: number;
      drivers: number;
    }>;
  };
  stracker: {
    oldLapRows: number;
    newLapRows: number;
    approximateOverlap: {
      matchedRows: number;
      coverageOfOldPercent: number;
      coverageOfNewPercent: number;
      note: string;
    };
    recentSessions: Array<{
      sessionId: number;
      type: string;
      trackDisplay: string | null;
      startTime: string | null;
      endTime: string | null;
      playerCount: number;
      lapCount: number;
      bestLapMs: number;
    }>;
    syncStatus: Array<{
      status: string;
      entries: number;
      latestStartedAt: string | null;
      latestFinishedAt: string | null;
    }>;
  };
  ratings: {
    ratings: number;
    ratingsWithSteam: number;
    ratingsWithoutSteam: number;
    ratingsWithoutProfile: number;
    profilesWithoutRating: number;
  };
  teams: {
    teams: number;
    memberships: number;
    activeMemberships: number;
    membershipsWithoutTeam: number;
    membershipsWithoutProfile: number;
    membershipsWithoutUser: number;
  };
  users: {
    users: number;
    usersWithSteam: number;
    usersWithPlayerId: number;
    usersLinkedByProfile: number;
    usersWithSteamWithoutProfile: number;
  };
}

export async function auditDatabaseData(): Promise<DatabaseDataAudit> {
  if (!runtimeConfig.databaseConfigured) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  const pool = getDatabasePool();

  const [identityCoverageRows] = await pool.query<IdentityCoverageRow[]>(`
    SELECT
      COUNT(*) AS profiles,
      SUM(steam_guid IS NOT NULL AND TRIM(steam_guid) <> '') AS profilesWithSteam,
      SUM(steam_guid IS NULL OR TRIM(steam_guid) = '') AS profilesWithoutSteam,
      SUM(player_id IS NOT NULL) AS profilesWithPlayerId,
      SUM(linked_user_id IS NOT NULL AND TRIM(linked_user_id) <> '') AS profilesLinkedToUser,
      COUNT(DISTINCT NULLIF(TRIM(steam_guid), '')) AS uniqueSteamIds,
      COUNT(DISTINCT player_id) AS uniquePlayerIds
    FROM gc_driver_profiles
  `);

  const [duplicateSteamRows] = await pool.query<DuplicateSteamRow[]>(`
    SELECT
      TRIM(steam_guid) AS steamGuid,
      COUNT(*) AS profiles,
      GROUP_CONCAT(DISTINCT driver_key ORDER BY driver_key SEPARATOR '||') AS driverKeys,
      GROUP_CONCAT(
        DISTINCT COALESCE(NULLIF(display_name, ''), driver_name)
        ORDER BY COALESCE(NULLIF(display_name, ''), driver_name)
        SEPARATOR '||'
      ) AS names
    FROM gc_driver_profiles
    WHERE steam_guid IS NOT NULL
      AND TRIM(steam_guid) <> ''
    GROUP BY TRIM(steam_guid)
    HAVING COUNT(*) > 1
    ORDER BY profiles DESC, steamGuid
    LIMIT 100
  `);

  const [steamNameRows] = await pool.query<SteamNameRow[]>(`
    SELECT
      TRIM(steam_guid) AS steamGuid,
      COUNT(DISTINCT NULLIF(TRIM(driver_name), '')) AS distinctNames,
      GROUP_CONCAT(
        DISTINCT NULLIF(TRIM(driver_name), '')
        ORDER BY NULLIF(TRIM(driver_name), '')
        SEPARATOR '||'
      ) AS names,
      COUNT(*) AS lapRows
    FROM gc_stracker2_lap
    WHERE steam_guid IS NOT NULL
      AND TRIM(steam_guid) <> ''
    GROUP BY TRIM(steam_guid)
    HAVING COUNT(DISTINCT NULLIF(TRIM(driver_name), '')) > 1
    ORDER BY distinctNames DESC, lapRows DESC
    LIMIT 100
  `);

  const [profileSampleRows] = await pool.query<ProfileSampleRow[]>(`
    SELECT
      driver_key AS driverKey,
      player_id AS playerId,
      steam_guid AS steamGuid,
      driver_name AS driverName,
      display_name AS displayName,
      linked_user_id AS linkedUserId
    FROM gc_driver_profiles
    ORDER BY updated_at DESC, driver_name
    LIMIT 50
  `);

  const [sourceRows] = await pool.query<SourceRow[]>(`
    SELECT
      source_key AS sourceKey,
      label,
      championship_key AS championshipKey,
      server_ip AS serverIp,
      db_size_bytes AS dbSizeBytes,
      db_modified_at AS dbModifiedAt,
      last_import_started_at AS lastImportStartedAt,
      last_import_finished_at AS lastImportFinishedAt,
      last_import_status AS lastImportStatus,
      last_import_message AS lastImportMessage,
      updated_at AS updatedAt
    FROM gc_stracker2_source
    ORDER BY source_key
  `);

  const [sourceLapCountRows] = await pool.query<SourceLapCountRow[]>(`
    SELECT
      source_key AS sourceKey,
      COUNT(*) AS totalLaps,
      SUM(valid = 1) AS validLaps,
      COUNT(DISTINCT NULLIF(TRIM(steam_guid), '')) AS drivers,
      COUNT(DISTINCT NULLIF(TRIM(track_display), '')) AS tracks,
      COUNT(DISTINCT NULLIF(TRIM(car_display), '')) AS cars,
      MAX(timestamp_unix) AS newestLapUnix,
      MIN(timestamp_unix) AS oldestLapUnix
    FROM gc_stracker2_lap
    GROUP BY source_key
    ORDER BY source_key
  `);

  const [championshipRows] = await pool.query<ChampionshipRow[]>(`
    SELECT
      source_key AS sourceKey,
      championship_key AS championshipKey,
      COUNT(*) AS laps,
      COUNT(DISTINCT NULLIF(TRIM(steam_guid), '')) AS drivers
    FROM gc_stracker2_lap
    GROUP BY source_key, championship_key
    ORDER BY source_key, championship_key
  `);

  const [recentSessionRows] = await pool.query<RecentSessionRow[]>(`
    SELECT
      session_id AS sessionId,
      type,
      track_display AS trackDisplay,
      start_time AS startTime,
      end_time AS endTime,
      player_count AS playerCount,
      lap_count AS lapCount,
      best_lap_ms AS bestLapMs
    FROM gc_stracker_session
    ORDER BY COALESCE(start_time, imported_at) DESC
    LIMIT 20
  `);

  const [ratingCoverageRows] = await pool.query<RatingCoverageRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM gc_driver_rating) AS ratings,
      (
        SELECT COUNT(*)
        FROM gc_driver_rating
        WHERE steam_guid IS NOT NULL AND TRIM(steam_guid) <> ''
      ) AS ratingsWithSteam,
      (
        SELECT COUNT(*)
        FROM gc_driver_rating
        WHERE steam_guid IS NULL OR TRIM(steam_guid) = ''
      ) AS ratingsWithoutSteam,
      (
        SELECT COUNT(*)
        FROM gc_driver_rating r
        LEFT JOIN gc_driver_profiles p ON p.driver_key = r.driver_key
        WHERE p.id IS NULL
      ) AS ratingsWithoutProfile,
      (
        SELECT COUNT(*)
        FROM gc_driver_profiles p
        LEFT JOIN gc_driver_rating r ON r.driver_key = p.driver_key
        WHERE r.id IS NULL
      ) AS profilesWithoutRating
  `);

  const [teamIntegrityRows] = await pool.query<TeamIntegrityRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM gc_teams) AS teams,
      (SELECT COUNT(*) FROM gc_team_memberships) AS memberships,
      (
        SELECT COUNT(*)
        FROM gc_team_memberships
        WHERE status = 'active'
      ) AS activeMemberships,
      (
        SELECT COUNT(*)
        FROM gc_team_memberships m
        LEFT JOIN gc_teams t ON t.id = m.team_id
        WHERE t.id IS NULL
      ) AS membershipsWithoutTeam,
      (
        SELECT COUNT(*)
        FROM gc_team_memberships m
        LEFT JOIN gc_driver_profiles p ON p.id = m.driver_profile_id
        WHERE p.id IS NULL
      ) AS membershipsWithoutProfile,
      (
        SELECT COUNT(*)
        FROM gc_team_memberships m
        LEFT JOIN gc_users u ON u.id = m.user_id
        WHERE m.user_id IS NOT NULL AND u.id IS NULL
      ) AS membershipsWithoutUser
  `);

  const [userLinkRows] = await pool.query<UserLinkIntegrityRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM gc_users) AS users,
      (
        SELECT COUNT(*)
        FROM gc_users
        WHERE pilot_steam_guid IS NOT NULL AND TRIM(pilot_steam_guid) <> ''
      ) AS usersWithSteam,
      (
        SELECT COUNT(*)
        FROM gc_users
        WHERE pilot_player_id IS NOT NULL
      ) AS usersWithPlayerId,
      (
        SELECT COUNT(DISTINCT linked_user_id)
        FROM gc_driver_profiles
        WHERE linked_user_id IS NOT NULL AND TRIM(linked_user_id) <> ''
      ) AS usersLinkedByProfile,
      (
        SELECT COUNT(*)
        FROM gc_users u
        LEFT JOIN gc_driver_profiles p
          ON p.steam_guid = u.pilot_steam_guid
        WHERE u.pilot_steam_guid IS NOT NULL
          AND TRIM(u.pilot_steam_guid) <> ''
          AND p.id IS NULL
      ) AS usersWithSteamWithoutProfile
  `);

  const [syncRows] = await pool.query<SyncStatusRow[]>(`
    SELECT
      status,
      COUNT(*) AS entries,
      MAX(started_at) AS latestStartedAt,
      MAX(finished_at) AS latestFinishedAt
    FROM gc_stracker_sync_log
    GROUP BY status
    ORDER BY entries DESC
  `);

  const [overlapRows] = await pool.query<OverlapRow[]>(`
    SELECT
      (
        SELECT COUNT(*)
        FROM gc_stracker_lap old_lap
        WHERE EXISTS (
          SELECT 1
          FROM gc_stracker2_lap new_lap
          WHERE new_lap.session_id = old_lap.session_id
            AND new_lap.player_in_session_id = old_lap.player_in_session_id
            AND new_lap.lap_number = old_lap.lap_number
            AND new_lap.lap_time_ms = old_lap.lap_time_ms
        )
      ) AS matchedRows,
      (SELECT COUNT(*) FROM gc_stracker_lap) AS oldLapRows,
      (SELECT COUNT(*) FROM gc_stracker2_lap) AS newLapRows
  `);

  const identityCoverage = identityCoverageRows[0];
  const ratingCoverage = ratingCoverageRows[0];
  const teamIntegrity = teamIntegrityRows[0];
  const userLinks = userLinkRows[0];
  const overlap = overlapRows[0];

  const oldLapRows = num(overlap?.oldLapRows);
  const newLapRows = num(overlap?.newLapRows);
  const matchedRows = num(overlap?.matchedRows);

  return {
    ok: true,
    readOnly: true,
    databaseName: runtimeConfig.database.name,
    generatedAt: new Date().toISOString(),
    identity: {
      coverage: {
        profiles: num(identityCoverage?.profiles),
        profilesWithSteam: num(identityCoverage?.profilesWithSteam),
        profilesWithoutSteam: num(identityCoverage?.profilesWithoutSteam),
        profilesWithPlayerId: num(identityCoverage?.profilesWithPlayerId),
        profilesLinkedToUser: num(identityCoverage?.profilesLinkedToUser),
        uniqueSteamIds: num(identityCoverage?.uniqueSteamIds),
        uniquePlayerIds: num(identityCoverage?.uniquePlayerIds)
      },
      duplicateSteamIds: duplicateSteamRows.map((row) => ({
        steamGuid: row.steamGuid,
        profiles: num(row.profiles),
        driverKeys: row.driverKeys ? row.driverKeys.split('||') : [],
        names: row.names ? row.names.split('||') : []
      })),
      steamIdsWithMultipleNames: steamNameRows.map((row) => ({
        steamGuid: row.steamGuid,
        distinctNames: num(row.distinctNames),
        names: row.names ? row.names.split('||') : [],
        lapRows: num(row.lapRows)
      })),
      profileSample: profileSampleRows.map((row) => ({
        driverKey: row.driverKey,
        playerId: row.playerId,
        steamGuid: row.steamGuid,
        driverName: row.driverName,
        displayName: row.displayName,
        linkedUserId: row.linkedUserId
      }))
    },
    sources: {
      configured: sourceRows.map((row) => ({
        sourceKey: row.sourceKey,
        label: row.label,
        championshipKey: row.championshipKey,
        serverIp: row.serverIp,
        dbSizeBytes: num(row.dbSizeBytes),
        dbModifiedAt: iso(row.dbModifiedAt),
        lastImportStartedAt: iso(row.lastImportStartedAt),
        lastImportFinishedAt: iso(row.lastImportFinishedAt),
        lastImportStatus: row.lastImportStatus,
        lastImportMessage: row.lastImportMessage,
        updatedAt: iso(row.updatedAt)
      })),
      lapCoverage: sourceLapCountRows.map((row) => ({
        sourceKey: row.sourceKey,
        totalLaps: num(row.totalLaps),
        validLaps: num(row.validLaps),
        drivers: num(row.drivers),
        tracks: num(row.tracks),
        cars: num(row.cars),
        newestLapUnix: row.newestLapUnix === null ? null : num(row.newestLapUnix),
        oldestLapUnix: row.oldestLapUnix === null ? null : num(row.oldestLapUnix)
      })),
      championships: championshipRows.map((row) => ({
        sourceKey: row.sourceKey,
        championshipKey: row.championshipKey,
        laps: num(row.laps),
        drivers: num(row.drivers)
      }))
    },
    stracker: {
      oldLapRows,
      newLapRows,
      approximateOverlap: {
        matchedRows,
        coverageOfOldPercent: oldLapRows
          ? Math.round((matchedRows / oldLapRows) * 10000) / 100
          : 0,
        coverageOfNewPercent: newLapRows
          ? Math.round((matchedRows / newLapRows) * 10000) / 100
          : 0,
        note:
          'Coincidencia aproximada por sesión, piloto en sesión, número de vuelta y tiempo. No declara equivalencia definitiva.'
      },
      recentSessions: recentSessionRows.map((row) => ({
        sessionId: row.sessionId,
        type: row.type,
        trackDisplay: row.trackDisplay,
        startTime: iso(row.startTime),
        endTime: iso(row.endTime),
        playerCount: row.playerCount,
        lapCount: row.lapCount,
        bestLapMs: row.bestLapMs
      })),
      syncStatus: syncRows.map((row) => ({
        status: row.status,
        entries: num(row.entries),
        latestStartedAt: iso(row.latestStartedAt),
        latestFinishedAt: iso(row.latestFinishedAt)
      }))
    },
    ratings: {
      ratings: num(ratingCoverage?.ratings),
      ratingsWithSteam: num(ratingCoverage?.ratingsWithSteam),
      ratingsWithoutSteam: num(ratingCoverage?.ratingsWithoutSteam),
      ratingsWithoutProfile: num(ratingCoverage?.ratingsWithoutProfile),
      profilesWithoutRating: num(ratingCoverage?.profilesWithoutRating)
    },
    teams: {
      teams: num(teamIntegrity?.teams),
      memberships: num(teamIntegrity?.memberships),
      activeMemberships: num(teamIntegrity?.activeMemberships),
      membershipsWithoutTeam: num(teamIntegrity?.membershipsWithoutTeam),
      membershipsWithoutProfile: num(teamIntegrity?.membershipsWithoutProfile),
      membershipsWithoutUser: num(teamIntegrity?.membershipsWithoutUser)
    },
    users: {
      users: num(userLinks?.users),
      usersWithSteam: num(userLinks?.usersWithSteam),
      usersWithPlayerId: num(userLinks?.usersWithPlayerId),
      usersLinkedByProfile: num(userLinks?.usersLinkedByProfile),
      usersWithSteamWithoutProfile: num(userLinks?.usersWithSteamWithoutProfile)
    }
  };
}
