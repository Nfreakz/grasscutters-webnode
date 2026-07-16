import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(scriptDir, 'phase3d-account-usage-payload');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase3d-account-usage-${stamp}`);
const marker = 'GC_ANALYTICS_ACCOUNT_USAGE_FOREVER_V4';
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyFromPayload(relativePath) {
  const source = path.join(payloadDir, relativePath);
  const destination = target(relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Falta payload: ${source}`);
  }

  backup(relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

const serverRelative = 'src/server/gc-analytics-routes.ts';
const pageRelative = 'src/pages/admin/visitas.astro';
const accountPageRelative = 'src/pages/admin/visitas/cuentas.astro';
const indexRelative = 'src/server/index.ts';
const envRelative = '.env.example';

for (const relativePath of [serverRelative, pageRelative, indexRelative, envRelative]) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}. Aplica primero las fases 3A, 3B y 3C.`);
  }
}

const currentServer = fs.readFileSync(target(serverRelative), 'utf8');
const currentPage = fs.readFileSync(target(pageRelative), 'utf8');

if (!currentServer.includes('GC_ANALYTICS_DISTINCT_USERS_V3')
  || !currentPage.includes('GC_ANALYTICS_DISTINCT_USERS_V3')) {
  throw new Error('La Fase 3C de usuarios distintos no está aplicada.');
}

const alreadyApplied = currentServer.includes(marker)
  && currentPage.includes(marker)
  && fs.existsSync(target(accountPageRelative))
  && fs.readFileSync(target(accountPageRelative), 'utf8').includes(marker);

if (!alreadyApplied) {
  copyFromPayload(serverRelative);
  copyFromPayload(pageRelative);
  copyFromPayload(accountPageRelative);
} else {
  console.log('[GC Phase 3D] Uso de cuentas e histórico permanente ya aplicados.');
}

const indexOriginal = fs.readFileSync(target(indexRelative), 'utf8');
const indexNext = replaceRequired(
  indexOriginal,
  `registerGcAnalyticsRoutes(app, { rootDir, requireAdmin, getAuthContext: getAuthContextAsync });`,
  `registerGcAnalyticsRoutes(app, { rootDir, requireAdmin, getAuthContext: getAuthContextAsync, getUserStore: readUserStoreAsync });`,
  'el registro de analítica de la Fase 3C',
);

if (indexNext !== indexOriginal) {
  backup(indexRelative);
  fs.writeFileSync(target(indexRelative), indexNext, 'utf8');
  changed.push(indexRelative);
}

let envText = fs.readFileSync(target(envRelative), 'utf8');
if (!envText.includes('GC_ANALYTICS_RAW_RETENTION_DAYS=')) {
  const anchor = 'GC_ANALYTICS_RETENTION_DAYS=90';
  if (!envText.includes(anchor)) {
    throw new Error('No se encontró GC_ANALYTICS_RETENTION_DAYS en .env.example.');
  }

  backup(envRelative);
  envText = envText.replace(
    anchor,
    `${anchor}
# Solo afecta al detalle técnico. Los agregados históricos no caducan.
GC_ANALYTICS_RAW_RETENTION_DAYS=90`,
  );
  fs.writeFileSync(target(envRelative), envText, 'utf8');
  changed.push(envRelative);
}

if (fs.existsSync(payloadDir)) {
  fs.rmSync(payloadDir, { recursive: true, force: true });
}

console.log('');
console.log('[GC Phase 3D] Uso de cuentas e histórico permanente aplicados.');
console.log(`[GC Phase 3D] Backup: ${backupDir}`);
console.log(`[GC Phase 3D] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('Nuevas rutas:');
console.log('- /admin/visitas/cuentas');
console.log('- /api/admin/analytics/accounts');
console.log('- /api/admin/analytics/accounts/:userId');
console.log('');
console.log('Conservación:');
console.log('- Agregados y uso de cuentas: permanente');
console.log('- Pageviews técnicos: GC_ANALYTICS_RAW_RETENTION_DAYS=90');
console.log('');
console.log('Siguiente: npm run deps:baseline && npm run quality');
