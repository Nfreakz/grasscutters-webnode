#!/usr/bin/env node
/*
  GC_HOME2_COMBO_PULSE_INLINE_v4

  Local patcher. No toca GitHub.

  Aplica encima de:
  - GC_HOME2_SERVER_STRIP_STANDOUTS_v1
  - GC_HOME2_COMBO_STANDOUTS_LEGIBLE_v2
  - GC_HOME2_COMBO_PULSE_COMPACT_v3

  Cambios:
  - "Lectura rápida" -> "Lectura".
  - Cada fila del Combo Pulse pasa a una sola línea/bloque de información:
      RODADOR · NEO · 90 vueltas en combo · 56 válidas
      RITMO · WILSON · 1:49.099 media top 5
  - Menos columnas internas, más compacto y legible en columna estrecha.

  Ejecutar desde raíz:
    node scripts/gc-home2-combo-pulse-inline-v4.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-combo-pulse-inline-v4', stamp);

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

  content = content
    .replace('<h2>Lectura rápida</h2>', '<h2>Lectura</h2>')
    .replace('<h2>Lectura rápida.</h2>', '<h2>Lectura</h2>')
    .replace('<h2>LECTURA RÁPIDA</h2>', '<h2>Lectura</h2>')
    .replace('<h2>Lectura Rapida</h2>', '<h2>Lectura</h2>')
    .replace('<h2>Lectura</h2>', '<h2>Lectura</h2>');

  content = content.replace(
    '<dl class="gc-home2-standouts-grid gc-home2-combo-pulse-list" aria-label="Métricas rápidas del combo">',
    '<dl class="gc-home2-standouts-grid gc-home2-combo-pulse-list gc-home2-combo-pulse-inline" aria-label="Lectura compacta del combo">'
  );

  content = content.replace(
    '<dl class="gc-home2-standouts-grid" aria-label="Métricas destacadas de pilotos">',
    '<dl class="gc-home2-standouts-grid gc-home2-combo-pulse-inline" aria-label="Lectura compacta del combo">'
  );

  content = content.replace('gc-home2-combo-pulse-inline gc-home2-combo-pulse-inline', 'gc-home2-combo-pulse-inline');

  writeIfChanged(rel, before, content);
}

function patchCss() {
  const rel = 'src/styles/home2.css';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOME2_COMBO_PULSE_INLINE_V4_CSS')) {
    content += `

/* GC_HOME2_COMBO_PULSE_INLINE_V4_CSS
   Combo Pulse inline:
   - una sola línea/bloque por fila;
   - elimina la sensación de mini-card grande;
   - etiqueta + piloto + dato en lectura continua.
*/

.gc-home2-panel--standouts .gc-home2-panel__head h2 {
  font-size: 15.5px !important;
  line-height: .96 !important;
}

.gc-home2-combo-pulse-inline,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
  margin: 0 !important;
  border: 1px solid rgba(255,255,255,.055) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,.006)),
    rgba(0,0,0,.12) !important;
}

.gc-home2-combo-pulse-inline > div,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline > div,
.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide {
  display: flex !important;
  align-items: baseline !important;
  gap: 6px !important;
  min-height: 34px !important;
  padding: 7px 8px !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(255,255,255,.045) !important;
  background: transparent !important;
}

.gc-home2-combo-pulse-inline > div:last-child,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline > div:last-child {
  border-bottom: 0 !important;
}

.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide {
  grid-column: auto !important;
  min-height: 36px !important;
  background:
    linear-gradient(90deg, rgba(150,255,47,.052), transparent 74%) !important;
}

.gc-home2-combo-pulse-inline dt,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline dt {
  flex: 0 0 auto !important;
  grid-row: auto !important;
  margin: 0 !important;
  color: var(--muted) !important;
  font-family: var(--mono) !important;
  font-size: 7.8px !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  letter-spacing: .075em !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-pulse-inline dt::after,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline dt::after {
  content: "·";
  margin-left: 6px;
  color: rgba(150,255,47,.68);
}

.gc-home2-combo-pulse-inline dd,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline dd {
  flex: 0 1 auto !important;
  display: block !important;
  margin: 0 !important;
  min-width: 0 !important;
  color: var(--text) !important;
  font-size: 11.4px !important;
  font-weight: 950 !important;
  line-height: 1.05 !important;
  text-transform: uppercase !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide dd,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline .gc-home2-standout-card--wide dd {
  color: var(--green) !important;
  font-size: 11.8px !important;
}

.gc-home2-combo-pulse-inline small,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline small {
  flex: 1 1 auto !important;
  display: block !important;
  margin: 0 !important;
  min-width: 0 !important;
  color: var(--soft) !important;
  font-size: 9px !important;
  font-weight: 700 !important;
  line-height: 1.05 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: initial !important;
}

.gc-home2-combo-pulse-inline small::before,
.gc-home2-standouts-grid.gc-home2-combo-pulse-inline small::before {
  content: "·";
  margin-right: 6px;
  color: rgba(150,255,47,.68);
  font-weight: 950;
}

.gc-home2-panel--standouts::after {
  padding-top: 7px !important;
  font-size: 7.6px !important;
}

@media (max-width: 1200px) {
  .gc-home2-combo-pulse-inline,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-inline {
    grid-template-columns: 1fr !important;
  }

  .gc-home2-combo-pulse-inline > div,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-inline > div {
    border-right: 0 !important;
  }
}

@media (max-width: 760px) {
  .gc-home2-combo-pulse-inline > div,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-inline > div {
    align-items: flex-start !important;
    flex-wrap: wrap !important;
    min-height: auto !important;
  }

  .gc-home2-combo-pulse-inline dd,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-inline dd,
  .gc-home2-combo-pulse-inline small,
  .gc-home2-standouts-grid.gc-home2-combo-pulse-inline small {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
  }
}
`;
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Home2 Combo Pulse Inline v4');
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
