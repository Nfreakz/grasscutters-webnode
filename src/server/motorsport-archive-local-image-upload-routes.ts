import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);
const MAX_BYTES = Number(process.env.ARCHIVE_MEDIA_UPLOAD_MAX_BYTES || 8 * 1024 * 1024);

function isMysql() {
  const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  return driver === 'mysql' || driver === 'mariadb';
}

function slugify(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 110) || 'archivo';
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCategory(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  const map: Record<string, string> = {
    circuit: 'circuitos',
    track: 'circuitos',
    circuito: 'circuitos',
    circuitos: 'circuitos',
    pilot: 'pilotos',
    driver: 'pilotos',
    piloto: 'pilotos',
    pilotos: 'pilotos',
    vehicle: 'vehiculos',
    car: 'vehiculos',
    vehiculo: 'vehiculos',
    vehículos: 'vehiculos',
    vehiculos: 'vehiculos',
    championship: 'campeonatos',
    campeonato: 'campeonatos',
    campeonatos: 'campeonatos',
    record: 'records',
    records: 'records',
    glossary: 'glosario',
    glosario: 'glosario',
  };
  return map[raw] || raw || 'general';
}

function mysqlDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 23).replace('T', ' ')
    : date.toISOString().slice(0, 23).replace('T', ' ');
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) throw new Error('Faltan variables MySQL.');

  const mysql = await importMysql2();
  return mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
}

async function ensureSchema(connection: any) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS gc_archive_items (
      id VARCHAR(120) NOT NULL PRIMARY KEY,
      category VARCHAR(60) NOT NULL,
      slug VARCHAR(160) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      item_json LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uniq_gc_archive_category_slug (category, slug),
      INDEX idx_gc_archive_status (status),
      INDEX idx_gc_archive_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function mysqlFind(connection: any, idOrSlug: string) {
  await ensureSchema(connection);
  const [rows] = await connection.execute(
    'SELECT id, category, slug, title, status, item_json, created_at FROM gc_archive_items WHERE id = ? OR slug = ? LIMIT 1',
    [idOrSlug, idOrSlug],
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  try {
    return { row, item: JSON.parse(row.item_json) };
  } catch {
    return { row, item: { id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status } };
  }
}

async function mysqlSave(connection: any, item: any, row: any) {
  item.updatedAt = nowIso();
  await connection.execute(
    `UPDATE gc_archive_items
     SET category = ?, slug = ?, title = ?, status = ?, item_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      item.category || row.category || 'general',
      item.slug || row.slug || item.id,
      item.title || row.title || item.slug || item.id,
      item.status || row.status || 'draft',
      JSON.stringify(item),
      mysqlDate(item.updatedAt),
      row.id,
    ],
  );
}

function getJsonPath(rootDir: string) {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.MOTORSPORT_ARCHIVE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function readJsonStore(rootDir: string) {
  const filePath = getJsonPath(rootDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    return { filePath, store: parsed };
  } catch {
    return { filePath, store: { version: 1, updatedAt: nowIso(), items: [] } };
  }
}

function writeJsonStore(filePath: string, store: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = nowIso();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function mediaDir(rootDir: string) {
  const configured = process.env.ARCHIVE_MEDIA_DIR?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  return path.join(rootDir, 'public', 'archive-media');
}

function mediaPublicBase() {
  return (
    process.env.ARCHIVE_MEDIA_PUBLIC_URL?.trim() ||
    process.env.ARCHIVE_MEDIA_PUBLIC?.trim() ||
    '/archive-media'
  ).replace(/\/+$/, '') || '/archive-media';
}

function decodeDataUrl(dataUrl: unknown) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;

  return { mime, buffer };
}

function extFor(mime: string, fileName: string) {
  const originalExt = path.extname(fileName || '').toLowerCase();
  if (ALLOWED_EXT.has(originalExt)) return originalExt === '.jpeg' ? '.jpg' : originalExt;

  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/svg+xml') return '.svg';
  return '.jpg';
}

function sanitizeFileBase(fileName: string, fallback: string) {
  const parsed = path.parse(fileName || '');
  return slugify(parsed.name || fallback || 'imagen');
}

function writeImage(rootDir: string, item: any, decoded: { mime: string; buffer: Buffer }, fileName: string) {
  const category = normalizeCategory(item.category || item.type || 'general');
  const itemSlug = slugify(item.slug || item.title || item.id);
  const folder = path.join(mediaDir(rootDir), category, itemSlug);
  fs.mkdirSync(folder, { recursive: true });

  const ext = extFor(decoded.mime, fileName);
  const safeBase = sanitizeFileBase(fileName, itemSlug);
  const finalName = `${safeBase}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  const absolutePath = path.join(folder, finalName);

  fs.writeFileSync(absolutePath, decoded.buffer);

  return {
    absolutePath,
    publicUrl: `${mediaPublicBase()}/${category}/${itemSlug}/${finalName}`.replace(/\/{2,}/g, '/').replace('https:/', 'https://').replace('http:/', 'http://'),
  };
}

function addMedia(item: any, mediaItem: any, makePrimary: boolean) {
  const media = Array.isArray(item.media) ? [...item.media] : [];

  if (makePrimary) {
    media.forEach((entry: any) => {
      entry.isMain = false;
      entry.isPrimary = false;
    });
  }

  media.unshift(mediaItem);
  item.media = media;

  if (makePrimary || !item.coverUrl) {
    item.coverUrl = mediaItem.url;
    item.coverAlt = mediaItem.alt;
  }

  item.updatedAt = nowIso();
  return item;
}

export function registerMotorsportArchiveLocalImageUploadRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.post('/api/admin/archive/unified/items/:id/media/upload', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const {
        dataUrl,
        fileName = 'imagen',
        alt = '',
        source = 'GrassCutters Racing',
        sourceUrl = '',
        author = '',
        license = 'Imagen propia / GrassCutters Racing',
        makePrimary = true,
        locked = true,
      } = req.body || {};

      if (!id) return res.status(400).json({ ok: false, message: 'Falta ID de ficha.' });

      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) {
        return res.status(400).json({
          ok: false,
          message: `Imagen no válida. Usa JPG, PNG, WEBP o SVG de máximo ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
        });
      }

      if (isMysql()) {
        const connection = await getConnection();
        try {
          const found = await mysqlFind(connection, id);
          if (!found?.item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });

          const item = found.item;
          item.id = item.id || found.row.id;
          item.category = normalizeCategory(item.category || found.row.category);
          item.slug = item.slug || found.row.slug;
          item.title = item.title || found.row.title;

          const written = writeImage(rootDir, item, decoded, String(fileName));

          const mediaItem = {
            id: crypto.randomUUID(),
            type: 'image',
            kind: 'image',
            url: written.publicUrl,
            localUrl: written.publicUrl,
            alt: String(alt || item.title || 'Imagen del Archivo Motorsport'),
            source: String(source || ''),
            sourceUrl: String(sourceUrl || ''),
            author: String(author || ''),
            license: String(license || ''),
            isMain: Boolean(makePrimary),
            isPrimary: Boolean(makePrimary),
            locked: Boolean(locked),
            local: true,
            createdAt: nowIso(),
            originalName: String(fileName || ''),
            absolutePath: written.absolutePath,
          };

          addMedia(item, mediaItem, Boolean(makePrimary));
          await mysqlSave(connection, item, found.row);

          return res.json({ ok: true, storage: 'mysql', item, media: mediaItem, publicUrl: written.publicUrl });
        } finally {
          await connection.end();
        }
      }

      const { filePath, store } = readJsonStore(rootDir);
      const index = store.items.findIndex((entry: any) => String(entry.id) === id || String(entry.slug) === id);
      if (index === -1) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });

      const item = store.items[index];
      item.category = normalizeCategory(item.category || item.type);
      const written = writeImage(rootDir, item, decoded, String(fileName));

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'image',
        kind: 'image',
        url: written.publicUrl,
        localUrl: written.publicUrl,
        alt: String(alt || item.title || 'Imagen del Archivo Motorsport'),
        source: String(source || ''),
        sourceUrl: String(sourceUrl || ''),
        author: String(author || ''),
        license: String(license || ''),
        isMain: Boolean(makePrimary),
        isPrimary: Boolean(makePrimary),
        locked: Boolean(locked),
        local: true,
        createdAt: nowIso(),
        originalName: String(fileName || ''),
        absolutePath: written.absolutePath,
      };

      store.items[index] = addMedia(item, mediaItem, Boolean(makePrimary));
      writeJsonStore(filePath, store);

      return res.json({ ok: true, storage: 'json', item: store.items[index], media: mediaItem, publicUrl: written.publicUrl });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error subiendo imagen.' });
    }
  });
}
