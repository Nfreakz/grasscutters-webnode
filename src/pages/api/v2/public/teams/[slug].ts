import type { APIRoute } from 'astro';
import { getPublicTeamProfileData } from '@/server/public/team-profile-data';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const slug = params.slug?.trim();

    if (!slug) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'TEAM_SLUG_REQUIRED',
        message: 'Falta el identificador del equipo.'
      }), {
        status: 400,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    const data = await getPublicTeamProfileData(slug);

    if (!data) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'TEAM_NOT_FOUND',
        message: 'No se ha encontrado el equipo.'
      }), {
        status: 404,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

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
      errorCode: 'PUBLIC_TEAM_PROFILE_FAILED',
      message: 'No se ha podido cargar el perfil del equipo.',
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
