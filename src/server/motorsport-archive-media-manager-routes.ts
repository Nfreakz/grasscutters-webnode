import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';

function isMysql() {
  const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  return driver === 'mysql' || driver === 'mariadb';
}

function nowIso() {
  return new Date().toISOString();
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
    'SELECT id, category, slug, title, status, item_json FROM gc_archive_items WHERE id = ? OR slug = ? LIMIT 1',
    [idOrSlug, idOrSlug],
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  try {
    return { row, item: JSON.parse(row.item_json) };
  } catch {
    return { row, item: { id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status, media: [] } };
  }
}

async function mysqlSave(connection: any, item: any, row: any) {
  item.updatedAt = nowIso();
  const media = Array.isArray(item.media) ? item.media : [];
  const cover = media.find((entry: any) => entry.isMain || entry.isPrimary) || media[0] || null;
  item.coverUrl = cover?.url || cover?.localUrl || item.coverUrl || '';
  item.coverAlt = cover?.alt || item.coverAlt || item.title || '';

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
      new Date().toISOString().slice(0, 23).replace('T', ' '),
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

function normalizeMedia(media: any[]) {
  return Array.isArray(media) ? media : [];
}

function updateCover(item: any) {
  const media = normalizeMedia(item.media);
  const cover = media.find((entry) => entry.isMain || entry.isPrimary) || media[0] || null;
  item.coverUrl = cover?.url || cover?.localUrl || '';
  item.coverAlt = cover?.alt || item.title || '';
  item.updatedAt = nowIso();
  return item;
}

function tryDeleteLocalFile(mediaItem: any) {
  const absolute = String(mediaItem?.absolutePath || '').trim();
  if (!absolute) return false;

  try {
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      fs.unlinkSync(absolute);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function withItem(rootDir: string, id: string, callback: (item: any) => any) {
  if (isMysql()) {
    const connection = await getConnection();
    try {
      const found = await mysqlFind(connection, id);
      if (!found?.item) return { found: false, storage: 'mysql' };

      const result = await callback(found.item);
      updateCover(found.item);
      await mysqlSave(connection, found.item, found.row);

      return { found: true, storage: 'mysql', item: found.item, result };
    } finally {
      await connection.end();
    }
  }

  const { filePath, store } = readJsonStore(rootDir);
  const index = store.items.findIndex((entry: any) => String(entry.id) === id || String(entry.slug) === id);
  if (index === -1) return { found: false, storage: 'json' };

  const result = await callback(store.items[index]);
  updateCover(store.items[index]);
  writeJsonStore(filePath, store);

  return { found: true, storage: 'json', item: store.items[index], result };
}

export function registerMotorsportArchiveMediaManagerRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.patch('/api/admin/archive/unified/items/:id/media/:mediaId', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const mediaId = String(req.params.mediaId || '').trim();

      const result = await withItem(rootDir, id, (item) => {
        const media = normalizeMedia(item.media);
        const mediaItem = media.find((entry: any) => String(entry.id) === mediaId);
        if (!mediaItem) return { foundMedia: false };

        if ('alt' in req.body) mediaItem.alt = String(req.body.alt || '');
        if ('source' in req.body) mediaItem.source = String(req.body.source || '');
        if ('sourceUrl' in req.body) mediaItem.sourceUrl = String(req.body.sourceUrl || '');
        if ('author' in req.body) mediaItem.author = String(req.body.author || '');
        if ('license' in req.body) mediaItem.license = String(req.body.license || '');
        if ('locked' in req.body) mediaItem.locked = Boolean(req.body.locked);

        if (req.body.makePrimary === true || req.body.isPrimary === true || req.body.isMain === true) {
          media.forEach((entry: any) => {
            entry.isMain = false;
            entry.isPrimary = false;
          });
          mediaItem.isMain = true;
          mediaItem.isPrimary = true;
        }

        item.media = media;
        return { foundMedia: true, media: mediaItem };
      });

      if (!result.found) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
      if (!result.result?.foundMedia) return res.status(404).json({ ok: false, message: 'Imagen no encontrada.' });

      return res.json({ ok: true, storage: result.storage, item: result.item, media: result.result.media });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error actualizando imagen.' });
    }
  });

  app.post('/api/admin/archive/unified/items/:id/media/:mediaId/primary', async (req: Request, res: Response) => {
    req.body = { ...(req.body || {}), makePrimary: true };
    const handler = app._router?.stack;
    return res.status(307).json({ ok: false, message: 'Usa PATCH con makePrimary:true.' });
  });

  app.delete('/api/admin/archive/unified/items/:id/media/:mediaId', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const mediaId = String(req.params.mediaId || '').trim();

      const result = await withItem(rootDir, id, (item) => {
        const media = normalizeMedia(item.media);
        const index = media.findIndex((entry: any) => String(entry.id) === mediaId);
        if (index === -1) return { foundMedia: false, deletedFile: false };

        const [removed] = media.splice(index, 1);
        const deletedFile = tryDeleteLocalFile(removed);

        if (!media.some((entry: any) => entry.isMain || entry.isPrimary) && media[0]) {
          media[0].isMain = true;
          media[0].isPrimary = true;
        }

        item.media = media;
        return { foundMedia: true, deletedFile, removed };
      });

      if (!result.found) return res.status(404).json({ ok: false, deleted: false, message: 'Ficha no encontrada.' });
      if (!result.result?.foundMedia) return res.status(404).json({ ok: false, deleted: false, message: 'Imagen no encontrada.' });

      return res.json({
        ok: true,
        deleted: true,
        deletedFile: Boolean(result.result.deletedFile),
        storage: result.storage,
        item: result.item,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, deleted: false, message: error?.message || 'Error borrando imagen.' });
    }
  });
}
