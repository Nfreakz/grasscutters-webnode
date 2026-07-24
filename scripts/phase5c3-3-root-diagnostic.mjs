import fs from 'node:fs';
import path from 'node:path';

const configuredRoot = process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode';
const candidates = [
  "scripts/apply-hardening-phase1.mjs",
  "scripts/apply-phase2a-dependency-baseline.mjs",
  "scripts/apply-phase2a-regression-fix.mjs",
  "scripts/apply-phase2b-runtime-and-types.mjs",
  "scripts/apply-phase2c-championship-types.mjs",
  "scripts/apply-phase2c1-championship-residual-fix.mjs",
  "scripts/apply-phase2d-home-shared-types.mjs",
  "scripts/apply-phase2e-public-auth-livetest-types.mjs",
  "scripts/apply-phase2e1-residual-textcontent-fix.mjs",
  "scripts/apply-phase2f-admin-ratings-types.mjs",
  "scripts/apply-phase2g-public-detail-types.mjs",
  "scripts/apply-phase2h-ratings-backend-types.mjs",
  "scripts/apply-phase3a-admin-analytics.mjs",
  "scripts/apply-phase3b-analytics-reliability.mjs",
  "scripts/apply-phase3c-distinct-users.mjs",
  "scripts/apply-phase3d-account-usage-forever.mjs",
  "scripts/apply-phase4a-ratings-integrity-guard.mjs",
  "scripts/apply-phase4b-admin-subnav-build-hotfix.mjs",
  "scripts/apply-phase4b-integrity-apply-request-hotfix.mjs",
  "scripts/apply-phase4b-ratings-canonical-rebuild.mjs",
  "scripts/apply-phase4c-acsm-live-active-combo.mjs",
  "scripts/apply-phase4d-source-isolation.mjs",
  "scripts/apply-phase4d2-global-source-processing.mjs",
  "scripts/apply-phase4e-hotlaps-history-default-hotfix.mjs",
  "scripts/apply-phase4f-strict-event-source.mjs",
  "scripts/apply-phase4g-exact-track-assets.mjs",
  "scripts/apply-phase4h1-identity-audit.mjs",
  "scripts/apply-phase4h2-1-identity-review-ux.mjs",
  "scripts/apply-phase4h2-2-identity-review-style-hotfix.mjs",
  "scripts/apply-phase4h2-3-identity-false-positive-fix.mjs",
  "scripts/apply-phase4h2-4-identity-residual-conflict-fix.mjs",
  "scripts/apply-phase4h2-5-profile-link-review.mjs",
  "scripts/apply-phase4h2-6-identity-safe-automation-preview.mjs",
  "scripts/apply-phase4h2-7-identity-snapshot-rebase-fix.mjs",
  "scripts/apply-phase4h2-8-identity-preview-json-body-fix.mjs",
  "scripts/apply-phase4h2-identity-preview.mjs",
  "scripts/apply-phase4h3-1-1-membership-collision-diagnostics.mjs",
  "scripts/apply-phase4h3-1-identity-web-preflight.mjs",
  "scripts/apply-phase4h3-2-identity-web-apply-rollback.mjs",
  "scripts/apply-phase4h3-3-adri-police1370.mjs",
  "scripts/apply-phase4h3-identity-consolidation.mjs",
  "scripts/apply-phase5a1.mjs",
  "scripts/apply-phase5a2-1.mjs",
  "scripts/apply-phase5a3-1.mjs",
  "scripts/apply-phase5a3-2.mjs",
  "scripts/apply-phase5a4-1.mjs",
  "scripts/apply-phase5b4.mjs",
  "scripts/apply-phase5b5.mjs",
  "scripts/apply-phase5b6.mjs",
  "scripts/phase5b1-1-dependency-inventory.mjs"
];

function statSafe(file) {
  try {
    const stat = fs.statSync(file);
    return {
      exists: true,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch {
    return { exists: false };
  }
}

const root = path.resolve(configuredRoot);
const packageFile = path.join(root, 'package.json');
const scriptsDir = path.join(root, 'scripts');
const archiveDir = path.join(root, '_gc_archive', 'phase-scripts');

const candidateStatus = candidates.map((rel) => {
  const source = path.join(root, rel);
  const archived = path.join(archiveDir, rel);
  return {
    path: rel,
    source: statSafe(source),
    archived: statSafe(archived)
  };
});

const existingSource = candidateStatus.filter((item) => item.source.exists);
const existingArchived = candidateStatus.filter((item) => item.archived.exists);
const missingBoth = candidateStatus.filter((item) => !item.source.exists && !item.archived.exists);
const duplicateState = candidateStatus.filter((item) => item.source.exists && item.archived.exists);

let scriptsListing = [];
try {
  scriptsListing = fs.readdirSync(scriptsDir)
    .filter((name) => /phase|hardening/i.test(name))
    .sort();
} catch {}

const report = {
  generatedAt: new Date().toISOString(),
  phase: '5C.3.3',
  readOnly: true,
  configuredRoot,
  resolvedRoot: root,
  rootStatus: statSafe(root),
  packageJsonStatus: statSafe(packageFile),
  scriptsDirectoryStatus: statSafe(scriptsDir),
  archiveDirectoryStatus: statSafe(archiveDir),
  expectedCandidates: candidates.length,
  counts: {
    sourcePresent: existingSource.length,
    archivedPresent: existingArchived.length,
    missingBoth: missingBoth.length,
    presentInBoth: duplicateState.length
  },
  sourcePresent: existingSource.map((item) => item.path),
  archivedPresent: existingArchived.map((item) => item.path),
  missingBoth: missingBoth.map((item) => item.path),
  presentInBoth: duplicateState.map((item) => item.path),
  phaseLikeScriptsCurrentlyInScriptsDirectory: scriptsListing
};

let outputDir = process.cwd();
if (report.rootStatus.exists && report.rootStatus.isDirectory) {
  const preferred = path.join(root, '_gc_reports', 'cleanup');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    outputDir = preferred;
  } catch {}
}

const output = path.join(outputDir, 'phase5c3-root-diagnostic.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`[GC Phase 5C.3.3] Ruta configurada: ${root}`);
console.log(`[GC Phase 5C.3.3] Raíz existe: ${report.rootStatus.exists ? 'sí' : 'no'}`);
console.log(`[GC Phase 5C.3.3] package.json existe: ${report.packageJsonStatus.exists ? 'sí' : 'no'}`);
console.log(`[GC Phase 5C.3.3] Scripts presentes: ${report.counts.sourcePresent}/${report.expectedCandidates}`);
console.log(`[GC Phase 5C.3.3] Ya archivados: ${report.counts.archivedPresent}`);
console.log(`[GC Phase 5C.3.3] Ausentes en ambos sitios: ${report.counts.missingBoth}`);
console.log(`[GC Phase 5C.3.3] Informe: ${output}`);
console.log('[GC Phase 5C.3.3] No se ha movido ni eliminado ningún archivo.');
