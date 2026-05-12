#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = [
  'public/gc-archivo-share-v832.js',
  'public/gc-archivo-share-v832.css',
];

for (const relative of files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    console.error(`[Archivo share v8.3.4] Falta archivo: ${relative}`);
    process.exit(1);
  }
}

const adminEditor = path.join(root, 'src/pages/admin/archivo/editar/[id].astro');
if (fs.existsSync(adminEditor)) {
  const backup = `${adminEditor}.backup-remove-share-v834-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let code = fs.readFileSync(adminEditor, 'utf8');
  fs.writeFileSync(backup, code, 'utf8');

  code = code
    .replace(/\n?\s*<link rel="stylesheet" href="\/gc-archivo-share-v832\.css" \/>\n?/g, '\n')
    .replace(/\n?\s*<script src="\/gc-archivo-share-v832\.js" is:inline><\/script>\n?/g, '\n');

  fs.writeFileSync(adminEditor, code, 'utf8');
  console.log('[Archivo share v8.3.4] Share eliminado del admin editor.');
}

console.log('[Archivo share v8.3.4] Share público actualizado con iconos y URL pública fija.');
