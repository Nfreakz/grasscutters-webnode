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
  return mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
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

function compact(value: unknown) {
  return String(value ?? '').trim();
}

function first(row: any, keys: string[]) {
  for (const key of keys) {
    const direct = compact(row[key]);
    if (direct) return direct;
    const lowerKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (lowerKey) {
      const value = compact(row[lowerKey]);
      if (value) return value;
    }
  }
  return '';
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

function normalizeFacts(row: any) {
  const skipBase = new Set([
    'id','slug','title','titulo','nombre','name','summary','resumen','descripcion_corta','body','descripcion','descripcion_larga','texto',
    'category','categoria','type','tipo','status','estado','published','publicado',
    'url','image','imagen','foto','photo','svg','svg_url','image_url','imagen_url','foto_url','photo_url','mapa_url','track_map_url','layout_svg','circuito_svg',
    'alt','image_alt','imagen_alt','fuente','source','source_url','fuente_url','autor','author','licencia','license','copyright','attribution'
  ]);

  const facts: any[] = [];
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = String(rawKey || '').trim();
    const lower = key.toLowerCase();
    const value = compact(rawValue);
    if (!value) continue;
    if (skipBase.has(lower)) continue;
    if (/^imagen_\d+_/.test(lower)) continue;
    if (/^image_\d+_/.test(lower)) continue;
    if (/^media_\d+_/.test(lower)) continue;

    facts.push({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value
    });
  }

  return facts.slice(0, 32);
}

function mediaFromGenericColumns(row: any, title: string) {
  const url = first(row, [
    'imagen_url', 'image_url', 'foto_url', 'photo_url',
    'svg_url', 'svg', 'mapa_url', 'track_map_url', 'layout_svg', 'circuito_svg',
    'image', 'imagen', 'foto', 'photo'
  ]);

  if (!url) return null;

  return {
    id: crypto.randomUUID(),
    kind: 'image',
    type: 'image',
    url,
    alt: first(row, ['imagen_alt', 'image_alt', 'alt']) || title,
    source: first(row, ['imagen_fuente', 'image_source', 'fuente', 'source']),
    sourceUrl: first(row, ['imagen_fuente_url', 'image_source_url', 'fuente_url', 'source_url']) || url,
    author: first(row, ['imagen_autor', 'image_author', 'autor', 'author']),
    license: first(row, ['imagen_licencia', 'image_license', 'licencia', 'license', 'copyright']),
    attribution: first(row, ['attribution', 'credito', 'creditos', 'créditos']),
    isMain: true,
    isPrimary: true,
    local: false,
    locked: false,
    createdAt: nowIso(),
    originalUrl: url,
  };
}

function buildMedia(row: any, title: string) {
  const media: any[] = [];
  const generic = mediaFromGenericColumns(row, title);
  if (generic) media.push(generic);

  for (let i = 1; i <= 8; i += 1) {
    const url = first(row, [
      `imagen_${i}_url`, `image_${i}_url`, `media_${i}_url`,
      `imagen_${i}`, `image_${i}`, `media_${i}`,
      `svg_${i}_url`, `svg_${i}`
    ]);
    if (!url) continue;
    if (media.some((item) => item.url === url)) continue;

    media.push({
      id: crypto.randomUUID(),
      kind: 'image',
      type: 'image',
      url,
      alt: first(row, [`imagen_${i}_alt`, `image_${i}_alt`, `media_${i}_alt`]) || title,
      source: first(row, [`imagen_${i}_fuente`, `image_${i}_source`, `media_${i}_source`, `imagen_${i}_source`]),
      sourceUrl: first(row, [`imagen_${i}_fuente_url`, `image_${i}_source_url`, `media_${i}_source_url`]) || url,
      author: first(row, [`imagen_${i}_autor`, `image_${i}_author`, `media_${i}_author`]),
      license: first(row, [`imagen_${i}_licencia`, `image_${i}_license`, `media_${i}_license`]),
      isMain: media.length === 0,
      isPrimary: media.length === 0,
      local: false,
      locked: false,
      createdAt: nowIso(),
      originalUrl: url,
    });
  }

  if (media.length) {
    media[0].isMain = true;
    media[0].isPrimary = true;
  }

  return media;
}

function normalizeItem(row: any, fileName: string, index: number, publish: boolean, existing?: ArchiveItem | null) {
  const prev = existing || {};
  const category = normalizeCategory(row.category || row.categoria || row.type || row.tipo || prev.category || detectCategoryFromFile(fileName));
  const title = first(row, ['title', 'titulo', 'nombre', 'name']) || String(prev.title || `${itemType(category)} ${index + 1}`);
  const slug = slugify(first(row, ['slug']) || prev.slug || title);
  const id = compact(row.id) || String(prev.id || `${slug}-${crypto.randomBytes(4).toString('hex')}`);
  const media = buildMedia(row, title);
  const finalMedia = media.length ? media : (Array.isArray(prev.media) ? prev.media : []);
  const main = finalMedia.find((item: any) => item.isMain || item.isPrimary) || finalMedia[0] || null;
  const summary = first(row, ['summary', 'resumen', 'descripcion_corta', 'description']) || String(prev.summary || '');
  const body = first(row, ['body', 'descripcion_larga', 'descripcion', 'texto', 'content']) || String(prev.body || summary || '');

  return {
    ...prev,
    id,
    category,
    type: itemType(category),
    slug,
    title,
    status: publish ? 'published' : 'draft',
    summary,
    body,
    facts: normalizeFacts(row),
    media: finalMedia,
    relatedIds: Array.isArray(prev.relatedIds) ? prev.relatedIds : [],
    relations: Array.isArray(prev.relations) ? prev.relations : [],
    manualRelations: Array.isArray(prev.manualRelations) ? prev.manualRelations : [],
    hiddenRelationIds: Array.isArray(prev.hiddenRelationIds) ? prev.hiddenRelationIds : [],
    seoTitle: String(prev.seoTitle || ''),
    seoDescription: String(prev.seoDescription || ''),
    coverUrl: String(main?.url || prev.coverUrl || ''),
    coverAlt: String(main?.alt || prev.coverAlt || ''),
    createdAt: prev.createdAt || nowIso(),
    updatedAt: nowIso(),
    importSource: {
      ...(prev.importSource || {}),
      fileName,
      importedAt: nowIso(),
      version: 'v8.2.3'
    }
  };
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
    return { row, item };
  } catch {
    return { row, item: null };
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

export function registerMotorsportArchiveImportDeleteFixV823(app: Express) {
  app.post('/api/admin/archive/import-csv-web-v823', async (req: Request, res: Response) => {
    if (!isMysql()) {
      return res.status(501).json({ ok: false, message: 'Este endpoint v8.2.3 está preparado para MySQL/Hostinger.' });
    }

    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const publish = req.body?.publish === true || String(req.body?.publish || '').toLowerCase() === 'true';
    const dryRun = req.body?.dryRun === true || String(req.body?.dryRun || '').toLowerCase() === 'true';
    const force = req.body?.force === true || String(req.body?.force || '').toLowerCase() === 'true';

    if (!files.length) {
      return res.status(400).json({ ok: false, message: 'No se han recibido CSV.', bodyKeys: req.body ? Object.keys(req.body) : [] });
    }

    const connection = await getConnection();
    try {
      await ensureSchema(connection);

      let readRows = 0;
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const details: any[] = [];
      const samples: any[] = [];

      for (const file of files) {
        const fileName = String(file.name || 'archivo.csv');
        const content = String(file.content || '');
        const rows = parseCsv(content);
        details.push({ fileName, rows: rows.length });
        readRows += rows.length;

        for (let i = 0; i < rows.length; i += 1) {
          const preview = normalizeItem(rows[i], fileName, i, publish, null);
          const foundById = await mysqlFind(connection, preview.id);
          const foundBySlug = await mysqlFindByCategorySlug(connection, preview.category, preview.slug);
          const existing = foundById || foundBySlug;
          const existingItem = existing?.item || null;

          if (existing && !force) {
            skipped += 1;
            if (samples.length < 8) {
              samples.push({ title: preview.title, slug: preview.slug, category: preview.category, status: preview.status, media: preview.media?.length || 0, action: 'skipped-existing' });
            }
            continue;
          }

          const item = normalizeItem(rows[i], fileName, i, publish, existingItem);
          item.status = publish ? 'published' : 'draft';

          if (samples.length < 8) {
            samples.push({ title: item.title, slug: item.slug, category: item.category, status: item.status, media: item.media?.length || 0, coverUrl: item.coverUrl || '', action: existing ? 'update' : 'create' });
          }

          if (!dryRun) await mysqlUpsert(connection, item, existing?.row?.id);

          if (existing) updated += 1;
          else created += 1;
        }
      }

      return res.json({
        ok: true,
        storage: 'mysql',
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
      return res.status(500).json({ ok: false, message: error?.message || 'Error importando CSV v8.2.3.' });
    } finally {
      await connection.end();
    }
  });

  app.delete('/api/admin/archive/mysql-hard-delete-v823/:id', async (req: Request, res: Response) => {
    if (!isMysql()) {
      return res.status(501).json({ ok: false, deleted: false, message: 'Este endpoint v8.2.3 está preparado para MySQL/Hostinger.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, deleted: false, message: 'Falta id o slug.' });

    const connection = await getConnection();
    try {
      await ensureSchema(connection);

      const found = await mysqlFind(connection, id);
      if (!found?.row) {
        return res.status(404).json({ ok: false, deleted: false, message: 'Ficha no encontrada.', id });
      }

      const [result]: any = await connection.execute('DELETE FROM gc_archive_items WHERE id = ?', [found.row.id]);

      return res.json({
        ok: true,
        deleted: Number(result?.affectedRows || 0) > 0,
        id,
        deletedId: found.row.id,
        title: found.row.title,
        affectedRows: Number(result?.affectedRows || 0),
        storage: 'mysql',
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, deleted: false, message: error?.message || 'Error borrando ficha MySQL.' });
    } finally {
      await connection.end();
    }
  });
}
