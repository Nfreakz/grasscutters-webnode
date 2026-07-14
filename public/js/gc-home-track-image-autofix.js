/*
 * GC_HOME_IMAGES_AUTOMATIC_V2
 *
 * Sincroniza automáticamente las fotografías de circuito en:
 * - Hero principal del combo activo.
 * - Próximo evento del campeonato GT4.
 * - Próximo evento de la Liga GrassCutters.
 *
 * La V2 expone window.GCHomeTrackResolver.setTrackImage(), que ya es llamado
 * por index.astro, y además vigila los bloques de campeonato para eliminar
 * la dependencia del orden de carga de scripts o de una revisión manual.
 */
(() => {
  'use strict';

  if (window.__GC_HOME_IMAGES_AUTOMATIC_V2__) return;
  window.__GC_HOME_IMAGES_AUTOMATIC_V2__ = true;

  const HERO_SELECTOR = '.gc-home2-hero__bg[data-home2-track-image]';
  const HERO_TRACK_TITLE_SELECTOR = '[data-home2-track]';
  const CHAMP_BLOCK_SELECTOR = '[data-home2-championship]';
  const CHAMP_IMAGE_SELECTOR = '[data-home2-champ-track-image]';
  const FALLBACK_RE = /gc-home2-track-fallback\.svg(?:[?#]|$)/i;
  const REQUEST_TIMEOUT_MS = 12_000;
  const IMAGE_TIMEOUT_MS = 10_000;
  const REFRESH_MS = 20_000;

  const heroState = {
    running: false,
    pendingForce: false,
    sequence: 0,
    comboKey: '',
    trackSignature: '',
    lastGoodUrl: '',
    lastGoodRawUrl: '',
    lastErrorSignature: '',
    timer: 0,
    mutationTimer: 0,
  };

  const targetStates = new WeakMap();

  const stringValue = (value) => String(value ?? '').trim();

  const readPath = (source, path) => String(path)
    .split('.')
    .reduce((current, part) => current == null ? undefined : current[part], source);

  const firstValue = (source, paths, fallback = '') => {
    for (const path of paths) {
      const value = readPath(source, path);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  };

  const normalize = (value) => stringValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const unique = (values) => [...new Set(
    (Array.isArray(values) ? values.flat(Infinity) : [values])
      .map(stringValue)
      .filter(Boolean),
  )];

  const heroImage = () => document.querySelector(HERO_SELECTOR);

  const getTargetState = (img) => {
    let state = targetStates.get(img);
    if (!state) {
      state = {
        sequence: 0,
        lastGoodUrl: '',
        lastGoodRawUrl: '',
        signature: '',
        timer: 0,
      };
      targetStates.set(img, state);
    }
    return state;
  };

  const withTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const buildAliases = (values) => {
    const aliases = new Set();
    const prefixRe = /^(?:akr|ks|rt|acu|actk|fn|mx|nrms|track|circuit|circuito|autodromo|autodrome)_+/;
    const suffixRe = /_(?:layout|layouts|online|server|version|reboot|final|update|extension|ext|season|elms|gp|full|national|international|internazionale|club|short|long)$/;

    for (const rawValue of unique(values)) {
      const base = normalize(rawValue);
      if (!base) continue;

      const variants = [
        base,
        base.replace(prefixRe, ''),
        base.replace(suffixRe, ''),
      ];

      for (const variant of variants) {
        const clean = normalize(variant);
        if (!clean) continue;

        aliases.add(clean);
        aliases.add(clean.replace(/_/g, '-'));
        aliases.add(clean.replace(/_/g, ''));

        const versionless = clean
          .replace(/_(?:p?\d+v\d+|v\d+|rev\d+|ver\d+)$/g, '')
          .replace(/_(?:19|20)\d{2}$/g, '')
          .replace(/^_+|_+$/g, '');
        if (versionless) aliases.add(versionless);

        for (const part of clean.split('_')) {
          if (part.length < 4) continue;
          aliases.add(part);
          const alphaNumeric = part.match(/^([a-z]{4,})\d+$/);
          if (alphaNumeric) aliases.add(alphaNumeric[1]);
        }
      }
    }

    return [...aliases].filter((alias) => alias.length >= 3);
  };

  const localPhotoCandidates = (values) => {
    const extensions = ['webp', 'jpg', 'jpeg', 'png', 'avif'];
    const candidates = [];
    for (const alias of buildAliases(values)) {
      for (const extension of extensions) {
        candidates.push(`/images/tracks/${encodeURIComponent(alias)}.${extension}`);
        candidates.push(`/imagenes/tracks/${encodeURIComponent(alias)}.${extension}`);
      }
    }
    return unique(candidates);
  };

  const cacheBustedUrl = (rawUrl, signature, attempt) => {
    const value = stringValue(rawUrl);
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value;

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        url.searchParams.set('gc_track_image', normalize(signature) || 'track');
        url.searchParams.set('gc_attempt', String(attempt));
      }
      return url.toString();
    } catch (_) {
      return value;
    }
  };

  const preloadImage = (url) => new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    const probe = new Image();
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      probe.onload = null;
      probe.onerror = null;
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
    probe.onload = () => finish(probe.naturalWidth > 1 && probe.naturalHeight > 1);
    probe.onerror = () => finish(false);
    probe.decoding = 'async';
    probe.src = url;
  });

  const resolveTrackAsset = async (values, role = 'photo', force = true) => {
    const cleanValues = unique(values);
    if (!cleanValues.length) return null;

    const params = new URLSearchParams();
    const parameterNames = ['track', 'trackRaw', 'name', 'event', 'hint'];
    cleanValues.slice(0, parameterNames.length).forEach((value, index) => {
      params.set(parameterNames[index], value);
    });
    if (force) params.set('refresh', '1');
    params.set('t', String(Date.now()));

    const response = await withTimeout(`/api/gc/track-assets/resolve?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Resolver HTTP ${response.status}`);
    }

    return {
      ...payload,
      selected: role === 'map' ? payload.map : payload.photo,
    };
  };

  const valuesFromChampionshipBlock = (block, extraValues = []) => unique([
    ...unique(extraValues),
    block?.querySelector?.('[data-home2-champ-next]')?.textContent || '',
    block?.querySelector?.('[data-home2-champ-next-meta]')?.textContent || '',
    block?.querySelector?.('[data-home2-champ-name]')?.textContent || '',
    block?.getAttribute?.('data-home2-championship-source') || '',
  ]);

  const restoreTargetLastGood = (img) => {
    if (!img) return false;
    const state = getTargetState(img);
    if (!state.lastGoodUrl) return false;

    const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
    if (current === state.lastGoodUrl) return true;

    img.onerror = null;
    img.dataset.gcTrackImageRuntime = 'v2-restored';
    img.src = state.lastGoodUrl;
    return true;
  };

  const applyTargetImage = (img, url, rawUrl, signature, runtimeLabel = 'v2-resolver') => {
    const state = getTargetState(img);
    img.onerror = null;
    img.dataset.gcHomeStaticManaged = '1';
    img.dataset.gcTrackImageRuntime = runtimeLabel;
    img.dataset.gcTrackImageSignature = signature;
    img.src = url;

    state.lastGoodUrl = url;
    state.lastGoodRawUrl = rawUrl;
    state.signature = signature;
  };

  const setTrackImage = async (img, value, role = 'photo') => {
    if (!(img instanceof HTMLImageElement)) return false;

    const block = img.closest(CHAMP_BLOCK_SELECTOR);
    const values = block
      ? valuesFromChampionshipBlock(block, value)
      : unique(value);
    if (!values.length) return false;

    const state = getTargetState(img);
    const sequence = ++state.sequence;
    const signature = values.map(normalize).filter(Boolean).join('|');
    const attempt = Date.now();

    let resolved = null;
    try {
      resolved = await resolveTrackAsset(values, role, true);
    } catch (error) {
      console.warn('[GC Track Image V2] Resolver no disponible; probando rutas locales.', error);
    }

    const selected = role === 'map' ? resolved?.map : resolved?.photo;
    const candidates = unique([
      selected,
      resolved?.selected,
      ...(Array.isArray(resolved?.candidates) ? resolved.candidates : []),
      ...(role === 'photo' ? localPhotoCandidates(values) : []),
    ]).filter((url) => !FALLBACK_RE.test(url));

    for (const rawUrl of candidates) {
      if (sequence !== state.sequence) return false;
      const url = cacheBustedUrl(rawUrl, signature, attempt);
      if (await preloadImage(url)) {
        if (sequence !== state.sequence) return false;
        applyTargetImage(img, url, rawUrl, signature);
        return true;
      }
    }

    img.dataset.gcTrackImageRuntime = 'v2-missing';
    img.dataset.gcTrackImageSignature = signature;
    restoreTargetLastGood(img);
    return false;
  };

  const refreshChampionshipBlock = async (block) => {
    if (!(block instanceof Element)) return false;
    const img = block.querySelector(CHAMP_IMAGE_SELECTOR);
    if (!(img instanceof HTMLImageElement)) return false;
    return setTrackImage(img, valuesFromChampionshipBlock(block), 'photo');
  };

  const refreshChampionships = async () => {
    const blocks = [...document.querySelectorAll(CHAMP_BLOCK_SELECTOR)];
    return Promise.all(blocks.map((block) => refreshChampionshipBlock(block)));
  };

  // El código existente de index.astro ya intenta usar este objeto. La V1 solo
  // corregía el hero y nunca lo definía; por eso GT4 quedaba en image pending.
  window.GCHomeTrackResolver = {
    ...(window.GCHomeTrackResolver || {}),
    resolveTrackAsset,
    setTrackImage,
    refreshChampionships,
  };

  const activeCombo = (payload) => (
    payload?.main?.activeCombo
    || payload?.gt4?.activeCombo
    || payload?.activeCombo
    || null
  );

  const getComboKey = (combo) => stringValue(firstValue(combo, [
    'comboKey',
    'key',
    'id',
    'comboId',
    'canonicalKey',
    'track.familyKey',
    'track.rawCode',
    'track.code',
    'track.rawName',
    'track.name',
  ], 'unknown-combo'));

  const getHeroTrackValues = (combo) => unique([
    firstValue(combo, ['track.rawCode', 'trackRawCode', 'rawTrackCode', 'trackCode'], ''),
    firstValue(combo, ['track.rawName', 'trackRaw', 'rawTrackName', 'trackName'], ''),
    firstValue(combo, ['track.code', 'track.id', 'track.key'], ''),
    firstValue(combo, ['track.name', 'track.displayName', 'track.publicName', 'track.visibleName'], ''),
    firstValue(combo, ['track.familyKey', 'track.canonicalKey', 'canonicalTrack'], ''),
    firstValue(combo, ['name', 'title', 'eventName'], ''),
    document.querySelector(HERO_TRACK_TITLE_SELECTOR)?.textContent || '',
  ]);

  const payloadPhotoCandidates = (combo, values) => {
    const image = combo?.trackImage || combo?.track?.image || {};
    return unique([
      typeof image === 'string' ? image : '',
      image?.primary,
      image?.photo,
      image?.url,
      ...(Array.isArray(image?.candidates) ? image.candidates : []),
      ...localPhotoCandidates(values),
    ]);
  };

  const restoreHeroLastGood = () => {
    const img = heroImage();
    if (!img || !heroState.lastGoodUrl) return;

    const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
    if (current === heroState.lastGoodUrl) return;

    img.onerror = null;
    img.dataset.gcComboImageAutomatic = 'v2-restored';
    img.src = heroState.lastGoodUrl;
  };

  const applyHeroImage = (img, url, rawUrl, comboKey, signature) => {
    img.onerror = null;
    img.dataset.gcHomeStaticManaged = '1';
    img.dataset.gcComboImageAutomatic = 'v2-ok';
    img.dataset.gcComboImageKey = comboKey;
    img.dataset.gcComboImageTrack = signature;
    img.src = url;

    heroState.lastGoodUrl = url;
    heroState.lastGoodRawUrl = rawUrl;
    heroState.comboKey = comboKey;
    heroState.trackSignature = signature;
    heroState.lastErrorSignature = '';
  };

  const fetchBootstrap = async () => {
    const params = new URLSearchParams({
      mainLimit: '1',
      gt4Limit: '1',
      timingLimit: '1',
      home: '1',
      t: String(Date.now()),
    });

    const response = await withTimeout(`/api/gc/home-bootstrap?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Bootstrap HTTP ${response.status}`);
    }
    return payload;
  };

  const runHeroRefresh = async (force = false) => {
    const img = heroImage();
    if (!img) return false;

    if (heroState.running) {
      heroState.pendingForce = heroState.pendingForce || force;
      return false;
    }

    heroState.running = true;
    const sequence = ++heroState.sequence;
    const attempt = Date.now();

    try {
      const bootstrap = await fetchBootstrap();
      if (sequence !== heroState.sequence) return false;

      const combo = activeCombo(bootstrap);
      if (!combo) throw new Error('El bootstrap no devuelve un combo activo.');

      const comboKey = getComboKey(combo);
      const values = getHeroTrackValues(combo);
      const signature = values.map(normalize).filter(Boolean).join('|');

      if (!force && comboKey === heroState.comboKey && signature === heroState.trackSignature && heroState.lastGoodUrl) {
        restoreHeroLastGood();
        return true;
      }

      let resolved = null;
      try {
        resolved = await resolveTrackAsset(values, 'photo', true);
      } catch (error) {
        console.warn('[GC Hero Image V2] Resolver no disponible; probando candidatos locales.', error);
      }

      const candidates = unique([
        resolved?.photo,
        resolved?.selected,
        ...payloadPhotoCandidates(combo, values),
      ]).filter((url) => !FALLBACK_RE.test(url));

      for (const rawUrl of candidates) {
        if (sequence !== heroState.sequence) return false;
        const url = cacheBustedUrl(rawUrl, `${comboKey}:${signature}`, attempt);
        if (await preloadImage(url)) {
          if (sequence !== heroState.sequence) return false;
          applyHeroImage(img, url, rawUrl, comboKey, signature);
          return true;
        }
      }

      img.dataset.gcComboImageAutomatic = 'v2-missing';
      const errorSignature = `${comboKey}:${signature}`;
      if (heroState.lastErrorSignature !== errorSignature) {
        heroState.lastErrorSignature = errorSignature;
        console.error('[GC Hero Image V2] No se encontró una imagen válida.', {
          comboKey,
          values,
          resolved,
          candidates,
        });
      }
      restoreHeroLastGood();
      return false;
    } catch (error) {
      console.warn('[GC Hero Image V2] No se pudo actualizar automáticamente.', error);
      restoreHeroLastGood();
      return false;
    } finally {
      heroState.running = false;
      if (heroState.pendingForce) {
        heroState.pendingForce = false;
        window.setTimeout(() => runHeroRefresh(true), 0);
      }
    }
  };

  const observeHero = () => {
    const root = document.querySelector('.gc-home2-hero');
    if (!root) return;

    const observer = new MutationObserver((mutations) => {
      const img = heroImage();
      if (!img) return;

      const srcChanged = mutations.some((mutation) => (
        mutation.type === 'attributes'
        && mutation.target === img
        && mutation.attributeName === 'src'
      ));

      const trackTextChanged = mutations.some((mutation) => {
        if (mutation.type !== 'childList' && mutation.type !== 'characterData') return false;
        const target = mutation.target.nodeType === Node.TEXT_NODE
          ? mutation.target.parentElement
          : mutation.target;
        return Boolean(target?.closest?.(HERO_TRACK_TITLE_SELECTOR));
      });

      const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
      if (srcChanged && heroState.lastGoodUrl && (FALLBACK_RE.test(current) || current !== heroState.lastGoodUrl)) {
        window.clearTimeout(heroState.mutationTimer);
        heroState.mutationTimer = window.setTimeout(restoreHeroLastGood, 0);
      }

      if (trackTextChanged) {
        window.clearTimeout(heroState.mutationTimer);
        heroState.mutationTimer = window.setTimeout(() => runHeroRefresh(true), 250);
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  };

  const observeChampionships = () => {
    const root = document.querySelector('.gc-home2-championship-stack') || document.body;
    if (!root) return;

    const scheduleBlock = (block, delay = 180) => {
      if (!(block instanceof Element)) return;
      const img = block.querySelector(CHAMP_IMAGE_SELECTOR);
      if (!(img instanceof HTMLImageElement)) return;
      const state = getTargetState(img);
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => refreshChampionshipBlock(block), delay);
    };

    const observer = new MutationObserver((mutations) => {
      const blocks = new Set();

      for (const mutation of mutations) {
        const target = mutation.target.nodeType === Node.TEXT_NODE
          ? mutation.target.parentElement
          : mutation.target;
        const block = target?.closest?.(CHAMP_BLOCK_SELECTOR);
        if (!block) continue;

        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          const img = mutation.target;
          if (img instanceof HTMLImageElement && img.matches(CHAMP_IMAGE_SELECTOR)) {
            const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
            const state = getTargetState(img);
            if (state.lastGoodUrl && (FALLBACK_RE.test(current) || current !== state.lastGoodUrl)) {
              window.clearTimeout(state.timer);
              state.timer = window.setTimeout(() => restoreTargetLastGood(img), 0);
            } else if (!state.lastGoodUrl && FALLBACK_RE.test(current)) {
              blocks.add(block);
            }
          }
          continue;
        }

        const relevant = target?.closest?.('[data-home2-champ-next], [data-home2-champ-next-meta], [data-home2-champ-name]');
        if (relevant || mutation.type === 'childList' || mutation.type === 'characterData') {
          blocks.add(block);
        }
      }

      blocks.forEach((block) => scheduleBlock(block));
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  };

  const start = () => {
    observeHero();
    observeChampionships();

    runHeroRefresh(true);
    refreshChampionships();

    heroState.timer = window.setInterval(() => {
      runHeroRefresh(false);
      refreshChampionships();
    }, REFRESH_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        runHeroRefresh(true);
        refreshChampionships();
      }
    });

    window.addEventListener('gc:combo-changed', () => {
      runHeroRefresh(true);
      refreshChampionships();
    });
  };

  window.GCHomeImagesAutomatic = {
    refreshHero: () => runHeroRefresh(true),
    refreshChampionships,
    setTrackImage,
    getHeroState: () => ({ ...heroState }),
  };

  // Compatibilidad con el nombre público del pack anterior.
  window.GCHomeComboImageAutomatic = {
    refresh: () => runHeroRefresh(true),
    refreshChampionships,
    getState: () => ({ ...heroState }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
