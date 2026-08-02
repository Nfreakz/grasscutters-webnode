import type { APIRoute } from 'astro';

import { loadSteamAccountContext } from '@/server/auth/steam-account-context';
import {
  HISTORICAL_PROFILE_CLAIM_CONFIRMATION,
  HistoricalProfileClaimError,
  claimUniqueHistoricalProfile
} from '@/server/database/steam-historical-profile-claim';
import { auditHistoricalProfileMatch } from '@/server/database/steam-historical-profile-match';
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
  const context = await loadSteamAccountContext(cookies);

  if (!context.authenticated || !context.account) {
    return json({
      ok: false,
      errorCode: 'STEAM_AUTH_REQUIRED',
      message: 'Debes iniciar sesión con Steam.'
    }, 401);
  }

  try {
    const match = await auditHistoricalProfileMatch(context.account);

    return json({
      ok: true,
      readOnly: true,
      writesAvailable:
        runtimeConfig.database.steamProfileClaimEnabled,
      requiredConfirmation:
        HISTORICAL_PROFILE_CLAIM_CONFIRMATION,
      canClaim:
        runtimeConfig.database.steamProfileClaimEnabled &&
        match.summary.uniqueExactMatch &&
        match.summary.existingVerifiedProfileLinks === 0,
      account: match.account,
      exactMatches: match.exactMatches,
      summary: match.summary,
      safeToClaimAutomatically: false
    });
  } catch (error) {
    return json({
      ok: false,
      readOnly: true,
      errorCode: 'PROFILE_CLAIM_PREFLIGHT_FAILED',
      diagnostic:
        error instanceof Error ? error.message.slice(0, 240) : 'Unknown error.'
    }, 503);
  }
};

export const POST: APIRoute = async ({ cookies, request }) => {
  const context = await loadSteamAccountContext(cookies);

  if (!context.authenticated || !context.account) {
    return json({
      ok: false,
      claimed: false,
      errorCode: 'STEAM_AUTH_REQUIRED',
      message: 'Debes iniciar sesión con Steam.'
    }, 401);
  }

  let body: {
    profileId?: string;
    confirmation?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({
      ok: false,
      claimed: false,
      errorCode: 'INVALID_JSON',
      message: 'El cuerpo JSON no es válido.'
    }, 400);
  }

  try {
    const result = await claimUniqueHistoricalProfile({
      account: context.account,
      requestedProfileId: String(body.profileId ?? ''),
      confirmation: String(body.confirmation ?? '')
    });

    return json(result, 201);
  } catch (error) {
    const claimError =
      error instanceof HistoricalProfileClaimError
        ? error
        : new HistoricalProfileClaimError(
            'unknown',
            'HISTORICAL_PROFILE_CLAIM_FAILED',
            'Unknown historical profile claim failure.'
          );

    return json({
      ok: false,
      claimed: false,
      destructiveChangesApplied: false,
      errorCode: claimError.errorCode,
      stage: claimError.stage,
      databaseCode: claimError.databaseCode,
      message: 'No se ha podido reclamar el perfil histórico.',
      diagnostic: claimError.message.slice(0, 240),
      generatedAt: new Date().toISOString()
    }, 409);
  }
};
