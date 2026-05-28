#!/usr/bin/env node
/* GC_UI_DATA_CONTRACT_AUDIT_V2
 * Clean audit after global cleanup.
 * Scans UI source files, ignores docs, temporary script history and server legacy alias definitions.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const scanFiles = [
  'src/pages/index.astro',
  'src/pages/app.astro',
  'src/pages/hotlaps.astro',
  'src/pages/combos.astro',
  'src/pages/combos/[comboId].astro',
  'src/pages/combos/[trackId]/[carId].astro',
  'src/pages/pilotos.astro',
  'src/components/PaletteCursor.astro',
  'src/pages/acsm/loading-card.svg.ts'
];

const oldMarkers = [
  'GC_APP_DATA_CORE_PRIMARY_V1_START',
  'GC_APP_POSTPAINT_DIAGNOSTICS_FIX_V1_7_START',
  'GC_APP_GLOBAL_DIAGNOSTICS_LAPS_FIX_V1_6_MARKER',
  '[GC /app v6.3 panel fix]',
  'function loadDashboard()',
  'renderMetrics({ pilotsData',
  'renderCombo(combosData',
  'GCAppLegacyGovernor',
  'GCAppLegacyNetworkCut',
  'GCHotlapsLegacyNetworkCut',
  'GCCombosLegacyNetworkCut',
  'GCComboDetailLegacyNetworkCut'
];

const legacyUiEndpoints = [
  '/api/combos/stats',
  '/api/hotlaps',
  '/api/laps',
  '/api/stats/overview',
  '/api/stracker/status'
];

const issues = [];

function add(severity, file, message, extra = {}) {
  issues.push({ severity, file, message, ...extra });
}

function read(file) {
  return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
}

for (const file of scanFiles) {
  const text = read(file);
  if (!text) {
    add('warn', file, 'Archivo no encontrado');
    continue;
  }

  for (const marker of oldMarkers) {
    if (text.includes(marker)) {
      add('error', file, 'Marcador/renderer antiguo todavía presente', { marker });
    }
  }

  for (const endpoint of legacyUiEndpoints) {
    if (text.includes(endpoint)) {
      add('warn', file, 'Endpoint legacy todavía usado en UI pública', { endpoint });
    }
  }
}

const app = read('src/pages/app.astro');
if (app) {
  if (!app.includes('GC_APP_SINGLE_RENDERER_V1_8_START')) add('error', 'src/pages/app.astro', 'Falta single renderer v1.8');
  if (!app.includes('GC_APP_LEGACY_RENDERER_REMOVED_V1_9')) add('error', 'src/pages/app.astro', 'Falta marker de renderer legacy eliminado v1.9');
  if (!app.includes('renderSession(')) add('error', 'src/pages/app.astro', 'Falta renderSession dentro del single renderer');
  if (!app.includes('/api/gc/diagnostics')) add('error', 'src/pages/app.astro', 'App no lee /api/gc/diagnostics');
  if (!app.includes('/api/gc/combos?limit=1&sort=recent')) add('error', 'src/pages/app.astro', 'App no lee combo público canónico');
}

const index = read('src/pages/index.astro');
if (index) {
  if (!index.includes('/api/gc/diagnostics')) add('error', 'src/pages/index.astro', 'Home no lee diagnostics para métricas globales');
  if (!index.includes('GC_HOME_DATACORE_SINGLE_RENDERER_V2_1_START')) add('error', 'src/pages/index.astro', 'Falta home single renderer v2.1');
  if (!index.includes('/api/gc/combos')) add('error', 'src/pages/index.astro', 'Home no lee combo canónico');
}

const applyScripts = fs.existsSync(path.join(root, 'scripts'))
  ? fs.readdirSync(path.join(root, 'scripts')).filter((name) => /^apply-gc-.*\.cjs$/i.test(name))
  : [];

for (const script of applyScripts) {
  add('warn', 'scripts/' + script, 'Script temporal apply-gc presente. Borrar antes de commit.');
}

const summary = {
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warn').length,
  filesChecked: scanFiles.length,
  applyScripts: applyScripts.length
};

const report = {
  ok: summary.errors === 0,
  generatedAt: new Date().toISOString(),
  source: 'gc-ui-data-contract-audit-v2',
  summary,
  issues
};

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'GC_UI_DATA_CONTRACT_AUDIT_REPORT_V2.json'), JSON.stringify(report, null, 2), 'utf8');

const md = [
  '# GC UI Data Contract Audit Report v2',
  '',
  'Fecha: ' + report.generatedAt,
  '',
  '## Resumen',
  '',
  '| Métrica | Valor |',
  '|---|---:|',
  '| Errores | ' + summary.errors + ' |',
  '| Warnings | ' + summary.warnings + ' |',
  '| Archivos revisados | ' + summary.filesChecked + ' |',
  '| Scripts temporales apply-gc | ' + summary.applyScripts + ' |',
  '',
  '## Issues',
  '',
  '| Severidad | Archivo | Mensaje | Detalle |',
  '|---|---|---|---|',
  ...issues.map((i) => '| ' + i.severity + ' | ' + i.file + ' | ' + i.message + ' | ' + (i.marker || i.endpoint || '') + ' |')
].join('\n');

fs.writeFileSync(path.join(root, 'docs', 'GC_UI_DATA_CONTRACT_AUDIT_REPORT_V2.md'), md, 'utf8');

console.log(JSON.stringify({ ok: report.ok, summary, report: 'docs/GC_UI_DATA_CONTRACT_AUDIT_REPORT_V2.md' }, null, 2));

if (summary.errors > 0) process.exit(2);
