#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();

function log(...args) {
  console.log('[GC Archivo Import MySQL]', ...args);
}

function fail(message) {
  console.error('[GC Archivo Import MySQL] ERROR:', message);
  process.exit(1);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110) || 'archivo';
}

function compact(value) {
  const text = String(value ?? '').trim();
  return text || '';
}

function parseBool(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'published', 'publicado'].includes(text);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
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
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1)
    .filter((cells) => cells.some((cell) => String(cell).trim() !== ''))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function findFirst(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && compact(row[key])) return compact(row[key]);
  }
  return '';
}

function detectCategory(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('circuit')) return 'circuitos';
  if (lower.includes('piloto') || lower.includes('driver')) return 'pilotos';
  if (lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('car')) return 'vehiculos';
  if (lower.includes('campeonato') || lower.includes('champ')) return 'campeonatos';
  if (lower.includes('record')) return 'records';
  if (lower.includes('glosario')) return 'glosario';
  return 'general';
}

function singularCategory(category) {
  const map = {
    circuitos: 'circuit',
    pilotos: 'pilot',
    vehiculos: 'vehicle',
    campeonatos: 'championship',
    records: 'record',
    glosario: 'glossary',
  };
  return map[category] || category || 'general';
}

function buildFacts(row) {
  const skip = new Set([
    'id', 'slug', 'title', 'titulo', 'nombre', 'name', 'summary', 'resumen',
    'descripcion_corta', 'body', 'descripcion_larga', 'description',
    'category', 'categoria', 'status', 'estado', 'published', 'publicado',
    'imagen_1_url', 'imagen_1_alt', 'imagen_1_fuente', 'imagen_1_fuente_url', 'imagen_1_autor', 'imagen_1_licencia',
    'imagen_2_url', 'imagen_2_alt', 'imagen_2_fuente', 'imagen_2_fuente_url', 'imagen_2_autor', 'imagen_2_licencia',
    'imagen_3_url', 'imagen_3_alt', 'imagen_3_fuente', 'imagen_3_fuente_url', 'imagen_3_autor', 'imagen_3_licencia',
    'imagen_4_url', 'imagen_4_alt', 'imagen_4_fuente', 'imagen_4_fuente_url', 'imagen_4_autor', 'imagen_4_licencia',
    'imagen_5_url', 'imagen_5_alt', 'imagen_5_fuente', 'imagen_5_fuente_url', 'imagen_5_autor', 'imagen_5_licencia',
  ]);

  const facts = [];
  for (const [key, value] of Object.entries(row)) {
    const text = compact(value);
    if (!text || skip.has(key)) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    facts.push({ label, value: text });
  }
  return facts.slice(0, 24);
}

function buildMedia(row) {
  const media = [];
  for (let i = 1; i <= 5; i += 1) {
    const url = compact(row[`imagen_${i}_url`]);
    if (!url) continue;
    media.push({
      id: crypto.randomUUID(),
      kind: 'image',
      type: 'image',
      url,
      alt: compact(row[`imagen_${i}_alt`]) || compact(row.nombre) || compact(row.titulo) || 'Imagen del Archivo Motorsport',
      source: compact(row[`imagen_${i}_fuente`]),
      sourceUrl: compact(row[`imagen_${i}_fuente_url`]) || url,
      author: compact(row[`imagen_${i}_autor`]),
      license: compact(row[`imagen_${i}_licencia`]),
      isMain: media.length === 0,
      isPrimary: media.length === 0,
      locked: false,
      local: false,
      createdAt: new Date().toISOString(),
      originalUrl: url,
    });
  }
  return media;
}

function normalizeItem(row, fileName, index) {
  const category = compact(row.category || row.categoria) || detectCategory(fileName);
  const title = findFirst(row, ['title', 'titulo', 'nombre', 'name']) || `${singularCategory(category)} ${index + 1}`;
  const slug = slugify(findFirst(row, ['slug']) || title);
  const summary = findFirst(row, ['summary', 'resumen', 'descripcion_corta', 'description']) || '';
  const body = findFirst(row, ['body', 'descripcion_larga', 'descripcion', 'texto']) || summary;
  const media = buildMedia(row);
  const cover = media.find((item) => item.isMain) || null;
  const published = parseBool(process.env.ARCHIVE_IMPORT_PUBLISH || row.published || row.publicado);
  const rowStatus = compact(row.status || row.estado);
  const status = published ? 'published' : (rowStatus === 'published' || rowStatus === 'publicado' ? 'published' : 'draft');

  return {
    id: compact(row.id) || `${slug}-${crypto.randomBytes(4).toString('hex')}`,
    category,
    type: singularCategory(category),
    slug,
    title,
    status,
    summary,
    body,
    facts: buildFacts(row),
    media,
    relatedIds: [],
    relations: [],
    manualRelations: [],
    hiddenRelationIds: [],
    seoTitle: '',
    seoDescription: '',
    coverUrl: cover?.url || '',
    coverAlt: cover?.alt || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    importSource: {
      fileName,
      importedAt: new Date().toISOString(),
      sourceId: compact(row.id),
    },
  };
}

async function importMysql2() {
  const mod = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);
  if (!host || !database || !user) fail('Faltan variables MySQL: MYSQL_HOST, MYSQL_DATABASE o MYSQL_USER.');

  const mysql = await importMysql2();
  return mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
}

async function ensureSchema(connection) {
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

async function existsItem(connection, item) {
  const [rows] = await connection.execute(
    'SELECT id, slug, title FROM gc_archive_items WHERE id = ? OR (category = ? AND slug = ?) LIMIT 1',
    [item.id, item.category, item.slug],
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function insertItem(connection, item) {
  await connection.execute(
    `INSERT INTO gc_archive_items
      (id, category, slug, title, status, item_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.category,
      item.slug,
      item.title,
      item.status,
      JSON.stringify(item),
      item.createdAt.slice(0, 23).replace('T', ' '),
      item.updatedAt.slice(0, 23).replace('T', ' '),
    ],
  );
}

async function main() {
  const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || '').trim().toLowerCase();
  if (driver !== 'mysql' && driver !== 'mariadb') {
    fail(`Este importador es para Hostinger/MySQL. Driver actual: "${driver || 'vacío'}"`);
  }

  const importDir = process.env.ARCHIVE_IMPORT_DIR?.trim()
    ? path.resolve(process.env.ARCHIVE_IMPORT_DIR.trim())
    : path.join(rootDir, 'data', 'archive-import');

  const dryRun = parseBool(process.env.ARCHIVE_IMPORT_DRY_RUN);
  const force = parseBool(process.env.ARCHIVE_IMPORT_FORCE);

  if (!fs.existsSync(importDir)) fail(`No existe ARCHIVE_IMPORT_DIR: ${importDir}`);

  const files = fs.readdirSync(importDir).filter((file) => file.toLowerCase().endsWith('.csv')).sort();
  if (!files.length) fail(`No hay CSV en ${importDir}`);

  log(`Directorio: ${importDir}`);
  log(`CSV: ${files.length}`);
  log(`Publicar directo: ${parseBool(process.env.ARCHIVE_IMPORT_PUBLISH) ? 'sí' : 'no, borrador'}`);
  log(`Dry run: ${dryRun ? 'sí' : 'no'}`);
  log(`Force overwrite: ${force ? 'sí' : 'no'}`);

  const connection = await getConnection();
  try {
    await ensureSchema(connection);
    let readRows = 0;
    let created = 0;
    let skipped = 0;
    let updated = 0;
    const skippedItems = [];

    for (const fileName of files) {
      const filePath = path.join(importDir, fileName);
      const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
      log(`${fileName}: ${rows.length} filas`);

      for (let i = 0; i < rows.length; i += 1) {
        readRows += 1;
        const item = normalizeItem(rows[i], fileName, i);
        const existing = await existsItem(connection, item);

        if (existing && !force) {
          skipped += 1;
          skippedItems.push({ fileName, title: item.title, slug: item.slug, reason: 'already-exists' });
          continue;
        }

        if (dryRun) {
          created += existing ? 0 : 1;
          updated += existing ? 1 : 0;
          continue;
        }

        if (existing && force) {
          await connection.execute(
            `UPDATE gc_archive_items
             SET category = ?, slug = ?, title = ?, status = ?, item_json = ?, updated_at = ?
             WHERE id = ?`,
            [item.category, item.slug, item.title, item.status, JSON.stringify(item), item.updatedAt.slice(0, 23).replace('T', ' '), existing.id],
          );
          updated += 1;
        } else {
          await insertItem(connection, item);
          created += 1;
        }
      }
    }

    const report = { ok: true, generatedAt: new Date().toISOString(), importDir, files, readRows, created, updated, skipped, dryRun, force, publish: parseBool(process.env.ARCHIVE_IMPORT_PUBLISH), skippedItems };
    const reportPath = path.join(importDir, `archivo-mysql-import-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    log(`Filas leídas: ${readRows}`);
    log(`Creadas: ${created}`);
    log(`Actualizadas: ${updated}`);
    log(`Omitidas: ${skipped}`);
    log(`Report: ${reportPath}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
