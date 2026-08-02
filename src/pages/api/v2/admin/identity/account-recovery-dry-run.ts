import type { APIRoute } from 'astro';

import {
  RecoveryDryRunError,
  buildAccountRecoveryDryRun
} from '@/server/database/account-recovery-dry-run';
import { runtimeConfig } from '@/server/env';

export const prerender = false;

export const GET: APIRoute = async () => {
  if (runtimeConfig.appEnvironment !== 'local') {
    return new Response(JSON.stringify({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Recurso no disponible.'
    }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  try {
    const report = await buildAccountRecoveryDryRun();

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    const dryRunError =
      error instanceof RecoveryDryRunError
        ? error
        : new RecoveryDryRunError(
            'unknown',
            'ACCOUNT_RECOVERY_DRY_RUN_FAILED',
            'Unknown dry-run failure.'
          );

    return new Response(JSON.stringify({
      ok: false,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      errorCode: dryRunError.errorCode,
      stage: dryRunError.stage,
      databaseCode: dryRunError.databaseCode,
      message: 'No se ha podido completar el dry-run de recuperación.',
      diagnostic: dryRunError.message.slice(0, 240),
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
