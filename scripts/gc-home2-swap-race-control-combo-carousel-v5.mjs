#!/usr/bin/env node
/*
  GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_v5

  Local patcher. No toca GitHub.

  Aplica encima de los packs Home2 anteriores.

  Cambios:
  - Intercambia posiciones:
    1) Race Control vuelve al panel derecho, como estaba antes.
    2) Combo Pulse pasa a la barra horizontal bajo el hero.
  - Combo Pulse en barra tipo carousel/marquee de derecha a izquierda.
  - Mantiene los mismos data attrs, así la lógica JS actual sigue rellenando datos.

  Ejecutar desde raíz:
    node scripts/gc-home2-swap-race-control-combo-carousel-v5.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-swap-race-control-combo-carousel-v5', stamp);

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

function comboCarouselStrip() {
  return `    <!-- GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_V5_HTML -->
    <section class="gc-home2-combo-strip gc-home2-shell" aria-label="Combo pulse del último combo">
      <div class="gc-home2-combo-strip__rail">
        <div class="gc-home2-combo-strip__title">
          <span class="gc-home2-server-dot" aria-hidden="true"></span>
          <strong>Combo Pulse</strong>
        </div>

        <div class="gc-home2-combo-marquee" aria-live="polite">
          <dl class="gc-home2-combo-marquee-track">
            <div>
              <dt>Rodador</dt>
              <dd data-home2-standout-most-laps>--</dd>
              <small data-home2-standout-most-laps-meta>vueltas del combo</small>
            </div>
            <div>
              <dt>Ritmo</dt>
              <dd data-home2-standout-best-average>--</dd>
              <small data-home2-standout-best-average-meta>media del combo</small>
            </div>
            <div>
              <dt>Limpio</dt>
              <dd data-home2-standout-cleanest>--</dd>
              <small data-home2-standout-cleanest-meta>limpieza del combo</small>
            </div>
            <div>
              <dt>Vmax</dt>
              <dd data-home2-standout-vmax>--</dd>
              <small data-home2-standout-vmax-meta>velocidad en combo</small>
            </div>
            <div>
              <dt>Última</dt>
              <dd data-home2-standout-last-driver>--</dd>
              <small data-home2-standout-last-driver-meta>última del combo</small>
            </div>
            <div>
              <dt>Duelo</dt>
              <dd data-home2-standout-duel>--</dd>
              <small data-home2-standout-duel-meta>diferencias del combo</small>
            </div>
          </dl>
        </div>
      </div>
    </section>

`;
}

function raceControlPanel() {
  return `      <article class="gc-home2-panel gc-home2-panel--server gc-home2-panel--server-v8">
        <div class="gc-home2-panel__head">
          <div>
            <p class="gc-home2-panel__eyebrow">Estado del servidor</p>
            <h2>Race Control</h2>
          </div>
        </div>

        <dl class="gc-home2-server-rows gc-home2-server-rows--v8">
          <div>
            <dt>Online</dt>
            <dd data-home2-server-state>Online</dd>
          </div>
          <div>
            <dt>Pilotos servidor</dt>
            <dd data-home2-server-total-drivers>--</dd>
          </div>
          <div>
            <dt>Días desde 1ª vuelta</dt>
            <dd data-home2-first-lap-days>--</dd>
          </div>
          <div>
            <dt>Vueltas servidor</dt>
            <dd data-home2-server-total-laps>--</dd>
          </div>
          <div>
            <dt>Hotlaps</dt>
            <dd data-home2-server-hotlaps>--</dd>
          </div>
          <div>
            <dt>Última vuelta</dt>
            <dd data-home2-last-lap-card>--</dd>
          </div>
        </dl>
      </article>`;
}

function patchAstro() {
  const rel = 'src/pages/home2.astro';
  let content = read(rel);
  const before = content;

  // 1) Replace the current horizontal Race Control server strip with Combo Pulse carousel.
  if (content.includes('gc-home2-server-strip')) {
    const stripRegex = /\s*<!-- GC_HOME2_SERVER_STRIP_STANDOUTS_V1_HTML -->\s*<section class="gc-home2-server-strip[\s\S]*?<\/section>\s*/;
    const genericStripRegex = /\s*<section class="gc-home2-server-strip[\s\S]*?<\/section>\s*/;

    if (stripRegex.test(content)) {
      content = content.replace(stripRegex, '\n' + comboCarouselStrip());
    } else if (genericStripRegex.test(content)) {
      content = content.replace(genericStripRegex, '\n' + comboCarouselStrip());
      report.warnings.push('Barra servidor reemplazada con regex genérica.');
    } else {
      report.warnings.push('No se encontró la barra gc-home2-server-strip para reemplazar.');
    }
  } else if (!content.includes('gc-home2-combo-strip')) {
    report.warnings.push('No existe gc-home2-server-strip ni gc-home2-combo-strip. No se insertó carousel.');
  }

  // Avoid duplicating if v5 was already applied.
  const comboStripCount = (content.match(/gc-home2-combo-strip/g) || []).length;
  if (comboStripCount > 6) {
    report.warnings.push('Parece haber más referencias de gc-home2-combo-strip de lo normal. Revisa manualmente si hay duplicado.');
  }

  // 2) Replace the right Combo Pulse panel with Race Control.
  const standoutsRegex = /      <article class="gc-home2-panel gc-home2-panel--standouts">[\s\S]*?<\/article>/;

  if (standoutsRegex.test(content)) {
    content = content.replace(standoutsRegex, raceControlPanel());
  } else if (content.includes('gc-home2-panel--server-v8')) {
    report.unchanged.push(`${rel} race control panel already present`);
  } else {
    report.warnings.push('No se encontró el panel gc-home2-panel--standouts para devolver Race Control al panel derecho.');
  }

  writeIfChanged(rel, before, content);
}

function patchCss() {
  const rel = 'src/styles/home2.css';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_V5_CSS')) {
    content += `

/* GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_V5_CSS
   - Race Control vuelve al panel derecho.
   - Combo Pulse pasa a una barra horizontal con movimiento derecha -> izquierda.
*/

.gc-home2-combo-strip {
  position: relative;
  z-index: 6;
  margin-top: -34px !important;
  margin-bottom: 16px !important;
}

.gc-home2-combo-strip__rail {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  align-items: stretch;
  min-height: 44px;
  border: 1px solid rgba(150,255,47,.32);
  background:
    linear-gradient(90deg, rgba(3,5,3,.96), rgba(5,10,6,.92)),
    radial-gradient(circle at 20% 0%, rgba(150,255,47,.10), transparent 16rem);
  box-shadow:
    0 14px 40px rgba(0,0,0,.42),
    inset 0 0 0 1px rgba(255,255,255,.025);
  overflow: hidden;
}

.gc-home2-combo-strip__title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 0 14px;
  border-right: 1px solid rgba(255,255,255,.06);
  background: rgba(150,255,47,.035);
}

.gc-home2-combo-strip__title strong {
  color: var(--text);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .10em;
  text-transform: uppercase;
  white-space: nowrap;
}

.gc-home2-combo-marquee {
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.gc-home2-combo-marquee::before,
.gc-home2-combo-marquee::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 70px;
  pointer-events: none;
}

.gc-home2-combo-marquee::before {
  left: 0;
  background: linear-gradient(90deg, rgba(3,5,3,.96), transparent);
}

.gc-home2-combo-marquee::after {
  right: 0;
  background: linear-gradient(270deg, rgba(3,5,3,.96), transparent);
}

.gc-home2-combo-marquee-track {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: max-content;
  min-width: 100%;
  margin: 0;
  animation: gc-home2-combo-marquee-v5 34s linear infinite;
  will-change: transform;
}

.gc-home2-combo-marquee:hover .gc-home2-combo-marquee-track {
  animation-play-state: paused;
}

@keyframes gc-home2-combo-marquee-v5 {
  from { transform: translateX(42%); }
  to { transform: translateX(-100%); }
}

.gc-home2-combo-marquee-track > div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: max-content;
  min-height: 44px;
  padding: 0 18px;
  border-right: 1px solid rgba(255,255,255,.055);
}

.gc-home2-combo-marquee-track dt {
  margin: 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8.3px;
  font-weight: 950;
  line-height: 1;
  letter-spacing: .08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.gc-home2-combo-marquee-track dt::after {
  content: "·";
  margin-left: 8px;
  color: rgba(150,255,47,.7);
}

.gc-home2-combo-marquee-track dd {
  margin: 0;
  color: var(--green);
  font-size: 12.5px;
  font-weight: 950;
  line-height: 1;
  letter-spacing: -.015em;
  text-transform: uppercase;
  white-space: nowrap;
}

.gc-home2-combo-marquee-track small {
  display: block;
  margin: 0;
  color: var(--soft);
  font-size: 9.4px;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
}

.gc-home2-combo-marquee-track small::before {
  content: "·";
  margin-right: 8px;
  color: rgba(150,255,47,.7);
  font-weight: 950;
}

/* Race Control restored as right-side panel */
.gc-home2-panel--server-v8 {
  min-height: 372px !important;
  padding: 14px !important;
  display: flex !important;
  flex-direction: column !important;
}

.gc-home2-panel--server-v8 .gc-home2-panel__head {
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid rgba(255,255,255,.055) !important;
}

.gc-home2-panel--server-v8 .gc-home2-panel__head h2 {
  max-width: none !important;
  margin: 4px 0 0 !important;
  font-size: 17px !important;
  line-height: .98 !important;
  letter-spacing: -.035em !important;
  text-transform: uppercase !important;
}

.gc-home2-panel--server-v8 .gc-home2-server-rows--v8 {
  display: grid !important;
  gap: 7px !important;
  margin: 0 !important;
}

.gc-home2-panel--server-v8 .gc-home2-server-rows--v8 > div {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  min-height: 44px !important;
  padding: 8px 10px !important;
  border: 1px solid rgba(255,255,255,.055) !important;
  background:
    radial-gradient(circle at 100% 0%, rgba(150,255,47,.055), transparent 4.8rem),
    rgba(255,255,255,.017) !important;
}

.gc-home2-panel--server-v8 .gc-home2-server-rows--v8 dt {
  margin: 0 !important;
  color: var(--muted) !important;
  font-family: var(--mono) !important;
  font-size: 8.1px !important;
  font-weight: 950 !important;
  line-height: 1.08 !important;
  letter-spacing: .075em !important;
  text-transform: uppercase !important;
}

.gc-home2-panel--server-v8 .gc-home2-server-rows--v8 dd {
  margin: 0 !important;
  color: var(--green) !important;
  font-size: 12.8px !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  text-align: right !important;
  white-space: nowrap !important;
}

@media (max-width: 1200px) {
  .gc-home2-combo-strip {
    margin-top: 14px !important;
  }

  .gc-home2-combo-strip__rail {
    grid-template-columns: 1fr;
  }

  .gc-home2-combo-strip__title {
    min-height: 36px;
    border-right: 0;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }

  .gc-home2-combo-marquee-track {
    animation-duration: 42s;
  }

  .gc-home2-panel--server-v8 {
    min-height: auto !important;
  }
}

@media (max-width: 760px) {
  .gc-home2-combo-marquee-track {
    animation-duration: 48s;
  }

  .gc-home2-combo-marquee-track > div {
    padding: 0 14px;
  }

  .gc-home2-panel--server-v8 .gc-home2-server-rows--v8 > div {
    min-height: 38px !important;
  }
}
`;
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Home2 Swap Race Control + Combo Carousel v5');
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
