#!/usr/bin/env node
/*
  GC_ADMIN_SISTEMA_MYSQL_STORAGE_UI_FIX_v2

  Local patcher. No toca GitHub.

  v1 tenía un error de sintaxis en el propio patcher por meter template literals
  dentro de un String.raw. Este v2 evita backticks internos y usa reemplazo
  seguro por regex.

  Ejecutar desde la raíz:

    node scripts/gc-admin-sistema-mysql-storage-ui-fix-v2.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-sistema-mysql-storage-ui-fix-v2', stamp);
const targetPath = 'src/pages/admin/sistema.astro';
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

function replacementBlock() {
  return [
    "        const storageDriver = String(storageSource || storageRoot.driver || storageRoot.source || '').toLowerCase();",
    "        const isMysqlStorage = storageDriver.includes('mysql');",
    "        const storageRows = [",
    "          '<div><span>Usuarios</span><strong>' + esc(files.users?.source || storageRoot.source || storageSource || '-') + '</strong></div>',",
    "          '<div><span>Nombres</span><strong>' + esc(files.displayNames?.source || storageRoot.source || storageSource || '-') + '</strong></div>',",
    "          '<div><span>Persistente</span><strong>' + (storagePersistent ? 'Sí' : 'No') + '</strong></div>',",
    "        ];",
    "",
    "        if (isMysqlStorage) {",
    "          storageRows.push('<div><span>Tipo storage</span><strong>Base de datos MySQL</strong></div>');",
    "          storageRows.push('<div><span>Rutas JSON</span><strong>No aplica</strong></div>');",
    "          storageRows.push('<div><span>Estado</span><strong>Persistencia en DB</strong></div>');",
    "        } else {",
    "          const dataRoot = storageRoot.dataRoot || files.users?.resolvedPath || '';",
    "          const usersPath = files.users?.resolvedPath || '';",
    "          const displayNamesPath = files.displayNames?.resolvedPath || '';",
    "",
    "          storageRows.push('<div><span>Data root</span><strong title=\"' + esc(dataRoot || 'No informado') + '\">' + esc(dataRoot ? short(dataRoot) : 'No informado') + '</strong></div>');",
    "          storageRows.push('<div><span>Users path</span><strong title=\"' + esc(usersPath || 'No informado') + '\">' + esc(usersPath ? short(usersPath) : 'No informado') + '</strong></div>');",
    "          storageRows.push('<div><span>Display names path</span><strong title=\"' + esc(displayNamesPath || 'No informado') + '\">' + esc(displayNamesPath ? short(displayNamesPath) : 'No informado') + '</strong></div>');",
    "        }",
    "",
    "        els.storageRows.innerHTML = storageRows.join('');"
  ].join('\n');
}

function patchStorageRows(content) {
  if (content.includes("const isMysqlStorage = storageDriver.includes('mysql');")) {
    return content;
  }

  const block = replacementBlock();

  const originalRegex = /        els\.storageRows\.innerHTML = `\n\s*<div><span>Usuarios<\/span><strong>\$\{esc\(files\.users\?\.source \|\| storageRoot\.source \|\| '-'\)\}<\/strong><\/div>\n\s*<div><span>Nombres<\/span><strong>\$\{esc\(files\.displayNames\?\.source \|\| storageRoot\.source \|\| '-'\)\}<\/strong><\/div>\n\s*<div><span>Persistente<\/span><strong>\$\{storagePersistent \? 'Sí' : 'No'\}<\/strong><\/div>\n\s*<div><span>Data root<\/span><strong title="\$\{esc\(storageRoot\.dataRoot \|\| files\.users\?\.resolvedPath \|\| '-'\)\}">\$\{esc\(short\(storageRoot\.dataRoot \|\| files\.users\?\.resolvedPath \|\| '-'\)\)\}<\/strong><\/div>\n\s*<div><span>Users path<\/span><strong title="\$\{esc\(files\.users\?\.resolvedPath \|\| '-'\)\}">\$\{esc\(short\(files\.users\?\.resolvedPath \|\| '-'\)\)\}<\/strong><\/div>\n\s*<div><span>Display names path<\/span><strong title="\$\{esc\(files\.displayNames\?\.resolvedPath \|\| '-'\)\}">\$\{esc\(short\(files\.displayNames\?\.resolvedPath \|\| '-'\)\)\}<\/strong><\/div>\n\s*`;/;

  if (originalRegex.test(content)) {
    return content.replace(originalRegex, block);
  }

  // Fallback más amplio: desde els.storageRows.innerHTML hasta el cierre del template que contiene Display names path.
  const broadRegex = /        els\.storageRows\.innerHTML = `[\s\S]*?Display names path[\s\S]*?        `;/;

  if (broadRegex.test(content)) {
    report.warnings.push('Aplicado fallback amplio para reemplazar storageRows.');
    return content.replace(broadRegex, block);
  }

  report.warnings.push('No se encontró el bloque storageRows original. No se aplicó cambio.');
  return content;
}

function main() {
  console.log('');
  console.log('GC Admin Sistema MySQL Storage UI Fix v2');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);
    const after = patchStorageRows(before);
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
  console.log('  /admin/sistema');
  console.log('');
}

main();
