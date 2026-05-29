#!/usr/bin/env node
/*
  GC_HOME2_COMBO_STANDOUTS_LEGIBLE_v2
  Local patcher. No toca GitHub.
  Aplica encima de GC_HOME2_SERVER_STRIP_STANDOUTS_v1.
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-combo-standouts-legible-v2', stamp);
const report = { changed: [], unchanged: [], warnings: [], errors: [] };

function full(rel) { return path.join(rootDir, rel); }
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
  if (before === after) { report.unchanged.push(rel); return false; }
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
    report.warnings.push('No se encontró gc-home2-panel--standouts. Aplica primero GC_HOME2_SERVER_STRIP_STANDOUTS_v1.');
  }

  content = content
    .replace('<p class="gc-home2-panel__eyebrow">Race standouts</p>', '<p class="gc-home2-panel__eyebrow">Combo standouts</p>')
    .replace('<h2>Quién está marcando la pauta</h2>', '<h2>Quién domina el último combo</h2>')
    .replace('<a href="/pilotos" class="gc-home2-link">Pilotos →</a>', '<a href="/hotlaps" class="gc-home2-link">Hotlaps →</a>')
    .replace('<small data-home2-standout-most-laps-meta>histórico cargado</small>', '<small data-home2-standout-most-laps-meta>vueltas del combo</small>')
    .replace('<small data-home2-standout-best-average-meta>top 5 vueltas</small>', '<small data-home2-standout-best-average-meta>media del combo</small>')
    .replace('<small data-home2-standout-cleanest-meta>ratio válidas</small>', '<small data-home2-standout-cleanest-meta>limpieza del combo</small>')
    .replace('<small data-home2-standout-vmax-meta>velocidad máxima</small>', '<small data-home2-standout-vmax-meta>velocidad en combo</small>')
    .replace('<small data-home2-standout-last-driver-meta>actividad reciente</small>', '<small data-home2-standout-last-driver-meta>última del combo</small>')
    .replace('<small data-home2-standout-duel-meta>gap entre referencias</small>', '<small data-home2-standout-duel-meta>diferencias del combo</small>');

  const globalPayloadBlock = `        const globalStandoutsPayload =
          await fetchJson('/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/leaderboard?scope=all&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/recent-laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/hotlaps?limit=3000&sort=recent&valid=all');
`;

  const comboPayloadBlock = `        const comboStandoutsPayload =
          await fetchJson('/api/gc/recent-laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/gc/leaderboard?scope=activeCombo&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/leaderboard?scope=currentCombo&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/hotlaps?limit=3000&sort=recent&valid=all');
`;

  if (content.includes(globalPayloadBlock)) content = content.replace(globalPayloadBlock, comboPayloadBlock);
  else if (!content.includes('const comboStandoutsPayload =')) report.warnings.push('No se encontró globalStandoutsPayload para convertirlo.');

  content = content.replace(
    "      const renderRaceStandoutsV1 = (rowsInput = []) => {",
    "      const renderRaceStandoutsV1 = (rowsInput = [], activeTrack = '', activeCars = []) => {"
  );

  const oldCleanRows = `        const cleanRows = getArray(rowsInput)
          .filter(Boolean)
          .filter((row, index, array) => array.findIndex((candidate, candidateIndex) => uniqueLapKeyV1(candidate, candidateIndex) === uniqueLapKeyV1(row, index)) === index);`;
  const newCleanRows = `        const activeCarList = Array.isArray(activeCars) ? activeCars.filter(Boolean) : [];
        const comboScopedRows = getArray(rowsInput)
          .filter(Boolean)
          .filter((row) => rowTrackMatches(row, activeTrack))
          .filter((row) => rowCarMatches(row, activeCarList));

        const cleanRows = comboScopedRows
          .filter((row, index, array) => array.findIndex((candidate, candidateIndex) => uniqueLapKeyV1(candidate, candidateIndex) === uniqueLapKeyV1(row, index)) === index);`;

  if (content.includes(oldCleanRows)) content = content.replace(oldCleanRows, newCleanRows);
  else if (!content.includes('const comboScopedRows = getArray(rowsInput)')) report.warnings.push('No se pudo insertar filtro por combo.');

  content = content
    .replace('`${mostLaps.laps} vueltas · ${mostLaps.valid} válidas`', '`${mostLaps.laps} vueltas en combo · ${mostLaps.valid} válidas`')
    .replace('`${Math.round(cleanest.cleanRate * 100)}% válidas · ${cleanest.laps} vueltas`', '`${Math.round(cleanest.cleanRate * 100)}% válidas · ${cleanest.laps} vueltas en combo`')
    .replace('`hace ${formatAgo(latest.lastDate)}`', '`última hace ${formatAgo(latest.lastDate)}`')
    .replace('`gap ${(closest.gap / 1000).toFixed(3)} s`', '`gap combo ${(closest.gap / 1000).toFixed(3)} s`');

  const oldRenderCall = `        renderRaceStandoutsV1([
          ...getArray(globalStandoutsPayload),
          ...boardCandidates,
          ...getArray(recentPayload)
        ]);`;
  const newRenderCall = `        renderRaceStandoutsV1([
          ...getArray(comboStandoutsPayload),
          ...getArray(leaderboardPayload),
          ...getArray(combo.laps),
          ...getArray(combo.bestLaps),
          ...getArray(combo.leaderboard),
          ...getArray(recentPayload)
        ], track, carList);`;

  if (content.includes(oldRenderCall)) content = content.replace(oldRenderCall, newRenderCall);
  else if (content.includes('renderRaceStandoutsV1([') && content.includes('globalStandoutsPayload')) {
    content = content.replace(/        renderRaceStandoutsV1\(\[[\s\S]*?\]\);/, newRenderCall);
    report.warnings.push('Render call actualizado con regex amplia.');
  } else if (!content.includes('renderRaceStandoutsV1([')) report.warnings.push('No se encontró llamada renderRaceStandoutsV1.');

  content = content.replaceAll('globalStandoutsPayload', 'comboStandoutsPayload');

  writeIfChanged(rel, before, content);
}

function patchCss() {
  const rel = 'src/styles/home2.css';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOME2_COMBO_STANDOUTS_LEGIBLE_V2_CSS')) {
    content += `

/* GC_HOME2_COMBO_STANDOUTS_LEGIBLE_V2_CSS
   Combo Standouts: datos del último combo / combo activo y lectura vertical.
*/

.gc-home2-panel--standouts { padding: 14px !important; }

.gc-home2-panel--standouts .gc-home2-panel__head {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin-bottom: 12px !important;
}

.gc-home2-panel--standouts .gc-home2-panel__head h2 {
  max-width: 18ch !important;
  margin-top: 4px !important;
  font-size: 16.5px !important;
  line-height: 1.02 !important;
  letter-spacing: -.035em !important;
}

.gc-home2-panel--standouts .gc-home2-link {
  flex: 0 0 auto;
  font-size: 10.5px !important;
}

.gc-home2-standouts-grid {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 7px !important;
  margin: 0 !important;
}

.gc-home2-standouts-grid > div,
.gc-home2-standout-card--wide {
  display: grid !important;
  grid-template-columns: 82px minmax(0, 1fr) !important;
  grid-template-rows: auto auto !important;
  column-gap: 10px !important;
  row-gap: 2px !important;
  align-items: center !important;
  min-height: 48px !important;
  padding: 8px 10px !important;
  border: 1px solid rgba(255,255,255,.055) !important;
  background:
    radial-gradient(circle at 100% 0%, rgba(150,255,47,.06), transparent 4.8rem),
    rgba(255,255,255,.016) !important;
}

.gc-home2-standout-card--wide {
  grid-column: auto !important;
  min-height: 54px !important;
  background:
    radial-gradient(circle at 100% 0%, rgba(150,255,47,.10), transparent 5.8rem),
    rgba(150,255,47,.024) !important;
}

.gc-home2-standouts-grid dt {
  grid-row: 1 / 3 !important;
  margin: 0 !important;
  color: var(--muted) !important;
  font-family: var(--mono) !important;
  font-size: 8.3px !important;
  font-weight: 900 !important;
  line-height: 1.12 !important;
  letter-spacing: .075em !important;
  text-transform: uppercase !important;
}

.gc-home2-standouts-grid dd {
  display: block !important;
  margin: 0 !important;
  min-width: 0 !important;
  color: var(--text) !important;
  font-size: 12.8px !important;
  font-weight: 950 !important;
  line-height: 1.08 !important;
  text-transform: uppercase !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
}

.gc-home2-standout-card--wide dd {
  color: var(--green) !important;
  font-size: 15.2px !important;
}

.gc-home2-standouts-grid small {
  display: block !important;
  margin: 2px 0 0 !important;
  min-width: 0 !important;
  color: var(--soft) !important;
  font-size: 9.7px !important;
  line-height: 1.18 !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
}

@media (max-width: 1200px) {
  .gc-home2-standouts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .gc-home2-standout-card--wide { grid-column: 1 / -1 !important; }
}

@media (max-width: 760px) {
  .gc-home2-panel--standouts .gc-home2-panel__head { flex-direction: column !important; }
  .gc-home2-standouts-grid { grid-template-columns: 1fr !important; }
  .gc-home2-standout-card--wide { grid-column: auto !important; }
  .gc-home2-standouts-grid > div,
  .gc-home2-standout-card--wide { grid-template-columns: 1fr !important; }
  .gc-home2-standouts-grid dt { grid-row: auto !important; }
}
`;
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Home2 Combo Standouts Legible v2');
  console.log('Root:', rootDir);
  console.log('');

  try { patchAstro(); patchCss(); }
  catch (error) { report.errors.push(error?.message || String(error)); }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log(''); console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }
  if (report.errors.length) {
    console.log(''); console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }
  if (report.changed.length) {
    console.log(''); console.log('Backups creados en:'); console.log(backupRoot);
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
