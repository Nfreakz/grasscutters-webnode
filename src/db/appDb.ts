import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { env } from '../config/env';
import { logger } from '../shared/logger';

const require = createRequire(import.meta.url);

type BetterSqlite3Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type BetterSqlite3Database = {
  pragma(statement: string): unknown;
  exec(statement: string): unknown;
  prepare(statement: string): BetterSqlite3Statement;
  close?: () => void;
};

type BetterSqlite3Constructor = new (filename: string) => BetterSqlite3Database;

let DatabaseCtor: BetterSqlite3Constructor | null = null;
let db: BetterSqlite3Database | null = null;
let lastError: string | null = null;

function loadBetterSqlite(): BetterSqlite3Constructor | null {
  if (DatabaseCtor) return DatabaseCtor;

  try {
    const loaded = require('better-sqlite3') as
      | BetterSqlite3Constructor
      | { default?: BetterSqlite3Constructor };

    const constructor =
      typeof loaded === 'function'
        ? loaded
        : typeof loaded?.default === 'function'
          ? loaded.default
          : null;

    if (!constructor) {
      throw new Error('better-sqlite3 no exporta un constructor compatible.');
    }

    DatabaseCtor = constructor;
    lastError = null;
    return DatabaseCtor;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    logger.error(
      'db',
      'better-sqlite3 no está instalado. El módulo auxiliar seguirá desactivado sin afectar al servidor principal.',
      error
    );
    return null;
  }
}

export function getAppDbStatus() {
  return {
    available: Boolean(DatabaseCtor || loadBetterSqlite()),
    optional: true,
    module: 'better-sqlite3',
    path: env.APP_DB_PATH,
    error: lastError
  };
}

export function getAppDb() {
  if (db) return db;

  const BetterSqlite = loadBetterSqlite();

  if (!BetterSqlite) {
    throw new Error(`Base de datos interna opcional no disponible: ${lastError ?? 'error desconocido'}`);
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
