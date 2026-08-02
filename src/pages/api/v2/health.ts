import type { APIRoute } from 'astro';
import { runtimeConfig } from '@/server/env';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({
    ok: true,
    service: 'grasscutters-web-v2',
    version: '0.9.5',
    runtime: 'node',
    environment: runtimeConfig.appEnvironment,
    generatedAt: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
