import type { APIRoute } from 'astro';
import { getPublicDriverProfileData } from '@/server/public/driver-profile-data';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const profileId = params.id?.trim();

    if (!profileId) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'DRIVER_ID_REQUIRED',
        message: 'Falta el identificador del piloto.'
      }), {
        status: 400,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    const data = await getPublicDriverProfileData(profileId);

    if (!data) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'DRIVER_NOT_FOUND',
        message: 'No se ha encontrado el piloto.'
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
      errorCode: 'PUBLIC_DRIVER_PROFILE_FAILED',
      message: 'No se ha podido cargar el perfil del piloto.',
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
