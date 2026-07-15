import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase3a-admin-analytics-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function patch(relativePath, transform) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);

  const original = fs.readFileSync(filePath, 'utf8');
  const next = transform(original);

  if (next === original) {
    console.log(`[GC Phase 3A] Sin cambios: ${relativePath}`);
    return;
  }

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

for (const requiredFile of [
  'src/server/gc-analytics-routes.ts',
  'src/pages/admin/visitas.astro',
]) {
  if (!fs.existsSync(target(requiredFile))) {
    throw new Error(`Falta ${requiredFile}. Copia completa la carpeta changed-files sobre la raíz del repositorio.`);
  }
}

patch('src/server/index.ts', (original) => {
  let next = original;

  next = replaceRequired(
    next,
    `import { registerGcPlatformHardening } from './gc-platform-hardening';`,
    `import { registerGcPlatformHardening } from './gc-platform-hardening';
import { registerGcAnalyticsRoutes } from './gc-analytics-routes';`,
    'el import de gc-platform-hardening',
  );

  next = replaceRequired(
    next,
    `if (!fs.existsSync(distDir)) {
  console.warn(\`[GC] No existe \${distDir}. Ejecuta npm run build antes de npm start.\`);
}`,
    `registerGcAnalyticsRoutes(app, { rootDir, requireAdmin });

if (!fs.existsSync(distDir)) {
  console.warn(\`[GC] No existe \${distDir}. Ejecuta npm run build antes de npm start.\`);
}`,
    'el montaje anterior a express.static',
  );

  return next;
});

patch('src/components/AdminSubnav.astro', (original) => replaceRequired(
  original,
  `{ href: '/admin/ratings', label: 'Ratings', desc: 'Carreras sTracker' },
      { href: '/admin/historial', label: 'Historial', desc: 'Auditoría' },`,
  `{ href: '/admin/ratings', label: 'Ratings', desc: 'Carreras sTracker' },
      { href: '/admin/visitas', label: 'Visitas', desc: 'Tráfico y páginas' },
      { href: '/admin/historial', label: 'Historial', desc: 'Auditoría' },`,
  'la sección Herramientas de AdminSubnav',
));

patch('src/pages/admin.astro', (original) => replaceRequired(
  original,
  `{ href: '/admin/ratings', title: 'Ratings', desc: 'Carreras sTracker pendientes, procesadas y SR/GSR global.', tag: 'SR/GSR' },
      { href: '/admin/historial', title: 'Historial', desc: 'Auditoría de acciones sensibles.', tag: 'Log' },`,
  `{ href: '/admin/ratings', title: 'Ratings', desc: 'Carreras sTracker pendientes, procesadas y SR/GSR global.', tag: 'SR/GSR' },
      { href: '/admin/visitas', title: 'Visitas', desc: 'Tráfico web agregado, páginas, procedencia y dispositivos.', tag: 'Analytics' },
      { href: '/admin/historial', title: 'Historial', desc: 'Auditoría de acciones sensibles.', tag: 'Log' },`,
  'la lista de módulos del panel admin',
));

patch('.env.example', (original) => replaceRequired(
  original,
  `GC_HTTP_LOG_SLOW_MS=500
GC_COOP_ENABLED=false`,
  `GC_HTTP_LOG_SLOW_MS=500

# Analítica propia sin cookies
GC_ANALYTICS_ENABLED=false
GC_ANALYTICS_RETENTION_DAYS=90
GC_ANALYTICS_ACTIVE_MINUTES=5
GC_ANALYTICS_TIME_ZONE=Europe/Madrid
GC_ANALYTICS_HASH_SECRET=
GC_ANALYTICS_FILE_PATH=./data/app/analytics-pageviews.ndjson

GC_COOP_ENABLED=false`,
  'la sección de seguridad de .env.example',
));

patch('.gitignore', (original) => {
  if (original.includes('/data/app/analytics-pageviews.ndjson')) return original;
  return replaceRequired(
    original,
    `/data/app/*.tmp
`,
    `/data/app/*.tmp
/data/app/analytics-pageviews.ndjson
`,
    'el bloque data/app de .gitignore',
  );
});

console.log('');
console.log('[GC Phase 3A] Analítica propia instalada.');
console.log(`[GC Phase 3A] Backup: ${backupDir}`);
console.log(`[GC Phase 3A] Modificados: ${changed.join(', ')}`);
console.log('[GC Phase 3A] Nuevos: src/server/gc-analytics-routes.ts, src/pages/admin/visitas.astro');
console.log('');
console.log('Activa en .env/Hostinger:');
console.log('GC_ANALYTICS_ENABLED=true');
console.log('GC_ANALYTICS_HASH_SECRET=<secreto-largo>');
console.log('');
console.log('Siguiente: npm run deps:baseline && npm run quality');
