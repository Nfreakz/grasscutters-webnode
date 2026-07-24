import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'cleanup');
fs.mkdirSync(reportsDir, { recursive: true });

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  '.astro',
  '_gc_backups'
]);

const ignoredReferencePrefixes = [
  '_gc_reports/cleanup/',
  '_gc_reports/dependencies/',
  '_gc_reports/astro-check',
  '_gc_reports/project-audit',
  'reports/'
];

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
      if (options.ignore?.has(entry.name)) continue;
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

function isIgnoredReferenceFile(rel) {
  return ignoredReferencePrefixes.some((prefix) => rel.startsWith(prefix));
}

const allFiles = walk(root, { ignore: new Set(['node_modules', '.git', 'dist', '.astro']) });

const searchableFiles = walk(root, { ignore: ignoredDirs })
  .filter((file) =>
    textExtensions.has(file.extension) &&
    file.size <= 5 * 1024 * 1024 &&
    !isIgnoredReferenceFile(file.path)
  );

const phaseScripts = allFiles.filter((file) =>
  /^scripts\/.*(?:phase|hardening).*\.mjs$/i.test(file.path)
);

let packageJson = {};
try {
  packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
} catch {}

const npmScripts = packageJson.scripts || {};
const npmScriptText = Object.values(npmScripts).join('\n');

const textCache = new Map();
for (const file of searchableFiles) {
  try {
    textCache.set(file.path, fs.readFileSync(file.full, 'utf8'));
  } catch {}
}

const currentCleanupScripts = new Set([
  'phase5c1-cleanup-inventory.mjs',
  'phase5c2-cleanup-classification.mjs',
  'phase5c2-1-cleanup-classification-fix.mjs'
]);

const knownSuperseded = new Set([
  'phase5b1-dependency-inventory.mjs',
  'apply-phase5a2.mjs',
  'apply-phase5a3.mjs',
  'apply-phase5a4.mjs',
  'apply-phase5b2.mjs',
  'apply-phase5b3.mjs',
  'finalize-phase5b2.mjs',
  'finalize-phase5b3.mjs'
]);

const classifiedScripts = phaseScripts.map((file) => {
  const references = [];

  for (const [rel, text] of textCache) {
    if (rel === file.path) continue;
    if (text.includes(file.name) || text.includes(file.path)) {
      references.push(rel);
    }
  }

  const referencedByPackageJson =
    npmScriptText.includes(file.name) || npmScriptText.includes(file.path);

  let classification = 'ARCHIVE_CANDIDATE';
  let reason = 'Completed historical phase script with no active runtime reference.';

  if (currentCleanupScripts.has(file.name)) {
    classification = 'KEEP';
    reason = 'Current Phase 5C tooling.';
  } else if (referencedByPackageJson) {
    classification = 'KEEP';
    reason = 'Referenced by package.json.';
  } else if (references.length > 0) {
    classification = 'KEEP_REFERENCE';
    reason = 'Referenced by an active project file outside generated audit reports.';
  } else if (knownSuperseded.has(file.name)) {
    classification = 'ARCHIVE_PRIORITY';
    reason = 'Superseded or previously failed phase script with no active reference.';
  }

  return {
    path: file.path,
    size: file.size,
    modifiedAt: file.modifiedAt,
    sha256: sha256(file.full),
    classification,
    reason,
    referencedByPackageJson,
    references
  };
});

const counts = classifiedScripts.reduce((acc, item) => {
  acc[item.classification] = (acc[item.classification] || 0) + 1;
  return acc;
}, {});

const archiveCandidates = classifiedScripts
  .filter((item) =>
    item.classification === 'ARCHIVE_CANDIDATE' ||
    item.classification === 'ARCHIVE_PRIORITY'
  )
  .map((item) => item.path);

const keepItems = classifiedScripts
  .filter((item) =>
    item.classification === 'KEEP' ||
    item.classification === 'KEEP_REFERENCE'
  )
  .map((item) => item.path);

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5C.2.1',
  readOnly: true,
  correction: 'Generated reports and cleanup inventories excluded from reference detection.',
  phaseScriptsAnalyzed: classifiedScripts.length,
  scriptClassifications: counts,
  archiveCandidates: archiveCandidates.length,
  keepItems: keepItems.length,
  automaticDeletionPerformed: false,
  filesMoved: false,
  sourceFilesModified: false,
  nextStep: 'Build reversible archive pack from archiveCandidates after review.'
};

const result = {
  summary,
  ignoredReferencePrefixes,
  npmScripts,
  scripts: classifiedScripts,
  archiveCandidates,
  keepItems
};

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-classification-fixed.json'),
  JSON.stringify(result, null, 2) + '\n',
  'utf8'
);

const md = [
  '# GC Phase 5C.2.1 — Cleanup Classification Fix',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  '## Correction',
  '',
  'Generated cleanup and audit reports were excluded from dependency-reference detection.',
  '',
  '## Summary',
  '',
  `- Phase scripts analyzed: ${summary.phaseScriptsAnalyzed}`,
  `- KEEP: ${counts.KEEP || 0}`,
  `- KEEP_REFERENCE: ${counts.KEEP_REFERENCE || 0}`,
  `- ARCHIVE_PRIORITY: ${counts.ARCHIVE_PRIORITY || 0}`,
  `- ARCHIVE_CANDIDATE: ${counts.ARCHIVE_CANDIDATE || 0}`,
  `- Archive candidates: ${summary.archiveCandidates}`,
  '',
  'No files were deleted, moved or modified.',
  ''
].join('\n');

fs.writeFileSync(
  path.join(reportsDir, 'cleanup-classification-fixed.md'),
  md,
  'utf8'
);

console.log('[GC Phase 5C.2.1] Clasificación corregida.');
console.log(`[GC Phase 5C.2.1] Scripts analizados: ${summary.phaseScriptsAnalyzed}`);
console.log(`[GC Phase 5C.2.1] Candidatos de archivo: ${summary.archiveCandidates}`);
console.log(`[GC Phase 5C.2.1] Elementos conservados: ${summary.keepItems}`);
console.log('[GC Phase 5C.2.1] No se ha borrado, movido ni modificado ningún archivo.');
