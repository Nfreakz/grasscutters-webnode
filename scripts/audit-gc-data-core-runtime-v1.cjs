#!/usr/bin/env node
/* GC_DATA_CORE_RUNTIME_AUDIT_V1
 * Static audit for Data Core clean baseline.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const checks = [
  {
    id: 'app-data-core-primary',
    file: 'src/pages/app.astro',
    mustInclude: [
      'GC_APP_DATA_CORE_PRIMARY_V1_START',
      'GC_APP_PRIMARY_CLEAN_RUNTIME_V1_START'
    ],
    mustNotInclude: [
      'GC_APP_LEGACY_GOVERNOR_V1_EARLY_START',
      'GC_APP_LEGACY_GOVERNOR_V1_LATE_START',
      'GC_APP_LEGACY_NETWORK_CUT_V1_START'
    ]
  },
  {
    id: 'hotlaps-data-core-primary',
    file: 'src/pages/hotlaps.astro',
    mustInclude: [
      'GC_HOTLAPS_DATA_CORE_PRIMARY_V1_START',
      'GC_HOTLAPS_PRIMARY_CLEAN_RUNTIME_V1_START'
    ],
    mustNotInclude: [
      'GC_HOTLAPS_LEGACY_NETWORK_CUT_V1_START'
    ]
  },
  {
    id: 'combos-data-core-primary',
    file: 'src/pages/combos.astro',
    mustInclude: [
      'GC_COMBOS_DATA_CORE_PRIMARY_V1_START',
      'GC_COMBOS_PRIMARY_CLEAN_RUNTIME_V1_START',
      'GC_TRACK_IMAGE_FUZZY_INLINE_V1_1_START'
    ],
    mustNotInclude: [
      'GC_COMBOS_LEGACY_NETWORK_CUT_V1_START',
      'GC_TRACK_IMAGE_CLIENT_GUARD_INLINE_V1_START'
    ]
  },
  {
    id: 'combo-detail-data-core-primary',
    file: 'src/pages/combos/[comboId].astro',
    mustInclude: [
      'gcComboDetailDataCore',
      'GC_COMBO_DETAIL_IMAGE_AFTER_DATACORE_FIX_V1_MARKER',
      'GC_COMBO_DETAIL_PRIMARY_CLEAN_RUNTIME_V1_START'
    ],
    mustNotInclude: [
      'GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_START',
      '/js/gc-track-images.js'
    ]
  },
  {
    id: 'server-legacy-aliases',
    file: 'src/server/index.ts',
    mustInclude: [
      'GC_LEGACY_SERVER_ALIASES_V1_START',
      "legacyEndpoint: '/api/hotlaps'",
      "legacyEndpoint: '/api/laps'",
      "legacyEndpoint: '/api/combos/stats'",
      "legacyEndpoint: '/api/combos/:comboId'",
      "legacyEndpoint: '/api/pilots'",
      "legacyEndpoint: '/api/drivers'",
      "legacyEndpoint: '/api/stats/overview'"
    ],
    mustNotInclude: [
      "(app as any)._router.handle(req, res)"
    ]
  },
  {
    id: 'admin-endpoint-lab',
    file: 'src/pages/admin/endpoints.astro',
    mustInclude: [
      'GC_ADMIN_LAB_LEGACY_ALIAS_VALIDATION_V1_MARKER',
      "id:'combo-detail-core'",
      "id:'legacy-drivers'"
    ],
    mustNotInclude: []
  }
];

const results = [];

for (const check of checks) {
  const abs = path.join(root, check.file);
  const result = {
    id: check.id,
    file: check.file,
    ok: true,
    issues: []
  };

  if (!fs.existsSync(abs)) {
    result.ok = false;
    result.issues.push('missing file');
    results.push(result);
    continue;
  }

  const text = fs.readFileSync(abs, 'utf8');

  for (const needle of check.mustInclude || []) {
    if (!text.includes(needle)) {
      result.ok = false;
      result.issues.push('missing marker: ' + needle);
    }
  }

  for (const needle of check.mustNotInclude || []) {
    if (text.includes(needle)) {
      result.ok = false;
      result.issues.push('forbidden marker still present: ' + needle);
    }
  }

  results.push(result);
}

const fails = results.filter((item) => !item.ok);

const report = {
  ok: fails.length === 0,
  generatedAt: new Date().toISOString(),
  source: 'gc-data-core-runtime-audit-v1',
  total: results.length,
  fails: fails.length,
  results
};

console.log(JSON.stringify(report, null, 2));

if (fails.length) process.exit(1);
