import fs from 'node:fs';
import { createRequire } from 'node:module';
import { env } from '../config/env';
import { logger } from '../shared/logger';

const require = createRequire(import.meta.url);

type BetterSqlite3Module = typeof import('better-sqlite3');

let DatabaseCtor: BetterSqlite3Module | null = null;
let lastSqliteError: string | null = null;

function loadBetterSqlite() {
  if (DatabaseCtor) return DatabaseCtor;

  try {
    DatabaseCtor = require('better-sqlite3') as BetterSqlite3Module;
    lastSqliteError = null;
    return DatabaseCtor;
  } catch (error) {
    lastSqliteError = error instanceof Error ? error.message : String(error);
    logger.error('stracker', 'No se pudo cargar better-sqlite3 para stracker.', error);
    return null;
  }
}

export function hasStrackerDb() {
  return fs.existsSync(env.STRACKER_DB_PATH);
}

export function openStrackerDb() {
  if (!hasStrackerDb()) {
    throw new Error(`No existe stracker.db3 en: ${env.STRACKER_DB_PATH}`);
  }

  const BetterSqlite = loadBetterSqlite();

  if (!BetterSqlite) {
    throw new Error(`SQLite no disponible en Node: ${lastSqliteError ?? 'error desconocido'}`);
  }

  return new BetterSqlite(env.STRACKER_DB_PATH, {
    readonly: env.STRACKER_READONLY,
    fileMustExist: true
  });
}

export function listStrackerTables() {
  if (!hasStrackerDb()) {
    return {
      ok: false,
      path: env.STRACKER_DB_PATH,
      tables: [],
      message: 'Todavía no hay stracker.db3 en la carpeta data/stracker.'
    };
  }

  try {
    const db = openStrackerDb();

    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all();

      return {
        ok: true,
        path: env.STRACKER_DB_PATH,
        tables
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      ok: false,
      path: env.STRACKER_DB_PATH,
      tables: [],
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getHotlapsPreview() {
  if (!hasStrackerDb()) {
    return {
      ok: false,
      source: 'stracker',
      items: [],
      message: 'stracker.db3 no conectado todavía.'
    };
  }

  logger.info('stracker', 'Hotlaps preview pendiente de mapear según tablas reales de stracker.db3');

  return {
    ok: true,
    source: 'stracker',
    items: [],
    message: 'DB detectada. El siguiente paso es mapear tablas reales de vueltas, coches y circuitos.'
  };
}
