(() => {
  if (window.GCTrackImages) return;

  const BASE_DIRS = ['/images/tracks', '/imagenes/tracks'];
  const EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'avif'];

  const NOISE_TOKENS = new Set([
    'rt','nrms','acu','actk','reboot','tm','ks','ac','vhe','aa','ddm','osrw','endurance',
    'online','offline','server','track','circuit','layout','layouts','gp','full','short',
    'extra','extension','ext','pit','pits','race','raceway','speedway','international',
    'national','club','classic','modern','wet','dry','day','night','reverse','normal',
    'final','v1','v2','v3','v4','v5','vao','csp','ai','aiw'
  ]);

  const TRACK_CORES = [
    'zolder',
    'mugello',
    'spa',
    'monza',
    'imola',
    'barcelona',
    'brands_hatch',
    'nurburgring',
    'nordschleife',
    'silverstone',
    'zandvoort',
    'red_bull_ring',
    'vallelunga',
    'laguna_seca',
    'suzuka',
    'bathurst',
    'mount_panorama',
    'donington',
    'oulton',
    'oulton_park',
    'cadwell',
    'cadwell_park',
    'snetterton',
    'thruxton',
    'goodwood',
    'watkins_glen',
    'road_america',
    'road_atlanta',
    'sebring',
    'sebring_international',
    'sebring_international_raceway',
    'daytona',
    'vir',
    'virginia',
    'mosport',
    'ctmp',
    'interlagos',
    'jacarepagua',
    'kansai',
    'okayama',
    'fuji',
    'motegi',
    'tsukuba',
    'kyalami',
    'paul_ricard',
    'ricard',
    'magny_cours',
    'le_mans',
    'lemans',
    'la_sarthe',
    'hockenheim',
    'hockenheimring',
    'lausitzring',
    'sachsenring',
    'brno',
    'most',
    'hungaroring',
    'misano',
    'valencia',
    'estoril',
    'portimao',
    'jarama',
    'jerez',
    'knutstorp',
    'anderstorp',
    'mantorp',
    'ledenon',
    'nogaro',
    'ledenon',
    'rouen',
    'charade',
    'montlhery',
    'bikernieki',
    'tor_poznan',
    'poznan',
    'algarve',
    'florida',
    'miami',
    'long_beach',
    'sonoma',
    'willow_springs',
    'lime_rock',
    'lime_rock_park',
    'indianapolis',
    'indy',
    'cota',
    'austin',
    'mexico',
    'monaco',
    'singapore',
    'melbourne',
    'albert_park',
    'bahrain',
    'losail',
    'qatar',
    'dubai',
    'yas_marina',
    'abu_dhabi',
    'sepang',
    'shanghai',
    'macau',
    'macau_guia',
    'guia',
    'suzuka',
    'phillip_island',
    'philip_island',
    'vr_phillip_island',
    'adelaide',
    'sandown',
    'symmons_plains',
    'knockhill',
    'croft',
    'mallory',
    'castle_combe',
    'pembrey',
    'bikernieki'
  ];

  const ALIASES = {
    philip_island_2013: 'phillip_island',
    philip_island: 'phillip_island',
    vr_phillip_island_2013: 'phillip_island',
    vr_phillip_island: 'phillip_island',
    sebring_international_raceway: 'sebring',
    sebring_international: 'sebring',
    sebring2021: 'sebring',
    sebring_2021: 'sebring',
    rt_sebring: 'sebring',
    ks_mugello: 'mugello',
    mugello_circuit: 'mugello',
    autodromo_internazionale_del_mugello: 'mugello',

    spa: 'spa',
    ks_spa: 'spa',
    spa_francorchamps: 'spa',
    circuit_de_spa_francorchamps: 'spa',

    monza: 'monza',
    ks_monza66: 'monza',
    autodromo_nazionale_monza: 'monza',

    imola: 'imola',
    ks_imola: 'imola',
    autodromo_enzo_e_dino_ferrari: 'imola',

    barcelona: 'barcelona',
    ks_barcelona: 'barcelona',
    circuit_de_barcelona_catalunya: 'barcelona',

    brands_hatch: 'brands_hatch',
    ks_brands_hatch: 'brands_hatch',

    nurburgring: 'nurburgring',
    ks_nurburgring: 'nurburgring',

    nordschleife: 'nordschleife',
    ks_nordschleife: 'nordschleife',
    nurburgring_nordschleife: 'nordschleife',

    silverstone: 'silverstone',
    ks_silverstone: 'silverstone',

    zandvoort: 'zandvoort',
    ks_zandvoort: 'zandvoort',

    red_bull_ring: 'red_bull_ring',
    ks_red_bull_ring: 'red_bull_ring',
    spielberg: 'red_bull_ring',

    vallelunga: 'vallelunga',
    ks_vallelunga: 'vallelunga',

    laguna_seca: 'laguna_seca',
    ks_laguna_seca: 'laguna_seca',
    weathertech_raceway_laguna_seca: 'laguna_seca',

    mount_panorama: 'bathurst',
    bathurst: 'bathurst',

    circuit_zolder: 'zolder',
    terlaemen: 'zolder',
    rt_zolder: 'zolder',
    nrms_zolder: 'zolder',
    zolder2017: 'zolder',
    zolder_2017: 'zolder',

    cota: 'cota',
    circuit_of_the_americas: 'cota',
    road_america: 'road_america',
    road_atlanta: 'road_atlanta',
    watkins_glen: 'watkins_glen',
    sebring: 'sebring',
    'sebring_international',
    'sebring_international_raceway',
    daytona: 'daytona',
    vir: 'vir',
    virginia_international_raceway: 'vir',
    ctmp: 'mosport',
    canadian_tire_motorsport_park: 'mosport',

    paul_ricard: 'paul_ricard',
    circuit_paul_ricard: 'paul_ricard',
    le_castellet: 'paul_ricard',

    le_mans: 'le_mans',
    lemans: 'le_mans',
    la_sarthe: 'le_mans',
    circuit_de_la_sarthe: 'le_mans',

    hockenheimring: 'hockenheim',
    hockenheim: 'hockenheim',
    hungaroring: 'hungaroring',
    brno: 'brno',
    most: 'most',
    misano: 'misano',
    jerez: 'jerez',
    jarama: 'jarama',
    portimao: 'portimao',
    algarve: 'portimao'
  };

  const cache = new Map();
  let styleInjected = false;

  function injectStyles() {
    if (styleInjected || document.getElementById('gc-track-images-style')) return;
    styleInjected = true;

    const style = document.createElement('style');
    style.id = 'gc-track-images-style';
    style.textContent = `
      .gc-track-image-card{
        position:relative;
        overflow:hidden;
        isolation:isolate;
      }

      .gc-track-image-card.has-track-image::before{
        content:"";
        position:absolute;
        inset:0;
        z-index:-2;
        background-image:var(--gc-track-image);
        background-size:cover;
        background-position:center;
        opacity:.24;
        filter:saturate(1.05) contrast(1.04);
        transform:scale(1.035);
      }

      .gc-track-image-card.has-track-image::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:-1;
        background:
          linear-gradient(135deg,rgba(0,0,0,.66),rgba(0,0,0,.28)),
          radial-gradient(circle at 10% 0%,rgba(133,255,85,.15),transparent 24rem);
        pointer-events:none;
      }

      .gc-track-image-card > *{
        position:relative;
        z-index:1;
      }

      .gc-track-image-card[data-track-image-debug="1"]{
        outline:1px dashed rgba(133,255,85,.45);
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeInput(value) {
    return String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .join(' ');
  }

  function slugify(value) {
    return normalizeInput(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function stripYear(value) {
    return String(value || '').replace(/(?:_|-)?(?:19|20)\d{2}(?:_|-)?/g, '_').replace(/^_+|_+$/g, '');
  }

  function stripNoiseEdges(parts) {
    let list = [...parts];

    while (list.length && NOISE_TOKENS.has(list[0])) list.shift();
    while (list.length && NOISE_TOKENS.has(list[list.length - 1])) list.pop();

    return list;
  }

  function add(set, value) {
    const slug = slugify(value);
    if (!slug) return;

    set.add(slug);

    const noYear = stripYear(slugify(slug));
    if (noYear && noYear !== slug) set.add(noYear);

    if (ALIASES[slug]) set.add(ALIASES[slug]);
    if (ALIASES[noYear]) set.add(ALIASES[noYear]);
  }

  function addTokenCandidates(set, slug) {
    const parts = slug.split('_').filter(Boolean);
    const cleanParts = stripNoiseEdges(parts);

    parts.forEach((part) => {
      if (!NOISE_TOKENS.has(part)) {
        add(set, part);
        add(set, stripYear(part));
      }
    });

    if (cleanParts.length) {
      add(set, cleanParts.join('_'));
    }

    for (let size = Math.min(4, parts.length); size >= 2; size -= 1) {
      for (let start = 0; start <= parts.length - size; start += 1) {
        const chunk = parts.slice(start, start + size);
        if (chunk.every((part) => NOISE_TOKENS.has(part))) continue;
        add(set, chunk.filter((part) => !NOISE_TOKENS.has(part)).join('_'));
        add(set, chunk.join('_'));
      }
    }
  }

  function addCoreMatches(set, slug) {
    const padded = `_${slug}_`;

    TRACK_CORES.forEach((core) => {
      const c = slugify(core);
      if (!c) return;

      if (
        slug === c ||
        padded.includes(`_${c}_`) ||
        slug.startsWith(`${c}_`) ||
        slug.endsWith(`_${c}`) ||
        slug.includes(c)
      ) {
        add(set, c);
      }

      const compactSlug = slug.replace(/_/g, '');
      const compactCore = c.replace(/_/g, '');
      if (compactCore.length >= 5 && compactSlug.includes(compactCore)) {
        add(set, c);
      }
    });
  }

  function variants(trackName) {
    const raw = normalizeInput(trackName);
    const slug = slugify(raw);
    const set = new Set();

    add(set, slug);
    add(set, raw);

    raw.split(/[\/|,;]+/).forEach((part) => add(set, part));

    addTokenCandidates(set, slug);
    addCoreMatches(set, slug);

    [...set].forEach((item) => {
      add(set, item.replace(/^ks_/, ''));
      add(set, item.replace(/^rt_/, ''));
      add(set, item.replace(/^nrms_/, ''));
      add(set, item.replace(/^acu_/, ''));
      add(set, item.replace(/^actk_/, ''));
      add(set, item.replace(/_online$/, ''));
      add(set, item.replace(/_offline$/, ''));
      add(set, item.replace(/_gp$/, ''));
      add(set, item.replace(/_full$/, ''));
      add(set, item.replace(/_layout$/, ''));
      add(set, stripYear(item));
      addCoreMatches(set, item);
    });

    return [...set].filter(Boolean);
  }

  function canonical(trackName) {
    const list = variants(trackName);
    const canonicalized = list.map((item) => ALIASES[item] || item).filter(Boolean);

    const coresByLength = [...TRACK_CORES].map(slugify).sort((a, b) => b.length - a.length);
    for (const core of coresByLength) {
      if (canonicalized.includes(core)) return ALIASES[core] || core;
    }

    const useful = canonicalized.find((item) => {
      if (!item) return false;
      if (NOISE_TOKENS.has(item)) return false;
      if (/^\d+$/.test(item)) return false;
      return item.length >= 3;
    });

    return ALIASES[useful] || useful || slugify(trackName);
  }

  function candidates(trackName) {
    const urls = [];

    variants(trackName).forEach((slug) => {
      BASE_DIRS.forEach((base) => {
        EXTENSIONS.forEach((ext) => urls.push(`${base}/${slug}.${ext}`));
      });
    });

    BASE_DIRS.forEach((base) => {
      EXTENSIONS.forEach((ext) => urls.push(`${base}/default.${ext}`));
    });

    return [...new Set(urls)];
  }

  function testImage(url) {
    if (cache.has(url)) return cache.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });

    cache.set(url, promise);
    return promise;
  }

  async function find(trackName) {
    const key = `track:${slugify(trackName)}`;
    if (cache.has(key)) return cache.get(key);

    const promise = (async () => {
      for (const url of candidates(trackName)) {
        const ok = await testImage(url);
        if (ok) return ok;
      }
      return '';
    })();

    cache.set(key, promise);
    return promise;
  }

  async function resolve(trackName, options = {}) {
    injectStyles();

    const url = await find(trackName);
    const img = options.img || null;
    const figure = options.figure || null;
    const caption = options.caption || null;
    const root = options.root || null;

    if (img && figure) {
      if (url) {
        img.src = url;
        img.alt = `Imagen del circuito ${trackName || ''}`.trim();
        figure.hidden = false;
        if (caption) caption.textContent = url;
      } else {
        figure.hidden = true;
      }
    }

    if (root) {
      if (url) {
        root.style.setProperty('--gc-track-image', `url("${url}")`);
        root.classList.add('has-track-image');
        root.dataset.trackImageSrc = url;
      } else {
        root.classList.remove('has-track-image');
        root.style.removeProperty('--gc-track-image');
        delete root.dataset.trackImageSrc;
      }
    }

    return url;
  }

  async function debug(trackName) {
    const data = {
      input: trackName,
      slug: slugify(trackName),
      canonical: typeof canonical === 'function' ? canonical(trackName) : '',
      variants: variants(trackName),
      candidates: candidates(trackName)
    };
    console.table(data.candidates.map((url) => ({ url })));
    console.info('[GCTrackImages debug]', data);
    return data;
  }

  async function applyAll(scope = document) {
    injectStyles();

    const nodes = Array.from(scope.querySelectorAll('[data-track-image]'));
    await Promise.all(nodes.map((node) => {
      const trackName = node.getAttribute('data-track-name') || node.dataset.trackName || node.textContent || '';
      return resolve(trackName, { root: node });
    }));
  }

  window.GCTrackImages = {
    slugify,
    variants,
    canonical,
    candidates,
    find,
    resolve,
    applyAll,
    debug
  };
})();
