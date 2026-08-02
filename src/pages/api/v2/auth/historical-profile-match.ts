import type { APIRoute } from 'astro';

import { loadSteamAccountContext } from '@/server/auth/steam-account-context';
import {
  HistoricalProfileMatchError,
  auditHistoricalProfileMatch
} from '@/server/database/steam-historical-profile-match';
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

export const GET: APIRoute = async ({ cookies }) => {
  if (runtimeConfig.appEnvironment !== 'local') {
    return json({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Recurso no disponible.'
    }, 404);
  }

  const context = await loadSteamAccountContext(cookies);

  if (!context.authenticated || !context.account) {
    return json({
      ok: false,
      readOnly: true,
      errorCode: 'STEAM_AUTH_REQUIRED',
      message: 'Debes iniciar sesión con Steam para auditar tu perfil histórico.'
    }, 401);
  }

  try {
    return json(await auditHistoricalProfileMatch(context.account));
  } catch (error) {
    const matchError =
      error instanceof HistoricalProfileMatchError
        ? error
        : new HistoricalProfileMatchError(
            'unknown',
            'HISTORICAL_PROFILE_MATCH_FAILED',
            'Unknown historical profile audit failure.'
          );

    return json({
      ok: false,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      errorCode: matchError.errorCode,
      stage: matchError.stage,
      databaseCode: matchError.databaseCode,
      message: 'No se ha podido auditar el perfil histórico.',
      diagnostic: matchError.message.slice(0, 240),
      generatedAt: new Date().toISOString()
    }, 503);
  }
};
