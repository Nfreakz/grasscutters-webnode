/*
 * GC_HOME_COMBO_IMAGE_AUTOMATIC_V1
 *
 * Corrige la imagen de fondo del hero al cambiar el combo activo.
 * - Lee siempre el combo actual desde /api/gc/home-bootstrap.
 * - Usa el resolver real de assets /api/gc/track-assets/resolve.
 * - Prueba identificadores raw, públicos, canónicos y alias del circuito.
 * - Precarga la imagen antes de mostrarla.
 * - Conserva la última imagen válida si el código anterior intenta volver al fallback.
 */
(() => {
  'use strict';

  if (window.__GC_HOME_COMBO_IMAGE_AUTOMATIC_V1__) return;
  window.__GC_HOME_COMBO_IMAGE_AUTOMATIC_V1__ = true;

  const HERO_SELECTOR = '.gc-home2-hero__bg[data-home2-track-image]';
  const TRACK_TITLE_SELECTOR = '[data-home2-track]';
  const FALLBACK_RE = /gc-home2-track-fallback\.svg(?:[?#]|$)/i;
  const REFRESH_MS = 20_000;
  const REQUEST_TIMEOUT_MS = 12_000;
  const IMAGE_TIMEOUT_MS = 10_000;

  const state = {
    running: false,
    pendingForce: false,
    sequence: 0,
    comboKey: '',
    trackSignature: '',
    lastGoodUrl: '',
    lastGoodRawUrl: '',
    lastErrorSignature: '',
    refreshTimer: 0,
    mutationTimer: 0,
  };

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

  const unique = (values) => [...new Set(values.map(stringValue).filter(Boolean))];
  const heroImage = () => document.querySelector(HERO_SELECTOR);

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

  const getTrackValues = (combo) => unique([
    firstValue(combo, ['track.rawCode', 'trackRawCode', 'rawTrackCode', 'trackCode'], ''),
    firstValue(combo, ['track.rawName', 'trackRaw', 'rawTrackName', 'trackName'], ''),
    firstValue(combo, ['track.code', 'track.id', 'track.key'], ''),
    firstValue(combo, ['track.name', 'track.displayName', 'track.publicName', 'track.visibleName'], ''),
    firstValue(combo, ['track.familyKey', 'track.canonicalKey', 'canonicalTrack'], ''),
    firstValue(combo, ['name', 'title', 'eventName'], ''),
    document.querySelector(TRACK_TITLE_SELECTOR)?.textContent || '',
  ]);

  const buildAliases = (values) => {
    const aliases = new Set();
    const prefixRe = /^(?:akr|ks|rt|acu|actk|fn|mx|nrms|track|circuit|circuito|autodromo|autodrome)_+/;
    const suffixRe = /_(?:layout|layouts|online|server|version|reboot|final|update|extension|ext|season|elms|gp|full|national|international|internazionale|club|short|long)$/;

    for (const rawValue of values) {
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

  const payloadCandidates = (combo, values) => {
    const image = combo?.trackImage || combo?.track?.image || {};
    const candidates = [];

    if (typeof image === 'string') candidates.push(image);
    if (image.primary) candidates.push(image.primary);
    if (image.photo) candidates.push(image.photo);
    if (image.url) candidates.push(image.url);
    if (Array.isArray(image.candidates)) candidates.push(...image.candidates);

    const extensions = ['webp', 'jpg', 'jpeg', 'png', 'avif'];
    for (const alias of buildAliases(values)) {
      for (const extension of extensions) {
        candidates.push(`/images/tracks/${encodeURIComponent(alias)}.${extension}`);
        candidates.push(`/imagenes/tracks/${encodeURIComponent(alias)}.${extension}`);
      }
    }

    return unique(candidates);
  };

  const cacheBustedUrl = (rawUrl, comboKey, attempt) => {
    const value = stringValue(rawUrl);
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value;

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        url.searchParams.set('gc_combo_image', normalize(comboKey) || 'combo');
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

  const applyGoodImage = (img, url, rawUrl, comboKey, signature) => {
    if (!img || !url) return;

    img.onerror = null;
    img.dataset.gcHomeStaticManaged = '1';
    img.dataset.gcComboImageAutomatic = 'ok';
    img.dataset.gcComboImageKey = comboKey;
    img.dataset.gcComboImageTrack = signature;
    img.src = url;

    state.lastGoodUrl = url;
    state.lastGoodRawUrl = rawUrl;
    state.comboKey = comboKey;
    state.trackSignature = signature;
    state.lastErrorSignature = '';
  };

  const restoreLastGood = () => {
    const img = heroImage();
    if (!img || !state.lastGoodUrl) return;

    const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
    if (current === state.lastGoodUrl) return;

    img.onerror = null;
    img.dataset.gcComboImageAutomatic = 'restored';
    img.src = state.lastGoodUrl;
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

  const resolveFromServer = async (values) => {
    const params = new URLSearchParams();
    const parameterNames = ['track', 'trackRaw', 'name', 'event', 'hint'];

    values.slice(0, parameterNames.length).forEach((value, index) => {
      params.set(parameterNames[index], value);
    });
    params.set('refresh', '1');
    params.set('t', String(Date.now()));

    const response = await withTimeout(`/api/gc/track-assets/resolve?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Resolver HTTP ${response.status}`);
    }
    return payload;
  };

  const runRefresh = async (force = false) => {
    const img = heroImage();
    if (!img) return false;

    if (state.running) {
      state.pendingForce = state.pendingForce || force;
      return false;
    }

    state.running = true;
    const sequence = ++state.sequence;
    const attempt = Date.now();

    try {
      const bootstrap = await fetchBootstrap();
      if (sequence !== state.sequence) return false;

      const combo = activeCombo(bootstrap);
      if (!combo) throw new Error('El bootstrap no devuelve un combo activo.');

      const comboKey = getComboKey(combo);
      const values = getTrackValues(combo);
      const signature = values.map(normalize).filter(Boolean).join('|');

      if (!force && comboKey === state.comboKey && signature === state.trackSignature && state.lastGoodUrl) {
        restoreLastGood();
        return true;
      }

      let resolved = null;
      try {
        resolved = await resolveFromServer(values);
      } catch (error) {
        console.warn('[GC Combo Image] Resolver no disponible; probando candidatos locales.', error);
      }

      const candidates = unique([
        resolved?.photo,
        resolved?.image,
        ...(Array.isArray(resolved?.candidates) ? resolved.candidates : []),
        ...payloadCandidates(combo, values),
      ]).filter((url) => !FALLBACK_RE.test(url));

      for (const rawUrl of candidates) {
        if (sequence !== state.sequence) return false;

        const url = cacheBustedUrl(rawUrl, comboKey, attempt);
        if (await preloadImage(url)) {
          if (sequence !== state.sequence) return false;
          applyGoodImage(img, url, rawUrl, comboKey, signature);
          return true;
        }
      }

      img.dataset.gcComboImageAutomatic = 'missing';
      img.dataset.gcComboImageKey = comboKey;
      img.dataset.gcComboImageTrack = signature;

      const errorSignature = `${comboKey}:${signature}`;
      if (state.lastErrorSignature !== errorSignature) {
        state.lastErrorSignature = errorSignature;
        console.error('[GC Combo Image] No se encontró una imagen válida para el combo activo.', {
          comboKey,
          trackValues: values,
          resolver: resolved,
          candidates,
        });
      }

      restoreLastGood();
      return false;
    } catch (error) {
      console.warn('[GC Combo Image] No se pudo actualizar automáticamente.', error);
      restoreLastGood();
      return false;
    } finally {
      state.running = false;

      if (state.pendingForce) {
        state.pendingForce = false;
        window.setTimeout(() => runRefresh(true), 0);
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
        return Boolean(target?.closest?.(TRACK_TITLE_SELECTOR));
      });

      const current = stringValue(img.currentSrc || img.src || img.getAttribute('src'));
      if (srcChanged && state.lastGoodUrl && (FALLBACK_RE.test(current) || current !== state.lastGoodUrl)) {
        window.clearTimeout(state.mutationTimer);
        state.mutationTimer = window.setTimeout(restoreLastGood, 0);
      }

      if (trackTextChanged) {
        window.clearTimeout(state.mutationTimer);
        state.mutationTimer = window.setTimeout(() => runRefresh(true), 250);
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

  const start = () => {
    if (!heroImage()) return;

    observeHero();
    runRefresh(true);
    state.refreshTimer = window.setInterval(() => runRefresh(false), REFRESH_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) runRefresh(true);
    });

    window.addEventListener('gc:combo-changed', () => runRefresh(true));
  };

  window.GCHomeComboImageAutomatic = {
    refresh: () => runRefresh(true),
    getState: () => ({ ...state }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
