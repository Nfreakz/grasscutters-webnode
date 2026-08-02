import type { APIRoute } from 'astro';

import { getPublicRaceData } from '@/server/public/race-data';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const data = await getPublicRaceData(url.searchParams.get('server'));

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=15, stale-while-revalidate=30'
      }
    });
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        errorCode: 'PUBLIC_RACE_DATA_FAILED',
        message: 'No se han podido cargar los datos de carrera.',
        generatedAt: new Date().toISOString()
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }
};
