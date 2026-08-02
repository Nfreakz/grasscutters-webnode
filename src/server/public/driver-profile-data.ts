import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';

interface ProfileRow extends RowDataPacket {
  profileId: string;
  driverKey: string;
  steamGuid: string | null;
  displayName: string;
  sourceName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  linkedUser: number | string;
  srScore: number | string | null;
  srClass: string | null;
  gsrRating: number | string | null;
  gsrClass: string | null;
  races: number | string | null;
  cleanRaces: number | string | null;
  wins: number | string | null;
  podiums: number | string | null;
  incidentPoints: number | string | null;
  lastDeltaSr: number | string | null;
  lastDeltaGsr: number | string | null;
  lastRaceAt: Date | string | null;
  teamId: string | null;
  teamName: string | null;
  teamShortName: string | null;
  teamRole: string | null;
}

interface LapSummaryRow extends RowDataPacket {
  totalLaps: number | string;
  validLaps: number | string;
  tracks: number | string;
  cars: number | string;
  sources: number | string;
  lastLapUnix: number | string | null;
}

interface PersonalBestRow extends RowDataPacket {
  sourceKey: 'main' | 'gt4';
  track: string;
  car: string;
  lapTimeMs: number | string;
  maxSpeedKmh: number | string | null;
  sector1Ms: number | string | null;
  sector2Ms: number | string | null;
  sector3Ms: number | string | null;
  recordedUnix: number | string | null;
}

interface EventRow extends RowDataPacket {
  eventName: string;
  eventDate: Date | string | null;
  oldSr: number | string;
  newSr: number | string;
  deltaSr: number | string;
  oldGsr: number | string;
  newGsr: number | string;
  deltaGsr: number | string;
  position: number | string;
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

function unixIso(value: number | string | null | undefined): string | null {
  const timestamp = num(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export interface PublicDriverProfileData {
  ok: true;
  generatedAt: string;
  profile: {
    profileId: string;
    displayName: string;
    sourceName: string;
    avatarUrl: string | null;
    countryCode: string | null;
    linkedUser: boolean;
    rating: {
      srScore: number | null;
      srClass: string | null;
      dsRating: number | null;
      dsClass: string | null;
      races: number;
      cleanRaces: number;
      wins: number;
      podiums: number;
      incidentPoints: number;
      lastDeltaSr: number;
      lastDeltaDs: number;
      lastRaceAt: string | null;
    };
    team: {
      id: string;
      name: string;
      shortName: string | null;
      role: string | null;
    } | null;
    activity: {
      totalLaps: number;
      validLaps: number;
      tracks: number;
      cars: number;
      sources: number;
      lastLapAt: string | null;
    };
    personalBests: Array<{
      sourceKey: 'main' | 'gt4';
      track: string;
      car: string;
      lapTimeMs: number;
      maxSpeedKmh: number | null;
      sectors: [number | null, number | null, number | null];
      recordedAt: string | null;
    }>;
    recentRatingChanges: Array<{
      eventName: string;
      eventDate: string | null;
      oldSr: number;
      newSr: number;
      deltaSr: number;
      oldDs: number;
      newDs: number;
      deltaDs: number;
      position: number;
      cleanRace: boolean;
    }>;
  };
}

export async function getPublicDriverProfileData(
  profileId: string
): Promise<PublicDriverProfileData | null> {
  const pool = getDatabasePool();

  const [profileRows] = await pool.query<ProfileRow[]>(`
    SELECT
      p.id AS profileId,
      p.driver_key AS driverKey,
      p.steam_guid AS steamGuid,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(p.driver_name, ''), 'Piloto') AS displayName,
      COALESCE(NULLIF(p.driver_name, ''), 'Piloto') AS sourceName,
      p.avatar_url AS avatarUrl,
      p.country_code AS countryCode,
      CASE WHEN p.linked_user_id IS NOT NULL THEN 1 ELSE 0 END AS linkedUser,
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
      r.last_race_at AS lastRaceAt,
      t.id AS teamId,
      t.name AS teamName,
      t.short_name AS teamShortName,
      m.role AS teamRole
    FROM gc_driver_profiles p
    LEFT JOIN gc_driver_rating r
      ON r.driver_key = p.driver_key
    LEFT JOIN gc_team_memberships m
      ON m.driver_profile_id = p.id
      AND m.status = 'active'
    LEFT JOIN gc_teams t
      ON t.id = m.team_id
      AND t.status = 'active'
    WHERE p.id = ?
    LIMIT 1
  `, [profileId]);

  const profile = profileRows[0];
  if (!profile) return null;

  let lapSummary: LapSummaryRow | undefined;
  let personalBests: PersonalBestRow[] = [];

  if (profile.steamGuid) {
    const [summaryRows] = await pool.query<LapSummaryRow[]>(`
      SELECT
        COUNT(*) AS totalLaps,
        COALESCE(SUM(valid = 1), 0) AS validLaps,
        COUNT(DISTINCT NULLIF(TRIM(track_display), '')) AS tracks,
        COUNT(DISTINCT NULLIF(TRIM(car_display), '')) AS cars,
        COUNT(DISTINCT source_key) AS sources,
        MAX(timestamp_unix) AS lastLapUnix
      FROM gc_stracker2_lap
      WHERE steam_guid = ?
    `, [profile.steamGuid]);

    lapSummary = summaryRows[0];

    const [bestRows] = await pool.query<PersonalBestRow[]>(`
      WITH ranked AS (
        SELECT
          source_key AS sourceKey,
          track_display AS track,
          car_display AS car,
          lap_time_ms AS lapTimeMs,
          max_speed_kmh AS maxSpeedKmh,
          sector_time_0 AS sector1Ms,
          sector_time_1 AS sector2Ms,
          sector_time_2 AS sector3Ms,
          timestamp_unix AS recordedUnix,
          ROW_NUMBER() OVER (
            PARTITION BY source_key, track_display, car_display
            ORDER BY lap_time_ms ASC, timestamp_unix DESC
          ) AS comboRank
        FROM gc_stracker2_lap
        WHERE steam_guid = ?
          AND valid = 1
          AND lap_time_ms > 0
          AND track_display IS NOT NULL
          AND car_display IS NOT NULL
      )
      SELECT
        sourceKey,
        track,
        car,
        lapTimeMs,
        maxSpeedKmh,
        sector1Ms,
        sector2Ms,
        sector3Ms,
        recordedUnix
      FROM ranked
      WHERE comboRank = 1
      ORDER BY recordedUnix DESC
      LIMIT 12
    `, [profile.steamGuid]);

    personalBests = bestRows;
  }

  const [eventRows] = await pool.query<EventRow[]>(`
    SELECT
      event_name AS eventName,
      event_date AS eventDate,
      old_sr AS oldSr,
      new_sr AS newSr,
      delta_sr AS deltaSr,
      old_gsr AS oldGsr,
      new_gsr AS newGsr,
      delta_gsr AS deltaGsr,
      position,
      clean_race AS cleanRace
    FROM gc_rating_event_result
    WHERE driver_key = ?
    ORDER BY COALESCE(event_date, processed_at) DESC
    LIMIT 8
  `, [profile.driverKey]);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    profile: {
      profileId: profile.profileId,
      displayName: profile.displayName,
      sourceName: profile.sourceName,
      avatarUrl: profile.avatarUrl,
      countryCode: profile.countryCode,
      linkedUser: num(profile.linkedUser) === 1,
      rating: {
        srScore: profile.srScore === null ? null : num(profile.srScore),
        srClass: profile.srClass,
        dsRating: profile.gsrRating === null ? null : num(profile.gsrRating),
        dsClass: profile.gsrClass,
        races: num(profile.races),
        cleanRaces: num(profile.cleanRaces),
        wins: num(profile.wins),
        podiums: num(profile.podiums),
        incidentPoints: num(profile.incidentPoints),
        lastDeltaSr: num(profile.lastDeltaSr),
        lastDeltaDs: num(profile.lastDeltaGsr),
        lastRaceAt: iso(profile.lastRaceAt)
      },
      team: profile.teamId && profile.teamName
        ? {
            id: profile.teamId,
            name: profile.teamName,
            shortName: profile.teamShortName,
            role: profile.teamRole
          }
        : null,
      activity: {
        totalLaps: num(lapSummary?.totalLaps),
        validLaps: num(lapSummary?.validLaps),
        tracks: num(lapSummary?.tracks),
        cars: num(lapSummary?.cars),
        sources: num(lapSummary?.sources),
        lastLapAt: unixIso(lapSummary?.lastLapUnix)
      },
      personalBests: personalBests.map((row) => ({
        sourceKey: row.sourceKey,
        track: row.track,
        car: row.car,
        lapTimeMs: num(row.lapTimeMs),
        maxSpeedKmh: row.maxSpeedKmh === null ? null : num(row.maxSpeedKmh),
        sectors: [
          row.sector1Ms === null ? null : num(row.sector1Ms),
          row.sector2Ms === null ? null : num(row.sector2Ms),
          row.sector3Ms === null ? null : num(row.sector3Ms)
        ],
        recordedAt: unixIso(row.recordedUnix)
      })),
      recentRatingChanges: eventRows.map((row) => ({
        eventName: row.eventName,
        eventDate: iso(row.eventDate),
        oldSr: num(row.oldSr),
        newSr: num(row.newSr),
        deltaSr: num(row.deltaSr),
        oldDs: num(row.oldGsr),
        newDs: num(row.newGsr),
        deltaDs: num(row.deltaGsr),
        position: num(row.position),
        cleanRace: num(row.cleanRace) === 1
      }))
    }
  };
}
