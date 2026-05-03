import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';

let db: Database.Database | null = null;

export function getAppDb() {
  if (db) return db;

  const dir = path.dirname(env.APP_DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(env.APP_DB_PATH);
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
