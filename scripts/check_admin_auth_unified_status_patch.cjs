const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const text = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';

const checks = [
  ['marker inicio', text.includes('GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START')],
  ['ruta /api/admin/status unificada', /app\.get\(['"]\/api\/admin\/status['"]/.test(text)],
  ['ruta /api/admin/calendar-events/storage unificada', /app\.get\(['"]\/api\/admin\/calendar-events\/storage['"]/.test(text)],
  ['resolver de cookie gcCompatResolveCurrentUser', text.includes('gcCompatResolveCurrentUser')],
  ['storage calendario gcCompatCalendarStorageInfo', text.includes('gcCompatCalendarStorageInfo')]
];

let ok = true;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'OK' : 'FAIL'}: ${label}`);
  if (!passed) ok = false;
}

const markerIndex = text.indexOf('GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START');
const statusIndex = text.indexOf("/api/admin/status");
if (markerIndex >= 0 && statusIndex >= 0 && markerIndex <= statusIndex) {
  console.log('OK: la ruta unificada queda antes de las rutas antiguas si existen.');
} else {
  console.log('WARN: revisa el orden de rutas admin.');
}

if (!ok) process.exit(1);
console.log('\n[GC] Patch verificado. Ahora ejecuta npm run build y reinicia el servidor.');
