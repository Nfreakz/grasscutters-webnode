#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'server', 'motorsport-archive-safe-api-v824-routes.ts');

if (!fs.existsSync(file)) {
  console.error('[Archivo v8.2.5] No existe src/server/motorsport-archive-safe-api-v824-routes.ts');
  process.exit(1);
}

const backup = `${file}.backup-export-fix-v825-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(file, backup);

// El paquete ya trae el archivo corregido. Este script queda como marcador de instalación.
const code = fs.readFileSync(file, 'utf8');
if (!code.includes('export function registerMotorsportArchiveSafeApiV824')) {
  console.error('[Archivo v8.2.5] El archivo no contiene el export correcto tras reemplazar.');
  process.exit(1);
}

console.log('[Archivo v8.2.5] Export correcto detectado: registerMotorsportArchiveSafeApiV824');
console.log(`[Archivo v8.2.5] Backup: ${backup}`);
