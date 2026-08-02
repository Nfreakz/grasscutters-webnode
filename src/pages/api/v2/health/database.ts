import type { APIRoute } from 'astro';
import { checkDatabaseHealth } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

export const prerender = false;

export const GET: APIRoute = async () => {
  const database = await checkDatabaseHealth();

  return new Response(JSON.stringify({
    ok: database.connected,
    service: 'grasscutters-web-v2',
    version: '0.7.4',
    environment: runtimeConfig.appEnvironment,
    database,
    generatedAt: new Date().toISOString()
  }), {
    status: database.connected ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};
