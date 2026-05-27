const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP COMBO BEST] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_COMBO_BEST_DRIVER_V15_35_6')) {
  console.log('[GC APP COMBO BEST] v15.35.6 ya parece aplicado.');
  process.exit(0);
}

/**
 * 1) Asegurar card de mejor piloto si no existe.
 */
const topDriverCard = `
        <div class="gc-app-top-driver-v1535" aria-label="Mejor piloto del combo">
          <div class="gc-app-top-driver-v1535__avatar">
            <img id="gcTopDriverAvatar" src="/images/pilot-avatar-default.png" alt="" loading="lazy" decoding="async" />
          </div>
          <div class="gc-app-top-driver-v1535__body">
            <span>Mejor piloto combo</span>
            <strong id="gcTopDriverName">--</strong>
            <small id="gcTopDriverMeta">Sin referencia cargada</small>
          </div>
          <div class="gc-app-top-driver-v1535__time">
            <span>Tiempo</span>
            <strong id="gcTopDriverTime">--</strong>
          </div>
        </div>
`;

if (!content.includes('gc-app-top-driver-v1535')) {
  const markerIndex = content.indexOf('gcQuickDbMeta');
  if (markerIndex === -1) {
    console.error('[GC APP COMBO BEST] No encuentro gcQuickDbMeta. No puedo localizar Lectura de pista.');
    process.exit(1);
  }

  const articleEndIndex = content.indexOf('</article>', markerIndex);
  if (articleEndIndex === -1) {
    console.error('[GC APP COMBO BEST] No encuentro cierre </article> después de gcQuickDbMeta.');
    process.exit(1);
  }

  content = content.slice(0, articleEndIndex) + topDriverCard + content.slice(articleEndIndex);
} else {
  content = content.replace('Mejor piloto</span>', 'Mejor piloto combo</span>');
}

/**
 * 2) Insertar helpers para seleccionar el mejor piloto DEL COMBO.
 */
const helper = `      function comboNormalize(value){
        return text(value, '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }

      function comboWordMatch(a, b){
        const aa = comboNormalize(a);
        const bb = comboNormalize(b);
        if (!aa || !bb) return false;
        if (aa === bb) return true;
        if (aa.includes(bb) || bb.includes(aa)) return true;
        const aw = new Set(aa.split(' ').filter((x) => x.length > 2));
        const bw = bb.split(' ').filter((x) => x.length > 2);
        return bw.some((x) => aw.has(x));
      }

      function comboBestRowFromCombo(combo){
        if (!combo || typeof combo !== 'object') return null;

        const track = comboTrackName(combo);
        const cars = comboCars(combo).slice(0, 8);
        const nested = pick(combo, ['bestLap','fastestLap','leaderLap','recordLap','best']);

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
        if (comboRow && lapTime(comboRow) && lapTime(comboRow) !== '--') return comboRow;

        const pool = [...(bestItems || []), ...(recentItems || [])].filter(Boolean);
        const comboPool = pool.filter(lapMatchesActiveCombo).sort((a, b) => lapMs(a) - lapMs(b));
        return comboPool[0] || null;
      }

`;

if (!content.includes('function selectBestForActiveCombo(bestItems, recentItems)')) {
  const anchor = content.indexOf('function driverAvatarUrl(row)');
  if (anchor !== -1) {
    content = content.slice(0, anchor) + helper + content.slice(anchor);
  } else {
    const renderLapAnchor = content.match(/(\n\s*)function\s+renderLapReadout\s*\(/);
    if (!renderLapAnchor || renderLapAnchor.index === undefined) {
      console.error('[GC APP COMBO BEST] No encuentro punto para insertar helpers.');
      process.exit(1);
    }
    content = content.slice(0, renderLapAnchor.index + renderLapAnchor[1].length) + helper + content.slice(renderLapAnchor.index + renderLapAnchor[1].length);
  }
}

/**
 * 3) Guardar criterio de combo activo y best row desde renderCombo.
 */
if (!content.includes('GCAppActiveComboBestRowV1535')) {
  const activeTrackCars = `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0,8);`;

  const activeTrackCarsSpaced = `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0, 8);`;

  const activeInject = `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0,8);
          window.GCAppActiveComboV1535 = { track, cars };
          window.GCAppActiveComboBestRowV1535 = comboBestRowFromCombo(activeCombo);`;

  const activeInjectSpaced = `          const track = comboTrackName(activeCombo);
          const cars = comboCars(activeCombo).slice(0, 8);
          window.GCAppActiveComboV1535 = { track, cars };
          window.GCAppActiveComboBestRowV1535 = comboBestRowFromCombo(activeCombo);`;

  if (content.includes(activeTrackCars)) {
    content = content.replace(activeTrackCars, activeInject);
  } else if (content.includes(activeTrackCarsSpaced)) {
    content = content.replace(activeTrackCarsSpaced, activeInjectSpaced);
  } else {
    console.warn('[GC APP COMBO BEST] No encuentro track/cars de activeCombo. Sigo con fallback por laps.');
  }

  const latestLapTrackCar = `          const track = trackName(latestLap);
          const car = carName(latestLap);`;

  const latestLapInject = `          const track = trackName(latestLap);
          const car = carName(latestLap);
          window.GCAppActiveComboV1535 = { track, cars: [car] };
          window.GCAppActiveComboBestRowV1535 = null;`;

  if (content.includes(latestLapTrackCar)) {
    content = content.replace(latestLapTrackCar, latestLapInject);
  }
}

/**
 * 4) Cambiar renderTopDriver(best) por mejor del combo.
 */
content = content.replace(/renderTopDriver\(best\);/g, 'renderTopDriver(selectBestForActiveCombo(bestItems, recentItems));');

/**
 * 5) Subir límite de hotlaps para tener más opciones al filtrar combo.
 */
content = content.replace("/api/hotlaps?limit=12", "/api/hotlaps?limit=300");

/**
 * 6) CSS: imagen de circuito mucho más visible y menos filtro.
 */
const css = `
    /* GC_APP_COMBO_BEST_DRIVER_V15_35_6 */
    .gc-app-combo-v3.has-track-image::before{
      opacity:.82!important;
      filter:blur(1.15px) saturate(1.08) contrast(1.02) brightness(.72)!important;
      transform:scale(1.018)!important;
    }

    .gc-app-combo-v3.has-track-image::after{
      background:
        linear-gradient(90deg,rgba(3,10,5,.78),rgba(3,10,5,.40) 44%,rgba(3,10,5,.56)),
        linear-gradient(180deg,rgba(3,10,5,.25),rgba(3,10,5,.68)),
        radial-gradient(circle at 13% 22%, color-mix(in srgb,var(--accent,#9dff00) 13%,transparent), transparent 28rem)!important;
    }

    .gc-app-top-driver-v1535__body span::after{
      content:"";
    }

    .gc-app-top-driver-v1535{
      border-color:color-mix(in srgb,var(--accent,#9dff00) 34%,rgba(255,255,255,.10));
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 18%,transparent), transparent 9rem),
        linear-gradient(135deg,rgba(255,255,255,.065),rgba(255,255,255,.02)),
        rgba(0,0,0,.20);
    }
`;

if (!content.includes('GC_APP_COMBO_BEST_DRIVER_V15_35_6')) {
  const close = '  </style>';
  if (!content.includes(close)) {
    console.error('[GC APP COMBO BEST] No encuentro cierre </style>.');
    process.exit(1);
  }
  content = content.replace(close, css + '\n' + close);
}

const backup = target + '.bak-v15-35-6-combo-best-driver';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP COMBO BEST] v15.35.6 aplicado.');
console.log('[GC APP COMBO BEST] Backup: ' + backup);
console.log('[GC APP COMBO BEST] Ejecuta: npm run build');
