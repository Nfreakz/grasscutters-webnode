import type { APIRoute } from 'astro';
import { getPublicTeamsData } from '@/server/public/teams-data';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const data = await getPublicTeamsData();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=30, stale-while-revalidate=60'
      }
    });
  } catch {
    return new Response(JSON.stringify({
      ok: false,
      errorCode: 'PUBLIC_TEAMS_DATA_FAILED',
      message: 'No se han podido cargar los equipos.',
      generatedAt: new Date().toISOString()
    }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
};
