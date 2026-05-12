import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type ArchiveItem = Record<string, any>;

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
    .slice(0, 110) || 'archivo';
}

function nowIso() {
  return new Date().toISOString();
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

  if (!host || !database || !user) {
    throw new Error('Faltan variables MySQL: MYSQL_HOST, MYSQL_DATABASE o MYSQL_USER.');
  }

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

function normalizeCategory(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (['circuit', 'track', 'circuito', 'circuitos'].includes(raw)) return 'circuitos';
  if (['pilot', 'driver', 'piloto', 'pilotos'].includes(raw)) return 'pilotos';
  if (['vehicle', 'car', 'coche', 'vehiculo', 'vehículo', 'vehiculos', 'vehículos'].includes(raw)) return 'vehiculos';
  if (['championship', 'campeonato', 'campeonatos'].includes(raw)) return 'campeonatos';
  if (['record', 'records'].includes(raw)) return 'records';
  if (['glossary', 'glosario'].includes(raw)) return 'glosario';
  return raw || 'general';
}

function itemType(category: string) {
  const map: Record<string, string> = {
    circuitos: 'circuit',
    pilotos: 'pilot',
    vehiculos: 'vehicle',
    campeonatos: 'championship',
    records: 'record',
    glosario: 'glossary',
  };
  return map[category] || category || 'general';
}

function normalizeFacts(value: any) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([, v]) => String(v ?? '').trim())
    .map(([label, v]) => ({ label, value: String(v ?? '').trim() }));
}

function normalizeMedia(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((media: any) => ({
    id: String(media.id || crypto.randomUUID()),
    kind: media.kind || media.type || 'image',
    type: media.type || media.kind || 'image',
    url: String(media.url || media.localUrl || ''),
    localUrl: media.localUrl || media.url || '',
    alt: String(media.alt || ''),
    source: String(media.source || ''),
    sourceUrl: String(media.sourceUrl || media.originalUrl || media.url || ''),
    author: String(media.author || ''),
    license: String(media.license || ''),
    isMain: Boolean(media.isMain || media.isPrimary),
    isPrimary: Boolean(media.isPrimary || media.isMain),
    locked: Boolean(media.locked),
    local: Boolean(media.local),
    createdAt: media.createdAt || nowIso(),
    originalUrl: media.originalUrl || media.url || '',
  })).filter((media: any) => media.url);
}

function normalizeItem(input: any, existing?: ArchiveItem | null): ArchiveItem {
  const prev = existing || {};
  const category = normalizeCategory(input.category || input.categoria || input.type || prev.category);
  const title = String(input.title || input.titulo || input.name || input.nombre || prev.title || 'Ficha sin título').trim();
  const slug = slugify(input.slug || prev.slug || title);
  const id = String(input.id || prev.id || `${slug}-${crypto.randomBytes(4).toString('hex')}`);
  const media = normalizeMedia(input.media ?? prev.media);
  const main = media.find((m: any) => m.isMain || m.isPrimary) || media[0] || null;

  return {
    ...prev,
    ...input,
    id,
    category,
    type: itemType(category),
    slug,
    title,
    status: String(input.status || input.estado || prev.status || 'draft').trim() || 'draft',
    summary: String(input.summary || input.resumen || prev.summary || '').trim(),
    body: String(input.body || input.descripcion || input.texto || prev.body || '').trim(),
    facts: normalizeFacts(input.facts ?? prev.facts),
    media,
    relatedIds: Array.isArray(input.relatedIds ?? prev.relatedIds) ? (input.relatedIds ?? prev.relatedIds) : [],
    relations: Array.isArray(input.relations ?? prev.relations) ? (input.relations ?? prev.relations) : [],
    manualRelations: Array.isArray(input.manualRelations ?? prev.manualRelations) ? (input.manualRelations ?? prev.manualRelations) : [],
    hiddenRelationIds: Array.isArray(input.hiddenRelationIds ?? prev.hiddenRelationIds) ? (input.hiddenRelationIds ?? prev.hiddenRelationIds) : [],
    seoTitle: String(input.seoTitle || prev.seoTitle || '').trim(),
    seoDescription: String(input.seoDescription || prev.seoDescription || '').trim(),
    coverUrl: String(input.coverUrl || main?.url || prev.coverUrl || '').trim(),
    coverAlt: String(input.coverAlt || main?.alt || prev.coverAlt || '').trim(),
    createdAt: prev.createdAt || input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

async function mysqlList(connection: any) {
  await ensureSchema(connection);
  const [rows] = await connection.execute('SELECT id, category, slug, title, status, item_json, updated_at FROM gc_archive_items ORDER BY updated_at DESC');
  return (Array.isArray(rows) ? rows : []).map((row: any) => {
    try {
      const item = JSON.parse(row.item_json);
      return { ...item, id: item.id || row.id, category: item.category || row.category, slug: item.slug || row.slug, status: item.status || row.status };
    } catch {
      return { id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status, updatedAt: row.updated_at };
    }
  });
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
    const item = JSON.parse(row.item_json);
    return { row, item: { ...item, id: item.id || row.id, category: item.category || row.category, slug: item.slug || row.slug, status: item.status || row.status } };
  } catch {
    return { row, item: { id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status } };
  }
}

async function mysqlFindByCategorySlug(connection: any, category: string, slug: string) {
  await ensureSchema(connection);
  const [rows] = await connection.execute(
    'SELECT id, category, slug, title, status, item_json FROM gc_archive_items WHERE category = ? AND slug = ? LIMIT 1',
    [category, slug],
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  try {
    const item = JSON.parse(row.item_json);
    return { row, item };
  } catch {
    return { row, item: null };
  }
}

async function mysqlUpsert(connection: any, item: ArchiveItem, existingId?: string) {
  await ensureSchema(connection);
  const id = existingId || item.id;
  item.id = id;

  await connection.execute(
    `INSERT INTO gc_archive_items
      (id, category, slug, title, status, item_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      slug = VALUES(slug),
      title = VALUES(title),
      status = VALUES(status),
      item_json = VALUES(item_json),
      updated_at = VALUES(updated_at)`,
    [
      item.id,
      item.category,
      item.slug,
      item.title,
      item.status,
      JSON.stringify(item),
      mysqlDate(item.createdAt),
      mysqlDate(item.updatedAt),
    ],
  );
}

function demoItems() {
  return [
    normalizeItem({
      id: 'demo-circuito-monza',
      category: 'circuitos',
      title: 'Autodromo Nazionale Monza',
      slug: 'autodromo-nazionale-monza',
      status: 'draft',
      summary: 'Ficha de demostración del Archivo Motorsport.',
      body: 'Contenido de demostración para validar creación, edición y publicación en producción.',
      facts: [{ label: 'País', value: 'Italia' }, { label: 'Tipo', value: 'Circuito permanente' }],
    }),
    normalizeItem({
      id: 'demo-piloto-alonso',
      category: 'pilotos',
      title: 'Fernando Alonso',
      slug: 'fernando-alonso',
      status: 'draft',
      summary: 'Piloto de demostración del Archivo Motorsport.',
      body: 'Ficha de prueba para validar relaciones y vista pública.',
      facts: [{ label: 'País', value: 'España' }, { label: 'Disciplina', value: 'Motorsport' }],
    }),
  ];
}

export function registerMotorsportArchiveSafeApiV824(app: Express) {
  app.get('/api/admin/archive/safe-v824/items', async (_req: Request, res: Response) => {
    if (!isMysql()) return res.status(501).json({ ok: false, message: 'safe-v824 está preparado para MySQL/Hostinger.' });
    const connection = await getConnection();
    try {
      const items = await mysqlList(connection);
      return res.json({ ok: true, items, count: items.length, storage: 'mysql', api: 'safe-v824' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error listando Archivo.' });
    } finally {
      await connection.end();
    }
  });

  app.get('/api/admin/archive/safe-v824/items/:id', async (req: Request, res: Response) => {
    if (!isMysql()) return res.status(501).json({ ok: false, message: 'safe-v824 está preparado para MySQL/Hostinger.' });
    const id = String(req.params.id || '').trim();
    const connection = await getConnection();
    try {
      const found = await mysqlFind(connection, id);
      if (!found?.item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.', id });
      return res.json({ ok: true, item: found.item, storage: 'mysql', api: 'safe-v824' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error cargando ficha.' });
    } finally {
      await connection.end();
    }
  });

  async function saveItem(req: Request, res: Response) {
    if (!isMysql()) return res.status(501).json({ ok: false, message: 'safe-v824 está preparado para MySQL/Hostinger.' });
    const routeId = String(req.params.id || '').trim();
    const connection = await getConnection();

    try {
      let existing: any = null;
      if (routeId) existing = await mysqlFind(connection, routeId);
      const base = existing?.item || {};
      const item = normalizeItem({ ...base, ...(req.body || {}), id: existing?.row?.id || req.body?.id || routeId || undefined }, base);
      const duplicate = await mysqlFindByCategorySlug(connection, item.category, item.slug);

      if (duplicate?.row?.id && duplicate.row.id !== (existing?.row?.id || item.id)) {
        return res.status(409).json({ ok: false, message: 'Ya existe una ficha con esa categoría y slug.' });
      }

      await mysqlUpsert(connection, item, existing?.row?.id);
      return res.json({ ok: true, item, storage: 'mysql', api: 'safe-v824', created: !existing, updated: Boolean(existing) });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error guardando ficha.' });
    } finally {
      await connection.end();
    }
  }

  app.post('/api/admin/archive/safe-v824/items', saveItem);
  app.patch('/api/admin/archive/safe-v824/items/:id', saveItem);
  app.put('/api/admin/archive/safe-v824/items/:id', saveItem);

  app.delete('/api/admin/archive/safe-v824/items/:id', async (req: Request, res: Response) => {
    if (!isMysql()) return res.status(501).json({ ok: false, deleted: false, message: 'safe-v824 está preparado para MySQL/Hostinger.' });
    const id = String(req.params.id || '').trim();
    const connection = await getConnection();

    try {
      const found = await mysqlFind(connection, id);
      if (!found?.row) return res.status(404).json({ ok: false, deleted: false, message: 'Ficha no encontrada.', id });

      const [result]: any = await connection.execute('DELETE FROM gc_archive_items WHERE id = ?', [found.row.id]);

      return res.json({
        ok: true,
        deleted: Number(result?.affectedRows || 0) > 0,
        affectedRows: Number(result?.affectedRows || 0),
        id,
        deletedId: found.row.id,
        title: found.row.title,
        storage: 'mysql',
        api: 'safe-v824',
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, deleted: false, message: error?.message || 'Error borrando ficha.' });
    } finally {
      await connection.end();
    }
  });

  app.post('/api/admin/archive/safe-v824/demo', async (_req: Request, res: Response) => {
    if (!isMysql()) return res.status(501).json({ ok: false, message: 'safe-v824 está preparado para MySQL/Hostinger.' });
    const connection = await getConnection();

    try {
      const items = demoItems();
      let created = 0;
      let skipped = 0;

      for (const item of items) {
        const existing = await mysqlFind(connection, item.id) || await mysqlFindByCategorySlug(connection, item.category, item.slug);
        if (existing) {
          skipped += 1;
          continue;
        }
        await mysqlUpsert(connection, item);
        created += 1;
      }

      return res.json({ ok: true, created, skipped, items, storage: 'mysql', api: 'safe-v824' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error creando demo segura.' });
    } finally {
      await connection.end();
    }
  });
}
