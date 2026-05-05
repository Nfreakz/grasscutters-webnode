'use strict';

/* GrassCutters Hostinger bootstrap V2.
 * Arranca el servidor compilado en JavaScript real.
 * Funciona tanto si Hostinger despliega la raíz completa como si usa dist/ como raíz.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootDir = __dirname;

function findExistingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

const compiledServer = findExistingFile([
  path.join(rootDir, 'server-node', 'index.mjs'),
  path.join(rootDir, 'dist', 'server-node', 'index.mjs')
]);

if (!compiledServer) {
  console.error('[GC bootstrap] No se encontró servidor compilado.');
  console.error('[GC bootstrap] Buscado en:');
  console.error(' - ' + path.join(rootDir, 'server-node', 'index.mjs'));
  console.error(' - ' + path.join(rootDir, 'dist', 'server-node', 'index.mjs'));
  console.error('[GC bootstrap] Ejecuta npm run build y revisa que el directorio de salida sea dist o ./ según el deploy.');
  process.exit(1);
}

process.env.GC_RUNTIME_ROOT = rootDir;
process.env.GC_BOOTSTRAP_ENTRY = 'server.cjs';

console.log('[GC bootstrap] Root:', rootDir);
console.log('[GC bootstrap] GC_RUNTIME_ROOT:', process.env.GC_RUNTIME_ROOT);
console.log('[GC bootstrap] Servidor compilado:', compiledServer);

import(pathToFileURL(compiledServer).href).catch((error) => {
  console.error('[GC bootstrap] Error importando servidor compilado:', error);
  process.exit(1);
});
