#!/usr/bin/env node
/* GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_APPLY
 * Legacy Removal Phase 1 for /combos/:comboId.
 * Fine cut: preserves real legacy fallback if Data Core fails on initial load.
 * Once Data Core is primary, secondary legacy calls are aliased to /api/gc/*.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const comboDetailPath = path.join(root, 'src', 'pages', 'combos', '[comboId].astro');

const START = '/* GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_START */';
const END = '/* GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_END */';

if (!fs.existsSync(comboDetailPath)) {
  console.error('[GC COMBO DETAIL LEGACY CUT] Missing src/pages/combos/[comboId].astro');
  process.exit(1);
}

let source = fs.readFileSync(comboDetailPath, 'utf8');

if (!source.includes('gcComboDetailDataCore')) {
  console.error('[GC COMBO DETAIL LEGACY CUT] Combo detail Data Core primary marker not found. Apply combo detail Data Core primary first.');
  process.exit(1);
}

const cutScript = `
  <script is:inline>
    ${START}
    (() => {
      if (window.GCComboDetailLegacyNetworkCut?.version === 'v1') return;

      const state = {
        version: 'v1',
        startedAt: new Date().toISOString(),
        mode: 'combo-detail-network-cut',
        mutedCalls: [],
        coreAliases: [],
        fallbackAllowed: [],
        fallbackCalls: [],
        enabled: true
      };

      const previousFetch = window.fetch.bind(window);

      const textUrl = (input) => {
        if (typeof input === 'string') return input;
        if (input?.url) return String(input.url);
        return String(input || '');
      };

      const isComboDetail = () => /^\\/combos\\/[^/]+\\/?$/.test(location.pathname);
      const currentComboId = () => decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

      const toUrl = (url) => {
        try { return new URL(url, location.origin); }
        catch { return null; }
      };

      const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-GC-Combo-Detail-Legacy-Network-Cut': 'v1'
        }
      });

      async function coreJson(url) {
        const response = await previousFetch(url, {
          credentials: 'include',
          cache: 'no-store'
        });
        const data = await response.json().catch(() => null);
        return {
          ok: response.ok,
          status: response.status,
          data
        };
      }

      const items = (data) => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        return data.items || data.data?.items || data.data?.leaderboard || data.data?.laps || data.combos || data.leaderboard || data.laps || data.hotlaps || [];
      };

      const pick = (source, paths) => {
        if (!source || typeof source !== 'object') return undefined;
        for (const path of paths) {
          const value = String(path).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
          if (value !== undefined && value !== null && value !== '') return value;
        }
        return undefined;
      };

      const driverKey = (row) => String(pick(row, ['playerId','driverId','driver.id','id','driverName','playerName','name']) || '').trim();

      const compactDriver = (row) => {
        const id = pick(row, ['playerId','driverId','driver.id','id']) || null;
        const name = pick(row, ['driver.displayName','driver.name','driverName','playerName','name']) || 'Piloto';
        return {
          id,
          playerId: id,
          driverId: id,
          displayName: name,
          name,
          driverName: name,
          carName: pick(row, ['car.displayName','car.name','carName']) || null,
          trackName: pick(row, ['track.displayName','track.name','trackName']) || null,
          source: 'gc-data-core-synthetic-driver'
        };
      };

      const dataCoreIsPrimary = () => document.documentElement.dataset.gcComboDetailDataCore === 'primary';

      async function legacyToCore(url) {
        const parsed = toUrl(url);
        if (!parsed) return null;

        const path = parsed.pathname;
        const search = parsed.searchParams;
        const limit = Math.max(1, Math.min(Number(search.get('limit') || 300) || 300, 1000));
        const scope = search.get('scope') || 'global';

        if (/^\\/api\\/combos\\/[^/]+$/.test(path)) {
          const comboId = decodeURIComponent(path.split('/').pop() || currentComboId());
          const coreUrl = '/api/gc/combos/' + encodeURIComponent(comboId);
          const result = await coreJson(coreUrl);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ...(result.data || {}),
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/combos/stats') {
          const coreUrl = '/api/gc/combos?limit=1000&sort=recent';
          const result = await coreJson(coreUrl);
          const rows = items(result.data);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ...(result.data || {}),
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: rows.length,
            combos: rows,
            items: rows
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/hotlaps') {
          const coreUrl = '/api/gc/leaderboard?scope=activeCombo&limit=' + encodeURIComponent(String(limit));
          const result = await coreJson(coreUrl);
          const rows = items(result.data);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: rows.length,
            totalMatched: result.data?.totalMatched ?? rows.length,
            items: rows,
            hotlaps: rows,
            leaderboard: rows
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/laps') {
          const sort = String(search.get('sort') || search.get('order') || '').toLowerCase();
          const isOldest = sort === 'oldest' || sort === 'asc' || search.get('order') === 'asc';

          if (isOldest && limit <= 5) {
            const coreUrl = '/api/gc/diagnostics';
            const result = await coreJson(coreUrl);
            const oldestIso = result.data?.raceData?.oldestLapAt || result.data?.oldestLapAt || null;
            const timestamp = oldestIso ? Math.floor(Date.parse(oldestIso) / 1000) : null;
            const rows = oldestIso ? [{ timestampIso: oldestIso, timestamp, source: 'gc-data-core-diagnostics' }] : [];
            state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

            return jsonResponse({
              ok: result.ok && result.data?.ok !== false,
              source: 'gc-data-core-legacy-alias',
              legacyAliasFor: url,
              count: rows.length,
              items: rows,
              laps: rows
            }, result.ok ? 200 : result.status);
          }

          const coreUrl = '/api/gc/recent-laps?scope=' + encodeURIComponent(scope) + '&limit=' + encodeURIComponent(String(limit));
          const result = await coreJson(coreUrl);
          const rows = items(result.data);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: rows.length,
            totalMatchedLaps: result.data?.totalMatched ?? rows.length,
            items: rows,
            laps: rows
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/pilots' || path === '/api/drivers') {
          const coreUrl = '/api/gc/recent-laps?scope=global&limit=1000';
          const result = await coreJson(coreUrl);
          const seen = new Map();

          for (const row of items(result.data)) {
            const key = driverKey(row);
            if (!key || seen.has(key)) continue;
            seen.set(key, compactDriver(row));
          }

          const rows = [...seen.values()];
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: rows.length,
            totalDrivers: rows.length,
            items: rows,
            drivers: rows,
            pilots: rows
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/stats/overview') {
          const coreUrl = '/api/gc/diagnostics';
          const result = await coreJson(coreUrl);
          const race = result.data?.raceData || {};
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });

          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            totalLaps: race.lapsCount ?? 0,
            validLaps: race.validLapsCount ?? 0,
            driversCount: race.driversCount ?? 0,
            carsCount: race.carsCount ?? 0,
            tracksCount: race.tracksCount ?? 0,
            combosCount: race.combosCount ?? 0,
            latestLapAt: race.latestLapAt ?? null,
            oldestLapAt: race.oldestLapAt ?? null
          }, result.ok ? 200 : result.status);
        }

        return null;
      }

      window.fetch = async (...args) => {
        const url = textUrl(args[0]);

        if (!state.enabled || !isComboDetail()) {
          return previousFetch(...args);
        }

        const parsed = toUrl(url);
        const pathname = parsed?.pathname || '';

        const isComboLegacy = /^\\/api\\/combos\\/[^/]+$/.test(pathname);
        const isOtherLegacy =
          pathname === '/api/combos/stats' ||
          pathname === '/api/hotlaps' ||
          pathname === '/api/laps' ||
          pathname === '/api/pilots' ||
          pathname === '/api/drivers' ||
          pathname === '/api/stats/overview';

        if (!isComboLegacy && !isOtherLegacy) return previousFetch(...args);

        // Important: preserve real legacy fallback for the first combo detail load if Data Core has not become primary yet.
        if (isComboLegacy && !dataCoreIsPrimary()) {
          state.fallbackAllowed.push({ url, reason: 'initial-detail-fallback-preserved', at: new Date().toISOString() });
          state.fallbackAllowed = state.fallbackAllowed.slice(-20);
          return previousFetch(...args);
        }

        const started = performance.now();

        try {
          const response = await legacyToCore(url);
          if (response) {
            const entry = {
              url,
              status: response.status,
              ok: response.ok,
              ms: Math.round(performance.now() - started),
              at: new Date().toISOString()
            };

            state.mutedCalls.push(entry);
            state.mutedCalls = state.mutedCalls.slice(-80);
            document.documentElement.dataset.gcComboDetailLegacyNetwork = 'cut-v1';

            return response;
          }
        } catch (error) {
          console.warn('[GC /combos/:id Legacy Network Cut v1] alias failed, falling back to original legacy endpoint', { url, error });
          state.fallbackCalls.push({
            url,
            error: error?.message || String(error),
            at: new Date().toISOString()
          });
          state.fallbackCalls = state.fallbackCalls.slice(-40);
        }

        return previousFetch(...args);
      };

      window.GCComboDetailLegacyNetworkCut = {
        version: 'v1',
        state,
        status() {
          return {
            ...state,
            mutedCount: state.mutedCalls.length,
            dataCore: document.documentElement.dataset.gcComboDetailDataCore || null,
            dataCoreVersion: document.documentElement.dataset.gcComboDetailDataCoreVersion || null,
            trackImage: document.documentElement.dataset.gcComboDetailTrackImage || null,
            trackImages: window.GCTrackImages?.version || null
          };
        },
        disable() {
          state.enabled = false;
          document.documentElement.dataset.gcComboDetailLegacyNetwork = 'disabled';
        },
        enable() {
          state.enabled = true;
          document.documentElement.dataset.gcComboDetailLegacyNetwork = 'cut-v1';
        }
      };

      document.documentElement.dataset.gcComboDetailLegacyNetwork = 'cut-ready';
      console.info('[GC /combos/:id Legacy Network Cut v1] ready');
    })();
    ${END}
  </script>
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const scriptStart = text.lastIndexOf('<script', startIndex);
    const scriptEnd = text.indexOf('</script>', endIndex);

    if (scriptStart !== -1 && scriptEnd !== -1) {
      return text.slice(0, scriptStart) + block.trimEnd() + '\n' + text.slice(scriptEnd + '</script>'.length);
    }

    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

let next = replaceMarkedBlock(source, START, END, cutScript);

if (next === null) {
  // Insert before the main inline script, but after any track image helper includes.
  const marker = source.indexOf('const comboId');
  const insertAt = marker !== -1 ? source.lastIndexOf('<script', marker) : source.indexOf('<script');

  if (insertAt === -1) {
    console.error('[GC COMBO DETAIL LEGACY CUT] Could not find insertion point.');
    process.exit(1);
  }

  next = source.slice(0, insertAt) + cutScript + '\n' + source.slice(insertAt);
}

fs.writeFileSync(comboDetailPath, next, 'utf8');

console.log('[GC COMBO DETAIL LEGACY CUT] Applied /combos/:comboId Legacy Network Cut v1.');
console.log('[GC COMBO DETAIL LEGACY CUT] Initial real legacy fallback is preserved if Data Core fails.');
console.log('[GC COMBO DETAIL LEGACY CUT] No endpoints, images or other pages changed.');
console.log('[GC COMBO DETAIL LEGACY CUT] Run: npm run build');
