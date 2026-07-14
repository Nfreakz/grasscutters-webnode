/*
 * GC_HOME_TRACK_IMAGE_AUTOFIX_V1
 *
 * Mantiene la imagen del hero sincronizada con el combo activo sin depender
 * de que el nombre del archivo coincida exactamente con el código de pista.
 * Usa el resolver del servidor, precarga la imagen antes de mostrarla y
 * protege la última imagen válida frente a fallbacks o respuestas antiguas.
 */
(() => {
  'use strict';

  if (window.__GC_HOME_TRACK_IMAGE_AUTOFIX_V1__) return;
  window.__GC_HOME_TRACK_IMAGE_AUTOFIX_V1__ = true;

  const HERO_SELECTOR = '.gc-home2-hero__bg[data-home2-track-image]';
  const TRACK_TITLE_SELECTOR = '[data-home2-track]';
  const FALLBACK_RE = /gc-home2-track-fallback\.svg(?:[?#]|$)/i;
  const REFRESH_MS = 20_000;
  const IMAGE_TIMEOUT_MS = 10_000;

  const state = {
    running: false,
    sequence: 0,
    comboKey: '',
    trackSignature: '',
    lastGoodUrl: '',
    lastGoodRawUrl: '',
    lastErrorSignature: '',
    timer: 0,
    restoreTimer: 0
  };

  const text = (value) => String(value ?? '').trim();

  const first = (source, paths, fallback = '') => {
    for (const path of paths) {
      const value = String(path).split('.').reduce((current, part) => current == null ? undefined : current[part], source);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  };

  const normalize = (value) => text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

  const currentHero = () => document.querySelector(HERO_SELECTOR);

  const activeCombo = (payload) => payload?.main?.activeCombo || payload?.gt4?.activeCombo || payload?.activeCombo || null;

  const comboKey = (combo) => text(first(combo, [
    'comboKey', 'key', 'id', 'comboId', 'canonicalKey',
    'track.familyKey', 'track.rawCode', 'track.code', 'track.rawName', 'track.name'
  ], 'unknown-combo'));

  const trackValues = (combo) => unique([
    first(combo, ['track.rawCode', 'trackRawCode', 'rawTrackCode', 'trackCode'], ''),
    first(combo, ['track.rawName', 'trackRaw', 'rawTrackName', 'trackName'], ''),
    first(combo, ['track.code', 'track.id', 'track.key'], ''),
    first(combo, ['track.name', 'track.displayName', 'track.publicName', 'track.visibleName'], ''),
    first(combo, ['track.familyKey', 'track.canonicalKey', 'canonicalTrack'], ''),
    first(combo, ['name', 'title', 'eventName'], ''),
    document.querySelector(TRACK_TITLE_SELECTOR)?.textContent || ''
  ]);

  const aliasVariants = (values) => {
    const aliases = new Set();
    const prefixes = /^(?:akr|ks|rt|acu|actk|fn|mx|nrms|track|circuit|circuito|autodromo|autodrome)_+/;
    const noise = /_(?:layout|layouts|online|server|version|reboot|final|update|extension|ext|season|elms|gp|full|national|international|internazionale|club|short|long)$/;

    for (const rawValue of values) {
      const base = normalize(rawValue);
      if (!base) continue;

      const queue = [base, base.replace(prefixes, ''), base.replace(noise, '')];
      for (const item of queue) {
        const clean = normalize(item);
        if (!clean) continue;
        aliases.add(clean);
        aliases.add(clean.replace(/_/g, '-'));
        aliases.add(clean.replace(/_/g, ''));

        const withoutVersion = clean
          .replace(/_(?:p?\d+v\d+|v\d+|rev\d+|ver\d+)$/g, '')
          .replace(/_(?:19|20)\d{2}$/g, '')
          .replace(/^_+|_+$/g, '');
        if (withoutVersion) aliases.add(withoutVersion);

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
    for (const alias of aliasVariants(values)) {
      for (const extension of extensions) {
        candidates.push(`/images/tracks/${encodeURIComponent(alias)}.${extension}`);
        candidates.push(`/imagenes/tracks/${encodeURIComponent(alias)}.${extension}`);
      }
    }

    return unique(candidates);
  };

  const cacheBusted = (rawUrl, key, attempt) => {
    const value = text(rawUrl);
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        url.searchParams.set('gc_combo_image', normalize(key) || 'combo');
        url.searchParams.set('gc_attempt', String(attempt));
      }
      return url.toString();
    } catch (_) {
      return value;
    }
  };

  const loadImage = (url) => new Promise((resolve) => {
    if (!url) return resolve(false);
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

  const setGoodImage = (img, url, rawUrl, key, signature) => {
    if (!img || !url) return;
    img.onerror = null;
    img.dataset.gcHomeStaticManaged = '1';
    img.dataset.gcComboImageAutofix = 'ok';
    img.dataset.gcComboImageKey = key;
    img.dataset.gcComboImageTrack = signature;
    img.src = url;
    state.lastGoodUrl = url;
    state.lastGoodRawUrl = rawUrl;
    state.comboKey = key;
    state.trackSignature = signature;
    state.lastErrorSignature = '';
  };

  const restoreLastGood = () => {
    const img = currentHero();
    if (!img || !state.lastGoodUrl) return;
    const current = text(img.currentSrc || img.src || img.getAttribute('src'));
    if (current === state.lastGoodUrl) return;
    img.onerror = null;
    img.dataset.gcComboImageAutofix = 'restored';
    img.src = state.lastGoodUrl;
  };

  const resolveFromServer = async (values, key, sequence) => {
    const params = new URLSearchParams();
    const fields = ['track', 'trackRaw', 'name', 'event', 'hint'];
    values.slice(0, fields.length).forEach((value, index) => params.set(fields[index], value));
    params.set('refresh', '1');
    params.set('t', String(Date.now()));

    const response = await fetch(`/api/gc/track-assets/resolve?${params.toString()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (sequence !== state.sequence) return null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Resolver HTTP ${response.status}`);
    return payload;
  };

  const fetchBootstrap = async () => {
    const params = new URLSearchParams({
      mainLimit: '1',
      gt4Limit: '1',
      timingLimit: '1',
      home: '1',
      t: String(Date.now())
    });
    const response = await fetch(`/api/gc/home-bootstrap?${params.toString()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Bootstrap HTTP ${response.status}`);
    return payload;
  };

  const refresh = async (options = {}) => {
    const img = currentHero();
    if (!img || state.running) return false;

    state.running = true;
    const sequence = ++state.sequence;
    const attempt = Date.now();

    try {
      const bootstrap = await fetchBootstrap();
      if (sequence !== state.sequence) return false;

      const combo = activeCombo(bootstrap);
      if (!combo) throw new Error('El bootstrap no devuelve un combo activo.');

      const key = comboKey(combo);
      const values = trackValues(combo);
      const signature = values.map(normalize).filter(Boolean).join('|');

      if (!options.force && key === state.comboKey && signature === state.trackSignature && state.lastGoodUrl) {
        restoreLastGood();
        return true;
      }

      let resolved = null;
      try {
        resolved = await resolveFromServer(values, key, sequence);
      } catch (error) {
        console.warn('[GC Combo Image] Resolver no disponible; se prueban candidatos locales.', error);
      }

      const candidates = unique([
        resolved?.photo,
        resolved?.image,
        ...(Array.isArray(resolved?.candidates) ? resolved.candidates : []),
        ...payloadCandidates(combo, values)
      ]).filter((url) => !FALLBACK_RE.test(url));

      for (const rawUrl of candidates) {
        if (sequence !== state.sequence) return false;
        const url = cacheBusted(rawUrl, key, attempt);
        if (await loadImage(url)) {
          if (sequence !== state.sequence) return false;
          setGoodImage(img, url, rawUrl, key, signature);
          return true;
        }
      }

      img.dataset.gcComboImageAutofix = 'missing';
      img.dataset.gcComboImageKey = key;
      img.dataset.gcComboImageTrack = signature;
      const errorSignature = `${key}:${signature}`;
      if (state.lastErrorSignature !== errorSignature) {
        state.lastErrorSignature = errorSignature;
        console.error('[GC Combo Image] No se encontró una imagen válida para el combo activo.', {
          key,
          tracks: values,
          resolver: resolved,
          candidates
        });
      }
      return false;
    } catch (error) {
      console.warn('[GC Combo Image] No se pudo actualizar automáticamente.', error);
      restoreLastGood();
      return false;
    } finally {
      state.running = false;
    }
  };

  const observeHero = () => {
    const root = document.querySelector('.gc-home2-hero');
    if (!root) return;

    const observer = new MutationObserver((mutations) => {
      const img = currentHero();
      if (!img) return;

      const srcChanged = mutations.some((mutation) => mutation.type === 'attributes' && mutation.target === img && mutation.attributeName === 'src');
      const textChanged = mutations.some((mutation) => mutation.type === 'childList' || mutation.type === 'characterData');
      const current = text(img.currentSrc || img.src || img.getAttribute('src'));

      if (srcChanged && state.lastGoodUrl && (FALLBACK_RE.test(current) || current !== state.lastGoodUrl)) {
        window.clearTimeout(state.restoreTimer);
        state.restoreTimer = window.setTimeout(restoreLastGood, 0);
      }

      if (textChanged) {
        window.clearTimeout(state.restoreTimer);
        state.restoreTimer = window.setTimeout(() => refresh({ force: true }), 250);
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src']
    });
  };

  const start = () => {
    if (!currentHero()) return;
    observeHero();
    refresh({ force: true });
    state.timer = window.setInterval(() => refresh(), REFRESH_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh({ force: true });
    });
    window.addEventListener('gc:combo-changed', () => refresh({ force: true }));
  };

  window.GCHomeTrackImageAutoFix = {
    refresh: () => refresh({ force: true }),
    state: () => ({ ...state })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
