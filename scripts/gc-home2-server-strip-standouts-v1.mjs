#!/usr/bin/env node
/*
  GC_HOME2_SERVER_STRIP_STANDOUTS_v1

  Local patcher. No toca GitHub.

  Cambios:
  - mueve "Estado del servidor" de la columna derecha a una barra horizontal estrecha bajo el hero;
  - reemplaza el hueco por "Race Standouts", con métricas de comunidad:
    más vueltas, mejor media top laps, más limpio, vmax, último en pista y duelo cerrado;
  - mantiene los mismos data attrs del estado servidor para reutilizar la lógica existente.

  Ejecutar desde raíz:
    node scripts/gc-home2-server-strip-standouts-v1.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-server-strip-standouts-v1', stamp);

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

  if (!content.includes('GC_HOME2_SERVER_STRIP_STANDOUTS_V1_HTML')) {
    const afterHeroNeedle = `        </article>
      </div>
    </section>

    <section class="gc-home2-toprow gc-home2-shell" aria-label="Actividad destacada">`;

    const serverStrip = `        </article>
      </div>
    </section>

    <!-- GC_HOME2_SERVER_STRIP_STANDOUTS_V1_HTML -->
    <section class="gc-home2-server-strip gc-home2-shell" aria-label="Estado rápido del servidor">
      <div class="gc-home2-server-strip__rail">
        <div class="gc-home2-server-strip__title">
          <span class="gc-home2-server-dot" aria-hidden="true"></span>
          <strong>Race Control</strong>
        </div>
        <dl class="gc-home2-server-strip__grid">
          <div><dt>Online</dt><dd data-home2-server-state>Online</dd></div>
          <div><dt>Pilotos</dt><dd data-home2-server-total-drivers>--</dd></div>
          <div><dt>Días desde 1ª vuelta</dt><dd data-home2-first-lap-days>--</dd></div>
          <div><dt>Vueltas servidor</dt><dd data-home2-server-total-laps>--</dd></div>
          <div><dt>Hotlaps</dt><dd data-home2-server-hotlaps>--</dd></div>
          <div><dt>Última vuelta</dt><dd data-home2-last-lap-card>--</dd></div>
        </dl>
      </div>
    </section>

    <section class="gc-home2-toprow gc-home2-shell" aria-label="Actividad destacada">`;

    if (content.includes(afterHeroNeedle)) {
      content = content.replace(afterHeroNeedle, serverStrip);
    } else {
      report.warnings.push('No se pudo insertar la barra de servidor después del hero. Anchor no encontrado.');
    }
  }

  if (!content.includes('gc-home2-panel--standouts')) {
    const standoutsArticle = `      <article class="gc-home2-panel gc-home2-panel--standouts">
        <div class="gc-home2-panel__head">
          <div>
            <p class="gc-home2-panel__eyebrow">Race standouts</p>
            <h2>Quién está marcando la pauta</h2>
          </div>
          <a href="/pilotos" class="gc-home2-link">Pilotos →</a>
        </div>

        <dl class="gc-home2-standouts-grid" aria-label="Métricas destacadas de pilotos">
          <div class="gc-home2-standout-card gc-home2-standout-card--wide">
            <dt>Más vueltas</dt>
            <dd data-home2-standout-most-laps>--</dd>
            <small data-home2-standout-most-laps-meta>histórico cargado</small>
          </div>
          <div>
            <dt>Mejor media</dt>
            <dd data-home2-standout-best-average>--</dd>
            <small data-home2-standout-best-average-meta>top 5 vueltas</small>
          </div>
          <div>
            <dt>Más limpio</dt>
            <dd data-home2-standout-cleanest>--</dd>
            <small data-home2-standout-cleanest-meta>ratio válidas</small>
          </div>
          <div>
            <dt>Vmax</dt>
            <dd data-home2-standout-vmax>--</dd>
            <small data-home2-standout-vmax-meta>velocidad máxima</small>
          </div>
          <div>
            <dt>Último en pista</dt>
            <dd data-home2-standout-last-driver>--</dd>
            <small data-home2-standout-last-driver-meta>actividad reciente</small>
          </div>
          <div>
            <dt>Duelo cerrado</dt>
            <dd data-home2-standout-duel>--</dd>
            <small data-home2-standout-duel-meta>gap entre referencias</small>
          </div>
        </dl>
      </article>`;

    const serverArticleRegex = /      <article class="gc-home2-panel gc-home2-panel--server[\s\S]*?<dl class="gc-home2-server-rows gc-home2-server-rows--v8">[\s\S]*?<dd data-home2-last-lap-card>--<\/dd>\s*<\/div>\s*<\/dl>\s*<\/article>/;

    if (serverArticleRegex.test(content)) {
      content = content.replace(serverArticleRegex, standoutsArticle);
    } else {
      report.warnings.push('No se pudo reemplazar el bloque Estado del servidor. Regex no encontró el artículo.');
    }
  }

  if (!content.includes('GC_HOME2_SERVER_STRIP_STANDOUTS_V1_JS')) {
    const helperAnchor = `      const updateServerAgeFromFirstLap = async (fallbackRows = []) => {`;
    const standoutsJs = `
      /* GC_HOME2_SERVER_STRIP_STANDOUTS_V1_JS */
      const driverNameFromLapV1 = (lap) =>
        firstValue(lap, ['driverName', 'pilotName', 'playerName', 'name', 'driver.displayName', 'driver.name', 'player.name', 'DriverName', 'steamName']) || 'Piloto';

      const carNameFromLapV1 = (lap) =>
        firstValue(lap, ['carName', 'carDisplayName', 'carVisibleName', 'car.name', 'car.displayName', 'vehicle', 'Car']) || '';

      const isLapInvalidV1 = (lap) => {
        const value = firstValue(lap, ['valid', 'isValid', 'Valid']);
        return value === 0 || value === false || value === '0' || value === 'false' || value === 'no';
      };

      const speedFromLapV1 = (lap) => {
        const raw = firstValue(lap, ['maxSpeedKmh', 'MaxSpeed_KMH', 'maxSpeed', 'speedKmh']);
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : 0;
      };

      const uniqueLapKeyV1 = (lap, index) => [
        firstValue(lap, ['lapId', 'LapId', 'id']),
        firstValue(lap, ['playerId', 'driverId', 'driver.id', 'PlayerId']),
        driverNameFromLapV1(lap),
        carNameFromLapV1(lap),
        firstValue(lap, ['trackName', 'track.displayName', 'track.name', 'Track']),
        firstValue(lap, ['lapTimeMs', 'LapTime', 'lapMs', 'lapTime', 'bestLapTime']),
        firstValue(lap, ['timestamp', 'timestampIso', 'createdAt'])
      ].filter(Boolean).join('|') || \`lap-\${index}\`;

      const averageV1 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

      const renderRaceStandoutsV1 = (rowsInput = []) => {
        const cleanRows = getArray(rowsInput)
          .filter(Boolean)
          .filter((row, index, array) => array.findIndex((candidate, candidateIndex) => uniqueLapKeyV1(candidate, candidateIndex) === uniqueLapKeyV1(row, index)) === index);

        const set = (selector, value) => setText(selector, value || '--');

        if (!cleanRows.length) {
          set('[data-home2-standout-most-laps]', '--');
          set('[data-home2-standout-best-average]', '--');
          set('[data-home2-standout-cleanest]', '--');
          set('[data-home2-standout-vmax]', '--');
          set('[data-home2-standout-last-driver]', '--');
          set('[data-home2-standout-duel]', '--');
          return;
        }

        const byDriver = new Map();

        cleanRows.forEach((lap) => {
          const name = driverNameFromLapV1(lap);
          const key = slugify(name);
          if (!key) return;

          const lapMs = rankTimeValue(lap);
          const valid = !isLapInvalidV1(lap);
          const speed = speedFromLapV1(lap);
          const date = lapDateFromRow(lap);

          if (!byDriver.has(key)) {
            byDriver.set(key, {
              name,
              laps: 0,
              valid: 0,
              invalid: 0,
              times: [],
              bestMs: Number.POSITIVE_INFINITY,
              bestLap: null,
              maxSpeed: 0,
              maxSpeedCar: '',
              lastDate: null,
              lastLap: null
            });
          }

          const item = byDriver.get(key);
          item.laps += 1;
          if (valid) item.valid += 1;
          else item.invalid += 1;

          if (valid && Number.isFinite(lapMs) && lapMs !== Number.POSITIVE_INFINITY) {
            item.times.push(lapMs);
            if (lapMs < item.bestMs) {
              item.bestMs = lapMs;
              item.bestLap = lap;
            }
          }

          if (speed > item.maxSpeed) {
            item.maxSpeed = speed;
            item.maxSpeedCar = carNameFromLapV1(lap);
          }

          if (date && (!item.lastDate || date.getTime() > item.lastDate.getTime())) {
            item.lastDate = date;
            item.lastLap = lap;
          }
        });

        const drivers = [...byDriver.values()].filter((item) => item.laps > 0);

        const mostLaps = drivers.slice().sort((a, b) => b.laps - a.laps || b.valid - a.valid)[0];

        const averageCandidates = drivers
          .map((item) => {
            const top = item.times.slice().sort((a, b) => a - b).slice(0, Math.min(5, Math.max(3, item.times.length)));
            return { ...item, avg: averageV1(top), samples: top.length };
          })
          .filter((item) => item.samples >= 3 && item.avg > 0)
          .sort((a, b) => a.avg - b.avg);

        const bestAverage = averageCandidates[0];

        const cleanest = drivers
          .filter((item) => item.laps >= 3)
          .map((item) => ({ ...item, cleanRate: item.laps ? item.valid / item.laps : 0 }))
          .sort((a, b) => b.cleanRate - a.cleanRate || b.valid - a.valid || b.laps - a.laps)[0];

        const speedKing = drivers
          .filter((item) => item.maxSpeed > 0)
          .sort((a, b) => b.maxSpeed - a.maxSpeed)[0];

        const latest = drivers
          .filter((item) => item.lastDate)
          .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())[0];

        const bestByDriver = drivers
          .filter((item) => Number.isFinite(item.bestMs) && item.bestMs !== Number.POSITIVE_INFINITY)
          .sort((a, b) => a.bestMs - b.bestMs);

        let closest = null;
        for (let i = 0; i < bestByDriver.length - 1; i += 1) {
          const a = bestByDriver[i];
          const b = bestByDriver[i + 1];
          const gap = Math.abs(b.bestMs - a.bestMs);
          if (!closest || gap < closest.gap) closest = { a, b, gap };
        }

        if (mostLaps) {
          set('[data-home2-standout-most-laps]', mostLaps.name);
          set('[data-home2-standout-most-laps-meta]', \`\${mostLaps.laps} vueltas · \${mostLaps.valid} válidas\`);
        }

        if (bestAverage) {
          set('[data-home2-standout-best-average]', bestAverage.name);
          set('[data-home2-standout-best-average-meta]', \`\${formatLap(Math.round(bestAverage.avg))} media top \${bestAverage.samples}\`);
        } else {
          set('[data-home2-standout-best-average]', bestByDriver[0]?.name || '--');
          set('[data-home2-standout-best-average-meta]', bestByDriver[0] ? \`\${formatLap(bestByDriver[0].bestMs)} mejor vuelta\` : 'top 5 vueltas');
        }

        if (cleanest) {
          set('[data-home2-standout-cleanest]', cleanest.name);
          set('[data-home2-standout-cleanest-meta]', \`\${Math.round(cleanest.cleanRate * 100)}% válidas · \${cleanest.laps} vueltas\`);
        }

        if (speedKing) {
          set('[data-home2-standout-vmax]', speedKing.name);
          set('[data-home2-standout-vmax-meta]', \`\${Math.round(speedKing.maxSpeed)} km/h\${speedKing.maxSpeedCar ? ' · ' + speedKing.maxSpeedCar : ''}\`);
        }

        if (latest) {
          set('[data-home2-standout-last-driver]', latest.name);
          set('[data-home2-standout-last-driver-meta]', latest.lastDate ? \`hace \${formatAgo(latest.lastDate)}\` : 'actividad reciente');
        }

        if (closest) {
          const a = closest.a.name.split(' ')[0] || closest.a.name;
          const b = closest.b.name.split(' ')[0] || closest.b.name;
          set('[data-home2-standout-duel]', \`\${a} / \${b}\`);
          set('[data-home2-standout-duel-meta]', \`gap \${(closest.gap / 1000).toFixed(3)} s\`);
        }
      };

`;
    if (content.includes(helperAnchor)) {
      content = content.replace(helperAnchor, standoutsJs + helperAnchor);
    } else {
      report.warnings.push('No se pudo insertar JS de standouts. Anchor updateServerAgeFromFirstLap no encontrado.');
    }
  }

  if (!content.includes('globalStandoutsPayload')) {
    const leaderboardBlock = `        const leaderboardPayload =
          await fetchJson('/api/gc/leaderboard?scope=activeCombo&limit=25') ||
          await fetchJson('/api/gc/leaderboard?scope=currentCombo&limit=25') ||
          await fetchJson('/api/gc/leaderboard?scope=all&limit=200') ||
          await fetchJson('/api/gc/recent-laps?limit=200&sort=recent&valid=all') ||
          await fetchJson('/api/hotlaps?limit=200');
`;

    const leaderboardReplacement = `        const leaderboardPayload =
          await fetchJson('/api/gc/leaderboard?scope=activeCombo&limit=25') ||
          await fetchJson('/api/gc/leaderboard?scope=currentCombo&limit=25') ||
          await fetchJson('/api/gc/leaderboard?scope=global&valid=all&group=all&limit=200') ||
          await fetchJson('/api/gc/recent-laps?limit=200&sort=recent&valid=all') ||
          await fetchJson('/api/hotlaps?limit=200');

        const globalStandoutsPayload =
          await fetchJson('/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/leaderboard?scope=all&valid=all&group=all&limit=3000') ||
          await fetchJson('/api/gc/recent-laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/laps?limit=3000&sort=recent&valid=all') ||
          await fetchJson('/api/hotlaps?limit=3000&sort=recent&valid=all');
`;

    if (content.includes(leaderboardBlock)) {
      content = content.replace(leaderboardBlock, leaderboardReplacement);
    } else {
      report.warnings.push('No se pudo actualizar bloque leaderboardPayload/globalStandoutsPayload.');
    }
  }

  if (!content.includes('renderRaceStandoutsV1([')) {
    const boardAnchor = `        renderComboRanking(boardCandidates, track, carList);

        await Promise.all([`;
    const boardReplacement = `        renderComboRanking(boardCandidates, track, carList);

        renderRaceStandoutsV1([
          ...getArray(globalStandoutsPayload),
          ...boardCandidates,
          ...getArray(recentPayload)
        ]);

        await Promise.all([`;

    if (content.includes(boardAnchor)) {
      content = content.replace(boardAnchor, boardReplacement);
    } else {
      report.warnings.push('No se pudo insertar llamada renderRaceStandoutsV1.');
    }
  }

  writeIfChanged(rel, before, content);
}

function patchCss() {
  const rel = 'src/styles/home2.css';
  let content = read(rel);
  const before = content;

  if (!content.includes('GC_HOME2_SERVER_STRIP_STANDOUTS_V1_CSS')) {
    content += `

/* GC_HOME2_SERVER_STRIP_STANDOUTS_V1_CSS
   - Estado servidor pasa a barra horizontal estrecha bajo hero.
   - Hueco derecho se convierte en Race Standouts.
*/

.gc-home2-server-strip {
  position: relative;
  z-index: 6;
  margin-top: -34px !important;
  margin-bottom: 16px !important;
}

.gc-home2-server-strip__rail {
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

.gc-home2-server-strip__title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 0 14px;
  border-right: 1px solid rgba(255,255,255,.06);
  background: rgba(150,255,47,.035);
}

.gc-home2-server-strip__title strong {
  color: var(--text);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .10em;
  text-transform: uppercase;
  white-space: nowrap;
}

.gc-home2-server-strip__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin: 0;
}

.gc-home2-server-strip__grid > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border-right: 1px solid rgba(255,255,255,.055);
}

.gc-home2-server-strip__grid > div:last-child {
  border-right: 0;
}

.gc-home2-server-strip__grid dt {
  min-width: 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8.5px;
  font-weight: 850;
  line-height: 1.05;
  letter-spacing: .075em;
  text-transform: uppercase;
  white-space: normal;
}

.gc-home2-server-strip__grid dd {
  margin: 0;
  color: var(--green);
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 950;
  line-height: 1;
  letter-spacing: -.02em;
  text-align: right;
  white-space: nowrap;
}

.gc-home2-toprow {
  grid-template-columns: 1.02fr 1.34fr 1.56fr .86fr !important;
  margin-top: 0 !important;
}

.gc-home2-panel--standouts {
  min-height: 372px !important;
  padding: 14px !important;
}

.gc-home2-panel--standouts .gc-home2-panel__head {
  margin-bottom: 12px !important;
}

.gc-home2-panel--standouts .gc-home2-panel__head h2 {
  max-width: 14ch;
  font-size: 17px !important;
  line-height: .98 !important;
}

.gc-home2-standouts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.gc-home2-standouts-grid > div {
  min-width: 0;
  min-height: 58px;
  padding: 9px 9px 8px;
  border: 1px solid rgba(255,255,255,.055);
  background:
    radial-gradient(circle at 100% 0%, rgba(150,255,47,.065), transparent 4.8rem),
    rgba(255,255,255,.017);
}

.gc-home2-standout-card--wide {
  grid-column: 1 / -1;
  min-height: 62px !important;
}

.gc-home2-standouts-grid dt {
  margin: 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8.4px;
  font-weight: 850;
  line-height: 1.1;
  letter-spacing: .075em;
  text-transform: uppercase;
}

.gc-home2-standouts-grid dd {
  display: block;
  margin: 6px 0 0;
  min-width: 0;
  color: var(--text);
  font-size: 12.7px;
  font-weight: 950;
  line-height: 1.03;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gc-home2-standout-card--wide dd {
  color: var(--green);
  font-size: 15px;
}

.gc-home2-standouts-grid small {
  display: block;
  margin-top: 4px;
  min-width: 0;
  color: var(--muted);
  font-size: 9.4px;
  line-height: 1.12;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .gc-home2-server-strip {
    margin-top: 14px !important;
  }

  .gc-home2-server-strip__rail {
    grid-template-columns: 1fr;
  }

  .gc-home2-server-strip__title {
    min-height: 36px;
    border-right: 0;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }

  .gc-home2-server-strip__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .gc-home2-server-strip__grid > div:nth-child(3) {
    border-right: 0;
  }

  .gc-home2-server-strip__grid > div:nth-child(-n+3) {
    border-bottom: 1px solid rgba(255,255,255,.055);
  }

  .gc-home2-toprow {
    grid-template-columns: 1fr !important;
  }

  .gc-home2-panel--standouts {
    min-height: auto !important;
  }
}

@media (max-width: 760px) {
  .gc-home2-server-strip__grid,
  .gc-home2-standouts-grid {
    grid-template-columns: 1fr;
  }

  .gc-home2-server-strip__grid > div {
    border-right: 0;
    border-bottom: 1px solid rgba(255,255,255,.055);
  }

  .gc-home2-server-strip__grid > div:last-child {
    border-bottom: 0;
  }

  .gc-home2-standout-card--wide {
    grid-column: auto;
  }
}
`;
  }

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Home2 Server Strip + Standouts v1');
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
