#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const serverPath = path.join(process.cwd(), 'src', 'server', 'index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts');
  process.exit(1);
}
const src = fs.readFileSync(serverPath, 'utf8');
const required = [
  'GC_ACSM_PRIORITY_ROUTES_V3_START',
  "app.get('/api/admin/acsm/status'",
  "app.post('/api/admin/acsm/sync-current-combo'",
  'gcAcsmGetAdminUser',
  'source: \'acsm-priority-v3\''
];
const missing = required.filter((item) => !src.includes(item));
if (missing.length) {
  console.error('ERROR: faltan marcas/rutas ACSM v3:', missing.join(', '));
  process.exit(1);
}
console.log('OK: ACSM priority routes v3 están instaladas en src/server/index.ts');
console.log('Prueba en navegador con sesión admin:');
console.log("fetch('/api/admin/acsm/status',{credentials:'include'}).then(r=>r.json()).then(console.log)");
console.log("fetch('/api/admin/acsm/sync-current-combo',{method:'POST',credentials:'include'}).then(r=>r.json()).then(console.log)");
