import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';

interface DriverRow extends RowDataPacket {
  profileId: string | null;
  driverKey: string;
  displayName: string;
  sourceName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  linkedUser: number | string;
  hasProfile: number | string;
  hasRating: number | string;
  srScore: number | string | null;
  srClass: string | null;
  gsrRating: number | string | null;
  gsrClass: string | null;
  races: number | string | null;
  cleanRaces: number | string | null;
  wins: number | string | null;
  podiums: number | string | null;
  lastRaceAt: Date | string | null;
  teamId: string | null;
  teamName: string | null;
  teamShortName: string | null;
  teamRole: string | null;
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

export interface PublicDriver {
  profileId: string | null;
  driverKey: string;
  displayName: string;
  sourceName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  linkedUser: boolean;
  hasProfile: boolean;
  hasRating: boolean;
  srScore: number | null;
  srClass: string | null;
  gsrRating: number | null;
  gsrClass: string | null;
  races: number;
  cleanRaces: number;
  wins: number;
  podiums: number;
  lastRaceAt: string | null;
  team: {
    id: string;
    name: string;
    shortName: string | null;
    role: string | null;
  } | null;
}

export interface PublicDriversData {
  ok: true;
  generatedAt: string;
  summary: {
    drivers: number;
    canonicalProfiles: number;
    ratedDrivers: number;
    linkedUsers: number;
    teamDrivers: number;
    pendingConsolidation: number;
  };
  drivers: PublicDriver[];
}

export async function getPublicDriversData(): Promise<PublicDriversData> {
  const [rows] = await getDatabasePool().query<DriverRow[]>(`
    SELECT
      p.id AS profileId,
      COALESCE(p.driver_key, r.driver_key) AS driverKey,
      COALESCE(
        NULLIF(p.display_name, ''),
        NULLIF(p.driver_name, ''),
        NULLIF(r.display_name, ''),
        'Piloto'
      ) AS displayName,
      COALESCE(
        NULLIF(p.driver_name, ''),
        NULLIF(r.display_name, ''),
        'Piloto'
      ) AS sourceName,
      p.country_code AS countryCode,
      p.avatar_url AS avatarUrl,
      CASE WHEN p.linked_user_id IS NOT NULL THEN 1 ELSE 0 END AS linkedUser,
      CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END AS hasProfile,
      CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS hasRating,
      r.sr_score AS srScore,
      r.sr_class AS srClass,
      r.gsr_rating AS gsrRating,
      r.gsr_class AS gsrClass,
      r.races_count AS races,
      r.clean_races AS cleanRaces,
      r.wins,
      r.podiums,
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

    UNION ALL

    SELECT
      NULL AS profileId,
      r.driver_key AS driverKey,
      COALESCE(NULLIF(r.display_name, ''), 'Piloto') AS displayName,
      COALESCE(NULLIF(r.display_name, ''), 'Piloto') AS sourceName,
      NULL AS countryCode,
      NULL AS avatarUrl,
      0 AS linkedUser,
      0 AS hasProfile,
      1 AS hasRating,
      r.sr_score AS srScore,
      r.sr_class AS srClass,
      r.gsr_rating AS gsrRating,
      r.gsr_class AS gsrClass,
      r.races_count AS races,
      r.clean_races AS cleanRaces,
      r.wins,
      r.podiums,
      r.last_race_at AS lastRaceAt,
      NULL AS teamId,
      NULL AS teamName,
      NULL AS teamShortName,
      NULL AS teamRole
    FROM gc_driver_rating r
    LEFT JOIN gc_driver_profiles p
      ON p.driver_key = r.driver_key
    WHERE p.id IS NULL

    ORDER BY
      hasRating DESC,
      gsrRating DESC,
      displayName ASC
  `);

  const drivers: PublicDriver[] = rows.map((row) => ({
    profileId: row.profileId,
    driverKey: row.driverKey,
    displayName: row.displayName,
    sourceName: row.sourceName,
    countryCode: row.countryCode,
    avatarUrl: row.avatarUrl,
    linkedUser: num(row.linkedUser) === 1,
    hasProfile: num(row.hasProfile) === 1,
    hasRating: num(row.hasRating) === 1,
    srScore: row.srScore === null ? null : num(row.srScore),
    srClass: row.srClass,
    gsrRating: row.gsrRating === null ? null : num(row.gsrRating),
    gsrClass: row.gsrClass,
    races: num(row.races),
    cleanRaces: num(row.cleanRaces),
    wins: num(row.wins),
    podiums: num(row.podiums),
    lastRaceAt: iso(row.lastRaceAt),
    team: row.teamId && row.teamName
      ? {
          id: row.teamId,
          name: row.teamName,
          shortName: row.teamShortName,
          role: row.teamRole
        }
      : null
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      drivers: drivers.length,
      canonicalProfiles: drivers.filter((driver) => driver.hasProfile).length,
      ratedDrivers: drivers.filter((driver) => driver.hasRating).length,
      linkedUsers: drivers.filter((driver) => driver.linkedUser).length,
      teamDrivers: drivers.filter((driver) => driver.team !== null).length,
      pendingConsolidation: drivers.filter(
        (driver) => driver.hasRating && !driver.hasProfile
      ).length
    },
    drivers
  };
}
