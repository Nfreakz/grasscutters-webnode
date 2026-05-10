const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const blockPath = path.join(root, 'scripts', 'patch-assets', 'acsm-unified-admin-guard-block.ts.txt');
const START = '// GC ACSM UNIFIED ADMIN GUARD START';
const END = '// GC ACSM UNIFIED ADMIN GUARD END';
const ADMIN_END = '// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_END';
const ACSM_START = '// GC ACSM SYNC START';

function fail(message) {
  console.error(`[GC] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(serverPath)) fail('no encuentro src/server/index.ts. Ejecuta desde la raíz del proyecto.');
if (!fs.existsSync(blockPath)) fail('falta scripts/patch-assets/acsm-unified-admin-guard-block.ts.txt');

let source = fs.readFileSync(serverPath, 'utf8');
const block = fs.readFileSync(blockPath, 'utf8').trim() + '\n';

if (!source.includes('GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START') || !source.includes(ADMIN_END)) {
  fail('no encuentro el patch de admin unificado. Aplica primero grasscutters_pack_admin_auth_unified_status_fix.');
}
if (!source.includes(ACSM_START) || !source.includes('gcAcsmSyncCurrentComboV2')) {
  fail('no encuentro el bloque ACSM v2. Aplica primero grasscutters_pack_acsm_current_combo_sync_v2_names.');
}
if (!source.includes('function gcCompatAdminSnapshot')) {
  fail('no encuentro gcCompatAdminSnapshot. El guard admin unificado no está disponible.');
}

const backupPath = `${serverPath}.backup-acsm-unified-admin-guard-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverPath, backupPath);

const existingStart = source.indexOf(START);
const existingEnd = source.indexOf(END);
if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
  source = source.slice(0, existingStart) + block + source.slice(existingEnd + END.length);
} else {
  const adminEndIndex = source.indexOf(ADMIN_END);
  if (adminEndIndex === -1) fail('no encuentro el final del bloque admin unificado.');
  const insertIndex = adminEndIndex + ADMIN_END.length;
  source = source.slice(0, insertIndex) + '\n\n' + block + source.slice(insertIndex);
}

fs.writeFileSync(serverPath, source, 'utf8');

console.log('[GC] Patch ACSM admin guard unificado aplicado.');
console.log(`[GC] Backup creado: ${path.relative(root, backupPath)}`);
console.log('[GC] Ejecuta: node .\\scripts\\check_acsm_unified_admin_guard_patch.cjs');
console.log('[GC] Después: npm run build y reinicia el servidor.');
