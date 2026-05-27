import 'dotenv/config';
import { registerMotorsportArchiveDeleteRoutes } from './motorsport-archive-delete-routes';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { registerAcsmChampionshipRoutes } from './acsm-championship-routes';
import crypto from 'node:crypto';
import { DEFAULT_PILOT_AVATAR_URL, readAvatarImage } from '../lib/pilot-avatars';

import { registerMotorsportArchiveRoutes } from './motorsport-archive-routes';
import { registerMotorsportArchiveImageUrlRoutes } from './motorsport-archive-image-url-routes';
import { registerMotorsportArchiveHardDeleteRoutes } from './motorsport-archive-hard-delete-routes';
import { registerAdminUserProfileLinkRoutes } from './admin-user-profile-link-routes';
import { registerMotorsportArchiveAdminMysqlRoutes } from './motorsport-archive-admin-mysql-routes';
import { registerMotorsportArchiveImportDeleteFixV823 } from './motorsport-archive-import-delete-fix-v823-routes';
import { registerMotorsportArchiveSafeApiV824 } from './motorsport-archive-safe-api-v824-routes';
import { registerMotorsportArchiveUnifiedAdminRoutes } from './motorsport-archive-unified-admin-routes';
import { registerMotorsportArchiveLocalImageUploadRoutes } from './motorsport-archive-local-image-upload-routes';
import { registerMotorsportArchiveMediaManagerRoutes } from './motorsport-archive-media-manager-routes';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.GC_RUNTIME_ROOT ? path.resolve(process.env.GC_RUNTIME_ROOT) : path.resolve(__dirname, '../..');
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
  if (!useMysqlStorage()) throw new Error('APP_STORAGE_DRIVER no estÃ¡ en mysql.');
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

  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_admin_audit_log (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      actor_user_id VARCHAR(64) NULL,
      actor_email VARCHAR(191) NULL,
      actor_name VARCHAR(191) NULL,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id VARCHAR(191) NULL,
      before_value LONGTEXT NULL,
      after_value LONGTEXT NULL,
      ip_address VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX idx_gc_admin_audit_created_at (created_at),
      INDEX idx_gc_admin_audit_action (action),
      INDEX idx_gc_admin_audit_entity (entity_type, entity_id),
      INDEX idx_gc_admin_audit_actor (actor_user_id)
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
  if (!useSqliteStorage()) throw new Error('APP_STORAGE_DRIVER no estÃ¡ en sqlite.');
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

  db.run(`
    CREATE TABLE IF NOT EXISTS gc_admin_audit_log (
      id TEXT NOT NULL PRIMARY KEY,
      actor_user_id TEXT NULL,
      actor_email TEXT NULL,
      actor_name TEXT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NULL,
      before_value TEXT NULL,
      after_value TEXT NULL,
      ip_address TEXT NULL,
      user_agent TEXT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_admin_audit_created_at ON gc_admin_audit_log(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_admin_audit_action ON gc_admin_audit_log(action)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_admin_audit_entity ON gc_admin_audit_log(entity_type, entity_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_admin_audit_actor ON gc_admin_audit_log(actor_user_id)`);

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
        ? 'SQLite local activo. Es correcto para desarrollo si data/app/*.sqlite estÃ¡ en .gitignore. En Hostinger usa APP_STORAGE_DRIVER=mysql.'
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
      ? 'APP_DATA_DIR no estÃ¡ configurado fuera del proyecto. En algunos deploys Hostinger puede borrar data/app/users.json y display-names.json.'
      : null
  };
}

function getUsersPath() {
  return getStorageFilePath('APP_USERS_PATH', 'app/users.json');
}

function getUsersDbInfo() {
  if (useMysqlStorage()) {
    return { configured: true, source: 'mysql', persistent: true, table: 'gc_users / gc_sessions', mysql: getMysqlStorageSafeConfig() };
  }
  if (useSqliteStorage()) {
    return { configured: true, source: 'sqlite', persistent: true, table: 'gc_users / gc_sessions', sqlite: getSqliteStorageSafeConfig() };
  }

  const configured = process.env.APP_USERS_PATH?.trim();
  const source = configured ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
  const relativePath = configured || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'app/users.json');
  return buildFileStorageInfo(getUsersPath(), relativePath, source);
}


function getDisplayNamesPath() {
  return getStorageFilePath('APP_DISPLAY_NAMES_PATH', 'app/display-names.json');
}

function getCalendarEventsPath() {
  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json');
}

function getDisplayNamesDbInfo() {
  if (useMysqlStorage()) {
    return { configured: true, source: 'mysql', persistent: true, table: 'gc_display_names', mysql: getMysqlStorageSafeConfig() };
  }
  if (useSqliteStorage()) {
    return { configured: true, source: 'sqlite', persistent: true, table: 'gc_display_names', sqlite: getSqliteStorageSafeConfig() };
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
        ? 'Storage SQLite local activo. Perfecto para pruebas locales; en Hostinger mantÃ©n APP_STORAGE_DRIVER=mysql.'
        : 'En Hostinger usa APP_DATA_DIR con una ruta fuera de nodejs, por ejemplo /home/TU_USUARIO/gc-persistent. AsÃ­ los deploys no pisan usuarios ni alias.'
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

function parseDisplayNameStoreFromJsonFile(filePath: string): DisplayNameStore | null {
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  if (!stats) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<DisplayNameStore>;
    return {
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
  } catch (error) {
    console.error('[GC] Error leyendo display-names.json:', error);
    return null;
  }
}

function readDisplayNameStore(force = false): DisplayNameStore {
  // En MySQL/SQLite los alias son 100% DB-backed. Las rutas sÃ­ncronas solo deben
  // leer la cachÃ© preparada por readDisplayNameStoreAsync(), nunca volver a JSON.
  // Esto evita que /hotlaps, /perfil y demÃ¡s ignoren la tabla gc_display_names.
  if (useMysqlStorage() || useSqliteStorage()) {
    const cacheKey = useMysqlStorage() ? 'mysql:gc_display_names' : `sqlite:${getAppSqlitePath()}`;
    if (!force && displayNameCache?.path === cacheKey) return displayNameCache.store;
    return createEmptyDisplayNameStore();
  }

  const filePath = getDisplayNamesPath();
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  const mtimeMs = stats?.mtimeMs ?? null;

  if (!force && displayNameCache && displayNameCache.path === filePath && displayNameCache.mtimeMs === mtimeMs) {
    return displayNameCache.store;
  }

  const store = parseDisplayNameStoreFromJsonFile(filePath) || createEmptyDisplayNameStore();
  displayNameCache = { path: filePath, mtimeMs, store };
  return store;
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


async function maybeImportLegacyDisplayNamesJson(store: DisplayNameStore): Promise<DisplayNameStore> {
  if (!useMysqlStorage() && !useSqliteStorage()) return store;
  if (store.entries.length > 0) return store;

  const legacyPath = getDisplayNamesPath();
  const legacyStore = parseDisplayNameStoreFromJsonFile(legacyPath);
  const validEntries = legacyStore?.entries?.filter((entry) => entry.displayName && entry.kind) ?? [];
  if (!validEntries.length) return store;

  const migratedStore: DisplayNameStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: validEntries
  };

  await writeDisplayNameStoreAsync(migratedStore);
  console.log(`[GC] ${validEntries.length} alias migrados desde display-names.json a ${getAppStorageDriverLabel()}.`);
  return migratedStore;
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

    const finalStore = await maybeImportLegacyDisplayNamesJson(store);
    displayNameCache = { path: cacheKey, mtimeMs: null, store: finalStore };
    return finalStore;
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

  const finalStore = await maybeImportLegacyDisplayNamesJson(store);
  displayNameCache = { path: 'mysql:gc_display_names', mtimeMs: null, store: finalStore };
  return finalStore;
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

    const entryHasId = entry.sourceId !== null && entry.sourceId !== undefined && Number.isFinite(Number(entry.sourceId));
    const entryCode = normalizeDisplayNameKey(entry.sourceCode);
    const entryName = normalizeDisplayNameKey(entry.sourceName);

    if (hasId && entryHasId && Number(entry.sourceId) === numericId) return true;
    if (code && entryCode && entryCode === code) return true;

    // Los pilotos pueden compartir nombre visible en stracker. Si la vuelta trae PlayerId
    // o SteamGuid, NO hacemos fallback por nombre para evitar que dos "Neo" reciban el
    // mismo override. Solo usamos sourceName cuando no hay identidad tÃ©cnica disponible.
    if (kind === 'driver' && (hasId || code)) return false;

    if (name && entryName && entryName === name) return true;
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

type AdminAuthAccess =
  | { ok: true; authenticated: true; authorized: true; context: NonNullable<Awaited<ReturnType<typeof getAuthContextAsync>>>; user: AppUser; via: 'session' }
  | { ok: false; authenticated: boolean; authorized: false; context: Awaited<ReturnType<typeof getAuthContextAsync>> | null; user: AppUser | null; via: 'none'; statusCode: 401 | 403; message: string };

async function getCurrentAdminAccess(req: express.Request): Promise<AdminAuthAccess> {
  const context = await getAuthContextAsync(req);

  if (!context) {
    return {
      ok: false,
      authenticated: false,
      authorized: false,
      context: null,
      user: null,
      via: 'none',
      statusCode: 401,
      message: 'Necesitas iniciar sesiÃ³n con una cuenta admin.'
    };
  }

  if (!isAdminUser(context.user)) {
    return {
      ok: false,
      authenticated: true,
      authorized: false,
      context,
      user: context.user,
      via: 'none',
      statusCode: 403,
      message: 'Tu cuenta no tiene permisos de administrador.'
    };
  }

  return {
    ok: true,
    authenticated: true,
    authorized: true,
    context,
    user: context.user,
    via: 'session'
  };
}

function sendAdminAccessDenied(res: express.Response, access: Extract<AdminAuthAccess, { ok: false }>) {
  res.status(access.statusCode).json({
    ok: false,
    authenticated: access.authenticated,
    authorized: false,
    user: access.user ? publicUser(access.user) : null,
    message: access.message
  });
}

function getAdminSetupSecret() {
  return process.env.ADMIN_SETUP_SECRET?.trim() || process.env.STRACKER_SYNC_SECRET?.trim() || '';
}

function assertAdminSetupSecret(req: express.Request) {
  const expected = getAdminSetupSecret();
  const provided = readRequestSecret(req);
  return Boolean(expected && provided && expected === provided);
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
  const access = await getCurrentAdminAccess(req);
  if (!access.ok) {
    sendAdminAccessDenied(res, access);
    return null;
  }

  return access.context;
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
  if (['1', 'true', 'yes', 'si', 'sÃ­', 'on', 'enabled'].includes(normalized)) return true;
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
    if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');
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
      message: 'Auto-sync fallÃ³ con una excepciÃ³n no esperada.',
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
        ? 'Web Astro estÃ¡tica servida desde dist.'
        : 'No existe dist todavÃ­a. Revisa que el build haya terminado.'
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
        ? 'Discord marcado como activo, pero el bot real no arranca todavÃ­a.'
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
  if (['1', 'true', 'yes', 'si', 'sÃ­', 'on'].includes(normalized)) return true;
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

/* GC_PERFORMANCE_CORE_V15_29 START
 * Cache ligero para stracker.db3.
 * Evita reimportar sql.js, releer el fichero SQLite y remapear todas las vueltas en cada request.
 * Se invalida por firma de archivo: path + size + mtime.
 */
type GcStrackerSignature = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  key: string;
};

type GcQueryCacheEntry = {
  signatureKey: string;
  createdAt: number;
  rows: PlainObject[];
};

type GcJoinedLapsCacheEntry = {
  signatureKey: string;
  createdAt: number;
  laps: ReturnType<typeof mapLapRow>[];
};

let gcStrackerSqlJsPromise: Promise<any> | null = null;
let gcStrackerBytesCache: { signatureKey: string; bytes: Uint8Array } | null = null;
let gcJoinedLapsCache: GcJoinedLapsCacheEntry | null = null;
const gcStrackerQueryCache = new Map<string, GcQueryCacheEntry>();

function gcPerfBoolEnv(name: string, fallback: boolean) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'si', 'sí', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
}

function gcPerfNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function gcStrackerQueryTtlMs() {
  return gcPerfNumberEnv('STRACKER_QUERY_CACHE_TTL_MS', 15000, 0, 10 * 60 * 1000);
}

function gcJoinedLapsTtlMs() {
  return gcPerfNumberEnv('STRACKER_JOINED_LAPS_CACHE_TTL_MS', 15000, 0, 10 * 60 * 1000);
}

function gcPublicHttpCacheSeconds() {
  return gcPerfNumberEnv('GC_PUBLIC_HTTP_CACHE_SECONDS', 15, 0, 300);
}

function gcPublicHttpStaleSeconds() {
  return gcPerfNumberEnv('GC_PUBLIC_HTTP_STALE_SECONDS', 60, 0, 900);
}

function gcPerformanceLogEnabled() {
  return gcPerfBoolEnv('GC_PERF_LOG', process.env.NODE_ENV !== 'production');
}

function gcGetStrackerSignature(dbPath: string): GcStrackerSignature {
  const stats = fs.statSync(dbPath);
  const resolved = path.resolve(dbPath);
  const sizeBytes = Number(stats.size || 0);
  const mtimeMs = Number(stats.mtimeMs || 0);
  return {
    path: resolved,
    sizeBytes,
    mtimeMs,
    key: resolved + ':' + sizeBytes + ':' + mtimeMs,
  };
}

function gcCloneRows(rows: PlainObject[]) {
  return rows.map((row) => ({ ...row }));
}

function gcTrimQueryCache(maxEntries = 80) {
  if (gcStrackerQueryCache.size <= maxEntries) return;
  const entries = Array.from(gcStrackerQueryCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of entries.slice(0, Math.max(1, entries.length - maxEntries))) {
    gcStrackerQueryCache.delete(key);
  }
}

function invalidateStrackerRuntimeCache(reason = 'manual') {
  gcStrackerBytesCache = null;
  gcJoinedLapsCache = null;
  gcStrackerQueryCache.clear();
  if (gcPerformanceLogEnabled()) console.log('[GC PERF] Caché stracker limpiada: ' + reason);
}

async function getCachedStrackerSqlJs() {
  if (!gcStrackerSqlJsPromise) {
    gcStrackerSqlJsPromise = (async () => {
      const initSqlJsModule = await import('sql.js');
      const initSqlJs = initSqlJsModule.default;
      return initSqlJs();
    })();
  }
  return gcStrackerSqlJsPromise;
}

function getCachedStrackerBytes(dbPath: string) {
  const signature = gcGetStrackerSignature(dbPath);
  const cacheBytes = gcPerfBoolEnv('STRACKER_CACHE_DB_BYTES', true);

  if (!cacheBytes) return { signature, bytes: new Uint8Array(fs.readFileSync(dbPath)) };

  if (gcStrackerBytesCache?.signatureKey === signature.key) {
    return { signature, bytes: gcStrackerBytesCache.bytes };
  }

  const bytes = new Uint8Array(fs.readFileSync(dbPath));
  gcStrackerBytesCache = { signatureKey: signature.key, bytes };
  return { signature, bytes };
}

function gcCacheInfo() {
  return {
    api: 'performance-core-v15.29.3',
    queryCacheEntries: gcStrackerQueryCache.size,
    joinedLapsCached: Boolean(gcJoinedLapsCache),
    dbBytesCached: Boolean(gcStrackerBytesCache),
    queryTtlMs: gcStrackerQueryTtlMs(),
    joinedLapsTtlMs: gcJoinedLapsTtlMs(),
    publicHttpCacheSeconds: gcPublicHttpCacheSeconds(),
    publicHttpStaleSeconds: gcPublicHttpStaleSeconds(),
  };
}

function gcIsCachedPublicApi(url: string) {
  const clean = String(url || '').split('?')[0];

  if (!clean) return false;
  if (clean.startsWith('/api/admin')) return false;
  if (clean.startsWith('/api/auth')) return false;
  if (clean.startsWith('/api/debug')) return false;
  if (clean.startsWith('/api/runtime')) return false;
  if (clean.includes('/sync')) return false;

  return [
    '/api/hotlaps',
    '/api/laps',
    '/api/drivers',
    '/api/pilots',
    '/api/cars',
    '/api/tracks',
    '/api/combos',
    '/api/sessions',
    '/api/activity/recent',
    '/api/stats/overview',
    '/api/calendar-events',
    '/gc-data/hotlaps',
    '/gc-data/hotlaps.php',
    '/gc-data/drivers',
    '/gc-data/cars',
    '/gc-data/tracks',
  ].some((prefix) => clean === prefix || clean.startsWith(prefix + '/'));
}
/* GC_PERFORMANCE_CORE_V15_29 END */

async function withStrackerDb<T>(dbPath: string, callback: (db: SqlJsDatabase) => T | Promise<T>) {
  const SQL = await getCachedStrackerSqlJs();
  const { bytes } = getCachedStrackerBytes(dbPath);
  const db = new SQL.Database(bytes);

  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

async function runStrackerQuery(dbPath: string, sql: string) {
  const signature = gcGetStrackerSignature(dbPath);
  const ttlMs = gcStrackerQueryTtlMs();
  const normalizedSql = String(sql || '').replace(/\s+/g, ' ').trim();
  const key = signature.key + '::' + normalizedSql;
  const now = Date.now();
  const cached = gcStrackerQueryCache.get(key);

  if (ttlMs > 0 && cached && cached.signatureKey === signature.key && now - cached.createdAt <= ttlMs) {
    return gcCloneRows(cached.rows);
  }

  const started = Date.now();
  const rows = await withStrackerDb(dbPath, (db) => toObjects(db.exec(sql)));
  if (ttlMs > 0) {
    gcStrackerQueryCache.set(key, { signatureKey: signature.key, createdAt: now, rows });
    gcTrimQueryCache();
  }

  if (gcPerformanceLogEnabled()) {
    const elapsed = Date.now() - started;
    if (elapsed > 120) console.log('[GC PERF] SQL stracker ' + elapsed + 'ms · ' + normalizedSql.slice(0, 120));
  }

  return gcCloneRows(rows);
}

function getSafeStrackerOrRespond(res: express.Response) {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.status(200).json({
      ok: false,
      stracker,
      message: stracker.exists
        ? 'stracker.db3 existe, pero no parece SQLite vÃ¡lido.'
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
      message: 'Ya hay una sincronizaciÃ³n en curso.'
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
      throw new Error(`Archivo descargado demasiado pequeÃ±o: ${stats.size} bytes.`);
    }

    if (!isSQLiteFile(tempPath)) {
      throw new Error('El archivo descargado no parece SQLite vÃ¡lido. Cabecera incorrecta.');
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
  const signature = gcGetStrackerSignature(dbPath);
  const ttlMs = gcJoinedLapsTtlMs();
  const now = Date.now();

  if (
    ttlMs > 0 &&
    gcJoinedLapsCache &&
    gcJoinedLapsCache.signatureKey === signature.key &&
    now - gcJoinedLapsCache.createdAt <= ttlMs
  ) {
    return gcJoinedLapsCache.laps;
  }

  const started = Date.now();
  const rows = await runStrackerQuery(dbPath, `${joinedLapsSql} ORDER BY L.LapTime ASC`);
  const laps = rows.map(mapLapRow);

  if (ttlMs > 0) {
    gcJoinedLapsCache = {
      signatureKey: signature.key,
      createdAt: now,
      laps,
    };
  }

  if (gcPerformanceLogEnabled()) {
    const elapsed = Date.now() - started;
    console.log('[GC PERF] readJoinedLaps ' + elapsed + 'ms · vueltas=' + laps.length);
  }

  return laps;
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


function uniqueCount(values: unknown[]) {
  return new Set(values.filter((value) => value !== null && value !== undefined && value !== '')).size;
}

function lapTimeDeltaText(value: number | null) {
  if (!Number.isFinite(Number(value))) return '--';
  const n = Math.round(Number(value));
  return `${n >= 0 ? '+' : '-'}${lapTimeToText(Math.abs(n))}`;
}

function getPilotComboRank(allLaps: PilotProfileLap[], lap: PilotProfileLap) {
  const carKey = String(lap.car.id ?? lap.car.name);
  const trackKey = String(lap.track.id ?? lap.track.name);
  const bestByDriver = new Map<string, PilotProfileLap>();

  for (const item of allLaps) {
    if (!item.valid) continue;
    if (String(item.car.id ?? item.car.name) !== carKey) continue;
    if (String(item.track.id ?? item.track.name) !== trackKey) continue;
    const driverKey = String(item.driver.id ?? item.driver.name);
    const current = bestByDriver.get(driverKey);
    if (!current || Number(item.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      bestByDriver.set(driverKey, item);
    }
  }

  const ranked = Array.from(bestByDriver.values()).sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  const index = ranked.findIndex((item) => Number(item.driver.id) === Number(lap.driver.id));
  return index >= 0 ? { position: index + 1, total: ranked.length } : null;
}

function enrichPilotCombosWithRanks(allLaps: PilotProfileLap[], pilotLaps: PilotProfileLap[]) {
  return getBestByCombo(pilotLaps).map((combo) => {
    const original = pilotLaps.find((lap) => lap.lapId === combo.lapId) ?? null;
    const rank = original ? getPilotComboRank(allLaps, original) : null;
    const comboLaps = pilotLaps.filter((lap) =>
      String(lap.car.id ?? lap.car.name) === String(combo.carId ?? combo.carName) &&
      String(lap.track.id ?? lap.track.name) === String(combo.trackId ?? combo.trackName)
    );
    return {
      ...combo,
      rank,
      totalLaps: comboLaps.length,
      validLaps: comboLaps.filter((lap) => lap.valid).length,
      cleanRate: percent(comboLaps.filter((lap) => lap.valid).length, comboLaps.length)
    };
  });
}

function buildPilotGarageStats(laps: PilotProfileLap[]) {
  const map = new Map<string, any>();
  for (const lap of laps) {
    const key = String(lap.car.id ?? lap.car.name);
    if (!map.has(key)) {
      map.set(key, {
        car: lap.car,
        totalLaps: 0,
        validLaps: 0,
        invalidLaps: 0,
        tracks: new Map(),
        bestLapMs: null,
        bestLap: null,
        bestLapDetails: null,
        maxSpeedKmh: null,
        lastSeenTimestamp: null,
        lastSeenAt: null
      });
    }
    const entry = map.get(key);
    entry.totalLaps += 1;
    lap.valid ? entry.validLaps += 1 : entry.invalidLaps += 1;
    if (lap.track.id !== null || lap.track.name) entry.tracks.set(String(lap.track.id ?? lap.track.name), lap.track);
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < Number(entry.bestLapMs))) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
      entry.bestLapDetails = compactLapForProfile(lap);
    }
    if (Number.isFinite(Number(lap.maxSpeedKmh)) && Number(lap.maxSpeedKmh) > Number(entry.maxSpeedKmh ?? 0)) entry.maxSpeedKmh = lap.maxSpeedKmh;
    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
    }
  }

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    tracksCount: entry.tracks.size,
    tracks: Array.from(entry.tracks.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    cleanRate: percent(entry.validLaps, entry.totalLaps)
  })).sort((a, b) => b.totalLaps - a.totalLaps || Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));
}

function buildPilotTrackStats(laps: PilotProfileLap[]) {
  const map = new Map<string, any>();
  for (const lap of laps) {
    const key = String(lap.track.id ?? lap.track.name);
    if (!map.has(key)) {
      map.set(key, {
        track: lap.track,
        totalLaps: 0,
        validLaps: 0,
        invalidLaps: 0,
        cars: new Map(),
        bestLapMs: null,
        bestLap: null,
        bestLapDetails: null,
        maxSpeedKmh: null,
        lastSeenTimestamp: null,
        lastSeenAt: null
      });
    }
    const entry = map.get(key);
    entry.totalLaps += 1;
    lap.valid ? entry.validLaps += 1 : entry.invalidLaps += 1;
    if (lap.car.id !== null || lap.car.name) entry.cars.set(String(lap.car.id ?? lap.car.name), lap.car);
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < Number(entry.bestLapMs))) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
      entry.bestLapDetails = compactLapForProfile(lap);
    }
    if (Number.isFinite(Number(lap.maxSpeedKmh)) && Number(lap.maxSpeedKmh) > Number(entry.maxSpeedKmh ?? 0)) entry.maxSpeedKmh = lap.maxSpeedKmh;
    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
    }
  }

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    carsCount: entry.cars.size,
    cars: Array.from(entry.cars.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    cleanRate: percent(entry.validLaps, entry.totalLaps)
  })).sort((a, b) => b.totalLaps - a.totalLaps || Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));
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

  const comboStats = enrichPilotCombosWithRanks(allLaps, pilotLaps);
  const garageStats = buildPilotGarageStats(pilotLaps);
  const circuitStats = buildPilotTrackStats(pilotLaps);
  const avgLapMs = average(lapTimes);
  const consistencyMs = standardDeviation(lapTimes);
  const maxSpeedKmh = speedValues.length ? Math.max(...speedValues) : null;
  const avgSpeedKmh = average(speedValues);
  const best10LapTimes = sortedFastest.slice(0, 10).map((lap) => Number(lap.lapTimeMs)).filter((value) => Number.isFinite(value));
  const best10AverageMs = average(best10LapTimes);
  const best10DeltaMs = best10AverageMs !== null && bestLap?.lapTimeMs ? best10AverageMs - Number(bestLap.lapTimeMs) : null;
  const totalCuts = pilotLaps.reduce((sum, lap) => sum + Math.max(0, Number(lap.cuts) || 0), 0);
  const avgCuts = pilotLaps.length ? Math.round((totalCuts / pilotLaps.length) * 100) / 100 : null;

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
      best10AverageMs,
      best10Average: best10AverageMs ? lapTimeToText(best10AverageMs) : '--',
      best10DeltaMs,
      best10Delta: lapTimeDeltaText(best10DeltaMs),
      totalCuts,
      avgCuts,
      cleanRate: percent(validLaps.length, pilotLaps.length),
      lastSeenAt: latestLap?.timestampIso ?? null,
      favoriteCar: garageStats[0] ?? carStats[0] ?? null,
      favoriteTrack: circuitStats[0] ?? trackStats[0] ?? null
    },
    recentLaps: sortedRecent.slice(0, 25).map(compactLapForProfile),
    bestCombos: comboStats.slice(0, 25),
    cars: garageStats.slice(0, 25),
    tracks: circuitStats.slice(0, 25),
    legacyCars: carStats.slice(0, 20),
    legacyTracks: trackStats.slice(0, 20),
    sectors: bestSectors,
    message: user.pilotLink
      ? 'Perfil Pro generado desde la cuenta web y stracker.db3.'
      : 'Cuenta activa sin piloto vinculado todavÃ­a.'
  };
}


function buildPublicPilotProfile(playerIdRaw: unknown, allLaps: PilotProfileLap[]) {
  const playerId = Number(playerIdRaw);
  if (!Number.isFinite(playerId) || playerId <= 0) return null;

  const pilotLaps = allLaps.filter((lap) => Number(lap.driver?.id) === playerId);
  if (!pilotLaps.length) return null;

  const driver = pilotLaps[0].driver;
  const now = new Date().toISOString();
  const fakeUser: AppUser = {
    id: `public-${playerId}`,
    email: '',
    displayName: driver.name || `Piloto ${playerId}`,
    role: 'pilot',
    password: {
      algorithm: 'pbkdf2-sha256',
      iterations: 0,
      salt: '',
      hash: ''
    },
    pilotLink: {
      playerId,
      steamGuid: compactNullableText(driver.steamGuid),
      strackerName: driver.name || `Piloto ${playerId}`,
      linkedAt: ''
    },
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  const fakeSession: AppSession = {
    id: `public-${playerId}`,
    userId: fakeUser.id,
    tokenHash: '',
    createdAt: now,
    expiresAt: now,
    lastSeenAt: now
  };

  const profile = buildPilotProProfile(fakeUser, fakeSession, allLaps);

  return {
    ...profile,
    public: true,
    authenticated: false,
    user: null,
    session: null,
    message: 'Perfil pÃºblico generado desde stracker.db3.'
  };
}

async function resolvePilotLink(playerIdRaw: unknown) {
  const playerId = Number(playerIdRaw);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return { ok: false as const, message: 'El piloto seleccionado no es vÃ¡lido.' };
  }

  const stracker = getStrackerConfig();
  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    return { ok: false as const, message: 'No hay stracker.db3 vÃ¡lido para vincular piloto.' };
  }

  const pilot = await getPilotStatsByPlayerId(stracker.resolvedPath, playerId);
  if (!pilot) {
    return { ok: false as const, message: 'No se encontrÃ³ ese piloto en stracker.db3.' };
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


type ComboLap = ReturnType<typeof mapLapRow>;

function getComboKeyFromParts(trackId: unknown, carId: unknown) {
  const track = Number(trackId);
  const car = Number(carId);
  if (!Number.isFinite(track) || !Number.isFinite(car) || track <= 0 || car <= 0) return null;
  return `${track}-${car}`;
}

function getComboKeyFromLap(lap: ComboLap) {
  return getComboKeyFromParts(lap.track?.id, lap.car?.id);
}

function getComboIdFromLap(lap: ComboLap) {
  const comboId = Number(lap.comboId);
  return Number.isFinite(comboId) && comboId > 0 ? comboId : null;
}

function getComboUrlFromLap(lap: ComboLap) {
  const comboId = getComboIdFromLap(lap);
  if (comboId) return `/combos/${comboId}`;

  const legacyKey = getComboKeyFromLap(lap);
  return legacyKey ? `/combos/${lap.track?.id}/${lap.car?.id}` : null;
}

function compactLapForCombo(lap: ComboLap | null) {
  if (!lap) return null;
  return {
    lapId: lap.lapId,
    playerId: lap.driver?.id ?? null,
    driverId: lap.driver?.id ?? null,
    driverName: lap.driver?.name ?? null,
    playerName: lap.driver?.name ?? null,
    steamGuid: lap.driver?.steamGuid ?? null,
    comboId: lap.comboId ?? null,
    carId: lap.car?.id ?? null,
    carName: lap.car?.name ?? null,
    carCode: lap.car?.code ?? null,
    trackId: lap.track?.id ?? null,
    trackName: lap.track?.name ?? null,
    trackCode: lap.track?.code ?? null,
    comboKey: getComboKeyFromLap(lap),
    comboUrl: getComboUrlFromLap(lap),
    lapTimeMs: lap.lapTimeMs,
    lapTime: lap.lapTime,
    lapTimeFormatted: lap.lapTime,
    valid: lap.valid,
    isValid: lap.valid,
    maxSpeedKmh: lap.maxSpeedKmh,
    cuts: lap.cuts,
    collisionsCar: lap.collisionsCar,
    collisionsEnv: lap.collisionsEnv,
    gripLevel: lap.gripLevel,
    temperatureTrack: lap.temperatureTrack,
    temperatureAmbient: lap.temperatureAmbient,
    timestamp: lap.timestamp,
    timestampIso: lap.timestampIso,
    session: lap.session,
    input: lap.input,
    driver: lap.driver,
    car: lap.car,
    track: lap.track
  };
}

function buildComboLeaderboard(comboLaps: ComboLap[]) {
  const bestByDriver = new Map<string, ComboLap>();

  for (const lap of comboLaps) {
    if (!lap.valid) continue;
    const driverKey = String(lap.driver?.id ?? lap.driver?.name ?? 'unknown');
    const current = bestByDriver.get(driverKey);
    if (!current || Number(lap.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      bestByDriver.set(driverKey, lap);
    }
  }

  const ranked = Array.from(bestByDriver.values())
    .sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  const bestMs = Number(ranked[0]?.lapTimeMs ?? NaN);

  return ranked.map((lap, index) => {
    const lapMs = Number(lap.lapTimeMs ?? NaN);
    const deltaMs = Number.isFinite(bestMs) && Number.isFinite(lapMs) ? lapMs - bestMs : null;
    return {
      position: index + 1,
      deltaMs,
      delta: deltaMs === null ? '--' : lapTimeDeltaText(deltaMs),
      ...compactLapForCombo(lap)
    };
  });
}

function carSummaryFromCars(cars: any[]) {
  const clean = (cars || []).filter((car) => car && (car.name || car.code));
  if (!clean.length) return 'Sin coches detectados';
  if (clean.length === 1) return clean[0].name || clean[0].code;
  if (clean.length <= 3) return clean.map((car) => car.name || car.code).join(' + ');
  return `${clean.length} coches Â· ${clean.slice(0, 2).map((car) => car.name || car.code).join(' + ')} + ${clean.length - 2} mÃ¡s`;
}

function comboDefinitionMap(comboDefinitions: any[] = []) {
  const map = new Map<string, any>();
  for (const combo of comboDefinitions || []) {
    if (combo?.id === null || combo?.id === undefined) continue;
    map.set(String(combo.id), combo);
  }
  return map;
}


const LOGICAL_COMBO_NEW_CAR_THRESHOLD = 0.75;

function comboTrackKey(combo: any) {
  return String(combo?.track?.id ?? combo?.trackId ?? combo?.track?.code ?? combo?.track?.name ?? 'unknown-track');
}

function comboCarIdentity(car: any) {
  const id = Number(car?.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  return String(car?.code ?? car?.name ?? '').trim().toLowerCase();
}

function comboCarIdentitySet(cars: any[] = []) {
  const set = new Set<string>();
  for (const car of cars || []) {
    const key = comboCarIdentity(car);
    if (key) set.add(key);
  }
  return set;
}

function comboNewCarRatio(baseCars: any[] = [], candidateCars: any[] = []) {
  const baseSet = comboCarIdentitySet(baseCars);
  const candidateSet = comboCarIdentitySet(candidateCars);
  if (!candidateSet.size) return 0;
  let newCars = 0;
  for (const carKey of candidateSet) {
    if (!baseSet.has(carKey)) newCars += 1;
  }
  return newCars / candidateSet.size;
}

function comboOverlapCount(baseCars: any[] = [], candidateCars: any[] = []) {
  const baseSet = comboCarIdentitySet(baseCars);
  const candidateSet = comboCarIdentitySet(candidateCars);
  let overlap = 0;
  for (const carKey of candidateSet) {
    if (baseSet.has(carKey)) overlap += 1;
  }
  return overlap;
}

function mergeComboCars(baseCars: any[] = [], candidateCars: any[] = []) {
  const map = new Map<string, any>();
  for (const car of [...(baseCars || []), ...(candidateCars || [])]) {
    const key = comboCarIdentity(car);
    if (!key) continue;
    if (!map.has(key)) map.set(key, car);
  }
  return Array.from(map.values()).sort((a, b) => String(a?.name || a?.code || '').localeCompare(String(b?.name || b?.code || '')));
}

function buildLogicalComboDefinitions(comboDefinitions: any[] = []) {
  const sorted = [...(comboDefinitions || [])]
    .filter((combo) => combo && combo.id !== null && combo.id !== undefined)
    .sort((a, b) => {
      const trackA = Number(a?.track?.id ?? a?.trackId ?? 0);
      const trackB = Number(b?.track?.id ?? b?.trackId ?? 0);
      if (trackA !== trackB) return trackA - trackB;
      return Number(a?.id ?? 0) - Number(b?.id ?? 0);
    });

  const familiesByTrack = new Map<string, any[]>();

  for (const combo of sorted) {
    const trackKey = comboTrackKey(combo);
    if (!familiesByTrack.has(trackKey)) familiesByTrack.set(trackKey, []);
    const families = familiesByTrack.get(trackKey)!;
    const candidateCars = Array.isArray(combo.cars) ? combo.cars : [];

    let bestFamily: any = null;
    let bestScore = { newRatio: Number.POSITIVE_INFINITY, overlap: -1 };

    for (const family of families) {
      const newRatio = comboNewCarRatio(family.cars, candidateCars);
      const overlap = comboOverlapCount(family.cars, candidateCars);
      if (newRatio < LOGICAL_COMBO_NEW_CAR_THRESHOLD) {
        if (!bestFamily || newRatio < bestScore.newRatio || (newRatio === bestScore.newRatio && overlap > bestScore.overlap)) {
          bestFamily = family;
          bestScore = { newRatio, overlap };
        }
      }
    }

    if (bestFamily) {
      const comboMemberIds = Array.isArray(combo.memberComboIds) && combo.memberComboIds.length ? combo.memberComboIds : [combo.id];
      bestFamily.memberComboIds = Array.from(new Set([...(bestFamily.memberComboIds || []), ...comboMemberIds.map((id: any) => Number(id))].filter((id) => Number.isFinite(Number(id))))).sort((a: number, b: number) => a - b);
      bestFamily.cars = mergeComboCars(bestFamily.cars, candidateCars);
      bestFamily.carIds = bestFamily.cars.map((car: any) => car.id).filter((id: any) => id !== null && id !== undefined);
      bestFamily.mergedCombosCount = bestFamily.memberComboIds.length;
      bestFamily.sourceCombos = [...(bestFamily.sourceCombos || []), combo];
      continue;
    }

    const canonicalComboId = Number(combo.canonicalComboId ?? combo.id);
    const comboMemberIds = Array.isArray(combo.memberComboIds) && combo.memberComboIds.length
      ? combo.memberComboIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id)).sort((a: number, b: number) => a - b)
      : [canonicalComboId];

    families.push({
      ...combo,
      id: canonicalComboId,
      comboId: canonicalComboId,
      canonicalComboId,
      memberComboIds: comboMemberIds,
      mergedCombosCount: comboMemberIds.length,
      sourceCombos: [combo],
      carIds: candidateCars.map((car: any) => car.id).filter((id: any) => id !== null && id !== undefined),
      mergePolicy: {
        type: 'similar-car-pack',
        newCarThreshold: LOGICAL_COMBO_NEW_CAR_THRESHOLD,
        newCarThresholdPercent: Math.round(LOGICAL_COMBO_NEW_CAR_THRESHOLD * 100),
        description: 'Mismo circuito: si menos del 75% de los coches son nuevos, se considera el mismo combo lÃ³gico.'
      }
    });
  }

  return Array.from(familiesByTrack.values()).flat().map((family) => ({
    ...family,
    cars: mergeComboCars(family.cars, []),
    carSummary: carSummaryFromCars(family.cars),
    url: `/combos/${family.canonicalComboId ?? family.id}`
  }));
}

function logicalComboFamilyMap(comboDefinitions: any[] = []) {
  const families = buildLogicalComboDefinitions(comboDefinitions);
  const byMemberId = new Map<string, any>();
  const byCanonicalId = new Map<string, any>();
  for (const family of families) {
    const canonicalId = family.canonicalComboId ?? family.id;
    byCanonicalId.set(String(canonicalId), family);
    for (const id of family.memberComboIds || [canonicalId]) byMemberId.set(String(id), family);
  }
  return { families, byMemberId, byCanonicalId };
}

function createComboStatsEntryFromDefinition(combo: any) {
  const comboId = Number(combo?.canonicalComboId ?? combo?.id);
  const cars = Array.isArray(combo?.cars) ? combo.cars : [];
  const memberComboIds = Array.isArray(combo?.memberComboIds) && combo.memberComboIds.length
    ? combo.memberComboIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id)).sort((a: number, b: number) => a - b)
    : [comboId];
  return {
    key: `combo:${comboId}`,
    comboId,
    canonicalComboId: comboId,
    memberComboIds,
    mergedCombosCount: memberComboIds.length,
    mergePolicy: combo?.mergePolicy ?? null,
    url: `/combos/${comboId}`,
    trackId: combo?.track?.id ?? null,
    carId: null,
    track: combo?.track ?? null,
    car: null,
    cars,
    carIds: cars.map((car: any) => car.id).filter((id: any) => id !== null && id !== undefined),
    carSummary: carSummaryFromCars(cars),
    totalLaps: 0,
    validLaps: 0,
    invalidLaps: 0,
    drivers: new Map(),
    sessions: new Set(),
    usedCars: new Map(),
    bestLap: null,
    bestLapMs: null,
    bestLapTime: '--',
    latestLap: null,
    lastSeenTimestamp: null,
    lastSeenAt: null,
    maxSpeedKmh: null,
    totalCuts: 0,
    laps: []
  };
}

function createComboStatsEntryFromLap(lap: ComboLap) {
  const comboId = getComboIdFromLap(lap);
  const legacyKey = getComboKeyFromLap(lap);
  const key = comboId ? `combo:${comboId}` : `legacy:${legacyKey}`;
  const cars = lap.car?.id ? [lap.car] : [];
  return {
    key,
    comboId,
    canonicalComboId: comboId,
    memberComboIds: comboId ? [comboId] : [],
    mergedCombosCount: comboId ? 1 : 0,
    mergePolicy: null,
    url: comboId ? `/combos/${comboId}` : getComboUrlFromLap(lap),
    trackId: lap.track?.id ?? null,
    carId: comboId ? null : (lap.car?.id ?? null),
    track: lap.track,
    car: comboId ? null : lap.car,
    cars,
    carIds: cars.map((car: any) => car.id).filter((id: any) => id !== null && id !== undefined),
    carSummary: carSummaryFromCars(cars),
    totalLaps: 0,
    validLaps: 0,
    invalidLaps: 0,
    drivers: new Map(),
    sessions: new Set(),
    usedCars: new Map(),
    bestLap: null,
    bestLapMs: null,
    bestLapTime: '--',
    latestLap: null,
    lastSeenTimestamp: null,
    lastSeenAt: null,
    maxSpeedKmh: null,
    totalCuts: 0,
    laps: []
  };
}

function normalizeComboEntryForResponse(entry: any) {
  const leaderboard = buildComboLeaderboard(entry.laps);
  const validTimes = entry.laps
    .filter((lap: ComboLap) => lap.valid)
    .map((lap: ComboLap) => Number(lap.lapTimeMs))
    .filter((value: number) => Number.isFinite(value) && value > 0);
  const best10 = validTimes.sort((a: number, b: number) => a - b).slice(0, 10);
  const best10AverageMs = average(best10);
  const allowedCars = Array.isArray(entry.cars) ? entry.cars : [];
  const usedCars = Array.from(entry.usedCars.values());
  const cars = allowedCars.length ? allowedCars : usedCars;

  return {
    key: entry.key,
    url: entry.url,
    comboId: entry.comboId,
    canonicalComboId: entry.canonicalComboId ?? entry.comboId,
    memberComboIds: entry.memberComboIds || (entry.comboId ? [entry.comboId] : []),
    mergedCombosCount: entry.mergedCombosCount || ((entry.memberComboIds || []).length),
    mergePolicy: entry.mergePolicy || null,
    trackId: entry.trackId,
    carId: entry.carId,
    track: entry.track,
    car: entry.car,
    cars,
    usedCars,
    carIds: cars.map((car: any) => car?.id).filter((id: any) => id !== null && id !== undefined),
    carsCount: cars.length,
    usedCarsCount: usedCars.length,
    carSummary: carSummaryFromCars(cars),
    usedCarSummary: carSummaryFromCars(usedCars),
    totalLaps: entry.totalLaps,
    validLaps: entry.validLaps,
    invalidLaps: entry.invalidLaps,
    cleanRate: percent(entry.validLaps, entry.totalLaps),
    driversCount: entry.drivers.size,
    sessionsCount: entry.sessions.size,
    bestLap: entry.bestLap,
    bestLapMs: entry.bestLapMs,
    bestLapTime: entry.bestLapTime,
    latestLap: entry.latestLap,
    lastSeenAt: entry.lastSeenAt,
    lastSeenTimestamp: entry.lastSeenTimestamp,
    maxSpeedKmh: entry.maxSpeedKmh,
    totalCuts: entry.totalCuts,
    best10AverageMs,
    best10Average: best10AverageMs ? lapTimeToText(best10AverageMs) : '--',
    leaderboardTop: leaderboard.slice(0, 5),
    leaderboardCount: leaderboard.length
  };
}

function buildComboStatsFromLaps(allLaps: ComboLap[], comboDefinitions: any[] = []) {
  const map = new Map<string, any>();
  const { families: logicalDefinitions, byMemberId } = logicalComboFamilyMap(comboDefinitions);

  for (const definition of logicalDefinitions || []) {
    if (definition?.id === null || definition?.id === undefined) continue;
    const entry = createComboStatsEntryFromDefinition(definition);
    map.set(String(entry.key), entry);
  }

  for (const lap of allLaps) {
    const rawComboId = getComboIdFromLap(lap);
    const legacyKey = getComboKeyFromLap(lap);
    if (!rawComboId && !legacyKey) continue;

    const family = rawComboId ? byMemberId.get(String(rawComboId)) : null;
    const canonicalComboId = family ? Number(family.canonicalComboId ?? family.id) : rawComboId;
    const key = canonicalComboId ? `combo:${canonicalComboId}` : `legacy:${legacyKey}`;

    if (!map.has(key)) {
      map.set(key, family ? createComboStatsEntryFromDefinition(family) : createComboStatsEntryFromLap(lap));
    }

    const entry = map.get(key);
    entry.totalLaps += 1;
    lap.valid ? entry.validLaps += 1 : entry.invalidLaps += 1;
    entry.totalCuts += Math.max(0, Number(lap.cuts) || 0);
    if (lap.driver?.id !== null && lap.driver?.id !== undefined) entry.drivers.set(String(lap.driver.id), lap.driver);
    if (lap.sessionId !== null && lap.sessionId !== undefined) entry.sessions.add(String(lap.sessionId));
    if (lap.car?.id !== null && lap.car?.id !== undefined) entry.usedCars.set(String(lap.car.id), lap.car);
    if (Number.isFinite(Number(lap.maxSpeedKmh)) && Number(lap.maxSpeedKmh) > Number(entry.maxSpeedKmh ?? 0)) {
      entry.maxSpeedKmh = lap.maxSpeedKmh;
    }
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < Number(entry.bestLapMs))) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLapTime = lap.lapTime;
      entry.bestLap = compactLapForCombo({ ...lap, comboId: canonicalComboId ?? lap.comboId });
    }
    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
      entry.latestLap = compactLapForCombo({ ...lap, comboId: canonicalComboId ?? lap.comboId });
    }
    entry.laps.push({ ...lap, comboId: canonicalComboId ?? lap.comboId, rawComboId: rawComboId ?? null });
  }

  return Array.from(map.values())
    .map(normalizeComboEntryForResponse)
    .sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0));
}

function buildComboProfile(comboIdRaw: unknown, allLaps: ComboLap[], comboDefinitions: any[] = []) {
  const requestedComboId = Number(comboIdRaw);
  if (!Number.isFinite(requestedComboId) || requestedComboId <= 0) return null;

  const { byMemberId } = logicalComboFamilyMap(comboDefinitions);
  const family = byMemberId.get(String(requestedComboId));
  const canonicalComboId = Number(family?.canonicalComboId ?? family?.id ?? requestedComboId);
  const memberComboIds = new Set((family?.memberComboIds || [requestedComboId]).map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id)));
  const comboLaps = allLaps.filter((lap) => {
    const lapComboId = getComboIdFromLap(lap);
    return lapComboId !== null && memberComboIds.has(lapComboId);
  });
  if (!comboLaps.length && !family) return null;

  const stats = buildComboStatsFromLaps(comboLaps, family ? [family] : []);
  const summary = stats.find((item) => Number(item.comboId) === canonicalComboId) || stats[0] || null;
  if (!summary) return null;

  const normalizedLaps = comboLaps.map((lap) => ({ ...lap, comboId: canonicalComboId, rawComboId: getComboIdFromLap(lap) }));
  const leaderboard = buildComboLeaderboard(normalizedLaps as ComboLap[]);
  const recentLaps = [...normalizedLaps]
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
    .slice(0, 50)
    .map(compactLapForCombo);

  const drivers = reduceDriverStats(normalizedLaps as ComboLap[]).slice(0, 30);
  const invalidHotspots = normalizedLaps
    .filter((lap) => !lap.valid || Number(lap.cuts ?? 0) > 0)
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
    .slice(0, 25)
    .map(compactLapForCombo);

  return {
    key: summary.key,
    comboId: canonicalComboId,
    canonicalComboId,
    requestedComboId,
    memberComboIds: summary.memberComboIds || Array.from(memberComboIds),
    mergedCombosCount: summary.mergedCombosCount || memberComboIds.size,
    mergePolicy: summary.mergePolicy || family?.mergePolicy || null,
    trackId: summary.trackId,
    track: summary.track,
    cars: summary.cars,
    usedCars: summary.usedCars,
    carSummary: summary.carSummary,
    usedCarSummary: summary.usedCarSummary,
    summary,
    leaderboard,
    recentLaps,
    drivers,
    invalidHotspots,
    message: 'Combo lÃ³gico generado desde stracker.db3: mismo circuito y paquete de coches compatible. Si el 75% de los coches son nuevos, se crea otro combo.'
  };
}

function buildLegacyComboProfile(trackIdRaw: unknown, carIdRaw: unknown, allLaps: ComboLap[]) {
  const key = getComboKeyFromParts(trackIdRaw, carIdRaw);
  if (!key) return null;

  const comboLaps = allLaps.filter((lap) => getComboKeyFromLap(lap) === key);
  if (!comboLaps.length) return null;

  const summary = buildComboStatsFromLaps(comboLaps)[0];
  const leaderboard = buildComboLeaderboard(comboLaps);
  const recentLaps = [...comboLaps]
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
    .slice(0, 50)
    .map(compactLapForCombo);

  const drivers = reduceDriverStats(comboLaps).slice(0, 30);
  const invalidHotspots = comboLaps
    .filter((lap) => !lap.valid || Number(lap.cuts ?? 0) > 0)
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
    .slice(0, 25)
    .map(compactLapForCombo);

  return {
    key,
    trackId: summary.trackId,
    carId: summary.carId,
    comboId: summary.comboId,
    track: summary.track,
    car: summary.car,
    cars: summary.cars,
    carSummary: summary.carSummary,
    summary,
    leaderboard,
    recentLaps,
    drivers,
    invalidHotspots,
    legacy: true,
    message: 'Vista legacy TrackId + CarId. Usa /combos/:comboId para el combo real.'
  };
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

/* GC_PILOT_SOCIAL_IMAGE_EXPRESS_V15_30_5 START */
function gcPilotSocialDefaultAvatarBuffer() {
  const relative = String(DEFAULT_PILOT_AVATAR_URL || '/images/pilot-avatar-default.png')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
  const filePath = path.join(rootDir, 'public', relative);
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);

  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#07110a"/><circle cx="256" cy="208" r="86" fill="#9cff3f"/><path d="M112 440c25-93 91-136 144-136s119 43 144 136" fill="#9cff3f"/></svg>'
  );
}

function gcPilotSocialMaskSvg(size: number) {
  const radius = size / 2;
  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg"><circle cx="' + radius + '" cy="' + radius + '" r="' + radius + '" fill="#fff"/></svg>'
  );
}

function gcPilotSocialBackgroundSvg(width: number, height: number) {
  return Buffer.from(
    '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<radialGradient id="g1" cx="50%" cy="48%" r="56%">' +
          '<stop offset="0%" stop-color="#16351e"/>' +
          '<stop offset="48%" stop-color="#07130a"/>' +
          '<stop offset="100%" stop-color="#020503"/>' +
        '</radialGradient>' +
        '<radialGradient id="g2" cx="50%" cy="48%" r="38%">' +
          '<stop offset="0%" stop-color="#9cff3f" stop-opacity=".22"/>' +
          '<stop offset="68%" stop-color="#9cff3f" stop-opacity=".05"/>' +
          '<stop offset="100%" stop-color="#9cff3f" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>' +
      '</defs>' +
      '<rect width="' + width + '" height="' + height + '" fill="url(#g1)"/>' +
      '<circle cx="600" cy="315" r="270" fill="url(#g2)" filter="url(#blur)"/>' +
      '<circle cx="600" cy="315" r="253" fill="none" stroke="#9cff3f" stroke-opacity=".30" stroke-width="2"/>' +
      '<circle cx="600" cy="315" r="262" fill="none" stroke="#45f1db" stroke-opacity=".12" stroke-width="1"/>' +
    '</svg>'
  );
}

function gcPilotSocialFrameSvg(size: number) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#9cff3f" stroke-width="10" stroke-opacity=".92"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 13) + '" fill="none" stroke="#45f1db" stroke-width="3" stroke-opacity=".42"/>' +
    '</svg>'
  );
}

async function gcBuildPilotSocialImage(playerId: string) {
  const width = 1200;
  const height = 630;
  const avatarSize = 472;
  const storedAvatar = readAvatarImage(playerId);
  const sourceBuffer = storedAvatar?.buffer || gcPilotSocialDefaultAvatarBuffer();
  const sharpModule: any = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;

  const avatar = await sharp(sourceBuffer)
    .resize(avatarSize, avatarSize, { fit: 'cover' })
    .png()
    .composite([{ input: gcPilotSocialMaskSvg(avatarSize), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const left = Math.round((width - avatarSize) / 2);
  const top = Math.round((height - avatarSize) / 2);

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#050805',
    },
  })
    .composite([
      { input: gcPilotSocialBackgroundSvg(width, height), left: 0, top: 0 },
      { input: avatar, left, top },
      { input: gcPilotSocialFrameSvg(avatarSize), left, top },
    ])
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
}

app.get(['/api/pilot-social-image/:playerId.png', '/api/pilot-social-image/:playerId'], async (req, res) => {
  const playerId = String(req.params.playerId || '').replace(/\.png$/i, '').trim();

  if (!/^[0-9]+$/.test(playerId)) {
    res.status(400).type('text/plain').send('Invalid pilot id');
    return;
  }

  try {
    const image = await gcBuildPilotSocialImage(playerId);
    res
      .status(200)
      .setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('X-GC-Social-Image', 'pilot-avatar-express-v15.30.5');
    res.send(image);
  } catch (error) {
    console.error('[GC] Error generando pilot social image express:', error);

    const fallback = readAvatarImage(playerId);
    if (fallback?.buffer) {
      res.status(200);
      res.setHeader('Content-Type', fallback.contentType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-GC-Social-Image', 'pilot-avatar-raw-fallback-v15.30.5');
      res.send(fallback.buffer);
      return;
    }

    res.redirect(302, DEFAULT_PILOT_AVATAR_URL);
  }
});
/* GC_PILOT_SOCIAL_IMAGE_EXPRESS_V15_30_5 END */


app.use((req, res, next) => {
  const started = Date.now();
  const url = req.originalUrl || req.url || '';

  if ((req.method === 'GET' || req.method === 'HEAD') && gcIsCachedPublicApi(url)) {
    const maxAge = gcPublicHttpCacheSeconds();
    const stale = gcPublicHttpStaleSeconds();

    if (maxAge > 0) {
      res.setHeader('Cache-Control', 'public, max-age=' + maxAge + ', stale-while-revalidate=' + stale);
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-GC-Perf-Cache', 'public-api-v15.29.3');
  }

  res.on('finish', () => {
    if (!gcPerformanceLogEnabled()) return;
    const elapsed = Date.now() - started;
    if (elapsed >= gcPerfNumberEnv('GC_PERF_SLOW_MS', 300, 0, 10000)) {
      console.log('[GC PERF] ' + req.method + ' ' + url + ' -> ' + res.statusCode + ' · ' + elapsed + 'ms');
    }
  });

  next();
});

// GC ACSR/ACSM championship community integration v3.1
registerAcsmChampionshipRoutes(app);

/* GC Archivo Motorsport persistent archive-media static mount v8.4.1 */
{
  const gcArchiveMediaDir = process.env.ARCHIVE_MEDIA_DIR?.trim()
    ? path.resolve(process.env.ARCHIVE_MEDIA_DIR.trim())
    : path.join(rootDir, 'public', 'archive-media');

  if (fs.existsSync(gcArchiveMediaDir)) {
    app.use('/archive-media', express.static(gcArchiveMediaDir, {
      index: false,
      immutable: true,
      maxAge: '30d'
    }));
  }
}




// GC Admin user/profile link routes.
registerAdminUserProfileLinkRoutes(app, { rootDir });


// GC Archivo Motorsport hard-delete route must be registered before legacy archive routes.
registerMotorsportArchiveHardDeleteRoutes(app, { rootDir });


/* GC Archivo Motorsport archive-media static mount */
const archiveMediaDir = process.env.ARCHIVE_MEDIA_DIR?.trim()
  ? path.resolve(process.env.ARCHIVE_MEDIA_DIR.trim())
  : path.join(rootDir, 'public', 'archive-media');

if (fs.existsSync(archiveMediaDir)) {
  app.use('/archive-media', express.static(archiveMediaDir, {
    index: false,
    immutable: true,
    maxAge: '30d'
  }));
}


// GC ACSM PRIORITY MYSQL GUARD V6 START
async function gcAcsmV6ResolveAdmin(req: any) {
  const access = await getCurrentAdminAccess(req as express.Request);
  return {
    authenticated: access.authenticated,
    authorized: access.authorized,
    currentUser: access.user ? publicUser(access.user) : null,
    message: access.ok ? 'OK' : access.message
  };
}

app.get('/api/admin/acsm/status', async (req: any, res: any) => {
  try {
    const auth = await gcAcsmV6ResolveAdmin(req);
    if (!auth.authenticated) return res.status(401).json({ ok: false, authenticated: false, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Login requerido.' });
    if (!auth.authorized) return res.status(403).json({ ok: false, authenticated: true, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Acceso admin requerido.' });

    const config: any = typeof gcAcsmSafeConfigV1 === 'function' ? gcAcsmSafeConfigV1() : { available: false };
    let currentCombo: any = null;
    let readError: string | null = null;
    if (config?.hostConfigured && config?.userConfigured && config?.passwordConfigured && typeof gcAcsmReadCurrentComboV1 === 'function') {
      try {
        const current = await gcAcsmReadCurrentComboV1();
        currentCombo = current?.event || null;
      } catch (error: any) {
        readError = error?.message || String(error);
      }
    }

    res.json({
      ok: true,
      authenticated: true,
      authorized: true,
      source: 'acsm-priority-mysql-guard-v6',
      currentUser: auth.currentUser || null,
      config,
      currentCombo,
      readError
    });
  } catch (error: any) {
    console.error('[GC] Error ACSM status v6:', error);
    res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: error?.message || 'No se pudo comprobar ACSM.' });
  }
});

app.post('/api/admin/acsm/sync-current-combo', async (req: any, res: any) => {
  try {
    const auth = await gcAcsmV6ResolveAdmin(req);
    if (!auth.authenticated) return res.status(401).json({ ok: false, authenticated: false, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Login requerido.' });
    if (!auth.authorized) return res.status(403).json({ ok: false, authenticated: true, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Acceso admin requerido.' });

    if (typeof gcAcsmSyncCurrentComboV1 !== 'function') {
      return res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: 'No se encontraron las funciones de sincronizaciÃ³n ACSM. Aplica primero el pack ACSM current combo sync.' });
    }

    const result: any = await gcAcsmSyncCurrentComboV1();
    res.json({
      ...result,
      ok: result?.ok !== false,
      authenticated: true,
      authorized: true,
      guardSource: 'acsm-priority-mysql-guard-v6',
      currentUser: auth.currentUser || null
    });
  } catch (error: any) {
    console.error('[GC] Error sincronizando combo ACSM v6:', error);
    res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: error?.message || 'No se pudo sincronizar el combo desde ACSM.' });
  }
});
// GC ACSM PRIORITY MYSQL GUARD V6 END

// GC ACSM PROFILE GUARD ROUTES V4 START
// Rutas ACSM heredadas neutralizadas: delegan en el guard admin unificado de gc_session.
function gcAcsmGetLocalFunctionV4(name: string) {
  try {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
    return eval('typeof ' + name + ' !== "undefined" ? ' + name + ' : null');
  } catch {
    return null;
  }
}

async function gcAcsmRequireAdminFromProfileV4(req: any, res: any) {
  const context = await requireAdmin(req as express.Request, res as express.Response);
  return context ? publicUser(context.user) : null;
}

app.get('/api/admin/acsm/status', async (req: any, res: any) => {
  const adminUser = await gcAcsmRequireAdminFromProfileV4(req, res);
  if (!adminUser) return;

  try {
    const safeConfig = gcAcsmGetLocalFunctionV4('gcAcsmSafeConfigV1');
    const readCurrentCombo = gcAcsmGetLocalFunctionV4('gcAcsmReadCurrentComboV1');
    const config = typeof safeConfig === 'function' ? safeConfig() : { configured: false, message: 'Funciones ACSM no encontradas.' };
    let currentCombo = null;

    if (typeof readCurrentCombo === 'function') {
      try {
        const result = await readCurrentCombo();
        currentCombo = result?.event || result || null;
      } catch (error: any) {
        currentCombo = { ok: false, message: error?.message || 'No se pudo leer el combo actual.' };
      }
    }

    res.json({
      ok: true,
      authenticated: true,
      authorized: true,
      source: 'acsm-profile-guard-v4',
      currentUser: adminUser,
      config,
      currentCombo
    });
  } catch (error: any) {
    console.error('[GC] Error comprobando ACSM v4:', error);
    res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: error?.message || 'No se pudo comprobar ACSM.' });
  }
});

app.post('/api/admin/acsm/sync-current-combo', async (req: any, res: any) => {
  const adminUser = await gcAcsmRequireAdminFromProfileV4(req, res);
  if (!adminUser) return;

  try {
    const syncCurrentCombo = gcAcsmGetLocalFunctionV4('gcAcsmSyncCurrentComboV1') || gcAcsmGetLocalFunctionV4('gcAcsmSyncCurrentComboV2');
    if (typeof syncCurrentCombo !== 'function') {
      res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: 'No se encontraron las funciones de sincronizaciÃ³n ACSM. Aplica primero el pack ACSM current combo sync.' });
      return;
    }

    const result = await syncCurrentCombo();
    res.json({
      ok: result?.ok !== false,
      authenticated: true,
      authorized: true,
      source: 'acsm-profile-guard-v4',
      currentUser: adminUser,
      ...result
    });
  } catch (error: any) {
    console.error('[GC] Error sincronizando combo ACSM v4:', error);
    res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: error?.message || 'No se pudo sincronizar el combo desde ACSM.' });
  }
});
// GC ACSM PROFILE GUARD ROUTES V4 END


// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START
async function gcCompatResolveCurrentUser(req: express.Request) {
  const context = await getAuthContextAsync(req as express.Request);
  return context?.user || null;
}

async function gcCompatAdminSnapshot(req: express.Request) {
  const store = await readUserStoreAsync();
  const currentUser = await gcCompatResolveCurrentUser(req);
  const summary = getUserStoreAdminSummary(store);
  const authorized = isAdminUser(currentUser);

  return {
    ok: true,
    authenticated: Boolean(currentUser),
    authorized,
    setupRequired: summary.setupRequired,
    setupSecretConfigured: Boolean(getAdminSetupSecret()),
    currentUser: currentUser ? publicUser(currentUser) : null,
    summary,
    admin: authorized
      ? {
          modules: typeof getModules === 'function' ? getModules() : null,
          users: summary,
          displayNames: typeof getDisplayNamesDbInfo === 'function' ? getDisplayNamesDbInfo() : null,
          storage: typeof getAppStorageStatus === 'function' ? getAppStorageStatus() : null,
          stracker: typeof getStrackerConfig === 'function' ? getStrackerConfig() : null
        }
      : null,
    source: 'unified-admin-session'
  };
}

function gcCompatCalendarStorageInfo() {
  const source = getAppStorageDriverLabel();
  const base = {
    source,
    persistent: source === 'mysql' || source === 'sqlite' || !isPathInside(getCalendarEventsPath(), rootDir),
    checkedAt: new Date().toISOString()
  };

  if (source === 'mysql') {
    return {
      ...base,
      table: 'gc_calendar_events',
      mysql: getMysqlStorageSafeConfig()
    };
  }

  if (source === 'sqlite') {
    return {
      ...base,
      table: 'gc_calendar_events',
      sqlite: getSqliteStorageSafeConfig()
    };
  }

  const calendarPath = getCalendarEventsPath();
  const exists = fs.existsSync(calendarPath);
  const stats = exists ? fs.statSync(calendarPath) : null;
  return {
    ...base,
    path: calendarPath,
    insideProject: isPathInside(calendarPath, rootDir),
    exists,
    sizeBytes: stats?.size || 0,
    modifiedAt: stats?.mtime?.toISOString?.() || null,
    warning: isPathInside(calendarPath, rootDir)
      ? 'El calendario estÃ¡ en JSON dentro del proyecto. Usa APP_STORAGE_DRIVER=mysql o APP_CALENDAR_EVENTS_PATH fuera del deploy.'
      : null
  };
}

app.get('/api/admin/performance/cache', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const stracker = getStrackerConfig();
  res.json({
    ok: true,
    cache: gcCacheInfo(),
    stracker: {
      exists: stracker.exists,
      validSQLite: stracker.validSQLite,
      sizeBytes: stracker.sizeBytes,
      modifiedAt: stracker.modifiedAt,
    },
    message: 'Estado de caché de rendimiento v15.29.3.'
  });
});

app.post('/api/admin/performance/cache/clear', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  invalidateStrackerRuntimeCache('admin-clear');
  res.json({ ok: true, cache: gcCacheInfo(), message: 'Caché de rendimiento limpiada.' });
});

app.get('/api/admin/status', async (req, res, next) => {
  try {
    const snapshot = await gcCompatAdminSnapshot(req);
    res.json(snapshot);
  } catch (error) {
    console.error('[GC] Error en status admin unificado:', error);
    next();
  }
});

app.get('/api/admin/calendar-events/storage', async (req, res, next) => {
  try {
    const snapshot = await gcCompatAdminSnapshot(req);
    if (!snapshot.authorized) {
      res.status(403).json({ ok: false, message: 'Acceso admin requerido.', authenticated: snapshot.authenticated, source: 'unified-admin-session' });
      return;
    }

    const storage = gcCompatCalendarStorageInfo();
    res.json({ ok: true, ...storage, storage });
  } catch (error) {
    console.error('[GC] Error en storage calendario unificado:', error);
    next();
  }
});
// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_END


// GC CALENDAR DB STORAGE START

type GcCalendarEventDbV8 = {
  id: string;
  type: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  trackName: string;
  carNames: string;
  linkUrl: string;
  description: string;
  repeatEnabled: boolean;
  repeatFrequency: 'none' | 'weekly';
  repeatUntil: string;
  visible: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

const gcCalendarAllowedTypesDbV8 = new Set(['combo', 'race_lfm', 'race_gc']);
const gcCalendarJsonFallbackRelativePathDbV8 = 'app/calendar-events.json';

function gcCalendarNowDbV8() {
  return new Date().toISOString();
}

function gcCalendarStorageSourceDbV8() {
  if (useMysqlStorage()) return 'mysql';
  if (useSqliteStorage()) return 'sqlite';
  return 'json';
}

function gcCalendarJsonPathDbV8() {
  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', gcCalendarJsonFallbackRelativePathDbV8);
}

function gcCalendarToBoolDbV8(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sÃ­', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function gcCalendarTextDbV8(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function gcCalendarSanitizeTypeDbV8(value: unknown) {
  const type = String(value || 'combo').trim().toLowerCase();
  return gcCalendarAllowedTypesDbV8.has(type) ? type : 'combo';
}

function gcCalendarNormalizeEventDbV8(input: any, existing?: Partial<GcCalendarEventDbV8> | null): GcCalendarEventDbV8 {
  const now = gcCalendarNowDbV8();
  const repeatEnabled = gcCalendarToBoolDbV8(input?.repeatEnabled ?? input?.repeat_enabled, false) || String(input?.repeatFrequency ?? input?.repeat_frequency ?? '').toLowerCase() === 'weekly';
  const id = gcCalendarTextDbV8(input?.id || existing?.id || crypto.randomUUID());
  return {
    id,
    type: gcCalendarSanitizeTypeDbV8(input?.type ?? existing?.type),
    title: gcCalendarTextDbV8(input?.title || existing?.title || 'Evento'),
    startDate: gcCalendarTextDbV8(input?.startDate ?? input?.start_date ?? existing?.startDate),
    startTime: gcCalendarTextDbV8(input?.startTime ?? input?.start_time ?? existing?.startTime),
    endDate: gcCalendarTextDbV8(input?.endDate ?? input?.end_date ?? existing?.endDate),
    endTime: gcCalendarTextDbV8(input?.endTime ?? input?.end_time ?? existing?.endTime),
    trackName: gcCalendarTextDbV8(input?.trackName ?? input?.track_name ?? existing?.trackName),
    carNames: gcCalendarTextDbV8(input?.carNames ?? input?.car_names ?? existing?.carNames),
    linkUrl: gcCalendarTextDbV8(input?.linkUrl ?? input?.link_url ?? existing?.linkUrl),
    description: gcCalendarTextDbV8(input?.description ?? existing?.description),
    repeatEnabled,
    repeatFrequency: repeatEnabled ? 'weekly' : 'none',
    repeatUntil: gcCalendarTextDbV8(input?.repeatUntil ?? input?.repeat_until ?? existing?.repeatUntil),
    visible: gcCalendarToBoolDbV8(input?.visible ?? existing?.visible, true),
    featured: gcCalendarToBoolDbV8(input?.featured ?? existing?.featured, false),
    createdAt: gcCalendarTextDbV8(input?.createdAt ?? input?.created_at ?? existing?.createdAt ?? now),
    updatedAt: now
  };
}

function gcCalendarRowToEventDbV8(row: any): GcCalendarEventDbV8 {
  return gcCalendarNormalizeEventDbV8({
    id: row.id,
    type: row.type,
    title: row.title,
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    trackName: row.track_name,
    carNames: row.car_names,
    linkUrl: row.link_url,
    description: row.description,
    repeatEnabled: row.repeat_enabled,
    repeatFrequency: row.repeat_frequency,
    repeatUntil: row.repeat_until,
    visible: row.visible,
    featured: row.featured,
    createdAt: mysqlDate(row.created_at) || row.created_at,
    updatedAt: mysqlDate(row.updated_at) || row.updated_at
  });
}

function gcCalendarSortEventsDbV8(events: GcCalendarEventDbV8[]) {
  return [...events].sort((a, b) => {
    const left = `${a.startDate || ''} ${a.startTime || '00:00'} ${a.title || ''}`;
    const right = `${b.startDate || ''} ${b.startTime || '00:00'} ${b.title || ''}`;
    return left.localeCompare(right, 'es');
  });
}

async function gcCalendarEnsureMysqlSchemaDbV8() {
  if (!useMysqlStorage()) return;
  await ensureMysqlSchema();
  await mysqlExecute(`
    CREATE TABLE IF NOT EXISTS gc_calendar_events (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(255) NOT NULL,
      start_date VARCHAR(20) NOT NULL,
      start_time VARCHAR(20) NULL,
      end_date VARCHAR(20) NULL,
      end_time VARCHAR(20) NULL,
      track_name VARCHAR(255) NULL,
      car_names VARCHAR(255) NULL,
      link_url VARCHAR(500) NULL,
      description TEXT NULL,
      repeat_enabled TINYINT(1) NOT NULL DEFAULT 0,
      repeat_frequency VARCHAR(20) NOT NULL DEFAULT 'none',
      repeat_until VARCHAR(20) NULL,
      visible TINYINT(1) NOT NULL DEFAULT 1,
      featured TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_gc_calendar_events_start (start_date, start_time),
      INDEX idx_gc_calendar_events_type (type),
      INDEX idx_gc_calendar_events_visible (visible)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function gcCalendarEnsureSqliteSchemaDbV8(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS gc_calendar_events (
      id TEXT NOT NULL PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      start_time TEXT NULL,
      end_date TEXT NULL,
      end_time TEXT NULL,
      track_name TEXT NULL,
      car_names TEXT NULL,
      link_url TEXT NULL,
      description TEXT NULL,
      repeat_enabled INTEGER NOT NULL DEFAULT 0,
      repeat_frequency TEXT NOT NULL DEFAULT 'none',
      repeat_until TEXT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_calendar_events_start ON gc_calendar_events(start_date, start_time)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_calendar_events_type ON gc_calendar_events(type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gc_calendar_events_visible ON gc_calendar_events(visible)`);
}

function gcCalendarReadLegacyJsonDbV8(): GcCalendarEventDbV8[] {
  const filePath = gcCalendarJsonPathDbV8();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawEvents = Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : Array.isArray(parsed.items) ? parsed.items : [];
    return gcCalendarSortEventsDbV8(rawEvents.map((event: any) => gcCalendarNormalizeEventDbV8(event)).filter((event: GcCalendarEventDbV8) => event.title && event.startDate));
  } catch (error) {
    console.error('[GC] Error leyendo calendar-events.json:', error);
    return [];
  }
}

function gcCalendarWriteLegacyJsonDbV8(events: GcCalendarEventDbV8[]) {
  const filePath = gcCalendarJsonPathDbV8();
  ensureDirForFile(filePath);
  const payload = { version: 1, updatedAt: gcCalendarNowDbV8(), events: gcCalendarSortEventsDbV8(events) };
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

async function gcCalendarReadEventsDbV8(skipMigration = false): Promise<GcCalendarEventDbV8[]> {
  if (useMysqlStorage()) {
    await gcCalendarEnsureMysqlSchemaDbV8();
    const rows = await mysqlQuery('SELECT * FROM gc_calendar_events ORDER BY start_date ASC, start_time ASC, title ASC');
    const events = rows.map(gcCalendarRowToEventDbV8);
    if (!skipMigration && events.length === 0) await gcCalendarMaybeMigrateLegacyJsonDbV8();
    if (!skipMigration && events.length === 0) return gcCalendarReadEventsDbV8(true);
    return gcCalendarSortEventsDbV8(events);
  }

  if (useSqliteStorage()) {
    const events = await withAppSqliteDb((db) => {
      gcCalendarEnsureSqliteSchemaDbV8(db);
      return sqliteQuery(db, 'SELECT * FROM gc_calendar_events ORDER BY start_date ASC, start_time ASC, title ASC').map(gcCalendarRowToEventDbV8);
    }, true);
    if (!skipMigration && events.length === 0) await gcCalendarMaybeMigrateLegacyJsonDbV8();
    if (!skipMigration && events.length === 0) return gcCalendarReadEventsDbV8(true);
    return gcCalendarSortEventsDbV8(events);
  }

  return gcCalendarReadLegacyJsonDbV8();
}

async function gcCalendarWriteEventsDbV8(events: GcCalendarEventDbV8[]) {
  const normalizedEvents = gcCalendarSortEventsDbV8(events.map((event) => gcCalendarNormalizeEventDbV8(event)));

  if (useMysqlStorage()) {
    await gcCalendarEnsureMysqlSchemaDbV8();
    const pool = await getMysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM gc_calendar_events');
      for (const event of normalizedEvents) {
        await connection.query(
          `INSERT INTO gc_calendar_events
            (id, type, title, start_date, start_time, end_date, end_time, track_name, car_names, link_url, description, repeat_enabled, repeat_frequency, repeat_until, visible, featured, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            event.id,
            event.type,
            event.title,
            event.startDate,
            event.startTime || null,
            event.endDate || null,
            event.endTime || null,
            event.trackName || null,
            event.carNames || null,
            event.linkUrl || null,
            event.description || null,
            event.repeatEnabled ? 1 : 0,
            event.repeatFrequency || 'none',
            event.repeatUntil || null,
            event.visible ? 1 : 0,
            event.featured ? 1 : 0,
            isoToMysql(event.createdAt) || isoToMysql(gcCalendarNowDbV8()),
            isoToMysql(event.updatedAt) || isoToMysql(gcCalendarNowDbV8())
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
    return;
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db) => {
      gcCalendarEnsureSqliteSchemaDbV8(db);
      db.run('BEGIN TRANSACTION');
      try {
        db.run('DELETE FROM gc_calendar_events');
        for (const event of normalizedEvents) {
          db.run(
            `INSERT INTO gc_calendar_events
              (id, type, title, start_date, start_time, end_date, end_time, track_name, car_names, link_url, description, repeat_enabled, repeat_frequency, repeat_until, visible, featured, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              event.id,
              event.type,
              event.title,
              event.startDate,
              event.startTime || null,
              event.endDate || null,
              event.endTime || null,
              event.trackName || null,
              event.carNames || null,
              event.linkUrl || null,
              event.description || null,
              event.repeatEnabled ? 1 : 0,
              event.repeatFrequency || 'none',
              event.repeatUntil || null,
              event.visible ? 1 : 0,
              event.featured ? 1 : 0,
              event.createdAt,
              event.updatedAt
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

  gcCalendarWriteLegacyJsonDbV8(normalizedEvents);
}

async function gcCalendarMaybeMigrateLegacyJsonDbV8() {
  if (!useMysqlStorage() && !useSqliteStorage()) return;
  const legacyEvents = gcCalendarReadLegacyJsonDbV8();
  if (!legacyEvents.length) return;
  await gcCalendarWriteEventsDbV8(legacyEvents);
  console.log(`[GC] ${legacyEvents.length} eventos de calendario migrados a ${gcCalendarStorageSourceDbV8()}.`);
}

async function gcCalendarRequireAdminDbV8(req: any, res: any) {
  const context = await requireAdmin(req as express.Request, res as express.Response);
  return Boolean(context);
}

const gcCalendarJsonBodyDbV8 = express.json({ limit: '1mb' });

app.get('/api/calendar-events', async (_req: any, res: any) => {
  try {
    const events = (await gcCalendarReadEventsDbV8()).filter((event) => event.visible !== false);
    res.json({ ok: true, source: gcCalendarStorageSourceDbV8(), events, items: events });
  } catch (error: any) {
    console.error('[GC] Error leyendo calendario pÃºblico:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.get('/api/admin/calendar-events/storage', async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  const jsonPath = gcCalendarJsonPathDbV8();
  res.json({
    ok: true,
    source: gcCalendarStorageSourceDbV8(),
    mysql: useMysqlStorage() ? getMysqlStorageSafeConfig() : null,
    sqlite: useSqliteStorage() ? getSqliteStorageSafeConfig() : null,
    jsonFallbackPath: jsonPath,
    jsonFallbackExists: fs.existsSync(jsonPath)
  });
});

app.get('/api/admin/calendar-events', async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const events = await gcCalendarReadEventsDbV8();
    res.json({ ok: true, source: gcCalendarStorageSourceDbV8(), events, items: events });
  } catch (error: any) {
    console.error('[GC] Error leyendo calendario admin:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.post('/api/admin/calendar-events', gcCalendarJsonBodyDbV8, async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const events = await gcCalendarReadEventsDbV8();
    const event = gcCalendarNormalizeEventDbV8(req.body || {});
    if (!event.title || !event.startDate) {
      res.status(400).json({ ok: false, message: 'TÃ­tulo y fecha inicio son obligatorios.' });
      return;
    }
    const nextEvents = [...events.filter((item) => item.id !== event.id), event];
    await gcCalendarWriteEventsDbV8(nextEvents);
    res.json({ ok: true, source: gcCalendarStorageSourceDbV8(), event, events: gcCalendarSortEventsDbV8(nextEvents) });
  } catch (error: any) {
    console.error('[GC] Error creando evento calendario:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo crear el evento.' });
  }
});

app.put('/api/admin/calendar-events/:id', gcCalendarJsonBodyDbV8, async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const id = String(req.params.id || '').trim();
    const events = await gcCalendarReadEventsDbV8();
    const existing = events.find((event) => event.id === id);
    if (!existing) {
      res.status(404).json({ ok: false, message: 'Evento no encontrado.' });
      return;
    }
    const event = gcCalendarNormalizeEventDbV8({ ...(req.body || {}), id }, existing);
    if (!event.title || !event.startDate) {
      res.status(400).json({ ok: false, message: 'TÃ­tulo y fecha inicio son obligatorios.' });
      return;
    }
    const nextEvents = events.map((item) => item.id === id ? event : item);
    await gcCalendarWriteEventsDbV8(nextEvents);
    res.json({ ok: true, source: gcCalendarStorageSourceDbV8(), event, events: gcCalendarSortEventsDbV8(nextEvents) });
  } catch (error: any) {
    console.error('[GC] Error actualizando evento calendario:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo actualizar el evento.' });
  }
});

app.delete('/api/admin/calendar-events/:id', async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const id = String(req.params.id || '').trim();
    const events = await gcCalendarReadEventsDbV8();
    const nextEvents = events.filter((event) => event.id !== id);
    if (nextEvents.length === events.length) {
      res.status(404).json({ ok: false, message: 'Evento no encontrado.' });
      return;
    }
    await gcCalendarWriteEventsDbV8(nextEvents);
    res.json({ ok: true, source: gcCalendarStorageSourceDbV8(), events: gcCalendarSortEventsDbV8(nextEvents) });
  } catch (error: any) {
    console.error('[GC] Error borrando evento calendario:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo borrar el evento.' });
  }
});

// GC ACSM SYNC START

type GcAcsmServerCfgV1 = {
  raw: string;
  values: Record<string, string>;
  trackCode: string;
  trackConfig: string;
  carCodes: string[];
  serverName: string;
};

function gcAcsmTextV1(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function gcAcsmBoolV1(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sÃ­', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function gcAcsmCleanAssetNameV1(value: unknown, fallback = '') {
  const text = gcAcsmTextV1(value, fallback);
  if (!text) return fallback;
  return text
    .replace(/;/g, ', ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function gcAcsmCurrentWeekStartDateV1() {
  const configured = process.env.ACSM_COMBO_START_DATE?.trim();
  if (configured) return configured;
  const date = new Date();
  const dayFromMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayFromMonday);
  return date.toISOString().slice(0, 10);
}

function gcAcsmDefaultServerCfgPathV1() {
  return process.env.ACSM_SERVER_CFG_PATH?.trim() || '/185.216.144.78_9800/cfg/server_cfg.ini';
}

function gcAcsmDefaultLastRaceEventPathV1() {
  return process.env.ACSM_LAST_RACE_EVENT_PATH?.trim() || '/185.216.144.78_9800/saves/last_race_event.json';
}

function gcAcsmSftpConfigV1() {
  return {
    host: process.env.ACSM_SFTP_HOST?.trim() || '185.216.144.78',
    port: Number(process.env.ACSM_SFTP_PORT || 8822),
    username: process.env.ACSM_SFTP_USER?.trim() || '',
    password: process.env.ACSM_SFTP_PASSWORD || '',
    readyTimeout: Number(process.env.ACSM_SFTP_TIMEOUT_MS || 25000)
  };
}

function gcAcsmSafeConfigV1() {
  const cfg = gcAcsmSftpConfigV1();
  return {
    panelUrl: process.env.ACSM_PANEL_URL?.trim() || 'http://185.216.144.78:8840/custom',
    hostConfigured: Boolean(cfg.host),
    port: cfg.port,
    userConfigured: Boolean(cfg.username),
    passwordConfigured: Boolean(cfg.password),
    serverCfgPath: gcAcsmDefaultServerCfgPathV1(),
    lastRaceEventPath: gcAcsmDefaultLastRaceEventPathV1()
  };
}

async function gcAcsmReadRemoteFileV1(remotePath: string) {
  const cfg = gcAcsmSftpConfigV1();
  if (!cfg.host || !cfg.username || !cfg.password) {
    throw new Error('Faltan variables ACSM_SFTP_HOST, ACSM_SFTP_USER o ACSM_SFTP_PASSWORD.');
  }
  const mod: any = await import('ssh2-sftp-client');
  const SftpClient = mod.default || mod;
  const sftp = new SftpClient();
  try {
    await sftp.connect(cfg);
    const data = await sftp.get(remotePath);
    return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as any).toString('utf8');
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

function gcAcsmParseIniV1(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const originalLine of String(raw || '').split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toUpperCase();
    const value = line.slice(index + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

function gcAcsmParseServerCfgV1(raw: string): GcAcsmServerCfgV1 {
  const values = gcAcsmParseIniV1(raw);
  const carCodes = gcAcsmTextV1(values.CARS).split(';').map((item) => item.trim()).filter(Boolean);
  return {
    raw,
    values,
    trackCode: gcAcsmTextV1(values.TRACK),
    trackConfig: gcAcsmTextV1(values.CONFIG_TRACK),
    carCodes,
    serverName: gcAcsmTextV1(values.NAME)
  };
}

function gcAcsmBuildComboEventV1(cfg: GcAcsmServerCfgV1) {
  const trackName = gcAcsmCleanAssetNameV1(cfg.trackCode || cfg.serverName, 'Circuito por confirmar');
  const carNames = cfg.carCodes.map((car) => gcAcsmCleanAssetNameV1(car)).filter(Boolean).join(', ');
  const panelUrl = process.env.ACSM_PANEL_URL?.trim() || 'http://185.216.144.78:8840/custom';
  const startDate = gcAcsmCurrentWeekStartDateV1();
  const startTime = process.env.ACSM_COMBO_START_TIME?.trim() || '';
  const titlePrefix = process.env.ACSM_COMBO_TITLE_PREFIX?.trim() || 'Combo semanal';
  return gcCalendarNormalizeEventDbV8({
    id: process.env.ACSM_COMBO_EVENT_ID?.trim() || 'acsm-current-combo',
    type: 'combo',
    title: `${titlePrefix} Â· ${trackName}`,
    startDate,
    startTime,
    endDate: '',
    endTime: '',
    trackName,
    carNames,
    linkUrl: panelUrl,
    description: [
      'Importado automÃ¡ticamente desde Assetto Corsa Server Manager.',
      cfg.serverName ? `Servidor: ${cfg.serverName}` : '',
      cfg.trackCode ? `Track code: ${cfg.trackCode}` : '',
      cfg.trackConfig ? `Config track: ${cfg.trackConfig}` : '',
      cfg.carCodes.length ? `Car codes: ${cfg.carCodes.join(';')}` : ''
    ].filter(Boolean).join('\n'),
    repeatEnabled: gcAcsmBoolV1(process.env.ACSM_COMBO_REPEAT_WEEKLY, false),
    repeatFrequency: gcAcsmBoolV1(process.env.ACSM_COMBO_REPEAT_WEEKLY, false) ? 'weekly' : 'none',
    repeatUntil: process.env.ACSM_COMBO_REPEAT_UNTIL?.trim() || '',
    visible: true,
    featured: true
  });
}

async function gcAcsmReadCurrentComboV1() {
  const raw = await gcAcsmReadRemoteFileV1(gcAcsmDefaultServerCfgPathV1());
  const cfg = gcAcsmParseServerCfgV1(raw);
  return { cfg, event: gcAcsmBuildComboEventV1(cfg) };
}

async function gcAcsmSyncCurrentComboV1() {
  const { cfg, event } = await gcAcsmReadCurrentComboV1();
  const events = await gcCalendarReadEventsDbV8();
  const nextEvents = [...events.filter((item) => item.id !== event.id), event];
  await gcCalendarWriteEventsDbV8(nextEvents);
  return { cfg, event, totalEvents: nextEvents.length, source: gcCalendarStorageSourceDbV8() };
}

app.get('/api/admin/acsm/status', async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const info = gcAcsmSafeConfigV1();
    let combo: any = null;
    if (info.userConfigured && info.passwordConfigured) {
      const { cfg, event } = await gcAcsmReadCurrentComboV1();
      combo = {
        serverName: cfg.serverName,
        trackCode: cfg.trackCode,
        trackName: event.trackName,
        carCodes: cfg.carCodes,
        carNames: event.carNames,
        event
      };
    }
    res.json({ ok: true, config: info, combo, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('[GC] Error comprobando ACSM:', error);
    res.status(500).json({ ok: false, config: gcAcsmSafeConfigV1(), message: error?.message || 'No se pudo comprobar ACSM.' });
  }
});

app.post('/api/admin/acsm/sync-current-combo', async (req: any, res: any) => {
  if (!(await gcCalendarRequireAdminDbV8(req, res))) return;
  try {
    const result = await gcAcsmSyncCurrentComboV1();
    res.json({ ok: true, ...result, syncedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('[GC] Error sincronizando combo ACSM:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo sincronizar el combo desde ACSM.' });
  }
});

// GC ACSM SYNC END

// GC CALENDAR DB STORAGE END


// GC_CALENDAR_EVENTS_PATCH_V6_ROUTE_FIRST
app.use(express.json({ limit: '25mb' }));

const gcCalendarV6AllowedTypes = ['combo', 'race_lfm', 'race_gc'] as const;
type GcCalendarV6Type = typeof gcCalendarV6AllowedTypes[number];
type GcCalendarV6Event = {
  id: string;
  type: GcCalendarV6Type;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  trackName: string;
  carNames: string;
  description: string;
  linkUrl: string;
  visible: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

type GcCalendarV6Store = {
  version: 1;
  updatedAt: string;
  events: GcCalendarV6Event[];
};

function gcCalendarV6Type(value: unknown): GcCalendarV6Type {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'race' || raw === 'race_gc' || raw === 'grasscutters' || raw === 'carrera_gc') return 'race_gc';
  if (raw === 'lfm' || raw === 'race_lfm' || raw === 'carrera_lfm') return 'race_lfm';
  return 'combo';
}

function gcCalendarV6Text(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcCalendarV6Date(value: unknown) {
  const text = gcCalendarV6Text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function gcCalendarV6Time(value: unknown) {
  const text = gcCalendarV6Text(value).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
}

async function gcCalendarV6RequireAdmin(req: any, res: any) {
  const context = await requireAdmin(req as express.Request, res as express.Response);
  return context ? publicUser(context.user) : null;
}

function gcCalendarV6Path() {
  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json');
}

function gcCalendarV6EmptyStore(): GcCalendarV6Store {
  return { version: 1, updatedAt: new Date().toISOString(), events: [] };
}

function gcCalendarV6NormalizeEvent(input: any, existing?: Partial<GcCalendarV6Event>): GcCalendarV6Event {
  const now = new Date().toISOString();
  const startDate = gcCalendarV6Date(input.startDate ?? input.date ?? input.startsAt ?? existing?.startDate);
  const title = gcCalendarV6Text(input.title ?? existing?.title).slice(0, 180);

  if (!title) throw new Error('El tÃ­tulo es obligatorio.');
  if (!startDate) throw new Error('La fecha de inicio es obligatoria.');

  return {
    id: gcCalendarV6Text(existing?.id || input.id, crypto.randomUUID()),
    type: gcCalendarV6Type(input.type ?? existing?.type),
    title,
    startDate,
    startTime: gcCalendarV6Time(input.startTime ?? existing?.startTime),
    endDate: gcCalendarV6Date(input.endDate ?? existing?.endDate),
    endTime: gcCalendarV6Time(input.endTime ?? existing?.endTime),
    trackName: gcCalendarV6Text(input.trackName ?? input.track ?? existing?.trackName).slice(0, 180),
    carNames: gcCalendarV6Text(input.carNames ?? input.cars ?? existing?.carNames).slice(0, 600),
    description: gcCalendarV6Text(input.description ?? existing?.description).slice(0, 1600),
    linkUrl: gcCalendarV6Text(input.linkUrl ?? input.link ?? existing?.linkUrl).slice(0, 600),
    visible: input.visible === undefined ? existing?.visible !== false : input.visible !== false,
    featured: input.featured === undefined ? Boolean(existing?.featured) : Boolean(input.featured),
    createdAt: gcCalendarV6Text(existing?.createdAt, now),
    updatedAt: now
  };
}

function gcCalendarV6SafeEvents(value: any): GcCalendarV6Event[] {
  const raw = Array.isArray(value?.events) ? value.events : Array.isArray(value) ? value : [];
  return raw.map((event: any) => {
    try {
      if (event.startsAt && !event.startDate) {
        const starts = new Date(event.startsAt);
        event.startDate = Number.isNaN(starts.getTime()) ? '' : starts.toISOString().slice(0, 10);
        event.startTime = Number.isNaN(starts.getTime()) ? '' : starts.toISOString().slice(11, 16);
      }
      if (event.endsAt && !event.endDate) {
        const ends = new Date(event.endsAt);
        event.endDate = Number.isNaN(ends.getTime()) ? '' : ends.toISOString().slice(0, 10);
        event.endTime = Number.isNaN(ends.getTime()) ? '' : ends.toISOString().slice(11, 16);
      }
      if (event.combo && !event.title) event.title = event.combo;
      if (event.track && !event.trackName) event.trackName = event.track;
      if (Array.isArray(event.cars) && !event.carNames) event.carNames = event.cars.join(', ');
      if (event.enabled !== undefined && event.visible === undefined) event.visible = event.enabled;
      return gcCalendarV6NormalizeEvent(event, event);
    } catch {
      return null;
    }
  }).filter(Boolean) as GcCalendarV6Event[];
}

async function gcCalendarV6ReadStore(): Promise<GcCalendarV6Store> {
  const filePath = gcCalendarV6Path();
  if (!fs.existsSync(filePath)) return gcCalendarV6EmptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      updatedAt: gcCalendarV6Text(parsed.updatedAt, new Date().toISOString()),
      events: gcCalendarV6SafeEvents(parsed)
    };
  } catch (error) {
    console.error('[GC Calendar V6] Error leyendo calendar-events.json:', error);
    return gcCalendarV6EmptyStore();
  }
}

async function gcCalendarV6WriteStore(events: GcCalendarV6Event[]): Promise<GcCalendarV6Store> {
  const store: GcCalendarV6Store = {
    version: 1,
    updatedAt: new Date().toISOString(),
    events: gcCalendarV6SafeEvents({ events })
  };
  const filePath = gcCalendarV6Path();
  ensureDirForFile(filePath);
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
  return store;
}

function gcCalendarV6Sort(events: GcCalendarV6Event[]) {
  return [...events].sort((a, b) => {
    const left = String(a.startDate || '') + ' ' + String(a.startTime || '00:00');
    const right = String(b.startDate || '') + ' ' + String(b.startTime || '00:00');
    return left.localeCompare(right) || a.title.localeCompare(b.title, 'es');
  });
}

function gcCalendarV6PublicPayload(store: GcCalendarV6Store) {
  return { ok: true, updatedAt: store.updatedAt, events: gcCalendarV6Sort(store.events.filter((event) => event.visible !== false)) };
}

app.get(['/api/calendar-events', '/api/calendar/events', '/api/calendar'], async (_req: any, res: any) => {
  try {
    const store = await gcCalendarV6ReadStore();
    res.json(gcCalendarV6PublicPayload(store));
  } catch (error: any) {
    console.error('[GC Calendar V6] GET public:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.get(['/api/admin/calendar-events', '/api/admin/calendar/events', '/api/admin/calendar'], async (req: any, res: any) => {
  const user = await gcCalendarV6RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV6ReadStore();
    res.json({ ok: true, updatedAt: store.updatedAt, storage: { source: 'json', path: gcCalendarV6Path() }, events: gcCalendarV6Sort(store.events) });
  } catch (error: any) {
    console.error('[GC Calendar V6] GET admin:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.post(['/api/admin/calendar-events', '/api/admin/calendar/events', '/api/admin/calendar'], async (req: any, res: any) => {
  const user = await gcCalendarV6RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV6ReadStore();
    const event = gcCalendarV6NormalizeEvent(req.body || {});
    const existingIndex = store.events.findIndex((item) => item.id === event.id);
    const nextEvents = [...store.events];
    if (existingIndex >= 0) nextEvents[existingIndex] = gcCalendarV6NormalizeEvent(req.body || {}, store.events[existingIndex]);
    else nextEvents.push(event);
    const next = await gcCalendarV6WriteStore(nextEvents);
    res.json({ ok: true, event, events: gcCalendarV6Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo guardar el evento.' });
  }
});

app.put(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id', '/api/admin/calendar/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV6RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV6ReadStore();
    const index = store.events.findIndex((event) => event.id === req.params.id);
    if (index < 0) return res.status(404).json({ ok: false, message: 'Evento no encontrado.' });
    const event = gcCalendarV6NormalizeEvent(req.body || {}, store.events[index]);
    store.events[index] = event;
    const next = await gcCalendarV6WriteStore(store.events);
    res.json({ ok: true, event, events: gcCalendarV6Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo actualizar el evento.' });
  }
});

app.delete(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id', '/api/admin/calendar/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV6RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV6ReadStore();
    const nextEvents = store.events.filter((event) => event.id !== req.params.id);
    const next = await gcCalendarV6WriteStore(nextEvents);
    res.json({ ok: true, deleted: store.events.length - nextEvents.length, events: gcCalendarV6Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo borrar el evento.' });
  }
});
// END GC_CALENDAR_EVENTS_PATCH_V6_ROUTE_FIRST


app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// GC Archivo Motorsport media manager v8.4.2 routes.
registerMotorsportArchiveMediaManagerRoutes(app, { rootDir });


// GC Archivo Motorsport local image upload v8.4 routes.
registerMotorsportArchiveLocalImageUploadRoutes(app, { rootDir });


// GC Archivo Motorsport unified admin v8.3 routes.
registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir });


// GC Archivo Motorsport safe API v8.2.4 routes.
registerMotorsportArchiveSafeApiV824(app);


// GC Archivo Motorsport import/delete fix v8.2.3 routes.
registerMotorsportArchiveImportDeleteFixV823(app);


// GC Archivo Motorsport admin MySQL/import safe v8.2.2 routes.
registerMotorsportArchiveAdminMysqlRoutes(app, { rootDir });




registerMotorsportArchiveRoutes(app, { rootDir });
registerMotorsportArchiveImageUrlRoutes(app, { rootDir });
registerMotorsportArchiveDeleteRoutes(app, { rootDir });
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
    note: useMysqlStorage() ? 'App storage activo con driver configurable: MySQL en producciÃ³n, SQLite/JSON en local.' : 'Storage JSON activo. Para producciÃ³n usa APP_STORAGE_DRIVER=mysql.'
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
      message: 'No hay sesiÃ³n activa.'
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



app.get('/api/pilots/:playerId/profile', async (req, res) => {
  const playerId = Number(req.params.playerId);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    res.status(400).json({ ok: false, profile: null, message: 'PlayerId no vÃ¡lido.' });
    return;
  }

  const stracker = getStrackerConfig();
  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.status(200).json({
      ok: false,
      profile: null,
      stracker,
      message: 'stracker.db3 no estÃ¡ disponible para generar el perfil pÃºblico.'
    });
    return;
  }

  try {
    const allLaps = await readJoinedLaps(stracker.resolvedPath);
    const profile = buildPublicPilotProfile(playerId, allLaps);

    if (!profile) {
      res.status(404).json({
        ok: false,
        profile: null,
        playerId,
        message: 'No se encontrÃ³ actividad para ese piloto en stracker.db3.'
      });
      return;
    }

    res.json({
      ...profile,
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      }
    });
  } catch (error) {
    console.error('[GC] Error generando perfil pÃºblico de piloto:', error);
    res.status(200).json({
      ok: false,
      profile: null,
      playerId,
      message: 'No se pudo generar el perfil pÃºblico desde stracker.db3.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/profile', async (req, res) => {
  const context = await getAuthContextAsync(req);

  if (!context) {
    res.status(200).json({
      ok: false,
      authenticated: false,
      user: null,
      profile: null,
      message: 'No hay sesiÃ³n activa.'
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
      message: 'Hay sesiÃ³n activa, pero stracker.db3 no estÃ¡ disponible para generar el perfil.'
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
      message: 'MySQL no estÃ¡ activo. APP_STORAGE_DRIVER debe ser mysql.'
    });
    return;
  }

  try {
    await ensureMysqlSchema();
    const rows = await mysqlQuery(`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('gc_users', 'gc_sessions', 'gc_display_names', 'gc_settings', 'gc_admin_audit_log')
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
      message: 'No se pudo conectar o preparar MySQL. Revisa variables, password, permisos y que mysql2 estÃ© instalado.'
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
      message: 'SQLite local no estÃ¡ activo. Usa APP_STORAGE_DRIVER=sqlite para desarrollo local.'
    });
    return;
  }

  try {
    const rows = await withAppSqliteDb((db) => sqliteQuery(
      db,
      `SELECT name AS tableName FROM sqlite_master WHERE type='table' AND name IN ('gc_users', 'gc_sessions', 'gc_display_names', 'gc_settings', 'gc_admin_audit_log') ORDER BY name ASC`
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
        ? 'No hay administradores todavÃ­a. Promociona una cuenta con ADMIN_SETUP_SECRET o STRACKER_SYNC_SECRET.'
        : 'Inicia sesiÃ³n con una cuenta administradora.'
  });
});

app.post('/api/admin/bootstrap', async (req, res) => {
  if (!assertAdminSetupSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret admin invÃ¡lido. Usa ADMIN_SETUP_SECRET o STRACKER_SYNC_SECRET.'
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
      message: 'No se encontrÃ³ la cuenta a promocionar. Inicia sesiÃ³n o indica email/userId.'
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
    ? `Cuenta ${target.displayName} promocionada a administrador. SesiÃ³n admin activada.`
    : `Cuenta ${target.displayName} promocionada a administrador. Para usar ese admin, inicia sesiÃ³n con esa cuenta.`;

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
    res.status(400).json({ ok: false, message: 'Rol no vÃ¡lido. Usa pilot o admin.' });
    return;
  }

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  if (target.role === 'admin' && nextRole !== 'admin' && isLastAdmin(store, target.id)) {
    res.status(409).json({ ok: false, message: 'No puedes quitar el Ãºltimo administrador.' });
    return;
  }

  const beforeRole = target.role;
  target.role = nextRole;
  target.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(store);
  await writeAdminAuditLog(req, { context }, 'user.role_update', 'user', target.id, { role: beforeRole }, { role: nextRole });

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    summary: getUserStoreAdminSummary(store),
    message: `Rol actualizado a ${nextRole}.`
  });
});


app.post('/api/admin/users/:userId/link-pilot', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  const resolved = await resolvePilotLink(req.body?.playerId);
  if (!resolved.ok) {
    res.status(400).json({ ok: false, message: resolved.message });
    return;
  }

  const alreadyLinked = findUserByPilotId(store, resolved.link.playerId, target.id);
  if (alreadyLinked) {
    res.status(409).json({
      ok: false,
      message: `Ese piloto ya estÃ¡ vinculado a ${alreadyLinked.displayName || alreadyLinked.email}.`
    });
    return;
  }

  const beforePilotLink = target.pilotLink ? { ...target.pilotLink } : null;
  target.pilotLink = resolved.link;
  target.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(store);
  await writeAdminAuditLog(req, { context }, 'user.link_pilot', 'user', target.id, beforePilotLink, target.pilotLink);

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    pilot: resolved.pilot,
    message: 'Piloto vinculado desde administraciÃ³n.'
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

  const beforePilotLink = target.pilotLink ? { ...target.pilotLink } : null;
  target.pilotLink = null;
  target.updatedAt = new Date().toISOString();
  await writeUserStoreAsync(store);
  await writeAdminAuditLog(req, { context }, 'user.unlink_pilot', 'user', target.id, beforePilotLink, null);

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    message: 'Piloto desvinculado desde administraciÃ³n.'
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

// GC ADMIN PASSWORD RESET V8.8.2 START
app.post('/api/admin/users/:userId/password', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const password = String(req.body?.password ?? '');

  if (password.length < 8) {
    res.status(400).json({ ok: false, message: 'La nueva contraseÃ±a debe tener al menos 8 caracteres.' });
    return;
  }

  if (password.length > 128) {
    res.status(400).json({ ok: false, message: 'La nueva contraseÃ±a es demasiado larga.' });
    return;
  }

  const store = await readUserStoreAsync();
  const target = findUserById(store, req.params.userId);

  if (!target) {
    res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return;
  }

  const beforeSessions = countSessionsForUser(store, target.id);
  const beforeValue = {
    userId: target.id,
    email: target.email,
    activeSessions: beforeSessions,
    passwordAlgorithm: target.password?.algorithm ?? null
  };

  target.password = hashPassword(password);
  target.updatedAt = new Date().toISOString();

  // Seguridad: tras resetear contraseÃ±a se cierran las sesiones del usuario.
  // Si el admin se resetea a sÃ­ mismo, se conserva la sesiÃ³n actual para no expulsarlo en medio de la operaciÃ³n.
  store.sessions = store.sessions.filter((session) => {
    if (session.userId !== target.id) return true;
    if (target.id === context.user.id && session.id === context.session.id) return true;
    return false;
  });

  await writeUserStoreAsync(store);

  const afterSessions = countSessionsForUser(store, target.id);
  const sessionsRevoked = Math.max(0, beforeSessions - afterSessions);

  await writeAdminAuditLog(
    req,
    { context },
    'user.password_reset',
    'user',
    target.id,
    beforeValue,
    {
      userId: target.id,
      email: target.email,
      activeSessions: afterSessions,
      sessionsRevoked,
      passwordChanged: true
    }
  );

  res.json({
    ok: true,
    user: publicAdminUser(target, store),
    sessionsRevoked,
    message: target.id === context.user.id
      ? 'ContraseÃ±a actualizada. Se han cerrado otras sesiones de tu cuenta.'
      : 'ContraseÃ±a actualizada y sesiones del usuario cerradas.'
  });
});
// GC ADMIN PASSWORD RESET V8.8.2 END

app.post('/api/admin/stracker/sync', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const result = await syncStrackerFromGTX();
  if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');
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


type AdminAuditContext = {
  context?: { user: AppUser } | null;
  via?: string;
};

function auditJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(String(value));
  }
}

function requestIp(req: express.Request) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  return forwarded || req.socket.remoteAddress || null;
}

async function writeAdminAuditLog(
  req: express.Request,
  access: AdminAuditContext,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeValue: unknown,
  afterValue: unknown
) {
  const now = new Date().toISOString();
  const actor = access.context?.user ?? null;
  const row = {
    id: crypto.randomUUID(),
    actorUserId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    actorName: actor?.displayName ?? (access.via === 'setup-secret' ? 'setup-secret' : null),
    action,
    entityType,
    entityId,
    beforeValue: auditJson(beforeValue),
    afterValue: auditJson(afterValue),
    ipAddress: requestIp(req),
    userAgent: compactNullableText(req.headers['user-agent'])?.slice(0, 255) ?? null,
    createdAt: now
  };

  try {
    if (useMysqlStorage()) {
      await ensureMysqlSchema();
      await mysqlExecute(
        `INSERT INTO gc_admin_audit_log
          (id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, before_value, after_value, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.actorUserId, row.actorEmail, row.actorName, row.action, row.entityType, row.entityId, row.beforeValue, row.afterValue, row.ipAddress, row.userAgent, row.createdAt]
      );
      return;
    }

    if (useSqliteStorage()) {
      await withAppSqliteDb((db) => {
        db.run(
          `INSERT INTO gc_admin_audit_log
            (id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, before_value, after_value, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id, row.actorUserId, row.actorEmail, row.actorName, row.action, row.entityType, row.entityId, row.beforeValue, row.afterValue, row.ipAddress, row.userAgent, row.createdAt]
        );
      }, true);
    }
  } catch (error) {
    console.error('[GC] Error escribiendo audit log admin:', error);
  }
}

function parseAuditValue(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try { return JSON.parse(value); } catch { return value; }
}

async function readAdminAuditLog(limitRaw: unknown) {
  const limit = Math.max(1, Math.min(200, Number(limitRaw) || 80));
  const mapRow = (row: any) => ({
    id: String(row.id),
    actorUserId: compactNullableText(row.actor_user_id),
    actorEmail: compactNullableText(row.actor_email),
    actorName: compactNullableText(row.actor_name),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: compactNullableText(row.entity_id),
    beforeValue: parseAuditValue(row.before_value),
    afterValue: parseAuditValue(row.after_value),
    ipAddress: compactNullableText(row.ip_address),
    userAgent: compactNullableText(row.user_agent),
    createdAt: String(row.created_at)
  });

  try {
    if (useMysqlStorage()) {
      await ensureMysqlSchema();
      const rows = await mysqlQuery(
        `SELECT * FROM gc_admin_audit_log ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );
      return rows.map(mapRow);
    }

    if (useSqliteStorage()) {
      const rows = await withAppSqliteDb((db) => sqliteQuery(
        db,
        `SELECT * FROM gc_admin_audit_log ORDER BY created_at DESC LIMIT ?`,
        [limit]
      ));
      return rows.map(mapRow);
    }
  } catch (error) {
    console.error('[GC] Error leyendo audit log admin:', error);
  }

  return [];
}


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
      const driverItems = drivers.map((row) => buildDisplayNameCatalogItem('driver', row.PlayerId, row.SteamGuid, row.Name, getRawDriverName({ DriverName: row.Name, Name: row.Name }), store));
      const driverNameCounts = new Map<string, number>();
      for (const item of driverItems) {
        const key = normalizeDisplayNameKey(item.sourceName || item.autoName || item.displayName);
        if (!key) continue;
        driverNameCounts.set(key, (driverNameCounts.get(key) || 0) + 1);
      }
      catalog.drivers = driverItems.map((item) => {
        const key = normalizeDisplayNameKey(item.sourceName || item.autoName || item.displayName);
        const duplicateNameCount = key ? driverNameCounts.get(key) || 0 : 0;
        return {
          ...item,
          duplicateName: duplicateNameCount > 1,
          duplicateNameCount
        };
      });

      const cars = await runStrackerQuery(stracker.resolvedPath, 'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC');
      catalog.cars = cars.map((row) => buildDisplayNameCatalogItem('car', row.CarId, row.Car, row.UiCarName || row.Car, getRawDisplayCar(row), store));

      const tracks = await runStrackerQuery(stracker.resolvedPath, 'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC');
      catalog.tracks = tracks.map((row) => buildDisplayNameCatalogItem('track', row.TrackId, row.Track, row.UiTrackName || row.Track, getRawDisplayTrack(row), store));
    } catch (error) {
      console.error('[GC] Error generando catÃ¡logo de display names:', error);
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
      overrides: [...catalog.drivers, ...catalog.cars, ...catalog.tracks].filter((item) => item.hasOverride).length
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

app.get('/api/admin/audit-log', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;
  const items = await readAdminAuditLog(req.query.limit);
  res.json({
    ok: true,
    count: items.length,
    items,
    storage: getAppStorageDriverLabel(),
    message: 'Historial admin cargado correctamente.'
  });
});

app.get('/api/admin/unlinked-pilots', async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;

  const store = await readUserStoreAsync();
  const linkedIds = new Set(store.users.map((user) => user.pilotLink?.playerId).filter((value) => value !== null && value !== undefined).map(String));
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.json({ ok: true, count: 0, pilots: [], message: 'stracker.db3 no estÃ¡ disponible para detectar pilotos sin cuenta.' });
    return;
  }

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const pilots = reduceDriverStats(laps)
      .filter((pilot) => pilot.id !== null && !linkedIds.has(String(pilot.id)))
      .sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0))
      .map((pilot) => ({
        id: pilot.id,
        name: pilot.name,
        steamGuid: pilot.steamGuid,
        totalLaps: pilot.totalLaps,
        validLaps: pilot.validLaps,
        carsCount: pilot.carsCount,
        tracksCount: pilot.tracksCount,
        bestLapMs: pilot.bestLapMs,
        bestLap: pilot.bestLap,
        lastSeenAt: pilot.lastSeenAt
      }));

    res.json({ ok: true, count: pilots.length, pilots, message: 'Pilotos sin usuario vinculado cargados.' });
  } catch (error) {
    res.status(200).json({ ok: false, pilots: [], message: 'No se pudieron cargar pilotos sin cuenta.', error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/admin/name-filters/bulk', async (req, res) => {
  const adminAccess = await getCurrentAdminAccess(req);
  if (!adminAccess.ok) {
    sendAdminAccessDenied(res, adminAccess);
    return;
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).json({ ok: false, message: 'No hay cambios para guardar.' });
    return;
  }

  const store = await readDisplayNameStoreAsync(true);
  const now = new Date().toISOString();
  const changes: PlainObject[] = [];

  for (const item of items.slice(0, 200)) {
    const kind = sanitizeDisplayNameKind(item?.kind);
    const displayName = cleanDisplayNameInput(item?.displayName);
    const sourceName = cleanDisplayNameInput(item?.sourceName);
    const sourceCode = compactNullableText(item?.sourceCode);
    const sourceId = numberOrNull(item?.sourceId);
    const notes = compactNullableText(item?.notes);

    if (!kind || !displayName) continue;

    const existing = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);
    const before = existing ? { ...existing } : null;

    if (existing) {
      existing.sourceId = sourceId;
      existing.sourceCode = sourceCode;
      existing.sourceName = sourceName || existing.sourceName;
      existing.displayName = displayName;
      existing.notes = notes;
      existing.enabled = item?.enabled !== false;
      existing.updatedAt = now;
      changes.push({ before, after: { ...existing } });
    } else {
      const created = {
        id: makeEntryId(kind, sourceId, sourceCode, sourceName),
        kind,
        sourceId,
        sourceCode,
        sourceName: sourceName || sourceCode || displayName,
        displayName,
        notes,
        enabled: item?.enabled !== false,
        createdAt: now,
        updatedAt: now
      };
      store.entries.push(created);
      changes.push({ before: null, after: created });
    }
  }

  await writeDisplayNameStoreAsync(store);
  await writeAdminAuditLog(req, adminAccess, 'display_names.bulk_save', 'display_name', null, null, { count: changes.length, changes });

  res.json({
    ok: true,
    saved: changes.length,
    storage: getDisplayNamesDbInfo(),
    message: `${changes.length} alias guardados correctamente.`
  });
});

app.post('/api/admin/name-filters', async (req, res) => {
  const adminAccess = await getCurrentAdminAccess(req);
  if (!adminAccess.ok) {
    sendAdminAccessDenied(res, adminAccess);
    return;
  }

  const kind = sanitizeDisplayNameKind(req.body?.kind);
  const displayName = cleanDisplayNameInput(req.body?.displayName);
  const sourceName = cleanDisplayNameInput(req.body?.sourceName);
  const sourceCode = compactNullableText(req.body?.sourceCode);
  const sourceId = numberOrNull(req.body?.sourceId);
  const notes = compactNullableText(req.body?.notes);

  if (!kind) {
    res.status(400).json({ ok: false, message: 'Tipo no vÃ¡lido. Usa driver, car o track.' });
    return;
  }

  if (!displayName) {
    res.status(400).json({ ok: false, message: 'El nombre visible no puede estar vacÃ­o.' });
    return;
  }

  const store = await readDisplayNameStoreAsync(true);
  const existing = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);
  const now = new Date().toISOString();

  const beforeEntry = existing ? { ...existing } : null;
  let afterEntry: DisplayNameEntry;

  if (existing) {
    existing.sourceId = sourceId;
    existing.sourceCode = sourceCode;
    existing.sourceName = sourceName || existing.sourceName;
    existing.displayName = displayName;
    existing.notes = notes;
    existing.enabled = req.body?.enabled !== false;
    existing.updatedAt = now;
    afterEntry = { ...existing };
  } else {
    afterEntry = {
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
    };
    store.entries.push(afterEntry);
  }

  await writeDisplayNameStoreAsync(store);
  await writeAdminAuditLog(req, adminAccess, beforeEntry ? 'display_name.update' : 'display_name.create', 'display_name', afterEntry.id, beforeEntry, afterEntry);
  res.json({
    ok: true,
    entry: findDisplayNameEntry(await readDisplayNameStoreAsync(true), kind, sourceId, sourceCode, sourceName),
    storage: getDisplayNamesDbInfo(),
    message: 'Nombre visible guardado correctamente.'
  });
});

app.post('/api/admin/name-filters/delete', async (req, res) => {
  const adminAccess = await getCurrentAdminAccess(req);
  if (!adminAccess.ok) {
    sendAdminAccessDenied(res, adminAccess);
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
  await writeAdminAuditLog(req, adminAccess, 'display_name.delete', 'display_name', entryId || null, { kind, entryId, sourceId, sourceCode, sourceName }, { removed: before - store.entries.length });
  res.json({
    ok: true,
    removed: before - store.entries.length,
    storage: getDisplayNamesDbInfo(),
    message: before === store.entries.length ? 'No habÃ­a override que eliminar.' : 'Override eliminado. Se usarÃ¡ el nombre automÃ¡tico.'
  });
});

app.post('/api/auth/register', async (req, res) => {
  if (!readBooleanEnv('AUTH_REGISTRATION_ENABLED', true)) {
    res.status(403).json({
      ok: false,
      message: 'El registro estÃ¡ desactivado temporalmente.'
    });
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const displayName = normalizeDisplayName(req.body?.displayName);
  const password = String(req.body?.password ?? '');
  const playerId = req.body?.playerId;

  if (!email || !email.includes('@') || email.length > 160) {
    res.status(400).json({ ok: false, message: 'Introduce un email vÃ¡lido.' });
    return;
  }

  if (!displayName || displayName.length < 2) {
    res.status(400).json({ ok: false, message: 'Introduce un nombre de usuario de al menos 2 caracteres.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ ok: false, message: 'La contraseÃ±a debe tener al menos 6 caracteres.' });
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
      res.status(409).json({ ok: false, message: 'Ese piloto ya estÃ¡ vinculado a otra cuenta.' });
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
    res.status(401).json({ ok: false, message: 'Email o contraseÃ±a incorrectos.' });
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

// GC AUTH CHANGE PASSWORD V8.8.4 START
app.post('/api/auth/password', async (req, res) => {
  const context = await getAuthContextAsync(req);

  if (!context) {
    res.status(401).json({ ok: false, message: 'Necesitas iniciar sesiÃ³n.' });
    return;
  }

  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (!currentPassword) {
    res.status(400).json({ ok: false, message: 'Introduce tu contraseÃ±a actual.' });
    return;
  }

  if (!verifyPassword(currentPassword, context.user.password)) {
    res.status(401).json({ ok: false, message: 'La contraseÃ±a actual no es correcta.' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ ok: false, message: 'La nueva contraseÃ±a debe tener al menos 8 caracteres.' });
    return;
  }

  if (newPassword.length > 128) {
    res.status(400).json({ ok: false, message: 'La nueva contraseÃ±a es demasiado larga.' });
    return;
  }

  if (newPassword === currentPassword) {
    res.status(400).json({ ok: false, message: 'La nueva contraseÃ±a debe ser distinta a la actual.' });
    return;
  }

  const beforeSessions = countSessionsForUser(context.store, context.user.id);

  context.user.password = hashPassword(newPassword);
  context.user.updatedAt = new Date().toISOString();

  // Conserva la sesiÃ³n actual y cierra el resto por seguridad.
  context.store.sessions = context.store.sessions.filter((session) => {
    if (session.userId !== context.user.id) return true;
    return session.id === context.session.id;
  });

  await writeUserStoreAsync(context.store);

  const afterSessions = countSessionsForUser(context.store, context.user.id);
  const sessionsRevoked = Math.max(0, beforeSessions - afterSessions);

  res.json({
    ok: true,
    user: publicUser(context.user),
    sessionsRevoked,
    message: sessionsRevoked > 0
      ? 'ContraseÃ±a actualizada. Se han cerrado otras sesiones de tu cuenta.'
      : 'ContraseÃ±a actualizada correctamente.'
  });
});
// GC AUTH CHANGE PASSWORD V8.8.4 END

app.post('/api/auth/logout', async (req, res) => {
  const token = readAuthToken(req);
  const store = await readUserStoreAsync();

  if (token) {
    const hash = tokenHash(token);
    store.sessions = store.sessions.filter((session) => session.tokenHash !== hash);
    await writeUserStoreAsync(store);
  }

  clearSessionCookie(res);
  res.json({ ok: true, authenticated: false, message: 'SesiÃ³n cerrada.' });
});

app.post('/api/auth/link-pilot', async (req, res) => {
  const context = await getAuthContextAsync(req);
  if (!context) {
    res.status(401).json({ ok: false, message: 'Necesitas iniciar sesiÃ³n.' });
    return;
  }

  const resolved = await resolvePilotLink(req.body?.playerId);
  if (!resolved.ok) {
    res.status(400).json({ ok: false, message: resolved.message });
    return;
  }

  if (findUserByPilotId(context.store, resolved.link.playerId, context.user.id)) {
    res.status(409).json({ ok: false, message: 'Ese piloto ya estÃ¡ vinculado a otra cuenta.' });
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
    res.status(401).json({ ok: false, message: 'Necesitas iniciar sesiÃ³n.' });
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
    message: 'No se muestran usuario, contraseÃ±a ni secret. Solo si estÃ¡n configurados.'
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
      message: 'Secret invÃ¡lido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');
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
      message: 'Secret invÃ¡lido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');
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
      message: 'El archivo existe, pero no se pudo leer como SQLite. Revisa que sea stracker.db3 vÃ¡lido.',
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
      message: 'Vueltas reales leÃ­das desde stracker.db3.'
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
      message: 'Ãrea de pilotos en maqueta. Sin stracker.db3 vÃ¡lido todavÃ­a.'
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
      message: 'Pilotos reales generados desde stracker.db3. Login pendiente para Ã¡rea privada.'
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


app.get('/api/combos/stats', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 500);
    const q = getQueryString(req, 'q') || getQueryString(req, 'search');
    const sort = getQueryString(req, 'sort', 'recent').toLowerCase();
    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);
    let items = buildComboStatsFromLaps(laps, comboDefinitions);

    if (q) {
      items = items.filter((combo) => includesFilter(`${combo.comboId} ${combo.track?.name} ${combo.track?.code} ${combo.carSummary} ${combo.usedCarSummary} ${(combo.cars || []).map((car: any) => `${car.name} ${car.code} ${car.brand}`).join(' ')}`, q));
    }

    if (sort === 'laps') items = items.sort((a, b) => Number(b.totalLaps ?? 0) - Number(a.totalLaps ?? 0));
    else if (sort === 'drivers') items = items.sort((a, b) => Number(b.driversCount ?? 0) - Number(a.driversCount ?? 0));
    else if (sort === 'fastest') items = items.sort((a, b) => Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));
    else items = items.sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: Math.min(items.length, limit),
      totalCombos: items.length,
      totalComboDefinitions: comboDefinitions.length,
      totalLogicalCombos: items.length,
      mergePolicy: { newCarThresholdPercent: 75 },
      sort,
      filters: { q: q || null },
      items: items.slice(0, limit),
      message: 'Combos lÃ³gicos: mismo circuito y coches compatibles se agrupan. Si el 75% de los coches son nuevos, nace otro combo.'
    });
  } catch (error) {
    console.error('[GC] Error generando combo stats:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron generar estadÃ­sticas de combos.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/combos/:comboId', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);
    const profile = buildComboProfile(req.params.comboId, laps, comboDefinitions);

    if (!profile) {
      res.status(200).json({
        ok: false,
        item: null,
        message: 'No se encontrÃ³ ese ComboId en stracker.db3.'
      });
      return;
    }

    res.json({
      ok: true,
      mode: 'real-stracker',
      item: profile,
      message: 'Ficha de combo lÃ³gico generada desde ComboId/familia de combos.'
    });
  } catch (error) {
    console.error('[GC] Error generando combo profile:', error);
    res.status(200).json({
      ok: false,
      item: null,
      message: 'No se pudo generar la ficha del combo.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/combos/:trackId/:carId', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const profile = buildLegacyComboProfile(req.params.trackId, req.params.carId, laps);

    if (!profile) {
      res.status(200).json({
        ok: false,
        item: null,
        message: 'No se encontrÃ³ ese combo legacy TrackId + CarId en las vueltas reales.'
      });
      return;
    }

    res.json({
      ok: true,
      mode: 'real-stracker',
      item: profile,
      message: 'Ficha legacy TrackId + CarId. La vista principal usa /api/combos/:comboId.'
    });
  } catch (error) {
    console.error('[GC] Error generando combo legacy profile:', error);
    res.status(200).json({
      ok: false,
      item: null,
      message: 'No se pudo generar la ficha legacy del combo.',
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
      message: `Actividad reciente de las Ãºltimas ${hours}h.`
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








/* GC_AUTH_LOGOUT_PATCH_V1
 * Endpoint de cierre de sesiÃ³n para headers pÃºblico e interno.
 * Limpia cookie gc_session y elimina la sesiÃ³n en MySQL, SQLite o JSON.
 */
function gcParseRequestCookies(rawCookieHeader) {
  return String(rawCookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex <= 0) return cookies;
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function gcLogoutCookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure
  };
}

function gcClearSessionCookie(response) {
  const options = gcLogoutCookieOptions();
  response.clearCookie(sessionCookieName, options);
  response.cookie(sessionCookieName, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0)
  });
}

function gcSessionTokenHashes(token) {
  const raw = String(token || '').trim();
  if (!raw) return ['', ''];
  return [
    crypto.createHash('sha256').update(raw).digest('hex'),
    raw
  ];
}

async function gcDeleteSessionByToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return 0;
  const hashes = gcSessionTokenHashes(raw);

  if (useMysqlStorage()) {
    const result = await mysqlExecute('DELETE FROM gc_sessions WHERE token_hash IN (?, ?)', hashes);
    return Number(result?.affectedRows || 0);
  }

  if (useSqliteStorage()) {
    return withAppSqliteDb((db) => {
      db.run('DELETE FROM gc_sessions WHERE token_hash IN (?, ?)', hashes);
      return Number(typeof db.getRowsModified === 'function' ? db.getRowsModified() : 0);
    }, true);
  }

  const filePath = getUsersPath();
  if (!fs.existsSync(filePath)) return 0;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return 0;
  }

  if (!Array.isArray(parsed.sessions)) return 0;
  const before = parsed.sessions.length;
  parsed.sessions = parsed.sessions.filter((session) => {
    const sessionHash = String(session?.tokenHash || session?.token_hash || session?.hash || '');
    const sessionToken = String(session?.token || '');
    return !hashes.includes(sessionHash) && sessionToken !== raw;
  });

  const removed = before - parsed.sessions.length;
  if (removed > 0) {
    ensureDirForFile(filePath);
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  return removed;
}

async function gcLogoutRequest(req, res, redirectToHome = false) {
  const cookies = gcParseRequestCookies(req.headers.cookie);
  const token = cookies[sessionCookieName];
  let removedSessions = 0;

  try {
    removedSessions = await gcDeleteSessionByToken(token);
  } catch (error) {
    console.error('[GC] Error cerrando sesiÃ³n:', error);
  }

  gcClearSessionCookie(res);

  if (redirectToHome) {
    res.redirect('/');
    return;
  }

  res.json({
    ok: true,
    authenticated: false,
    removedSessions,
    message: 'SesiÃ³n cerrada correctamente.'
  });
}

app.post('/api/auth/logout', (req, res) => {
  void gcLogoutRequest(req, res, false);
});

app.get('/api/auth/logout', (req, res) => {
  void gcLogoutRequest(req, res, true);
});

app.get('/api/logout', (req, res) => {
  void gcLogoutRequest(req, res, true);
});




















































































































































































































/* GC_ASTRO_RUNTIME_PATCH_V3
 * Runtime Hostinger + Astro para Express.
 * V3: separa API, estáticos prerenderizados y SSR.
 * Objetivo: / funciona, /admin, /hotlaps, /perfil, /combos y /pilotos también.
 */
function gcFindExistingDirectory(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

function gcFindExistingFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function gcSafeDecodeUrlPath(value) {
  const raw = String(value || '/').split('?')[0].split('#')[0] || '/';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function gcIsApiRequest(requestUrl) {
  const decoded = gcSafeDecodeUrlPath(requestUrl);
  return decoded === '/api' || decoded.startsWith('/api/') || decoded === '/gc-data' || decoded.startsWith('/gc-data/');
}

function gcFindStaticHtmlForRequest(clientDir, requestUrl) {
  if (!clientDir) return null;
  const decoded = gcSafeDecodeUrlPath(requestUrl);
  if (gcIsApiRequest(decoded)) return null;

  const clean = decoded.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return path.join(clientDir, 'index.html');

  return gcFindExistingFile([
    path.join(clientDir, clean, 'index.html'),
    path.join(clientDir, clean + '.html')
  ]);
}

function gcRuntimeSnapshot(clientDir, astroEntry) {
  function dirInfo(label, dirPath) {
    const exists = Boolean(dirPath && fs.existsSync(dirPath));
    return {
      label,
      path: dirPath,
      exists,
      isDirectory: exists ? fs.statSync(dirPath).isDirectory() : false
    };
  }

  function fileInfo(label, filePath) {
    const exists = Boolean(filePath && fs.existsSync(filePath));
    return {
      label,
      path: filePath,
      exists,
      isFile: exists ? fs.statSync(filePath).isFile() : false
    };
  }

  return {
    ok: true,
    mode: 'astro-runtime-v3',
    rootDir,
    distDir,
    clientDir,
    astroEntry,
    candidates: {
      client: [
        dirInfo('dist/client', path.join(distDir, 'client')),
        dirInfo('root/client', path.join(rootDir, 'client')),
        dirInfo('dist', distDir)
      ],
      server: [
        fileInfo('dist/server/entry.mjs', path.join(distDir, 'server', 'entry.mjs')),
        fileInfo('root/server/entry.mjs', path.join(rootDir, 'server', 'entry.mjs'))
      ]
    }
  };
}

async function mountAstroRuntime() {
  const clientDir = gcFindExistingDirectory([
    path.join(distDir, 'client'),
    path.join(rootDir, 'client'),
    distDir
  ]);

  const astroEntry = gcFindExistingFile([
    path.join(distDir, 'server', 'entry.mjs'),
    path.join(rootDir, 'server', 'entry.mjs')
  ]);

  const runtimeState = gcRuntimeSnapshot(clientDir, astroEntry);
  app.locals.gcAstroRuntime = runtimeState;

  app.get('/api/runtime/status', (_req, res) => {
    res.json(app.locals.gcAstroRuntime || runtimeState);
  });

  if (clientDir) {
    const astroAssetsDir = path.join(clientDir, '_astro');
    if (fs.existsSync(astroAssetsDir)) {
      app.use('/_astro', express.static(astroAssetsDir, {
        maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
        immutable: process.env.NODE_ENV === 'production'
      }));
    }

    app.use(express.static(clientDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      index: false,
      extensions: false
    }));

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (gcIsApiRequest(req.originalUrl || req.url)) return next();

      const htmlFile = gcFindStaticHtmlForRequest(clientDir, req.originalUrl || req.url);
      if (htmlFile) {
        res.sendFile(htmlFile);
        return;
      }

      next();
    });

    console.log('[GC] Astro client V3 montado:', clientDir);
  } else {
    console.warn('[GC] Astro client V3 no encontrado.');
  }

  if (astroEntry) {
    try {
      const astroServer = await import(pathToFileURL(astroEntry).href);
      const handler = astroServer.handler || astroServer.default;
      if (typeof handler === 'function') {
        app.use((req, res, next) => {
          if (gcIsApiRequest(req.originalUrl || req.url)) return next();
          Promise.resolve(handler(req, res, next)).catch((error) => {
            console.error('[GC] Error en Astro SSR V3:', error);
            if (!res.headersSent) {
              res.status(500).type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>GrassCutters SSR error</title></head><body style="background:#03140d;color:#f1fff6;font-family:Arial;padding:32px"><h1>Error renderizando Astro</h1><p>Revisa /api/runtime/status y los logs de Hostinger.</p></body></html>');
            }
          });
        });
        console.log('[GC] Astro SSR V3 montado:', astroEntry);
      } else {
        console.warn('[GC] Astro entry V3 encontrado, pero no exporta handler:', astroEntry);
      }
    } catch (error) {
      console.error('[GC] Error importando Astro SSR V3:', error);
    }
  } else {
    console.warn('[GC] Astro SSR V3 no encontrado. Las rutas dinámicas dependerán solo de HTML estático.');
  }

  app.use((req, res, next) => {
    if (gcIsApiRequest(req.originalUrl || req.url)) return next();

    res.status(404).type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GrassCutters · ruta no encontrada</title></head><body style="margin:0;background:#03140d;color:#f1fff6;font-family:Arial,sans-serif;padding:32px;line-height:1.55"><main style="max-width:760px"><h1>Ruta no encontrada</h1><p>No se encontró una página estática ni SSR para <strong>' + escapeHtml(req.originalUrl || req.url) + '</strong>.</p><p><a style="color:#85ff55" href="/api/runtime/status">Ver runtime</a> · <a style="color:#85ff55" href="/">Volver al inicio</a></p></main></body></html>');
  });
}

await mountAstroRuntime();

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

