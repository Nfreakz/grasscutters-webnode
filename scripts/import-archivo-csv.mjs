#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const defaultInput = path.join(root, '_imports', 'archivo', 'archivo_motorsport_v3.csv');
const defaultOutput = path.join(root, 'src', 'data', 'archive', 'items.json');
const args = process.argv.slice(2);
const input = path.resolve(args[0] || defaultInput);
const output = path.resolve(args[1] || defaultOutput);

function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ficha';
}

function normalizeType(value) {
  const slug = slugify(value || 'archivo');
  if (['circuito', 'circuit'].includes(slug)) return 'circuitos';
  if (['coche', 'vehiculo', 'vehiculos', 'car', 'cars'].includes(slug)) return 'coches';
  if (['piloto', 'driver', 'drivers'].includes(slug)) return 'pilotos';
  return slug;
}

const raw = await fs.readFile(input, 'utf8');
const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
if (!rows.length) throw new Error(`CSV vacío: ${input}`);

const headers = rows[0].map((header) => String(header || '').trim());
const items = rows.slice(1).map((row, index) => {
  const item = {};
  headers.forEach((header, i) => {
    if (!header) return;
    const value = String(row[i] ?? '').trim();
    if (value !== '') item[header] = value;
  });
  item.tipo = normalizeType(item.tipo || item.tipo_importacion || item.categoria_tipo || 'archivo');
  item.slug = item.slug || slugify(item.nombre || item.name || `ficha-${index + 1}`);
  item.nombre = item.nombre || item.name || item.titulo || `Ficha ${index + 1}`;
  return item;
}).filter((item) => item.nombre && item.slug);

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(items, null, 2) + '\n', 'utf8');
console.log(`Importadas ${items.length} fichas en ${path.relative(root, output)}`);
console.log('Rutas generadas:');
for (const item of items) console.log(`- /archivo/${item.tipo}/${item.slug}/`);
