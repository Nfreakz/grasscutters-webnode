import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { resolveCanonicalChallenge, type CanonicalChallenge } from '@/server/public/canonical-challenge';

interface SourceRow extends RowDataPacket {
  sourceKey: string;
  label: string;
  championshipKey: string | null;
  serverIp: string | null;
  lastImportFinishedAt: Date | string | null;
  lastImportStatus: string | null;
  totalLaps: number | string;
  validLaps: number | string;
  drivers: number | string;
}

interface LatestComboRow extends RowDataPacket {
  sourceKey: string;
  trackDisplay: string | null;
  carDisplay: string | null;
  newestLapUnix: number | string | null;
}

interface HotlapRow extends RowDataPacket {
  sourceKey: string;
  profileId: string | null;
  displayName: string;
  driverName: string;
  trackDisplay: string | null;
  carDisplay: string | null;
  lapTimeMs: number | string;
  maxSpeedKmh: number | string | null;
  timestampUnix: number | string | null;
}

interface RatingRow extends RowDataPacket {
  profileId: string | null;
  displayName: string;
  srScore: number | string;
  srClass: string;
  gsrRating: number | string;
  gsrClass: string;
  racesCount: number | string;
  wins: number | string;
  podiums: number | string;
}

interface TeamRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  activeDrivers: number | string;
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

export interface PublicHomeData {
  ok: true;
  generatedAt: string;
  dataSource: 'mysql';
  sources: Array<{
    key: string;
    label: string;
    championshipKey: string | null;
    serverIp: string | null;
    lastImportFinishedAt: string | null;
    lastImportStatus: string | null;
    totalLaps: number;
    validLaps: number;
    drivers: number;
    latestCombo: {
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
  }>;
  hotlaps: Array<{
    sourceKey: string;
    profileId: string | null;
    displayName: string;
    driverName: string;
    track: string | null;
    car: string | null;
    lapTimeMs: number;
    maxSpeedKmh: number | null;
    recordedAt: string | null;
  }>;
  ratings: Array<{
    profileId: string | null;
    displayName: string;
    srScore: number;
    srClass: string;
    gsrRating: number;
    gsrClass: string;
    races: number;
    wins: number;
    podiums: number;
  }>;
  teams: Array<{
    id: string;
    slug: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    activeDrivers: number;
  }>;
}

export async function getPublicHomeData(): Promise<PublicHomeData> {
  const pool = getDatabasePool();

  const [sourceRows] = await pool.query<SourceRow[]>(`
    SELECT
      s.source_key AS sourceKey,
      s.label,
      s.championship_key AS championshipKey,
      s.server_ip AS serverIp,
      s.last_import_finished_at AS lastImportFinishedAt,
      s.last_import_status AS lastImportStatus,
      COUNT(l.lap_uid) AS totalLaps,
      COALESCE(SUM(l.valid = 1), 0) AS validLaps,
      COUNT(DISTINCT NULLIF(TRIM(l.steam_guid), '')) AS drivers
    FROM gc_stracker2_source s
    LEFT JOIN gc_stracker2_lap l
      ON l.source_key = s.source_key
    GROUP BY
      s.source_key,
      s.label,
      s.championship_key,
      s.server_ip,
      s.last_import_finished_at,
      s.last_import_status
    ORDER BY s.source_key
  `);

  const canonicalChallengeBySource = new Map<string, CanonicalChallenge>();
  for (const source of sourceRows) {
    if (source.sourceKey !== 'main' && source.sourceKey !== 'gt4') continue;
    const challenge = await resolveCanonicalChallenge(pool, source.sourceKey);
    if (challenge) canonicalChallengeBySource.set(source.sourceKey, challenge);
  }

  const hotlaps: PublicHomeData['hotlaps'] = [];

  for (const source of sourceRows) {
    const combo = canonicalChallengeBySource.get(source.sourceKey);
    if (!combo?.track || !combo?.officialCar) continue;

    const [hotlapRows] = await pool.query<HotlapRow[]>(`
      WITH ranked AS (
        SELECT
          l.source_key AS sourceKey,
          p.id AS profileId,
          COALESCE(
            NULLIF(p.display_name, ''),
            NULLIF(p.driver_name, ''),
            NULLIF(l.driver_name, ''),
            'Piloto'
          ) AS displayName,
          COALESCE(NULLIF(l.driver_name, ''), 'Piloto') AS driverName,
          l.track_display AS trackDisplay,
          l.car_display AS carDisplay,
          l.lap_time_ms AS lapTimeMs,
          l.max_speed_kmh AS maxSpeedKmh,
          l.timestamp_unix AS timestampUnix,
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
        sourceKey,
        profileId,
        displayName,
        driverName,
        trackDisplay,
        carDisplay,
        lapTimeMs,
        maxSpeedKmh,
        timestampUnix
      FROM ranked
      WHERE driverRank = 1
      ORDER BY lapTimeMs ASC
      LIMIT 10
    `, [source.sourceKey, combo.track, combo.officialCar, combo.startedAt ? Math.floor(new Date(combo.startedAt).getTime() / 1000) : 0]);

    hotlaps.push(...hotlapRows.map((row) => ({
      sourceKey: row.sourceKey,
      profileId: row.profileId,
      displayName: row.displayName,
      driverName: row.driverName,
      track: row.trackDisplay,
      car: row.carDisplay,
      lapTimeMs: num(row.lapTimeMs),
      maxSpeedKmh:
        row.maxSpeedKmh === null ? null : num(row.maxSpeedKmh),
      recordedAt: unixIso(row.timestampUnix)
    })));
  }

  const [ratingRows] = await pool.query<RatingRow[]>(`
    SELECT
      p.id AS profileId,
      COALESCE(
        NULLIF(p.display_name, ''),
        NULLIF(r.display_name, ''),
        'Piloto'
      ) AS displayName,
      r.sr_score AS srScore,
      r.sr_class AS srClass,
      r.gsr_rating AS gsrRating,
      r.gsr_class AS gsrClass,
      r.races_count AS racesCount,
      r.wins,
      r.podiums
    FROM gc_driver_rating r
    LEFT JOIN gc_driver_profiles p
      ON p.driver_key = r.driver_key
    ORDER BY r.gsr_rating DESC, r.sr_score DESC
    LIMIT 10
  `);

  const [teamRows] = await pool.query<TeamRow[]>(`
    SELECT
      t.id,
      t.slug,
      t.name,
      t.short_name AS shortName,
      t.logo_url AS logoUrl,
      COUNT(
        CASE
          WHEN m.status = 'active' THEN 1
          ELSE NULL
        END
      ) AS activeDrivers
    FROM gc_teams t
    LEFT JOIN gc_team_memberships m
      ON m.team_id = t.id
    WHERE t.status = 'active'
    GROUP BY
      t.id,
      t.slug,
      t.name,
      t.short_name,
      t.logo_url
    ORDER BY t.name
  `);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dataSource: 'mysql',
    sources: sourceRows.map((row) => {
      const combo = canonicalChallengeBySource.get(row.sourceKey);

      return {
        key: row.sourceKey,
        label: row.label,
        championshipKey: row.championshipKey,
        serverIp: row.serverIp,
        lastImportFinishedAt: iso(row.lastImportFinishedAt),
        lastImportStatus: row.lastImportStatus,
        totalLaps: num(row.totalLaps),
        validLaps: num(row.validLaps),
        drivers: num(row.drivers),
        latestCombo: combo
          ? {
              track: combo.track,
              car: combo.officialCar,
              newestLapAt: combo.newestLapAt,
              startedAt: combo.startedAt,
              validLaps: combo.validLaps,
              totalLaps: combo.totalLaps,
              drivers: combo.drivers,
              transientCars: combo.transientCars,
              groupingRule: combo.groupingRule
            }
          : null
      };
    }),
    hotlaps,
    ratings: ratingRows.map((row) => ({
      profileId: row.profileId,
      displayName: row.displayName,
      srScore: num(row.srScore),
      srClass: row.srClass,
      gsrRating: num(row.gsrRating),
      gsrClass: row.gsrClass,
      races: num(row.racesCount),
      wins: num(row.wins),
      podiums: num(row.podiums)
    })),
    teams: teamRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      logoUrl: row.logoUrl,
      activeDrivers: num(row.activeDrivers)
    }))
  };
}
