#!/usr/bin/env node
/* GC_APP_DATA_CORE_PRIMARY_V1_APPLY
 * Upgrades previous /app Data Core bridge into a primary loader.
 * It does not delete legacy code yet. Data Core becomes the final recurring source of visible truth.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'pages', 'app.astro');

const OLD_START = '/* GC_APP_DATA_CORE_BRIDGE_V1_START */';
const OLD_END = '/* GC_APP_DATA_CORE_BRIDGE_V1_END */';
const START = '/* GC_APP_DATA_CORE_PRIMARY_V1_START */';
const END = '/* GC_APP_DATA_CORE_PRIMARY_V1_END */';

if (!fs.existsSync(appPath)) {
  console.error('[GC APP PRIMARY] Missing src/pages/app.astro');
  process.exit(1);
}

let source = fs.readFileSync(appPath, 'utf8');

const primaryBlock = `
  <script is:inline>
    ${START}
    (() => {
      const CONFIG = { refreshMs: 30000, settleDelayMs: 450, retryDelayMs: 2500 };
      const byId = (id) => document.getElementById(id);
      const setText = (id, value) => { const node = byId(id); if (node) node.textContent = String(value ?? '--'); };
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
      const number = (value, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
      const formatNumber = (value) => Math.max(0, Math.round(number(value, 0))).toLocaleString('es-ES');
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
      const payload = (data) => data?.data || data || {};
      const list = (data) => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        return data.items || data.data?.items || data.data?.leaderboard || data.data?.laps || data.leaderboard || data.laps || data.recentLaps || data.hotlaps || [];
      };
      const text = (value, fallback = '') => {
        if (value == null || value === '') return fallback;
        if (Array.isArray(value)) return value.length ? text(value[0], fallback) : fallback;
        if (typeof value === 'object') return text(value.displayName ?? value.visibleName ?? value.cleanName ?? value.display_name ?? value.uiName ?? value.uiCarName ?? value.uiTrackName ?? value.name ?? value.Name ?? value.driverName ?? value.playerName ?? value.code, fallback);
        return String(value).replace(/_/g, ' ').replace(/\\s+/g, ' ').trim() || fallback;
      };
      const driverName = (row) => text(pick(row, ['driver.displayName','driver.visibleName','driver.name','driverName','playerName','pilotName','name']), 'Piloto');
      const carName = (row) => text(pick(row, ['car.displayName','car.visibleName','car.name','carName','uiCarName']), 'Coche');
      const trackName = (row) => text(pick(row, ['track.displayName','track.visibleName','track.name','trackName','uiTrackName']), 'Circuito');
      const lapMs = (row) => {
        const raw = pick(row, ['lapTimeMs','bestLapMs','timeMs','LapTime']);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const timeText = (value) => {
        const ms = number(value, 0);
        if (!ms) return '--';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const millis = Math.floor(ms % 1000);
        return \`\${minutes}:\${String(seconds).padStart(2, '0')}.\${String(millis).padStart(3, '0')}\`;
      };
      const lapTime = (row) => text(pick(row, ['lapTimeFormatted','lapTimeText','bestLapTime','bestLap','timeFormatted']), '') || timeText(lapMs(row));
      const dateMs = (value) => {
        if (!value) return 0;
        if (typeof value === 'number') return value > 20000000000 ? value : value * 1000;
        const parsed = Date.parse(String(value));
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const lapDate = (row) => dateMs(pick(row, ['timestampIso','dateIso','createdAt','updatedAt','lastSeenAt','timestamp']));
      const dateText = (value) => {
        const ms = typeof value === 'object' ? lapDate(value) : dateMs(value);
        if (!ms) return '--';
        return new Date(ms).toLocaleString('es-ES', { dateStyle:'short', timeStyle:'short' });
      };
      const speed = (row) => {
        const raw = pick(row, ['maxSpeedKmh','maxSpeed','speedKmh','MaxSpeed_KMH']);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? \`\${Math.round(parsed)} km/h\` : '--';
      };
      const comboCars = (combo) => {
        const raw = pick(combo, ['cars','carList','availableCars','comboCars']);
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,|;]/g) : []);
        const seen = new Set();
        return arr.map((car) => text(car, '')).filter(Boolean).filter((name) => {
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      const comboId = (combo) => pick(combo, ['comboId','canonicalComboId','id']);
      const comboUrl = (combo) => combo?.url || (comboId(combo) != null ? \`/combos/\${encodeURIComponent(comboId(combo))}\` : '/combos');

      let timer = null;
      let running = false;
      let lastGoodPayload = null;

      async function fetchCoreJson(url) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error(\`\${url} \${response.status}\`);
          return data;
        } finally {
          window.clearTimeout(timeout);
        }
      }

      function ensureCoreBadge(state, label) {
        let badge = document.getElementById('gcAppCoreBadge');
        if (!badge) {
          const host = document.querySelector('.gc-live-panel__title') || document.querySelector('.gc-hero') || document.body;
          badge = document.createElement('span');
          badge.id = 'gcAppCoreBadge';
          badge.style.cssText = 'display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border:1px solid rgba(122,255,144,.35);border-radius:999px;color:var(--accent,#7aff90);font-size:.68rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(122,255,144,.08);margin-left:8px';
          host.appendChild(badge);
        }
        badge.textContent = label;
        badge.dataset.state = state;
        badge.style.borderColor = state === 'error' ? 'rgba(255,94,94,.45)' : state === 'warn' ? 'rgba(255,207,90,.45)' : 'rgba(122,255,144,.35)';
        badge.style.color = state === 'error' ? '#ff6b6b' : state === 'warn' ? '#ffcf5a' : 'var(--accent,#7aff90)';
      }

      function renderCore(snapshotData, leaderboardData, recentData) {
        const snapshot = payload(snapshotData);
        const stats = snapshot.stats || snapshot.overview || {};
        const activeCombo = snapshot.activeCombo || snapshot.combo || {};
        const leaderboard = list(leaderboardData);
        const recent = list(recentData);
        const bestLap = activeCombo.bestLap || leaderboard[0] || snapshot.bestLap || {};
        const latestLap = activeCombo.latestLap || recent[0] || snapshot.latestLap || {};
        const cars = comboCars(activeCombo).slice(0, 10);
        const track = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName']), trackName(latestLap));

        setText('gcAppStatusChip', 'Live');
        setText('gcAppComboChip', track || 'Combo activo');
        setText('gcMetricDrivers', formatNumber(pick(stats, ['driversCount','pilotsCount','totalDrivers'])));
        setText('gcMetricLaps', formatNumber(pick(stats, ['totalLaps','laps','lapCount'])));
        setText('gcMetricCombos', formatNumber(pick(stats, ['combosCount','totalCombos','activeCombos'])));
        setText('gcMetricLastActivity', latestLap && Object.keys(latestLap).length ? dateText(latestLap).split(',')[0] : '—');

        setText('gcComboTrack', track || 'Sin combo');
        setText('gcComboHint', latestLap && Object.keys(latestLap).length ? \`Última actividad · \${dateText(latestLap)} · \${driverName(latestLap)}\` : 'Datos centralizados desde Race Data Core.');
        setText('gcComboLaps', formatNumber(pick(activeCombo, ['totalLaps','stats.totalLaps','laps'])));
        setText('gcComboDrivers', formatNumber(pick(activeCombo, ['driversCount','stats.driversCount','pilotsCount'])));
        setText('gcComboFamily', number(pick(activeCombo, ['mergedCombosCount']), 1) > 1 ? \`\${number(pick(activeCombo, ['mergedCombosCount']), 1)} combos\` : 'Activo');

        const comboLink = byId('gcComboLink');
        if (comboLink) comboLink.href = comboUrl(activeCombo);

        const carsNode = byId('gcComboCars');
        if (carsNode) {
          carsNode.innerHTML = cars.length
            ? cars.map((name) => \`<span class="gc-chip">\${escapeHtml(name)}</span>\`).join('')
            : '<span class="gc-chip">Coches por confirmar</span>';
        }

        setText('gcQuickRefs', formatNumber(pick(stats, ['totalLaps','laps','lapCount'])));
        setText('gcQuickLast', lapTime(latestLap));
        setText('gcQuickLastMeta', latestLap && Object.keys(latestLap).length ? [driverName(latestLap), trackName(latestLap), dateText(latestLap)].filter(Boolean).join(' · ') : 'sin datos');
        setText('gcQuickDb', snapshotData?.ok ? 'Activo' : 'Parcial');
        setText('gcQuickDbMeta', snapshotData?.generatedAt ? \`Data Core · \${dateText(snapshotData.generatedAt)}\` : 'Data Core');

        const top = bestLap && Object.keys(bestLap).length ? bestLap : leaderboard[0];
        setText('gcTopDriverName', top ? driverName(top) : '--');
        setText('gcTopDriverTime', top ? lapTime(top) : '--');
        setText('gcTopDriverMeta', top ? [carName(top), trackName(top), speed(top)].filter(Boolean).join(' · ') : 'Sin referencia cargada');

        const avatar = byId('gcTopDriverAvatar');
        const playerId = top ? pick(top, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']) : null;
        if (avatar && playerId) {
          avatar.src = \`/api/pilot-avatar/\${encodeURIComponent(String(playerId))}\`;
          avatar.alt = \`Avatar de \${driverName(top)}\`;
          avatar.onerror = () => {
            avatar.onerror = null;
            avatar.src = '/images/pilot-avatar-default.png';
          };
        }

        const table = byId('gcRefsTable');
        if (table) {
          const rows = recent.length ? recent : leaderboard;
          table.innerHTML = rows.length
            ? rows.slice(0, 10).map((lap) => \`
                <tr>
                  <td><strong>\${escapeHtml(driverName(lap))}</strong></td>
                  <td>\${escapeHtml(carName(lap))}</td>
                  <td>\${escapeHtml(trackName(lap))}</td>
                  <td><strong>\${escapeHtml(lapTime(lap))}</strong></td>
                  <td>\${escapeHtml(dateText(lap))}</td>
                </tr>
              \`).join('')
            : '<tr><td colspan="5">Sin vueltas recientes.</td></tr>';
        }

        setText('gcRefsMeta', \`\${formatNumber(recentData?.count ?? recent.length)} vueltas recientes · Data Core primary\`);

        const comboCard = document.querySelector('.gc-app-combo-v3');
        if (comboCard && track) {
          comboCard.dataset.trackName = track;
          window.GCTrackImages?.applyAll?.(document);
        }

        document.documentElement.dataset.gcAppDataCore = 'primary';
        document.documentElement.dataset.gcAppDataCoreVersion = 'v1';
        ensureCoreBadge('ok', 'Data Core primary');

        lastGoodPayload = { snapshot: snapshotData, leaderboard: leaderboardData, recent: recentData, renderedAt: new Date().toISOString() };
        window.GCAppDataCorePrimary = { status: 'ok', ...lastGoodPayload };

        console.info('[GC /app Data Core Primary v1]', { stats, activeCombo, leaderboard: leaderboard.length, recent: recent.length });
      }

      async function loadPrimary() {
        if (running) return;
        running = true;
        try {
          ensureCoreBadge('warn', 'Data Core loading');
          const [snapshot, leaderboard, recent] = await Promise.all([
            fetchCoreJson('/api/gc/snapshot?scope=activeCombo&limit=12'),
            fetchCoreJson('/api/gc/leaderboard?scope=activeCombo&limit=20'),
            fetchCoreJson('/api/gc/recent-laps?scope=activeCombo&limit=12')
          ]);
          renderCore(snapshot, leaderboard, recent);
        } catch (error) {
          console.warn('[GC /app Data Core Primary v1] Core unavailable, legacy remains visible:', error);
          document.documentElement.dataset.gcAppDataCore = lastGoodPayload ? 'primary-stale' : 'fallback';
          ensureCoreBadge('error', lastGoodPayload ? 'Data Core stale' : 'Legacy fallback');
          window.GCAppDataCorePrimary = { status: lastGoodPayload ? 'stale' : 'fallback', error: error?.message || String(error), ...lastGoodPayload };
        } finally {
          running = false;
        }
      }

      function startPrimary() {
        window.clearInterval(timer);
        window.setTimeout(loadPrimary, CONFIG.settleDelayMs);
        timer = window.setInterval(loadPrimary, CONFIG.refreshMs);
      }

      window.GCAppDataCorePrimaryReload = loadPrimary;

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPrimary, { once: true });
      else startPrimary();

      window.addEventListener('load', () => window.setTimeout(loadPrimary, CONFIG.retryDelayMs), { once: true });
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
    console.error('[GC APP PRIMARY] Missing </AppLayout> anchor in src/pages/app.astro');
    process.exit(1);
  }
  next = source.slice(0, index) + primaryBlock + '\n' + source.slice(index);
}

fs.writeFileSync(appPath, next, 'utf8');
console.log('[GC APP PRIMARY] /app Data Core primary loader applied.');
console.log('[GC APP PRIMARY] Run: npm run build');
