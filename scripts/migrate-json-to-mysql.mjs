import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const rootDir = process.cwd();
const appDataDir = process.env.APP_DATA_DIR?.trim() || './data';
const usersPath = process.env.APP_USERS_PATH?.trim() || path.join(appDataDir, 'app/users.json');
const displayNamesPath = process.env.APP_DISPLAY_NAMES_PATH?.trim() || path.join(appDataDir, 'app/display-names.json');

function resolveProjectPath(value) {
  if (!value) return value;
  if (path.isAbsolute(value)) return value;
  return path.join(rootDir, value);
}

function isoToMysql(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function readJson(filePath, fallback) {
  const resolved = resolveProjectPath(filePath);
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

async function main() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error('Faltan MYSQL_HOST, MYSQL_DATABASE o MYSQL_USER en .env');
  }

  const pool = await mysql.createPool({ host, port, database, user, password, waitForConnections: true, connectionLimit: 3, charset: 'utf8mb4', timezone: 'Z' });
  const schema = fs.readFileSync(path.join(rootDir, 'scripts/mysql-schema.sql'), 'utf8');
  for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }

  const usersStore = readJson(usersPath, { users: [], sessions: [] });
  const displayStore = readJson(displayNamesPath, { entries: [] });
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (const u of usersStore.users || []) {
      await conn.query(
        `INSERT INTO gc_users
          (id, email, display_name, role, password_algorithm, password_iterations, password_salt, password_hash,
           pilot_player_id, pilot_steam_guid, pilot_stracker_name, pilot_linked_at, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email), display_name = VALUES(display_name), role = VALUES(role),
           password_algorithm = VALUES(password_algorithm), password_iterations = VALUES(password_iterations),
           password_salt = VALUES(password_salt), password_hash = VALUES(password_hash),
           pilot_player_id = VALUES(pilot_player_id), pilot_steam_guid = VALUES(pilot_steam_guid),
           pilot_stracker_name = VALUES(pilot_stracker_name), pilot_linked_at = VALUES(pilot_linked_at),
           updated_at = VALUES(updated_at), last_login_at = VALUES(last_login_at)`,
        [
          u.id,
          u.email,
          u.displayName,
          u.role || 'pilot',
          u.password?.algorithm || 'pbkdf2-sha256',
          Number(u.password?.iterations || 120000),
          u.password?.salt || '',
          u.password?.hash || '',
          u.pilotLink?.playerId ?? null,
          u.pilotLink?.steamGuid ?? null,
          u.pilotLink?.strackerName ?? null,
          isoToMysql(u.pilotLink?.linkedAt),
          isoToMysql(u.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(u.updatedAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(u.lastLoginAt)
        ]
      );
    }

    for (const s of usersStore.sessions || []) {
      await conn.query(
        `INSERT INTO gc_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), last_seen_at = VALUES(last_seen_at)`,
        [s.id, s.userId, s.tokenHash, isoToMysql(s.createdAt) || isoToMysql(new Date().toISOString()), isoToMysql(s.expiresAt) || isoToMysql(new Date().toISOString()), isoToMysql(s.lastSeenAt) || isoToMysql(new Date().toISOString())]
      );
    }

    for (const e of displayStore.entries || []) {
      await conn.query(
        `INSERT INTO gc_display_names
          (id, kind, source_id, source_code, source_name, display_name, notes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           kind = VALUES(kind), source_id = VALUES(source_id), source_code = VALUES(source_code),
           source_name = VALUES(source_name), display_name = VALUES(display_name), notes = VALUES(notes),
           enabled = VALUES(enabled), updated_at = VALUES(updated_at)`,
        [
          e.id,
          e.kind,
          e.sourceId ?? null,
          e.sourceCode ?? null,
          e.sourceName || e.displayName || '',
          e.displayName || e.sourceName || '',
          e.notes ?? null,
          e.enabled === false ? 0 : 1,
          isoToMysql(e.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(e.updatedAt) || isoToMysql(new Date().toISOString())
        ]
      );
    }

    await conn.commit();
    console.log(`Migración completada: ${usersStore.users?.length || 0} usuarios, ${usersStore.sessions?.length || 0} sesiones, ${displayStore.entries?.length || 0} alias.`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migración fallida:', error);
  process.exit(1);
});
