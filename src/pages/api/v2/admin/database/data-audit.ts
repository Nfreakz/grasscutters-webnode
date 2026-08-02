import type { APIRoute } from 'astro';

import { auditDatabaseData } from '@/server/database/data-audit';
import { runtimeConfig } from '@/server/env';

export const prerender = false;

export const GET: APIRoute = async () => {
  if (runtimeConfig.appEnvironment !== 'local') {
    return new Response(
      JSON.stringify({
        ok: false,
        errorCode: 'NOT_FOUND',
        message: 'Recurso no disponible.'
      }),
      {
        status: 404,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }

  try {
    const audit = await auditDatabaseData();

    return new Response(JSON.stringify(audit), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    const errorCode =
      error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED'
        ? 'DATABASE_NOT_CONFIGURED'
        : 'DATA_AUDIT_FAILED';

    return new Response(
      JSON.stringify({
        ok: false,
        readOnly: true,
        errorCode,
        message: 'No se ha podido auditar el contenido MySQL.',
        generatedAt: new Date().toISOString()
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }
};
