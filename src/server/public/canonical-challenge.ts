import type { Pool, RowDataPacket } from 'mysql2/promise';

export type CanonicalSourceKey = 'main' | 'gt4';

interface LatestTrackRow extends RowDataPacket {
  track: string | null;
  newestLapUnix: number | string | null;
}

interface CarActivityRow extends RowDataPacket {
  car: string | null;
  validLaps: number | string;
  totalLaps: number | string;
  drivers: number | string;
  newestLapUnix: number | string | null;
}

interface ActivityDayRow extends RowDataPacket {
  dayBucket: number | string;
}

interface ChallengeSummaryRow extends RowDataPacket {
  totalLaps: number | string;
  validLaps: number | string;
  drivers: number | string;
  newestLapUnix: number | string | null;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unixIso(value: number | string | null | undefined): string | null {
  const timestamp = num(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export interface CanonicalChallenge {
  sourceKey: CanonicalSourceKey;
  track: string;
  officialCar: string;
  startedAt: string | null;
  newestLapAt: string | null;
  totalLaps: number;
  validLaps: number;
  drivers: number;
  activityGapDays: number;
  transientCars: Array<{
    car: string;
    validLaps: number;
    totalLaps: number;
    drivers: number;
  }>;
  groupingRule: string;
}

/**
 * Resolves the current competitive challenge without treating every technical
 * server restart or temporary car addition as a new leaderboard.
 *
 * Rules:
 * - source and track are always isolated;
 * - the official car is the dominant valid-lap car in the latest 48 h;
 * - the challenge remains open while the same source/track/car has no gap
 *   longer than 14 days;
 * - other cars on the same track are reported as transient and excluded from
 *   the official leaderboard.
 */
export async function resolveCanonicalChallenge(
  pool: Pool,
  sourceKey: CanonicalSourceKey
): Promise<CanonicalChallenge | null> {
  const [latestRows] = await pool.query<LatestTrackRow[]>(`
    SELECT
      track_display AS track,
      MAX(timestamp_unix) AS newestLapUnix
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND timestamp_unix IS NOT NULL
      AND track_display IS NOT NULL
      AND TRIM(track_display) <> ''
    GROUP BY track_display
    ORDER BY newestLapUnix DESC
    LIMIT 1
  `, [sourceKey]);

  const latest = latestRows[0];
  const newestLapUnix = num(latest?.newestLapUnix);
  const track = latest?.track?.trim();
  if (!track || newestLapUnix <= 0) return null;

  const recentStartUnix = newestLapUnix - (48 * 60 * 60);
  const [recentCars] = await pool.query<CarActivityRow[]>(`
    SELECT
      car_display AS car,
      COALESCE(SUM(valid = 1), 0) AS validLaps,
      COUNT(*) AS totalLaps,
      COUNT(DISTINCT COALESCE(
        NULLIF(TRIM(steam_guid), ''),
        CONCAT('name:', LOWER(TRIM(driver_name)))
      )) AS drivers,
      MAX(timestamp_unix) AS newestLapUnix
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND track_display = ?
      AND timestamp_unix BETWEEN ? AND ?
      AND car_display IS NOT NULL
      AND TRIM(car_display) <> ''
    GROUP BY car_display
    ORDER BY validLaps DESC, totalLaps DESC, newestLapUnix DESC
  `, [sourceKey, track, recentStartUnix, newestLapUnix]);

  let carRows = recentCars;
  if (carRows.length === 0) {
    const [fallbackCars] = await pool.query<CarActivityRow[]>(`
      SELECT
        car_display AS car,
        COALESCE(SUM(valid = 1), 0) AS validLaps,
        COUNT(*) AS totalLaps,
        COUNT(DISTINCT COALESCE(
          NULLIF(TRIM(steam_guid), ''),
          CONCAT('name:', LOWER(TRIM(driver_name)))
        )) AS drivers,
        MAX(timestamp_unix) AS newestLapUnix
      FROM gc_stracker2_lap
      WHERE source_key = ?
        AND track_display = ?
        AND timestamp_unix IS NOT NULL
        AND car_display IS NOT NULL
        AND TRIM(car_display) <> ''
      GROUP BY car_display
      ORDER BY newestLapUnix DESC, validLaps DESC
      LIMIT 20
    `, [sourceKey, track]);
    carRows = fallbackCars;
  }

  const officialCar = carRows[0]?.car?.trim();
  if (!officialCar) return null;

  const activityGapDays = 14;
  const [dayRows] = await pool.query<ActivityDayRow[]>(`
    SELECT DISTINCT FLOOR(timestamp_unix / 86400) AS dayBucket
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND track_display = ?
      AND car_display = ?
      AND timestamp_unix IS NOT NULL
    ORDER BY dayBucket DESC
  `, [sourceKey, track, officialCar]);

  const days = dayRows.map((row) => num(row.dayBucket)).filter((day) => day > 0);
  let oldestDay = days[0] ?? Math.floor(newestLapUnix / 86400);
  for (let index = 1; index < days.length; index += 1) {
    const newerDay = days[index - 1];
    const olderDay = days[index];
    if (newerDay - olderDay > activityGapDays) break;
    oldestDay = olderDay;
  }
  const startedUnix = oldestDay * 86400;

  const [summaryRows] = await pool.query<ChallengeSummaryRow[]>(`
    SELECT
      COUNT(*) AS totalLaps,
      COALESCE(SUM(valid = 1), 0) AS validLaps,
      COUNT(DISTINCT COALESCE(
        NULLIF(TRIM(steam_guid), ''),
        CONCAT('name:', LOWER(TRIM(driver_name)))
      )) AS drivers,
      MAX(timestamp_unix) AS newestLapUnix
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND track_display = ?
      AND car_display = ?
      AND timestamp_unix >= ?
  `, [sourceKey, track, officialCar, startedUnix]);

  const transientCars = carRows
    .filter((row) => row.car?.trim() && row.car.trim() !== officialCar)
    .map((row) => ({
      car: row.car!.trim(),
      validLaps: num(row.validLaps),
      totalLaps: num(row.totalLaps),
      drivers: num(row.drivers)
    }));

  const summary = summaryRows[0];
  return {
    sourceKey,
    track,
    officialCar,
    startedAt: unixIso(startedUnix),
    newestLapAt: unixIso(summary?.newestLapUnix ?? newestLapUnix),
    totalLaps: num(summary?.totalLaps),
    validLaps: num(summary?.validLaps),
    drivers: num(summary?.drivers),
    activityGapDays,
    transientCars,
    groupingRule: 'Misma fuente, circuito, coche oficial y periodo continuo sin más de 14 días de inactividad.'
  };
}

export async function resolveChallengeStartUnix(
  pool: Pool,
  input: { sourceKey: CanonicalSourceKey; track: string; car: string; activityGapDays?: number }
): Promise<number> {
  const activityGapDays = input.activityGapDays ?? 14;
  const [dayRows] = await pool.query<ActivityDayRow[]>(`
    SELECT DISTINCT FLOOR(timestamp_unix / 86400) AS dayBucket
    FROM gc_stracker2_lap
    WHERE source_key = ?
      AND track_display = ?
      AND car_display = ?
      AND timestamp_unix IS NOT NULL
    ORDER BY dayBucket DESC
  `, [input.sourceKey, input.track, input.car]);

  const days = dayRows.map((row) => num(row.dayBucket)).filter((day) => day > 0);
  if (days.length === 0) return 0;
  let oldestDay = days[0];
  for (let index = 1; index < days.length; index += 1) {
    if (days[index - 1] - days[index] > activityGapDays) break;
    oldestDay = days[index];
  }
  return oldestDay * 86400;
}
