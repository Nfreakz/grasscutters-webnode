#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const STORAGE_FILE = path.join(ROOT, 'data', 'app', 'motorsport-archive.json');
const DEFAULT_SOURCE = path.join(ROOT, 'data', 'archive-import');
const LEGACY_SOURCE = path.join(ROOT, 'data', 'biblia', 'editable');
const SOURCE_DIR = process.env.ARCHIVO_IMPORT_DIR ? path.resolve(ROOT, process.env.ARCHIVO_IMPORT_DIR) : (fs.existsSync(DEFAULT_SOURCE) ? DEFAULT_SOURCE : LEGACY_SOURCE);
const DRY_RUN = ['1','true','yes','si','sí'].includes(String(process.env.ARCHIVO_IMPORT_DRY_RUN || '').toLowerCase());
const PUBLISH = ['1','true','yes','si','sí'].includes(String(process.env.ARCHIVO_IMPORT_PUBLISH || '').toLowerCase());
const FORCE = ['1','true','yes','si','sí'].includes(String(process.env.ARCHIVO_IMPORT_FORCE || '').toLowerCase());

const FILES = [
  { file: '01_circuitos.csv', type: 'circuit', category: 'circuitos' },
  { file: '02_pilotos.csv', type: 'driver', category: 'pilotos' },
  { file: '03_vehiculos.csv', type: 'vehicle', category: 'vehiculos' },
  { file: '04_campeonatos.csv', type: 'championship', category: 'campeonatos' },
  { file: '05_records.csv', type: 'record', category: 'records' },
  { file: '06_glosario.csv', type: 'glossary', category: 'glosario' },
];

function now() { return new Date().toISOString(); }
function ensureDirForFile(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function readText(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function compact(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function first(row, keys) { for (const key of keys) { const v = compact(row[key]); if (v) return v; } return ''; }
function slugify(value) {
  return compact(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || `item-${crypto.randomUUID().slice(0,8)}`;
}
function parseBool(v) { const s = compact(v).toLowerCase(); return ['1','true','yes','si','sí','x'].includes(s); }
function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find(Boolean) || '';
  const counts = { ';': (line.match(/;/g)||[]).length, ',': (line.match(/,/g)||[]).length, '\t': (line.match(/\t/g)||[]).length };
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    if (quoted) {
      if (c === '"' && next === '"') { cell += '"'; i++; continue; }
      if (c === '"') { quoted = false; continue; }
      cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (c === '\r') continue;
    cell += c;
  }
  row.push(cell);
  if (row.some((x)=>compact(x))) rows.push(row);
  const headers = (rows.shift() || []).map((h)=>compact(h));
  return rows.filter((r)=>r.some((x)=>compact(x))).map((values)=>Object.fromEntries(headers.map((h,i)=>[h, values[i] ?? ''])));
}
function readStore() {
  if (!fs.existsSync(STORAGE_FILE)) return { version: 1, updatedAt: now(), items: [] };
  const parsed = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  return { version: 1, updatedAt: parsed.updatedAt || now(), items: Array.isArray(parsed.items) ? parsed.items : [] };
}
function writeStore(store) {
  ensureDirForFile(STORAGE_FILE);
  const backup = `${STORAGE_FILE}.backup-import-${now().replace(/[:.]/g,'-')}`;
  if (fs.existsSync(STORAGE_FILE)) fs.copyFileSync(STORAGE_FILE, backup);
  fs.writeFileSync(STORAGE_FILE, JSON.stringify({ ...store, updatedAt: now() }, null, 2) + '\n', 'utf8');
  return backup;
}
function makeFacts(type, row) {
  const specs = {
    circuit: [['País',['pais']], ['Región',['region']], ['Ciudad',['ciudad','poblacion']], ['Ubicación',['ubicacion']], ['Continente',['continente']], ['Tipo',['tipo']], ['Longitud',['longitud_km']], ['Curvas',['curvas']], ['Superficie',['superficie']], ['Grado FIA',['fia_grado']], ['Año apertura',['anio_apertura']], ['Campeonato principal',['campeonato_principal']]],
    driver: [['País',['pais','nacionalidad']], ['Época',['epoca','era']], ['Disciplina',['disciplina','categoria']], ['Títulos',['titulos','titulos_mundiales']]],
    vehicle: [['Constructor',['constructor','marca']], ['Categoría',['categoria','disciplina']], ['Año',['anio','ano']], ['Motor',['motor']], ['Potencia',['potencia']], ['Peso',['peso']]],
    championship: [['Categoría',['categoria','disciplina']], ['Ámbito',['ambito','region','pais']], ['Inicio',['anio_inicio','inicio','anio']]],
    record: [['Circuito',['circuito','circuito_nombre','circuito_slug','circuito_id']], ['Piloto',['piloto']], ['Vehículo',['vehiculo']], ['Tiempo',['tiempo']], ['Año',['anio','ano']], ['Evento',['evento']]],
    glossary: [['Área',['categoria','area']], ['Término',['termino','término','nombre','concepto']]],
  }[type] || [];
  return specs.map(([label, keys])=>({ label, value: first(row, keys) })).filter((f)=>f.value);
}
function collectMedia(row) {
  const media = [];
  for (let i = 1; i <= 12; i++) {
    const url = first(row, [`imagen_${i}_url`, `image_${i}_url`, `media_${i}_url`]);
    if (!url) continue;
    media.push({
      id: crypto.randomUUID(),
      type: first(row, [`imagen_${i}_tipo`, `media_${i}_tipo`]) || 'image',
      url,
      alt: first(row, [`imagen_${i}_alt`, `image_${i}_alt`]) || first(row, ['nombre','titulo','title']) || 'Imagen del Archivo Motorsport',
      source: first(row, [`imagen_${i}_fuente`, `image_${i}_source`, `fuente`]) || null,
      sourceUrl: first(row, [`imagen_${i}_fuente_url`, `image_${i}_source_url`, 'fuente_url']) || null,
      author: first(row, [`imagen_${i}_autor`, `image_${i}_author`, 'autor']) || null,
      license: first(row, [`imagen_${i}_licencia`, `image_${i}_license`, 'licencia']) || null,
      isCover: i === 1,
      locked: false,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return media;
}
function makeItem(def, row, index) {
  const title = first(row, ['titulo','title','nombre','termino','término','concepto','piloto','vehiculo']) || `${def.category} ${index + 1}`;
  const slug = slugify(first(row, ['slug']) || title);
  const id = first(row, ['id']) ? `${def.category}-${slugify(first(row,['id']))}` : `${def.category}-${slug}`;
  const summary = first(row, ['resumen','summary','descripcion_corta','descripcion','definicion','notas']) || '';
  const body = first(row, ['texto_largo','body','descripcion_larga','historia','biografia','contenido']) || summary;
  const facts = makeFacts(def.type, row);
  const media = collectMedia(row);
  return {
    id,
    type: def.type,
    category: def.category,
    slug,
    title,
    status: PUBLISH ? 'published' : (first(row, ['estado','status']) || 'draft'),
    summary,
    body,
    facts,
    media,
    tags: first(row, ['tags','etiquetas']) ? first(row, ['tags','etiquetas']).split('|').map((x)=>compact(x)).filter(Boolean) : [],
    source: 'csv-import',
    sourceRow: index + 2,
    createdAt: now(),
    updatedAt: now(),
  };
}
function mergeItems(existing, incoming) {
  const byId = new Map(existing.map((item)=>[item.id, item]));
  let created = 0, updated = 0, skippedLocked = 0;
  for (const item of incoming) {
    const previous = byId.get(item.id);
    if (!previous) { byId.set(item.id, item); created++; continue; }
    const lockedMedia = Array.isArray(previous.media) ? previous.media.filter((m)=>m?.locked === true) : [];
    const previousHasManualWork = previous.source !== 'csv-import' || lockedMedia.length > 0;
    if (previousHasManualWork && !FORCE) {
      byId.set(item.id, {
        ...previous,
        // Never overwrite manual text or locked media by default.
        updatedAt: now(),
        importCandidate: {
          title: item.title,
          summary: item.summary,
          body: item.body,
          facts: item.facts,
          media: item.media,
          importedAt: now(),
        }
      });
      skippedLocked++;
      continue;
    }
    byId.set(item.id, { ...previous, ...item, createdAt: previous.createdAt || item.createdAt, updatedAt: now() });
    updated++;
  }
  return { items: [...byId.values()], created, updated, skippedLocked };
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`[Archivo Motorsport] No existe carpeta de importación: ${SOURCE_DIR}`);
    process.exit(1);
  }
  const store = readStore();
  const incoming = [];
  const summary = [];
  for (const def of FILES) {
    const file = path.join(SOURCE_DIR, def.file);
    if (!fs.existsSync(file)) { summary.push({ file: def.file, rows: 0, status: 'missing' }); continue; }
    const rows = parseCsv(readText(file));
    rows.forEach((row, index)=> incoming.push(makeItem(def, row, index)));
    summary.push({ file: def.file, rows: rows.length, status: 'ok' });
  }
  const merged = mergeItems(store.items, incoming);
  const nextStore = { ...store, items: merged.items };
  let backup = null;
  if (!DRY_RUN) backup = writeStore(nextStore);
  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    source: SOURCE_DIR,
    storage: STORAGE_FILE,
    summary,
    incoming: incoming.length,
    total: nextStore.items.length,
    created: merged.created,
    updated: merged.updated,
    skippedLocked: merged.skippedLocked,
    publishMode: PUBLISH,
    force: FORCE,
    backup,
  }, null, 2));
}
main();
