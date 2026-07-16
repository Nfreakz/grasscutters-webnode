import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(scriptDir, 'phase3c-distinct-users-payload');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase3c-distinct-users-${stamp}`);
const marker = 'GC_ANALYTICS_DISTINCT_USERS_V3';
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

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

const serverRelative = 'src/server/gc-analytics-routes.ts';
const pageRelative = 'src/pages/admin/visitas.astro';
const indexRelative = 'src/server/index.ts';

for (const relativePath of [serverRelative, pageRelative, indexRelative]) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}. Aplica primero las fases 3A y 3B.`);
  }
}

const currentServer = fs.readFileSync(target(serverRelative), 'utf8');
const currentPage = fs.readFileSync(target(pageRelative), 'utf8');

if (!currentServer.includes('GC_ANALYTICS_RELIABILITY_V2')
  || !currentPage.includes('GC_ANALYTICS_RELIABILITY_V2')) {
  throw new Error('La Fase 3B de fiabilidad no está aplicada.');
}

const alreadyApplied = currentServer.includes(marker) && currentPage.includes(marker);

if (!alreadyApplied) {
  replaceFromPayload(serverRelative);
  replaceFromPayload(pageRelative);
} else {
  console.log('[GC Phase 3C] Métricas de usuarios distintos ya aplicadas.');
}

const indexOriginal = fs.readFileSync(target(indexRelative), 'utf8');
const indexNext = replaceRequired(
  indexOriginal,
  `registerGcAnalyticsRoutes(app, { rootDir, requireAdmin });`,
  `registerGcAnalyticsRoutes(app, { rootDir, requireAdmin, getAuthContext: getAuthContextAsync });`,
  'el registro de rutas de analítica en src/server/index.ts',
);

if (indexNext !== indexOriginal) {
  backup(indexRelative);
  fs.writeFileSync(target(indexRelative), indexNext, 'utf8');
  changed.push(indexRelative);
}

if (fs.existsSync(payloadDir)) {
  fs.rmSync(payloadDir, { recursive: true, force: true });
}

console.log('');
console.log('[GC Phase 3C] Usuarios distintos añadidos.');
console.log(`[GC Phase 3C] Backup: ${backupDir}`);
console.log(`[GC Phase 3C] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('Nuevas métricas:');
console.log('- Visitantes únicos estimados del periodo');
console.log('- Usuarios registrados distintos del periodo');
console.log('');
console.log('Siguiente: npm run deps:baseline && npm run quality');
