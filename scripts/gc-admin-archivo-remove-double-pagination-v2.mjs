#!/usr/bin/env node
/*
  GC_ADMIN_ARCHIVO_REMOVE_DOUBLE_PAGINATION_v2

  Corrige el falso positivo de v1:
  v1 reemplazaba el script por un comentario que seguía conteniendo "gc-admin-pagination.js".
  La auditoría busca esa cadena en bruto, así que seguía fallando.

  Este v2 elimina:
  - cualquier <script ... src="/gc-admin-pagination.js" ...></script>
  - cualquier comentario HTML que contenga gc-admin-pagination.js
  - cualquier línea restante que contenga gc-admin-pagination.js

  No toca GitHub.
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-archivo-remove-double-pagination-v2', stamp);
const targetPath = 'src/pages/admin/archivo.astro';
const fullTarget = path.join(rootDir, targetPath);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

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

function cleanPaginationReferences(content) {
  let next = content;

  // 1) Remove actual script tag.
  next = next.replace(
    /<script\b[^>]*src=["']\/gc-admin-pagination\.js["'][^>]*>\s*<\/script>\s*/g,
    ''
  );

  // 2) Remove HTML comments containing the string.
  next = next.replace(
    /<!--[\s\S]*?gc-admin-pagination\.js[\s\S]*?-->\s*/g,
    ''
  );

  // 3) Remove any leftover single line containing the string.
  next = next
    .split(/\r?\n/)
    .filter((line) => !line.includes('gc-admin-pagination.js'))
    .join('\n');

  // 4) Collapse excessive blank lines at the very end only.
  next = next.replace(/\n{4,}$/, '\n\n');

  return next;
}

function main() {
  console.log('');
  console.log('GC Admin Archivo Remove Double Pagination v2');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);
    const after = cleanPaginationReferences(before);

    if (after.includes('gc-admin-pagination.js')) {
      report.errors.push('No se ha podido eliminar completamente gc-admin-pagination.js de src/pages/admin/archivo.astro');
    } else {
      writeIfChanged(targetPath, before, after);
    }
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
  console.log('  Select-String -Path ".\\src\\pages\\admin\\archivo.astro" -Pattern "gc-admin-pagination.js"');
  console.log('  node scripts\\gc-admin-local-audit-v1.mjs');
  console.log('');
  console.log('Resultado esperado:');
  console.log('  67/67 OK');
  console.log('');
}

main();
