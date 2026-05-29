#!/usr/bin/env node
/*
  GC_ADMIN_ARCHIVO_REMOVE_DOUBLE_PAGINATION_v1

  Local patcher. No toca GitHub.
  Corrige el único fallo detectado por admin-audit-report:
  src/pages/admin/archivo.astro todavía carga gc-admin-pagination.js

  Ejecutar desde la raíz del proyecto grasscutters-webnode:

    node scripts/gc-admin-archivo-remove-double-pagination-v1.mjs

  Crea backup automático:
    _gc_backups/admin-archivo-remove-double-pagination-v1/<timestamp>/
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-archivo-remove-double-pagination-v1', stamp);
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

function removePaginationScript(content) {
  let next = content;

  const patterns = [
    '<script src="/gc-admin-pagination.js" is:inline></script>',
    '<script src="/gc-admin-pagination.js"></script>',
    "<script src='/gc-admin-pagination.js' is:inline></script>",
    "<script src='/gc-admin-pagination.js'></script>",
  ];

  for (const pattern of patterns) {
    next = next.split(pattern).join('<!-- gc-admin-pagination.js retirado: /admin/archivo ya tiene paginación propia -->');
  }

  // Fallback por si el script tiene espacios o atributos en otro orden.
  next = next.replace(
    /<script\b[^>]*src=["']\/gc-admin-pagination\.js["'][^>]*>\s*<\/script>/g,
    '<!-- gc-admin-pagination.js retirado: /admin/archivo ya tiene paginación propia -->'
  );

  return next;
}

function main() {
  console.log('');
  console.log('GC Admin Archivo Remove Double Pagination v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);

    if (!before.includes('gc-admin-pagination.js')) {
      report.unchanged.push(targetPath);
    } else {
      const after = removePaginationScript(before);
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
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('  node scripts/gc-admin-local-audit-v1.mjs');
  console.log('');
  console.log('Prueba:');
  console.log('  /admin/archivo');
  console.log('');
}

main();
