import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const relative = 'src/server/gc-ratings/routes.ts';
const absolute = path.join(root, relative);
const marker = 'GC_PHASE4H2_8_IDENTITY_PREVIEW_JSON_BODY_FIX_V1';

function replaceExact(source, before, after, expectedCount = 1) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `Parche incompatible: se esperaban ${expectedCount} coincidencias de ${JSON.stringify(before)} y se encontraron ${count}.`
    );
  }
  return parts.join(after);
}

if (!fs.existsSync(absolute)) {
  throw new Error(`Falta el archivo requerido: ${relative}`);
}

const original = fs.readFileSync(absolute, 'utf8');
if (original.includes(marker)) {
  console.log('[GC Phase 4H.2.8] Ya estaba instalada; no se ha modificado nada.');
  process.exit(0);
}

if (!original.includes("app.post('/api/gc/ratings/identity-preview'")) {
  throw new Error('Instala primero Phase 4H.2. El endpoint de preview no existe.');
}

let next = original;
next = replaceExact(
  next,
  "import type { Express, Request } from 'express';",
  "import express, { type Express, type Request } from 'express';"
);
next = replaceExact(
  next,
  "  const cronSecret = String(process.env.GC_RATINGS_CRON_SECRET || '').trim();",
  `  const cronSecret = String(process.env.GC_RATINGS_CRON_SECRET || '').trim();

  // ${marker}
  // Esta ruta se registra antes que los parsers JSON globales de src/server/index.ts.
  const gcIdentityPreviewJsonBodyV1 = express.json({ limit: '256kb', strict: true });`
);
next = replaceExact(
  next,
  "  app.post('/api/gc/ratings/identity-preview', async (req, res) => {",
  "  app.post('/api/gc/ratings/identity-preview', gcIdentityPreviewJsonBodyV1, async (req, res) => {"
);

if (!next.includes(marker)) {
  throw new Error('No se pudo verificar el marcador de instalación.');
}
if (!next.includes("app.post('/api/gc/ratings/identity-preview', gcIdentityPreviewJsonBodyV1,")) {
  throw new Error('No se pudo verificar el parser específico del preview.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(root, '_gc_backups', `phase4h2-8-identity-preview-json-body-${stamp}`);
const backup = path.join(backupRoot, relative);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(absolute, backup);

const temporary = `${absolute}.gc-phase4h2-8.tmp`;
fs.writeFileSync(temporary, next);
fs.renameSync(temporary, absolute);

console.log('[GC Phase 4H.2.8] Parser JSON específico del preview instalado.');
console.log(`[GC Phase 4H.2.8] Backup: ${path.relative(root, backupRoot)}`);
console.log(`  - ${relative}`);
console.log('No se ha ejecutado SQL ni se ha escrito en MySQL.');
console.log('Siguiente: npm run quality && npm run build');
