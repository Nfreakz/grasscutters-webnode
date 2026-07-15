import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(scriptDir, 'phase3b-analytics-payload');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase3b-analytics-reliability-${stamp}`);
const marker = 'GC_ANALYTICS_RELIABILITY_V2';
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

function replaceFromPayload(relativePath) {
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

const serverRelative = 'src/server/gc-analytics-routes.ts';
const pageRelative = 'src/pages/admin/visitas.astro';
const envRelative = '.env.example';

for (const relativePath of [serverRelative, pageRelative, envRelative]) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}. Aplica primero la Fase 3A.`);
  }
}

const currentServer = fs.readFileSync(target(serverRelative), 'utf8');
const currentPage = fs.readFileSync(target(pageRelative), 'utf8');
const alreadyApplied = currentServer.includes(marker) && currentPage.includes(marker);

if (!alreadyApplied) {
  if (!currentServer.includes('registerGcAnalyticsRoutes') || !currentServer.includes('GC_ANALYTICS_HASH_SECRET')) {
    throw new Error('gc-analytics-routes.ts no coincide con la Fase 3A esperada.');
  }
  if (!currentPage.includes('Visitas a la web') || !currentPage.includes('analyticsState')) {
    throw new Error('admin/visitas.astro no coincide con la Fase 3A esperada.');
  }

  replaceFromPayload(serverRelative);
  replaceFromPayload(pageRelative);
} else {
  console.log('[GC Phase 3B] Código de fiabilidad ya aplicado.');
}

let envText = fs.readFileSync(target(envRelative), 'utf8');
if (!envText.includes('GC_ANALYTICS_DEDUP_SECONDS=')) {
  const anchor = 'GC_ANALYTICS_ACTIVE_MINUTES=5';
  if (!envText.includes(anchor)) {
    throw new Error('No se encontró GC_ANALYTICS_ACTIVE_MINUTES en .env.example.');
  }
  backup(envRelative);
  envText = envText.replace(
    anchor,
    `${anchor}\nGC_ANALYTICS_DEDUP_SECONDS=15`,
  );
  fs.writeFileSync(target(envRelative), envText, 'utf8');
  changed.push(envRelative);
}

if (fs.existsSync(payloadDir)) {
  fs.rmSync(payloadDir, { recursive: true, force: true });
}

console.log('');
console.log('[GC Phase 3B] Fiabilidad de estadísticas aplicada.');
console.log(`[GC Phase 3B] Backup: ${backupDir}`);
console.log(`[GC Phase 3B] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('Comprueba en .env/Hostinger:');
console.log('GC_ANALYTICS_ENABLED=true');
console.log('GC_ANALYTICS_HASH_SECRET=<mínimo-32-caracteres>');
console.log('GC_ANALYTICS_DEDUP_SECONDS=15');
console.log('');
console.log('Siguiente: npm run deps:baseline && npm run quality');
