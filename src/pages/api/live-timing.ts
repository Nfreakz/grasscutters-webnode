import type { APIRoute } from 'astro';
import { getLiveTimingPayload, getLiveTimingResponseStatus } from '../../server/live-timing-core';

export const prerender = false;

export const GET: APIRoute = async () => {
  const payload = await getLiveTimingPayload();
  return new Response(JSON.stringify(payload), {
    status: getLiveTimingResponseStatus(payload),
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};
