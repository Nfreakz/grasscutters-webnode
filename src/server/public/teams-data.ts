import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';

interface TeamRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  status: string;
}

interface MemberRow extends RowDataPacket {
  teamId: string;
  profileId: string;
  displayName: string;
  sourceName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  role: string | null;
  gsrRating: number | string | null;
  gsrClass: string | null;
  srScore: number | string | null;
  srClass: string | null;
  races: number | string | null;
  wins: number | string | null;
  podiums: number | string | null;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface PublicTeamMember {
  profileId: string;
  displayName: string;
  sourceName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  role: string | null;
  gsrRating: number | null;
  gsrClass: string | null;
  srScore: number | null;
  srClass: string | null;
  races: number;
  wins: number;
  podiums: number;
}

export interface PublicTeam {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  status: string;
  activeDrivers: number;
  averageGsr: number | null;
  averageSr: number | null;
  totalRaces: number;
  totalWins: number;
  totalPodiums: number;
  members: PublicTeamMember[];
}

export interface PublicTeamsData {
  ok: true;
  generatedAt: string;
  summary: {
    activeTeams: number;
    activeDrivers: number;
    ratedDrivers: number;
    totalWins: number;
    totalPodiums: number;
  };
  teams: PublicTeam[];
  limitations: string[];
}

export async function getPublicTeamsData(): Promise<PublicTeamsData> {
  const pool = getDatabasePool();

  const [teamRows] = await pool.query<TeamRow[]>(`
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      logo_url AS logoUrl,
      status
    FROM gc_teams
    WHERE status = 'active'
    ORDER BY name ASC
  `);

  const [memberRows] = await pool.query<MemberRow[]>(`
    SELECT
      m.team_id AS teamId,
      p.id AS profileId,
      COALESCE(
        NULLIF(p.display_name, ''),
        NULLIF(p.driver_name, ''),
        'Piloto'
      ) AS displayName,
      COALESCE(NULLIF(p.driver_name, ''), 'Piloto') AS sourceName,
      p.avatar_url AS avatarUrl,
      p.country_code AS countryCode,
      m.role,
      r.gsr_rating AS gsrRating,
      r.gsr_class AS gsrClass,
      r.sr_score AS srScore,
      r.sr_class AS srClass,
      r.races_count AS races,
      r.wins,
      r.podiums
    FROM gc_team_memberships m
    INNER JOIN gc_driver_profiles p
      ON p.id = m.driver_profile_id
    LEFT JOIN gc_driver_rating r
      ON r.driver_key = p.driver_key
    WHERE m.status = 'active'
    ORDER BY
      m.team_id,
      CASE
        WHEN m.role IN ('owner', 'manager', 'captain') THEN 0
        ELSE 1
      END,
      r.gsr_rating DESC,
      displayName ASC
  `);

  const membersByTeam = new Map<string, PublicTeamMember[]>();

  for (const row of memberRows) {
    const member: PublicTeamMember = {
      profileId: row.profileId,
      displayName: row.displayName,
      sourceName: row.sourceName,
      avatarUrl: row.avatarUrl,
      countryCode: row.countryCode,
      role: row.role,
      gsrRating: row.gsrRating === null ? null : num(row.gsrRating),
      gsrClass: row.gsrClass,
      srScore: row.srScore === null ? null : num(row.srScore),
      srClass: row.srClass,
      races: num(row.races),
      wins: num(row.wins),
      podiums: num(row.podiums)
    };

    const current = membersByTeam.get(row.teamId) ?? [];
    current.push(member);
    membersByTeam.set(row.teamId, current);
  }

  const teams: PublicTeam[] = teamRows.map((team) => {
    const members = membersByTeam.get(team.id) ?? [];
    const ratedMembers = members.filter(
      (member) => member.gsrRating !== null && member.srScore !== null
    );

    return {
      id: team.id,
      slug: team.slug,
      name: team.name,
      shortName: team.shortName,
      logoUrl: team.logoUrl,
      status: team.status,
      activeDrivers: members.length,
      averageGsr: ratedMembers.length
        ? Math.round(
            ratedMembers.reduce(
              (sum, member) => sum + (member.gsrRating ?? 0),
              0
            ) / ratedMembers.length
          )
        : null,
      averageSr: ratedMembers.length
        ? Math.round(
            ratedMembers.reduce(
              (sum, member) => sum + (member.srScore ?? 0),
              0
            ) /
              ratedMembers.length *
              100
          ) / 100
        : null,
      totalRaces: members.reduce((sum, member) => sum + member.races, 0),
      totalWins: members.reduce((sum, member) => sum + member.wins, 0),
      totalPodiums: members.reduce((sum, member) => sum + member.podiums, 0),
      members
    };
  });

  const allMembers = teams.flatMap((team) => team.members);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      activeTeams: teams.length,
      activeDrivers: allMembers.length,
      ratedDrivers: allMembers.filter(
        (member) => member.gsrRating !== null
      ).length,
      totalWins: teams.reduce((sum, team) => sum + team.totalWins, 0),
      totalPodiums: teams.reduce((sum, team) => sum + team.totalPodiums, 0)
    },
    teams,
    limitations: [
      'Los promedios SR/DS son agregados de los pilotos activos con rating.',
      'No se muestran puntos de campeonato hasta normalizar los resultados por equipo y competición.'
    ]
  };
}
