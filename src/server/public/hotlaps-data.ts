import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';
import { resolveCanonicalChallenge, resolveChallengeStartUnix } from '@/server/public/canonical-challenge';

export type HotlapSourceKey = 'main' | 'gt4';

interface OptionRow extends RowDataPacket {
  value: string;
  laps: number | string;
}

interface LatestRow extends RowDataPacket {
  track: string | null;
  car: string | null;
}

interface HotlapRow extends RowDataPacket {
  profileId: string | null;
  displayName: string;
  driverName: string;
  lapTimeMs: number | string;
  maxSpeedKmh: number | string | null;
  sector1Ms: number | string | null;
  sector2Ms: number | string | null;
  sector3Ms: number | string | null;
  recordedUnix: number | string | null;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unixIso(value: number | string | null | undefined): string | null {
  const timestamp = num(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export interface PublicHotlapsData {
  ok: true;
  generatedAt: string;
  sourceKey: HotlapSourceKey;
  selectedTrack: string | null;
  selectedCar: string | null;
  tracks: Array<{ value: string; laps: number }>;
  cars: Array<{ value: string; laps: number }>;
  rows: Array<{
    position: number;
    profileId: string | null;
    displayName: string;
    driverName: string;
    lapTimeMs: number;
    maxSpeedKmh: number | null;
    sectors: [number | null, number | null, number | null];
    recordedAt: string | null;
  }>;
}

export async function getPublicHotlapsData(input: {
  source?: string | null;
  track?: string | null;
  car?: string | null;
}): Promise<PublicHotlapsData> {
  const sourceKey: HotlapSourceKey = input.source === 'gt4' ? 'gt4' : 'main';
  const pool = getDatabasePool();
  const canonicalChallenge = await resolveCanonicalChallenge(pool, sourceKey);

  const [trackRows] = await pool.query<OptionRow[]>(`
    SELECT track_display AS value, COUNT(*) AS laps
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND track_display IS NOT NULL
      AND TRIM(track_display) <> ''
    GROUP BY track_display
    ORDER BY MAX(timestamp_unix) DESC, track_display
  `, [sourceKey]);

  const requestedTrack = input.track?.trim() || null;
  const allowedTracks = new Set(trackRows.map((row) => row.value));

  const [latestRows] = await pool.query<LatestRow[]>(`
    SELECT track_display AS track, car_display AS car
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND timestamp_unix IS NOT NULL
    ORDER BY timestamp_unix DESC
    LIMIT 1
  `, [sourceKey]);

  const latest = latestRows[0] ?? null;
  const selectedTrack =
    requestedTrack && allowedTracks.has(requestedTrack)
      ? requestedTrack
      : canonicalChallenge?.track ?? latest?.track ?? trackRows[0]?.value ?? null;

  let cars: OptionRow[] = [];

  if (selectedTrack) {
    const [carRows] = await pool.query<OptionRow[]>(`
      SELECT car_display AS value, COUNT(*) AS laps
      FROM gc_stracker2_lap
      WHERE source_key = ?
        AND track_display = ?
        AND car_display IS NOT NULL
        AND TRIM(car_display) <> ''
      GROUP BY car_display
      ORDER BY MAX(timestamp_unix) DESC, car_display
    `, [sourceKey, selectedTrack]);
    cars = carRows;
  }

  const requestedCar = input.car?.trim() || null;
  const allowedCars = new Set(cars.map((row) => row.value));
  const selectedCar =
    requestedCar && allowedCars.has(requestedCar)
      ? requestedCar
      : selectedTrack === canonicalChallenge?.track && canonicalChallenge?.officialCar && allowedCars.has(canonicalChallenge.officialCar)
        ? canonicalChallenge.officialCar
        : selectedTrack === latest?.track && latest?.car && allowedCars.has(latest.car)
          ? latest.car
          : cars[0]?.value ?? null;

  let rows: PublicHotlapsData['rows'] = [];

  if (selectedTrack && selectedCar) {
    const challengeStartUnix = await resolveChallengeStartUnix(pool, { sourceKey, track: selectedTrack, car: selectedCar });
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
        lapTimeMs,
        maxSpeedKmh,
        sector1Ms,
        sector2Ms,
        sector3Ms,
        recordedUnix
      FROM ranked
      WHERE driverRank = 1
      ORDER BY lapTimeMs ASC
      LIMIT 100
    `, [sourceKey, selectedTrack, selectedCar, challengeStartUnix]);

    rows = hotlapRows.map((row, index) => ({
      position: index + 1,
      profileId: row.profileId,
      displayName: row.displayName,
      driverName: row.driverName,
      lapTimeMs: num(row.lapTimeMs),
      maxSpeedKmh: row.maxSpeedKmh === null ? null : num(row.maxSpeedKmh),
      sectors: [
        row.sector1Ms === null ? null : num(row.sector1Ms),
        row.sector2Ms === null ? null : num(row.sector2Ms),
        row.sector3Ms === null ? null : num(row.sector3Ms)
      ],
      recordedAt: unixIso(row.recordedUnix)
    }));
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceKey,
    selectedTrack,
    selectedCar,
    tracks: trackRows.map((row) => ({ value: row.value, laps: num(row.laps) })),
    cars: cars.map((row) => ({ value: row.value, laps: num(row.laps) })),
    rows
  };
}
