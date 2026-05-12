import fs from 'node:fs';
import path from 'node:path';
import {
  createEmptyMotorsportArchiveStore,
  normalizeMotorsportArchiveItem,
  type MotorsportArchiveItem,
  type MotorsportArchiveStore
} from './schema';

type MysqlPool = any;
let mysqlPool: MysqlPool | null = null;
let mysqlSchemaReady = false;

function compact(value: unknown) {
  return String(value ?? '').trim();
}

function useMysqlArchiveStorage() {
  const explicit = compact(process.env.ARCHIVE_STORAGE_DRIVER).toLowerCase();
  if (explicit) return explicit === 'mysql' || explicit === 'mariadb';
  const appDriver = compact(process.env.APP_STORAGE_DRIVER).toLowerCase();
  return appDriver === 'mysql' || appDriver === 'mariadb';
}

export function getMotorsportArchiveStorageDriver() {
  return useMysqlArchiveStorage() ? 'mysql' : 'json';
}

export function getMotorsportArchiveStorePath(rootDir = process.cwd()) {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.APP_MOTORSPORT_ARCHIVE_PATH?.trim();
  if (!configured) return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

export function getMotorsportArchiveSnapshotPath(rootDir = process.cwd()) {
  const configured = process.env.ARCHIVE_SNAPSHOT_PATH?.trim();
  if (!configured) return getMotorsportArchiveStorePath(rootDir);
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseJsonField(value: unknown, fallback: unknown) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  if (!value) return fallback;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function safeDate(value: unknown) {
  if (!value) return new Date().toISOString();
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

function mysqlToItem(row: any): MotorsportArchiveItem {
  return normalizeMotorsportArchiveItem({
    id: row.id,
    category: row.category,
    slug: row.slug,
    title: row.title,
    status: row.status,
    summary: row.summary,
    body: row.body,
    facts: parseJsonField(row.facts_json, []),
    media: parseJsonField(row.media_json, []),
    relatedIds: parseJsonField(row.related_ids_json, []),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    createdAt: safeDate(row.created_at),
    updatedAt: safeDate(row.updated_at)
  });
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getArchiveMysqlPool() {
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

export async function ensureMotorsportArchiveMysqlSchema() {
  if (!useMysqlArchiveStorage() || mysqlSchemaReady) return;
  const pool = await getArchiveMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gc_archive_items (
      id VARCHAR(80) NOT NULL PRIMARY KEY,
      category VARCHAR(40) NOT NULL,
      slug VARCHAR(160) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      summary TEXT NULL,
      body LONGTEXT NULL,
      facts_json LONGTEXT NULL,
      media_json LONGTEXT NULL,
      related_ids_json LONGTEXT NULL,
      seo_title VARCHAR(255) NULL,
      seo_description TEXT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uniq_gc_archive_category_slug (category, slug),
      INDEX idx_gc_archive_status (status),
      INDEX idx_gc_archive_category (category),
      INDEX idx_gc_archive_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  mysqlSchemaReady = true;
}

function readJsonStore(rootDir = process.cwd()): MotorsportArchiveStore {
  const filePath = getMotorsportArchiveStorePath(rootDir);
  if (!fs.existsSync(filePath)) return createEmptyMotorsportArchiveStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<MotorsportArchiveStore>;
    return {
      version: 1,
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      items: Array.isArray(parsed.items) ? parsed.items.map((item) => normalizeMotorsportArchiveItem(item)) : []
    };
  } catch (error) {
    console.error('[GC Archivo Motorsport] Error leyendo store JSON:', error);
    return createEmptyMotorsportArchiveStore();
  }
}

function writeJsonStore(store: MotorsportArchiveStore, rootDir = process.cwd(), filePath = getMotorsportArchiveStorePath(rootDir)) {
  ensureDirForFile(filePath);
  const nextStore: MotorsportArchiveStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: store.items.map((item) => normalizeMotorsportArchiveItem(item))
  };
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
  return nextStore;
}

function writeSnapshot(store: MotorsportArchiveStore, rootDir = process.cwd()) {
  const snapshotPath = getMotorsportArchiveSnapshotPath(rootDir);
  return writeJsonStore(store, rootDir, snapshotPath);
}

export function readMotorsportArchiveStore(rootDir = process.cwd()): MotorsportArchiveStore {
  // Las páginas Astro públicas siguen usando lectura síncrona. En modo MySQL leen
  // el snapshot JSON persistente que se actualiza después de cada escritura DB.
  return readJsonStore(rootDir);
}

export function writeMotorsportArchiveStore(store: MotorsportArchiveStore, rootDir = process.cwd()) {
  return writeJsonStore(store, rootDir);
}

export async function readMotorsportArchiveStoreAsync(rootDir = process.cwd()): Promise<MotorsportArchiveStore> {
  if (!useMysqlArchiveStorage()) return readJsonStore(rootDir);
  await ensureMotorsportArchiveMysqlSchema();
  const pool = await getArchiveMysqlPool();
  const [rows] = await pool.query('SELECT * FROM gc_archive_items ORDER BY updated_at DESC') as any;
  const store: MotorsportArchiveStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(rows) ? rows.map(mysqlToItem) : []
  };
  writeSnapshot(store, rootDir);
  return store;
}

export async function writeMotorsportArchiveStoreAsync(store: MotorsportArchiveStore, rootDir = process.cwd()) {
  const nextStore: MotorsportArchiveStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: store.items.map((item) => normalizeMotorsportArchiveItem(item))
  };
  if (!useMysqlArchiveStorage()) return writeJsonStore(nextStore, rootDir);

  await ensureMotorsportArchiveMysqlSchema();
  const pool = await getArchiveMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM gc_archive_items');
    for (const item of nextStore.items) {
      await connection.query(
        `INSERT INTO gc_archive_items
          (id, category, slug, title, status, summary, body, facts_json, media_json, related_ids_json, seo_title, seo_description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.category,
          item.slug,
          item.title,
          item.status,
          item.summary,
          item.body,
          JSON.stringify(item.facts || []),
          JSON.stringify(item.media || []),
          JSON.stringify(item.relatedIds || []),
          item.seoTitle,
          item.seoDescription,
          isoToMysql(item.createdAt) || isoToMysql(new Date().toISOString()),
          isoToMysql(item.updatedAt) || isoToMysql(new Date().toISOString())
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
  writeSnapshot(nextStore, rootDir);
  return nextStore;
}

export function upsertMotorsportArchiveItem(input: Partial<MotorsportArchiveItem>, rootDir = process.cwd()) {
  const store = readMotorsportArchiveStore(rootDir);
  const item = normalizeMotorsportArchiveItem(input);
  const existingIndex = store.items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    const existing = store.items[existingIndex];
    store.items[existingIndex] = normalizeMotorsportArchiveItem({ ...existing, ...item, createdAt: existing.createdAt });
  } else {
    store.items.push(item);
  }
  return { store: writeMotorsportArchiveStore(store, rootDir), item };
}

export async function upsertMotorsportArchiveItemAsync(input: Partial<MotorsportArchiveItem>, rootDir = process.cwd()) {
  const store = await readMotorsportArchiveStoreAsync(rootDir);
  const item = normalizeMotorsportArchiveItem(input);
  const existingIndex = store.items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    const existing = store.items[existingIndex];
    store.items[existingIndex] = normalizeMotorsportArchiveItem({ ...existing, ...item, createdAt: existing.createdAt });
  } else {
    store.items.push(item);
  }
  return { store: await writeMotorsportArchiveStoreAsync(store, rootDir), item };
}

export function archiveMotorsportArchiveItem(id: string, rootDir = process.cwd()) {
  const store = readMotorsportArchiveStore(rootDir);
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return { store, item: null };
  item.status = 'hidden';
  item.updatedAt = new Date().toISOString();
  return { store: writeMotorsportArchiveStore(store, rootDir), item };
}

export async function archiveMotorsportArchiveItemAsync(id: string, rootDir = process.cwd()) {
  const store = await readMotorsportArchiveStoreAsync(rootDir);
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return { store, item: null };
  item.status = 'hidden';
  item.updatedAt = new Date().toISOString();
  return { store: await writeMotorsportArchiveStoreAsync(store, rootDir), item };
}

export async function deleteMotorsportArchiveItemAsync(id: string, rootDir = process.cwd()) {
  const store = await readMotorsportArchiveStoreAsync(rootDir);
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return { store, item: null };
  store.items = store.items.filter((entry) => entry.id !== id);
  return { store: await writeMotorsportArchiveStoreAsync(store, rootDir), item };
}

export async function getMotorsportArchiveStorageStatus(rootDir = process.cwd()) {
  const driver = getMotorsportArchiveStorageDriver();
  const jsonPath = getMotorsportArchiveStorePath(rootDir);
  const snapshotPath = getMotorsportArchiveSnapshotPath(rootDir);
  const jsonStats = fs.existsSync(jsonPath) ? fs.statSync(jsonPath) : null;
  const snapshotStats = fs.existsSync(snapshotPath) ? fs.statSync(snapshotPath) : null;
  let mysql = null;
  if (driver === 'mysql') {
    mysql = {
      hostConfigured: Boolean(process.env.MYSQL_HOST?.trim()),
      databaseConfigured: Boolean(process.env.MYSQL_DATABASE?.trim()),
      userConfigured: Boolean(process.env.MYSQL_USER?.trim()),
      table: 'gc_archive_items'
    };
  }
  return {
    driver,
    jsonPath,
    jsonExists: Boolean(jsonStats),
    jsonModifiedAt: jsonStats?.mtime?.toISOString?.() ?? null,
    snapshotPath,
    snapshotExists: Boolean(snapshotStats),
    snapshotModifiedAt: snapshotStats?.mtime?.toISOString?.() ?? null,
    mysql
  };
}
