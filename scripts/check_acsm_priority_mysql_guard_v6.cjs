#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const serverPath = path.join(process.cwd(), 'src', 'server', 'index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts');
  process.exit(1);
}
const source = fs.readFileSync(serverPath, 'utf8');
const checks = [
  'GC ACSM PRIORITY MYSQL GUARD V6 START',
  'acsm-priority-mysql-guard-v6',
  'gcAcsmV6MysqlAdminFromCookie',
  "app.get('/api/admin/acsm/status'",
  "app.post('/api/admin/acsm/sync-current-combo'"
];
const missing = checks.filter((text) => !source.includes(text));
if (missing.length) {
  console.error('ERROR: faltan marcas del parche v6:', missing.join(', '));
  process.exit(1);
}
const appIndex = source.indexOf('const app = express();');
const v6Index = source.indexOf('GC ACSM PRIORITY MYSQL GUARD V6 START');
const oldV4Index = source.indexOf('acsm-profile-guard-v4');
if (appIndex === -1 || v6Index === -1) {
  console.error('ERROR: no puedo verificar la posición del bloque v6.');
  process.exit(1);
}
if (oldV4Index !== -1 && oldV4Index < v6Index) {
  console.error('ERROR: hay rutas v4 antes de la v6. La v6 debe ser prioritaria.');
  process.exit(1);
}
console.log('OK: parche ACSM v6 instalado y colocado antes de las rutas antiguas.');
