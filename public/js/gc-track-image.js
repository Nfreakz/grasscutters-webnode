/* GC_TRACK_IMAGE_FUZZY_RESOLVER_V1_2 + GC_COMBO_DETAIL_CLIENT_FALLBACK_V25
 * Finds real track images with fuzzy matching.
 * Adds a safe client fallback for /combos/:comboId when the detail endpoint misses
 * logical ids such as main:track:default or gt4:track:default.
 */
(() => {
  const VERSION = 'v1.2';
  const registry = new Map();
  const assets = [];
  let loading = null;
  let loaded = false;

  const STOPWORDS = new Set([
    'track', 'circuit', 'gp', 'layout', 'online', 'final', 'v1', 'v2', 'v3',
    'ks', 'rt', 'rss', 'acu', 'actk', 'sim', 'race'
  ]);

  const ALIASES = new Map([
    ['phillip_island_2013', ['phillip_island', 'phillipisland', 'phillip_island_circuit']],
    ['phillip_island_circuit', ['phillip_island', 'phillipisland', 'phillip_island_2013']],
    ['mx_sb_day_standing', ['sebring', 'sebring_international', 'sebring_2021']],
    ['rt_zolder', ['zolder', 'zolder_gp', 'circuit_zolder']],
    ['nrs_z_der2017online', ['zolder', 'rt_zolder']],
    ['ve_hockenheim_gp', ['hockenheim', 'hockenheimring', 'hockenheim_gp']],
    ['ks_hockenheim', ['hockenheim', 'hockenheimring']],
    ['ks_suzuka', ['suzuka', 'suzuka_circuit']],
    ['ks_nurburgring', ['nurburgring', 'nuerburgring']],
    ['ks_barcelona', ['barcelona', 'catalunya', 'circuit_de_barcelona_catalunya']],
    ['ks_mugello', ['mugello']],
    ['rt_spa', ['spa', 'spa_francorchamps', 'spa_francorchamps_gp']],
    ['ks_spa', ['spa', 'spa_francorchamps']],
    ['salzburgring', ['salzburg_ring', 'salzburg']],
    ['okayama', ['okayama_international', 'okayama_circuit']],
    ['estoril90s', ['estoril_90s', 'estoril_90', 'estoril90', 'acu_estoril90s', 'acu_estoril90s_estoril_90s']],
    ['estoril_90s', ['estoril90s', 'estoril90', 'estoril_90', 'acu_estoril90s', 'acu_estoril90s_estoril_90s']]
  ]);

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b20(\d{2})\b/g, '20$1')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const removeExtension = (value) => String(value || '').replace(/\.(jpg|jpeg|png|webp|avif|svg)$/i, '');

  const tokens = (value) => normalize(value)
    .split('_')
    .map((item) => item.trim())
    .filter((item) => item && !STOPWORDS.has(item));

  const compact = (value) => tokens(value).join('');

  const title = (value) => String(value || '')
    .replace(/\.(jpg|jpeg|png|webp|avif|svg)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Track image pending';

  const svg = (label) => {
    const clean = title(label).replace(/[<>&'"]/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${clean}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#071506"/><stop offset="0.45" stop-color="#10240b"/><stop offset="1" stop-color="#020602"/></linearGradient>
        <radialGradient id="r" cx="72%" cy="20%" r="72%"><stop offset="0" stop-color="#89ff35" stop-opacity="0.22"/><stop offset="0.42" stop-color="#89ff35" stop-opacity="0.06"/><stop offset="1" stop-color="#89ff35" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#g)"/><rect width="1200" height="675" fill="url(#r)"/>
      <g opacity="0.18" stroke="#b4ff73" stroke-width="2"><path d="M-50 540 C 180 420, 290 420, 485 510 S 820 660, 1250 430" fill="none"/><path d="M-40 585 C 190 465, 310 465, 500 555 S 820 708, 1250 475" fill="none"/><path d="M-20 180 L 1220 180 M -20 300 L 1220 300 M -20 420 L 1220 420" opacity="0.22"/><path d="M200 -20 L200 700 M400 -20 L400 700 M600 -20 L600 700 M800 -20 L800 700 M1000 -20 L1000 700" opacity="0.16"/></g>
      <g font-family="Inter, Segoe UI, Arial, sans-serif"><text x="64" y="84" fill="#9dff47" font-size="28" font-weight="800" letter-spacing="4">GRASSCUTTERS</text><text x="64" y="140" fill="#f1ffe8" font-size="44" font-weight="900">${clean}</text><text x="64" y="192" fill="#afc6a2" font-size="26">Track image pending</text></g>
    </svg>`;
  };

  const placeholderUrl = (label) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(label))}`;

  const keysForAsset = (fileOrUrl) => {
    const raw = String(fileOrUrl || '').split('/').pop() || '';
    const base = removeExtension(raw);
    const key = normalize(base);
    const baseNoYears = normalize(base.replace(/\b20\d{2}\b/g, ''));
    const baseNoWords = normalize(tokens(base).join('_'));
    return new Set([normalize(raw), key, baseNoYears, baseNoWords, compact(base), compact(baseNoYears)].filter(Boolean));
  };

  const addAsset = (item) => {
    const url = item?.url || item?.src || item?.href || '';
    const file = item?.file || url.split('/').pop() || '';
    if (!url || !file) return;
    const asset = { url, file, name: removeExtension(file), keys: keysForAsset(file), tokens: tokens(removeExtension(file)), compact: compact(removeExtension(file)) };
    assets.push(asset);
    for (const key of asset.keys) if (!registry.has(key)) registry.set(key, asset);
  };

  const addManifest = (data) => {
    const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    list.forEach(addAsset);
  };

  const tryLoadJson = async (url) => {
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  };

  const load = async () => {
    if (loaded) return true;
    if (loading) return loading;
    loading = Promise.all([
      tryLoadJson('/gc-track-images-manifest.json'),
      tryLoadJson('/js/gc-track-images-manifest.json'),
      tryLoadJson('/api/gc/assets/tracks')
    ]).then((results) => {
      assets.length = 0;
      registry.clear();
      results.filter(Boolean).forEach(addManifest);
      loaded = true;
      return true;
    }).catch(() => {
      loaded = false;
      return false;
    });
    return loading;
  };

  const expandQueryKeys = (trackName) => {
    const raw = normalize(trackName);
    const noYears = normalize(raw.replace(/\b20\d{2}\b/g, ''));
    const queryTokens = tokens(trackName);
    const queryCompact = compact(trackName);
    const expanded = new Set([raw, noYears, queryCompact, queryTokens.join('_')].filter(Boolean));

    for (const key of [...expanded]) {
      const aliases = ALIASES.get(key);
      if (aliases) aliases.forEach((alias) => expanded.add(normalize(alias)));
    }
    for (const [key, aliases] of ALIASES.entries()) {
      if (expanded.has(key) || aliases.some((alias) => expanded.has(normalize(alias)))) {
        expanded.add(key);
        aliases.forEach((alias) => expanded.add(normalize(alias)));
      }
    }
    return expanded;
  };

  const scoreAsset = (trackName, asset) => {
    const queryKeys = expandQueryKeys(trackName);
    const queryTokens = tokens(trackName);
    const queryCompact = compact(trackName);
    let score = 0;
    for (const key of queryKeys) {
      if (asset.keys.has(key)) score += 100;
      if (asset.compact === key) score += 90;
      if (asset.compact.includes(key) || key.includes(asset.compact)) score += 55;
    }
    const assetTokenSet = new Set(asset.tokens);
    const shared = queryTokens.filter((token) => assetTokenSet.has(token));
    score += shared.length * 24;
    if (queryCompact && asset.compact && (asset.compact.includes(queryCompact) || queryCompact.includes(asset.compact))) score += 35;
    const ext = String(asset.file).split('.').pop().toLowerCase();
    if (ext === 'webp') score += 4;
    if (ext === 'jpg' || ext === 'jpeg') score += 3;
    if (ext === 'png') score += 2;
    return score;
  };

  const bestAsset = (trackName) => {
    if (!assets.length) return null;
    let best = null;
    let bestScore = 0;
    for (const asset of assets) {
      const score = scoreAsset(trackName, asset);
      if (score > bestScore) { best = asset; bestScore = score; }
    }
    return bestScore >= 45 ? { ...best, score: bestScore } : null;
  };

  const knownUrl = (trackName) => bestAsset(trackName)?.url || null;
  const candidates = (trackName) => [bestAsset(trackName)?.url || placeholderUrl(trackName)];

  const setImage = (img, trackName) => {
    if (!img) return;
    const label = trackName || img.getAttribute('data-track-name') || img.getAttribute('data-gc-track-name') || img.alt || '';
    const match = bestAsset(label);
    const src = match?.url || placeholderUrl(label);
    img.onerror = () => { img.onerror = null; img.src = placeholderUrl(label); };
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.dataset.gcTrackImageSource = match ? 'fuzzy' : 'placeholder';
    if (match) {
      img.dataset.gcTrackImageFile = match.file;
      img.dataset.gcTrackImageScore = String(match.score);
    }
  };

  const applyAll = async (root = document) => {
    await load();
    root.querySelectorAll('img[data-track-name], img[data-gc-track-name], .gc-track-banner-v42 img').forEach((img) => {
      const label = img.getAttribute('data-track-name') || img.getAttribute('data-gc-track-name') || img.alt || '';
      setImage(img, label);
    });
  };

  window.GCTrackImages = { version: VERSION, normalize, tokens, compact, placeholderUrl, candidates, knownUrl, bestAsset, scoreAsset, load, applyAll, registry, assets, addAsset };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyAll(), { once: true });
  else applyAll();
})();

/* GC_COMBO_DETAIL_CLIENT_FALLBACK_V25_START
 * The backend currently has two combo-detail builders registered. The public list uses the
 * logical combo id, but /api/gc/combos/:comboId can still miss ids like
 * main:acu_estoril90s_estoril_90s:default. This wrapper only activates on failed
 * detail payloads and reconstructs the same response from /api/gc/combos.
 */
(() => {
  if (window.__GC_COMBO_DETAIL_CLIENT_FALLBACK_V25__) return;
  window.__GC_COMBO_DETAIL_CLIENT_FALLBACK_V25__ = true;

  const originalFetch = window.fetch.bind(window);
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const decodeSafe = (value) => {
    try { return decodeURIComponent(String(value || '')); }
    catch { return String(value || ''); }
  };

  const splitLogicalComboId = (comboId) => {
    const decoded = decodeSafe(comboId);
    const parts = decoded.split(':');
    if (parts.length >= 3) return { source: parts[0], track: parts.slice(1, -1).join(':'), variant: parts[parts.length - 1], decoded };
    return { source: '', track: decoded, variant: '', decoded };
  };

  const comboIds = (item) => [
    item?.comboId,
    item?.id,
    item?.canonicalComboId,
    item?.canonicalKey,
    item?.sourceKey && item?.canonicalKey ? `${item.sourceKey}:${item.canonicalKey}:default` : '',
    item?.sourceKey && item?.track?.canonicalKey ? `${item.sourceKey}:${item.track.canonicalKey}:default` : '',
    item?.sourceKey && item?.track?.code ? `${item.sourceKey}:${item.track.code}:default` : '',
    item?.mainVariant?.comboId,
    item?.mainVariant?.variantKey,
    ...(Array.isArray(item?.memberComboIds) ? item.memberComboIds : []),
    ...(Array.isArray(item?.comboIds) ? item.comboIds : []),
    ...(Array.isArray(item?.variants) ? item.variants.flatMap((variant) => [variant?.comboId, variant?.variantKey, ...(variant?.comboIds || [])]) : [])
  ].filter(Boolean).map(String);

  const trackText = (item) => [
    item?.trackName,
    item?.displayTrackName,
    item?.canonicalTrackName,
    item?.canonicalKey,
    item?.track?.name,
    item?.track?.displayName,
    item?.track?.code,
    item?.track?.canonicalKey,
    item?.mainVariant?.rawTrackCode,
    item?.mainVariant?.rawTrackName,
    item?.mainVariant?.variantKey,
    ...(Array.isArray(item?.variants) ? item.variants.flatMap((variant) => [variant?.rawTrackCode, variant?.rawTrackName, variant?.displayName, variant?.variantKey]) : [])
  ].filter(Boolean).join(' ');

  const matchesCombo = (item, requestedId) => {
    const wanted = decodeSafe(requestedId);
    const wantedNorm = normalize(wanted);
    const logical = splitLogicalComboId(wanted);
    const wantedTrack = normalize(logical.track);
    const wantedSource = normalize(logical.source);

    const ids = comboIds(item);
    if (ids.some((id) => id === wanted || normalize(id) === wantedNorm)) return true;

    const itemSource = normalize(item?.sourceKey || item?.source || item?.serverKey || '');
    const sourceOk = !wantedSource || !itemSource || itemSource === wantedSource;
    const haystack = normalize(trackText(item));
    const trackOk = Boolean(wantedTrack && haystack && (haystack.includes(wantedTrack) || wantedTrack.includes(haystack) || wantedTrack.split('_').filter((part) => part.length > 2).every((part) => haystack.includes(part))));
    return sourceOk && trackOk;
  };

  const buildDetailPayload = (item, requestedId, sourcePayload) => {
    const summary = item?.summary || {};
    const leaderboard = Array.isArray(item?.leaderboard) ? item.leaderboard : [];
    const recentLaps = Array.isArray(item?.recentLaps) ? item.recentLaps : [];
    const detailItem = {
      ...item,
      comboId: item?.comboId || item?.canonicalComboId || requestedId,
      canonicalComboId: item?.canonicalComboId || item?.comboId || requestedId,
      sourceKey: item?.sourceKey || item?.source || splitLogicalComboId(requestedId).source || '',
      source: item?.source || item?.sourceKey || splitLogicalComboId(requestedId).source || 'gc-data-core-client-fallback',
      summary: {
        ...summary,
        totalLaps: summary.totalLaps ?? item?.totalLaps ?? item?.laps ?? 0,
        validLaps: summary.validLaps ?? item?.validLaps ?? item?.cleanLaps ?? 0,
        invalidLaps: summary.invalidLaps ?? item?.invalidLaps ?? 0,
        driversCount: summary.driversCount ?? item?.driversCount ?? item?.driverCount ?? leaderboard.length,
        usedCarsCount: summary.usedCarsCount ?? item?.usedCarsCount ?? item?.carsCount ?? (Array.isArray(item?.cars) ? item.cars.length : 0),
        bestLap: summary.bestLap || item?.bestLap || leaderboard[0] || null,
        bestLapTime: summary.bestLapTime || item?.bestLapTime || item?.bestLapTimeFormatted || leaderboard[0]?.lapTime || '--',
        maxSpeedKmh: summary.maxSpeedKmh ?? item?.maxSpeedKmh ?? 0,
        lastSeenAt: summary.lastSeenAt || item?.lastSeenAt || item?.lastActivityAt || recentLaps[0]?.timestampIso || null,
        lastActivityAt: summary.lastActivityAt || summary.lastSeenAt || item?.lastActivityAt || item?.lastSeenAt || recentLaps[0]?.timestampIso || null,
        latestLapAt: summary.latestLapAt || summary.lastSeenAt || item?.latestLapAt || item?.lastSeenAt || recentLaps[0]?.timestampIso || null,
        cleanRate: summary.cleanRate ?? item?.cleanRate ?? 0
      },
      leaderboard,
      recentLaps
    };

    return {
      ok: true,
      source: 'gc-data-core-client-fallback-v25',
      dataSource: sourcePayload?.dataSource || sourcePayload?.mode || null,
      generatedAt: new Date().toISOString(),
      item: detailItem,
      meta: {
        requestedComboId: requestedId,
        matchedComboId: detailItem.comboId,
        endpoint: '/api/gc/combos/:comboId client fallback from /api/gc/combos'
      },
      message: 'Ficha reconstruida desde el listado público de combos porque el detalle backend no encontró el combo lógico.'
    };
  };

  const isComboDetailRequest = (input) => {
    const raw = typeof input === 'string' ? input : input?.url || '';
    if (!raw) return null;
    const url = new URL(raw, window.location.origin);
    const match = url.pathname.match(/^\/api\/gc\/combos\/([^/]+)$/);
    if (!match || url.pathname.includes('/combos-legacy/')) return null;
    return { url, comboId: decodeSafe(match[1]) };
  };

  const responseFromJson = (payload, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-gc-client-fallback': 'combo-detail-v25' }
  });

  window.fetch = async function gcComboDetailClientFallbackFetch(input, init) {
    const detail = isComboDetailRequest(input);
    if (!detail) return originalFetch(input, init);

    let primaryResponse = null;
    let primaryPayload = null;
    try {
      primaryResponse = await originalFetch(input, init);
      primaryPayload = await primaryResponse.clone().json().catch(() => null);
      if (primaryResponse.ok && primaryPayload?.ok && primaryPayload?.item) return primaryResponse;
    } catch (error) {
      primaryPayload = { ok: false, message: error?.message || String(error) };
    }

    try {
      const source = splitLogicalComboId(detail.comboId).source;
      const listUrl = new URL('/api/gc/combos', window.location.origin);
      listUrl.searchParams.set('source', ['main', 'gt4'].includes(source) ? source : 'all');
      listUrl.searchParams.set('limit', '1000');
      listUrl.searchParams.set('sort', 'recent');
      listUrl.searchParams.set('_gcComboDetailFallback', String(Date.now()));

      const listResponse = await originalFetch(listUrl.pathname + listUrl.search, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const listPayload = await listResponse.json().catch(() => null);
      const items = Array.isArray(listPayload?.items) ? listPayload.items : [];
      const match = items.find((item) => matchesCombo(item, detail.comboId));

      if (match) {
        console.info('[GC combo detail client fallback v25] matched logical combo', { requested: detail.comboId, matched: match.comboId || match.canonicalComboId || match.id });
        return responseFromJson(buildDetailPayload(match, detail.comboId, listPayload));
      }
    } catch (error) {
      console.warn('[GC combo detail client fallback v25] failed', error);
    }

    if (primaryResponse) return primaryResponse;
    return responseFromJson(primaryPayload || { ok: false, item: null, message: 'Combo no encontrado.' }, 200);
  };
})();
/* GC_COMBO_DETAIL_CLIENT_FALLBACK_V25_END */
