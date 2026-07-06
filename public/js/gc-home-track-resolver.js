/* GC_HOME_TRACK_RESOLVER_V24
 * Single Home helper for track images in Hero and championship cards.
 * Generic resolver: no weekly hardcodes. It builds aliases from the visible
 * track name and searches real files through browser image probing.
 */
(() => {
  const VERSION = 'v24';
  const PHOTO_FALLBACK = '/ui/home2/gc-home2-track-fallback.svg';
  const MAP_FALLBACK = '/ui/home2/gc-home2-track-outline.svg';

  const TRACKS = [
    { keys: ['jerez', 'fn_jerez', 'circuito_de_jerez', 'circuito_de_jerez_spain', 'jerez_spain', 'jerez_angel_nieto', 'circuito_de_jerez_angel_nieto'], display: 'Circuito de Jerez, Spain', asset: 'jerez', distance: '4,43 km' },
    { keys: ['mugello', 'ks_mugello', 'autodromo_internazionale_del_mugello'], display: 'Mugello, Italy', asset: 'mugello', distance: '5,245 km' },
    { keys: ['monza', 'ks_monza', 'autodromo_nazionale_monza'], display: 'Autodromo Nazionale Monza, Italy', asset: 'monza', distance: '5,793 km' },
    { keys: ['barcelona', 'ks_barcelona', 'circuit_de_barcelona_catalunya', 'catalunya'], display: 'Circuit de Barcelona-Catalunya, Spain', asset: 'barcelona', distance: '4,657 km' },
    { keys: ['spa', 'ks_spa', 'rt_spa', 'spa_francorchamps', 'circuit_de_spa_francorchamps'], display: 'Spa-Francorchamps, Belgium', asset: 'spa', distance: '7,004 km' },
    { keys: ['zolder', 'rt_zolder', 'circuit_zolder'], display: 'Circuit Zolder, Belgium', asset: 'zolder', distance: '4,011 km' },
    { keys: ['brands_hatch', 'ks_brands_hatch'], display: 'Brands Hatch, United Kingdom', asset: 'brands_hatch', distance: '3,916 km' },
    { keys: ['imola', 'autodromo_internazionale_enzo_e_dino_ferrari'], display: 'Imola, Italy', asset: 'imola', distance: '4,909 km' },
    { keys: ['hockenheim', 'ks_hockenheim', 've_hockenheim_gp', 'hockenheimring'], display: 'Hockenheimring, Germany', asset: 'hockenheim', distance: '4,574 km' },
    { keys: ['suzuka', 'ks_suzuka', 'suzuka_circuit'], display: 'Suzuka Circuit, Japan', asset: 'suzuka', distance: '5,807 km' },
    { keys: ['portimao', 'algarve', 'algarve_portimao', 'algarve_international_circuit', 'autodromo_internacional_do_algarve'], display: 'Algarve Portimao', asset: 'portimao', distance: '4.653 km' },
    { keys: ['estoril', 'estoril90', 'estoril_90', 'estoril90s', 'estoril_90s', 'estoril_90_s', 'estoril_90s_circuit'], display: 'Estoril 90s', asset: 'estoril90', distance: '' },
    { keys: ['a1_motor_park', 'a1motorpark', 'ks_a1_motor_park', 'pascani_motorpark_a1', 'pascani', '00_pascani_motorpark_a1'], display: 'A1 Motor Park', asset: 'a1_motor_park', distance: '' },
    { keys: ['vila_real', 'vilareal', 'vila_real_post_chicane', 'vila_real_pre_chicane'], display: 'Vila Real', asset: 'vilareal', distance: '' }
  ];

  const uniq = (items) => Array.from(new Set((items || []).filter(Boolean)));

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const cleanText = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value === 'object') {
      return cleanText(value.canonicalTrackName || value.trackName || value.track || value.circuitName || value.displayName || value.name || value.Name || value.id || value.ID || '');
    }
    return '';
  };

  const titleCaseFallback = (value) => {
    const clean = cleanText(value);
    if (!clean) return '';
    return clean
      .replace(/^(ks|rt|mx|fn|acu|nrms)[_-]/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const findTrack = (value) => {
    const raw = normalize(cleanText(value));
    if (!raw) return null;
    const compact = raw.replace(/[^a-z0-9]/g, '');
    return TRACKS.find((track) => {
      const keys = track.keys.map(normalize);
      return keys.some((key) => {
        const keyCompact = key.replace(/[^a-z0-9]/g, '');
        return raw === key || raw.includes(key) || key.includes(raw) || compact === keyCompact || compact.includes(keyCompact) || keyCompact.includes(compact);
      });
    }) || null;
  };

  const displayName = (value) => findTrack(value)?.display || titleCaseFallback(value);
  const assetName = (value) => findTrack(value)?.asset || cleanText(value);
  const distance = (value) => findTrack(value)?.distance || '';

  const stripCommonPrefixes = (key) => String(key || '')
    .replace(/^(ks|rt|mx|nrms|fn|acu|track|circuit|circuito|autodromo|autodrome)_+/, '')
    .replace(/_+(circuit|circuito|track|layout|gp|spain|italy|italia|france|hungary|hungaroring)$/g, '')
    .replace(/^_+|_+$/g, '');

  const expandKey = (value) => {
    const base = normalize(value);
    if (!base) return [];
    const out = new Set([base, base.replace(/_/g, '-'), base.replace(/-/g, '_')]);
    const compact = base.replace(/[^a-z0-9]/g, '');
    if (compact) out.add(compact);

    const stripped = stripCommonPrefixes(base);
    if (stripped && stripped !== base) expandKey(stripped).forEach((item) => out.add(item));

    const decade = base.match(/^(.*?)(?:_|-)?(\d{2})(?:_|-)?s?$/);
    if (decade) {
      const prefix = decade[1].replace(/[_-]+$/g, '');
      const digits = decade[2];
      if (prefix) {
        out.add(`${prefix}_${digits}`);
        out.add(`${prefix}-${digits}`);
        out.add(`${prefix}${digits}`);
        out.add(`${prefix}_${digits}s`);
        out.add(`${prefix}-${digits}s`);
        out.add(`${prefix}${digits}s`);
      }
    }

    return [...out].filter(Boolean);
  };

  const keysFor = (value) => {
    const meta = findTrack(value);
    const raw = cleanText(value);
    const seeds = [raw, normalize(raw), meta?.asset, meta?.display, ...(meta?.keys || [])];
    return uniq(seeds.flatMap(expandKey));
  };

  const aliasesFor = (value) => keysFor(value);

  const matchesTrack = (left, right) => {
    const a = aliasesFor(left);
    const b = aliasesFor(right);
    if (!a.length || !b.length) return false;
    return a.some((aa) => b.some((bb) => aa === bb || aa.includes(bb) || bb.includes(aa)));
  };

  const formatDistance = (value) => {
    if (value === undefined || value === null || value === '') return '';
    const text = String(value).trim();
    if (!text || text === '--') return '';
    if (/km/i.test(text)) return text.replace('.', ',');
    const numeric = Number(text.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    if (numeric > 100) return (numeric / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' km';
    return numeric.toLocaleString('es-ES', { maximumFractionDigits: 3 }) + ' km';
  };

  const extensionsFor = (kind) => kind === 'map'
    ? ['png', 'webp', 'jpg', 'jpeg', 'svg']
    : ['webp', 'jpg', 'jpeg', 'png', 'avif'];

  const candidateUrls = (value, kind = 'photo') => {
    const keys = keysFor(value);
    const exts = extensionsFor(kind);
    const urls = [];
    const pushWithExt = (pattern) => {
      for (const key of keys) for (const ext of exts) urls.push(pattern(key, ext));
    };

    if (kind === 'map') {
      pushWithExt((key, ext) => `/images/tracks/${key}_map.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}_mapa.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}-map.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}-mapa.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/maps/${key}.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/mapas/${key}.${ext}`);
      pushWithExt((key, ext) => `/imagenes/tracks/${key}_map.${ext}`);
      pushWithExt((key, ext) => `/imagenes/tracks/${key}_mapa.${ext}`);
    } else {
      pushWithExt((key, ext) => `/images/tracks/${key}.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}_hero.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}-hero.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}_photo.${ext}`);
      pushWithExt((key, ext) => `/images/tracks/${key}-photo.${ext}`);
      pushWithExt((key, ext) => `/imagenes/tracks/${key}.${ext}`);
      pushWithExt((key, ext) => `/imagenes/tracks/${key}_hero.${ext}`);
      pushWithExt((key, ext) => `/imagenes/tracks/${key}_photo.${ext}`);
    }
    return uniq(urls);
  };

  const probeImage = (src) => new Promise((resolve) => {
    if (!src) return resolve('');
    const test = new Image();
    test.onload = () => resolve(src);
    test.onerror = () => resolve('');
    test.src = src;
  });

  const loadSharedHelper = async () => {
    const helper = window.GCTrackImages;
    if (helper && typeof helper.load === 'function') {
      try { await helper.load(); } catch (_) {}
    }
    return helper || null;
  };

  const sharedBestAssetUrl = async (value) => {
    const helper = await loadSharedHelper();
    if (!helper || typeof helper.bestAsset !== 'function') return '';
    const queries = uniq([assetName(value), displayName(value), cleanText(value), ...keysFor(value)]);
    for (const query of queries) {
      try {
        const match = helper.bestAsset(query);
        if (match?.url) return match.url;
      } catch (_) {}
    }
    return '';
  };

  const resolveUrl = async (value, kind = 'photo') => {
    const candidates = candidateUrls(value, kind);
    if (kind === 'photo') {
      const shared = await sharedBestAssetUrl(value);
      if (shared) candidates.unshift(shared);
    }
    for (const url of uniq(candidates)) {
      const ok = await probeImage(url);
      if (ok) return ok;
    }
    if (kind === 'map') {
      const shared = await sharedBestAssetUrl(value);
      if (shared) return shared;
    }
    return '';
  };

  const setTrackImage = async (img, value, kind = 'photo') => {
    if (!img || !value) return false;
    const clean = cleanText(value);
    const url = await resolveUrl(clean, kind);
    if (!url) return false;
    img.onerror = function () {
      this.onerror = null;
      this.src = kind === 'map' ? MAP_FALLBACK : PHOTO_FALLBACK;
    };
    img.src = url;
    img.alt = displayName(clean);
    img.dataset.gcHomeTrackResolver = VERSION;
    img.dataset.gcHomeTrackKind = kind;
    img.dataset.gcHomeTrackQuery = clean;
    return true;
  };

  const textFromChampionshipBlock = (block) => {
    if (!block) return '';
    const next = block.querySelector('[data-home2-champ-next]')?.textContent || '';
    const meta = block.querySelector('[data-home2-champ-next-meta]')?.textContent || '';
    const name = block.querySelector('[data-home2-champ-name]')?.textContent || '';
    return [next, meta, name]
      .join(' ')
      .replace(/\b(Activo|Pendiente|Próxima sesión|Clasificación|Eventos|Calendario|Liga|GrassCutters|Campeonato|GT4|Toyota|Supra|Servidor)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const fixHomeChampionshipImages = async () => {
    const imgs = Array.from(document.querySelectorAll('img[data-home2-champ-track-image]'));
    for (const img of imgs) {
      const block = img.closest('[data-home2-championship]');
      const query = textFromChampionshipBlock(block);
      if (!query) continue;
      const already = img.dataset.gcHomeChampImageQuery;
      if (already === query && img.dataset.gcHomeTrackResolver === VERSION) continue;
      const ok = await setTrackImage(img, query, 'photo');
      if (ok) img.dataset.gcHomeChampImageQuery = query;
    }
  };

  const scheduleChampionshipImageFix = () => {
    window.clearTimeout(window.__gcHomeChampImageFixTimer || 0);
    window.__gcHomeChampImageFixTimer = window.setTimeout(fixHomeChampionshipImages, 120);
  };

  window.GCHomeTrackResolver = {
    version: VERSION,
    normalize,
    cleanText,
    displayName,
    assetName,
    distance,
    matchesTrack,
    formatDistance,
    candidateUrls,
    resolveUrl,
    setTrackImage,
    fixHomeChampionshipImages
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleChampionshipImageFix, { once: true });
  } else {
    scheduleChampionshipImageFix();
  }

  const observer = new MutationObserver(scheduleChampionshipImageFix);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
