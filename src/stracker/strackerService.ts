import fs from 'node:fs';
import Database from 'better-sqlite3';
import { env } from '../config/env';
import { logger } from '../shared/logger';

export function hasStrackerDb() {
  return fs.existsSync(env.STRACKER_DB_PATH);
}

export function openStrackerDb() {
  if (!hasStrackerDb()) {
    throw new Error(`No existe stracker.db3 en: ${env.STRACKER_DB_PATH}`);
  }

  return new Database(env.STRACKER_DB_PATH, {
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
