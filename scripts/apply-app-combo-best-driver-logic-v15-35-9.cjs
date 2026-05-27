const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP BEST LOGIC] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_COMBO_BEST_DRIVER_LOGIC_V15_35_9')) {
  console.log('[GC APP BEST LOGIC] v15.35.9 ya parece aplicado.');
  process.exit(0);
}

/**
 * 1) Hacer lapMs capaz de ordenar tiempos formateados.
 */
const oldLapMs = `      const lapMs = (lap) => number(pick(lap, ['lapTimeMs','LapTime','lapTime','timeMs','time']), Number.POSITIVE_INFINITY);`;

const newLapMs = `      const lapMs = (lap) => {
        const raw = pick(lap, ['lapTimeMs','LapTime','lapTime','timeMs','time','lapTimeFormatted','timeFormatted','bestLap','bestTime']);
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
}

/**
 * 2) Añadir helper independiente para calcular mejor piloto del combo activo.
 */
const helper = `      /* GC_APP_COMBO_BEST_DRIVER_LOGIC_V15_35_9 START */
      function gcBestNorm(value){
        return text(value, '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }

      function gcBestTokens(value){
        return gcBestNorm(value).split(' ').filter((token) => token.length > 2);
      }

      function gcBestMatch(a, b){
        const aa = gcBestNorm(a);
        const bb = gcBestNorm(b);
        if (!aa || !bb) return false;
        if (aa === bb) return true;
        if (aa.includes(bb) || bb.includes(aa)) return true;

        const aw = new Set(gcBestTokens(aa));
        const bw = gcBestTokens(bb);
        if (!aw.size || !bw.length) return false;

        let hits = 0;
        for (const token of bw) {
          if (aw.has(token)) hits += 1;
        }

        return hits >= Math.min(2, bw.length);
      }

      function gcBestActiveCombo(combosData){
        const combos = items(combosData).filter(Boolean);
        if (!combos.length) return null;

        return [...combos].sort((a, b) => {
          const last = comboLastMs(b) - comboLastMs(a);
          if (last) return last;
          return comboTotalLaps(b) - comboTotalLaps(a);
        })[0] || null;
      }

      function gcBestRowFromComboObject(combo){
        if (!combo || typeof combo !== 'object') return null;

        const track = comboTrackName(combo);
        const cars = comboCars(combo).slice(0, 8);
        const nested = pick(combo, ['bestLap','fastestLap','leaderLap','recordLap','best','best_lap','fastest_lap']);

        if (nested && typeof nested === 'object') {
          return {
            ...nested,
            driverName: driverName(nested) !== 'Piloto' ? driverName(nested) : comboBestDriver(combo),
            carName: carName(nested) !== 'Coche' ? carName(nested) : (cars[0] || 'Coche'),
            trackName: trackName(nested) !== 'Circuito' ? trackName(nested) : track,
            lapTimeFormatted: comboBestTime(combo) || lapTime(nested),
            playerId: pick(nested, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']) || pick(combo, ['bestPlayerId','bestDriverId','fastestPlayerId','fastestDriverId']),
          };
        }

        const comboTime = comboBestTime(combo);
        const comboDriver = comboBestDriver(combo);

        if (comboTime && comboTime !== '--' && comboDriver && comboDriver !== 'Piloto') {
          return {
            driverName: comboDriver,
            carName: cars[0] || 'Coche',
            trackName: track,
            lapTimeFormatted: comboTime,
            playerId: pick(combo, ['bestPlayerId','bestDriverId','fastestPlayerId','fastestDriverId']),
          };
        }

        return null;
      }

      function gcBestLapMatchesCombo(row, combo, mode = 'track-car'){
        if (!row || !combo) return false;

        const comboTrack = comboTrackName(combo);
        const comboCars = comboCars(combo).slice(0, 12);
        const rowTrack = trackName(row);
        const rowCar = carName(row);

        const trackOk = comboTrack ? gcBestMatch(rowTrack, comboTrack) : true;
        if (!trackOk) return false;

        if (mode === 'track-only') return true;

        if (!comboCars.length) return true;
        return comboCars.some((car) => gcBestMatch(rowCar, car));
      }

      function gcBestSelectComboDriver(combosData, recentData, bestData){
        const combo = gcBestActiveCombo(combosData);
        const comboDirect = gcBestRowFromComboObject(combo);

        if (comboDirect && lapMs(comboDirect) !== Number.POSITIVE_INFINITY) {
          return comboDirect;
        }

        const recent = items(recentData).filter(Boolean);
        const best = items(bestData).filter(Boolean);
        const pool = [...recent, ...best]
          .filter((row) => lapMs(row) !== Number.POSITIVE_INFINITY);

        if (!combo) {
          return pool.sort((a, b) => lapMs(a) - lapMs(b))[0] || null;
        }

        const exact = pool
          .filter((row) => gcBestLapMatchesCombo(row, combo, 'track-car'))
          .sort((a, b) => lapMs(a) - lapMs(b));

        if (exact[0]) return exact[0];

        const trackOnly = pool
          .filter((row) => gcBestLapMatchesCombo(row, combo, 'track-only'))
          .sort((a, b) => lapMs(a) - lapMs(b));

        return trackOnly[0] || null;
      }

      function gcBestRenderComboDriver(combosData, recentData, bestData){
        const row = gcBestSelectComboDriver(combosData, recentData, bestData);
        renderTopDriver(row);

        if (row) {
          console.info('[GC /app] Mejor piloto combo', {
            driver: driverName(row),
            car: carName(row),
            track: trackName(row),
            time: lapTime(row),
            ms: lapMs(row),
          });
        } else {
          console.warn('[GC /app] No se pudo calcular mejor piloto combo', {
            combos: items(combosData).length,
            recent: items(recentData).length,
            best: items(bestData).length,
          });
        }
      }
      /* GC_APP_COMBO_BEST_DRIVER_LOGIC_V15_35_9 END */

`;

if (!content.includes('function gcBestRenderComboDriver(combosData, recentData, bestData)')) {
  const anchor = content.indexOf('function renderTopDriver(row)');
  if (anchor !== -1) {
    content = content.slice(0, anchor) + helper + content.slice(anchor);
  } else {
    const renderLapAnchor = content.match(/(\n\s*)function\s+renderLapReadout\s*\(/);
    if (!renderLapAnchor || renderLapAnchor.index === undefined) {
      console.error('[GC APP BEST LOGIC] No encuentro punto para insertar helper.');
      process.exit(1);
    }
    content = content.slice(0, renderLapAnchor.index + renderLapAnchor[1].length) + helper + content.slice(renderLapAnchor.index + renderLapAnchor[1].length);
  }
}

/**
 * 3) Asegurar renderTopDriver existe.
 */
if (!content.includes('function renderTopDriver(row)')) {
  const avatarHelper = `      function driverAvatarUrl(row){
        const id = pick(row, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']);
        const direct = pick(row, ['avatarUrl','avatar_url','driver.avatarUrl','player.avatarUrl','pilot.avatarUrl']);
        if (direct) return String(direct);
        if (id !== undefined && id !== null && id !== '') return \`/api/pilot-avatar/\${encodeURIComponent(String(id))}\`;
        return '/images/pilot-avatar-default.png';
      }

      function renderTopDriver(row){
        const avatar = byId('gcTopDriverAvatar');
        const name = row ? driverName(row) : '--';
        const car = row ? carName(row) : '';
        const track = row ? trackName(row) : '';
        const time = row ? lapTime(row) : '--';
        const meta = row
          ? [car, track].filter(Boolean).join(' · ')
          : 'Sin referencia cargada';

        setText('gcTopDriverName', name || '--');
        setText('gcTopDriverTime', time || '--');
        setText('gcTopDriverMeta', meta || 'Sin referencia cargada');

        if (avatar) {
          avatar.src = row ? driverAvatarUrl(row) : '/images/pilot-avatar-default.png';
          avatar.alt = row ? \`Avatar de \${name}\` : '';
          avatar.onerror = () => {
            avatar.onerror = null;
            avatar.src = '/images/pilot-avatar-default.png';
          };
        }
      }

`;
  const renderLapAnchor = content.match(/(\n\s*)function\s+renderLapReadout\s*\(/);
  if (!renderLapAnchor || renderLapAnchor.index === undefined) {
    console.error('[GC APP BEST LOGIC] No encuentro renderLapReadout para insertar renderTopDriver.');
    process.exit(1);
  }
  content = content.slice(0, renderLapAnchor.index + renderLapAnchor[1].length) + avatarHelper + content.slice(renderLapAnchor.index + renderLapAnchor[1].length);
}

/**
 * 4) Evitar que renderLapReadout deje la tarjeta en null después.
 */
content = content.replace(/renderTopDriver\(selectBestForActiveCombo\(bestItems,\s*recentItems\)\);\s*/g, '');
content = content.replace(/renderTopDriver\(best\);\s*/g, '');

/**
 * 5) Llamar cálculo final después de renderLapReadout, con todos los datos cargados.
 */
const callNeedle = `        renderLapReadout(bestHotlaps, recentLaps);
        renderStracker(stracker, recentLaps, bestHotlaps, combosData);`;

const callReplacement = `        renderLapReadout(bestHotlaps, recentLaps);
        gcBestRenderComboDriver(combosData, recentLaps, bestHotlaps);
        renderStracker(stracker, recentLaps, bestHotlaps, combosData);`;

if (content.includes(callNeedle)) {
  content = content.replace(callNeedle, callReplacement);
} else if (!content.includes('gcBestRenderComboDriver(combosData, recentLaps, bestHotlaps);')) {
  console.error('[GC APP BEST LOGIC] No encuentro el bloque de llamadas en loadDashboard.');
  process.exit(1);
}

/**
 * 6) Subir hotlaps si estaba bajo.
 */
content = content.replace(/\/api\/hotlaps\?limit=12/g, '/api/hotlaps?limit=300');

/**
 * 7) CSS mínimo solo si hace falta mejorar estado vacío. NO tocar imágenes/assets.
 */
const css = `
    /* GC_APP_COMBO_BEST_DRIVER_LOGIC_V15_35_9_STYLE */
    .gc-app-top-driver-v1535__body span{
      color:var(--accent);
    }

    .gc-app-top-driver-v1535__time strong:not(:empty){
      font-variant-numeric:tabular-nums;
    }
`;

if (!content.includes('GC_APP_COMBO_BEST_DRIVER_LOGIC_V15_35_9_STYLE')) {
  const close = '  </style>';
  if (!content.includes(close)) {
    console.error('[GC APP BEST LOGIC] No encuentro cierre </style>.');
    process.exit(1);
  }
  content = content.replace(close, css + '\n' + close);
}

const backup = target + '.bak-v15-35-9-combo-best-driver-logic';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP BEST LOGIC] v15.35.9 aplicado.');
console.log('[GC APP BEST LOGIC] Backup: ' + backup);
console.log('[GC APP BEST LOGIC] Ejecuta: npm run build');
