import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';

interface RatingRow extends RowDataPacket {
  profileId: string | null;
  displayName: string;
  srScore: number | string;
  srClass: string;
  gsrRating: number | string;
  gsrClass: string;
  races: number | string;
  cleanRaces: number | string;
  wins: number | string;
  podiums: number | string;
  incidentPoints: number | string;
  lastDeltaSr: number | string;
  lastDeltaGsr: number | string;
  lastRaceAt: Date | string | null;
}

interface EventRow extends RowDataPacket {
  eventName: string;
  eventDate: Date | string | null;
  displayName: string;
  oldSr: number | string;
  newSr: number | string;
  deltaSr: number | string;
  oldGsr: number | string;
  newGsr: number | string;
  deltaGsr: number | string;
  position: number;
  cleanRace: number | string;
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

export interface PublicRatingsData {
  ok: true;
  generatedAt: string;
  summary: {
    ratedDrivers: number;
    averageSr: number;
    cleanRaceRate: number;
    totalRaces: number;
  };
  leaderboard: Array<{
    position: number;
    profileId: string | null;
    displayName: string;
    srScore: number;
    srClass: string;
    gsrRating: number;
    gsrClass: string;
    races: number;
    cleanRaces: number;
    wins: number;
    podiums: number;
    incidentPoints: number;
    lastDeltaSr: number;
    lastDeltaGsr: number;
    lastRaceAt: string | null;
  }>;
  recentChanges: Array<{
    eventName: string;
    eventDate: string | null;
    displayName: string;
    oldSr: number;
    newSr: number;
    deltaSr: number;
    oldGsr: number;
    newGsr: number;
    deltaGsr: number;
    position: number;
    cleanRace: boolean;
  }>;
}

export async function getPublicRatingsData(): Promise<PublicRatingsData> {
  const pool = getDatabasePool();

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
      r.races_count AS races,
      r.clean_races AS cleanRaces,
      r.wins,
      r.podiums,
      r.incident_points_total AS incidentPoints,
      r.last_delta_sr AS lastDeltaSr,
      r.last_delta_gsr AS lastDeltaGsr,
      r.last_race_at AS lastRaceAt
    FROM gc_driver_rating r
    LEFT JOIN gc_driver_profiles p
      ON p.driver_key = r.driver_key
    ORDER BY r.gsr_rating DESC, r.sr_score DESC
  `);

  const [eventRows] = await pool.query<EventRow[]>(`
    SELECT
      event_name AS eventName,
      event_date AS eventDate,
      display_name AS displayName,
      old_sr AS oldSr,
      new_sr AS newSr,
      delta_sr AS deltaSr,
      old_gsr AS oldGsr,
      new_gsr AS newGsr,
      delta_gsr AS deltaGsr,
      position,
      clean_race AS cleanRace
    FROM gc_rating_event_result
    ORDER BY COALESCE(event_date, processed_at) DESC, position ASC
    LIMIT 20
  `);

  const totalRaces = ratingRows.reduce((sum, row) => sum + num(row.races), 0);
  const totalCleanRaces = ratingRows.reduce(
    (sum, row) => sum + num(row.cleanRaces),
    0
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      ratedDrivers: ratingRows.length,
      averageSr: ratingRows.length
        ? Math.round(
            ratingRows.reduce((sum, row) => sum + num(row.srScore), 0) /
              ratingRows.length *
              100
          ) / 100
        : 0,
      cleanRaceRate: totalRaces
        ? Math.round((totalCleanRaces / totalRaces) * 10000) / 100
        : 0,
      totalRaces
    },
    leaderboard: ratingRows.map((row, index) => ({
      position: index + 1,
      profileId: row.profileId,
      displayName: row.displayName,
      srScore: num(row.srScore),
      srClass: row.srClass,
      gsrRating: num(row.gsrRating),
      gsrClass: row.gsrClass,
      races: num(row.races),
      cleanRaces: num(row.cleanRaces),
      wins: num(row.wins),
      podiums: num(row.podiums),
      incidentPoints: num(row.incidentPoints),
      lastDeltaSr: num(row.lastDeltaSr),
      lastDeltaGsr: num(row.lastDeltaGsr),
      lastRaceAt: iso(row.lastRaceAt)
    })),
    recentChanges: eventRows.map((row) => ({
      eventName: row.eventName,
      eventDate: iso(row.eventDate),
      displayName: row.displayName,
      oldSr: num(row.oldSr),
      newSr: num(row.newSr),
      deltaSr: num(row.deltaSr),
      oldGsr: num(row.oldGsr),
      newGsr: num(row.newGsr),
      deltaGsr: num(row.deltaGsr),
      position: row.position,
      cleanRace: num(row.cleanRace) === 1
    }))
  };
}
