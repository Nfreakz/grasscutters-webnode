#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'server', 'motorsport-archive-unified-admin-routes.ts');

if (!fs.existsSync(file)) {
  console.error('[Archivo v8.3.1] No existe src/server/motorsport-archive-unified-admin-routes.ts');
  process.exit(1);
}

const backup = `${file}.backup-csv-semicolon-v831-${new Date().toISOString().replace(/[:.]/g, '-')}`;
let code = fs.readFileSync(file, 'utf8');
fs.writeFileSync(backup, code, 'utf8');

const newParseCsv = `function detectCsvDelimiter(content: string) {
  const firstLine = String(content || '').split(/\\r?\\n/).find((line) => line.trim()) || '';
  const candidates = [';', ',', '\\\\t'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const delimiter = candidate === '\\\\t' ? '\\t' : candidate;
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
    if (char === '\\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (char === '\\r') continue;
    field += char;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || '').trim().replace(/^\\uFEFF/, ''));
  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => String(cell).trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}`;

code = code.replace(/function parseCsv\(content: string\) \{[\s\S]*?\n\}/, newParseCsv);

const helper = `
function detectCategoryFromFile(fileName: string) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.includes('circuit')) return 'circuitos';
  if (lower.includes('piloto') || lower.includes('driver')) return 'pilotos';
  if (lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('car')) return 'vehiculos';
  if (lower.includes('campeonato') || lower.includes('champ')) return 'campeonatos';
  if (lower.includes('record')) return 'records';
  if (lower.includes('glosario') || lower.includes('glossary')) return 'glosario';
  return 'general';
}

function isKnownArchiveCategory(value: string) {
  return new Set(['circuitos', 'pilotos', 'vehiculos', 'campeonatos', 'records', 'glosario', 'general']).has(value);
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
  if (/^\\d+$/.test(clean)) return \`\${publicCategory(category)}-\${clean}\`;
  return clean;
}
`;

if (!code.includes('function detectCategoryFromFile(fileName: string)')) {
  const marker = 'function csvItem(row: any, fileName: string, index: number, publish: boolean, existing?: any) {';
  code = code.replace(marker, helper + '\n' + marker);
}

const oldCsvItemStart = /function csvItem\(row: any, fileName: string, index: number, publish: boolean, existing\?: any\) \{[\s\S]*?\n\}/;
const newCsvItem = `function csvItem(row: any, fileName: string, index: number, publish: boolean, existing?: any) {
  const category = resolveCsvArchiveCategory(row, fileName);
  const title = first(row, ['title','titulo','nombre','name']) || \`\${itemType(category)} \${index + 1}\`;
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
    media: mediaFromRow(row, title).length ? mediaFromRow(row, title) : existing?.media,
  }, existing || null);
}`;

code = code.replace(oldCsvItemStart, newCsvItem);

fs.writeFileSync(file, code, 'utf8');

console.log('[Archivo v8.3.1] CSV import corregido: delimitador automático ; , tab.');
console.log('[Archivo v8.3.1] categoria de glosario pasa a facts, no a categoría principal.');
console.log('[Archivo v8.3.1] IDs numéricos pasan a prefijo por categoría, ej. glosario-1.');
console.log(`[Archivo v8.3.1] Backup: ${backup}`);
