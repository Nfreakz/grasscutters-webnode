/* GC_TRACK_IMAGE_FUZZY_RESOLVER_V2
 * Resolver compartido para imágenes y metadatos básicos de circuitos.
 * Home y /combos deben depender de esto, no de listas manuales por circuito.
 */
(() => {
  const VERSION = 'v2.0';
  const registry = new Map();
  const assets = [];
  const metaRegistry = new Map();
  let loading = null;
  let loaded = false;
  let homeObserverInstalled = false;
  let homeSyncTimer = null;

  const STOPWORDS = new Set([
    'track', 'circuit', 'gp', 'layout', 'online', 'offline', 'final', 'v1', 'v2', 'v3',
    'ks', 'rt', 'rss', 'acu', 'actk', 'sim', 'race', 'full', 'club', 'national', 'international'
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
    ['magione', ['autodromo_dell_umbria_magione', 'autodromo_umbria_magione', 'autodromo_umbria', 'circuito_di_magione', 'magione_circuit']]
  ]);

  const BUILTIN_META = [
    { keys: ['jerez', 'fn_jerez', 'circuito_de_jerez'], countryCode: 'ES', country: 'Spain', distance: '4,43 km' },
    { keys: ['mugello', 'ks_mugello'], countryCode: 'IT', country: 'Italy', distance: '5,245 km' },
    { keys: ['magione', 'autodromo_dell_umbria_magione', 'autodromo_umbria_magione', 'autodromo_umbria'], countryCode: 'IT', country: 'Italy', distance: '2,507 km' },
    { keys: ['fuji', 'rt_fuji_speedway', 'fuji_speedway'], countryCode: 'JP', country: 'Japan', distance: '4,563 km' },
    { keys: ['spa', 'ks_spa', 'rt_spa', 'spa_francorchamps'], countryCode: 'BE', country: 'Belgium', distance: '7,004 km' },
    { keys: ['zolder', 'rt_zolder', 'circuit_zolder'], countryCode: 'BE', country: 'Belgium', distance: '4,011 km' },
    { keys: ['brands_hatch', 'ks_brands_hatch'], countryCode: 'GB', country: 'United Kingdom', distance: '3,916 km' },
    { keys: ['imola'], countryCode: 'IT', country: 'Italy', distance: '4,909 km' },
    { keys: ['hockenheim', 'hockenheimring'], countryCode: 'DE', country: 'Germany', distance: '4,574 km' },
    { keys: ['suzuka'], countryCode: 'JP', country: 'Japan', distance: '5,807 km' },
    { keys: ['estoril'], countryCode: 'PT', country: 'Portugal' },
    { keys: ['portimao', 'algarve'], countryCode: 'PT', country: 'Portugal' },
    { keys: ['bathurst', 'mount_panorama'], countryCode: 'AU', country: 'Australia' },
    { keys: ['phillip_island', 'phillipisland'], countryCode: 'AU', country: 'Australia' },
    { keys: ['road_atlanta', 'road_america', 'sebring', 'laguna_seca', 'daytona', 'watkins_glen', 'vir'], countryCode: 'US', country: 'United States' },
    { keys: ['salzburgring', 'salzburg'], countryCode: 'AT', country: 'Austria' },
    { keys: ['nurburgring', 'nordschleife'], countryCode: 'DE', country: 'Germany' },
    { keys: ['okayama'], countryCode: 'JP', country: 'Japan' },
    { keys: ['vallelunga', 'monza', 'misano'], countryCode: 'IT', country: 'Italy' }
  ];

  const COUNTRY_NAME_TO_CODE = {
    spain: 'ES', espana: 'ES', espanya: 'ES', catalunya: 'ES', cataluna: 'ES', barcelona: 'ES', jerez: 'ES', jarama: 'ES', valencia: 'ES', aragon: 'ES', navarra: 'ES',
    italy: 'IT', italia: 'IT', italian: 'IT', mugello: 'IT', imola: 'IT', monza: 'IT', vallelunga: 'IT', misano: 'IT', magione: 'IT', umbria: 'IT',
    belgium: 'BE', belgica: 'BE', belgique: 'BE', spa: 'BE', zolder: 'BE',
    france: 'FR', francia: 'FR', lemans: 'FR', le_mans: 'FR', paul_ricard: 'FR', magny: 'FR', dijon: 'FR',
    germany: 'DE', alemania: 'DE', deutschland: 'DE', nurburgring: 'DE', nordschleife: 'DE', hockenheim: 'DE', lausitz: 'DE', sachsenring: 'DE', oschersleben: 'DE',
    united_kingdom: 'GB', uk: 'GB', great_britain: 'GB', england: 'GB', silverstone: 'GB', brands_hatch: 'GB', donington: 'GB', oulton: 'GB', snetterton: 'GB',
    united_states: 'US', usa: 'US', eeuu: 'US', sebring: 'US', laguna_seca: 'US', road_america: 'US', road_atlanta: 'US', watkins: 'US', daytona: 'US', vir: 'US',
    japan: 'JP', japon: 'JP', suzuka: 'JP', fuji: 'JP', okayama: 'JP', motegi: 'JP', tsukuba: 'JP',
    australia: 'AU', bathurst: 'AU', mount_panorama: 'AU', phillip_island: 'AU', adelaide: 'AU',
    austria: 'AT', red_bull: 'AT', spielberg: 'AT', salzburgring: 'AT',
    portugal: 'PT', estoril: 'PT', portimao: 'PT', algarve: 'PT',
    canada: 'CA', mosport: 'CA', mont_tremblant: 'CA', gilles_villeneuve: 'CA',
    mexico: 'MX', mexico_city: 'MX', hermanos_rodriguez: 'MX',
    argentina: 'AR', buenos_aires: 'AR',
    hungary: 'HU', hungaroring: 'HU',
    czech: 'CZ', brno: 'CZ', most: 'CZ',
    poland: 'PL', poznan: 'PL', silesia: 'PL',
    sweden: 'SE', mantorp: 'SE', anderstorp: 'SE',
    norway: 'NO', rudskogen: 'NO',
    finland: 'FI', kymi: 'FI', alastaro: 'FI',
    brazil: 'BR', brasil: 'BR', interlagos: 'BR'
  };

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

  const uniq = (items) => Array.from(new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));

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

  const expandQueryKeys = (trackName) => {
    const values = Array.isArray(trackName) ? trackName : [trackName];
    const expanded = new Set();

    values.filter(Boolean).forEach((value) => {
      const raw = normalize(value);
      const noYears = normalize(raw.replace(/\b20\d{2}\b/g, ''));
      const queryTokens = tokens(value);
      const queryCompact = compact(value);
      [raw, noYears, queryCompact, queryTokens.join('_')].filter(Boolean).forEach((item) => expanded.add(item));
    });

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

  function countryCodeFromValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    const normalized = normalize(raw);
    if (COUNTRY_NAME_TO_CODE[normalized]) return COUNTRY_NAME_TO_CODE[normalized];
    const parts = normalized.split('_').filter(Boolean);
    for (const part of parts) {
      if (COUNTRY_NAME_TO_CODE[part]) return COUNTRY_NAME_TO_CODE[part];
    }
    return '';
  }

  function formatDistance(value) {
    if (value === undefined || value === null || value === '') return '';
    const text = String(value).trim();
    if (!text || text === '--') return '';
    if (/km/i.test(text)) return text.replace('.', ',');
    const numeric = Number(text.replace(',', '.').replace(/[^0-9.]+/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    const km = numeric > 100 ? numeric / 1000 : numeric;
    return `${km.toLocaleString('es-ES', { maximumFractionDigits: 3 })} km`;
  }

  const metaKeys = (item = {}) => {
    const keys = [
      item.key,
      item.slug,
      item.id,
      item.name,
      item.title,
      item.track,
      item.trackName,
      item.displayTrackName,
      ...(Array.isArray(item.keys) ? item.keys : [])
    ];
    return expandQueryKeys(keys.filter(Boolean).join(' '));
  };

  const addMeta = (item = {}) => {
    const code = countryCodeFromValue(item.countryCode || item.country_code || item.country || item.pais || item.país || item.location || '');
    const distance = formatDistance(item.distance || item.distanceKm || item.lengthKm || item.trackLength || item.longitud || item.distancia || '');
    const country = item.country || item.pais || item.país || item.location || '';

    if (!code && !distance && !country) return;

    const meta = {
      ...item,
      countryCode: code,
      country: country || code,
      distance
    };

    metaKeys(item).forEach((key) => {
      if (key && !metaRegistry.has(key)) metaRegistry.set(key, meta);
    });
  };

  const addAsset = (item) => {
    const url = item?.url || item?.src || item?.href || '';
    const file = item?.file || url.split('/').pop() || '';
    if (!url || !file) return;

    const asset = {
      ...item,
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

    addMeta({
      keys: [...asset.keys],
      country: item.country,
      countryCode: item.countryCode || item.country_code,
      distance: item.distance || item.distanceKm || item.lengthKm || item.trackLength
    });
  };

  const addManifest = (data) => {
    const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    list.forEach(addAsset);
  };

  const addMetaManifest = (data) => {
    const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    list.forEach(addMeta);
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
      tryLoadJson('/api/gc/assets/tracks'),
      tryLoadJson('/gc-track-meta.json'),
      tryLoadJson('/js/gc-track-meta.json')
    ]).then((results) => {
      assets.length = 0;
      registry.clear();
      metaRegistry.clear();

      BUILTIN_META.forEach(addMeta);
      results.slice(0, 3).filter(Boolean).forEach(addManifest);
      results.slice(3).filter(Boolean).forEach(addMetaManifest);

      loaded = true;
      return true;
    }).catch(() => {
      loaded = false;
      return false;
    });

    return loading;
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

  const generatedCandidates = (trackName, kind = 'photo') => {
    const roots = ['/images/tracks', '/imagenes/tracks'];
    const photoExts = ['webp', 'jpg', 'jpeg', 'png', 'avif'];
    const mapExts = ['png', 'webp', 'jpg', 'jpeg', 'svg'];
    const exts = kind === 'map' ? mapExts : photoExts;
    const suffixes = kind === 'map'
      ? ['_mapa', '_map', '-mapa', '-map', '/map', '/mapa']
      : ['', '_photo', '-photo', '_foto', '-foto', '_hero', '-hero'];
    const keys = [...expandQueryKeys(trackName)];
    const urls = [];

    keys.forEach((key) => {
      suffixes.forEach((suffix) => {
        roots.forEach((root) => {
          exts.forEach((ext) => urls.push(`${root}/${key}${suffix}.${ext}`));
        });
      });
    });

    return uniq(urls);
  };

  const knownUrl = (trackName) => {
    const match = bestAsset(trackName);
    return match?.url || generatedCandidates(trackName)[0] || null;
  };

  const candidates = (trackName, kind = 'photo') => {
    const match = bestAsset(trackName);
    const generated = generatedCandidates(trackName, kind);

    if (kind === 'map') {
      return uniq([
        ...generated,
        match?.url,
        ...generatedCandidates(trackName, 'photo'),
        placeholderUrl(trackName)
      ]);
    }

    return uniq([
      match?.url,
      ...generated,
      placeholderUrl(trackName)
    ]);
  };

  const metadata = (trackName) => {
    const keys = [...expandQueryKeys(trackName)];
    for (const key of keys) {
      const hit = metaRegistry.get(key);
      if (hit) return hit;
    }

    const countryCode = countryCodeFromValue(keys.join(' '));
    return countryCode ? { countryCode, country: countryCode, distance: '' } : null;
  };

  const applyImageFallbacks = (img, list, label, kind = 'photo') => {
    if (!img || !list.length) return;
    const cleanList = uniq(list);
    let index = 0;

    img.onerror = function () {
      index += 1;
      if (cleanList[index]) {
        this.src = cleanList[index];
        return;
      }
      this.onerror = null;
      this.src = placeholderUrl(label);
    };

    if (img.getAttribute('src') !== cleanList[0]) img.setAttribute('src', cleanList[0]);
    img.dataset.gcTrackImageSource = 'auto';
    img.dataset.gcTrackImageResolver = VERSION;
    img.dataset.gcTrackImageKind = kind;
    img.dataset.gcTrackImageFallbacks = cleanList.slice(1).join('|');
  };

  const setImage = (img, trackName, kind = 'photo') => {
    if (!img) return;
    const label = trackName || img.getAttribute('data-track-name') || img.getAttribute('data-gc-track-name') || img.alt || '';
    applyImageFallbacks(img, candidates(label, kind), label, kind);
  };

  const homeTrackLabel = () => {
    const selectors = [
      '[data-home2-now-title]',
      '[data-home2-track]',
      '[data-home2-champ-next-meta]'
    ];

    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text && !/actualizando|esperando|--/i.test(text)) return text;
    }

    return '';
  };

  const setHomeText = (selector, value, force = false) => {
    const el = document.querySelector(selector);
    if (!el || !value) return;
    const current = el.textContent?.trim() || '';
    if (force || !current || current === '--' || /actualizando|pendiente/i.test(current)) el.textContent = value;
  };

  const setHomeCountryBadge = (countryCode, label = '') => {
    const badge = document.querySelector('[data-home2-track-country]');
    if (!badge || !countryCode) return;

    [...badge.classList].forEach((className) => {
      if (/^gc-home2-country--[a-z]{2}$/i.test(className)) badge.classList.remove(className);
    });

    badge.classList.add('gc-home2-country--flag', `gc-home2-country--${countryCode.toLowerCase()}`);
    badge.dataset.countryCode = countryCode;
    badge.title = [label, countryCode].filter(Boolean).join(' · ');
    badge.setAttribute('aria-label', `País: ${countryCode}`);
    badge.innerHTML = `<span>${countryCode}</span>`;
  };

  const syncHomeImagesAndMeta = async () => {
    await load();
    const label = homeTrackLabel();
    if (!label) return;

    document.querySelectorAll('[data-home2-track-image]').forEach((img) => setImage(img, label, 'photo'));
    document.querySelectorAll('[data-home2-track-map]').forEach((img) => setImage(img, label, 'map'));

    const meta = metadata(label);
    if (meta?.countryCode) {
      setHomeText('[data-home2-now-country]', meta.countryCode, true);
      setHomeCountryBadge(meta.countryCode, meta.country || '');
    }
    if (meta?.distance) setHomeText('[data-home2-now-distance]', meta.distance, true);
  };

  const scheduleHomeSync = () => {
    window.clearTimeout(homeSyncTimer);
    homeSyncTimer = window.setTimeout(() => {
      syncHomeImagesAndMeta().catch(() => {});
    }, 80);
  };

  const installHomeObserver = () => {
    if (homeObserverInstalled) return;
    homeObserverInstalled = true;

    const targets = [
      document.querySelector('[data-home2-now-title]'),
      document.querySelector('[data-home2-track]')
    ].filter(Boolean);

    if (targets.length) {
      const observer = new MutationObserver(scheduleHomeSync);
      targets.forEach((target) => observer.observe(target, { childList: true, characterData: true, subtree: true }));
    }

    [0, 300, 900, 1800, 3500].forEach((delay) => window.setTimeout(scheduleHomeSync, delay));
    window.setInterval(scheduleHomeSync, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleHomeSync();
    });
  };

  const applyAll = async (root = document) => {
    await load();

    root.querySelectorAll('img[data-track-name], img[data-gc-track-name], .gc-track-banner-v42 img').forEach((img) => {
      const label = img.getAttribute('data-track-name') || img.getAttribute('data-gc-track-name') || img.alt || '';
      setImage(img, label, 'photo');
    });

    installHomeObserver();
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
    generatedCandidates,
    metadata,
    countryCodeFromValue,
    formatDistance,
    load,
    applyAll,
    setImage,
    registry,
    assets,
    metaRegistry,
    addAsset,
    addMeta
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyAll(), { once: true });
  } else {
    applyAll();
  }
})();
