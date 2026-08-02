import type { APIRoute } from 'astro';

import {
  STEAM_SCHEMA_CONFIRMATION,
  SteamSchemaApplyError,
  applySteamIdentitySchema,
  inspectSteamIdentitySchema
} from '@/server/database/steam-schema-apply';
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
    const inspection = await inspectSteamIdentitySchema();

    return json({
      ok: true,
      readOnly: true,
      writesAvailable: runtimeConfig.database.writeEnabled,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      requiredConfirmation: STEAM_SCHEMA_CONFIRMATION,
      inspection,
      canApply:
        runtimeConfig.database.writeEnabled &&
        inspection.existingTables.length === 0,
      safeToApplyAutomatically: false
    });
  } catch (error) {
    return json({
      ok: false,
      readOnly: true,
      errorCode: 'STEAM_SCHEMA_STATUS_FAILED',
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
      errorCode: 'INVALID_JSON',
      message: 'El cuerpo JSON no es válido.'
    }, 400);
  }

  try {
    const result = await applySteamIdentitySchema({
      confirmation: String(body.confirmation ?? '')
    });

    return json(result, 201);
  } catch (error) {
    const applyError =
      error instanceof SteamSchemaApplyError
        ? error
        : new SteamSchemaApplyError(
            'unknown',
            'STEAM_SCHEMA_APPLY_FAILED',
            'Unknown apply failure.'
          );

    return json({
      ok: false,
      applied: false,
      destructiveChangesApplied: false,
      errorCode: applyError.errorCode,
      stage: applyError.stage,
      databaseCode: applyError.databaseCode,
      message: 'No se ha podido crear el esquema Steam.',
      diagnostic: applyError.message.slice(0, 240),
      generatedAt: new Date().toISOString()
    }, 409);
  }
};
