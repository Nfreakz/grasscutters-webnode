import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sqlitePath = path.resolve(rootDir, process.env.APP_SQLITE_PATH || './data/app/gc-local.sqlite');
const usersJsonPath = path.resolve(rootDir, process.env.APP_USERS_PATH || './data/app/users.json');
const displayNamesJsonPath = path.resolve(rootDir, process.env.APP_DISPLAY_NAMES_PATH || './data/app/display-names.json');

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const SQL = await initSqlJs();
ensureDirForFile(sqlitePath);
const db = fs.existsSync(sqlitePath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(sqlitePath)))
  : new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS gc_users (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pilot',
    password_algorithm TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pilot_player_id INTEGER NULL,
    pilot_steam_guid TEXT NULL,
    pilot_stracker_name TEXT NULL,
    pilot_linked_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT NULL
  )
`);
db.run(`CREATE TABLE IF NOT EXISTS gc_sessions (id TEXT NOT NULL PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS gc_display_names (id TEXT NOT NULL PRIMARY KEY, kind TEXT NOT NULL, source_id INTEGER NULL, source_code TEXT NULL, source_name TEXT NOT NULL, display_name TEXT NOT NULL, notes TEXT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS gc_settings (setting_key TEXT NOT NULL PRIMARY KEY, setting_value TEXT NULL, updated_at TEXT NOT NULL)`);

const userStore = readJson(usersJsonPath, { users: [], sessions: [] });
const displayStore = readJson(displayNamesJsonPath, { entries: [] });

db.run('BEGIN TRANSACTION');
try {
  for (const user of userStore.users || []) {
    db.run(
      `INSERT OR REPLACE INTO gc_users (id, email, display_name, role, password_algorithm, password_iterations, password_salt, password_hash, pilot_player_id, pilot_steam_guid, pilot_stracker_name, pilot_linked_at, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        user.displayName,
        user.role || 'pilot',
        user.password?.algorithm || 'pbkdf2-sha256',
        Number(user.password?.iterations || 120000),
        user.password?.salt || '',
        user.password?.hash || '',
        user.pilotLink?.playerId ?? null,
        user.pilotLink?.steamGuid ?? null,
        user.pilotLink?.strackerName ?? null,
        user.pilotLink?.linkedAt ?? null,
        user.createdAt || new Date().toISOString(),
        user.updatedAt || new Date().toISOString(),
        user.lastLoginAt ?? null
      ]
    );
  }

  for (const session of userStore.sessions || []) {
    db.run(
      `INSERT OR REPLACE INTO gc_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt, session.lastSeenAt]
    );
  }

  for (const entry of displayStore.entries || []) {
    db.run(
      `INSERT OR REPLACE INTO gc_display_names (id, kind, source_id, source_code, source_name, display_name, notes, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.kind,
        Number.isFinite(Number(entry.sourceId)) ? Number(entry.sourceId) : null,
        entry.sourceCode ?? null,
        entry.sourceName || '',
        entry.displayName || '',
        entry.notes ?? null,
        entry.enabled === false ? 0 : 1,
        entry.createdAt || new Date().toISOString(),
        entry.updatedAt || new Date().toISOString()
      ]
    );
  }

  db.run('COMMIT');
} catch (error) {
  db.run('ROLLBACK');
  throw error;
}

fs.writeFileSync(sqlitePath, Buffer.from(db.export()));
db.close();

console.log(JSON.stringify({
  ok: true,
  sqlitePath,
  usersImported: (userStore.users || []).length,
  sessionsImported: (userStore.sessions || []).length,
  displayNamesImported: (displayStore.entries || []).length
}, null, 2));
