import type { APIRoute } from 'astro';

import { getPublicHomeData } from '@/server/public/home-data';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const data = await getPublicHomeData();

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
        errorCode: 'PUBLIC_HOME_DATA_FAILED',
        message: 'No se han podido cargar los datos públicos.',
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
