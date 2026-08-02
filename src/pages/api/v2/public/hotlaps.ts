import type { APIRoute } from 'astro';
import { getPublicHotlapsData } from '@/server/public/hotlaps-data';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const data = await getPublicHotlapsData({
      source: url.searchParams.get('server'),
      track: url.searchParams.get('track'),
      car: url.searchParams.get('car')
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=15, stale-while-revalidate=30'
      }
    });
  } catch {
    return new Response(JSON.stringify({
      ok: false,
      errorCode: 'PUBLIC_HOTLAPS_DATA_FAILED',
      message: 'No se han podido cargar los hotlaps.',
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
