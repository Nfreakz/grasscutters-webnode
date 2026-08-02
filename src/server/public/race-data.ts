import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { resolveCanonicalChallenge } from '@/server/public/canonical-challenge';

export type PublicSourceKey = 'main' | 'gt4';

interface SourceSummaryRow extends RowDataPacket {
  sourceKey: PublicSourceKey;
  label: string;
  championshipKey: string | null;
  serverIp: string | null;
  lastImportFinishedAt: Date | string | null;
  lastImportStatus: string | null;
  totalLaps: number | string;
  validLaps: number | string;
  drivers: number | string;
  tracks: number | string;
  cars: number | string;
}

interface LatestComboRow extends RowDataPacket {
  track: string | null;
  car: string | null;
  newestLapUnix: number | string | null;
}

interface HotlapRow extends RowDataPacket {
  profileId: string | null;
  displayName: string;
  driverName: string;
  car: string | null;
  lapTimeMs: number | string;
  maxSpeedKmh: number | string | null;
  sector1Ms: number | string | null;
  sector2Ms: number | string | null;
  sector3Ms: number | string | null;
  recordedUnix: number | string | null;
}

interface SessionRow extends RowDataPacket {
  sessionId: number;
  type: string;
  track: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  playerCount: number;
  lapCount: number;
}

interface IncidentSummaryRow extends RowDataPacket {
  type: string;
  incidents: number | string;
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

function unixIso(value: number | string | null | undefined): string | null {
  const timestamp = num(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export interface PublicRaceData {
  ok: true;
  generatedAt: string;
  source: {
    key: PublicSourceKey;
    label: string;
    championshipKey: string | null;
    serverIp: string | null;
    lastImportFinishedAt: string | null;
    lastImportStatus: string | null;
    totalLaps: number;
    validLaps: number;
    drivers: number;
    tracks: number;
    cars: number;
  };
  currentCombo: {
    track: string | null;
    car: string | null;
    newestLapAt: string | null;
    startedAt: string | null;
    validLaps: number;
    totalLaps: number;
    drivers: number;
    transientCars: Array<{ car: string; validLaps: number; totalLaps: number; drivers: number }>;
    groupingRule: string;
  } | null;
  hotlaps: Array<{
    position: number;
    profileId: string | null;
    displayName: string;
    driverName: string;
    car: string | null;
    lapTimeMs: number;
    maxSpeedKmh: number | null;
    sectors: [number | null, number | null, number | null];
    recordedAt: string | null;
  }>;
  recentSessions: Array<{
    sessionId: number;
    type: string;
    track: string | null;
    startTime: string | null;
    endTime: string | null;
    playerCount: number;
    lapCount: number;
  }>;
  incidentSummary: Array<{
    type: string;
    incidents: number;
  }>;
  limitations: string[];
}

export async function getPublicRaceData(
  requestedSource: string | null | undefined
): Promise<PublicRaceData> {
  const sourceKey: PublicSourceKey =
    requestedSource === 'gt4' ? 'gt4' : 'main';

  const pool = getDatabasePool();

  const [sourceRows] = await pool.query<SourceSummaryRow[]>(`
    SELECT
      s.source_key AS sourceKey,
      s.label,
      s.championship_key AS championshipKey,
      s.server_ip AS serverIp,
      s.last_import_finished_at AS lastImportFinishedAt,
      s.last_import_status AS lastImportStatus,
      COUNT(l.lap_uid) AS totalLaps,
      COALESCE(SUM(l.valid = 1), 0) AS validLaps,
      COUNT(DISTINCT NULLIF(TRIM(l.steam_guid), '')) AS drivers,
      COUNT(DISTINCT NULLIF(TRIM(l.track_display), '')) AS tracks,
      COUNT(DISTINCT NULLIF(TRIM(l.car_display), '')) AS cars
    FROM gc_stracker2_source s
    LEFT JOIN gc_stracker2_lap l
      ON l.source_key = s.source_key
    WHERE s.source_key = ?
    GROUP BY
      s.source_key,
      s.label,
      s.championship_key,
      s.server_ip,
      s.last_import_finished_at,
      s.last_import_status
    LIMIT 1
  `, [sourceKey]);

  const source = sourceRows[0];
  if (!source) {
    throw new Error('SOURCE_NOT_FOUND');
  }

  const canonicalChallenge = await resolveCanonicalChallenge(pool, sourceKey);
  const combo = canonicalChallenge
    ? {
        track: canonicalChallenge.track,
        car: canonicalChallenge.officialCar,
        newestLapUnix: canonicalChallenge.newestLapAt
          ? Math.floor(new Date(canonicalChallenge.newestLapAt).getTime() / 1000)
          : null
      }
    : null;

  let hotlaps: PublicRaceData['hotlaps'] = [];

  if (combo?.track && combo?.car) {
    const [hotlapRows] = await pool.query<HotlapRow[]>(`
      WITH ranked AS (
        SELECT
          p.id AS profileId,
          COALESCE(
            NULLIF(p.display_name, ''),
            NULLIF(p.driver_name, ''),
            NULLIF(l.driver_name, ''),
            'Piloto'
          ) AS displayName,
          COALESCE(NULLIF(l.driver_name, ''), 'Piloto') AS driverName,
          l.car_display AS car,
          l.lap_time_ms AS lapTimeMs,
          l.max_speed_kmh AS maxSpeedKmh,
          l.sector_time_0 AS sector1Ms,
          l.sector_time_1 AS sector2Ms,
          l.sector_time_2 AS sector3Ms,
          l.timestamp_unix AS recordedUnix,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(
              NULLIF(TRIM(l.steam_guid), ''),
              CONCAT('name:', LOWER(TRIM(l.driver_name)))
            )
            ORDER BY l.lap_time_ms ASC, l.timestamp_unix DESC
          ) AS driverRank
        FROM gc_stracker2_lap l
        LEFT JOIN gc_driver_profiles p
          ON p.steam_guid = l.steam_guid
        WHERE l.source_key = ?
          AND l.track_display = ?
          AND l.car_display = ?
          AND l.timestamp_unix >= ?
          AND l.valid = 1
          AND l.lap_time_ms > 0
      )
      SELECT
        profileId,
        displayName,
        driverName,
        car,
        lapTimeMs,
        maxSpeedKmh,
        sector1Ms,
        sector2Ms,
        sector3Ms,
        recordedUnix
      FROM ranked
      WHERE driverRank = 1
      ORDER BY lapTimeMs ASC
      LIMIT 50
    `, [sourceKey, combo.track, combo.car, canonicalChallenge?.startedAt ? Math.floor(new Date(canonicalChallenge.startedAt).getTime() / 1000) : 0]);

    hotlaps = hotlapRows.map((row, index) => ({
      position: index + 1,
      profileId: row.profileId,
      displayName: row.displayName,
      driverName: row.driverName,
      car: row.car,
      lapTimeMs: num(row.lapTimeMs),
      maxSpeedKmh:
        row.maxSpeedKmh === null ? null : num(row.maxSpeedKmh),
      sectors: [
        row.sector1Ms === null ? null : num(row.sector1Ms),
        row.sector2Ms === null ? null : num(row.sector2Ms),
        row.sector3Ms === null ? null : num(row.sector3Ms)
      ],
      recordedAt: unixIso(row.recordedUnix)
    }));
  }

  let recentSessions: PublicRaceData['recentSessions'] = [];
  let incidentSummary: PublicRaceData['incidentSummary'] = [];
  const limitations: string[] = [];

  if (sourceKey === 'main') {
    const [sessionRows] = await pool.query<SessionRow[]>(`
      SELECT
        session_id AS sessionId,
        type,
        track_display AS track,
        start_time AS startTime,
        end_time AS endTime,
        player_count AS playerCount,
        lap_count AS lapCount
      FROM gc_stracker_session
      ORDER BY COALESCE(start_time, imported_at) DESC
      LIMIT 10
    `);

    recentSessions = sessionRows.map((row) => ({
      sessionId: row.sessionId,
      type: row.type,
      track: row.track,
      startTime: iso(row.startTime),
      endTime: iso(row.endTime),
      playerCount: row.playerCount,
      lapCount: row.lapCount
    }));

    const [incidentRows] = await pool.query<IncidentSummaryRow[]>(`
      SELECT
        type,
        COUNT(*) AS incidents
      FROM gc_stracker_incident
      GROUP BY type
      ORDER BY incidents DESC
      LIMIT 8
    `);

    incidentSummary = incidentRows.map((row) => ({
      type: row.type,
      incidents: num(row.incidents)
    }));
  } else {
    limitations.push(
      'La fuente GT4 todavía no dispone de sesiones e incidentes normalizados en MySQL.'
    );
  }

  limitations.push(
    'La clasificación consolida reinicios y sesiones del mismo reto; solo cuenta el coche oficial dominante del periodo activo.'
  );
  limitations.push(
    'Los datos representan la última importación sTracker; no son telemetría en vivo.'
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: {
      key: source.sourceKey,
      label: source.label,
      championshipKey: source.championshipKey,
      serverIp: source.serverIp,
      lastImportFinishedAt: iso(source.lastImportFinishedAt),
      lastImportStatus: source.lastImportStatus,
      totalLaps: num(source.totalLaps),
      validLaps: num(source.validLaps),
      drivers: num(source.drivers),
      tracks: num(source.tracks),
      cars: num(source.cars)
    },
    currentCombo: canonicalChallenge
      ? {
          track: canonicalChallenge.track,
          car: canonicalChallenge.officialCar,
          newestLapAt: canonicalChallenge.newestLapAt,
          startedAt: canonicalChallenge.startedAt,
          validLaps: canonicalChallenge.validLaps,
          totalLaps: canonicalChallenge.totalLaps,
          drivers: canonicalChallenge.drivers,
          transientCars: canonicalChallenge.transientCars,
          groupingRule: canonicalChallenge.groupingRule
        }
      : null,
    hotlaps,
    recentSessions,
    incidentSummary,
    limitations
  };
}
