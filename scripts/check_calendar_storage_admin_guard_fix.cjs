#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const serverPath = path.join(process.cwd(), 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

const source = fs.readFileSync(serverPath, 'utf8');
const checks = [
  'GC_CALENDAR_STORAGE_ADMIN_GUARD_FIX_START',
  "app.get('/api/admin/calendar-events/storage'",
  'gcCalendarStorageAdminGuardFromProfile',
  'http://127.0.0.1:${PORT}/api/profile'
];

const missing = checks.filter((text) => !source.includes(text));
if (missing.length) {
  console.error('ERROR: falta parte del fix:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const firstStorageRoute = source.indexOf('/api/admin/calendar-events/storage');
const marker = source.indexOf('GC_CALENDAR_STORAGE_ADMIN_GUARD_FIX_START');
if (marker === -1 || marker > firstStorageRoute) {
  console.error('ERROR: el fix no está antes de la primera ruta storage.');
  process.exit(1);
}

console.log('OK: el fix de guard admin para storage del calendario está aplicado antes de la ruta original.');
console.log('Siguiente: npm run build y reiniciar servidor.');
