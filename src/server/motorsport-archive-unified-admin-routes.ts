import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';

type ArchiveItem = Record<string, any>;

const VALID_ARCHIVE_CATEGORIES = new Set(['circuitos', 'pilotos', 'vehiculos', 'glosario', 'general']);

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

function mysqlDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 23).replace('T', ' ')
    : date.toISOString().slice(0, 23).replace('T', ' ');
}

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function normalizeCategory(value: unknown) {
  const raw = normalizeText(value);

  if (['circuit', 'track', 'circuito', 'circuitos'].includes(raw)) return 'circuitos';
  if (['pilot', 'driver', 'piloto', 'pilotos'].includes(raw)) return 'pilotos';
  if (['vehicle', 'vehicles', 'car', 'cars', 'coche', 'coches', 'vehiculo', 'vehículo', 'vehiculos', 'vehículos'].includes(raw)) return 'vehiculos';
  if (['glossary', 'glosario', 'concepto', 'conceptos'].includes(raw)) return 'glosario';

  /*
    v15.10.3:
    "records" y "campeonatos" ya no son categorías del Archivo.
    Deben guardarse como información interna dentro de circuitos, coches o pilotos.
    Si llegan desde CSV, formulario antiguo o API manual, no se crean como categoría nueva.
  */
  if (['championship', 'championships', 'campeonato', 'campeonatos', 'record', 'records', 'récord', 'récords'].includes(raw)) {
    return 'general';
  }

  return raw || 'general';
}

function itemType(category: string) {
  return ({
    circuitos: 'circuit',
    pilotos: 'pilot',
    vehiculos: 'vehicle',
    glosario: 'glossary',
    general: 'general',
  } as Record<string, string>)[category] || category || 'general';
}

function publicCategory(category: string) {
  return ({
    circuitos: 'circuitos',
    pilotos: 'pilotos',
    vehiculos: 'vehiculos',
    glosario: 'glosario',
    general: 'general',
    circuit: 'circuitos',
    track: 'circuitos',
    pilot: 'pilotos',
    driver: 'pilotos',
    vehicle: 'vehiculos',
    car: 'vehiculos',
    glossary: 'glosario',
    championship: 'general',
    championships: 'general',
    record: 'general',
    records: 'general',
  } as Record<string, string>)[normalizeText(category)] || normalizeCategory(category) || 'general';
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
    localUrl: String(media.localUrl || media.url || ''),
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
  })).filter((media: any) => media.url || media.localUrl);
}

function normalizeRelations(value: any) {
  if (!value || typeof value !== 'object') return { auto: [], manual: [], hidden: [], pinned: [] };
  return {
    auto: Array.isArray(value.auto) ? value.auto : [],
    manual: Array.isArray(value.manual) ? value.manual : [],
    hidden: Array.isArray(value.hidden) ? value.hidden : [],
    pinned: Array.isArray(value.pinned) ? value.pinned : [],
  };
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
    relations: normalizeRelations(input.relations ?? prev.relations),
    manualRelations: Array.isArray(input.manualRelations ?? prev.manualRelations) ? (input.manualRelations ?? prev.manualRelations) : [],
    hiddenRelationIds: Array.isArray(input.hiddenRelationIds ?? prev.hiddenRelationIds) ? (input.hiddenRelationIds ?? prev.hiddenRelationIds) : [],
    seoTitle: String(input.seoTitle || prev.seoTitle || '').trim(),
    seoDescription: String(input.seoDescription || prev.seoDescription || '').trim(),
    coverUrl: String(input.coverUrl || main?.url || main?.localUrl || prev.coverUrl || '').trim(),
    coverAlt: String(input.coverAlt || main?.alt || prev.coverAlt || '').trim(),
    createdAt: prev.createdAt || input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
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

function writeJsonStore(rootDir: string, store: any) {
  const filePath = getJsonPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = nowIso();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function mysqlList(connection: any) {
  await ensureSchema(connection);
  const [rows] = await connection.execute('SELECT id, category, slug, title, status, item_json, updated_at FROM gc_archive_items ORDER BY updated_at DESC');
  return (Array.isArray(rows) ? rows : []).map((row: any) => {
    try {
      const item = JSON.parse(row.item_json);
      return normalizeItem({ ...item, id: item.id || row.id, category: item.category || row.category, slug: item.slug || row.slug, status: item.status || row.status }, item);
    } catch {
      return normalizeItem({ id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status, updatedAt: row.updated_at });
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
    return { row, item: normalizeItem({ ...item, id: item.id || row.id, category: item.category || row.category, slug: item.slug || row.slug, status: item.status || row.status }, item) };
  } catch {
    return { row, item: normalizeItem({ id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status }) };
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
    return { row, item: normalizeItem(item, item) };
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
    [item.id, item.category, item.slug, item.title, item.status, JSON.stringify(item), mysqlDate(item.createdAt), mysqlDate(item.updatedAt)],
  );
}

async function storageList(rootDir: string) {
  if (isMysql()) {
    const connection = await getConnection();
    try { return { items: await mysqlList(connection), storage: 'mysql' }; }
    finally { await connection.end(); }
  }

  const { store } = readJsonStore(rootDir);
  return { items: store.items.map((item: any) => normalizeItem(item)), storage: 'json' };
}

async function storageFind(rootDir: string, id: string) {
  if (isMysql()) {
    const connection = await getConnection();
    try {
      const found = await mysqlFind(connection, id);
      return { item: found?.item || null, storage: 'mysql' };
    } finally { await connection.end(); }
  }

  const { store } = readJsonStore(rootDir);
  const item = store.items.find((entry: any) => String(entry.id) === id || String(entry.slug) === id);
  return { item: item ? normalizeItem(item) : null, storage: 'json' };
}

async function storageSave(rootDir: string, raw: any, id?: string) {
  if (isMysql()) {
    const connection = await getConnection();
    try {
      const existing = id ? await mysqlFind(connection, id) : null;
      const item = normalizeItem({ ...(existing?.item || {}), ...(raw || {}), id: existing?.row?.id || raw?.id || id || undefined }, existing?.item || null);
      const duplicate = await mysqlFindByCategorySlug(connection, item.category, item.slug);
      if (duplicate?.row?.id && duplicate.row.id !== (existing?.row?.id || item.id)) {
        const error: any = new Error('Ya existe una ficha con esa categoría y slug.');
        error.statusCode = 409;
        throw error;
      }
      await mysqlUpsert(connection, item, existing?.row?.id);
      return { item, storage: 'mysql', created: !existing, updated: Boolean(existing) };
    } finally { await connection.end(); }
  }

  const { store } = readJsonStore(rootDir);
  const index = id ? store.items.findIndex((entry: any) => String(entry.id) === id || String(entry.slug) === id) : -1;
  const existing = index >= 0 ? store.items[index] : null;
  const item = normalizeItem({ ...(existing || {}), ...(raw || {}), id: existing?.id || raw?.id || id || undefined }, existing);
  if (index >= 0) store.items[index] = item;
  else store.items.unshift(item);
  writeJsonStore(rootDir, store);
  return { item, storage: 'json', created: index < 0, updated: index >= 0 };
}

async function storageDelete(rootDir: string, id: string) {
  if (isMysql()) {
    const connection = await getConnection();
    try {
      const found = await mysqlFind(connection, id);
      if (!found?.row) return { deleted: false, storage: 'mysql' };
      const [result]: any = await connection.execute('DELETE FROM gc_archive_items WHERE id = ?', [found.row.id]);
      return { deleted: Number(result?.affectedRows || 0) > 0, storage: 'mysql', item: found.item };
    } finally { await connection.end(); }
  }

  const { store } = readJsonStore(rootDir);
  const before = store.items.length;
  const removed = store.items.find((entry: any) => String(entry.id) === id || String(entry.slug) === id);
  store.items = store.items.filter((entry: any) => String(entry.id) !== id && String(entry.slug) !== id);
  writeJsonStore(rootDir, store);
  return { deleted: store.items.length < before, storage: 'json', item: removed || null };
}

function demoItems() {
  return [
    normalizeItem({ id: 'demo-circuito-monza', category: 'circuitos', title: 'Autodromo Nazionale Monza', slug: 'autodromo-nazionale-monza', status: 'draft', summary: 'Ficha de demostración.', body: 'Contenido de demostración para validar el Archivo.', facts: [{ label: 'País', value: 'Italia' }] }),
    normalizeItem({ id: 'demo-piloto-alonso', category: 'pilotos', title: 'Fernando Alonso', slug: 'fernando-alonso', status: 'draft', summary: 'Piloto de demostración.', body: 'Ficha de prueba para validar relaciones y vista pública.', facts: [{ label: 'País', value: 'España' }] }),
  ];
}

function detectCsvDelimiter(content: string) {
  const firstLine = String(content || '').split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [';', ',', '\\t'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const delimiter = candidate === '\\t' ? '\t' : candidate;
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function parseCsv(content: string) {
  const delimiter = detectCsvDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }

    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (char === '\r') continue;
    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => String(header || '').trim().replace(/^\uFEFF/, ''));
  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => String(cell).trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function first(row: any, keys: string[]) {
  for (const key of keys) {
    const direct = String(row[key] ?? '').trim();
    if (direct) return direct;

    const found = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (found) {
      const value = String(row[found] ?? '').trim();
      if (value) return value;
    }
  }
  return '';
}

function mediaFromRow(row: any, title: string) {
  const media: any[] = [];
  const genericKeys = ['imagen_url','image_url','foto_url','photo_url','svg_url','svg','mapa_url','track_map_url','layout_svg','circuito_svg','image','imagen','foto','photo'];
  const genericUrl = first(row, genericKeys);

  if (genericUrl) {
    media.push({
      id: crypto.randomUUID(),
      type: 'image',
      kind: 'image',
      url: genericUrl,
      alt: first(row, ['alt','imagen_alt','image_alt']) || title,
      source: first(row, ['source','fuente']),
      sourceUrl: first(row, ['source_url','fuente_url']) || genericUrl,
      author: first(row, ['author','autor']),
      license: first(row, ['license','licencia']),
      isMain: true,
      isPrimary: true,
      local: false,
      locked: false,
      createdAt: nowIso(),
      originalUrl: genericUrl,
    });
  }

  for (let i = 1; i <= 8; i += 1) {
    const url = first(row, [`imagen_${i}_url`,`image_${i}_url`,`media_${i}_url`,`svg_${i}_url`,`imagen_${i}`,`image_${i}`,`media_${i}`,`svg_${i}`]);
    if (!url || media.some((m) => m.url === url)) continue;

    media.push({
      id: crypto.randomUUID(),
      type: 'image',
      kind: 'image',
      url,
      alt: first(row, [`imagen_${i}_alt`,`image_${i}_alt`,`media_${i}_alt`]) || title,
      source: first(row, [`imagen_${i}_fuente`,`image_${i}_source`,`media_${i}_source`]),
      sourceUrl: first(row, [`imagen_${i}_fuente_url`,`image_${i}_source_url`,`media_${i}_source_url`]) || url,
      author: first(row, [`imagen_${i}_autor`,`image_${i}_author`]),
      license: first(row, [`imagen_${i}_licencia`,`image_${i}_license`]),
      isMain: media.length === 0,
      isPrimary: media.length === 0,
      local: false,
      locked: false,
      createdAt: nowIso(),
      originalUrl: url,
    });
  }

  if (media[0]) { media[0].isMain = true; media[0].isPrimary = true; }
  return media;
}

function detectCategoryFromFile(fileName: string) {
  const lower = normalizeText(fileName);
  if (lower.includes('circuit')) return 'circuitos';
  if (lower.includes('piloto') || lower.includes('driver')) return 'pilotos';
  if (lower.includes('vehiculo') || lower.includes('vehicle') || lower.includes('car') || lower.includes('coche')) return 'vehiculos';
  if (lower.includes('glosario') || lower.includes('glossary') || lower.includes('concept')) return 'glosario';

  /*
    Si el CSV se llama records/campeonatos, no se crea una categoría nueva.
    Queda como general para obligar a recolocarlo manualmente dentro de circuito/coche/piloto.
  */
  if (lower.includes('campeonato') || lower.includes('champ') || lower.includes('record')) return 'general';

  return 'general';
}

function isKnownArchiveCategory(value: string) {
  return VALID_ARCHIVE_CATEGORIES.has(normalizeCategory(value));
}

function resolveCsvArchiveCategory(row: any, fileName: string) {
  const raw = first(row, ['archive_category', 'archiveCategory', 'tipo_ficha', 'tipo_archivo', 'category', 'categoria', 'type', 'tipo']);
  const normalized = normalizeCategory(raw);
  if (raw && isKnownArchiveCategory(normalized)) return normalized;
  return detectCategoryFromFile(fileName);
}

function csvSafeId(row: any, category: string, slug: string) {
  const rawId = first(row, ['id', 'ID']);
  if (!rawId) return undefined;
  const clean = slugify(rawId);
  if (!clean) return undefined;
  if (/^\d+$/.test(clean)) return `${publicCategory(category)}-${clean}`;
  return clean;
}

function csvItem(row: any, fileName: string, index: number, publish: boolean, existing?: any) {
  const category = resolveCsvArchiveCategory(row, fileName);
  const title = first(row, ['title','titulo','nombre','name']) || `${itemType(category)} ${index + 1}`;
  const rawDetailCategory = first(row, ['categoria', 'category']);
  const normalizedDetailCategory = normalizeCategory(rawDetailCategory);
  const detailCategoryIsArchiveCategory = rawDetailCategory && isKnownArchiveCategory(normalizedDetailCategory);

  const skip = new Set([
    'id','slug','title','titulo','nombre','name',
    'summary','resumen','descripcion_corta','description',
    'body','descripcion','descripcion_larga','texto','content',
    'archive_category','archivecategory','tipo_ficha','tipo_archivo',
    'type','tipo','status','estado','published','publicado'
  ]);

  if (detailCategoryIsArchiveCategory) {
    skip.add('categoria');
    skip.add('category');
  }

  const facts = Object.entries(row)
    .filter(([k, v]) => {
      const key = String(k || '').toLowerCase();
      if (skip.has(key)) return false;
      if (key.startsWith('imagen_') || key.startsWith('image_') || key.startsWith('media_') || key.startsWith('svg_')) return false;
      return String(v ?? '').trim();
    })
    .map(([label, value]) => ({ label: label.replace(/_/g, ' '), value: String(value ?? '').trim() }));

  if (rawDetailCategory && !detailCategoryIsArchiveCategory && !facts.some((fact) => String(fact.label).toLowerCase() === 'categoria')) {
    facts.unshift({ label: 'Categoría', value: rawDetailCategory });
  }

  const slug = first(row, ['slug']) || slugify(title);
  const safeId = csvSafeId(row, category, slug);
  const media = mediaFromRow(row, title);

  return normalizeItem({
    ...(existing || {}),
    id: safeId || existing?.id,
    category,
    title,
    slug,
    status: publish ? 'published' : 'draft',
    summary: first(row, ['summary','resumen','descripcion_corta','description']) || existing?.summary,
    body: first(row, ['body','descripcion_larga','descripcion','texto','content']) || existing?.body,
    facts,
    media: media.length ? media : existing?.media,
  }, existing || null);
}

export function registerMotorsportArchiveUnifiedAdminRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.get('/api/admin/archive/unified/items', async (_req: Request, res: Response) => {
    try {
      const result = await storageList(rootDir);
      return res.json({ ok: true, ...result, count: result.items.length, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error listando Archivo.' });
    }
  });

  app.get('/api/admin/archive/unified/items/:id', async (req: Request, res: Response) => {
    try {
      const result = await storageFind(rootDir, String(req.params.id || ''));
      if (!result.item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
      return res.json({ ok: true, ...result, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error cargando ficha.' });
    }
  });

  async function save(req: Request, res: Response) {
    try {
      const result = await storageSave(rootDir, req.body || {}, req.params.id ? String(req.params.id) : undefined);
      return res.json({ ok: true, ...result, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(error?.statusCode || 500).json({ ok: false, message: error?.message || 'Error guardando ficha.' });
    }
  }

  app.post('/api/admin/archive/unified/items', save);
  app.patch('/api/admin/archive/unified/items/:id', save);
  app.put('/api/admin/archive/unified/items/:id', save);

  app.delete('/api/admin/archive/unified/items/:id', async (req: Request, res: Response) => {
    try {
      const result = await storageDelete(rootDir, String(req.params.id || ''));
      if (!result.deleted) return res.status(404).json({ ok: false, deleted: false, message: 'Ficha no encontrada.' });
      return res.json({ ok: true, ...result, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, deleted: false, message: error?.message || 'Error borrando ficha.' });
    }
  });

  app.post('/api/admin/archive/unified/demo', async (_req: Request, res: Response) => {
    try {
      let created = 0, skipped = 0;
      for (const item of demoItems()) {
        const existing = await storageFind(rootDir, item.id);
        if (existing.item) { skipped += 1; continue; }
        await storageSave(rootDir, item);
        created += 1;
      }
      return res.json({ ok: true, created, skipped, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error creando demo.' });
    }
  });

  app.post('/api/admin/archive/unified/import-csv', async (req: Request, res: Response) => {
    try {
      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      const publish = req.body?.publish === true || String(req.body?.publish || '').toLowerCase() === 'true';
      const dryRun = req.body?.dryRun === true || String(req.body?.dryRun || '').toLowerCase() === 'true';
      const force = req.body?.force === true || String(req.body?.force || '').toLowerCase() === 'true';
      if (!files.length) return res.status(400).json({ ok: false, message: 'No se han recibido CSV.' });

      let readRows = 0, created = 0, updated = 0, skipped = 0;
      const details: any[] = [], samples: any[] = [];

      for (const file of files) {
        const fileName = String(file.name || 'archivo.csv');
        const rows = parseCsv(String(file.content || ''));
        details.push({ fileName, rows: rows.length });
        readRows += rows.length;

        for (let i = 0; i < rows.length; i += 1) {
          const preview = csvItem(rows[i], fileName, i, publish);
          const existing = await storageFind(rootDir, preview.id);
          const bySlug = existing.item ? existing : await storageFind(rootDir, preview.slug);
          const found = existing.item ? existing : bySlug;

          if (found.item && !force) { skipped += 1; continue; }

          const item = csvItem(rows[i], fileName, i, publish, found.item || null);
          item.status = publish ? 'published' : 'draft';

          if (samples.length < 8) {
            samples.push({
              title: item.title,
              category: item.category,
              slug: item.slug,
              status: item.status,
              media: item.media?.length || 0,
              action: found.item ? 'update' : 'create',
            });
          }

          if (!dryRun) await storageSave(rootDir, item, found.item?.id);
          if (found.item) updated += 1; else created += 1;
        }
      }

      return res.json({
        ok: true,
        dryRun,
        publish,
        forcedStatus: publish ? 'published' : 'draft',
        force,
        readRows,
        created,
        updated,
        skipped,
        details,
        samples,
        api: 'unified-v15.10.3',
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error importando CSV.' });
    }
  });

  app.post('/api/admin/archive/unified/items/:id/media/from-url', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '');
      const found = await storageFind(rootDir, id);
      if (!found.item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });

      const url = String(req.body?.imageUrl || req.body?.url || '').trim();
      if (!url) return res.status(400).json({ ok: false, message: 'Falta URL de imagen.' });

      const media = normalizeMedia(found.item.media);
      if (req.body?.makePrimary !== false) media.forEach((m: any) => { m.isMain = false; m.isPrimary = false; });

      const itemMedia = {
        id: crypto.randomUUID(),
        type: 'image',
        kind: 'image',
        url,
        localUrl: url,
        alt: String(req.body?.alt || found.item.title || ''),
        source: String(req.body?.source || 'URL externa'),
        sourceUrl: String(req.body?.sourceUrl || url),
        author: String(req.body?.author || ''),
        license: String(req.body?.license || ''),
        isMain: req.body?.makePrimary !== false,
        isPrimary: req.body?.makePrimary !== false,
        locked: Boolean(req.body?.locked),
        local: false,
        createdAt: nowIso(),
        originalUrl: url,
      };

      media.unshift(itemMedia);
      const item = normalizeItem({ ...found.item, media }, found.item);
      await storageSave(rootDir, item, item.id);
      return res.json({ ok: true, item, media: itemMedia, itemTitle: item.title, api: 'unified-v15.10.3' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error añadiendo imagen.' });
    }
  });

  app.post('/api/admin/archive/unified/media/inspect-url', async (req: Request, res: Response) => {
    const imageUrl = String(req.body?.imageUrl || req.body?.url || '').trim();
    if (!imageUrl) return res.status(400).json({ ok: false, message: 'Falta URL.' });
    return res.json({
      ok: true,
      metadata: {
        imageUrl,
        source: imageUrl.includes('wikimedia') ? 'Wikimedia Commons' : 'URL externa',
        sourceUrl: imageUrl,
        alt: '',
        author: '',
        license: '',
        provider: imageUrl.includes('wikimedia') ? 'wikimedia' : 'generic',
      },
    });
  });
}
