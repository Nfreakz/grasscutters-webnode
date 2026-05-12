#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const filesToClean = [
  'src/pages/admin/archivo/editar/[id].astro',
];

for (const relative of filesToClean) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const backup = `${file}.backup-remove-admin-share-v833-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let code = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(backup, code, 'utf8');

  code = code
    .replace(/\n?\s*<link rel="stylesheet" href="\/gc-archivo-share-v832\.css" \/>\n?/g, '\n')
    .replace(/\n?\s*<script src="\/gc-archivo-share-v832\.js" is:inline><\/script>\n?/g, '\n');

  fs.writeFileSync(file, code, 'utf8');
  console.log(`[Archivo public v8.3.3] Share admin eliminado de ${relative}`);
  console.log(`[Archivo public v8.3.3] Backup: ${backup}`);
}

const serverFiles = [
  'src/pages/archivo.astro',
  'src/pages/archivo/[category]/[slug].astro',
  'src/lib/motorsport-archive/public-data.ts',
];

for (const relative of serverFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    console.error(`[Archivo public v8.3.3] Falta archivo esperado: ${relative}`);
    process.exit(1);
  }
}

console.log('[Archivo public v8.3.3] Páginas públicas MySQL instaladas.');
