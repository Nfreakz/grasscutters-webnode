import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const expected = [
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
const archiveRoot = path.join(root, '_gc_archive', 'phase-scripts');
const manifestFile = path.join(archiveRoot, 'phase5c3-manifest.json');
const reportsDir = path.join(root, '_gc_reports', 'cleanup');

function fail(message) {
  console.error(`[GC Phase 5C.4.1] ERROR: ${message}`);
  process.exit(1);
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function run(command) {
  console.log(`[GC Phase 5C.4.1] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) fail(`Falló: ${command}`);
}

if (!fs.existsSync(path.join(root, 'package.json'))) {
  fail(`No existe package.json en ${root}`);
}

const moved = [];
const missingArchived = [];
const stillInSource = [];

for (const originalPath of expected) {
  const archivedPath = path.join('_gc_archive', 'phase-scripts', originalPath).replaceAll('\\', '/');
  const archivedAbsolute = path.join(root, archivedPath);
  const sourceAbsolute = path.join(root, originalPath);

  if (!fs.existsSync(archivedAbsolute)) {
    missingArchived.push(archivedPath);
    continue;
  }

  if (fs.existsSync(sourceAbsolute)) {
    stillInSource.push(originalPath);
  }

  const stat = fs.statSync(archivedAbsolute);
  moved.push({
    originalPath,
    archivedPath,
    bytes: stat.size,
    sha256: sha256(archivedAbsolute)
  });
}

if (missingArchived.length > 0) {
  fail(`Faltan ${missingArchived.length} archivos archivados.`);
}
if (stillInSource.length > 0) {
  fail(`${stillInSource.length} archivos siguen presentes en scripts/.`);
}
if (moved.length !== 50) {
  fail(`Se esperaban 50 archivos archivados y se encontraron ${moved.length}.`);
}

fs.mkdirSync(archiveRoot, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const rebuiltManifest = {
  generatedAt: new Date().toISOString(),
  phase: '5C.3-rebuilt',
  reversible: true,
  rebuiltFromFilesystem: true,
  moved,
  skipped: [],
  conflicts: []
};

fs.writeFileSync(
  manifestFile,
  JSON.stringify(rebuiltManifest, null, 2) + '\n',
  'utf8'
);

run('npm run check');
run('npm run build');
run('npm run test:phase4k');

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5C.4.1',
  completed: true,
  manifestRebuilt: true,
  archiveValidation: {
    expected: 50,
    archivedPresent: 50,
    stillInSource: 0,
    missingArchived: 0
  },
  validation: {
    astroCheck: 'passed',
    build: 'passed',
    phase4k: 'passed'
  },
  manifest: '_gc_archive/phase-scripts/phase5c3-manifest.json'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5c4-1-validation-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5C.4.1] Manifiesto reconstruido desde el sistema de archivos.');
console.log('[GC Phase 5C.4.1] 50/50 archivos archivados.');
console.log('[GC Phase 5C.4.1] check, build y Phase 4K superados.');
