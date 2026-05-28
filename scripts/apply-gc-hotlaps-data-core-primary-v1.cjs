#!/usr/bin/env node
/* GC_HOTLAPS_DATA_CORE_PRIMARY_V1_APPLY
 * Upgrades /hotlaps Data Core bridge into a primary loader.
 * Does not delete legacy code yet. Data Core becomes final visible source.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const hotlapsPath = path.join(root, 'src', 'pages', 'hotlaps.astro');

const OLD_START = '/* GC_HOTLAPS_DATA_CORE_BRIDGE_V1_START */';
const OLD_END = '/* GC_HOTLAPS_DATA_CORE_BRIDGE_V1_END */';
const START = '/* GC_HOTLAPS_DATA_CORE_PRIMARY_V1_START */';
const END = '/* GC_HOTLAPS_DATA_CORE_PRIMARY_V1_END */';

if (!fs.existsSync(hotlapsPath)) {
  console.error('[GC HOTLAPS PRIMARY] Missing src/pages/hotlaps.astro');
  process.exit(1);
}

let source = fs.readFileSync(hotlapsPath, 'utf8');

const primaryBlock = `
  <script is:inline>
    ${START}
    (() => {
      const CONFIG = { refreshMs: 30000, settleDelayMs: 500, retryDelayMs: 2500 };

      const els = {
        search: document.getElementById('hotlapSearch'),
        driver: document.getElementById('driverFilter'),
        car: document.getElementById('carFilter'),
        track: document.getElementById('trackFilter'),
        valid: document.getElementById('validFilter'),
        sort: document.getElementById('sortFilter'),
        reload: document.getElementById('reloadHotlaps'),
        clear: document.getElementById('clearFilters'),
        activeTrackButton: document.getElementById('activeTrackButton'),
        rows: document.getElementById('hotlapRows'),
        loaded: document.getElementById('hotlapLoaded'),
        visible: document.getElementById('hotlapVisible'),
        updated: document.getElementById('hotlapUpdated'),
        hint: document.getElementById('leaderboardHint'),
        order: document.getElementById('leaderboardOrder'),
        source: document.getElementById('hotlapSource'),
        activeTrackChip: document.getElementById('activeTrackChip'),
        metricTrack: document.getElementById('hotlapMetricTrack'),
        metricTrackMeta: document.getElementById('hotlapMetricTrackMeta'),
        metricBest: document.getElementById('hotlapMetricBest'),
        metricBestMeta: document.getElementById('hotlapMetricBestMeta'),
        metricDrivers: document.getElementById('hotlapMetricDrivers'),
        metricSpeed: document.getElementById('hotlapMetricSpeed'),
        metricSpeedMeta: document.getElementById('hotlapMetricSpeedMeta')
      };

      if (!els.rows) return;

      const state = {
        cache: [],
        snapshot: null,
        activeTrackValue: 'all',
        activeTrackLabel: 'Último circuito activo',
        coreReady: false,
        lastGood: null,
        running: false,
        timer: null
      };

      const rankBadgeMap = {
        1: '/ui/leaderboard/rank-1.png',
        2: '/ui/leaderboard/rank-2.png',
        3: '/ui/leaderboard/rank-3.png'
      };

      const escapeHtml = (value) => String(value ?? '-').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char]));

      const number = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const valueAt = (source, path) => {
        if (!source || typeof source !== 'object') return undefined;
        if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
        return String(path).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
      };

      const pick = (source, paths) => {
        for (const path of paths) {
          const value = valueAt(source, path);
          if (value !== undefined && value !== null && value !== '') return value;
        }
        return undefined;
      };

      const list = (data) => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        return data.items || data.data?.items || data.data?.leaderboard || data.data?.laps || data.leaderboard || data.laps || data.hotlaps || [];
      };

      const text = (value, fallback = '-') => {
        if (value == null || value === '') return fallback;
        if (Array.isArray(value)) return value.length ? text(value[0], fallback) : fallback;
        if (typeof value === 'object') {
          return text(value.displayName ?? value.visibleName ?? value.cleanName ?? value.display_name ?? value.uiName ?? value.uiCarName ?? value.uiTrackName ?? value.name ?? value.Name ?? value.driverName ?? value.playerName ?? value.code, fallback);
        }
        return String(value).replace(/_/g, ' ').replace(/\\s+/g, ' ').trim() || fallback;
      };

      const normalize = (value) => text(value, '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .trim();

      const driverName = (row) => text(pick(row, ['driver.displayName','driver.visibleName','driver.name','driverDisplayName','driverVisibleName','driverName','playerName','pilotName','name']), 'Piloto');
      const carName = (row) => text(pick(row, ['car.displayName','car.visibleName','car.name','carDisplayName','carVisibleName','carName','uiCarName']), 'Coche');
      const trackName = (row) => text(pick(row, ['track.displayName','track.visibleName','track.name','trackDisplayName','trackVisibleName','trackName','uiTrackName']), 'Circuito');

      const playerId = (row) => pick(row, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']);

      const lapMs = (row) => {
        const raw = pick(row, ['lapTimeMs','bestLapMs','timeMs','LapTime']);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };

      const fmtMs = (value) => {
        const ms = number(value, 0);
        if (!ms) return '--';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const millis = Math.floor(ms % 1000);
        return \`\${minutes}:\${String(seconds).padStart(2, '0')}.\${String(millis).padStart(3, '0')}\`;
      };

      const lapDisplay = (row) => text(pick(row, ['lapTimeFormatted','lapTimeText','bestLapTime','bestLap','timeFormatted']), '') || fmtMs(lapMs(row));

      const speedValue = (row) => {
        const raw = pick(row, ['maxSpeedKmh','maxSpeed','speedKmh','MaxSpeed_KMH']);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      };

      const fmtSpeed = (value) => Number(value) > 0 ? \`\${Math.round(Number(value))} km/h\` : '--';

      const isInvalid = (row) => {
        const value = pick(row, ['valid','Valid','isValid']);
        return value === 0 || value === false || value === '0' || value === 'false' || value === 'no';
      };

      const dateMs = (value) => {
        if (!value) return 0;
        if (typeof value === 'number') return value > 20000000000 ? value : value * 1000;
        const parsed = Date.parse(String(value));
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const lapDate = (row) => dateMs(pick(row, ['timestampIso','dateIso','createdAt','updatedAt','lastSeenAt','timestamp']));
      const fmtDate = (row) => {
        const ms = lapDate(row);
        if (!ms) return '--';
        return new Date(ms).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      };

      const comboUrl = (row) => {
        const comboId = pick(row, ['comboId','canonicalComboId','session.comboId','ComboId']);
        if (comboId) return \`/combos/\${encodeURIComponent(String(comboId))}\`;
        const trackId = pick(row, ['trackId','track.id']);
        const carId = pick(row, ['carId','car.id']);
        return trackId && carId ? \`/combos/\${encodeURIComponent(String(trackId))}/\${encodeURIComponent(String(carId))}\` : '';
      };

      async function fetchCoreJson(url) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(url, { credentials:'include', cache:'no-store', signal:controller.signal });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error(\`\${url} \${response.status}\`);
          return data;
        } finally {
          window.clearTimeout(timeout);
        }
      }

      function ensureCoreBadge(status, label) {
        let badge = document.getElementById('gcHotlapsCoreBadge');

        if (!badge) {
          const host = document.querySelector('.gc-section-head') || document.querySelector('.gc-hero') || document.body;
          badge = document.createElement('span');
          badge.id = 'gcHotlapsCoreBadge';
          badge.style.cssText = 'display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border:1px solid rgba(122,255,144,.35);border-radius:999px;color:var(--accent,#7aff90);font-size:.68rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(122,255,144,.08);margin-left:8px';
          host.appendChild(badge);
        }

        badge.textContent = label;
        badge.dataset.state = status;
        badge.style.borderColor = status === 'error' ? 'rgba(255,94,94,.45)' : status === 'warn' ? 'rgba(255,207,90,.45)' : 'rgba(122,255,144,.35)';
        badge.style.color = status === 'error' ? '#ff6b6b' : status === 'warn' ? '#ffcf5a' : 'var(--accent,#7aff90)';
      }

      function uniqueMap(rows, getter) {
        const map = new Map();
        rows.forEach((row) => {
          const label = getter(row);
          const value = normalize(label);
          if (!value || value === '-') return;
          if (!map.has(value)) map.set(value, label);
        });
        return map;
      }

      function populateSelect(select, rows, getter, allLabel) {
        if (!select) return;
        const current = select.value || 'all';
        const map = uniqueMap(rows, getter);
        const options = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es', { sensitivity:'base' }));
        select.innerHTML = \`<option value="all">\${escapeHtml(allLabel)}</option>\` + options.map(([value, label]) => \`<option value="\${escapeHtml(value)}">\${escapeHtml(label)}</option>\`).join('');
        select.value = map.has(current) ? current : 'all';
      }

      function detectActiveFromSnapshot(snapshotData, rows) {
        const snapshot = snapshotData?.data || snapshotData || {};
        const activeCombo = snapshot.activeCombo || snapshot.combo || {};
        const activeTrack = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName']), '');

        if (activeTrack) {
          state.activeTrackLabel = activeTrack;
          state.activeTrackValue = normalize(activeTrack);
          return;
        }

        const latest = [...rows].sort((a, b) => lapDate(b) - lapDate(a))[0];
        state.activeTrackLabel = latest ? trackName(latest) : 'Último circuito activo';
        state.activeTrackValue = latest ? normalize(trackName(latest)) : 'all';
      }

      function populateFilters() {
        populateSelect(els.track, state.cache, trackName, 'Todos los circuitos');
        populateSelect(els.driver, state.cache, driverName, 'Todos los pilotos');
        populateSelect(els.car, state.cache, carName, 'Todos los coches');
      }

      function applyActiveTrack() {
        if (!els.track || !state.activeTrackValue || state.activeTrackValue === 'all') return;
        els.track.value = state.activeTrackValue;
      }

      function filteredRows() {
        const query = normalize(els.search?.value || '');
        const driver = els.driver?.value || 'all';
        const car = els.car?.value || 'all';
        const track = els.track?.value || 'all';
        const valid = els.valid?.value || 'valid';

        return state.cache.filter((row) => {
          const haystack = normalize(\`\${driverName(row)} \${carName(row)} \${trackName(row)}\`);
          if (query && !haystack.includes(query)) return false;
          if (driver !== 'all' && normalize(driverName(row)) !== driver) return false;
          if (car !== 'all' && normalize(carName(row)) !== car) return false;
          if (track !== 'all' && normalize(trackName(row)) !== track) return false;
          if (valid === 'valid' && isInvalid(row)) return false;
          if (valid === 'invalid' && !isInvalid(row)) return false;
          return true;
        });
      }

      function compactByDriver(rows) {
        const mode = els.sort?.value || 'fastest';
        const map = new Map();

        rows.forEach((row) => {
          const key = String(playerId(row) || normalize(driverName(row)) || driverName(row));
          const current = map.get(key);

          if (!current) {
            map.set(key, row);
            return;
          }

          if (mode === 'speed') {
            if (speedValue(row) > speedValue(current)) map.set(key, row);
            return;
          }

          if (mode === 'recent') {
            if (lapDate(row) > lapDate(current)) map.set(key, row);
            return;
          }

          const rowTime = lapMs(row) || 999999999;
          const currentTime = lapMs(current) || 999999999;
          if (rowTime < currentTime || (rowTime === currentTime && lapDate(row) > lapDate(current))) {
            map.set(key, row);
          }
        });

        return [...map.values()];
      }

      function sortRows(rows) {
        const sort = els.sort?.value || 'fastest';
        return [...rows].sort((a, b) => {
          if (sort === 'recent') return lapDate(b) - lapDate(a) || (lapMs(a) || 999999999) - (lapMs(b) || 999999999);
          if (sort === 'driver') return driverName(a).localeCompare(driverName(b), 'es', { sensitivity:'base' }) || (lapMs(a) || 999999999) - (lapMs(b) || 999999999);
          if (sort === 'car') return carName(a).localeCompare(carName(b), 'es', { sensitivity:'base' }) || (lapMs(a) || 999999999) - (lapMs(b) || 999999999);
          if (sort === 'speed') return speedValue(b) - speedValue(a) || (lapMs(a) || 999999999) - (lapMs(b) || 999999999);
          return (lapMs(a) || 999999999) - (lapMs(b) || 999999999);
        });
      }

      function updateMetrics(filtered, rows) {
        const validRows = filtered.filter((row) => !isInvalid(row));
        const best = validRows.slice().sort((a, b) => (lapMs(a) || 999999999) - (lapMs(b) || 999999999))[0] || rows[0];
        const fastest = filtered.slice().sort((a, b) => speedValue(b) - speedValue(a))[0];
        const drivers = uniqueMap(filtered, driverName);
        const selectedTrack = els.track?.value === 'all' ? 'Todos' : (els.track?.options[els.track.selectedIndex]?.textContent || state.activeTrackLabel);

        if (els.metricTrack) els.metricTrack.textContent = selectedTrack;
        if (els.metricTrackMeta) els.metricTrackMeta.textContent = els.track?.value === state.activeTrackValue ? 'combo activo' : 'filtro manual';
        if (els.activeTrackChip) els.activeTrackChip.textContent = state.activeTrackLabel || 'Combo activo';
        if (els.metricBest) els.metricBest.textContent = best ? lapDisplay(best) : '--';
        if (els.metricBestMeta) els.metricBestMeta.textContent = best ? driverName(best) : 'sin datos';
        if (els.metricDrivers) els.metricDrivers.textContent = String(drivers.size);
        if (els.metricSpeed) els.metricSpeed.textContent = fastest ? fmtSpeed(speedValue(fastest)) : '--';
        if (els.metricSpeedMeta) els.metricSpeedMeta.textContent = fastest ? driverName(fastest) : 'máxima visible';
      }

      function orderLabel() {
        const trackLabel = els.track?.value === state.activeTrackValue ? 'combo activo' : (els.track?.options[els.track.selectedIndex]?.textContent || 'todos los circuitos').toLowerCase();
        const validLabel = els.valid?.options[els.valid.selectedIndex]?.textContent || 'Válidas';
        const sortLabel = els.sort?.options[els.sort.selectedIndex]?.textContent || 'Más rápido';
        return \`\${trackLabel} · \${validLabel.toLowerCase()} · \${sortLabel.toLowerCase()} · Data Core primary\`;
      }

      function drawCore() {
        if (!state.coreReady) return;

        const filtered = filteredRows();
        const compacted = compactByDriver(filtered);
        const rows = sortRows(compacted);
        const best = Math.min(...rows.map(lapMs).filter((value) => Number.isFinite(value)));

        updateMetrics(filtered, rows);

        if (els.visible) els.visible.textContent = String(rows.length);
        if (els.hint) els.hint.textContent = rows.length
          ? \`\${rows.length} pilotos visibles · \${filtered.length} vueltas filtradas de \${state.cache.length} · Data Core primary\`
          : 'No hay resultados con esos filtros · Data Core primary';
        if (els.order) els.order.textContent = orderLabel();

        els.rows.innerHTML = rows.map((row, index) => {
          const id = playerId(row);
          const name = escapeHtml(driverName(row));
          const podium = rankBadgeMap[index + 1];
          const rankHtml = podium
            ? \`<span class="gc-hotlap-rank-wrap"><img class="gc-hotlap-rank-badge" src="\${podium}" alt="Posición \${index + 1}" loading="lazy" /></span>\`
            : \`<span class="gc-hotlap-rank-wrap"><span class="gc-hotlap-rank">\${index + 1}</span></span>\`;

          const link = id ? \`<a class="gc-driver-link" href="/pilotos/\${encodeURIComponent(String(id))}">\${name}</a><span class="gc-leaderboard-sub">Perfil público</span>\` : \`<strong>\${name}</strong>\`;
          const rowMs = lapMs(row);
          const delta = Number.isFinite(best) && rowMs ? \`+\${((rowMs - best) / 1000).toFixed(3)}\` : '--';
          const combo = comboUrl(row);

          return \`
            <tr>
              <td>\${rankHtml}</td>
              <td>\${link}</td>
              <td>\${combo ? \`<a href="\${escapeHtml(combo)}">\${escapeHtml(carName(row))}</a>\` : escapeHtml(carName(row))}</td>
              <td>\${combo ? \`<a href="\${escapeHtml(combo)}">\${escapeHtml(trackName(row))}</a>\` : escapeHtml(trackName(row))}</td>
              <td><strong>\${escapeHtml(lapDisplay(row))}</strong></td>
              <td>\${escapeHtml(index === 0 ? '+0.000' : delta)}</td>
              <td>\${escapeHtml(fmtSpeed(speedValue(row)))}</td>
              <td>\${escapeHtml(pick(row, ['cuts','Cuts']) || 0)}</td>
              <td>\${escapeHtml(fmtDate(row))}</td>
              <td>\${isInvalid(row) ? '<span class="gc-hotlap-state-v13 gc-hotlap-state-v13--bad">No válida</span>' : '<span class="gc-hotlap-state-v13">Válida</span>'}</td>
            </tr>
          \`;
        }).join('') || '<tr><td colspan="10">Sin resultados · Data Core primary</td></tr>';

        document.documentElement.dataset.gcHotlapsDataCore = 'primary';
        document.documentElement.dataset.gcHotlapsDataCoreVersion = 'v1';
        ensureCoreBadge('ok', 'Data Core primary');

        state.lastGood = { snapshot: state.snapshot, rows: state.cache, renderedAt: new Date().toISOString() };
        window.GCHotlapsDataCorePrimary = { status: 'ok', ...state.lastGood };
      }

      async function loadCore() {
        if (state.running) return;
        state.running = true;

        if (els.reload) els.reload.disabled = true;
        ensureCoreBadge('warn', 'Data Core loading');

        try {
          const [snapshot, leaderboard] = await Promise.all([
            fetchCoreJson('/api/gc/snapshot?scope=activeCombo&limit=12'),
            fetchCoreJson('/api/gc/leaderboard?scope=activeCombo&limit=1000')
          ]);

          state.snapshot = snapshot;
          state.cache = list(leaderboard);
          state.coreReady = true;

          detectActiveFromSnapshot(snapshot, state.cache);
          populateFilters();

          if (!state.lastGood) {
            if (els.search) els.search.value = '';
            if (els.driver) els.driver.value = 'all';
            if (els.car) els.car.value = 'all';
            if (els.valid) els.valid.value = 'valid';
            if (els.sort) els.sort.value = 'fastest';
            applyActiveTrack();
          }

          if (els.loaded) els.loaded.textContent = String(state.cache.length);
          if (els.updated) els.updated.textContent = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
          if (els.source) els.source.textContent = 'Core';

          drawCore();

          console.info('[GC /hotlaps Data Core Primary v1]', {
            loaded: state.cache.length,
            activeTrackValue: state.activeTrackValue,
            activeTrackLabel: state.activeTrackLabel
          });
        } catch (error) {
          console.warn('[GC /hotlaps Data Core Primary v1] Core unavailable, legacy leaderboard remains active:', error);
          document.documentElement.dataset.gcHotlapsDataCore = state.lastGood ? 'primary-stale' : 'fallback';
          ensureCoreBadge('error', state.lastGood ? 'Data Core stale' : 'Legacy fallback');
          window.GCHotlapsDataCorePrimary = { status: state.lastGood ? 'stale' : 'fallback', error: error?.message || String(error), ...state.lastGood };
          if (els.source) els.source.textContent = state.lastGood ? 'Core stale' : 'Legacy';
        } finally {
          state.running = false;
          if (els.reload) els.reload.disabled = false;
        }
      }

      [els.search, els.driver, els.car, els.track, els.valid, els.sort].forEach((input) => {
        input?.addEventListener('input', drawCore);
        input?.addEventListener('change', drawCore);
      });

      els.activeTrackButton?.addEventListener('click', () => { applyActiveTrack(); drawCore(); });
      els.clear?.addEventListener('click', () => {
        if (els.search) els.search.value = '';
        if (els.driver) els.driver.value = 'all';
        if (els.car) els.car.value = 'all';
        if (els.valid) els.valid.value = 'valid';
        if (els.sort) els.sort.value = 'fastest';
        applyActiveTrack();
        drawCore();
      });
      els.reload?.addEventListener('click', loadCore);

      function start() {
        window.clearInterval(state.timer);
        window.setTimeout(loadCore, CONFIG.settleDelayMs);
        state.timer = window.setInterval(loadCore, CONFIG.refreshMs);
      }

      window.GCHotlapsDataCorePrimaryReload = loadCore;

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
      else start();

      window.addEventListener('load', () => window.setTimeout(loadCore, CONFIG.retryDelayMs), { once:true });
    })();
    ${END}
  </script>
`;

function replaceScriptBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null;

  const scriptStart = text.lastIndexOf('<script', startIndex);
  const scriptEnd = text.indexOf('</script>', endIndex);

  if (scriptStart !== -1 && scriptEnd !== -1) {
    return text.slice(0, scriptStart) + block + text.slice(scriptEnd + '</script>'.length);
  }

  return text.slice(0, startIndex) + block + text.slice(endIndex + end.length);
}

let next = replaceScriptBlock(source, START, END, primaryBlock);
if (next === null) next = replaceScriptBlock(source, OLD_START, OLD_END, primaryBlock);

if (next === null) {
  const anchor = '</AppLayout>';
  const index = source.lastIndexOf(anchor);
  if (index === -1) {
    console.error('[GC HOTLAPS PRIMARY] Missing </AppLayout> anchor in src/pages/hotlaps.astro');
    process.exit(1);
  }
  next = source.slice(0, index) + primaryBlock + '\n' + source.slice(index);
}

fs.writeFileSync(hotlapsPath, next, 'utf8');
console.log('[GC HOTLAPS PRIMARY] /hotlaps Data Core primary loader applied.');
console.log('[GC HOTLAPS PRIMARY] Run: npm run build');
