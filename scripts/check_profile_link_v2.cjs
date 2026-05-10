#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src', 'pages', 'perfil.astro');
if (!fs.existsSync(file)) {
  console.error('[GC PERFIL LINK V2 CHECK] No encuentro src/pages/perfil.astro');
  process.exit(1);
}
const source = fs.readFileSync(file, 'utf8');
const ok = source.includes('gc-profile-link-v2') && source.includes('/api/auth/link-pilot') && source.includes('/api/auth/unlink-pilot');
if (!ok) {
  console.error('[GC PERFIL LINK V2 CHECK] No está instalado el bloque visible de vinculación.');
  process.exit(1);
}
console.log('[GC PERFIL LINK V2 CHECK] OK: /perfil tiene el bloque visible de vincular piloto.');
