import type { APIRoute } from 'astro';

import {
  SteamIdentityHardeningError,
  applySteamIdentityHardening,
  inspectSteamIdentityHardening
} from '@/server/database/steam-identity-hardening';
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
  if (runtimeConfig.appEnvironment !== 'local') {
    return json({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Recurso no disponible.'
    }, 404);
  }

  try {
    return json(await inspectSteamIdentityHardening());
  } catch (error) {
    return json({
      ok: false,
      readOnly: true,
      errorCode: 'STEAM_IDENTITY_HARDENING_STATUS_FAILED',
      diagnostic:
        error instanceof Error ? error.message.slice(0, 240) : 'Unknown error.',
      generatedAt: new Date().toISOString()
    }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (runtimeConfig.appEnvironment !== 'local') {
    return json({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Recurso no disponible.'
    }, 404);
  }

  let body: { confirmation?: string };

  try {
    body = await request.json();
  } catch {
    return json({
      ok: false,
      applied: false,
      errorCode: 'INVALID_JSON',
      message: 'El cuerpo JSON no es válido.'
    }, 400);
  }

  try {
    return json(
      await applySteamIdentityHardening({
        confirmation: String(body.confirmation ?? '')
      }),
      201
    );
  } catch (error) {
    const hardeningError =
      error instanceof SteamIdentityHardeningError
        ? error
        : new SteamIdentityHardeningError(
            'unknown',
            'STEAM_IDENTITY_HARDENING_FAILED',
            'Unknown identity hardening failure.'
          );

    return json({
      ok: false,
      applied: false,
      destructiveChangesApplied: false,
      errorCode: hardeningError.errorCode,
      stage: hardeningError.stage,
      databaseCode: hardeningError.databaseCode,
      message: 'No se ha podido reforzar el esquema de identidad Steam.',
      diagnostic: hardeningError.message.slice(0, 240),
      generatedAt: new Date().toISOString()
    }, 409);
  }
};
