import mysql, {
  type Pool,
  type PoolOptions,
  type RowDataPacket
} from 'mysql2/promise';

import { runtimeConfig } from '@/server/env';

type GlobalDatabaseState = typeof globalThis & {
  __gcDatabasePool?: Pool;
};

export interface DatabaseHealth {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  databaseName: string | null;
  serverVersion: string | null;
  serverTime: string | null;
  latencyMs: number | null;
  writeEnabled: boolean;
  errorCode?: string;
  message: string;
}

function createSslOptions(): PoolOptions['ssl'] {
  const mode = runtimeConfig.database.sslMode;

  if (mode === 'disabled') {
    return undefined;
  }

  return {
    rejectUnauthorized: mode === 'required'
  };
}

function createPool(): Pool {
  if (!runtimeConfig.databaseConfigured) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  return mysql.createPool({
    host: runtimeConfig.database.host,
    port: runtimeConfig.database.port,
    database: runtimeConfig.database.name,
    user: runtimeConfig.database.user,
    password: runtimeConfig.database.password,
    waitForConnections: true,
    connectionLimit: runtimeConfig.database.connectionLimit,
    maxIdle: runtimeConfig.database.connectionLimit,
    idleTimeout: 60000,
    queueLimit: 0,
    connectTimeout: runtimeConfig.database.connectTimeoutMs,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    ssl: createSslOptions()
  });
}

export function getDatabasePool(): Pool {
  const state = globalThis as GlobalDatabaseState;

  if (!state.__gcDatabasePool) {
    state.__gcDatabasePool = createPool();
  }

  return state.__gcDatabasePool;
}

interface HealthRow extends RowDataPacket {
  databaseName: string | null;
  serverVersion: string;
  serverTime: Date | string;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') {
    return 'DATABASE_NOT_CONFIGURED';
  }

  return 'DATABASE_CONNECTION_FAILED';
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  if (!runtimeConfig.databaseConfigured) {
    return {
      ok: false,
      configured: false,
      connected: false,
      databaseName: null,
      serverVersion: null,
      serverTime: null,
      latencyMs: null,
      writeEnabled: runtimeConfig.database.writeEnabled,
      errorCode: 'DATABASE_NOT_CONFIGURED',
      message: 'Faltan variables de conexión MySQL.'
    };
  }

  const startedAt = performance.now();

  try {
    const pool = getDatabasePool();
    const [rows] = await pool.query<HealthRow[]>(`
      SELECT
        DATABASE() AS databaseName,
        VERSION() AS serverVersion,
        CURRENT_TIMESTAMP AS serverTime
    `);

    const row = rows[0];

    return {
      ok: true,
      configured: true,
      connected: true,
      databaseName: row?.databaseName ?? null,
      serverVersion: row?.serverVersion ?? null,
      serverTime: row?.serverTime
        ? new Date(row.serverTime).toISOString()
        : null,
      latencyMs: Math.round(performance.now() - startedAt),
      writeEnabled: runtimeConfig.database.writeEnabled,
      message: 'Conexión MySQL disponible.'
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      connected: false,
      databaseName: null,
      serverVersion: null,
      serverTime: null,
      latencyMs: Math.round(performance.now() - startedAt),
      writeEnabled: runtimeConfig.database.writeEnabled,
      errorCode: safeErrorCode(error),
      message: 'No se ha podido conectar con MySQL.'
    };
  }
}
