import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { env } from '../config/env';
import { logger } from '../shared/logger';

const require = createRequire(import.meta.url);

type BetterSqlite3Module = typeof import('better-sqlite3');
type BetterSqlite3Database = import('better-sqlite3').Database;

let DatabaseCtor: BetterSqlite3Module | null = null;
let db: BetterSqlite3Database | null = null;
let lastError: string | null = null;

function loadBetterSqlite() {
  if (DatabaseCtor) return DatabaseCtor;

  try {
    DatabaseCtor = require('better-sqlite3') as BetterSqlite3Module;
    lastError = null;
    return DatabaseCtor;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    logger.error('db', 'No se pudo cargar better-sqlite3. La web seguirá activa en modo sin DB.', error);
    return null;
  }
}

export function getAppDbStatus() {
  return {
    available: Boolean(DatabaseCtor || loadBetterSqlite()),
    path: env.APP_DB_PATH,
    error: lastError
  };
}

export function getAppDb() {
  if (db) return db;

  const BetterSqlite = loadBetterSqlite();

  if (!BetterSqlite) {
    throw new Error(`Base de datos interna no disponible: ${lastError ?? 'error desconocido'}`);
  }

  const dir = path.dirname(env.APP_DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  db = new BetterSqlite(env.APP_DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      steam_guid TEXT UNIQUE,
      discord_id TEXT UNIQUE,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      track TEXT,
      car TEXT,
      starts_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}
