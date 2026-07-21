import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4B_INTEGRITY_APPLY_REQUEST_HOTFIX_V1';
const files = {
  page: 'src/pages/admin/integridad-ratings.astro',
  routes: 'src/server/gc-ratings/routes.ts',
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4b-integrity-request-hotfix-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function backup(relativePath) {
  const source = target(relativePath);
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function save(relativePath, original, next) {
  if (next === original) return;
  backup(relativePath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

// Página: no depender únicamente de req.body y rechazar una falsa simulación.
{
  const relativePath = files.page;
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4B request hotfix] ${relativePath} ya estaba corregido.`);
  } else {
    let next = original;

    next = replaceRequired(
      next,
      `          previewPayload = await fetchJson('/api/gc/ratings/integrity-rebuild', {
            method: 'POST',
            body: JSON.stringify({ dryRun: true })
          });`,
      `          // ${marker}
          previewPayload = await fetchJson('/api/gc/ratings/integrity-rebuild?dryRun=1', {
            method: 'POST',
            body: JSON.stringify({ dryRun: true })
          });`,
      'la llamada de simulación'
    );

    next = replaceRequired(
      next,
      `          const result = await fetchJson('/api/gc/ratings/integrity-rebuild', {
            method: 'POST',
            body: JSON.stringify({ dryRun: false, confirmation: phrase })
          });
          els.output.textContent = JSON.stringify(result, null, 2);
          els.message.textContent = \`${'${result.message}'} Backup: ${'${result.backupFile || \'no indicado\'}'}\`;
          previewPayload = null;
          els.confirmation.value = '';
          els.confirmation.disabled = true;
          await loadDiagnostics();`,
      `          const applyUrl = \`/api/gc/ratings/integrity-rebuild?dryRun=0&confirmation=\${encodeURIComponent(phrase)}\`;
          const result = await fetchJson(applyUrl, {
            method: 'POST',
            body: JSON.stringify({ dryRun: false, confirmation: phrase })
          });

          if (result.applied !== true || result.dryRun !== false) {
            throw new Error(
              'El servidor devolvió otra simulación y no aplicó cambios. No se ha modificado MySQL.'
            );
          }

          els.output.textContent = JSON.stringify(result, null, 2);
          els.message.textContent = \`${'${result.message}'} Backup: ${'${result.backupFile || \'no indicado\'}'}\`;
          previewPayload = null;
          els.confirmation.value = '';
          els.confirmation.disabled = true;
          await loadDiagnostics();`,
      'la llamada de aplicación'
    );

    save(relativePath, original, next);
  }
}

// Backend: priorizar parámetros de query para que dryRun=0 llegue aunque el body no se haya parseado.
{
  const relativePath = files.routes;
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4B request hotfix] ${relativePath} ya estaba corregido.`);
  } else {
    const oldBlock = `      const dryRun = parseBooleanish(req.body?.dryRun ?? req.query.dryRun, true) !== false;
      const confirmation = String(req.body?.confirmation || req.query.confirmation || '').trim();
      const payload = await service.rebuildCanonicalRatingsIntegrityV1({ dryRun, confirmation });`;

    const newBlock = `      // ${marker}
      // Query tiene prioridad: algunos despliegues no entregan req.body JSON en esta ruta.
      const dryRunRaw = req.query.dryRun ?? req.body?.dryRun;
      const confirmationRaw = req.query.confirmation ?? req.body?.confirmation;
      const dryRun = parseBooleanish(dryRunRaw, true) !== false;
      const confirmation = String(confirmationRaw || '').trim();
      const payload = await service.rebuildCanonicalRatingsIntegrityV1({ dryRun, confirmation });`;

    const next = replaceRequired(original, oldBlock, newBlock, 'la lectura dryRun/confirmation');
    save(relativePath, original, next);
  }
}

console.log('');
console.log('[GC Phase 4B request hotfix] Solicitud real de reconstrucción corregida.');
console.log(`[GC Phase 4B request hotfix] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Phase 4B request hotfix] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('Este instalador no modifica MySQL ni ejecuta la reconstrucción.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
