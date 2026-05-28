/* GC_TRACK_IMAGE_FUZZY_RESOLVER_V1_1
 * Finds real track images with fuzzy matching.
 * It never requests guessed /images/tracks/*.webp files blindly.
 */
(() => {
  const VERSION = 'v1.1';
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
    ['okayama', ['okayama_international', 'okayama_circuit']]
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
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#071506"/>
          <stop offset="0.45" stop-color="#10240b"/>
          <stop offset="1" stop-color="#020602"/>
        </linearGradient>
        <radialGradient id="r" cx="72%" cy="20%" r="72%">
          <stop offset="0" stop-color="#89ff35" stop-opacity="0.22"/>
          <stop offset="0.42" stop-color="#89ff35" stop-opacity="0.06"/>
          <stop offset="1" stop-color="#89ff35" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#g)"/>
      <rect width="1200" height="675" fill="url(#r)"/>
      <g opacity="0.18" stroke="#b4ff73" stroke-width="2">
        <path d="M-50 540 C 180 420, 290 420, 485 510 S 820 660, 1250 430" fill="none"/>
        <path d="M-40 585 C 190 465, 310 465, 500 555 S 820 708, 1250 475" fill="none"/>
        <path d="M-20 180 L 1220 180 M -20 300 L 1220 300 M -20 420 L 1220 420" opacity="0.22"/>
        <path d="M200 -20 L200 700 M400 -20 L400 700 M600 -20 L600 700 M800 -20 L800 700 M1000 -20 L1000 700" opacity="0.16"/>
      </g>
      <g font-family="Inter, Segoe UI, Arial, sans-serif">
        <text x="64" y="84" fill="#9dff47" font-size="28" font-weight="800" letter-spacing="4">GRASSCUTTERS</text>
        <text x="64" y="140" fill="#f1ffe8" font-size="44" font-weight="900">${clean}</text>
        <text x="64" y="192" fill="#afc6a2" font-size="26">Track image pending</text>
      </g>
    </svg>`;
  };

  const placeholderUrl = (label) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(label))}`;

  const keysForAsset = (fileOrUrl) => {
    const raw = String(fileOrUrl || '').split('/').pop() || '';
    const base = removeExtension(raw);
    const key = normalize(base);
    const baseNoYears = normalize(base.replace(/\b20\d{2}\b/g, ''));
    const baseNoWords = normalize(tokens(base).join('_'));

    return new Set([
      normalize(raw),
      key,
      baseNoYears,
      baseNoWords,
      compact(base),
      compact(baseNoYears)
    ].filter(Boolean));
  };

  const addAsset = (item) => {
    const url = item?.url || item?.src || item?.href || '';
    const file = item?.file || url.split('/').pop() || '';
    if (!url || !file) return;

    const asset = {
      url,
      file,
      name: removeExtension(file),
      keys: keysForAsset(file),
      tokens: tokens(removeExtension(file)),
      compact: compact(removeExtension(file))
    };

    assets.push(asset);

    for (const key of asset.keys) {
      if (!registry.has(key)) registry.set(key, asset);
    }
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
    } catch {
      return null;
    }
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
      if (score > bestScore) {
        best = asset;
        bestScore = score;
      }
    }

    return bestScore >= 45 ? { ...best, score: bestScore } : null;
  };

  const knownUrl = (trackName) => {
    const match = bestAsset(trackName);
    return match?.url || null;
  };

  const candidates = (trackName) => {
    const match = bestAsset(trackName);
    return [match?.url || placeholderUrl(trackName)];
  };

  const setImage = (img, trackName) => {
    if (!img) return;
    const label = trackName || img.getAttribute('data-track-name') || img.getAttribute('data-gc-track-name') || img.alt || '';
    const match = bestAsset(label);
    const src = match?.url || placeholderUrl(label);

    img.onerror = () => {
      img.onerror = null;
      img.src = placeholderUrl(label);
    };

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

  window.GCTrackImages = {
    version: VERSION,
    normalize,
    tokens,
    compact,
    placeholderUrl,
    candidates,
    knownUrl,
    bestAsset,
    scoreAsset,
    load,
    applyAll,
    registry,
    assets,
    addAsset
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyAll(), { once: true });
  } else {
    applyAll();
  }
})();
