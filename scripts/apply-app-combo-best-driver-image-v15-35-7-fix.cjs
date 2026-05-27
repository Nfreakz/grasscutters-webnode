const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP COMBO BEST FIX] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_COMBO_BEST_DRIVER_V15_35_7')) {
  console.log('[GC APP COMBO BEST FIX] v15.35.7 ya parece aplicado.');
  process.exit(0);
}

/**
 * 1) Reforzar match y tiempo. El bug venía de depender de datos de best global
 * o de tiempos formateados que lapMs no siempre sabe ordenar.
 */
const oldLapMs = `      const lapMs = (lap) => number(pick(lap, ['lapTimeMs','LapTime','lapTime','timeMs','time']), Number.POSITIVE_INFINITY);`;

const newLapMs = `      const lapMs = (lap) => {
        const raw = pick(lap, ['lapTimeMs','LapTime','lapTime','timeMs','time','lapTimeFormatted','timeFormatted','bestLap']);
        if (raw == null || raw === '') return Number.POSITIVE_INFINITY;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;

        const value = String(raw).trim();
        const direct = Number(value);
        if (Number.isFinite(direct)) return direct;

        const match = value.match(/^(?:(\\d+):)?(\\d{1,2})(?:\\.(\\d{1,3}))?$/);
        if (!match) return Number.POSITIVE_INFINITY;

        const minutes = Number(match[1] || 0);
        const seconds = Number(match[2] || 0);
        const millis = Number(String(match[3] || '0').padEnd(3, '0').slice(0, 3));
        return minutes * 60000 + seconds * 1000 + millis;
      };`;

if (content.includes(oldLapMs)) {
  content = content.replace(oldLapMs, newLapMs);
} else {
  console.warn('[GC APP COMBO BEST FIX] No encuentro lapMs exacto. Sigo.');
}

/**
 * 2) Insertar/reescribir helpers robustos.
 */
const helperStart = '      function comboNormalize(value){';
const helperEnd = '      function driverAvatarUrl(row){';

const robustHelpers = `      function comboNormalize(value){
        return text(value, '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }

      function comboTokens(value){
        return comboNormalize(value).split(' ').filter((token) => token.length > 2);
      }

      function comboWordMatch(a, b){
        const aa = comboNormalize(a);
        const bb = comboNormalize(b);
        if (!aa || !bb) return false;
        if (aa === bb) return true;
        if (aa.includes(bb) || bb.includes(aa)) return true;

        const aw = new Set(comboTokens(aa));
        const bw = comboTokens(bb);
        if (!aw.size || !bw.length) return false;

        let hits = 0;
        for (const token of bw) {
          if (aw.has(token)) hits += 1;
        }

        return hits >= Math.min(2, bw.length);
      }

      function comboBestRowFromCombo(combo){
        if (!combo || typeof combo !== 'object') return null;

        const track = comboTrackName(combo);
        const cars = comboCars(combo).slice(0, 8);
        const nested = pick(combo, ['bestLap','fastestLap','leaderLap','recordLap','best','best_lap','fastest_lap']);

        if (nested && typeof nested === 'object') {
          return {
            ...nested,
            trackName: trackName(nested) !== 'Circuito' ? trackName(nested) : track,
            carName: carName(nested) !== 'Coche' ? carName(nested) : (cars[0] || 'Coche'),
            driverName: driverName(nested) !== 'Piloto' ? driverName(nested) : comboBestDriver(combo),
            lapTimeFormatted: comboBestTime(combo) || lapTime(nested),
            playerId: pick(nested, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']) || pick(combo, ['bestPlayerId','bestDriverId','fastestPlayerId','fastestDriverId']),
          };
        }

        const time = comboBestTime(combo);
        const name = comboBestDriver(combo);
        if (!time || time === '--' || !name || name === 'Piloto') return null;

        return {
          driverName: name,
          lapTimeFormatted: time,
          carName: cars[0] || 'Coche',
          trackName: track,
          playerId: pick(combo, ['bestPlayerId','bestDriverId','fastestPlayerId','fastestDriverId']),
        };
      }

      function lapMatchesActiveCombo(row){
        const active = window.GCAppActiveComboV1535 || null;
        if (!active) return false;

        const rowTrack = trackName(row);
        const rowCar = carName(row);
        const trackOk = active.track ? comboWordMatch(rowTrack, active.track) : true;
        const cars = Array.isArray(active.cars) ? active.cars : [];
        const carOk = !cars.length || cars.some((car) => comboWordMatch(rowCar, car));

        return trackOk && carOk;
      }

      function selectBestForActiveCombo(bestItems, recentItems){
        const comboRow = window.GCAppActiveComboBestRowV1535 || null;
        if (comboRow && lapTime(comboRow) && lapTime(comboRow) !== '--' && lapMs(comboRow) !== Number.POSITIVE_INFINITY) {
          return comboRow;
        }

        const recentPool = [...(recentItems || [])].filter(Boolean);
        const bestPool = [...(bestItems || [])].filter(Boolean);
        const combined = [...recentPool, ...bestPool];

        const comboPool = combined
          .filter(lapMatchesActiveCombo)
          .filter((row) => lapMs(row) !== Number.POSITIVE_INFINITY)
          .sort((a, b) => lapMs(a) - lapMs(b));

        if (comboPool[0]) return comboPool[0];

        // Fallback controlado: si no conseguimos cruzar coche+circuito, usamos solo circuito activo.
        const active = window.GCAppActiveComboV1535 || null;
        if (active?.track) {
          const trackOnly = combined
            .filter((row) => comboWordMatch(trackName(row), active.track))
            .filter((row) => lapMs(row) !== Number.POSITIVE_INFINITY)
            .sort((a, b) => lapMs(a) - lapMs(b));

          if (trackOnly[0]) return trackOnly[0];
        }

        return null;
      }

`;

if (content.includes(helperStart) && content.includes(helperEnd)) {
  const start = content.indexOf(helperStart);
  const end = content.indexOf(helperEnd, start);
  content = content.slice(0, start) + robustHelpers + content.slice(end);
} else if (!content.includes('function selectBestForActiveCombo(bestItems, recentItems)')) {
  const renderLapAnchor = content.match(/(\n\s*)function\s+renderLapReadout\s*\(/);
  if (!renderLapAnchor || renderLapAnchor.index === undefined) {
    console.error('[GC APP COMBO BEST FIX] No encuentro punto para insertar helpers.');
    process.exit(1);
  }
  content = content.slice(0, renderLapAnchor.index + renderLapAnchor[1].length) + robustHelpers + content.slice(renderLapAnchor.index + renderLapAnchor[1].length);
}

/**
 * 3) Asegurar que renderCombo guarde el combo activo.
 */
if (!content.includes('window.GCAppActiveComboV1535 = { track, cars };')) {
  const candidates = [
    `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0,8);`,
    `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0, 8);`
  ];

  let replaced = false;
  for (const candidate of candidates) {
    if (content.includes(candidate)) {
      const replacement = candidate + `
          window.GCAppActiveComboV1535 = { track, cars };
          window.GCAppActiveComboBestRowV1535 = comboBestRowFromCombo(activeCombo);`;
      content = content.replace(candidate, replacement);
      replaced = true;
      break;
    }
  }

  if (!replaced) console.warn('[GC APP COMBO BEST FIX] No encuentro track/cars activeCombo.');
}

/**
 * 4) Asegurar llamada correcta a renderTopDriver.
 */
content = content.replace(/renderTopDriver\(best\);/g, 'renderTopDriver(selectBestForActiveCombo(bestItems, recentItems));');

if (!content.includes('renderTopDriver(selectBestForActiveCombo(bestItems, recentItems));')) {
  const quickRefsIndex = content.indexOf("setText('gcQuickRefs'");
  if (quickRefsIndex !== -1) {
    content = content.slice(0, quickRefsIndex) + 'renderTopDriver(selectBestForActiveCombo(bestItems, recentItems));\n        ' + content.slice(quickRefsIndex);
  } else {
    console.warn('[GC APP COMBO BEST FIX] No encuentro gcQuickRefs para insertar renderTopDriver.');
  }
}

/**
 * 5) Subir hotlaps limit, por si aún estaba en 12.
 */
content = content.replace(/\/api\/hotlaps\?limit=12/g, '/api/hotlaps?limit=300');

/**
 * 6) Forzar imagen de Mugello incluso si GCTrackImages no añade clase.
 * Además: muchísimo menos filtro.
 */
const css = `
    /* GC_APP_COMBO_BEST_DRIVER_V15_35_7 */
    .gc-app-combo-v3[data-track-name*="Mugello"],
    .gc-app-combo-v3[data-track-name*="mugello"],
    .gc-app-combo-v3.has-track-image{
      background:
        radial-gradient(circle at 18% 14%, color-mix(in srgb,var(--accent,#9dff00) 7%,transparent), transparent 18rem),
        color-mix(in srgb,var(--panel,#07110a) 86%,#000)!important;
    }

    .gc-app-combo-v3[data-track-name*="Mugello"]::before,
    .gc-app-combo-v3[data-track-name*="mugello"]::before{
      content:""!important;
      position:absolute!important;
      inset:0!important;
      z-index:0!important;
      pointer-events:none!important;
      background-image:url("/images/tracks/mugello.webp")!important;
      background-size:cover!important;
      background-position:center!important;
      opacity:.88!important;
      filter:blur(.65px) saturate(1.08) contrast(1.04) brightness(.76)!important;
      transform:scale(1.012)!important;
    }

    .gc-app-combo-v3.has-track-image::before{
      opacity:.88!important;
      filter:blur(.65px) saturate(1.08) contrast(1.04) brightness(.76)!important;
      transform:scale(1.012)!important;
    }

    .gc-app-combo-v3[data-track-name*="Mugello"]::after,
    .gc-app-combo-v3[data-track-name*="mugello"]::after,
    .gc-app-combo-v3.has-track-image::after{
      background:
        linear-gradient(90deg,rgba(3,10,5,.72),rgba(3,10,5,.30) 46%,rgba(3,10,5,.48)),
        linear-gradient(180deg,rgba(3,10,5,.22),rgba(3,10,5,.62)),
        radial-gradient(circle at 13% 22%, color-mix(in srgb,var(--accent,#9dff00) 10%,transparent), transparent 28rem)!important;
    }

    .gc-app-combo-v3[data-track-name*="Mugello"] > *,
    .gc-app-combo-v3[data-track-name*="mugello"] > *,
    .gc-app-combo-v3.has-track-image > *{
      position:relative!important;
      z-index:2!important;
    }

    .gc-app-top-driver-v1535__body span{
      color:var(--accent);
    }
`;

if (!content.includes('GC_APP_COMBO_BEST_DRIVER_V15_35_7')) {
  const close = '  </style>';
  if (!content.includes(close)) {
    console.error('[GC APP COMBO BEST FIX] No encuentro cierre </style>.');
    process.exit(1);
  }
  content = content.replace(close, css + '\n' + close);
}

const backup = target + '.bak-v15-35-7-combo-best-driver';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP COMBO BEST FIX] v15.35.7 aplicado.');
console.log('[GC APP COMBO BEST FIX] Backup: ' + backup);
console.log('[GC APP COMBO BEST FIX] Ejecuta: npm run build');
