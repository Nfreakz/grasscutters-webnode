import type { APIRoute } from 'astro';
import {
  CredentialAuditError,
  auditLegacyCredentials
} from '@/server/database/legacy-credential-audit';
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
    const report = await auditLegacyCredentials();

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    const auditError =
      error instanceof CredentialAuditError
        ? error
        : new CredentialAuditError(
            'unknown',
            'CREDENTIAL_AUDIT_FAILED',
            'Unknown credential audit failure.'
          );

    return new Response(JSON.stringify({
      ok: false,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      errorCode: auditError.errorCode,
      stage: auditError.stage,
      databaseCode: auditError.databaseCode,
      message: 'No se ha podido completar la auditoría de credenciales.',
      diagnostic: auditError.message.slice(0, 240),
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
