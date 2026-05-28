#!/usr/bin/env node
/* GC_PRE_GIT_DEPLOY_CLEANUP_V1
 * Limpieza segura antes de commit/deploy.
 * Borra scripts temporales apply-gc-* creados durante la transición Data Core.
 * Mantiene auditorías, docs finales y scripts útiles.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const deleteFiles = [
  // Data Core transition packs
  'scripts/apply-gc-data-core-v1.cjs',
  'scripts/apply-gc-data-core-v2.cjs',
  'scripts/apply-gc-admin-data-core-map-v1.cjs',
  'scripts/apply-gc-app-legacy-network-cut-v1.cjs',
  'scripts/apply-gc-hotlaps-legacy-network-cut-v1.cjs',
  'scripts/apply-gc-combos-legacy-network-cut-v1.cjs',
  'scripts/apply-gc-combo-detail-legacy-network-cut-v1.cjs',
  'scripts/apply-gc-legacy-server-aliases-v1.cjs',
  'scripts/apply-gc-admin-lab-legacy-alias-validation-v1.cjs',
  'scripts/apply-gc-legacy-server-drivers-alias-fix-v1-1.cjs',
  'scripts/apply-gc-legacy-pilots-stats-alias-fix-v1-2.cjs',
  'scripts/apply-gc-app-primary-clean-runtime-v1.cjs',
  'scripts/apply-gc-hotlaps-primary-clean-runtime-v1.cjs',
  'scripts/apply-gc-combos-primary-clean-runtime-v1.cjs',
  'scripts/apply-gc-combo-detail-primary-clean-runtime-v1.cjs',
  'scripts/apply-gc-data-core-final-audit-v1.cjs',
  'scripts/apply-gc-combo-canonical-public-filter-v1.cjs',
  'scripts/apply-gc-combo-canonical-compat-shape-fix-v1-1.cjs',
  'scripts/apply-gc-combo-public-min-drivers-zolder-merge-v1-2.cjs'
];

const keepFiles = [
  'scripts/audit-gc-data-core-runtime-v1.cjs',
  'docs/GC_DATA_CORE_FINAL_AUDIT_V1.md',
  'docs/GC_DATA_CORE_ENDPOINTS_MAP_V1.md',
  'docs/GC_RUNTIME_CLEAN_BASELINE_V1.md'
];

const deleted = [];
const missing = [];
const kept = [];

for (const rel of deleteFiles) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    deleted.push(rel);
  } else {
    missing.push(rel);
  }
}

for (const rel of keepFiles) {
  const abs = path.join(root, rel);
  kept.push({
    file: rel,
    exists: fs.existsSync(abs)
  });
}

const report = {
  ok: true,
  source: 'gc-pre-git-deploy-cleanup-v1',
  generatedAt: new Date().toISOString(),
  deleted,
  missing,
  kept,
  next: [
    'node scripts/audit-gc-data-core-runtime-v1.cjs',
    'npm run build',
    'git status'
  ]
};

const reportPath = path.join(root, 'docs', 'GC_PRE_GIT_DEPLOY_CLEANUP_REPORT_V1.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify(report, null, 2));
