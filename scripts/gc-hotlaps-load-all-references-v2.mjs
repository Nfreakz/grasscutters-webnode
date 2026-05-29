#!/usr/bin/env node
/*
  GC_HOTLAPS_LOAD_ALL_REFERENCES_v2

  Local patcher. No toca GitHub.

  Problema:
  /hotlaps ahora lee todos los circuitos, pero sigue limitado a 3000 referencias
  porque el fix anterior usaba limit=3000 como límite de seguridad.

  Objetivo:
  - /hotlaps debe pedir limit=all.
  - /api/gc/leaderboard debe aceptar limit=all para scope global/all.
  - Mantener límites normales para usos no globales.

  Ejecutar desde raíz:
    node scripts/gc-hotlaps-load-all-references-v2.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'hotlaps-load-all-references-v2', stamp);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function full(rel) {
  return path.join(rootDir, rel);
}

function read(rel) {
  const p = full(rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function backup(rel, content) {
  const dest = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(rel, before, after) {
  if (before === after) {
    report.unchanged.push(rel);
    return false;
  }
  backup(rel, before);
  fs.writeFileSync(full(rel), after, 'utf8');
  report.changed.push(rel);
  return true;
}

function patchHotlapsFrontend() {
  const rel = 'src/pages/hotlaps.astro';
  let content = read(rel);
  const before = content;

  const replacements = [
    [
      '/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000',
      '/api/gc/leaderboard?scope=global&valid=all&group=all&limit=all'
    ],
    [
      '/api/gc/leaderboard?scope=all&valid=all&group=all&limit=3000',
      '/api/gc/leaderboard?scope=all&valid=all&group=all&limit=all'
    ],
    [
      '/api/gc/leaderboard?scope=all&limit=3000',
      '/api/gc/leaderboard?scope=global&valid=all&group=all&limit=all'
    ]
  ];

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  if (!content.includes('gcHotlapsLoadAllReferences')) {
    content = content.replace(
      "document.documentElement.dataset.gcHotlapsAllTracksScopeFix = 'v1';",
      "document.documentElement.dataset.gcHotlapsAllTracksScopeFix = 'v1';\n      document.documentElement.dataset.gcHotlapsLoadAllReferences = 'v2';"
    );
  }

  if (!content.includes('limit=all')) {
    report.warnings.push('No se detecta limit=all en hotlaps. Puede que la llamada esté construida de otra forma.');
  }

  writeIfChanged(rel, before, content);
}

function patchServerLeaderboard() {
  const rel = 'src/server/index.ts';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOTLAPS_ALL_TRACKS_SCOPE_FIX_V1_BACKEND')) {
    report.warnings.push('No se detecta el backend del fix v1. Intentaré aplicar cambios igualmente.');
  }

  if (!content.includes('GC_HOTLAPS_LOAD_ALL_REFERENCES_V2_BACKEND')) {
    content = content.replace(
      "    const scope = globalScopes.includes(rawScope) ? 'global' : 'activeCombo';\n    const wantsRawGlobal = scope === 'global';\n    const limit = gcDataCoreQueryNumber(req, 'limit', wantsRawGlobal ? 3000 : 30, 1, 5000);",
      "    const scope = globalScopes.includes(rawScope) ? 'global' : 'activeCombo';\n    const wantsRawGlobal = scope === 'global';\n    /* GC_HOTLAPS_LOAD_ALL_REFERENCES_V2_BACKEND */\n    const rawLimit = getQueryString(req, 'limit', wantsRawGlobal ? 'all' : '30').toLowerCase();\n    const wantsAllReferences = wantsRawGlobal && ['all', 'full', 'max', 'none', '0', '-1'].includes(rawLimit);\n    const limit = wantsAllReferences\n      ? Number.POSITIVE_INFINITY\n      : gcDataCoreQueryNumber(req, 'limit', wantsRawGlobal ? 5000 : 30, 1, 50000);"
    );

    if (!content.includes('GC_HOTLAPS_LOAD_ALL_REFERENCES_V2_BACKEND')) {
      report.warnings.push('No se pudo aplicar reemplazo directo del límite backend. Intentaré fallback regex.');

      const regex = /    const scope = globalScopes\.includes\(rawScope\) \? 'global' : 'activeCombo';\n    const wantsRawGlobal = scope === 'global';\n    const limit = gcDataCoreQueryNumber\(req, 'limit', wantsRawGlobal \? \d+ : 30, 1, \d+\);/;

      content = content.replace(
        regex,
        "    const scope = globalScopes.includes(rawScope) ? 'global' : 'activeCombo';\n    const wantsRawGlobal = scope === 'global';\n    /* GC_HOTLAPS_LOAD_ALL_REFERENCES_V2_BACKEND */\n    const rawLimit = getQueryString(req, 'limit', wantsRawGlobal ? 'all' : '30').toLowerCase();\n    const wantsAllReferences = wantsRawGlobal && ['all', 'full', 'max', 'none', '0', '-1'].includes(rawLimit);\n    const limit = wantsAllReferences\n      ? Number.POSITIVE_INFINITY\n      : gcDataCoreQueryNumber(req, 'limit', wantsRawGlobal ? 5000 : 30, 1, 50000);"
      );
    }
  }

  if (!content.includes('limitMode: wantsAllReferences ?')) {
    content = content.replace(
      "        count: items.length,\n        total: items.length,\n        totalFilteredLaps: filtered.length,",
      "        count: items.length,\n        total: items.length,\n        limitMode: wantsAllReferences ? 'all' : 'limited',\n        totalFilteredLaps: filtered.length,"
    );
  }

  if (!content.includes('GC_HOTLAPS_LOAD_ALL_REFERENCES_V2_BACKEND')) {
    report.errors.push('No se pudo modificar el bloque de límite en /api/gc/leaderboard.');
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Hotlaps Load All References v2');
  console.log('Root:', rootDir);
  console.log('');

  try {
    patchHotlapsFrontend();
    patchServerLeaderboard();
  } catch (error) {
    report.errors.push(error?.message || String(error));
  }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log('');
    console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }

  if (report.errors.length) {
    console.log('');
    console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }

  if (report.changed.length) {
    console.log('');
    console.log('Backups creados en:');
    console.log(backupRoot);
  }

  console.log('');
  console.log('Siguiente paso:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('');
  console.log('Prueba API:');
  console.log('  /api/gc/leaderboard?scope=global&valid=all&group=all&limit=all');
  console.log('');
  console.log('Prueba UI:');
  console.log('  /hotlaps');
  console.log('');
  console.log('Resultado esperado:');
  console.log('  Cargadas/Visibles debe ser el total real de vueltas filtradas, no 3000 por límite.');
  console.log('');
}

main();
