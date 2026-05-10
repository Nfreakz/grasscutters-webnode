#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const serverPath = path.join(process.cwd(), 'src', 'server', 'index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('[GC PROFILE LINK CHECK] No encuentro src/server/index.ts. Ejecuta desde la raíz del proyecto.');
  process.exit(1);
}
const source = fs.readFileSync(serverPath, 'utf8');
const required = ['/api/auth/link-pilot', '/api/auth/unlink-pilot'];
const missing = required.filter((token) => !source.includes(token));
if (missing.length) {
  console.error('[GC PROFILE LINK CHECK] Faltan endpoints en src/server/index.ts: ' + missing.join(', '));
  console.error('[GC PROFILE LINK CHECK] No apliques el perfil hasta recuperar esos endpoints del servidor.');
  process.exit(1);
}
console.log('[GC PROFILE LINK CHECK] OK: endpoints de vincular/desvincular piloto encontrados.');
