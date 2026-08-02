import type { APIRoute } from 'astro';

import {
  inspectSteamProductionReadiness
} from '@/server/production/steam-production-readiness';
import { runtimeConfig } from '@/server/env';

export const prerender = false;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export const GET: APIRoute = async () => {
  if (runtimeConfig.appEnvironment === 'production') {
    return json({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Recurso no disponible.'
    }, 404);
  }

  try {
    return json(await inspectSteamProductionReadiness());
  } catch (error) {
    return json({
      ok: false,
      readOnly: true,
      writesAvailable: false,
      secretsExposed: false,
      errorCode: 'PRODUCTION_READINESS_FAILED',
      diagnostic:
        error instanceof Error
          ? error.message.slice(0, 240)
          : 'Unknown readiness error.',
      generatedAt: new Date().toISOString()
    }, 503);
  }
};
