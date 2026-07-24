import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'cleanup');
fs.mkdirSync(reportsDir, { recursive: true });

const ignored = new Set([
  'node_modules',
  '.git',
  'dist',
  '.astro'
]);

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');

    if (entry.isDirectory()) {
      if (ignored.has(entry.name)) continue;
      walk(full, out);
      continue;
    }

    let stat = null;
    try {
      stat = fs.statSync(full);
    } catch {}

    out.push({
      path: rel,
      name: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      size: stat?.size ?? null,
      modifiedAt: stat?.mtime?.toISOString?.() ?? null
    });
  }

  return out;
}

const files = walk(root);

const categories = {
  installers: [],
  phaseScripts: [],
  backups: [],
  reports: [],
  temporary: [],
  logs: [],
  archives: [],
  duplicateNameCandidates: []
};

const installerPattern = /(^|\/)(APLICAR|EJECUTAR|FINALIZAR|INSTALAR|RUN|START)[^/]*\.(cmd|bat|ps1|sh)$/i;
const phaseScriptPattern = /(^|\/)scripts\/.*phase[0-9a-z._-]*\.(mjs|js|cjs|ts)$/i;
const backupPattern = /(^|\/)(_gc_backups|backups?|backup)(\/|$)/i;
const reportsPattern = /(^|\/)(_gc_reports|reports?|report)(\/|$)/i;
const tempPattern = /(^|\/)(tmp|temp|temporary|_tmp|_temp)(\/|$)|\.(tmp|temp|bak|old|orig|rej)$/i;
const logPattern = /\.(log|out|err)$/i;
const archivePattern = /\.(zip|7z|rar|tar|gz)$/i;

for (const file of files) {
  if (installerPattern.test(file.path)) categories.installers.push(file);
  if (phaseScriptPattern.test(file.path)) categories.phaseScripts.push(file);
  if (backupPattern.test(file.path)) categories.backups.push(file);
  if (reportsPattern.test(file.path)) categories.reports.push(file);
  if (tempPattern.test(file.path)) categories.temporary.push(file);
  if (logPattern.test(file.path)) categories.logs.push(file);
  if (archivePattern.test(file.path)) categories.archives.push(file);
}

const byName = new Map();
for (const file of files) {
  const key = file.name.toLowerCase();
  const arr = byName.get(key) || [];
  arr.push(file);
  byName.set(key, arr);
}
for (const [name, items] of byName) {
  if (items.length > 1) {
    categories.duplicateNameCandidates.push({
      name,
      count: items.length,
      paths: items.map((item) => item.path)
    });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5C.1',
  readOnly: true,
  scannedFiles: files.length,
  counts: Object.fromEntries(
    Object.entries(categories).map(([key, value]) => [key, value.length])
  ),
  cleanupPolicy: {
    automaticDeletionPerformed: false,
    filesMoved: false,
    sourceFilesModified: false
  },
  nextStep: 'Review candidates and classify each as keep, archive, regenerate or delete.'
};

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-inventory.json'),
  JSON.stringify({ summary, categories }, null, 2) + '\n',
  'utf8'
);

const md = [
  '# GC Phase 5C.1 — Cleanup Inventory',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  '## Summary',
  '',
  `- Scanned files: ${summary.scannedFiles}`,
  `- Installers: ${summary.counts.installers}`,
  `- Phase scripts: ${summary.counts.phaseScripts}`,
  `- Backup files: ${summary.counts.backups}`,
  `- Reports: ${summary.counts.reports}`,
  `- Temporary candidates: ${summary.counts.temporary}`,
  `- Logs: ${summary.counts.logs}`,
  `- Archives: ${summary.counts.archives}`,
  `- Duplicate-name candidates: ${summary.counts.duplicateNameCandidates}`,
  '',
  'No files were deleted, moved or modified.',
  '',
  '## Recommended classification',
  '',
  '- KEEP: current runtime, build and deployment scripts.',
  '- ARCHIVE: completed phase installers and historical reports.',
  '- REGENERATE: derived reports that can be reproduced.',
  '- DELETE CANDIDATE: obsolete backups, temporary files and superseded packs.',
  ''
].join('\n');

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-inventory.md'),
  md,
  'utf8'
);

console.log('[GC Phase 5C.1] Inventario completado.');
console.log(`[GC Phase 5C.1] Archivos analizados: ${summary.scannedFiles}`);
console.log('[GC Phase 5C.1] No se ha borrado, movido ni modificado ningún archivo.');
console.log('[GC Phase 5C.1] Informes:');
console.log('  _gc_reports/cleanup/cleanup-inventory.json');
console.log('  _gc_reports/cleanup/cleanup-inventory.md');
