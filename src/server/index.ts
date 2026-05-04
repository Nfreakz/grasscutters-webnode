import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const distDir = path.join(rootDir, 'dist');
const defaultAppDataDirRelativePath = './data';
const defaultStrackerRelativePath = './data/stracker/stracker.db3';
const defaultUsersRelativePath = './data/app/users.json';
const defaultDisplayNamesRelativePath = './data/app/display-names.json';
const defaultAppSqliteRelativePath = './data/app/gc-local.sqlite';
const sessionCookieName = 'gc_session';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const startedAt = new Date().toISOString();
const discordEnabled = process.env.DISCORD_ENABLED === 'true';


const appStorageDriver = String(process.env.APP_STORAGE_DRIVER ?? 'json').trim().toLowerCase();

type MysqlPool = any;
type SqlJsModule = any;
type AppSqliteDb = any;

function useMysqlStorage() {
  return appStorageDriver === 'mysql' || appStorageDriver === 'mariadb';
}

function useSqliteStorage() {
  return appStorageDriver === 'sqlite' || appStorageDriver === 'sqlite3';
}

function getAppStorageDriverLabel() {
  if (useMysqlStorage()) return 'mysql';
  if (useSqliteStorage()) return 'sqlite';
  return 'json';
}

function getMysqlStorageSafeConfig() {
  return {
    enabled: useMysqlStorage(),
    driver: getAppStorageDriverLabel(),
    hostConfigured: Boolean(process.env.MYSQL_HOST?.trim()),
    port: Number(process.env.MYSQL_PORT || 3306),
    databaseConfigured: Boolean(process.env.MYSQL_DATABASE?.trim()),
    userConfigured: Boolean(process.env.MYSQL_USER?.trim()),
    passwordConfigured: Boolean(process.env.MYSQL_PASSWORD?.trim())
  };
}

function getAppSqlitePath() {
  const configured = process.env.APP_SQLITE_PATH?.trim();
  return configured
    ? (resolveProjectPath(configured) ?? path.join(rootDir, configured))
    : path.join(rootDir, defaultAppSqliteRelativePath);
}

function getSqliteStorageSafeConfig() {
  const sqlitePath = getAppSqlitePath();
  const stats = fs.existsSync(sqlitePath) ? fs.statSync(sqlitePath) : null;
  return {
    enabled: useSqliteStorage(),
    driver: getAppStorageDriverLabel(),
    pathConfigured: Boolean(process.env.APP_SQLITE_PATH?.trim()),
    relativePath: process.env.APP_SQLITE_PATH?.trim() || defaultAppSqliteRelativePath,
    resolvedPath: sqlitePath,
    exists: Boolean(stats),
    sizeBytes: stats?.size ?? 0,
    modifiedAt: stats?.mtime?.toISOString?.() ?? null,
    validSQLite: stats ? isSQLiteFile(sqlitePath) : false
  };
}

let mysqlPool: MysqlPool | null = null;
let mysqlSchemaReady = false;
let appSqlJsPromise: Promise<SqlJsModule> | null = null;

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getMysqlPool() {
  if (!useMysqlStorage()) throw new Error('APP_STORAGE_DRIVER no está en mysql.');
  if (mysqlPool) return mysqlPool;

  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error('Faltan variables MySQL: MYSQL_HOST, MYSQL_DATABASE o MYSQL_USER.');
  }

  const mysql = await importMysql2();
  mysqlPool = mysql.createPool({
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    queueLimit: 0,
    charset: 'utf8mb4',
    namedPlaceholders: false,
    timezone: 'Z'
  });

  return mysqlPool;
}

async function mysqlExecute(sql: string, params: unknown[] = []) {
  const pool = await getMysqlPool();
  const [result] = await pool.execute(sql, params);
  return result as any;
}

async function mysqlQuery(sql: string, params: unknown[] = []) {
  const pool = await getMysqlPool();
  const [rows] = await pool.query(sql, params);
  return rows as any[];
}

async function ensureMysqlSchema() {
  if (!useMysqlStorage() || mysqlSchemaReady) return;

  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_users (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      display_name VARCHAR(191) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'pilot',
      password_algorithm VARCHAR(50) NOT NULL,
      password_iterations INT NOT NULL,
      password_salt VARCHAR(128) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      pilot_player_id INT NULL,
      pilot_steam_guid VARCHAR(191) NULL,
      pilot_stracker_name VARCHAR(191) NULL,
      pilot_linked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      last_login_at DATETIME(3) NULL,
      INDEX idx_gc_users_role (role),
      INDEX idx_gc_users_pilot_player_id (pilot_player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_sessions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      last_seen_at DATETIME(3) NOT NULL,
      INDEX idx_gc_sessions_user_id (user_id),
      INDEX idx_gc_sessions_token_hash (token_hash),
      INDEX idx_gc_sessions_expires_at (expires_at),
      CONSTRAINT fk_gc_sessions_user_id FOREIGN KEY (user_id) REFERENCES gc_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_display_names (
      id VARCHAR(120) NOT NULL PRIMARY KEY,
      kind VARCHAR(20) NOT NULL,
      source_id INT NULL,
      source_code VARCHAR(255) NULL,
      source_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_gc_display_names_kind (kind),
      INDEX idx_gc_display_names_source_id (source_id),
      INDEX idx_gc_display_names_source_code (source_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_settings (
      setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
      setting_value LONGTEXT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  mysqlSchemaReady = true;
}

async function getAppSqlJs() {
  if (!appSqlJsPromise) {
    appSqlJsPromise = (async () => {
      const initSqlJsModule = await import('sql.js');
      const initSqlJs = initSqlJsModule.default;
      return initSqlJs();
    })();
  }
  return appSqlJsPromise;
}

function sqliteRowsFromExec(result: any) {
  const first = result?.[0];
  if (!first) return [];
  const columns = first.columns ?? [];
  return (first.values ?? []).map((row: unknown[]) =>
    Object.fromEntries(columns.map((column: string, index: number) => [column, row[index]]))
  ) as PlainObject[];
}

function sqliteQuery(db: AppSqliteDb, sql: string, params: unknown[] = []) {
  return sqliteRowsFromExec(db.exec(sql, params));
}

async function openAppSqliteDb() {
  if (!useSqliteStorage()) throw new Error('APP_STORAGE_DRIVER no está en sqlite.');
  const sqlitePath = getAppSqlitePath();
  ensureDirForFile(sqlitePath);
  const SQL = await getAppSqlJs();
  const bytes = fs.existsSync(sqlitePath) ? new Uint8Array(fs.readFileSync(sqlitePath)) : undefined;
  const db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  return { db, sqlitePath };
}

function persistAppSqliteDb(db: AppSqliteDb, sqlitePath: string) {
  ensureDirForFile(sqlitePath);
  const tempPath = `${sqlitePath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(db.export()));
  fs.renameSync(tempPath, sqlitePath);
}

async function withAppSqliteDb<T>(callback: (db: AppSqliteDb) => T | Promise<T>, persist = false) {
  const { db, sqlitePath } = await openAppSqliteDb();
  let shouldPersist = persist;
  try {
    shouldPersist = (await ensureAppSqliteSchema(db)) || shouldPersist;
    const result = await callback(db);
    if (shouldPersist) persistAppSqliteDb(db, sqlitePath);
    return result;
  } finally {
    db.close();
  }
}

async function ensureAppSqliteSchema(db: AppSqliteDb) {
  if (!useSqliteStorage()) return false;
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_users_role ON gc_users(role)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_users_pilot_player_id ON gc_users(pilot_player_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gc_sessions (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES gc_users(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_sessions_user_id ON gc_sessions(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_sessions_token_hash ON gc_sessions(token_hash)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_sessions_expires_at ON gc_sessions(expires_at)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gc_display_names (
      id TEXT NOT NULL PRIMARY KEY,
      kind TEXT NOT NULL,
      source_id INTEGER NULL,
      source_code TEXT NULL,
      source_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      notes TEXT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_display_names_kind ON gc_display_names(kind)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_display_names_source_id ON gc_display_names(source_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_display_names_source_code ON gc_display_names(source_code)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gc_settings (
      setting_key TEXT NOT NULL PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  return true;
}

function mysqlDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function isoToMysql(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

type PlainObject = Record<string, unknown>;
type SqlJsDatabase = any;


type AppUserRole = 'pilot' | 'admin';

type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppUserRole;
  password: {
    algorithm: 'pbkdf2-sha256';
    iterations: number;
    salt: string;
    hash: string;
  };
  pilotLink: null | {
    playerId: number;
    steamGuid: string | null;
    strackerName: string;
    linkedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type AppSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

type AppUserStore = {
  version: 1;
  users: AppUser[];
  sessions: AppSession[];
};


type DisplayNameKind = 'driver' | 'car' | 'track';

type DisplayNameEntry = {
  id: string;
  kind: DisplayNameKind;
  sourceId: number | null;
  sourceCode: string | null;
  sourceName: string;
  displayName: string;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type DisplayNameStore = {
  version: 1;
  updatedAt: string;
  entries: DisplayNameEntry[];
};

let displayNameCache: { path: string; mtimeMs: number | null; store: DisplayNameStore } | null = null;

function getAppDataRoot() {
  const configured = process.env.APP_DATA_DIR?.trim();
  return configured ? (resolveProjectPath(configured) ?? path.join(rootDir, configured)) : path.join(rootDir, defaultAppDataDirRelativePath);
}

function getStorageFilePath(envName: string, fallbackSubPath: string) {
  const configured = process.env[envName]?.trim();
  if (configured) return resolveProjectPath(configured) ?? path.join(rootDir, configured);
  return path.join(getAppDataRoot(), fallbackSubPath);
}

function isPathInside(childPath: string, parentPath: string) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function buildFileStorageInfo(filePath: string, configuredPath: string, source: string, validSQLite = false) {
  const exists = fs.existsSync(filePath);
  const stats = exists ? fs.statSync(filePath) : null;
  return {
    configured: true,
    source,
    relativePath: configuredPath,
    resolvedPath: filePath,
    exists,
    sizeBytes: stats?.size ?? 0,
    modifiedAt: stats?.mtime?.toISOString?.() ?? null,
    ...(validSQLite ? { validSQLite: exists ? isSQLiteFile(filePath) : false } : {})
  };
}

function getStoragePersistenceInfo() {
  if (useMysqlStorage()) {
    return {
      dataRoot: null,
      source: 'mysql',
      insideProject: false,
      persistent: true,
      warning: null
    };
  }

  if (useSqliteStorage()) {
    const sqlitePath = getAppSqlitePath();
    const insideProject = isPathInside(sqlitePath, rootDir);
    return {
      dataRoot: path.dirname(sqlitePath),
      source: process.env.APP_SQLITE_PATH ? 'sqlite-env' : 'sqlite-local-default',
      insideProject,
      persistent: true,
      warning: insideProject
        ? 'SQLite local activo. Es correcto para desarrollo si data/app/*.sqlite está en .gitignore. En Hostinger usa APP_STORAGE_DRIVER=mysql.'
        : null
    };
  }

  const dataRoot = getAppDataRoot();
  const insideProject = isPathInside(dataRoot, rootDir);
  return {
    dataRoot,
    source: process.env.APP_DATA_DIR ? 'env' : 'default-project-data',
    insideProject,
    persistent: !insideProject,
    warning: insideProject
      ? 'APP_DATA_DIR no está configurado fuera del proyecto. En algunos deploys Hostinger puede borrar data/app/users.json y display-names.json.'
      : null
  };
}

function getUsersPath() {
  return getStorageFilePath('APP_USERS_PATH', 'app/users.json');
}

function getUsersDbInfo() {
  if (useMysqlStorage()) {
    return { configured: true, source: 'mysql', persistent: true, mysql: getMysqlStorageSafeConfig() };
  }
  if (useSqliteStorage()) {
    return { configured: true, source: 'sqlite', persistent: true, sqlite: getSqliteStorageSafeConfig() };
  }

  const configured = process.env.APP_USERS_PATH?.trim();
  const source = configured ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
  const relativePath = configured || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'app/users.json');
  return buildFileStorageInfo(getUsersPath(), relativePath, source);
}


function getDisplayNamesPath() {
  return getStorageFilePath('APP_DISPLAY_NAMES_PATH', 'app/display-names.json');
}

function getDisplayNamesDbInfo() {
  if (useMysqlStorage()) {
    return { configured: true, source: 'mysql', persistent: true, mysql: getMysqlStorageSafeConfig() };
  }
  if (useSqliteStorage()) {
    return { configured: true, source: 'sqlite', persistent: true, sqlite: getSqliteStorageSafeConfig() };
  }

  const configured = process.env.APP_DISPLAY_NAMES_PATH?.trim();
  const source = configured ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
  const relativePath = configured || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'app/display-names.json');
  return buildFileStorageInfo(getDisplayNamesPath(), relativePath, source);
}

function getAppStorageStatus() {
  return {
    storage: getStoragePersistenceInfo(),
    files: {
      users: getUsersDbInfo(),
      displayNames: getDisplayNamesDbInfo(),
      stracker: getStrackerConfig()
    },
    recommendation: useMysqlStorage()
      ? 'Storage de app en MySQL. Usuarios, sesiones y alias sobreviven a deploys.'
      : useSqliteStorage()
        ? 'Storage SQLite local activo. Perfecto para pruebas locales; en Hostinger mantén APP_STORAGE_DRIVER=mysql.'
        : 'En Hostinger usa APP_DATA_DIR con una ruta fuera de nodejs, por ejemplo /home/TU_USUARIO/gc-persistent. Así los deploys no pisan usuarios ni alias.'
  };
}

function createEmptyDisplayNameStore(): DisplayNameStore {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

function sanitizeDisplayNameKind(value: unknown): DisplayNameKind | null {
  const kind = String(value ?? '').trim().toLowerCase();
  if (kind === 'drivers' || kind === 'pilots' || kind === 'pilot' || kind === 'player') return 'driver';
  if (kind === 'cars' || kind === 'coche' || kind === 'coches') return 'car';
  if (kind === 'tracks' || kind === 'circuit' || kind === 'circuito' || kind === 'circuitos') return 'track';
  if (kind === 'driver' || kind === 'car' || kind === 'track') return kind as DisplayNameKind;
  return null;
}

function normalizeDisplayNameKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function readDisplayNameStore(force = false): DisplayNameStore {
  if (useSqliteStorage()) {
    const cacheKey = `sqlite:${getAppSqlitePath()}`;
    if (!force && displayNameCache?.path === cacheKey) return displayNameCache.store;
    return createEmptyDisplayNameStore();
  }

  const filePath = getDisplayNamesPath();
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  const mtimeMs = stats?.mtimeMs ?? null;

  if (!force && displayNameCache && displayNameCache.path === filePath && displayNameCache.mtimeMs === mtimeMs) {
    return displayNameCache.store;
  }

  if (!stats) {
    const empty = createEmptyDisplayNameStore();
    displayNameCache = { path: filePath, mtimeMs: null, store: empty };
    return empty;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<DisplayNameStore>;
    const store: DisplayNameStore = {
      version: 1,
      updatedAt: String(parsed.updatedAt || stats.mtime.toISOString()),
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.map((entry: any) => ({
            id: String(entry.id || crypto.randomUUID()),
            kind: sanitizeDisplayNameKind(entry.kind) || 'driver',
            sourceId: Number.isFinite(Number(entry.sourceId)) ? Number(entry.sourceId) : null,
            sourceCode: compactNullableText(entry.sourceCode),
            sourceName: compactNullableText(entry.sourceName) || '',
            displayName: compactNullableText(entry.displayName) || '',
            notes: compactNullableText(entry.notes),
            enabled: entry.enabled !== false,
            createdAt: String(entry.createdAt || new Date().toISOString()),
            updatedAt: String(entry.updatedAt || new Date().toISOString())
          })).filter((entry) => entry.displayName.length > 0)
        : []
    };
    displayNameCache = { path: filePath, mtimeMs, store };
    return store;
  } catch (error) {
    console.error('[GC] Error leyendo display-names.json:', error);
    const empty = createEmptyDisplayNameStore();
    displayNameCache = { path: filePath, mtimeMs, store: empty };
    return empty;
  }
}

function writeDisplayNameStore(store: DisplayNameStore) {
  const nextStore = { ...store, version: 1 as const, updatedAt: new Date().toISOString() };

  if (useMysqlStorage() || useSqliteStorage()) {
    displayNameCache = { path: useMysqlStorage() ? 'mysql:gc_display_names' : `sqlite:${getAppSqlitePath()}`, mtimeMs: null, store: nextStore };
    void writeDisplayNameStoreAsync(nextStore).catch((error) => {
      console.error(`[GC] Error guardando display names en ${getAppStorageDriverLabel()}:`, error);
    });
    return;
  }

  const filePath = getDisplayNamesPath();
  ensureDirForFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
  displayNameCache = null;
}

async function readDisplayNameStoreAsync(force = false): Promise<DisplayNameStore> {
  if (!useMysqlStorage() && !useSqliteStorage()) return readDisplayNameStore(force);

  if (useSqliteStorage()) {
    const cacheKey = `sqlite:${getAppSqlitePath()}`;
    if (!force && displayNameCache?.path === cacheKey) return displayNameCache.store;

    const rows = await withAppSqliteDb((db) => sqliteQuery(db, 'SELECT * FROM gc_display_names ORDER BY kind ASC, display_name ASC'));
    const store: DisplayNameStore = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: rows.map((row: any) => ({
        id: String(row.id),
        kind: sanitizeDisplayNameKind(row.kind) || 'driver',
        sourceId: Number.isFinite(Number(row.source_id)) ? Number(row.source_id) : null,
        sourceCode: compactNullableText(row.source_code),
        sourceName: compactNullableText(row.source_name) || '',
        displayName: compactNullableText(row.display_name) || '',
        notes: compactNullableText(row.notes),
        enabled: row.enabled !== 0 && row.enabled !== false,
        createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
        updatedAt: mysqlDate(row.updated_at) || new Date().toISOString()
      })).filter((entry: DisplayNameEntry) => entry.displayName.length > 0)
    };

    displayNameCache = { path: cacheKey, mtimeMs: null, store };
    return store;
  }

  await ensureMysqlSchema();
  const rows = await mysqlQuery('SELECT * FROM gc_display_names ORDER BY kind ASC, display_name ASC');
  const store: DisplayNameStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: rows.map((row: any) => ({
      id: String(row.id),
      kind: sanitizeDisplayNameKind(row.kind) || 'driver',
      sourceId: Number.isFinite(Number(row.source_id)) ? Number(row.source_id) : null,
      sourceCode: compactNullableText(row.source_code),
      sourceName: compactNullableText(row.source_name) || '',
      displayName: compactNullableText(row.display_name) || '',
      notes: compactNullableText(row.notes),
      enabled: row.enabled !== 0 && row.enabled !== false,
      createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
      updatedAt: mysqlDate(row.updated_at) || new Date().toISOString()
    })).filter((entry: DisplayNameEntry) => entry.displayName.length > 0)
  };

  displayNameCache = { path: 'mysql:gc_display_names', mtimeMs: null, store };
  return store;
}

async function writeDisplayNameStoreAsync(store: DisplayNameStore) {
  const nextStore = { ...store, version: 1 as const, updatedAt: new Date().toISOString() };

  if (!useMysqlStorage() && !useSqliteStorage()) {
    writeDisplayNameStore(nextStore);
    return;
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db) => {
      db.run('BEGIN TRANSACTION');
      try {
        db.run('DELETE FROM gc_display_names');
        for (const entry of nextStore.entries) {
          db.run(
            `INSERT INTO gc_display_names
              (id, kind, source_id, source_code, source_name, display_name, notes, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.kind,
              entry.sourceId,
              entry.sourceCode,
              entry.sourceName,
              entry.displayName,
              entry.notes,
              entry.enabled ? 1 : 0,
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
    }, true);
    displayNameCache = { path: `sqlite:${getAppSqlitePath()}`, mtimeMs: null, store: nextStore };
    return;
  }

  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM gc_display_names');
    for (const entry of nextStore.entries) {
      await connection.query(
        `INSERT INTO gc_display_names
          (id, kind, source_id, source_code, source_name, display_name, notes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.kind,
          entry.sourceId,
          entry.sourceCode,
          entry.sourceName,
          entry.displayName,
          entry.notes,
          entry.enabled ? 1 : 0,
          isoToMysql(entry.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(entry.updatedAt) || isoToMysql(new Date().toISOString())
        ]
      );
    }
    await connection.commit();
    displayNameCache = { path: 'mysql:gc_display_names', mtimeMs: null, store: nextStore };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


function findDisplayNameEntry(store: DisplayNameStore, kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown) {
  const numericId = Number(sourceId);
  const hasId = Number.isFinite(numericId);
  const code = normalizeDisplayNameKey(sourceCode);
  const name = normalizeDisplayNameKey(sourceName);

  return store.entries.find((entry) => {
    if (!entry.enabled || entry.kind !== kind) return false;
    if (hasId && entry.sourceId !== null && Number(entry.sourceId) === numericId) return true;
    if (code && entry.sourceCode && normalizeDisplayNameKey(entry.sourceCode) === code) return true;
    if (name && normalizeDisplayNameKey(entry.sourceName) === name) return true;
    return false;
  }) ?? null;
}

function applyDisplayName(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown, fallback: string) {
  const entry = findDisplayNameEntry(readDisplayNameStore(), kind, sourceId, sourceCode, sourceName);
  return compactNullableText(entry?.displayName) || fallback;
}

function makeEntryId(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown) {
  const id = Number(sourceId);
  if (Number.isFinite(id)) return `${kind}:${id}`;
  const code = normalizeDisplayNameKey(sourceCode);
  if (code) return `${kind}:code:${code}`;
  return `${kind}:name:${normalizeDisplayNameKey(sourceName) || crypto.randomUUID()}`;
}

function cleanDisplayNameInput(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function autoTitleFromCode(value: unknown, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const cleaned = raw
    .replace(/\.(kn5|json|ini|txt)$/i, '')
    .replace(/^ks[_-]/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallback || raw;

  const dictionary: Record<string, string> = {
    ac: 'AC', abs: 'ABS', amg: 'AMG', audi: 'Audi', bmw: 'BMW', csp: 'CSP', cup: 'Cup', evo: 'Evo', f1: 'F1', gt: 'GT', gt1: 'GT1', gt2: 'GT2', gt3: 'GT3', gt4: 'GT4', gte: 'GTE', gr5: 'GR5', gtr: 'GTR', mx5: 'MX-5', nissan: 'Nissan', porsche: 'Porsche', rss: 'RSS', tatuus: 'Tatuus', toyota: 'Toyota', v8: 'V8', wrc: 'WRC'
  };

  return cleaned.split(' ').map((part) => {
    const lower = part.toLowerCase();
    if (dictionary[lower]) return dictionary[lower];
    if (/^[0-9]+$/.test(part)) return part;
    if (/^[a-z]+[0-9]+$/i.test(part)) return part.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function getRawDisplayCar(row: PlainObject) {
  return compactNullableText(row.UiCarName) ?? autoTitleFromCode(row.Car, 'Coche desconocido');
}

function getRawDisplayTrack(row: PlainObject) {
  return compactNullableText(row.UiTrackName) ?? autoTitleFromCode(row.Track, 'Circuito desconocido');
}

function getRawDriverName(row: PlainObject) {
  return compactNullableText(row.DriverName) ?? compactNullableText(row.Name) ?? 'Piloto desconocido';
}

function buildDisplayNameCatalogItem(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown, autoName: string, store = readDisplayNameStore()) {
  const entry = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);
  const displayName = compactNullableText(entry?.displayName) || autoName;
  return {
    kind,
    sourceId: numberOrNull(sourceId),
    sourceCode: compactNullableText(sourceCode),
    sourceName: compactNullableText(sourceName) || autoName,
    autoName,
    displayName,
    hasOverride: Boolean(entry),
    entryId: entry?.id ?? null,
    notes: entry?.notes ?? null,
    enabled: entry?.enabled ?? true
  };
}

function createEmptyUserStore(): AppUserStore {
  return {
    version: 1,
    users: [],
    sessions: []
  };
}

function readUserStore(): AppUserStore {
  const filePath = getUsersPath();
  if (!fs.existsSync(filePath)) return createEmptyUserStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<AppUserStore>;
    const store: AppUserStore = {
      version: 1,
      users: Array.isArray(parsed.users) ? parsed.users as AppUser[] : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions as AppSession[] : []
    };
    return pruneExpiredSessions(store);
  } catch (error) {
    console.error('[GC] Error leyendo users.json:', error);
    return createEmptyUserStore();
  }
}

function writeUserStore(store: AppUserStore) {
  const filePath = getUsersPath();
  ensureDirForFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}


async function readUserStoreAsync(): Promise<AppUserStore> {
  if (!useMysqlStorage() && !useSqliteStorage()) return readUserStore();

  if (useSqliteStorage()) {
    const userRows = await withAppSqliteDb((db) => sqliteQuery(db, 'SELECT * FROM gc_users ORDER BY created_at ASC'));
    const sessionRows = await withAppSqliteDb((db) => sqliteQuery(db, 'SELECT * FROM gc_sessions ORDER BY created_at ASC'));
    const store: AppUserStore = {
      version: 1,
      users: userRows.map((row: any) => ({
        id: String(row.id),
        email: String(row.email),
        displayName: String(row.display_name),
        role: row.role === 'admin' ? 'admin' : 'pilot',
        password: {
          algorithm: 'pbkdf2-sha256',
          iterations: Number(row.password_iterations),
          salt: String(row.password_salt),
          hash: String(row.password_hash)
        },
        pilotLink: row.pilot_player_id == null ? null : {
          playerId: Number(row.pilot_player_id),
          steamGuid: compactNullableText(row.pilot_steam_guid),
          strackerName: compactNullableText(row.pilot_stracker_name) || 'Piloto vinculado',
          linkedAt: mysqlDate(row.pilot_linked_at) || mysqlDate(row.updated_at) || new Date().toISOString()
        },
        createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
        updatedAt: mysqlDate(row.updated_at) || new Date().toISOString(),
        lastLoginAt: mysqlDate(row.last_login_at)
      })),
      sessions: sessionRows.map((row: any) => ({
        id: String(row.id),
        userId: String(row.user_id),
        tokenHash: String(row.token_hash),
        createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
        expiresAt: mysqlDate(row.expires_at) || new Date().toISOString(),
        lastSeenAt: mysqlDate(row.last_seen_at) || new Date().toISOString()
      }))
    };
    return pruneExpiredSessionsInMemory(store);
  }

  await ensureMysqlSchema();
  const userRows = await mysqlQuery('SELECT * FROM gc_users ORDER BY created_at ASC');
  const sessionRows = await mysqlQuery('SELECT * FROM gc_sessions ORDER BY created_at ASC');

  const store: AppUserStore = {
    version: 1,
    users: userRows.map((row: any) => ({
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      role: row.role === 'admin' ? 'admin' : 'pilot',
      password: {
        algorithm: 'pbkdf2-sha256',
        iterations: Number(row.password_iterations),
        salt: String(row.password_salt),
        hash: String(row.password_hash)
      },
      pilotLink: row.pilot_player_id == null ? null : {
        playerId: Number(row.pilot_player_id),
        steamGuid: compactNullableText(row.pilot_steam_guid),
        strackerName: compactNullableText(row.pilot_stracker_name) || 'Piloto vinculado',
        linkedAt: mysqlDate(row.pilot_linked_at) || mysqlDate(row.updated_at) || new Date().toISOString()
      },
      createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
      updatedAt: mysqlDate(row.updated_at) || new Date().toISOString(),
      lastLoginAt: mysqlDate(row.last_login_at)
    })),
    sessions: sessionRows.map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id),
      tokenHash: String(row.token_hash),
      createdAt: mysqlDate(row.created_at) || new Date().toISOString(),
      expiresAt: mysqlDate(row.expires_at) || new Date().toISOString(),
      lastSeenAt: mysqlDate(row.last_seen_at) || new Date().toISOString()
    }))
  };

  return pruneExpiredSessionsInMemory(store);
}

async function writeUserStoreAsync(store: AppUserStore) {
  if (!useMysqlStorage() && !useSqliteStorage()) {
    writeUserStore(store);
    return;
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db) => {
      db.run('BEGIN TRANSACTION');
      try {
        db.run('DELETE FROM gc_sessions');
        db.run('DELETE FROM gc_users');

        for (const user of store.users) {
          db.run(
            `INSERT INTO gc_users
              (id, email, display_name, role, password_algorithm, password_iterations, password_salt, password_hash,
               pilot_player_id, pilot_steam_guid, pilot_stracker_name, pilot_linked_at, created_at, updated_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id,
              user.email,
              user.displayName,
              user.role,
              user.password.algorithm,
              user.password.iterations,
              user.password.salt,
              user.password.hash,
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

        for (const session of store.sessions) {
          db.run(
            `INSERT INTO gc_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              session.id,
              session.userId,
              session.tokenHash,
              session.createdAt || new Date().toISOString(),
              session.expiresAt || new Date().toISOString(),
              session.lastSeenAt || new Date().toISOString()
            ]
          );
        }

        db.run('COMMIT');
      } catch (error) {
        db.run('ROLLBACK');
        throw error;
      }
    }, true);
    return;
  }

  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM gc_sessions');
    await connection.query('DELETE FROM gc_users');

    for (const user of store.users) {
      await connection.query(
        `INSERT INTO gc_users
          (id, email, display_name, role, password_algorithm, password_iterations, password_salt, password_hash,
           pilot_player_id, pilot_steam_guid, pilot_stracker_name, pilot_linked_at, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.email,
          user.displayName,
          user.role,
          user.password.algorithm,
          user.password.iterations,
          user.password.salt,
          user.password.hash,
          user.pilotLink?.playerId ?? null,
          user.pilotLink?.steamGuid ?? null,
          user.pilotLink?.strackerName ?? null,
          isoToMysql(user.pilotLink?.linkedAt),
          isoToMysql(user.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(user.updatedAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(user.lastLoginAt)
        ]
      );
    }

    for (const session of store.sessions) {
      await connection.query(
        `INSERT INTO gc_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.userId,
          session.tokenHash,
          isoToMysql(session.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(session.expiresAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(session.lastSeenAt) || isoToMysql(new Date().toISOString())
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function pruneExpiredSessionsInMemory(store: AppUserStore) {
  const now = Date.now();
  return { ...store, sessions: store.sessions.filter((session) => Date.parse(session.expiresAt) > now) };
}

function pruneExpiredSessions(store: AppUserStore) {
  const now = Date.now();
  const sessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  if (sessions.length !== store.sessions.length) {
    const next = { ...store, sessions };
    try {
      if (!useMysqlStorage() && !useSqliteStorage()) writeUserStore(next);
    } catch (_) {
      // no-op: no queremos tumbar la API por limpieza de sesiones
    }
    return next;
  }
  return store;
}

function getUserStoreStats() {
  if (useMysqlStorage()) {
    return {
      enabled: true,
      status: 'mysql_auth',
      message: 'Usuarios reales activos en MySQL/MariaDB.',
      db: getUsersDbInfo(),
      usersCount: null,
      sessionsCount: null,
      registrationEnabled: readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)
    };
  }

  if (useSqliteStorage()) {
    return {
      enabled: true,
      status: 'sqlite_auth',
      message: 'Usuarios reales activos en SQLite local.',
      db: getUsersDbInfo(),
      usersCount: null,
      sessionsCount: null,
      registrationEnabled: readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)
    };
  }

  const store = readUserStore();
  return {
    enabled: true,
    status: 'file_auth',
    message: 'Usuarios reales activos con storage local JSON. Migrable a MySQL/MariaDB.',
    db: getUsersDbInfo(),
    usersCount: store.users.length,
    sessionsCount: store.sessions.length,
    registrationEnabled: readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)
  };
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeDisplayName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 64);
}


async function getUserStoreStatsAsync() {
  if (!useMysqlStorage() && !useSqliteStorage()) return getUserStoreStats();
  const store = await readUserStoreAsync();
  return {
    enabled: true,
    status: useMysqlStorage() ? 'mysql_auth' : 'sqlite_auth',
    message: useMysqlStorage() ? 'Usuarios reales activos en MySQL/MariaDB.' : 'Usuarios reales activos en SQLite local.',
    db: getUsersDbInfo(),
    usersCount: store.users.length,
    sessionsCount: store.sessions.length,
    registrationEnabled: readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)
  };
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex'), iterations = 120000) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return {
    algorithm: 'pbkdf2-sha256' as const,
    iterations,
    salt,
    hash
  };
}

function safeTimingCompareHex(a: string, b: string) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password: string, stored: AppUser['password']) {
  if (!stored || stored.algorithm !== 'pbkdf2-sha256') return false;
  const next = hashPassword(password, stored.salt, stored.iterations);
  return safeTimingCompareHex(next.hash, stored.hash);
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getSessionDays() {
  return readNumberEnv('AUTH_SESSION_DAYS', 14, 1, 365);
}

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function readAuthToken(req: express.Request) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[sessionCookieName]) return cookies[sessionCookieName];

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

  return '';
}

function shouldUseSecureCookie() {
  const raw = String(process.env.AUTH_COOKIE_SECURE ?? 'auto').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return process.env.NODE_ENV === 'production';
}

function serializeSessionCookie(token: string, maxAgeSeconds: number) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];

  if (shouldUseSecureCookie()) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res: express.Response, token: string) {
  res.setHeader('Set-Cookie', serializeSessionCookie(token, getSessionDays() * 24 * 60 * 60));
}

function clearSessionCookie(res: express.Response) {
  res.setHeader('Set-Cookie', serializeSessionCookie('', 0));
}

function createSession(store: AppUserStore, userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getSessionDays() * 24 * 60 * 60 * 1000).toISOString();

  const session: AppSession = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: tokenHash(token),
    createdAt: now.toISOString(),
    expiresAt,
    lastSeenAt: now.toISOString()
  };

  store.sessions.push(session);
  return { token, session };
}

function getAuthContext(req: express.Request) {
  const token = readAuthToken(req);
  if (!token) return null;

  const store = readUserStore();
  const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;

  const user = store.users.find((item) => item.id === session.userId);
  if (!user) return null;

  session.lastSeenAt = new Date().toISOString();
  try {
    writeUserStore(store);
  } catch (_) {
    // no-op
  }

  return { store, user, session, token };
}


async function getAuthContextAsync(req: express.Request) {
  const token = readAuthToken(req);
  if (!token) return null;

  const store = await readUserStoreAsync();
  const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;

  const user = store.users.find((item) => item.id === session.userId);
  if (!user) return null;

  session.lastSeenAt = new Date().toISOString();
  try {
    await writeUserStoreAsync(store);
  } catch (_) {
    // no-op
  }

  return { store, user, session, token };
}

function publicUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    pilotLink: user.pilotLink,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}


function isAdminUser(user: AppUser | null | undefined) {
  return Boolean(user && user.role === 'admin');
}

function getAdminSetupSecret() {
  return process.env.ADMIN_SETUP_SECRET?.trim() || process.env.STRACKER_SYNC_SECRET?.trim() || '';
}

function assertAdminSetupSecret(req: express.Request) {
  const expected = getAdminSetupSecret();
  const provided = readRequestSecret(req);
  return Boolean(expected && provided && expected === provided);
}

async function getCurrentAdminOrSecret(req: express.Request) {
  const context = await getAuthContextAsync(req);
  if (context && isAdminUser(context.user)) {
    return { ok: true as const, context, via: 'session' as const };
  }

  if (assertAdminSetupSecret(req)) {
    return { ok: true as const, context, via: 'setup-secret' as const };
  }

  return {
    ok: false as const,
    context,
    via: 'none' as const,
    message: context
      ? 'Tu cuenta no tiene permisos de administrador.'
      : 'Necesitas iniciar sesión con una cuenta admin.'
  };
}

function countSessionsForUser(store: AppUserStore, userId: string) {
  return store.sessions.filter((session) => session.userId === userId && Date.parse(session.expiresAt) > Date.now()).length;
}

function publicAdminUser(user: AppUser, store: AppUserStore) {
  return {
    ...publicUser(user),
    activeSessions: countSessionsForUser(store, user.id),
    hasPassword: Boolean(user.password?.hash),
    linkedPilotName: user.pilotLink?.strackerName ?? null,
    linkedPlayerId: user.pilotLink?.playerId ?? null
  };
}

function getUserStoreAdminSummary(store = readUserStore()) {
  const admins = store.users.filter((user) => user.role === 'admin');
  const linkedUsers = store.users.filter((user) => Boolean(user.pilotLink));
  const activeSessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());

  return {
    usersCount: store.users.length,
    adminsCount: admins.length,
    linkedUsersCount: linkedUsers.length,
    unlinkedUsersCount: store.users.length - linkedUsers.length,
    activeSessionsCount: activeSessions.length,
    setupRequired: admins.length === 0,
    storage: getUsersDbInfo()
  };
}

async function requireAdmin(req: express.Request, res: express.Response) {
  const context = await getAuthContextAsync(req);

  if (!context) {
    res.status(401).json({
      ok: false,
      authenticated: false,
      authorized: false,
      message: 'Necesitas iniciar sesión para entrar en administración.'
    });
    return null;
  }

  if (!isAdminUser(context.user)) {
    res.status(403).json({
      ok: false,
      authenticated: true,
      authorized: false,
      user: publicUser(context.user),
      message: 'Tu cuenta no tiene permisos de administrador.'
    });
    return null;
  }

  return context;
}

function findUserById(store: AppUserStore, userId: string) {
  return store.users.find((user) => user.id === userId) ?? null;
}

function isLastAdmin(store: AppUserStore, userId: string) {
  const admins = store.users.filter((user) => user.role === 'admin');
  return admins.length <= 1 && admins.some((user) => user.id === userId);
}

function findUserByEmail(store: AppUserStore, email: string) {
  return store.users.find((user) => user.email === email) ?? null;
}

function findUserByPilotId(store: AppUserStore, playerId: number, exceptUserId?: string) {
  return store.users.find((user) => user.id !== exceptUserId && user.pilotLink?.playerId === playerId) ?? null;
}

let syncInProgress = false;
let lastSyncResult: null | {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  sizeBytes?: number;
  savedPath?: string;
  backupPath?: string | null;
  error?: string;
} = null;

let autoSyncTimer: NodeJS.Timeout | null = null;
let nextAutoSyncAt: string | null = null;
let autoSyncRunCount = 0;
let autoSyncFailureCount = 0;
let lastAutoSyncResult: null | {
  ok: boolean;
  reason: 'startup' | 'scheduled' | 'manual';
  startedAt: string;
  finishedAt: string;
  message: string;
  statusCode?: number;
  sync?: typeof lastSyncResult;
  error?: string;
} = null;

function resolveProjectPath(value: string | undefined | null) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function fileExists(filePath: string | null) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function isSQLiteFile(filePath: string) {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    return bytesRead === 16 && header.toString('utf8') === 'SQLite format 3\u0000';
  } finally {
    fs.closeSync(fd);
  }
}

function getStrackerConfig() {
  const envPath = process.env.STRACKER_DB_PATH?.trim();
  const source = envPath ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
  const configuredPath = envPath || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'stracker/stracker.db3');
  const resolvedPath = envPath ? resolveProjectPath(envPath) : path.join(getAppDataRoot(), 'stracker/stracker.db3');
  const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;
  const stats = exists && resolvedPath ? fs.statSync(resolvedPath) : null;

  return {
    configured: Boolean(configuredPath),
    source,
    relativePath: configuredPath,
    resolvedPath,
    exists,
    validSQLite: resolvedPath && exists ? isSQLiteFile(resolvedPath) : false,
    sizeBytes: stats?.size ?? 0,
    modifiedAt: stats?.mtime?.toISOString?.() ?? null
  };
}

function getRemoteStrackerConfig() {
  const host = process.env.GTX_SFTP_HOST ?? '';
  const port = Number(process.env.GTX_SFTP_PORT ?? 22);
  const username = process.env.GTX_SFTP_USER ?? '';
  const password = process.env.GTX_SFTP_PASS ?? '';
  const remotePath = process.env.GTX_STRACKER_REMOTE_PATH ?? '';
  const secret = process.env.STRACKER_SYNC_SECRET ?? '';

  return {
    configured: Boolean(host && username && password && remotePath && secret),
    host: host ? host : null,
    port,
    usernameConfigured: Boolean(username),
    passwordConfigured: Boolean(password),
    remotePath: remotePath ? remotePath : null,
    secretConfigured: Boolean(secret),
    target: getStrackerConfig()
  };
}

function readBooleanEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function getAutoSyncConfig() {
  const enabled = readBooleanEnv('STRACKER_AUTO_SYNC_ENABLED', false);
  const intervalMinutes = readNumberEnv('STRACKER_AUTO_SYNC_INTERVAL_MINUTES', 5, 1, 24 * 60);
  const initialDelaySeconds = readNumberEnv('STRACKER_AUTO_SYNC_INITIAL_DELAY_SECONDS', 30, 0, 60 * 60);
  const remote = getRemoteStrackerConfig();

  return {
    enabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    initialDelaySeconds,
    initialDelayMs: initialDelaySeconds * 1000,
    canRun: enabled && remote.configured,
    remoteConfigured: remote.configured,
    nextAutoSyncAt,
    syncInProgress,
    runCount: autoSyncRunCount,
    failureCount: autoSyncFailureCount,
    lastAutoSync: lastAutoSyncResult,
    message: enabled
      ? remote.configured
        ? `Auto-sync activo cada ${intervalMinutes} minutos.`
        : 'Auto-sync activado, pero faltan variables SFTP/secret.'
      : 'Auto-sync desactivado. Activa STRACKER_AUTO_SYNC_ENABLED=true.'
  };
}

function scheduleNextAutoSync(delayMs: number) {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  nextAutoSyncAt = new Date(Date.now() + delayMs).toISOString();
  autoSyncTimer = setTimeout(() => {
    void runAutoSyncCycle('scheduled');
  }, delayMs);

  if (typeof autoSyncTimer.unref === 'function') {
    autoSyncTimer.unref();
  }
}

async function runAutoSyncCycle(reason: 'startup' | 'scheduled' | 'manual' = 'scheduled') {
  const config = getAutoSyncConfig();

  if (!config.enabled) {
    nextAutoSyncAt = null;
    return;
  }

  if (!config.remoteConfigured) {
    console.warn('[GC] Auto-sync activado, pero faltan variables SFTP o STRACKER_SYNC_SECRET.');
    lastAutoSyncResult = {
      ok: false,
      reason,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: 'Faltan variables SFTP o STRACKER_SYNC_SECRET para ejecutar auto-sync.',
      statusCode: 400
    };
    autoSyncFailureCount += 1;
    scheduleNextAutoSync(config.intervalMs);
    return;
  }

  const started = new Date().toISOString();
  autoSyncRunCount += 1;
  console.log(`[GC] Auto-sync stracker iniciado (${reason}).`);

  try {
    const result = await syncStrackerFromGTX();
    const ok = Boolean(result.ok);
    if (!ok) autoSyncFailureCount += 1;

    lastAutoSyncResult = {
      ok,
      reason,
      startedAt: started,
      finishedAt: new Date().toISOString(),
      message: result.message,
      statusCode: result.statusCode,
      sync: lastSyncResult,
      error: ok ? undefined : result.sync?.error
    };

    console.log(`[GC] Auto-sync stracker finalizado: ${ok ? 'OK' : 'ERROR'} - ${result.message}`);
  } catch (error) {
    autoSyncFailureCount += 1;
    lastAutoSyncResult = {
      ok: false,
      reason,
      startedAt: started,
      finishedAt: new Date().toISOString(),
      message: 'Auto-sync falló con una excepción no esperada.',
      statusCode: 500,
      error: error instanceof Error ? error.message : String(error)
    };
    console.error('[GC] Auto-sync stracker exception:', error);
  } finally {
    scheduleNextAutoSync(getAutoSyncConfig().intervalMs);
  }
}

function startAutoSyncScheduler() {
  const config = getAutoSyncConfig();

  if (!config.enabled) {
    console.log('[GC] Auto-sync stracker desactivado.');
    return;
  }

  if (!config.remoteConfigured) {
    console.warn('[GC] Auto-sync stracker activado, pero faltan variables de entorno SFTP/secret.');
  }

  console.log(`[GC] Auto-sync stracker programado cada ${config.intervalMinutes} minutos.`);
  scheduleNextAutoSync(config.initialDelayMs);
}

function getModules() {
  const stracker = getStrackerConfig();
  const remote = getRemoteStrackerConfig();

  return {
    web: {
      enabled: true,
      status: fs.existsSync(distDir) ? 'active' : 'missing_dist',
      message: fs.existsSync(distDir)
        ? 'Web Astro estática servida desde dist.'
        : 'No existe dist todavía. Revisa que el build haya terminado.'
    },
    api: {
      enabled: true,
      status: 'active',
      message: 'API Express activa en modo Hostinger seguro.'
    },
    discord: {
      enabled: discordEnabled,
      status: discordEnabled ? 'configured_later' : 'disabled',
      message: discordEnabled
        ? 'Discord marcado como activo, pero el bot real no arranca todavía.'
        : 'Discord apagado en este despliegue.'
    },
    stracker: {
      enabled: stracker.exists,
      status: stracker.exists ? 'file_detected' : 'waiting_sync',
      message: stracker.exists
        ? 'stracker.db3 detectado. Endpoints reales activos: /api/hotlaps, /api/drivers, /api/cars, /api/tracks.'
        : 'stracker preparado. Sincroniza desde GTX con /api/stracker/sync.',
      db: stracker,
      remote,
      autoSync: getAutoSyncConfig()
    },
    users: getUserStoreStats()
  };
}

function safeSqlValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function getOneQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return getOneQueryValue(value[0]);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function getQueryString(req: express.Request, name: string, fallback = '') {
  return getOneQueryValue(req.query[name])?.trim() ?? fallback;
}

function getQueryNumber(req: express.Request, name: string, fallback: number, min?: number, max?: number) {
  const raw = getOneQueryValue(req.query[name]);
  const parsed = Number(raw);
  let value = Number.isFinite(parsed) ? parsed : fallback;
  if (typeof min === 'number') value = Math.max(min, value);
  if (typeof max === 'number') value = Math.min(max, value);
  return value;
}

function getQueryBool(req: express.Request, name: string, fallback: boolean) {
  const raw = getOneQueryValue(req.query[name]);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function includesFilter(value: unknown, filter: string) {
  const normalizedFilter = normalizeText(filter);
  if (!normalizedFilter) return true;
  return normalizeText(value).includes(normalizedFilter);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lapTimeToText(msValue: unknown) {
  const ms = Number(msValue);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function unixToIso(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const millis = numeric > 1000000000000 ? numeric : numeric * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function compactNullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function getDisplayCar(row: PlainObject) {
  const fallback = getRawDisplayCar(row);
  return applyDisplayName('car', row.CarId, row.Car, fallback, fallback);
}

function getDisplayTrack(row: PlainObject) {
  const fallback = getRawDisplayTrack(row);
  return applyDisplayName('track', row.TrackId, row.Track, fallback, fallback);
}

function getDriverName(row: PlainObject) {
  const fallback = getRawDriverName(row);
  return applyDisplayName('driver', row.PlayerId, row.SteamGuid, fallback, fallback);
}

function toObjects(result: any) {
  const first = result?.[0];
  if (!first) return [];
  const columns = first.columns ?? [];
  return (first.values ?? []).map((row: unknown[]) =>
    Object.fromEntries(columns.map((column: string, index: number) => [column, safeSqlValue(row[index])]))
  ) as PlainObject[];
}

async function withStrackerDb<T>(dbPath: string, callback: (db: SqlJsDatabase) => T | Promise<T>) {
  const initSqlJsModule = await import('sql.js');
  const initSqlJs = initSqlJsModule.default;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

async function runStrackerQuery(dbPath: string, sql: string) {
  return withStrackerDb(dbPath, (db) => toObjects(db.exec(sql)));
}

function getSafeStrackerOrRespond(res: express.Response) {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.status(200).json({
      ok: false,
      stracker,
      message: stracker.exists
        ? 'stracker.db3 existe, pero no parece SQLite válido.'
        : 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
    });
    return null;
  }

  return stracker;
}

async function readStrackerTables(dbPath: string) {
  return withStrackerDb(dbPath, (db) => {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const names = tableResult[0]?.values?.map((row: unknown[]) => String(row[0])) ?? [];

    const tables = names.map((name: string) => {
      let columns: Array<{ name: string; type: string | null; notNull: boolean; primaryKey: boolean }> = [];
      let rowCount: number | null = null;

      try {
        const escapedName = name.replaceAll('"', '""');
        const pragma = db.exec(`PRAGMA table_info("${escapedName}")`);
        columns =
          pragma[0]?.values?.map((row: unknown[]) => ({
            name: String(row[1]),
            type: row[2] ? String(row[2]) : null,
            notNull: Boolean(row[3]),
            primaryKey: Boolean(row[5])
          })) ?? [];
      } catch (error) {
        columns = [];
      }

      try {
        const escapedName = name.replaceAll('"', '""');
        const countResult = db.exec(`SELECT COUNT(*) AS total FROM "${escapedName}"`);
        rowCount = Number(countResult[0]?.values?.[0]?.[0] ?? 0);
      } catch (error) {
        rowCount = null;
      }

      return {
        name,
        rowCount,
        columns
      };
    });

    return tables;
  });
}

async function previewStrackerTable(dbPath: string, tableName: string, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 25));

  return withStrackerDb(dbPath, (db) => {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const allowedTables = tableResult[0]?.values?.map((row: unknown[]) => String(row[0])) ?? [];

    if (!allowedTables.includes(tableName)) {
      return {
        ok: false,
        columns: [],
        rows: [],
        message: `La tabla ${tableName} no existe en stracker.db3.`
      };
    }

    const escapedName = tableName.replaceAll('"', '""');
    const result = db.exec(`SELECT * FROM "${escapedName}" LIMIT ${safeLimit}`);
    const columns = result[0]?.columns ?? [];
    const rows =
      result[0]?.values?.map((row: unknown[]) =>
        Object.fromEntries(columns.map((column: string, index: number) => [column, safeSqlValue(row[index])]))
      ) ?? [];

    return {
      ok: true,
      columns,
      rows,
      limit: safeLimit,
      message: `Preview de ${tableName} generado correctamente.`
    };
  });
}

function readRequestSecret(req: express.Request) {
  const headerSecret = req.headers['x-gc-secret'];
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : null;
  const bodySecret = typeof req.body?.secret === 'string' ? req.body.secret : null;

  if (typeof headerSecret === 'string' && headerSecret.trim()) return headerSecret;
  if (bearer && bearer.trim()) return bearer;
  if (bodySecret && bodySecret.trim()) return bodySecret;
  if (querySecret && querySecret.trim()) return querySecret;
  return '';
}

function assertSyncSecret(req: express.Request) {
  const expected = process.env.STRACKER_SYNC_SECRET ?? '';
  const provided = readRequestSecret(req);

  return Boolean(expected && provided && expected === provided);
}

async function syncStrackerFromGTX() {
  if (syncInProgress) {
    return {
      ok: false,
      statusCode: 409,
      message: 'Ya hay una sincronización en curso.'
    };
  }

  const started = new Date().toISOString();
  const remote = getRemoteStrackerConfig();
  const target = getStrackerConfig();

  if (!remote.configured) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Faltan variables GTX_SFTP_HOST, GTX_SFTP_PORT, GTX_SFTP_USER, GTX_SFTP_PASS, GTX_STRACKER_REMOTE_PATH o STRACKER_SYNC_SECRET.',
      remote
    };
  }

  if (!target.resolvedPath) {
    return {
      ok: false,
      statusCode: 400,
      message: 'No se pudo resolver la ruta local de stracker.db3.'
    };
  }

  syncInProgress = true;
  ensureDirForFile(target.resolvedPath);

  const tempPath = `${target.resolvedPath}.download`;
  const backupPath = fileExists(target.resolvedPath)
    ? `${target.resolvedPath}.backup-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`
    : null;

  let sftp: any = null;

  try {
    const sftpModule = await import('ssh2-sftp-client');
    const SftpClient = sftpModule.default;
    sftp = new SftpClient('grasscutters-stracker-sync');

    await sftp.connect({
      host: process.env.GTX_SFTP_HOST,
      port: Number(process.env.GTX_SFTP_PORT ?? 22),
      username: process.env.GTX_SFTP_USER,
      password: process.env.GTX_SFTP_PASS,
      readyTimeout: Number(process.env.GTX_SFTP_TIMEOUT_MS ?? 20000)
    });

    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    await sftp.fastGet(process.env.GTX_STRACKER_REMOTE_PATH, tempPath);

    const stats = fs.statSync(tempPath);

    if (stats.size < 100) {
      throw new Error(`Archivo descargado demasiado pequeño: ${stats.size} bytes.`);
    }

    if (!isSQLiteFile(tempPath)) {
      throw new Error('El archivo descargado no parece SQLite válido. Cabecera incorrecta.');
    }

    if (backupPath && fs.existsSync(target.resolvedPath)) {
      fs.copyFileSync(target.resolvedPath, backupPath);
    }

    fs.renameSync(tempPath, target.resolvedPath);

    const finished = new Date().toISOString();
    lastSyncResult = {
      ok: true,
      startedAt: started,
      finishedAt: finished,
      sizeBytes: stats.size,
      savedPath: target.relativePath,
      backupPath: backupPath ? path.relative(rootDir, backupPath) : null
    };

    return {
      ok: true,
      statusCode: 200,
      message: 'stracker.db3 sincronizado correctamente desde GTX.',
      sync: lastSyncResult,
      stracker: getStrackerConfig()
    };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {
        // no-op
      }
    }

    const finished = new Date().toISOString();
    lastSyncResult = {
      ok: false,
      startedAt: started,
      finishedAt: finished,
      error: error instanceof Error ? error.message : String(error)
    };

    return {
      ok: false,
      statusCode: 500,
      message: 'No se pudo sincronizar stracker.db3 desde GTX.',
      sync: lastSyncResult
    };
  } finally {
    syncInProgress = false;
    if (sftp) {
      try {
        await sftp.end();
      } catch (_) {
        // no-op
      }
    }
  }
}

const joinedLapsSql = `
  SELECT
    L.LapId,
    L.PlayerInSessionId,
    L.TyreCompoundId,
    L.LapCount,
    L.SessionTime,
    L.LapTime,
    L.SectorTime0,
    L.SectorTime1,
    L.SectorTime2,
    L.SectorTime3,
    L.SectorTime4,
    L.SectorTime5,
    L.SectorTime6,
    L.SectorTime7,
    L.SectorTime8,
    L.SectorTime9,
    L.FuelRatio,
    L.Valid,
    L.SectorsAreSoftSplits,
    L.MaxABS,
    L.MaxTC,
    L.TemperatureAmbient,
    L.TemperatureTrack,
    L.Timestamp,
    L.AidABS,
    L.AidTC,
    L.AidAutoBlib,
    L.AidAutoBrake,
    L.AidAutoClutch,
    L.AidAutoShift,
    L.AidIdealLine,
    L.AidStabilityControl,
    L.AidSlipStream,
    L.AidTyreBlankets,
    L.MaxSpeed_KMH,
    L.TimeInPitLane,
    L.TimeInPit,
    L.ESCPressed,
    L.Cuts,
    L.CollisionsCar,
    L.CollisionsEnv,
    L.GripLevel,
    L.Ballast,
    P.PlayerId,
    P.Name AS DriverName,
    P.SteamGuid,
    P.IsOnline,
    P.Whitelisted,
    P.Anonymized,
    PIS.CarId,
    PIS.SessionId,
    PIS.ACVersion,
    PIS.InputMethod,
    PIS.Shifter,
    C.Car,
    C.UiCarName,
    C.Brand,
    S.TrackId,
    S.SessionType,
    S.Multiplayer,
    S.ServerIpPort,
    S.StartTimeDate,
    S.EndTimeDate,
    S.ComboId,
    T.Track,
    T.UiTrackName,
    T.Length AS TrackLength
  FROM Lap L
  LEFT JOIN PlayerInSession PIS ON PIS.PlayerInSessionId = L.PlayerInSessionId
  LEFT JOIN Players P ON P.PlayerId = PIS.PlayerId
  LEFT JOIN Cars C ON C.CarId = PIS.CarId
  LEFT JOIN Session S ON S.SessionId = PIS.SessionId
  LEFT JOIN Tracks T ON T.TrackId = S.TrackId
  WHERE L.LapTime IS NOT NULL AND L.LapTime > 0
`;

function cleanSectorTimes(row: PlainObject) {
  const lapMs = Number(row.LapTime);
  const maxReasonableSector = Number.isFinite(lapMs) && lapMs > 0 ? lapMs : 30 * 60 * 1000;
  const values = [
    row.SectorTime0,
    row.SectorTime1,
    row.SectorTime2,
    row.SectorTime3,
    row.SectorTime4,
    row.SectorTime5,
    row.SectorTime6,
    row.SectorTime7,
    row.SectorTime8,
    row.SectorTime9
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= maxReasonableSector && value < 30 * 60 * 1000);

  return values;
}

function mapLapRow(row: PlainObject) {
  const sectorTimes = cleanSectorTimes(row);

  return {
    lapId: numberOrNull(row.LapId),
    playerInSessionId: numberOrNull(row.PlayerInSessionId),
    sessionId: numberOrNull(row.SessionId),
    comboId: numberOrNull(row.ComboId),
    playerId: numberOrNull(row.PlayerId),
    driverId: numberOrNull(row.PlayerId),
    driverName: getDriverName(row),
    playerName: getDriverName(row),
    steamGuid: compactNullableText(row.SteamGuid),
    carId: numberOrNull(row.CarId),
    carCode: compactNullableText(row.Car),
    carName: getDisplayCar(row),
    uiCarName: compactNullableText(row.UiCarName),
    brand: compactNullableText(row.Brand),
    trackId: numberOrNull(row.TrackId),
    trackCode: compactNullableText(row.Track),
    trackName: getDisplayTrack(row),
    uiTrackName: compactNullableText(row.UiTrackName),
    trackLength: numberOrNull(row.TrackLength),
    sessionType: compactNullableText(row.SessionType),
    driver: {
      id: numberOrNull(row.PlayerId),
      name: getDriverName(row),
      steamGuid: compactNullableText(row.SteamGuid),
      isOnline: compactNullableText(row.IsOnline),
      whitelisted: numberOrNull(row.Whitelisted),
      anonymized: numberOrNull(row.Anonymized)
    },
    car: {
      id: numberOrNull(row.CarId),
      code: compactNullableText(row.Car),
      name: getDisplayCar(row),
      uiName: compactNullableText(row.UiCarName),
      brand: compactNullableText(row.Brand)
    },
    track: {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: getDisplayTrack(row),
      uiName: compactNullableText(row.UiTrackName),
      length: numberOrNull(row.TrackLength)
    },
    lapTimeMs: numberOrNull(row.LapTime),
    lapTime: lapTimeToText(row.LapTime),
    lapTimeFormatted: lapTimeToText(row.LapTime),
    valid: Number(row.Valid) === 1,
    isValid: Number(row.Valid) === 1,
    cuts: numberOrNull(row.Cuts),
    collisionsCar: numberOrNull(row.CollisionsCar),
    collisionsEnv: numberOrNull(row.CollisionsEnv),
    maxSpeedKmh: numberOrNull(row.MaxSpeed_KMH),
    sectorTimesMs: sectorTimes,
    sectorTimes: sectorTimes.map(lapTimeToText),
    sector1Ms: sectorTimes[0] ?? null,
    sector2Ms: sectorTimes[1] ?? null,
    sector3Ms: sectorTimes[2] ?? null,
    sector1: sectorTimes[0] ? lapTimeToText(sectorTimes[0]) : '--',
    sector2: sectorTimes[1] ? lapTimeToText(sectorTimes[1]) : '--',
    sector3: sectorTimes[2] ? lapTimeToText(sectorTimes[2]) : '--',
    fuelRatio: numberOrNull(row.FuelRatio),
    gripLevel: numberOrNull(row.GripLevel),
    ballast: numberOrNull(row.Ballast),
    temperatureAmbient: numberOrNull(row.TemperatureAmbient),
    temperatureTrack: numberOrNull(row.TemperatureTrack),
    timestamp: numberOrNull(row.Timestamp),
    timestampIso: unixToIso(row.Timestamp),
    session: {
      type: compactNullableText(row.SessionType),
      multiplayer: numberOrNull(row.Multiplayer),
      server: compactNullableText(row.ServerIpPort),
      startTime: numberOrNull(row.StartTimeDate),
      startTimeIso: unixToIso(row.StartTimeDate),
      endTime: numberOrNull(row.EndTimeDate),
      endTimeIso: unixToIso(row.EndTimeDate)
    },
    aids: {
      abs: numberOrNull(row.AidABS),
      tc: numberOrNull(row.AidTC),
      autoBlib: numberOrNull(row.AidAutoBlib),
      autoBrake: numberOrNull(row.AidAutoBrake),
      autoClutch: numberOrNull(row.AidAutoClutch),
      autoShift: numberOrNull(row.AidAutoShift),
      idealLine: numberOrNull(row.AidIdealLine),
      stabilityControl: numberOrNull(row.AidStabilityControl),
      slipStream: numberOrNull(row.AidSlipStream),
      tyreBlankets: numberOrNull(row.AidTyreBlankets)
    },
    input: {
      method: compactNullableText(row.InputMethod),
      shifter: numberOrNull(row.Shifter)
    }
  };
}

async function readJoinedLaps(dbPath: string) {
  await readDisplayNameStoreAsync();
  const rows = await runStrackerQuery(dbPath, `${joinedLapsSql} ORDER BY L.LapTime ASC`);
  return rows.map(mapLapRow);
}

function filterLaps(laps: ReturnType<typeof mapLapRow>[], req: express.Request, defaults?: { validOnly?: boolean }) {
  const validParam = getQueryString(req, 'valid', defaults?.validOnly === false ? 'all' : '1').toLowerCase();
  const validOnly = !['all', 'any', '0', 'false', 'no'].includes(validParam);
  const includeInvalidOnly = ['invalid', 'false-only'].includes(validParam);
  const driverFilter = getQueryString(req, 'driver') || getQueryString(req, 'pilot') || getQueryString(req, 'player');
  const carFilter = getQueryString(req, 'car') || getQueryString(req, 'coche');
  const trackFilter = getQueryString(req, 'track') || getQueryString(req, 'circuit');
  const brandFilter = getQueryString(req, 'brand') || getQueryString(req, 'marca');
  const sessionTypeFilter = getQueryString(req, 'sessionType') || getQueryString(req, 'session');
  const playerId = getQueryNumber(req, 'playerId', NaN);
  const carId = getQueryNumber(req, 'carId', NaN);
  const trackId = getQueryNumber(req, 'trackId', NaN);
  const comboId = getQueryNumber(req, 'comboId', NaN);
  const sinceHours = getQueryNumber(req, 'sinceHours', NaN, 1, 24 * 365 * 10);
  const now = Date.now();

  return laps.filter((lap) => {
    if (validOnly && !lap.valid) return false;
    if (includeInvalidOnly && lap.valid) return false;
    if (Number.isFinite(playerId) && lap.driver.id !== playerId) return false;
    if (Number.isFinite(carId) && lap.car.id !== carId) return false;
    if (Number.isFinite(trackId) && lap.track.id !== trackId) return false;
    if (Number.isFinite(comboId) && lap.comboId !== comboId) return false;
    if (driverFilter && !includesFilter(lap.driver.name, driverFilter)) return false;
    if (carFilter && !includesFilter(`${lap.car.name} ${lap.car.code}`, carFilter)) return false;
    if (trackFilter && !includesFilter(`${lap.track.name} ${lap.track.code}`, trackFilter)) return false;
    if (brandFilter && !includesFilter(lap.car.brand, brandFilter)) return false;
    if (sessionTypeFilter && !includesFilter(lap.session.type, sessionTypeFilter)) return false;

    if (Number.isFinite(sinceHours)) {
      const timestampMs = lap.timestamp ? lap.timestamp * 1000 : null;
      if (!timestampMs || now - timestampMs > sinceHours * 60 * 60 * 1000) return false;
    }

    return true;
  });
}

function makeBestHotlaps(laps: ReturnType<typeof mapLapRow>[], groupMode: string) {
  if (groupMode === 'laps' || groupMode === 'raw' || groupMode === 'all') {
    return [...laps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  }

  const bestMap = new Map<string, ReturnType<typeof mapLapRow>>();

  for (const lap of laps) {
    const key = groupMode === 'driver'
      ? `${lap.driver.id ?? lap.driver.name}`
      : groupMode === 'driver-track'
        ? `${lap.driver.id ?? lap.driver.name}|${lap.track.id ?? lap.track.name}`
        : groupMode === 'car-track'
          ? `${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`
          : `${lap.driver.id ?? lap.driver.name}|${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`;

    const current = bestMap.get(key);
    if (!current || Number(lap.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      bestMap.set(key, lap);
    }
  }

  return Array.from(bestMap.values()).sort(
    (a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity)
  );
}

function buildOptionsFromLaps(laps: ReturnType<typeof mapLapRow>[]) {
  const cars = new Map<string, unknown>();
  const tracks = new Map<string, unknown>();
  const drivers = new Map<string, unknown>();

  for (const lap of laps) {
    if (lap.car.id !== null) cars.set(String(lap.car.id), lap.car);
    if (lap.track.id !== null) tracks.set(String(lap.track.id), lap.track);
    if (lap.driver.id !== null) drivers.set(String(lap.driver.id), lap.driver);
  }

  return {
    drivers: Array.from(drivers.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    cars: Array.from(cars.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    tracks: Array.from(tracks.values()).sort((a: any, b: any) => a.name.localeCompare(b.name))
  };
}

function summarizeFilters(req: express.Request) {
  return {
    valid: getQueryString(req, 'valid', '1'),
    driver: getQueryString(req, 'driver') || getQueryString(req, 'pilot') || getQueryString(req, 'player') || null,
    playerId: getQueryString(req, 'playerId') || null,
    car: getQueryString(req, 'car') || getQueryString(req, 'coche') || null,
    carId: getQueryString(req, 'carId') || null,
    track: getQueryString(req, 'track') || getQueryString(req, 'circuit') || null,
    trackId: getQueryString(req, 'trackId') || null,
    comboId: getQueryString(req, 'comboId') || null,
    brand: getQueryString(req, 'brand') || getQueryString(req, 'marca') || null,
    sessionType: getQueryString(req, 'sessionType') || getQueryString(req, 'session') || null,
    sinceHours: getQueryString(req, 'sinceHours') || null
  };
}

function reduceDriverStats(laps: ReturnType<typeof mapLapRow>[]) {
  const map = new Map<string, any>();

  for (const lap of laps) {
    const id = String(lap.driver.id ?? lap.driver.name);
    if (!map.has(id)) {
      map.set(id, {
        id: lap.driver.id,
        name: lap.driver.name,
        steamGuid: lap.driver.steamGuid,
        isOnline: lap.driver.isOnline,
        totalLaps: 0,
        validLaps: 0,
        invalidLaps: 0,
        bestLapMs: null,
        bestLap: null,
        bestLapDetails: null,
        lastSeenTimestamp: null,
        lastSeenAt: null,
        cars: new Map(),
        tracks: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    else entry.invalidLaps += 1;

    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
      entry.bestLapDetails = {
        lapId: lap.lapId,
        car: lap.car,
        track: lap.track,
        timestampIso: lap.timestampIso
      };
    }

    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
    }

    if (lap.car.id !== null) entry.cars.set(String(lap.car.id), lap.car);
    if (lap.track.id !== null) entry.tracks.set(String(lap.track.id), lap.track);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      cars: Array.from(entry.cars.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      tracks: Array.from(entry.tracks.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      carsCount: entry.cars.size,
      tracksCount: entry.tracks.size
    }))
    .sort((a, b) => b.validLaps - a.validLaps || a.name.localeCompare(b.name));
}


async function getPilotStatsByPlayerId(dbPath: string, playerId: number) {
  const laps = await readJoinedLaps(dbPath);
  const drivers = reduceDriverStats(laps);
  return drivers.find((driver) => Number(driver.id) === Number(playerId)) ?? null;
}


type PilotProfileLap = ReturnType<typeof mapLapRow>;

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((total, value) => total + value, 0) / clean.length;
}

function standardDeviation(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const avg = average(clean);
  if (avg === null) return null;
  const variance = clean.reduce((total, value) => total + Math.pow(value - avg, 2), 0) / clean.length;
  return Math.sqrt(variance);
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function compactLapForProfile(lap: PilotProfileLap | null) {
  if (!lap) return null;
  return {
    lapId: lap.lapId,
    playerId: lap.driver?.id ?? null,
    driverId: lap.driver?.id ?? null,
    driverName: lap.driver?.name ?? null,
    playerName: lap.driver?.name ?? null,
    carId: lap.car?.id ?? null,
    carName: lap.car?.name ?? null,
    uiCarName: lap.car?.uiName ?? null,
    carCode: lap.car?.code ?? null,
    brand: lap.car?.brand ?? null,
    trackId: lap.track?.id ?? null,
    trackName: lap.track?.name ?? null,
    uiTrackName: lap.track?.uiName ?? null,
    trackCode: lap.track?.code ?? null,
    lapTimeMs: lap.lapTimeMs,
    lapTime: lap.lapTime,
    lapTimeFormatted: lap.lapTime,
    valid: lap.valid,
    isValid: lap.valid,
    car: lap.car,
    track: lap.track,
    maxSpeedKmh: lap.maxSpeedKmh,
    cuts: lap.cuts,
    collisionsCar: lap.collisionsCar,
    collisionsEnv: lap.collisionsEnv,
    sectorTimesMs: lap.sectorTimesMs,
    sectorTimes: lap.sectorTimes,
    timestamp: lap.timestamp,
    timestampIso: lap.timestampIso,
    session: lap.session,
    input: lap.input
  };
}

function countByKey<T>(items: T[], getKey: (item: T) => string | null, buildValue: (item: T) => PlainObject) {
  const map = new Map<string, any>();

  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        ...buildValue(item),
        totalLaps: 0,
        validLaps: 0,
        invalidLaps: 0,
        bestLapMs: null,
        bestLap: null,
        bestLapDetails: null,
        lastSeenTimestamp: null,
        lastSeenAt: null
      });
    }

    const entry = map.get(key);
    const lap = item as PilotProfileLap;
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    else entry.invalidLaps += 1;

    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < Number(entry.bestLapMs))) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
      entry.bestLapDetails = compactLapForProfile(lap);
    }

    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
    }
  }

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    validityRate: percent(entry.validLaps, entry.totalLaps)
  }));
}

function getBestByCombo(laps: PilotProfileLap[]) {
  const map = new Map<string, PilotProfileLap>();

  for (const lap of laps.filter((item) => item.valid)) {
    const key = `${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`;
    const current = map.get(key);
    if (!current || Number(lap.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      map.set(key, lap);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))
    .map((lap, index) => ({
      rank: index + 1,
      ...compactLapForProfile(lap)
    }));
}

function getPilotLeaderboardRank(allLaps: PilotProfileLap[], playerId: number) {
  const drivers = reduceDriverStats(allLaps);
  const ranked = drivers
    .filter((driver) => Number.isFinite(Number(driver.bestLapMs)))
    .sort((a, b) => Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));

  const index = ranked.findIndex((driver) => Number(driver.id) === Number(playerId));
  if (index === -1) return null;

  return {
    position: index + 1,
    total: ranked.length
  };
}

function buildPilotProProfile(user: AppUser, session: AppSession, allLaps: PilotProfileLap[]) {
  const playerId = user.pilotLink?.playerId;
  const pilotLaps = playerId
    ? allLaps.filter((lap) => Number(lap.driver.id) === Number(playerId))
    : [];

  const validLaps = pilotLaps.filter((lap) => lap.valid);
  const invalidLaps = pilotLaps.filter((lap) => !lap.valid);
  const sortedFastest = [...validLaps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  const sortedRecent = [...pilotLaps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
  const bestLap = sortedFastest[0] ?? null;
  const latestLap = sortedRecent[0] ?? null;
  const lapTimes = validLaps.map((lap) => Number(lap.lapTimeMs)).filter((value) => Number.isFinite(value) && value > 0);
  const speedValues = validLaps.map((lap) => Number(lap.maxSpeedKmh)).filter((value) => Number.isFinite(value) && value > 0);
  const sectorCount = Math.max(0, ...validLaps.map((lap) => lap.sectorTimesMs.length));
  const bestSectors = Array.from({ length: sectorCount }).map((_, index) => {
    const values = validLaps
      .map((lap) => lap.sectorTimesMs[index])
      .filter((value) => Number.isFinite(value) && value > 0);
    const best = values.length ? Math.min(...values) : null;
    return {
      sector: index + 1,
      timeMs: best,
      time: best ? lapTimeToText(best) : '--'
    };
  });

  const carStats = countByKey(
    pilotLaps,
    (lap) => lap.car.id !== null ? String(lap.car.id) : lap.car.name,
    (lap) => ({ car: (lap as PilotProfileLap).car })
  ).sort((a, b) => b.validLaps - a.validLaps || Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));

  const trackStats = countByKey(
    pilotLaps,
    (lap) => lap.track.id !== null ? String(lap.track.id) : lap.track.name,
    (lap) => ({ track: (lap as PilotProfileLap).track })
  ).sort((a, b) => b.validLaps - a.validLaps || Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));

  const comboStats = getBestByCombo(pilotLaps);
  const avgLapMs = average(lapTimes);
  const consistencyMs = standardDeviation(lapTimes);
  const maxSpeedKmh = speedValues.length ? Math.max(...speedValues) : null;
  const avgSpeedKmh = average(speedValues);

  return {
    ok: true,
    authenticated: true,
    generatedAt: new Date().toISOString(),
    user: publicUser(user),
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt
    },
    linked: Boolean(user.pilotLink),
    pilotLink: user.pilotLink,
    pilot: pilotLaps[0]?.driver ?? (user.pilotLink ? {
      id: user.pilotLink.playerId,
      name: user.pilotLink.strackerName,
      steamGuid: user.pilotLink.steamGuid,
      isOnline: null
    } : null),
    summary: {
      totalLaps: pilotLaps.length,
      validLaps: validLaps.length,
      invalidLaps: invalidLaps.length,
      validityRate: percent(validLaps.length, pilotLaps.length),
      carsCount: new Set(pilotLaps.map((lap) => lap.car.id ?? lap.car.name)).size,
      tracksCount: new Set(pilotLaps.map((lap) => lap.track.id ?? lap.track.name)).size,
      combosCount: comboStats.length,
      bestLap: compactLapForProfile(bestLap),
      latestLap: compactLapForProfile(latestLap),
      bestRank: playerId ? getPilotLeaderboardRank(allLaps, playerId) : null,
      avgLapMs,
      avgLap: avgLapMs ? lapTimeToText(avgLapMs) : '--',
      consistencyMs,
      consistency: consistencyMs ? lapTimeToText(consistencyMs) : '--',
      maxSpeedKmh,
      avgSpeedKmh,
      lastSeenAt: latestLap?.timestampIso ?? null,
      favoriteCar: carStats[0] ?? null,
      favoriteTrack: trackStats[0] ?? null
    },
    recentLaps: sortedRecent.slice(0, 15).map(compactLapForProfile),
    bestCombos: comboStats.slice(0, 15),
    cars: carStats.slice(0, 20),
    tracks: trackStats.slice(0, 20),
    sectors: bestSectors,
    message: user.pilotLink
      ? 'Perfil Pro generado desde la cuenta web y stracker.db3.'
      : 'Cuenta activa sin piloto vinculado todavía.'
  };
}

async function resolvePilotLink(playerIdRaw: unknown) {
  const playerId = Number(playerIdRaw);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return { ok: false as const, message: 'El piloto seleccionado no es válido.' };
  }

  const stracker = getStrackerConfig();
  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    return { ok: false as const, message: 'No hay stracker.db3 válido para vincular piloto.' };
  }

  const pilot = await getPilotStatsByPlayerId(stracker.resolvedPath, playerId);
  if (!pilot) {
    return { ok: false as const, message: 'No se encontró ese piloto en stracker.db3.' };
  }

  return {
    ok: true as const,
    pilot,
    link: {
      playerId: Number(pilot.id),
      steamGuid: pilot.steamGuid ?? null,
      strackerName: pilot.name,
      linkedAt: new Date().toISOString()
    }
  };
}

function reduceCarStats(laps: ReturnType<typeof mapLapRow>[], carsRows: PlainObject[]) {
  const map = new Map<string, any>();

  for (const row of carsRows) {
    const id = String(row.CarId);
    map.set(id, {
      id: numberOrNull(row.CarId),
      code: compactNullableText(row.Car),
      name: getDisplayCar(row),
      uiName: compactNullableText(row.UiCarName),
      brand: compactNullableText(row.Brand),
      totalLaps: 0,
      validLaps: 0,
      bestLapMs: null,
      bestLap: null,
      drivers: new Map(),
      tracks: new Map()
    });
  }

  for (const lap of laps) {
    const id = String(lap.car.id ?? lap.car.name);
    if (!map.has(id)) {
      map.set(id, {
        ...lap.car,
        totalLaps: 0,
        validLaps: 0,
        bestLapMs: null,
        bestLap: null,
        drivers: new Map(),
        tracks: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
    }
    if (lap.driver.id !== null) entry.drivers.set(String(lap.driver.id), lap.driver);
    if (lap.track.id !== null) entry.tracks.set(String(lap.track.id), lap.track);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      driversCount: entry.drivers.size,
      tracksCount: entry.tracks.size,
      drivers: undefined,
      tracks: undefined
    }))
    .sort((a, b) => b.validLaps - a.validLaps || String(a.name).localeCompare(String(b.name)));
}

function reduceTrackStats(laps: ReturnType<typeof mapLapRow>[], tracksRows: PlainObject[]) {
  const map = new Map<string, any>();

  for (const row of tracksRows) {
    const id = String(row.TrackId);
    map.set(id, {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: getDisplayTrack(row),
      uiName: compactNullableText(row.UiTrackName),
      length: numberOrNull(row.Length),
      totalLaps: 0,
      validLaps: 0,
      bestLapMs: null,
      bestLap: null,
      drivers: new Map(),
      cars: new Map()
    });
  }

  for (const lap of laps) {
    const id = String(lap.track.id ?? lap.track.name);
    if (!map.has(id)) {
      map.set(id, {
        ...lap.track,
        totalLaps: 0,
        validLaps: 0,
        bestLapMs: null,
        bestLap: null,
        drivers: new Map(),
        cars: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
    }
    if (lap.driver.id !== null) entry.drivers.set(String(lap.driver.id), lap.driver);
    if (lap.car.id !== null) entry.cars.set(String(lap.car.id), lap.car);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      driversCount: entry.drivers.size,
      carsCount: entry.cars.size,
      drivers: undefined,
      cars: undefined
    }))
    .sort((a, b) => b.validLaps - a.validLaps || String(a.name).localeCompare(String(b.name)));
}

async function getCombos(dbPath: string) {
  const rows = await runStrackerQuery(
    dbPath,
    `
      SELECT
        Co.ComboId,
        Co.TrackId,
        T.Track,
        T.UiTrackName,
        T.Length AS TrackLength,
        C.CarId,
        C.Car,
        C.UiCarName,
        C.Brand
      FROM Combos Co
      LEFT JOIN Tracks T ON T.TrackId = Co.TrackId
      LEFT JOIN ComboCars CC ON CC.ComboId = Co.ComboId
      LEFT JOIN Cars C ON C.CarId = CC.CarId
      ORDER BY Co.ComboId ASC, C.UiCarName ASC
    `
  );

  const combos = new Map<string, any>();

  for (const row of rows) {
    const id = String(row.ComboId);
    if (!combos.has(id)) {
      combos.set(id, {
        id: numberOrNull(row.ComboId),
        track: {
          id: numberOrNull(row.TrackId),
          code: compactNullableText(row.Track),
          name: getDisplayTrack(row),
          length: numberOrNull(row.TrackLength)
        },
        cars: []
      });
    }

    if (row.CarId !== null && row.CarId !== undefined) {
      combos.get(id).cars.push({
        id: numberOrNull(row.CarId),
        code: compactNullableText(row.Car),
        name: getDisplayCar(row),
        brand: compactNullableText(row.Brand)
      });
    }
  }

  return Array.from(combos.values());
}

async function getSessions(dbPath: string, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 250));
  const rows = await runStrackerQuery(
    dbPath,
    `
      SELECT
        S.SessionId,
        S.TrackId,
        S.SessionType,
        S.Multiplayer,
        S.NumberOfLaps,
        S.Duration,
        S.ServerIpPort,
        S.StartTimeDate,
        S.EndTimeDate,
        S.PenaltiesEnabled,
        S.AllowedTyresOut,
        S.TyreWearFactor,
        S.FuelRate,
        S.Damage,
        S.ComboId,
        T.Track,
        T.UiTrackName,
        T.Length AS TrackLength,
        COUNT(L.LapId) AS TotalLaps,
        SUM(CASE WHEN L.Valid = 1 THEN 1 ELSE 0 END) AS ValidLaps,
        COUNT(DISTINCT PIS.PlayerId) AS DriversCount
      FROM Session S
      LEFT JOIN Tracks T ON T.TrackId = S.TrackId
      LEFT JOIN PlayerInSession PIS ON PIS.SessionId = S.SessionId
      LEFT JOIN Lap L ON L.PlayerInSessionId = PIS.PlayerInSessionId
      GROUP BY S.SessionId
      ORDER BY S.StartTimeDate DESC
      LIMIT ${safeLimit}
    `
  );

  return rows.map((row) => ({
    id: numberOrNull(row.SessionId),
    type: compactNullableText(row.SessionType),
    multiplayer: numberOrNull(row.Multiplayer),
    numberOfLaps: numberOrNull(row.NumberOfLaps),
    duration: numberOrNull(row.Duration),
    server: compactNullableText(row.ServerIpPort),
    comboId: numberOrNull(row.ComboId),
    startTime: numberOrNull(row.StartTimeDate),
    startTimeIso: unixToIso(row.StartTimeDate),
    endTime: numberOrNull(row.EndTimeDate),
    endTimeIso: unixToIso(row.EndTimeDate),
    settings: {
      penaltiesEnabled: numberOrNull(row.PenaltiesEnabled),
      allowedTyresOut: numberOrNull(row.AllowedTyresOut),
      tyreWearFactor: numberOrNull(row.TyreWearFactor),
      fuelRate: numberOrNull(row.FuelRate),
      damage: numberOrNull(row.Damage)
    },
    track: {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: getDisplayTrack(row),
      length: numberOrNull(row.TrackLength)
    },
    stats: {
      totalLaps: numberOrNull(row.TotalLaps) ?? 0,
      validLaps: numberOrNull(row.ValidLaps) ?? 0,
      driversCount: numberOrNull(row.DriversCount) ?? 0
    }
  }));
}

const mockPilots = [
  {
    id: 'gc-demo-001',
    name: 'Piloto demo',
    role: 'driver',
    status: 'mock'
  }
];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'grasscutters-node',
    mode: 'hostinger-singlefile-stracker-auto-sync-auth-admin-appstorage-ready',
    startedAt
  });
});

app.get('/api/status', (_req, res) => {
  const modules = getModules();

  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    mode: 'hostinger-singlefile-stracker-auto-sync-auth-admin-appstorage-ready',
    modules: {
      web: modules.web.enabled,
      api: modules.api.enabled,
      discord: modules.discord.enabled,
      stracker: modules.stracker.enabled,
      users: modules.users.enabled
    },
    moduleStatus: modules,
    note: useMysqlStorage() ? 'App storage activo con driver configurable: MySQL en producción, SQLite/JSON en local.' : 'Storage JSON activo. Para producción usa APP_STORAGE_DRIVER=mysql.'
  });
});

app.get('/api/modules', (_req, res) => {
  res.json({
    ok: true,
    modules: getModules()
  });
});

app.get('/api/auth/status', async (_req, res) => {
  res.json({
    ok: true,
    auth: await getUserStoreStatsAsync(),
    message: useMysqlStorage() ? 'Auth real activo. Usuarios en MySQL/MariaDB.' : 'Auth real activo. Usuarios en JSON local.'
  });
});

app.get('/api/auth/me', async (req, res) => {
  const context = await getAuthContextAsync(req);

  if (!context) {
    res.status(200).json({
      ok: false,
      authenticated: false,
      user: null,
      pilot: null,
      message: 'No hay sesión activa.'
    });
    return;
  }

  let pilot = null;
  const playerId = context.user.pilotLink?.playerId;
  const stracker = getStrackerConfig();

  if (playerId && stracker.resolvedPath && stracker.exists && stracker.validSQLite) {
    try {
      pilot = await getPilotStatsByPlayerId(stracker.resolvedPath, playerId);
    } catch (error) {
      console.error('[GC] Error leyendo piloto vinculado:', error);
    }
  }

  res.json({
    ok: true,
    authenticated: true,
    user: publicUser(context.user),
    pilot,
    session: {
      id: context.session.id,
      createdAt: context.session.createdAt,
      expiresAt: context.session.expiresAt,
      lastSeenAt: context.session.lastSeenAt
    }
  });
});


app.get('/api/profile', async (req, res) => {
  const context = await getAuthContextAsync(req);

  if (!context) {
    res.status(200).json({
      ok: false,
      authenticated: false,
      user: null,
      profile: null,
      message: 'No hay sesión activa.'
    });
    return;
  }

  const stracker = getStrackerConfig();

  if (!context.user.pilotLink) {
    res.json(buildPilotProProfile(context.user, context.session, []));
    return;
  }

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.status(200).json({
      ok: false,
      authenticated: true,
      user: publicUser(context.user),
      linked: true,
      pilotLink: context.user.pilotLink,
      profile: null,
      stracker,
      message: 'Hay sesión activa, pero stracker.db3 no está disponible para generar el perfil.'
    });
    return;
  }

  try {
    const allLaps = await readJoinedLaps(stracker.resolvedPath);
    res.json({
      ...buildPilotProProfile(context.user, context.session, allLaps),
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      }
    });
  } catch (error) {
    console.error('[GC] Error generando perfil pro:', error);
    res.status(200).json({
      ok: false,
      authenticated: true,
      user: publicUser(context.user),
      profile: null,
      message: 'No se pudo generar el Perfil Pro desde stracker.db3.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});



function safeRuntimeError(error: unknown) {
  const err = error as any;
  return {
    name: err?.name || 'Error',
    message: err?.message || String(error),
    code: err?.code || null,
    errno: err?.errno || null,
    sqlState: err?.sqlState || null,
    sqlMessage: err?.sqlMessage || null
  };
}

app.get('/api/mysql/status', async (req, res) => {
  const config = getMysqlStorageSafeConfig();

  if (!useMysqlStorage()) {
    res.status(200).json({
      ok: false,
      enabled: false,
      config,
      message: 'MySQL no está activo. APP_STORAGE_DRIVER debe ser mysql.'
    });
    return;
  }

  try {
    await ensureMysqlSchema();
    const rows = await mysqlQuery(`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('gc_users', 'gc_sessions', 'gc_display_names', 'gc_settings')
      ORDER BY table_name ASC
    `);
    const pingRows = await mysqlQuery('SELECT 1 AS ok');

    res.json({
      ok: true,
      enabled: true,
      config,
      ping: pingRows?.[0]?.ok === 1,
      tables: rows,
      message: 'MySQL conectado y tablas de app listas.'
    });
  } catch (error) {
    console.error('[GC] Error en /api/mysql/status:', error);
    res.status(500).json({
      ok: false,
      enabled: true,
      config,
      error: safeRuntimeError(error),
      message: 'No se pudo conectar o preparar MySQL. Revisa variables, password, permisos y que mysql2 esté instalado.'
    });
  }
});

app.get('/api/sqlite/status', async (req, res) => {
  const config = getSqliteStorageSafeConfig();

  if (!useSqliteStorage()) {
    res.status(200).json({
      ok: true,
      enabled: false,
      config,
      message: 'SQLite local no está activo. Usa APP_STORAGE_DRIVER=sqlite para desarrollo local.'
    });
    return;
  }

  try {
    const rows = await withAppSqliteDb((db) => sqliteQuery(
      db,
      `SELECT name AS tableName FROM sqlite_master WHERE type='table' AND name IN ('gc_users', 'gc_sessions', 'gc_display_names', 'gc_settings') ORDER BY name ASC`
    ));

    res.json({
      ok: true,
      enabled: true,
      config: getSqliteStorageSafeConfig(),
      tables: rows,
      message: 'SQLite local conectado y tablas de app listas.'
    });
  } catch (error) {
    console.error('[GC] Error en /api/sqlite/status:', error);
    res.status(200).json({
      ok: false,
      enabled: true,
      config: getSqliteStorageSafeConfig(),
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }
        : { message: String(error) },
      message: 'No se pudo abrir o preparar SQLite local. Revisa APP_SQLITE_PATH y permisos de data/app.'
    });
  }
});

app.get('/api/admin/status', async (req, res) => {
  const store = await readUserStoreAsync();
  const context = await getAuthContextAsync(req);
  const authorized = Boolean(context && isAdminUser(context.user));
  const summary = getUserStoreAdminSummary(store);
  const stracker = getStrackerConfig();

  let strackerOverview: null | {
    totalTables: number;
    totalLaps: number | null;
    validLaps: number | null;
    players: number | null;
    cars: number | null;
    tracks: number | null;
  } = null;

  if (authorized && stracker.resolvedPath && stracker.exists && stracker.validSQLite) {
    try {
      const rows = await runStrackerQuery(stracker.resolvedPath, `
        SELECT
          (SELECT COUNT(*) FROM Lap) AS TotalLaps,
          (SELECT COUNT(*) FROM Lap WHERE Valid = 1) AS ValidLaps,
          (SELECT COUNT(*) FROM Players) AS Players,
          (SELECT COUNT(*) FROM Cars) AS Cars,
          (SELECT COUNT(*) FROM Tracks) AS Tracks
      `);
      const tables = await readStrackerTables(stracker.resolvedPath);
      const first = rows[0] ?? {};
      strackerOverview = {
        totalTables: tables.length,
        totalLaps: numberOrNull(first.TotalLaps),
        validLaps: numberOrNull(first.ValidLaps),
        players: numberOrNull(first.Players),
        cars: numberOrNull(first.Cars),
        tracks: numberOrNull(first.Tracks)
      };
    } catch (error) {
      console.error('[GC] Error generando admin stracker overview:', error);
    }
  }

  res.json({
    ok: true,
    authenticated: Boolean(context),
    authorized,
    currentUser: context ? publicUser(context.user) : null,
    setupRequired: summary.setupRequired,
    setupSecretConfigured: Boolean(getAdminSetupSecret()),
    summary,
    admin: authorized
      ? {
          modules: getModules(),
          users: getUserStoreAdminSummary(store),
          displayNames: getDisplayNamesDbInfo(),
          storage: getAppStorageStatus(),
          stracker: {
            ...stracker,
            overview: strackerOverview,
            autoSync: getAutoSyncConfig(),
            lastSync: lastSyncResult,
            syncInProgress
          }
        }
      : null,
    message: authorized
      ? 'Consola admin activa.'
      : summary.setupRequired
        ? 'No hay administradores todavía. Promociona una cuenta con ADMIN_SETUP_SECRET o STRACKER_SYNC_SECRET.'
        : 'Inicia sesión con una cuenta administradora.'
  });
});

app.post('/api/admin/bootstrap', async (req, res) => {
  if (!assertAdminSetupSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret admin inválido. Usa ADMIN_SETUP_SECRET o STRACKER_SYNC_SECRET.'
    });
    return;
  }

  const store = await readUserStoreAsync();
  const context = await getAuthContextAsync(req);
  const targetEmail = normalizeEmail(req.body?.email);
  const targetUserId = String(req.body?.userId ?? '').trim();
  const target = targetUserId
    ? findUserById(store, targetUserId)
    : targetEmail
      ? findUserByEmail(store, targetEmail)
      : context
        ? findUserById(store, context.user.id)
        : null;

  if (!target) {
    res.status(404).json({
      ok: false,
      message: 'No se encontró la cuenta a promocionar. Inicia sesión o indica email/userId.'
    });
    return;
  }

  target.role = 'admin';
  target.updatedAt = new Date().toISOString();

  const shouldAuthenticateTarget = !context || context.user.id === target.id || req.body?.loginAsTarget === true;
  let sessionInfo: null | AppSession = null;

  if (shouldAuthenticateTarget) {
    const created = createSession(store, target.id);
    sessionInfo = created.session;
    target.lastLoginAt = new Date().toISOString();
    setSessionCookie(res, created.token);
  }

  await writeUserStoreAsync(store);

  const targetIsCurrentSession = Boolean(context && context.user.id === target.id);
  const message = shouldAuthenticateTarget
    ? `Cuenta ${target.displayName} promocionada a administrador. Sesión admin activada.`
    : `Cuenta ${target.displayName} promocionada a administrador. Para usar ese admin, inicia sesión con esa cuenta.`;

  res.json({
    ok: true,
    user: publicUser(target),
    targetIsCurrentSession,
    authenticatedAsTarget: shouldAuthenticateTarget,
    sessionCreated: Boolean(sessionInfo),
    summary: getUserStoreAdminSummary(store),
    message
  });
});

app.get('/api/admin/users', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const store = await readUserStoreAsync();
  const users = store.users
    .map((user) => publicAdminUser(user, store))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  res.json({
    ok: true,
    count: users.length,
    users,
    summary: getUserStoreAdminSummary(store),
    message: 'Usuarios cargados correctamente.'
  });
});

app.post('/api/admin/users/:userId/role', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const nextRole = String(req.body?.role ?? '').trim() as AppUserRole;
  if (!['pilot', 'admin'].includes(nextRole)) {
    res.status(400).json({ ok: false, message: 'Rol no válido. Usa pilot o admin.' });
    return;
  }

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  if (target.role === 'admin' && nextRole !== 'admin' && isLastAdmin(store, target.id)) {
    res.status(409).json({ ok: false, message: 'No puedes quitar el último administrador.' });
    return;
  }

  target.role = nextRole;
  target.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(store);

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    summary: getUserStoreAdminSummary(store),
    message: `Rol actualizado a ${nextRole}.`
  });
});

app.post('/api/admin/users/:userId/unlink-pilot', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  target.pilotLink = null;
  target.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(store);

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    message: 'Piloto desvinculado desde administración.'
  });
});

app.post('/api/admin/users/:userId/revoke-sessions', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.userId !== target.id);
  await writeUserStoreAsync(store);

  res.json({
    ok: true,
    revoked: before - store.sessions.length,
    user: publicAdminUser(target, store),
    message: 'Sesiones revocadas correctamente.'
  });
});

app.post('/api/admin/stracker/sync', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const result = await syncStrackerFromGTX();
  res.status(result.statusCode).json({
    ...result,
    autoSync: getAutoSyncConfig()
  });
});

app.get('/api/admin/storage/status', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  res.json({
    ok: true,
    ...getAppStorageStatus(),
    message: getStoragePersistenceInfo().persistent
      ? useMysqlStorage()
        ? 'Storage de app en MySQL/MariaDB.'
        : useSqliteStorage()
          ? 'Storage SQLite local activo para pruebas.'
          : 'Storage persistente configurado fuera del proyecto.'
      : 'Storage dentro del proyecto. Configura APP_DATA_DIR fuera de nodejs o usa APP_STORAGE_DRIVER=mysql.'
  });
});


async function buildDisplayNameCatalog() {
  const stracker = getStrackerConfig();
  const store = await readDisplayNameStoreAsync();
  const catalog = {
    drivers: [] as PlainObject[],
    cars: [] as PlainObject[],
    tracks: [] as PlainObject[]
  };

  if (stracker.resolvedPath && stracker.exists && stracker.validSQLite) {
    try {
      const drivers = await runStrackerQuery(stracker.resolvedPath, 'SELECT PlayerId, SteamGuid, Name FROM Players ORDER BY Name ASC');
      catalog.drivers = drivers.map((row) => buildDisplayNameCatalogItem('driver', row.PlayerId, row.SteamGuid, row.Name, getRawDriverName({ DriverName: row.Name, Name: row.Name }), store));

      const cars = await runStrackerQuery(stracker.resolvedPath, 'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC');
      catalog.cars = cars.map((row) => buildDisplayNameCatalogItem('car', row.CarId, row.Car, row.UiCarName || row.Car, getRawDisplayCar(row), store));

      const tracks = await runStrackerQuery(stracker.resolvedPath, 'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC');
      catalog.tracks = tracks.map((row) => buildDisplayNameCatalogItem('track', row.TrackId, row.Track, row.UiTrackName || row.Track, getRawDisplayTrack(row), store));
    } catch (error) {
      console.error('[GC] Error generando catálogo de display names:', error);
    }
  }

  return {
    catalog,
    entries: store.entries,
    storage: getDisplayNamesDbInfo(),
    summary: {
      drivers: catalog.drivers.length,
      cars: catalog.cars.length,
      tracks: catalog.tracks.length,
      overrides: store.entries.filter((entry) => entry.enabled !== false).length
    }
  };
}

app.get('/api/admin/name-filters', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const data = await buildDisplayNameCatalog();
  res.json({
    ok: true,
    ...data,
    message: 'Filtros de nombres cargados correctamente.'
  });
});

app.get('/api/admin/display-names', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;
  const data = await buildDisplayNameCatalog();
  res.json({ ok: true, ...data, message: 'Nombres visibles cargados correctamente.' });
});

app.post('/api/admin/name-filters', async (req, res) => {
  const adminAccess = await getCurrentAdminOrSecret(req);
  if (!adminAccess.ok) {
    res.status(adminAccess.context ? 403 : 401).json({
      ok: false,
      authenticated: Boolean(adminAccess.context),
      authorized: false,
      message: adminAccess.message
    });
    return;
  }

  const kind = sanitizeDisplayNameKind(req.body?.kind);
  const displayName = cleanDisplayNameInput(req.body?.displayName);
  const sourceName = cleanDisplayNameInput(req.body?.sourceName);
  const sourceCode = compactNullableText(req.body?.sourceCode);
  const sourceId = numberOrNull(req.body?.sourceId);
  const notes = compactNullableText(req.body?.notes);

  if (!kind) {
    res.status(400).json({ ok: false, message: 'Tipo no válido. Usa driver, car o track.' });
    return;
  }

  if (!displayName) {
    res.status(400).json({ ok: false, message: 'El nombre visible no puede estar vacío.' });
    return;
  }

  const store = await readDisplayNameStoreAsync(true);
  const existing = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);
  const now = new Date().toISOString();

  if (existing) {
    existing.sourceId = sourceId;
    existing.sourceCode = sourceCode;
    existing.sourceName = sourceName || existing.sourceName;
    existing.displayName = displayName;
    existing.notes = notes;
    existing.enabled = req.body?.enabled !== false;
    existing.updatedAt = now;
  } else {
    store.entries.push({
      id: makeEntryId(kind, sourceId, sourceCode, sourceName),
      kind,
      sourceId,
      sourceCode,
      sourceName: sourceName || sourceCode || displayName,
      displayName,
      notes,
      enabled: req.body?.enabled !== false,
      createdAt: now,
      updatedAt: now
    });
  }

  await writeDisplayNameStoreAsync(store);
  res.json({
    ok: true,
    entry: findDisplayNameEntry(await readDisplayNameStoreAsync(true), kind, sourceId, sourceCode, sourceName),
    storage: getDisplayNamesDbInfo(),
    message: 'Nombre visible guardado correctamente.'
  });
});

app.post('/api/admin/name-filters/delete', async (req, res) => {
  const adminAccess = await getCurrentAdminOrSecret(req);
  if (!adminAccess.ok) {
    res.status(adminAccess.context ? 403 : 401).json({
      ok: false,
      authenticated: Boolean(adminAccess.context),
      authorized: false,
      message: adminAccess.message
    });
    return;
  }

  const kind = sanitizeDisplayNameKind(req.body?.kind);
  const entryId = compactNullableText(req.body?.entryId);
  const sourceId = numberOrNull(req.body?.sourceId);
  const sourceCode = compactNullableText(req.body?.sourceCode);
  const sourceName = compactNullableText(req.body?.sourceName);

  const store = await readDisplayNameStoreAsync(true);
  const before = store.entries.length;
  store.entries = store.entries.filter((entry) => {
    if (entryId && entry.id === entryId) return false;
    if (kind && findDisplayNameEntry({ ...store, entries: [entry] }, kind, sourceId, sourceCode, sourceName)) return false;
    return true;
  });

  await writeDisplayNameStoreAsync(store);
  res.json({
    ok: true,
    removed: before - store.entries.length,
    storage: getDisplayNamesDbInfo(),
    message: before === store.entries.length ? 'No había override que eliminar.' : 'Override eliminado. Se usará el nombre automático.'
  });
});

app.post('/api/auth/register', async (req, res) => {
  if (!readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)) {
    res.status(403).json({
      ok: false,
      message: 'El registro está desactivado temporalmente.'
    });
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const displayName = normalizeDisplayName(req.body?.displayName);
  const password = String(req.body?.password ?? '');
  const playerId = req.body?.playerId;

  if (!email || !email.includes('@') || email.length > 160) {
    res.status(400).json({ ok: false, message: 'Introduce un email válido.' });
    return;
  }

  if (!displayName || displayName.length < 2) {
    res.status(400).json({ ok: false, message: 'Introduce un nombre de usuario de al menos 2 caracteres.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
    return;
  }

  const store = await readUserStoreAsync();

  if (findUserByEmail(store, email)) {
    res.status(409).json({ ok: false, message: 'Ya existe una cuenta con ese email.' });
    return;
  }

  let pilotLink: AppUser['pilotLink'] = null;
  let pilot: any = null;

  if (playerId !== undefined && playerId !== null && String(playerId).trim() !== '') {
    const resolved = await resolvePilotLink(playerId);
    if (!resolved.ok) {
      res.status(400).json({ ok: false, message: resolved.message });
      return;
    }

    if (findUserByPilotId(store, resolved.link.playerId)) {
      res.status(409).json({ ok: false, message: 'Ese piloto ya está vinculado a otra cuenta.' });
      return;
    }

    pilotLink = resolved.link;
    pilot = resolved.pilot;
  }

  const now = new Date().toISOString();
  const user: AppUser = {
    id: crypto.randomUUID(),
    email,
    displayName,
    role: store.users.length === 0 && readBooleanEnv('FIRST_USER_ADMIN', false) ? 'admin' : 'pilot',
    password: hashPassword(password),
    pilotLink,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };

  store.users.push(user);
  const { token, session } = createSession(store, user.id);
  await writeUserStoreAsync(store);
  setSessionCookie(res, token);

  res.status(201).json({
    ok: true,
    authenticated: true,
    user: publicUser(user),
    pilot,
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt
    },
    message: 'Cuenta creada correctamente.'
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const store = await readUserStoreAsync();
  const user = findUserByEmail(store, email);

  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ ok: false, message: 'Email o contraseña incorrectos.' });
    return;
  }

  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.updatedAt = now;
  const { token, session } = createSession(store, user.id);
  await writeUserStoreAsync(store);
  setSessionCookie(res, token);

  res.json({
    ok: true,
    authenticated: true,
    user: publicUser(user),
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt
    },
    message: 'Login correcto.'
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = readAuthToken(req);
  const store = await readUserStoreAsync();

  if (token) {
    const hash = tokenHash(token);
    store.sessions = store.sessions.filter((session) => session.tokenHash !== hash);
    await writeUserStoreAsync(store);
  }

  clearSessionCookie(res);
  res.json({ ok: true, authenticated: false, message: 'Sesión cerrada.' });
});

app.post('/api/auth/link-pilot', async (req, res) => {
  const context = await getAuthContextAsync(req);
  if (!context) {
    res.status(401).json({ ok: false, message: 'Necesitas iniciar sesión.' });
    return;
  }

  const resolved = await resolvePilotLink(req.body?.playerId);
  if (!resolved.ok) {
    res.status(400).json({ ok: false, message: resolved.message });
    return;
  }

  if (findUserByPilotId(context.store, resolved.link.playerId, context.user.id)) {
    res.status(409).json({ ok: false, message: 'Ese piloto ya está vinculado a otra cuenta.' });
    return;
  }

  context.user.pilotLink = resolved.link;
  context.user.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(context.store);

  res.json({
    ok: true,
    user: publicUser(context.user),
    pilot: resolved.pilot,
    message: 'Piloto vinculado correctamente.'
  });
});

app.post('/api/auth/unlink-pilot', async (req, res) => {
  const context = await getAuthContextAsync(req);
  if (!context) {
    res.status(401).json({ ok: false, message: 'Necesitas iniciar sesión.' });
    return;
  }

  context.user.pilotLink = null;
  context.user.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(context.store);

  res.json({
    ok: true,
    user: publicUser(context.user),
    pilot: null,
    message: 'Piloto desvinculado correctamente.'
  });
});


app.get('/api/discord/status', (_req, res) => {
  res.json({
    ok: true,
    discord: getModules().discord
  });
});

app.get('/api/stracker/status', (_req, res) => {
  res.json({
    ok: true,
    stracker: getModules().stracker,
    lastSync: lastSyncResult,
    syncInProgress
  });
});

app.get('/api/stracker/remote-config', (_req, res) => {
  res.json({
    ok: true,
    remote: getRemoteStrackerConfig(),
    autoSync: getAutoSyncConfig(),
    lastSync: lastSyncResult,
    syncInProgress,
    message: 'No se muestran usuario, contraseña ni secret. Solo si están configurados.'
  });
});

app.get('/api/stracker/auto-sync/status', (_req, res) => {
  res.json({
    ok: true,
    autoSync: getAutoSyncConfig(),
    stracker: getStrackerConfig(),
    remote: getRemoteStrackerConfig(),
    lastSync: lastSyncResult,
    syncInProgress
  });
});

async function handleManualAutoSyncRun(req: express.Request, res: express.Response) {
  if (!assertSyncSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret inválido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  lastAutoSyncResult = {
    ok: Boolean(result.ok),
    reason: 'manual',
    startedAt: result.sync?.startedAt ?? new Date().toISOString(),
    finishedAt: result.sync?.finishedAt ?? new Date().toISOString(),
    message: result.message,
    statusCode: result.statusCode,
    sync: lastSyncResult,
    error: result.ok ? undefined : result.sync?.error
  };

  res.status(result.statusCode).json({
    ...result,
    autoSync: getAutoSyncConfig()
  });
}

app.get('/api/stracker/auto-sync/run', handleManualAutoSyncRun);
app.post('/api/stracker/auto-sync/run', handleManualAutoSyncRun);

async function handleStrackerSync(req: express.Request, res: express.Response) {
  if (!assertSyncSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret inválido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  res.status(result.statusCode).json(result);
}

app.get('/api/stracker/sync', handleStrackerSync);
app.post('/api/stracker/sync', handleStrackerSync);
app.get('/gc-data/sync-stracker', handleStrackerSync);
app.post('/gc-data/sync-stracker', handleStrackerSync);
app.get('/gc-data/sync-stracker.php', handleStrackerSync);
app.post('/gc-data/sync-stracker.php', handleStrackerSync);

app.get('/gc-data/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gc-data-node',
    stracker: getStrackerConfig(),
    remote: getRemoteStrackerConfig(),
    lastSync: lastSyncResult
  });
});

app.get('/api/stracker/tables', async (_req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists) {
    res.status(200).json({
      ok: false,
      tables: [],
      stracker,
      message: 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
    });
    return;
  }

  try {
    const tables = await readStrackerTables(stracker.resolvedPath);

    res.json({
      ok: true,
      stracker,
      totalTables: tables.length,
      tables,
      message: 'Tablas detectadas correctamente en stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo stracker tables:', error);
    res.status(200).json({
      ok: false,
      stracker,
      tables: [],
      message: 'El archivo existe, pero no se pudo leer como SQLite. Revisa que sea stracker.db3 válido.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/stracker/preview/:table', async (req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists) {
    res.status(200).json({
      ok: false,
      columns: [],
      rows: [],
      stracker,
      message: 'No se ha encontrado stracker.db3.'
    });
    return;
  }

  try {
    const preview = await previewStrackerTable(
      stracker.resolvedPath,
      req.params.table,
      Number(req.query.limit ?? 5)
    );

    res.json({
      ...preview,
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      }
    });
  } catch (error) {
    console.error('[GC] Error generando preview de stracker:', error);
    res.status(200).json({
      ok: false,
      columns: [],
      rows: [],
      message: 'No se pudo generar preview de la tabla.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/hotlaps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
    const groupMode = getQueryString(req, 'group', 'best').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: true });
    const items = makeBestHotlaps(filtered, groupMode).slice(0, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      group: groupMode,
      count: items.length,
      totalMatchedLaps: filtered.length,
      filters: summarizeFilters(req),
      options: getQueryBool(req, 'options', false) ? buildOptionsFromLaps(laps) : undefined,
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      },
      items,
      message: 'Hotlaps reales generadas desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo hotlaps reales:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer hotlaps reales desde stracker.db3.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/laps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
    const sort = getQueryString(req, 'sort', 'fastest').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: false });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'recent') return Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0);
      if (sort === 'oldest') return Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0);
      return Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity);
    });

    res.json({
      ok: true,
      mode: 'real-stracker',
      sort,
      count: Math.min(sorted.length, limit),
      totalMatchedLaps: filtered.length,
      filters: summarizeFilters(req),
      items: sorted.slice(0, limit),
      message: 'Vueltas reales leídas desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo vueltas:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer vueltas reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/drivers', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 500);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: false });
    let items = reduceDriverStats(filtered);
    const q = getQueryString(req, 'q') || getQueryString(req, 'driver') || getQueryString(req, 'pilot');
    if (q) items = items.filter((driver) => includesFilter(driver.name, q));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: Math.min(items.length, limit),
      totalDrivers: items.length,
      items: items.slice(0, limit),
      message: 'Pilotos reales generados desde Players + Lap.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo drivers:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer pilotos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/pilots', async (req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.json({
      ok: true,
      mode: 'mock',
      items: mockPilots,
      message: 'Área de pilotos en maqueta. Sin stracker.db3 válido todavía.'
    });
    return;
  }

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const items = reduceDriverStats(filterLaps(laps, req, { validOnly: false }));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Pilotos reales generados desde stracker.db3. Login pendiente para área privada.'
    });
  } catch (error) {
    res.status(200).json({
      ok: false,
      mode: 'real-stracker',
      items: [],
      message: 'No se pudieron leer pilotos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/cars', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const q = getQueryString(req, 'q') || getQueryString(req, 'car');
    const brand = getQueryString(req, 'brand') || getQueryString(req, 'marca');
    const carsRows = await runStrackerQuery(
      stracker.resolvedPath,
      'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC'
    );
    const laps = await readJoinedLaps(stracker.resolvedPath);
    let items = reduceCarStats(laps, carsRows);

    if (q) items = items.filter((car) => includesFilter(`${car.name} ${car.code}`, q));
    if (brand) items = items.filter((car) => includesFilter(car.brand, brand));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Coches reales generados desde Cars.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo cars:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer coches reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/tracks', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const q = getQueryString(req, 'q') || getQueryString(req, 'track') || getQueryString(req, 'circuit');
    const tracksRows = await runStrackerQuery(
      stracker.resolvedPath,
      'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC'
    );
    const laps = await readJoinedLaps(stracker.resolvedPath);
    let items = reduceTrackStats(laps, tracksRows);

    if (q) items = items.filter((track) => includesFilter(`${track.name} ${track.code}`, q));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Circuitos reales generados desde Tracks.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo tracks:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer circuitos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/combos', async (_req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const items = await getCombos(stracker.resolvedPath);

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Combos reales generados desde Combos + ComboCars.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo combos:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer combos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/sessions', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 50, 1, 250);
    const items = await getSessions(stracker.resolvedPath, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Sesiones reales generadas desde Session.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo sessions:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer sesiones reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/activity/recent', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const hours = getQueryNumber(req, 'hours', 48, 1, 24 * 30);
    const limit = getQueryNumber(req, 'limit', 100, 1, 500);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, { ...req, query: { ...req.query, sinceHours: String(hours), valid: 'all' } } as express.Request, { validOnly: false });
    const latestByDriverCombo = new Map<string, ReturnType<typeof mapLapRow>>();

    for (const lap of filtered) {
      const key = `${lap.driver.id ?? lap.driver.name}|${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`;
      const current = latestByDriverCombo.get(key);
      if (!current || Number(lap.timestamp ?? 0) > Number(current.timestamp ?? 0)) {
        latestByDriverCombo.set(key, lap);
      }
    }

    const items = Array.from(latestByDriverCombo.values())
      .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
      .slice(0, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      hours,
      count: items.length,
      items,
      message: `Actividad reciente de las últimas ${hours}h.`
    });
  } catch (error) {
    console.error('[GC] Error leyendo recent activity:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudo leer la actividad reciente.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/stats/overview', async (_req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const validLaps = laps.filter((lap) => lap.valid);
    const bestLap = [...validLaps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] ?? null;
    const latestLap = [...laps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))[0] ?? null;

    res.json({
      ok: true,
      mode: 'real-stracker',
      overview: {
        totalLaps: laps.length,
        validLaps: validLaps.length,
        invalidLaps: laps.length - validLaps.length,
        driversCount: new Set(laps.map((lap) => lap.driver.id ?? lap.driver.name)).size,
        carsCount: new Set(laps.map((lap) => lap.car.id ?? lap.car.name)).size,
        tracksCount: new Set(laps.map((lap) => lap.track.id ?? lap.track.name)).size,
        bestLap,
        latestLap,
        stracker: {
          sizeBytes: stracker.sizeBytes,
          modifiedAt: stracker.modifiedAt
        }
      },
      message: 'Resumen general real generado desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo stats overview:', error);
    res.status(200).json({
      ok: false,
      overview: null,
      message: 'No se pudo generar el resumen real.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/gc-data/hotlaps', (req, res) => {
  req.url = `/api/hotlaps${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/hotlaps.php', (req, res) => {
  req.url = `/api/hotlaps${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/drivers', (req, res) => {
  req.url = `/api/drivers${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/cars', (req, res) => {
  req.url = `/api/cars${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/tracks', (req, res) => {
  req.url = `/api/tracks${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/api/events/upcoming', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    message: 'Eventos pendientes de base de datos propia de la app.'
  });
});

app.get('/api/debug/runtime', (_req, res) => {
  const stracker = getStrackerConfig();

  res.json({
    ok: true,
    runtime: {
      mode: 'hostinger-singlefile-stracker-auto-sync-auth-admin-appstorage-ready',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      startedAt,
      port: PORT,
      host: HOST,
      rootDir,
      distDir,
      distExists: fs.existsSync(distDir),
      stracker,
      remote: getRemoteStrackerConfig(),
      autoSync: getAutoSyncConfig(),
      lastSync: lastSyncResult,
      syncInProgress,
      appStorage: getMysqlStorageSafeConfig()
    }
  });
});

if (!fs.existsSync(distDir)) {
  console.warn(`[GC] No existe ${distDir}. Ejecuta npm run build antes de npm start.`);
}

app.use(
  express.static(distDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    index: 'index.html'
  })
);

app.use((req, res) => {
  const fallback = path.join(distDir, 'index.html');

  if (fs.existsSync(fallback)) {
    res.sendFile(fallback);
    return;
  }

  res.status(200).type('html').send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>GrassCutters Node</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: system-ui; background:#06110d; color:#eefdf5; padding:40px; line-height:1.5;">
    <h1>GrassCutters Node activo</h1>
    <p>El servidor ha arrancado, pero todavía no existe la carpeta <strong>dist</strong>.</p>
    <p>Ruta pedida: ${req.path}</p>
    <p><a style="color:#83ff9f" href="/api/status">Ver /api/status</a></p>
  </body>
</html>`);
});

process.on('uncaughtException', (error) => {
  console.error('[GC] uncaughtException:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[GC] unhandledRejection:', error);
});

app.listen(PORT, HOST, async () => {
  console.log(`[GC] Servidor activo en ${HOST}:${PORT}`);
  console.log('[GC] Modo: hostinger-singlefile-stracker-auto-sync-auth-admin-appstorage-ready');
  try {
    if (useMysqlStorage()) {
      await ensureMysqlSchema();
      await readDisplayNameStoreAsync(true);
      console.log('[GC] Storage de app activo en MySQL/MariaDB.');
    }
  } catch (error) {
    console.error('[GC] Error inicializando MySQL app storage:', error);
  }
  startAutoSyncScheduler();
});
