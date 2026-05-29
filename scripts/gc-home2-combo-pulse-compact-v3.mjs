#!/usr/bin/env node
/*
  GC_HOME2_COMBO_PULSE_COMPACT_v3

  Local patcher. No toca GitHub.

  Aplica encima de:
  - GC_HOME2_SERVER_STRIP_STANDOUTS_v1
  - GC_HOME2_COMBO_STANDOUTS_LEGIBLE_v2

  Cambios:
  - Combo Standouts pasa a Combo Pulse.
  - Sustituye cards grandes por filas compactas tipo timing/race-control.
  - Mantiene los mismos data attrs y JS de métricas.
  - Hace el panel más legible en columna estrecha.

  Ejecutar desde raíz:
    node scripts/gc-home2-combo-pulse-compact-v3.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-combo-pulse-compact-v3', stamp);

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

function patchAstro() {
  const rel = 'src/pages/home2.astro';
  let content = read(rel);
  const before = content;

  if (!content.includes('gc-home2-panel--standouts')) {
    report.warnings.push('No se encontró gc-home2-panel--standouts. Aplica antes los packs v1/v2 de Home2.');
  }

  content = content
    .replace('<p class="gc-home2-panel__eyebrow">Race standouts</p>', '<p class="gc-home2-panel__eyebrow">Combo pulse</p>')
    .replace('<p class="gc-home2-panel__eyebrow">Combo standouts</p>', '<p class="gc-home2-panel__eyebrow">Combo pulse</p>')
    .replace('<h2>Quién está marcando la pauta</h2>', '<h2>Lectura rápida</h2>')
    .replace('<h2>Quién domina el último combo</h2>', '<h2>Lectura rápida</h2>');

  content = content
    .replace('<dt>Más vueltas</dt>', '<dt>Rodador</dt>')
    .replace('<dt>Mejor media</dt>', '<dt>Ritmo</dt>')
    .replace('<dt>Más limpio</dt>', '<dt>Limpio</dt>')
    .replace('<dt>Último en pista</dt>', '<dt>Última</dt>')
    .replace('<dt>Duelo cerrado</dt>', '<dt>Duelo</dt>');

  // Add a compact class marker to the dl.
  content = content.replace(
    '<dl class="gc-home2-standouts-grid" aria-label="Métricas destacadas de pilotos">',
    '<dl class="gc-home2-standouts-grid gc-home2-combo-pulse-list" aria-label="Métricas rápidas del combo">'
  );

  // In case it already had the class, avoid duplication.
  content = content.replace('gc-home2-combo-pulse-list gc-home2-combo-pulse-list', 'gc-home2-combo-pulse-list');

  writeIfChanged(rel, before, content);
}

function patchCss() {
  const rel = 'src/styles/home2.css';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOME2_COMBO_PULSE_COMPACT_V3_CSS')) {
    content += `

/* GC_HOME2_COMBO_PULSE_COMPACT_V3_CSS
   Nueva fórmula para el módulo derecho:
   - menos cards grandes;
   - filas compactas tipo race control;
   - más legible en columna estrecha.
*/

.gc-home2-panel--standouts {
  min-height: 372px !important;
  padding: 13px 14px !important;
  display: flex !important;
  flex-direction: column !important;
}

.gc-home2-panel--standouts .gc-home2-panel__head {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 10px !important;
  margin-bottom: 10px !important;
  padding-bottom: 8px !important;
  border-bottom: 1px solid rgba(255,255,255,.055) !important;
}

.gc-home2-panel--standouts .gc-home2-panel__eyebrow {
  margin-bottom: 4px !important;
}

.gc-home2-panel--standouts .gc-home2-panel__head h2 {
  max-width: none !important;
  margin: 0 !important;
  font-size: 16px !important;
  line-height: .98 !important;
  letter-spacing: -.035em !important;
  text-transform: uppercase !important;
}

.gc-home2-panel--standouts .gc-home2-link {
  flex: 0 0 auto !important;
  min-height: 26px !important;
  padding: 0 8px !important;
  border: 1px solid rgba(255,255,255,.09) !important;
  color: var(--soft) !important;
  font-family: var(--mono) !important;
  font-size: 9px !important;
  font-weight: 950 !important;
  letter-spacing: .07em !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-pulse-list,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
  margin: 0 !important;
  flex: 1 1 auto !important;
  align-content: start !important;
  border: 1px solid rgba(255,255,255,.055) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,.008)),
    rgba(0,0,0,.12) !important;
}

.gc-home2-combo-pulse-list > div,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list > div,
.gc-home2-combo-pulse-list .gc-home2-standout-card--wide,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list .gc-home2-standout-card--wide {
  display: grid !important;
  grid-template-columns: 66px minmax(0, 1fr) !important;
  grid-template-rows: auto auto !important;
  column-gap: 9px !important;
  row-gap: 1px !important;
  align-items: center !important;
  min-height: 45px !important;
  padding: 7px 8px !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(255,255,255,.045) !important;
  background: transparent !important;
}

.gc-home2-combo-pulse-list > div:last-child,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list > div:last-child {
  border-bottom: 0 !important;
}

.gc-home2-combo-pulse-list .gc-home2-standout-card--wide,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list .gc-home2-standout-card--wide {
  grid-column: auto !important;
  min-height: 47px !important;
  background:
    linear-gradient(90deg, rgba(150,255,47,.055), transparent 68%) !important;
}

.gc-home2-combo-pulse-list dt,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list dt {
  grid-row: 1 / 3 !important;
  margin: 0 !important;
  color: var(--muted) !important;
  font-family: var(--mono) !important;
  font-size: 8px !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  letter-spacing: .075em !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-pulse-list dd,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list dd {
  display: block !important;
  margin: 0 !important;
  min-width: 0 !important;
  color: var(--text) !important;
  font-size: 12.4px !important;
  font-weight: 950 !important;
  line-height: 1.02 !important;
  text-transform: uppercase !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.gc-home2-combo-pulse-list .gc-home2-standout-card--wide dd,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list .gc-home2-standout-card--wide dd {
  color: var(--green) !important;
  font-size: 13.4px !important;
}

.gc-home2-combo-pulse-list small,
.gc-home2-standouts-grid.gc-home2-combo-pulse-list small {
  display: block !important;
  margin: 2px 0 0 !important;
  min-width: 0 !important;
  color: var(--soft) !important;
  font-size: 9px !important;
  line-height: 1.08 !important;
  white-space: normal !important;
  overflow: hidden !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
}

.gc-home2-panel--standouts::after {
  content: "combo activo";
  margin-top: auto;
  padding-top: 8px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
  opacity: .72;
}

@media (max-width: 1200px) {
  .gc-home2-panel--standouts {
    min-height: auto !important;
  }

  .gc-home2-combo-pulse-list,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .gc-home2-combo-pulse-list > div,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list > div {
    border-right: 1px solid rgba(255,255,255,.045) !important;
  }

  .gc-home2-combo-pulse-list > div:nth-child(2n),
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list > div:nth-child(2n) {
    border-right: 0 !important;
  }
}

@media (max-width: 760px) {
  .gc-home2-combo-pulse-list,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list {
    grid-template-columns: 1fr !important;
  }

  .gc-home2-combo-pulse-list > div,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list > div {
    grid-template-columns: 1fr !important;
    border-right: 0 !important;
  }

  .gc-home2-combo-pulse-list dt,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list dt {
    grid-row: auto !important;
  }

  .gc-home2-combo-pulse-list dd,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-list dd {
    white-space: normal !important;
  }
}
`;
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Home2 Combo Pulse Compact v3');
  console.log('Root:', rootDir);
  console.log('');

  try {
    patchAstro();
    patchCss();
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
  console.log('Prueba:');
  console.log('  /home2');
  console.log('');
}

main();
