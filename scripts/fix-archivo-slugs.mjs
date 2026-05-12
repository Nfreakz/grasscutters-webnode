#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STORE_PATH = path.join(ROOT, 'data', 'app', 'motorsport-archive.json');
const DRY_RUN = ['1', 'true', 'yes', 'si', 'sí'].includes(String(process.env.ARCHIVO_SLUG_DRY_RUN || '').toLowerCase());

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90) || 'item';
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function getItems(store) {
  if (Array.isArray(store?.items)) return store.items;
  if (Array.isArray(store?.data?.items)) return store.data.items;
  return [];
}
function itemTitle(item) {
  return item?.title || item?.nombre || item?.name || item?.titulo || item?.summary || item?.id || 'item';
}
function itemType(item) {
  return item?.type || item?.category || item?.categoria || 'item';
}

if (!fs.existsSync(STORE_PATH)) {
  console.error(`[Archivo Motorsport] No existe ${STORE_PATH}`);
  process.exit(1);
}

const store = readJson(STORE_PATH);
const items = getItems(store);
const used = new Map();
const changes = [];

for (const item of items) {
  const type = itemType(item);
  const original = String(item.slug || '').trim();
  const base = slugify(original || itemTitle(item));
  const keyBase = `${type}:${base}`;
  let next = base;
  let counter = used.get(keyBase) || 0;
  if (counter > 0 || [...used.keys()].some((key) => key === `${type}:${next}`)) {
    counter += 1;
    do {
      next = `${base}-${counter}`;
      counter += 1;
    } while (used.has(`${type}:${next}`));
  }
  used.set(`${type}:${next}`, 1);
  used.set(keyBase, Math.max(used.get(keyBase) || 0, counter || 1));

  if (original !== next) {
    changes.push({ id: item.id, type, title: itemTitle(item), from: original, to: next });
    item.slug = next;
    item.updatedAt = new Date().toISOString();
  }
}

console.log(`[Archivo Motorsport] Fichas revisadas: ${items.length}`);
console.log(`[Archivo Motorsport] Slugs corregidos: ${changes.length}`);
if (changes.length) {
  for (const change of changes.slice(0, 30)) {
    console.log(`- ${change.type}:${change.id || change.title} "${change.from || '(vacío)'}" -> "${change.to}"`);
  }
  if (changes.length > 30) console.log(`... y ${changes.length - 30} más`);
}

if (!DRY_RUN && changes.length) {
  const backupPath = `${STORE_PATH}.backup-slugs-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(STORE_PATH, backupPath);
  writeJson(STORE_PATH, store);
  console.log(`[Archivo Motorsport] Backup: ${backupPath}`);
  console.log(`[Archivo Motorsport] Guardado: ${STORE_PATH}`);
} else if (DRY_RUN) {
  console.log('[Archivo Motorsport] Dry run activo: no se ha escrito nada.');
}
