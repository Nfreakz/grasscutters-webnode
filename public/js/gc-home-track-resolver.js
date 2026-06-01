/* GC_HOME_TRACK_RESOLVER_V2
 * Home-only helper for active combo track labels, images, maps and distances.
 * Does not touch /app. It only exposes window.GCHomeTrackResolver.
 */
(() => {
  const VERSION = 'v3';

  const TRACKS = [
    {
      keys: ['fn_jerez', 'jerez', 'circuito_de_jerez', 'circuito_de_jerez_spain', 'jerez_spain', 'jerez_angel_nieto', 'circuito_de_jerez_angel_nieto'],
      display: 'Circuito de Jerez, Spain',
      asset: 'jerez',
      country: 'Spain',
      distance: '4,43 km'
    },
    {
      keys: ['ks_mugello', 'mugello', 'autodromo_internazionale_del_mugello'],
      display: 'Mugello, Italy',
      asset: 'mugello',
      country: 'Italy',
      distance: '5,245 km'
    },
    {
      keys: ['monza', 'ks_monza', 'autodromo_nazionale_monza'],
      display: 'Autodromo Nazionale Monza, Italy',
      asset: 'monza',
      country: 'Italy',
      distance: '5,793 km'
    },
    {
      keys: ['barcelona', 'ks_barcelona', 'circuit_de_barcelona_catalunya', 'catalunya'],
      display: 'Circuit de Barcelona-Catalunya, Spain',
      asset: 'barcelona',
      country: 'Spain',
      distance: '4,657 km'
    },
    {
      keys: ['spa', 'ks_spa', 'rt_spa', 'spa_francorchamps', 'circuit_de_spa_francorchamps'],
      display: 'Spa-Francorchamps, Belgium',
      asset: 'spa',
      country: 'Belgium',
      distance: '7,004 km'
    },
    {
      keys: ['zolder', 'rt_zolder', 'circuit_zolder'],
      display: 'Circuit Zolder, Belgium',
      asset: 'zolder',
      country: 'Belgium',
      distance: '4,011 km'
    },
    {
      keys: ['brands_hatch', 'ks_brands_hatch'],
      display: 'Brands Hatch, United Kingdom',
      asset: 'brands_hatch',
      country: 'United Kingdom',
      distance: '3,916 km'
    },
    {
      keys: ['imola', 'autodromo_internazionale_enzo_e_dino_ferrari'],
      display: 'Imola, Italy',
      asset: 'imola',
      country: 'Italy',
      distance: '4,909 km'
    },
    {
      keys: ['hockenheim', 'ks_hockenheim', 've_hockenheim_gp', 'hockenheimring'],
      display: 'Hockenheimring, Germany',
      asset: 'hockenheim',
      country: 'Germany',
      distance: '4,574 km'
    },
    {
      keys: ['suzuka', 'ks_suzuka', 'suzuka_circuit'],
      display: 'Suzuka Circuit, Japan',
      asset: 'suzuka',
      country: 'Japan',
      distance: '5,807 km'
    }
  ];

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const cleanText = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value === 'object') {
      return cleanText(
        value.canonicalTrackName ||
        value.trackName ||
        value.track ||
        value.circuitName ||
        value.name ||
        value.Name ||
        value.id ||
        value.ID ||
        ''
      );
    }
    return '';
  };

  const titleCaseFallback = (value) => {
    const clean = cleanText(value);
    if (!clean) return '';
    return clean
      .replace(/^ks[_-]/i, '')
      .replace(/^rt[_-]/i, '')
      .replace(/^mx[_-]/i, '')
      .replace(/^fn[_-]/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const findTrack = (value) => {
    const raw = normalize(cleanText(value));
    if (!raw) return null;

    return TRACKS.find((track) => {
      const keys = track.keys.map(normalize);
      return keys.some((key) => raw === key || raw.includes(key) || key.includes(raw));
    }) || null;
  };

  const displayName = (value) => findTrack(value)?.display || titleCaseFallback(value);
  const assetName = (value) => findTrack(value)?.asset || cleanText(value);
  const distance = (value) => findTrack(value)?.distance || '';


  const aliasesFor = (value) => {
    const meta = findTrack(value);
    const direct = normalize(cleanText(value));
    const out = [direct];
    if (meta) {
      out.push(normalize(meta.display));
      out.push(normalize(meta.asset));
      out.push(...meta.keys.map(normalize));
    }
    const stripped = out.map((key) => key.replace(/^(ks|rt|mx|nrms|fn)_/, ''));
    return uniq([...out, ...stripped]);
  };

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

  const uniq = (items) => Array.from(new Set(items.filter(Boolean)));

  const extensionsFor = (kind) => kind === 'map'
    ? ['png', 'webp', 'jpg', 'jpeg', 'svg']
    : ['webp', 'jpg', 'jpeg', 'png', 'avif'];

  const keysFor = (value) => {
    const meta = findTrack(value);
    const raw = normalize(cleanText(value));
    const base = normalize(meta?.asset || raw);
    const keys = [
      raw,
      base,
      raw.replace(/^(ks|rt|mx|fn)_/, ''),
      base.replace(/^(ks|rt|mx|fn)_/, ''),
      ...(meta?.keys || []).map(normalize)
    ];
    return uniq(keys);
  };

  const candidateUrls = (value, kind = 'photo') => {
    const keys = keysFor(value);
    const exts = extensionsFor(kind);
    const urls = [];

    const pushWithExt = (pattern) => {
      for (const ext of exts) {
        for (const key of keys) urls.push(pattern(key, ext));
      }
    };

    if (kind === 'map') {
      pushWithExt((key, ext) => '/images/tracks/' + key + '_map.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '_mapa.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '-map.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '-mapa.' + ext);
      pushWithExt((key, ext) => '/images/tracks/maps/' + key + '.' + ext);
      pushWithExt((key, ext) => '/images/tracks/maps/' + key + '_map.' + ext);
      pushWithExt((key, ext) => '/images/tracks/mapas/' + key + '.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '/map.' + ext);
      pushWithExt((key, ext) => '/imagenes/tracks/' + key + '_map.' + ext);
      pushWithExt((key, ext) => '/imagenes/tracks/' + key + '_mapa.' + ext);
    } else {
      pushWithExt((key, ext) => '/images/tracks/' + key + '.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '_hero.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '-hero.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '_photo.' + ext);
      pushWithExt((key, ext) => '/images/tracks/' + key + '-photo.' + ext);
      pushWithExt((key, ext) => '/imagenes/tracks/' + key + '.' + ext);
      pushWithExt((key, ext) => '/imagenes/tracks/' + key + '_hero.' + ext);
      pushWithExt((key, ext) => '/imagenes/tracks/' + key + '_photo.' + ext);
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
      try {
        await helper.load();
      } catch (_) {}
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
      if (kind === 'map') {
        this.src = '/ui/home2/gc-home2-track-outline.svg';
      } else {
        this.src = '/ui/home2/gc-home2-track-fallback.svg';
      }
    };

    img.src = url;
    img.alt = displayName(clean);
    img.dataset.gcHomeTrackResolver = VERSION;
    img.dataset.gcHomeTrackKind = kind;
    return true;
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
    setTrackImage
  };
})();
