import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4H2_1_IDENTITY_REVIEW_UX_V1';
const prerequisite = 'GC_PHASE4H2_IDENTITY_PREVIEW_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const pagePath = 'src/pages/admin/integridad-ratings/identidades/preview.astro';
const payloadDir = path.join(root, 'scripts', 'phase4h2-1-identity-review-ux-payload');
const payloadPath = path.join(payloadDir, 'preview.astro.txt');
const targetPath = path.join(root, pagePath);
const backupDir = path.join(root, '_gc_backups', `phase4h2-1-identity-review-ux-${stamp}`);

if (!fs.existsSync(targetPath)) {
  throw new Error('No existe la pantalla de preview. Instala primero Phase 4H.2.');
}

const current = fs.readFileSync(targetPath, 'utf8');
if (!current.includes(prerequisite)) {
  throw new Error('La pantalla no corresponde a Phase 4H.2. No se ha modificado ningún archivo.');
}

if (current.includes(marker)) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4H.2.1] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

if (!fs.existsSync(payloadPath)) {
  throw new Error(`Falta payload ${path.relative(root, payloadPath)}`);
}

const next = fs.readFileSync(payloadPath, 'utf8');
if (!next.includes(prerequisite) || !next.includes(marker)) {
  throw new Error('El payload de la interfaz no es válido. No se ha modificado ningún archivo.');
}

const backupPath = path.join(backupDir, pagePath);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, next, 'utf8');
fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4H.2.1] Interfaz de revisión humana instalada.');
console.log(`[GC Phase 4H.2.1] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Phase 4H.2.1] Modificado: ${pagePath}`);
console.log('No se ha modificado el backend, las rutas ni MySQL.');
console.log('Siguiente: npm run quality && npm run build');
