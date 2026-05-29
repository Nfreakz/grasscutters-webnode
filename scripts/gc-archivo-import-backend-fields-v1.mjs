#!/usr/bin/env node
/*
  GC_ARCHIVO_IMPORT_BACKEND_FIELDS_v1

  Local patcher. No toca GitHub.
  Ejecutar desde la raíz del proyecto grasscutters-webnode:

    node scripts/gc-archivo-import-backend-fields-v1.mjs

  Crea backup automático:
    _gc_backups/archivo-import-backend-fields-v1/<timestamp>/
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'archivo-import-backend-fields-v1', stamp);
const targetPath = 'src/server/motorsport-archive-unified-admin-routes.ts';
const fullTarget = path.join(rootDir, targetPath);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

const REQUIRED_FIELDS = [
  'subtitulo',
  'introduccion',
  'propietario',
  'diseniador',
  'diseñador',
  'datos_sim_racing',
  'cilindrada',
  'transmision',
  'transmisión',
  'chasis',
  'aerodinamica',
  'aerodinámica',
  'victorias',
  'podios',
  'poles',
  'errores_comunes',
  'datos_destacados',
  'cronologia',
  'cronología',
  'referencias',
  'ultima_revision',
  'última_revision',
  'seo_title',
  'seo_description',
  'seotitle',
  'seodescription',
  'cover_url',
  'cover_alt'
];

const ALIAS_BLOCK = `
const CSV_TOP_LEVEL_ALIASES: Record<string, string> = {
  pais: 'pais',
  país: 'pais',
  ubicacion: 'ubicacion',
  ubicación: 'ubicacion',
  region: 'region',
  epoca: 'periodo',
  año: 'ano',
  diseñador: 'diseniador',
  transmision: 'transmision',
  transmisión: 'transmision',
  aerodinámica: 'aerodinamica',
  cronología: 'cronologia',
  última_revision: 'ultima_revision',
  seotitle: 'seoTitle',
  seo_title: 'seoTitle',
  seodescription: 'seoDescription',
  seo_description: 'seoDescription',
  cover_url: 'coverUrl',
  cover_alt: 'coverAlt',
  image_alt: 'coverAlt',
  imagen_alt: 'coverAlt'
};

function canonicalCsvTopLevelKey(key: string) {
  return CSV_TOP_LEVEL_ALIASES[key] || key;
}
`;

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}`);
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function backup(pathName, content) {
  const dest = path.join(backupRoot, pathName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(pathName, before, after) {
  if (before === after) {
    report.unchanged.push(pathName);
    return false;
  }

  backup(pathName, before);
  fs.writeFileSync(path.join(rootDir, pathName), after, 'utf8');
  report.changed.push(pathName);
  return true;
}

function insertFieldsIntoSet(content) {
  const marker = "  'license',\n]);";
  if (!content.includes(marker)) {
    report.warnings.push("No se encontró el final esperado de CSV_TOP_LEVEL_FIELDS.");
    return content;
  }

  let next = content;
  for (const field of REQUIRED_FIELDS) {
    const needle = `  '${field}',`;
    if (!next.includes(needle)) {
      next = next.replace(marker, `  '${field}',\n${marker}`);
    }
  }

  return next;
}

function insertAliases(content) {
  if (content.includes('CSV_TOP_LEVEL_ALIASES')) return content;

  const anchor = "]);\n\nfunction topLevelFieldsFromCsvRow(row: any) {";
  if (!content.includes(anchor)) {
    report.warnings.push("No se encontró anchor para insertar CSV_TOP_LEVEL_ALIASES.");
    return content;
  }

  return content.replace("]);\n\nfunction topLevelFieldsFromCsvRow(row: any) {", `]);\n${ALIAS_BLOCK}\nfunction topLevelFieldsFromCsvRow(row: any) {`);
}

function patchTopLevelFunction(content) {
  const before = `function topLevelFieldsFromCsvRow(row: any) {
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    const key = cleanCsvKey(String(rawKey));
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;
    if (CSV_TOP_LEVEL_FIELDS.has(key)) output[key] = value;
  }
  return output;
}`;

  const after = `function topLevelFieldsFromCsvRow(row: any) {
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    const key = cleanCsvKey(String(rawKey));
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;

    const canonicalKey = canonicalCsvTopLevelKey(key);

    if (CSV_TOP_LEVEL_FIELDS.has(key) || CSV_TOP_LEVEL_FIELDS.has(canonicalKey)) {
      output[canonicalKey] = value;
    }
  }
  return output;
}`;

  if (content.includes(after)) return content;

  if (!content.includes(before)) {
    report.warnings.push("No se pudo reemplazar topLevelFieldsFromCsvRow. Revisa manualmente.");
    return content;
  }

  return content.replace(before, after);
}

function patchSkipBlock(content) {
  const current = `    'summary','resumen','descripcion_corta','description',
    'body','descripcion','descripcion_larga','texto','content',`;

  const next = `    'summary','resumen','descripcion_corta','description',
    'body','descripcion','descripcion_larga','texto','content',
    'seo_title','seo_description','seotitle','seodescription',
    'cover_url','cover_alt','image_alt','imagen_alt',`;

  if (content.includes(next)) return content;
  if (!content.includes(current)) {
    report.warnings.push("No se pudo ampliar skip block.");
    return content;
  }

  return content.replace(current, next);
}

function patchMediaAltFromSeoCover(content) {
  const current = `      coverUrl: String(input.coverUrl || main?.url || main?.localUrl || prev.coverUrl || '').trim(),
      coverAlt: String(input.coverAlt || main?.alt || prev.coverAlt || '').trim(),`;

  const next = `      coverUrl: String(input.coverUrl || input.cover_url || main?.url || main?.localUrl || prev.coverUrl || '').trim(),
      coverAlt: String(input.coverAlt || input.cover_alt || input.imageAlt || input.imagen_alt || main?.alt || prev.coverAlt || '').trim(),`;

  if (content.includes(next)) return content;
  if (!content.includes(current)) {
    report.warnings.push("No se pudo ampliar coverUrl/coverAlt en normalizeItem.");
    return content;
  }

  return content.replace(current, next);
}

function main() {
  console.log('');
  console.log('GC Archivo Import Backend Fields v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);
    let after = before;

    after = insertFieldsIntoSet(after);
    after = insertAliases(after);
    after = patchTopLevelFunction(after);
    after = patchSkipBlock(after);
    after = patchMediaAltFromSeoCover(after);

    writeIfChanged(targetPath, before, after);
  } catch (error) {
    report.errors.push(error?.message || String(error));
  }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log('');
    console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }

  if (report.errors.length) {
    console.log('');
    console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }

  if (report.changed.length) {
    console.log('');
    console.log('Backups creados en:');
    console.log(backupRoot);
  }

  console.log('');
  console.log('Siguiente paso:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('');
  console.log('Prueba:');
  console.log('  /admin/archivo/importar');
  console.log('');
}

main();
