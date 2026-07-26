(() => {
  const HOME_SELECTOR = '[data-gc-home2]';
  const MAIN_RANKING = '[data-home2-combo-ranking]';
  const GT4_RANKING = '[data-home2-combo-ranking-gt4]';
  const TIMING_SHEET = '[data-home2-timing-sheet], [data-home2-latest-laps], .gc-home2-timing-sheet tbody, .gc-home2-timing-list';
  const DEFAULT_AVATAR = '/images/pilot-avatar-default.png';
  const REFRESH_MS = 60000;

  let rankingRefreshRunning = false;
  let rankingRefreshQueued = false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] || char);

  const normalizeName = (value) => String(value || '')
    .trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  const canonicalDriverKey = (value) => {
    const key = normalizeName(value);
    return key === 'pdiaz' || key === 'pedrodiaz' ? 'pedrodiaz' : key;
  };

  const readFirst = (source, paths, fallback = '') => {
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

  const driverName = (row) => String(readFirst(row, [
    'driverName', 'name', 'DriverName', 'playerName',
    'driver.name', 'driver.displayName', 'player.name'
  ], 'Piloto'));

  const carName = (row) => String(readFirst(row, [
    'carName', 'carDisplayName', 'carVisibleName', 'carModel', 'model', 'CarModel',
    'car.name', 'car.displayName', 'car.uiName', 'car.code'
  ], '--'));

  const trackName = (row) => String(readFirst(row, [
    'trackName', 'trackDisplayName', 'trackVisibleName',
    'track.name', 'track.displayName', 'track.uiName', 'track.code',
    'Track', 'trackCode'
  ], '--'));

  const lapMs = (row) => {
    const value = Number(readFirst(row, ['bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs', 'lap_time_ms'], 0));
    return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
  };

  const isValidLap = (row) => {
    const value = readFirst(row, ['valid', 'isValid', 'Valid'], true);
    return !(value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false');
  };

  const avatarUrl = (row) => String(readFirst(row, [
    'profileAvatarUrl', 'avatarUrl', 'avatar_url',
    'driver.avatarUrl', 'driver.avatar', 'player.avatarUrl'
  ], DEFAULT_AVATAR));

  const formatLap = (ms) => {
    if (!Number.isFinite(ms)) return '--';
    const value = Math.max(0, Math.round(ms));
    const minutes = Math.floor(value / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    const millis = value % 1000;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const sourceRows = (payload) => {
    if (Array.isArray(payload?.leaderboard)) return payload.leaderboard;
    if (Array.isArray(payload?.activeCombo?.leaderboard)) return payload.activeCombo.leaderboard;
    if (Array.isArray(payload?.normalized?.storedTimes)) return payload.normalized.storedTimes;
    if (Array.isArray(payload?.storedTimes)) return payload.storedTimes;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.laps)) return payload.laps;
    return [];
  };

  const sameIdentity = (left, right) => {
    const a = normalizeName(left);
    const b = normalizeName(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  };

  const bestUniqueDrivers = (rows) => {
    const byDriver = new Map();
    for (const row of rows) {
      const key = canonicalDriverKey(driverName(row));
      const time = lapMs(row);
      if (!key || !Number.isFinite(time) || !isValidLap(row)) continue;
      const previous = byDriver.get(key);
      if (!previous || time < lapMs(previous)) byDriver.set(key, row);
    }
    return [...byDriver.values()].sort((a, b) => lapMs(a) - lapMs(b)).slice(0, 8);
  };

  const renderMainTopEight = (rows) => {
    const host = document.querySelector(MAIN_RANKING);
    if (!host || rows.length < 8) return;

    host.innerHTML = rows.slice(0, 8).map((row, index) => {
      const position = index + 1;
      const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : String(position);
      const name = driverName(row).toUpperCase();
      const car = carName(row).toUpperCase();
      const avatar = avatarUrl(row) || DEFAULT_AVATAR;
      return `
        <div class="gc-home2-combo-rank" data-gc-runtime-driver="${escapeHtml(canonicalDriverKey(name))}">
          <span class="gc-home2-rank-badge">${medal}</span>
          <div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(car)}</small></div>
          <img class="gc-home2-combo-rank__avatar" src="${escapeHtml(avatar)}" alt="" width="24" height="24" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';" />
          <em>${escapeHtml(formatLap(lapMs(row)))}</em>
        </div>`;
    }).join('');

    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '8';
    host.dataset.gcUniqueRows = 'true';
  };

  const refreshMainRanking = async () => {
    if (rankingRefreshRunning) {
      rankingRefreshQueued = true;
      return;
    }

    rankingRefreshRunning = true;
    try {
      const stamp = Date.now();
      const [historyResponse, liveResponse] = await Promise.all([
        fetch(`/api/gc/hotlaps2?source=main&limit=all&t=${stamp}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          cache: 'no-store'
        }),
        fetch(`/api/gc/live-test/snapshot?source=main&waitMs=2200&t=${stamp}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        })
      ]);

      if (!historyResponse.ok || !liveResponse.ok) return;

      const [history, live] = await Promise.all([
        historyResponse.json(),
        liveResponse.json()
      ]);

      const liveRows = sourceRows(live);
      const historyRows = sourceRows(history);
      const liveTrack = trackName(liveRows[0]);
      const liveCar = carName(liveRows[0]);

      if (!liveRows.length || !liveTrack || !liveCar) return;

      const exactHistory = historyRows.filter((row) => {
        const source = normalizeName(readFirst(row, ['sourceKey', 'session.sourceKey'], 'main'));
        return source === 'main' &&
          isValidLap(row) &&
          sameIdentity(trackName(row), liveTrack) &&
          sameIdentity(carName(row), liveCar);
      });

      const rows = bestUniqueDrivers([...liveRows, ...exactHistory]);
      renderMainTopEight(rows);
    } catch (error) {
      console.warn('[GC Home Runtime] No se pudo reconstruir el top 8 exacto', error);
    } finally {
      rankingRefreshRunning = false;
      if (rankingRefreshQueued) {
        rankingRefreshQueued = false;
        window.setTimeout(refreshMainRanking, 100);
      }
    }
  };

  const srRankName = (score) => {
    const value = Number(score);
    if (!Number.isFinite(value)) return '';
    if (value >= 95) return 'LEGEND';
    if (value >= 90) return 'ELITE';
    if (value >= 80) return 'PRO';
    if (value >= 70) return 'ADVANCED';
    if (value >= 60) return 'ROOKIE';
    return 'PITLANE';
  };

  const gsrRankName = (score) => {
    const value = Number(score);
    if (!Number.isFinite(value)) return '';
    if (value >= 1750) return 'DIAMOND';
    if (value >= 1650) return 'RUBY';
    if (value >= 1550) return 'SAPPHIRE';
    if (value >= 1475) return 'EMERALD';
    if (value >= 1400) return 'AMBER';
    return 'ONYX';
  };

  const parseNumber = (value) => {
    const normalized = String(value || '').replace(/\./g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return normalized ? Number(normalized[0]) : NaN;
  };

  const enforceTopEight = (selector) => {
    const host = document.querySelector(selector);
    if (!host) return;
    const rows = Array.from(host.children).filter((node) => node instanceof HTMLElement);
    rows.forEach((row, index) => { row.style.display = index < 8 ? '' : 'none'; });
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
  };

  const enforceTimingTen = () => {
    const host = document.querySelector(TIMING_SHEET);
    if (!host) return;
    const rows = Array.from(host.children).filter((node) => node instanceof HTMLElement);
    rows.forEach((row, index) => { row.style.display = index < 10 ? '' : 'none'; });
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '10';
  };

  const enforcePopoverLabels = () => {
    const popover = document.querySelector('[data-home-pilot-popover]');
    if (!popover || !popover.classList.contains('is-open')) return;
    const ratings = popover.querySelectorAll('.gc-home-pilot-popover__rating');
    if (ratings[0]) {
      const value = parseNumber(ratings[0].querySelector('strong')?.textContent);
      const label = srRankName(value);
      const labelNode = ratings[0].querySelector('span');
      if (labelNode && label) labelNode.textContent = label;
    }
    if (ratings[1]) {
      const value = parseNumber(ratings[1].querySelector('strong')?.textContent);
      const label = gsrRankName(value);
      const labelNode = ratings[1].querySelector('span');
      if (labelNode && label) labelNode.textContent = label;
    }
  };

  const apply = () => {
    if (!document.querySelector(HOME_SELECTOR)) return;
    enforceTopEight(MAIN_RANKING);
    enforceTopEight(GT4_RANKING);
    enforceTimingTen();
    enforcePopoverLabels();
    document.documentElement.dataset.gcHomeRuntimeFinal = 'v5-live-row-exact-top8';
  };

  const start = () => {
    apply();
    refreshMainRanking();
    const root = document.querySelector(HOME_SELECTOR);
    if (!root) return;

    let timer = 0;
    new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        apply();
        const host = document.querySelector(MAIN_RANKING);
        const names = host
          ? Array.from(host.querySelectorAll('strong')).map((node) => canonicalDriverKey(node.textContent))
          : [];
        if (names.length !== 8 || new Set(names).size !== 8) refreshMainRanking();
      }, 250);
    }).observe(root, { childList: true, subtree: true, characterData: true });

    window.setTimeout(refreshMainRanking, 750);
    window.setTimeout(refreshMainRanking, 2500);
    window.setInterval(refreshMainRanking, REFRESH_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();