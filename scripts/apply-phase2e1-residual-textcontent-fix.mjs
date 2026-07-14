import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2e1-textcontent-${stamp}`);
const changed = [];

function patch(relativePath, replacements) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) throw new Error(`No existe ${relativePath}`);

  const original = fs.readFileSync(target, 'utf8');
  let next = original;

  for (const [from, to, label] of replacements) {
    if (next.includes(to)) continue;
    if (!next.includes(from)) throw new Error(`No se encontró ${label} en ${relativePath}`);
    next = next.replace(from, to);
  }

  if (next === original) {
    console.log(`[GC Phase 2E.1] Sin cambios: ${relativePath}`);
    return;
  }

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.writeFileSync(target, next, 'utf8');
  changed.push(relativePath);
}

patch('src/pages/live-test.astro', [
  [
    `if (el) el.textContent = value ?? '--';`,
    `if (el) el.textContent = String(value ?? '--');`,
    'conversión segura de textContent'
  ]
]);

patch('src/pages/recuperar-password.astro', [
  [
    `message.textContent = text || '';`,
    `message.textContent = String(text || '');`,
    'conversión segura del mensaje'
  ]
]);

console.log('');
console.log('[GC Phase 2E.1] Residuos textContent corregidos.');
console.log(`[GC Phase 2E.1] Backup: ${backupDir}`);
console.log(`[GC Phase 2E.1] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2E.1] Siguiente: npm run deps:baseline && npm run quality');
