import fs from 'node:fs';
import path from 'node:path';
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

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDirForFile(filePath);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function getJsonPath(rootDir: string) {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.MOTORSPORT_ARCHIVE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function readJsonStore(rootDir: string) {
  const filePath = getJsonPath(rootDir);
  const store = readJson<any>(filePath, { version: 1, updatedAt: nowIso(), items: [] });
  if (!Array.isArray(store.items)) store.items = [];
  return { filePath, store };
}

function writeJsonStore(rootDir: string, store: any) {
  const filePath = getJsonPath(rootDir);
  store.version = store.version || 1;
  store.updatedAt = nowIso();
  writeJson(filePath, store);
  return filePath;
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
  const status = String(input.status || input.estado || prev.status || 'draft').trim() || 'draft';

  return {
    ...prev,
    ...input,
    id,
    category,
    type: itemType(category),
    slug,
    title,
    status,
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

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') continue;
    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1)
    .filter((cells) => cells.some((cell) => String(cell).trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function detectCategoryFromFile(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes('circuit')) return 'circuitos';
  if (lower.includes('piloto') || lower.includes('driver')) return 'pilotos';
  if (lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('car')) return 'vehiculos';
  if (lower.includes('campeonato') || lower.includes('champ')) return 'campeonatos';
  if (lower.includes('record')) return 'records';
  if (lower.includes('glosario')) return 'glosario';
  return 'general';
}

function first(row: any, keys: string[]) {
  for (const key of keys) {
    const value = String(row[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function itemFromCsvRow(row: any, fileName: string, index: number, publish: boolean) {
  const category = normalizeCategory(row.category || row.categoria || detectCategoryFromFile(fileName));
  const title = first(row, ['title', 'titulo', 'nombre', 'name']) || `${itemType(category)} ${index + 1}`;
  const media = [];

  for (let i = 1; i <= 5; i += 1) {
    const url = String(row[`imagen_${i}_url`] || '').trim();
    if (!url) continue;
    media.push({
      id: crypto.randomUUID(),
      kind: 'image',
      type: 'image',
      url,
      alt: String(row[`imagen_${i}_alt`] || title).trim(),
      source: String(row[`imagen_${i}_fuente`] || '').trim(),
      sourceUrl: String(row[`imagen_${i}_fuente_url`] || url).trim(),
      author: String(row[`imagen_${i}_autor`] || '').trim(),
      license: String(row[`imagen_${i}_licencia`] || '').trim(),
      isMain: media.length === 0,
      isPrimary: media.length === 0,
      local: false,
      locked: false,
      createdAt: nowIso(),
      originalUrl: url,
    });
  }

  const skip = new Set(['id','slug','title','titulo','nombre','name','summary','resumen','descripcion_corta','body','descripcion','descripcion_larga','texto','category','categoria','status','estado','published','publicado']);
  const facts = Object.entries(row)
    .filter(([key, value]) => !skip.has(key) && !key.startsWith('imagen_') && String(value ?? '').trim())
    .map(([key, value]) => ({ label: key.replace(/_/g, ' '), value: String(value ?? '').trim() }));

  return normalizeItem({
    id: String(row.id || '').trim() || undefined,
    category,
    slug: String(row.slug || '').trim() || undefined,
    title,
    status: publish ? 'published' : 'draft',
    summary: first(row, ['summary', 'resumen', 'descripcion_corta']),
    body: first(row, ['body', 'descripcion_larga', 'descripcion', 'texto']),
    facts,
    media,
  });
}

async function mysqlList(connection: any) {
  await ensureSchema(connection);
  const [rows] = await connection.execute('SELECT item_json FROM gc_archive_items ORDER BY updated_at DESC');
  return (Array.isArray(rows) ? rows : []).map((row: any) => {
    try { return JSON.parse(row.item_json); } catch { return null; }
  }).filter(Boolean);
}

async function mysqlFind(connection: any, id: string) {
  await ensureSchema(connection);
  const [rows] = await connection.execute('SELECT item_json FROM gc_archive_items WHERE id = ? OR slug = ? LIMIT 1', [id, id]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  try { return JSON.parse(row.item_json); } catch { return null; }
}

async function mysqlFindByCategorySlug(connection: any, category: string, slug: string) {
  await ensureSchema(connection);
  const [rows] = await connection.execute('SELECT item_json FROM gc_archive_items WHERE category = ? AND slug = ? LIMIT 1', [category, slug]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  try { return JSON.parse(row.item_json); } catch { return null; }
}

async function mysqlUpsert(connection: any, item: ArchiveItem) {
  await ensureSchema(connection);
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

async function createDemoItems(rootDir: string) {
  const items = demoItems();
  let created = 0;
  let skipped = 0;

  if (isMysql()) {
    const connection = await getConnection();
    try {
      for (const item of items) {
        const existing = await mysqlFind(connection, item.id) || await mysqlFindByCategorySlug(connection, item.category, item.slug);
        if (existing) {
          skipped += 1;
          continue;
        }
        await mysqlUpsert(connection, item);
        created += 1;
      }
      return { ok: true, created, skipped, items, storage: 'mysql' };
    } finally {
      await connection.end();
    }
  }

  const { store } = readJsonStore(rootDir);
  for (const item of items) {
    const existing = store.items.find((entry: any) => entry.id === item.id || (entry.category === item.category && entry.slug === item.slug));
    if (existing) {
      skipped += 1;
      continue;
    }
    store.items.unshift(item);
    created += 1;
  }
  const filePath = writeJsonStore(rootDir, store);
  return { ok: true, created, skipped, items, storage: 'json', filePath };
}

export function registerMotorsportArchiveAdminMysqlRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.get('/api/admin/archive/items', async (_req: Request, res: Response) => {
    try {
      if (isMysql()) {
        const connection = await getConnection();
        try {
          const items = await mysqlList(connection);
          return res.json({ ok: true, items, count: items.length, storage: 'mysql' });
        } finally {
          await connection.end();
        }
      }
      const { store, filePath } = readJsonStore(rootDir);
      return res.json({ ok: true, items: store.items, count: store.items.length, storage: 'json', filePath });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error listando Archivo Motorsport.' });
    }
  });

  app.post('/api/admin/archive/mysql-demo-safe-v822', async (_req: Request, res: Response) => {
    try {
      return res.json(await createDemoItems(rootDir));
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error creando demo segura.' });
    }
  });

  app.post('/api/admin/archive/import-csv-web-v822', async (req: Request, res: Response) => {
    try {
      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      const publish = req.body?.publish === true || String(req.body?.publish || '').toLowerCase() === 'true';
      const dryRun = req.body?.dryRun === true || String(req.body?.dryRun || '').toLowerCase() === 'true';
      const force = req.body?.force === true || String(req.body?.force || '').toLowerCase() === 'true';

      if (!files.length) {
        return res.status(400).json({ ok: false, message: 'No se han recibido CSV.', bodyKeys: req.body ? Object.keys(req.body) : [] });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let readRows = 0;
      const details: any[] = [];
      const samples: any[] = [];
      const connection = isMysql() ? await getConnection() : null;

      try {
        if (connection) await ensureSchema(connection);

        for (const file of files) {
          const fileName = String(file.name || 'archivo.csv');
          const content = String(file.content || '');
          const rows = parseCsv(content);
          details.push({ fileName, rows: rows.length });
          readRows += rows.length;

          for (let i = 0; i < rows.length; i += 1) {
            const item = itemFromCsvRow(rows[i], fileName, i, publish);
            item.status = publish ? 'published' : 'draft';

            if (samples.length < 5) samples.push({ title: item.title, slug: item.slug, category: item.category, status: item.status });

            if (connection) {
              const existing = await mysqlFind(connection, item.id) || await mysqlFindByCategorySlug(connection, item.category, item.slug);
              if (existing && !force) {
                skipped += 1;
                continue;
              }
              const finalItem = normalizeItem({ ...item, status: publish ? 'published' : 'draft' }, existing || null);
              finalItem.status = publish ? 'published' : 'draft';
              if (!dryRun) await mysqlUpsert(connection, finalItem);
              if (existing) updated += 1;
              else created += 1;
            } else {
              const { store } = readJsonStore(rootDir);
              const index = store.items.findIndex((entry: any) => String(entry.id) === item.id || (entry.category === item.category && entry.slug === item.slug));
              if (index !== -1 && !force) {
                skipped += 1;
                continue;
              }
              const finalItem = normalizeItem({ ...item, status: publish ? 'published' : 'draft' }, index !== -1 ? store.items[index] : null);
              finalItem.status = publish ? 'published' : 'draft';
              if (!dryRun) {
                if (index !== -1) store.items[index] = finalItem;
                else store.items.unshift(finalItem);
                writeJsonStore(rootDir, store);
              }
              if (index !== -1) updated += 1;
              else created += 1;
            }
          }
        }
      } finally {
        if (connection) await connection.end();
      }

      return res.json({
        ok: true,
        storage: isMysql() ? 'mysql' : 'json',
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
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error importando CSV.' });
    }
  });
}
