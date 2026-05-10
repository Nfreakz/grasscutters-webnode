const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const text = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';

const checks = [
  ['marker inicio ACSM guard', text.includes('GC ACSM UNIFIED ADMIN GUARD START')],
  ['marker fin ACSM guard', text.includes('GC ACSM UNIFIED ADMIN GUARD END')],
  ['usa gcCompatAdminSnapshot', text.includes('gcCompatAdminSnapshot(req)')],
  ['ruta GET /api/admin/acsm/status', /app\.get\(['"]\/api\/admin\/acsm\/status['"]/.test(text)],
  ['ruta POST /api/admin/acsm/sync-current-combo', /app\.post\(['"]\/api\/admin\/acsm\/sync-current-combo['"]/.test(text)],
  ['bloque ACSM v2 disponible', text.includes('gcAcsmSyncCurrentComboV2')],
  ['admin auth unificado disponible', text.includes('GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START')]
];

let ok = true;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'OK' : 'FAIL'}: ${label}`);
  if (!passed) ok = false;
}

const guardIndex = text.indexOf('GC ACSM UNIFIED ADMIN GUARD START');
const acsmIndex = text.indexOf('GC ACSM SYNC START');
if (guardIndex >= 0 && acsmIndex >= 0 && guardIndex < acsmIndex) {
  console.log('OK: las rutas ACSM unificadas quedan antes de las rutas ACSM antiguas.');
} else {
  console.log('WARN: revisa el orden de rutas ACSM. El guard debería quedar antes del bloque ACSM antiguo.');
}

if (!ok) process.exit(1);
console.log('\n[GC] Patch verificado. Ahora ejecuta npm run build y reinicia el servidor.');
