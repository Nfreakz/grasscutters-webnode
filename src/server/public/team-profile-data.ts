import {
  getPublicTeamsData,
  type PublicTeam
} from '@/server/public/teams-data';

export interface PublicTeamProfileData {
  ok: true;
  generatedAt: string;
  team: PublicTeam;
  limitations: string[];
}

export async function getPublicTeamProfileData(
  slug: string
): Promise<PublicTeamProfileData | null> {
  const data = await getPublicTeamsData();
  const normalizedSlug = slug.trim().toLowerCase();

  const team = data.teams.find(
    (candidate) => candidate.slug.toLowerCase() === normalizedSlug
  );

  if (!team) return null;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    team,
    limitations: data.limitations
  };
}
