import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const prerequisite = 'GC_PHASE4H2_1_IDENTITY_REVIEW_UX_V1';
const marker = 'GC_PHASE4H2_2_IDENTITY_REVIEW_STYLE_HOTFIX_V1';
const pagePath = 'src/pages/admin/integridad-ratings/identidades/preview.astro';
const targetPath = path.join(root, pagePath);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4h2-2-identity-review-style-hotfix-${stamp}`);

if (!fs.existsSync(targetPath)) {
  throw new Error('No existe la pantalla de preview. Instala primero Phase 4H.2.1.');
}

const current = fs.readFileSync(targetPath, 'utf8');
if (!current.includes(prerequisite)) {
  throw new Error('La pantalla no corresponde a Phase 4H.2.1. No se ha modificado ningún archivo.');
}

if (current.includes(marker)) {
  console.log(`[GC Phase 4H.2.2] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

const scopedStyle = '  <style>\n    .gc-id-preview';
const globalStyle = '  <style is:global>\n    .gc-id-preview';
if (!current.includes(scopedStyle)) {
  throw new Error('No se ha encontrado el bloque de estilos esperado. No se ha modificado ningún archivo.');
}

const markerAnchor = '<!-- GC_PHASE4H2_1_IDENTITY_REVIEW_UX_V1 -->';
const next = current
  .replace(markerAnchor, `${markerAnchor}\n<!-- ${marker} -->`)
  .replace(scopedStyle, globalStyle);

if (!next.includes(marker) || !next.includes('<style is:global>')) {
  throw new Error('No se pudo construir el hotfix de estilos. No se ha modificado ningún archivo.');
}

const backupPath = path.join(backupDir, pagePath);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, next, 'utf8');

console.log('');
console.log('[GC Phase 4H.2.2] Hotfix visual instalado.');
console.log(`[GC Phase 4H.2.2] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Phase 4H.2.2] Modificado: ${pagePath}`);
console.log('Las tarjetas dinámicas ya usan estilos globales limitados a clases gc-id-*.');
console.log('No se ha modificado el backend, las decisiones ni MySQL.');
console.log('Siguiente: npm run quality && npm run build');
