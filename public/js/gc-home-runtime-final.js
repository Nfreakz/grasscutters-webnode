(() => {
  const ROOT = '[data-gc-home2]';
  const MAIN = '[data-home2-combo-ranking]';
  const GT4 = '[data-home2-combo-ranking-gt4]';
  const TIMING = '[data-home2-timing-sheet], [data-home2-latest-laps], .gc-home2-timing-sheet tbody, .gc-home2-timing-list';
  const DEFAULT_AVATAR = '/images/pilot-avatar-default.png';
  const REFRESH_MS = 60000;

  let running = false;
  let queued = false;
  let lastTop8 = [];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] || char);

  const norm = (value) => String(value || '')
    .trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  const canonicalDriver = (value) => {
    const key = norm(value);
    return key === 'pdiaz' || key === 'pedrodiaz' ? 'pedrodiaz' : key;
  };

  const pick = (source, paths, fallback = '') => {
    for (const path of paths) {
      let current = source;
      for (const part of String(path).split('.')) {
        if (current == null) break;
        current = current[part];
      }
      if (current !== undefined && current !== null && current !== '') return current;
    }
    return fallback;
  };

  const rowsOf = (payload) => {
    if (Array.isArray(payload?.normalized?.storedTimes)) return payload.normalized.storedTimes;
    if (Array.isArray(payload?.leaderboard)) return payload.leaderboard;
    if (Array.isArray(payload?.activeCombo?.leaderboard)) return payload.activeCombo.leaderboard;
    if (Array.isArray(payload?.storedTimes)) return payload.storedTimes;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.laps)) return payload.laps;
    return [];
  };

  const driverName = (row) => String(pick(row, [
    'driverName', 'playerName', 'DriverName', 'name',
    'driver.displayName', 'driver.name', 'player.name'
  ], 'Piloto'));

  const carName = (row, fallback = '') => String(pick(row, [
    'carName', 'carDisplayName', 'carVisibleName', 'carModel', 'CarModel', 'model',
    'car.displayName', 'car.uiName', 'car.name', 'car.code'
  ], fallback));

  const trackName = (row, fallback = '') => String(pick(row, [
    'trackName', 'trackDisplayName', 'trackVisibleName', 'trackCode', 'Track',
    'track.displayName', 'track.uiName', 'track.name', 'track.code'
  ], fallback));

  const lapMs = (row) => {
    const value = Number(pick(row, ['bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs', 'lap_time_ms'], 0));
    return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
  };

  const validLap = (row) => {
    const value = pick(row, ['valid', 'isValid', 'Valid'], true);
    return !(value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false');
  };

  const sameIdentity = (left, right) => {
    const a = norm(left);
    const b = norm(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  };

  const avatar = (row) => String(pick(row, [
    'profileAvatarUrl', 'avatarUrl', 'avatar_url',
    'driver.avatarUrl', 'driver.avatar', 'player.avatarUrl'
  ], DEFAULT_AVATAR)) || DEFAULT_AVATAR;

  const timeText = (ms) => {
    const value = Math.max(0, Math.round(ms));
    const minutes = Math.floor(value / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    const millis = value % 1000;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const buildTop8 = (rows) => {
    const best = new Map();
    for (const row of rows) {
      const key = canonicalDriver(driverName(row));
      const ms = lapMs(row);
      if (!key || !Number.isFinite(ms) || !validLap(row)) continue;
      const previous = best.get(key);
      if (!previous || ms < lapMs(previous)) best.set(key, row);
    }
    return [...best.values()].sort((a, b) => lapMs(a) - lapMs(b)).slice(0, 8);
  };

  const renderTop8 = (rows) => {
    if (rows.length !== 8) return false;
    const host = document.querySelector(MAIN);
    if (!host) return false;

    host.innerHTML = rows.map((row, index) => {
      const position = index + 1;
      const badge = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : String(position);
      return `
        <div class="gc-home2-combo-rank" data-gc-runtime-driver="${esc(canonicalDriver(driverName(row)))}">
          <span class="gc-home2-rank-badge${position > 3 ? ' gc-home2-rank-badge--plain' : ''}">${badge}</span>
          <div><strong>${esc(driverName(row).toUpperCase())}</strong><small>${esc(carName(row, 'Coche').toUpperCase())}</small></div>
          <img class="gc-home2-combo-rank__avatar" src="${esc(avatar(row))}" alt="" width="24" height="24" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';" />
          <em>${esc(timeText(lapMs(row)))}</em>
        </div>`;
    }).join('');

    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '8';
    host.dataset.gcUniqueRows = 'true';
    return true;
  };

  const enforceSimpleLimits = () => {
    const gt4 = document.querySelector(GT4);
    if (gt4) [...gt4.children].forEach((row, index) => { if (row instanceof HTMLElement) row.style.display = index < 8 ? '' : 'none'; });
    const timing = document.querySelector(TIMING);
    if (timing) [...timing.children].forEach((row, index) => { if (row instanceof HTMLElement) row.style.display = index < 10 ? '' : 'none'; });
  };

  const readDomComboIdentity = () => ({
    track: String(document.querySelector('[data-home2-track]')?.textContent || '').trim(),
    car: String(document.querySelector('[data-home2-cars]')?.textContent || '').trim()
  });

  const refresh = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;

    try {
      const stamp = Date.now();
      const historyResponse = await fetch(`/api/gc/hotlaps2?source=main&limit=all&t=${stamp}`, {
        credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }
      });
      if (!historyResponse.ok) throw new Error(`HTTP ${historyResponse.status}`);

      const history = await historyResponse.json();
      const historyRows = rowsOf(history);
      const domCombo = readDomComboIdentity();

      if (!domCombo.track || !domCombo.car) throw new Error('Combo DOM incompleto');

      const exactHistory = historyRows.filter((row) => {
        const source = norm(pick(row, ['sourceKey', 'session.sourceKey'], 'main'));
        return source === 'main' &&
          validLap(row) &&
          sameIdentity(trackName(row), domCombo.track) &&
          sameIdentity(carName(row), domCombo.car);
      });

      const top8 = buildTop8(exactHistory);
      if (!renderTop8(top8)) throw new Error(`Top 8 incompleto: ${top8.length}`);
      lastTop8 = top8;

      document.documentElement.dataset.gcHomeRuntimeFinal = 'v7-dom-combo-top8';
      document.documentElement.dataset.gcHomeTop8Rows = String(top8.length);
      document.documentElement.dataset.gcHomeTop8Track = norm(domCombo.track);
      document.documentElement.dataset.gcHomeTop8Car = norm(domCombo.car);
    } catch (error) {
      console.warn('[GC Home Runtime v7] top 8 no disponible', error);
      if (lastTop8.length === 8) renderTop8(lastTop8);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        window.setTimeout(refresh, 100);
      }
    }
  };

  const start = () => {
    if (!document.querySelector(ROOT)) return;
    enforceSimpleLimits();
    refresh();

    const host = document.querySelector(MAIN);
    if (host) {
      let timer = 0;
      new MutationObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          const names = [...host.querySelectorAll('strong')].map((node) => canonicalDriver(node.textContent));
          if (names.length !== 8 || new Set(names).size !== 8) {
            if (lastTop8.length === 8) renderTop8(lastTop8);
            else refresh();
          }
        }, 120);
      }).observe(host, { childList: true, subtree: true, characterData: true });
    }

    const comboHost = document.querySelector('[data-home2-combo-source="main"]');
    if (comboHost) {
      let comboTimer = 0;
      new MutationObserver(() => {
        window.clearTimeout(comboTimer);
        comboTimer = window.setTimeout(refresh, 250);
      }).observe(comboHost, { childList: true, subtree: true, characterData: true });
    }

    window.setTimeout(refresh, 1500);
    window.setTimeout(refresh, 4000);
    window.setInterval(refresh, REFRESH_MS);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();