import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, '_gc_backups', `phase5a1-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const files = {
  ratingStore: path.join(ROOT, 'src/server/gc-ratings/ratingStore.ts'),
  routes: path.join(ROOT, 'src/server/gc-ratings/routes.ts')
};

function fail(message) {
  console.error(`[GC Phase 5A.1] ERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`No existe el archivo esperado: ${path.relative(ROOT, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function backup(file, content) {
  const relative = path.relative(ROOT, file);
  const target = path.join(BACKUP_DIR, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function writeChanged(file, before, after) {
  if (before === after) {
    console.log(`[GC Phase 5A.1] Sin cambios: ${path.relative(ROOT, file)}`);
    return false;
  }
  backup(file, before);
  fs.writeFileSync(file, after, 'utf8');
  console.log(`[GC Phase 5A.1] Actualizado: ${path.relative(ROOT, file)}`);
  return true;
}

function replaceExactly(content, search, replacement, expectedCount, label) {
  const parts = content.split(search);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    fail(`${label}: se esperaban ${expectedCount} coincidencias y se encontraron ${count}. No se ha modificado ningún archivo de este paso.`);
  }
  return parts.join(replacement);
}

// 1) Forzar el contrato común del store.
// Esto hace que RatingService vea correctamente el método opcional
// ensureSourceIsolationConstraints() tanto para MySQL como para JSON.
{
  const before = read(files.ratingStore);
  let after = before;

  const importNeedle =
    "import type { DriverRatingState, RatingEventResult, RatingsSnapshot, RecalculationLog } from './types';";
  if (!after.includes(importNeedle)) {
    fail('ratingStore.ts no contiene el import esperado.');
  }

  const signature = 'export function createRatingStore() {';
  const typedSignature = 'export function createRatingStore(): RatingStore {';

  if (after.includes(signature)) {
    after = replaceExactly(after, signature, typedSignature, 1, 'Firma createRatingStore');
  } else if (!after.includes(typedSignature)) {
    fail('No se ha encontrado una firma compatible de createRatingStore().');
  }

  writeChanged(files.ratingStore, before, after);
}

// 2) Estabilizar la unión de retorno de processNewEventsAllSourcesV1.
// Las dos rutas sólo leen el payload operativo normal; el cast local evita que
// TypeScript mezcle el plan dry-run/aplicación con el resultado incremental.
{
  const before = read(files.routes);
  let after = before;

  const search = `const payload = processGlobally
        ? await service.processNewEventsAllSourcesV1({ trustedAutomation: true })
        : await service.processNewEvents({ source: requestedSource });`;

  const replacement = `const payload: any = processGlobally
        ? await service.processNewEventsAllSourcesV1({ trustedAutomation: true })
        : await service.processNewEvents({ source: requestedSource });`;

  if (after.includes(search)) {
    after = replaceExactly(after, search, replacement, 2, 'Payload global de routes.ts');
  } else {
    const already = after.split(replacement).length - 1;
    if (already !== 2) {
      fail(`routes.ts no coincide con el estado esperado: casts existentes=${already}.`);
    }
  }

  writeChanged(files.routes, before, after);
}

console.log('');
console.log('[GC Phase 5A.1] Aplicación completada.');
console.log(`[GC Phase 5A.1] Backups: ${path.relative(ROOT, BACKUP_DIR)}`);
console.log('[GC Phase 5A.1] Ejecuta ahora: npm run check');
