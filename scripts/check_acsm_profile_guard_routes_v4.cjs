#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'src', 'server', 'index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No existe src/server/index.ts.');
  process.exit(1);
}

const source = fs.readFileSync(serverPath, 'utf8');
const required = [
  'GC ACSM PROFILE GUARD ROUTES V4 START',
  "app.get('/api/admin/acsm/status'",
  "app.post('/api/admin/acsm/sync-current-combo'",
  'gcAcsmRequireAdminFromProfileV4',
  'acsm-profile-guard-v4'
];

const missing = required.filter((token) => !source.includes(token));
if (missing.length) {
  console.error('ERROR: faltan marcas del parche ACSM v4:', missing.join(', '));
  process.exit(1);
}

const appIndex = source.indexOf('const app = express();');
const v4Index = source.indexOf('GC ACSM PROFILE GUARD ROUTES V4 START');
const oldIndex = source.indexOf('GC ACSM SYNC START');
if (appIndex === -1) {
  console.warn('AVISO: no se encontró literalmente "const app = express();", pero el bloque v4 existe.');
} else if (v4Index < appIndex) {
  console.error('ERROR: el bloque v4 aparece antes de crear app.');
  process.exit(1);
}
if (oldIndex !== -1 && oldIndex < v4Index) {
  console.error('ERROR: hay un bloque ACSM antiguo antes del v4. El v4 debe ser prioritario.');
  process.exit(1);
}

console.log('OK: el parche ACSM profile guard v4 está instalado y las rutas son prioritarias.');
