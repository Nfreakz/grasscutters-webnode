import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'cleanup');
fs.mkdirSync(reportsDir, { recursive: true });

const ignoredDirs = new Set(['node_modules', '.git', 'dist', '.astro', '_gc_backups']);
const textExtensions = new Set([
  '.json', '.md', '.txt', '.mjs', '.js', '.cjs', '.ts', '.tsx',
  '.astro', '.cmd', '.bat', '.ps1', '.sh', '.yml', '.yaml'
]);

function walk(dir, options = {}, out = []) {
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
      if (options.ignore && options.ignore.has(entry.name)) continue;
      walk(full, options, out);
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    out.push({
      full,
      path: rel,
      name: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }
  return out;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

const allFiles = walk(root, { ignore: new Set(['node_modules', '.git', 'dist', '.astro']) });
const searchableFiles = walk(root, { ignore: ignoredDirs })
  .filter((file) => textExtensions.has(file.extension) && file.size <= 5 * 1024 * 1024);

const phaseScripts = allFiles.filter((file) =>
  /^scripts\/.*(?:phase|hardening).*\.mjs$/i.test(file.path)
);

const packageJsonPath = path.join(root, 'package.json');
let packageJson = {};
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch {}

const npmScripts = packageJson.scripts || {};
const npmScriptText = Object.values(npmScripts).join('\n');

const textCache = new Map();
for (const file of searchableFiles) {
  try {
    textCache.set(file.path, fs.readFileSync(file.full, 'utf8'));
  } catch {}
}

const classifiedScripts = phaseScripts.map((file) => {
  const references = [];

  for (const [rel, text] of textCache) {
    if (rel === file.path) continue;
    if (text.includes(file.name) || text.includes(file.path)) {
      references.push(rel);
    }
  }

  const referencedByNpm = npmScriptText.includes(file.name) || npmScriptText.includes(file.path);
  const currentPhase = /phase5c/i.test(file.name);
  const completedHistorical = /(?:phase[1-4]|phase5a|phase5b|hardening)/i.test(file.name);
  const knownBrokenOrSuperseded =
    /phase5b1-dependency-inventory\.mjs$/i.test(file.name) ||
    /apply-phase5a2\.mjs$/i.test(file.name) ||
    /apply-phase5a3\.mjs$/i.test(file.name) ||
    /apply-phase5a4\.mjs$/i.test(file.name);

  let classification = 'REVIEW';
  let reason = 'Requires manual review.';

  if (currentPhase) {
    classification = 'KEEP';
    reason = 'Current cleanup phase tooling.';
  } else if (referencedByNpm) {
    classification = 'KEEP';
    reason = 'Referenced by package.json scripts.';
  } else if (references.length > 0) {
    classification = 'KEEP_REFERENCE';
    reason = 'Referenced by another project file.';
  } else if (knownBrokenOrSuperseded) {
    classification = 'ARCHIVE_PRIORITY';
    reason = 'Superseded or previously failed phase script with no active references.';
  } else if (completedHistorical) {
    classification = 'ARCHIVE_CANDIDATE';
    reason = 'Completed historical phase script with no active references.';
  }

  return {
    path: file.path,
    size: file.size,
    modifiedAt: file.modifiedAt,
    sha256: sha256(file.full),
    classification,
    reason,
    referencedByPackageJson: referencedByNpm,
    references
  };
});

const backupFiles = allFiles.filter((file) => file.path.startsWith('_gc_backups/'));
const backupGroups = new Map();
for (const file of backupFiles) {
  const parts = file.path.split('/');
  const group = parts.slice(0, 2).join('/');
  const item = backupGroups.get(group) || {
    path: group,
    files: 0,
    bytes: 0,
    newestModifiedAt: null
  };
  item.files += 1;
  item.bytes += file.size;
  if (!item.newestModifiedAt || file.modifiedAt > item.newestModifiedAt) {
    item.newestModifiedAt = file.modifiedAt;
  }
  backupGroups.set(group, item);
}

const reportFiles = allFiles.filter((file) =>
  file.path.startsWith('_gc_reports/') || file.path.startsWith('reports/')
);

const reportClassification = reportFiles.map((file) => {
  const finalEvidence =
    /phase5b6|project-audit|cleanup|dependency-baseline|acsm-discovery|visual-report/i.test(file.path);
  const reproducible =
    /astro-check|assets-inventory|dev-audit|public-audit-local/i.test(file.path);

  return {
    path: file.path,
    size: file.size,
    modifiedAt: file.modifiedAt,
    classification: finalEvidence ? 'KEEP' : reproducible ? 'REGENERATE_CANDIDATE' : 'REVIEW',
    reason: finalEvidence
      ? 'Final evidence, current audit, or unique historical artifact.'
      : reproducible
        ? 'Derived output that can normally be regenerated.'
        : 'Manual review required.'
  };
});

const duplicateGroups = new Map();
for (const file of allFiles) {
  if (file.size === 0 || file.size > 10 * 1024 * 1024) continue;
  const key = `${file.size}:${sha256(file.full)}`;
  const group = duplicateGroups.get(key) || [];
  group.push(file.path);
  duplicateGroups.set(key, group);
}

const exactDuplicates = [...duplicateGroups.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([key, paths]) => ({
    sha256: key.split(':').slice(1).join(':'),
    size: Number(key.split(':')[0]),
    count: paths.length,
    paths
  }))
  .sort((a, b) => b.size - a.size);

const counts = classifiedScripts.reduce((acc, item) => {
  acc[item.classification] = (acc[item.classification] || 0) + 1;
  return acc;
}, {});

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5C.2',
  readOnly: true,
  npmScriptsCount: Object.keys(npmScripts).length,
  phaseScriptsAnalyzed: classifiedScripts.length,
  scriptClassifications: counts,
  backupGroups: backupGroups.size,
  backupFiles: backupFiles.length,
  backupBytes: backupFiles.reduce((sum, item) => sum + item.size, 0),
  reportsAnalyzed: reportClassification.length,
  exactDuplicateGroups: exactDuplicates.length,
  automaticDeletionPerformed: false,
  filesMoved: false,
  sourceFilesModified: false,
  nextStep: 'Create a guarded archive plan using only unreferenced ARCHIVE_CANDIDATE and ARCHIVE_PRIORITY items.'
};

const result = {
  summary,
  npmScripts,
  scripts: classifiedScripts,
  backupGroups: [...backupGroups.values()].sort((a, b) => a.path.localeCompare(b.path)),
  reports: reportClassification,
  exactDuplicates
};

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-classification.json'),
  JSON.stringify(result, null, 2) + '\n',
  'utf8'
);

const md = [
  '# GC Phase 5C.2 — Cleanup Classification',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  '## Summary',
  '',
  `- npm scripts: ${summary.npmScriptsCount}`,
  `- phase scripts analyzed: ${summary.phaseScriptsAnalyzed}`,
  `- KEEP: ${counts.KEEP || 0}`,
  `- KEEP_REFERENCE: ${counts.KEEP_REFERENCE || 0}`,
  `- ARCHIVE_PRIORITY: ${counts.ARCHIVE_PRIORITY || 0}`,
  `- ARCHIVE_CANDIDATE: ${counts.ARCHIVE_CANDIDATE || 0}`,
  `- REVIEW: ${counts.REVIEW || 0}`,
  `- backup groups: ${summary.backupGroups}`,
  `- backup files: ${summary.backupFiles}`,
  `- backup size: ${summary.backupBytes} bytes`,
  `- reports analyzed: ${summary.reportsAnalyzed}`,
  `- exact duplicate groups: ${summary.exactDuplicateGroups}`,
  '',
  'No files were deleted, moved or modified.',
  '',
  '## Safety rule',
  '',
  'Only scripts with no package.json reference and no project-file references can be proposed for archival.',
  ''
].join('\n');

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-classification.md'),
  md,
  'utf8'
);

console.log('[GC Phase 5C.2] Clasificación completada.');
console.log(`[GC Phase 5C.2] Scripts analizados: ${summary.phaseScriptsAnalyzed}`);
console.log(`[GC Phase 5C.2] Candidatos de archivo: ${(counts.ARCHIVE_CANDIDATE || 0) + (counts.ARCHIVE_PRIORITY || 0)}`);
console.log(`[GC Phase 5C.2] Grupos de backup: ${summary.backupGroups}`);
console.log(`[GC Phase 5C.2] Duplicados exactos: ${summary.exactDuplicateGroups}`);
console.log('[GC Phase 5C.2] No se ha borrado, movido ni modificado ningún archivo.');
