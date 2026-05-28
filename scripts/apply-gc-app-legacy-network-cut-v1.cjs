#!/usr/bin/env node
/* GC_APP_LEGACY_NETWORK_CUT_V1_APPLY
 * Legacy Removal Phase 1.1 for /app.
 * Stops /app from calling legacy network endpoints by aliasing them to Data Core or synthetic safe responses.
 * Does not delete legacy UI/scripts yet.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'pages', 'app.astro');

const START = '/* GC_APP_LEGACY_NETWORK_CUT_V1_START */';
const END = '/* GC_APP_LEGACY_NETWORK_CUT_V1_END */';

if (!fs.existsSync(appPath)) {
  console.error('[GC APP LEGACY NETWORK CUT] Missing src/pages/app.astro');
  process.exit(1);
}

let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes('GC_APP_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC APP LEGACY NETWORK CUT] /app Data Core primary block not found.');
  process.exit(1);
}

if (!source.includes('GC_APP_LEGACY_GOVERNOR_V1_EARLY_START')) {
  console.warn('[GC APP LEGACY NETWORK CUT] Legacy Governor not found. This pack can still work, but apply governor first if possible.');
}

const cutScript = `
  <script is:inline>
    ${START}
    (() => {
      if (window.GCAppLegacyNetworkCut?.version === 'v1') return;

      const state = {
        version: 'v1',
        startedAt: new Date().toISOString(),
        mode: 'network-cut',
        mutedCalls: [],
        coreAliases: [],
        syntheticCalls: [],
        enabled: true
      };

      const previousFetch = window.fetch.bind(window);

      const textUrl = (input) => {
        if (typeof input === 'string') return input;
        if (input?.url) return String(input.url);
        return String(input || '');
      };

      const isApp = () => location.pathname === '/app' || location.pathname === '/app/';
      const urlObj = (url) => {
        try { return new URL(url, location.origin); }
        catch { return null; }
      };

      const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-GC-App-Legacy-Network-Cut': 'v1'
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

      const normalizeItems = (data) => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        return data.items || data.data?.items || data.data?.leaderboard || data.data?.laps || data.leaderboard || data.laps || data.hotlaps || [];
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

      async function legacyToCore(url) {
        const parsed = urlObj(url);
        if (!parsed) return null;

        const path = parsed.pathname;
        const search = parsed.searchParams;
        const limit = Math.max(1, Math.min(Number(search.get('limit') || 300) || 300, 1000));

        if (path === '/api/combos/stats') {
          const coreUrl = '/api/gc/combos?limit=1000&sort=recent';
          const result = await coreJson(coreUrl);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });
          return jsonResponse({
            ...(result.data || {}),
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/hotlaps') {
          const coreUrl = '/api/gc/leaderboard?scope=activeCombo&limit=' + encodeURIComponent(String(limit));
          const result = await coreJson(coreUrl);
          const items = normalizeItems(result.data);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });
          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: items.length,
            items,
            hotlaps: items
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
            const items = oldestIso ? [{ timestampIso: oldestIso, timestamp, source: 'gc-data-core-diagnostics' }] : [];
            state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });
            return jsonResponse({
              ok: result.ok && result.data?.ok !== false,
              source: 'gc-data-core-legacy-alias',
              legacyAliasFor: url,
              count: items.length,
              items,
              laps: items
            }, result.ok ? 200 : result.status);
          }

          const scope = search.get('scope') || 'global';
          const coreUrl = '/api/gc/recent-laps?scope=' + encodeURIComponent(scope) + '&limit=' + encodeURIComponent(String(limit));
          const result = await coreJson(coreUrl);
          const items = normalizeItems(result.data);
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });
          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: items.length,
            totalMatchedLaps: result.data?.totalMatched ?? items.length,
            items,
            laps: items
          }, result.ok ? 200 : result.status);
        }

        if (path === '/api/pilots' || path === '/api/drivers') {
          const coreUrl = '/api/gc/recent-laps?scope=global&limit=1000';
          const result = await coreJson(coreUrl);
          const seen = new Map();
          for (const row of normalizeItems(result.data)) {
            const key = driverKey(row);
            if (!key || seen.has(key)) continue;
            seen.set(key, compactDriver(row));
          }
          const items = [...seen.values()];
          state.coreAliases.push({ legacy: url, core: coreUrl, status: result.status, at: new Date().toISOString() });
          return jsonResponse({
            ok: result.ok && result.data?.ok !== false,
            source: 'gc-data-core-legacy-alias',
            legacyAliasFor: url,
            count: items.length,
            totalDrivers: items.length,
            items,
            drivers: items,
            pilots: items
          }, result.ok ? 200 : result.status);
        }

        return null;
      }

      window.fetch = async (...args) => {
        const url = textUrl(args[0]);

        if (!state.enabled || !isApp()) {
          return previousFetch(...args);
        }

        const parsed = urlObj(url);
        const pathname = parsed?.pathname || '';

        const isLegacy =
          pathname === '/api/combos/stats' ||
          pathname === '/api/hotlaps' ||
          pathname === '/api/laps' ||
          pathname === '/api/pilots' ||
          pathname === '/api/drivers';

        if (!isLegacy) {
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
            document.documentElement.dataset.gcAppLegacyNetwork = 'cut-v1';
            return response;
          }
        } catch (error) {
          console.warn('[GC /app Legacy Network Cut v1] alias failed, falling back to original legacy endpoint', { url, error });
          state.syntheticCalls.push({
            url,
            error: error?.message || String(error),
            at: new Date().toISOString()
          });
          state.syntheticCalls = state.syntheticCalls.slice(-40);
        }

        return previousFetch(...args);
      };

      window.GCAppLegacyNetworkCut = {
        version: 'v1',
        state,
        status() {
          return {
            ...state,
            mutedCount: state.mutedCalls.length,
            dataCore: document.documentElement.dataset.gcAppDataCore || null,
            legacyGovernor: window.GCAppLegacyGovernor?.status?.() || null
          };
        },
        disable() {
          state.enabled = false;
          document.documentElement.dataset.gcAppLegacyNetwork = 'disabled';
        },
        enable() {
          state.enabled = true;
          document.documentElement.dataset.gcAppLegacyNetwork = 'cut-v1';
        }
      };

      document.documentElement.dataset.gcAppLegacyNetwork = 'cut-ready';
      console.info('[GC /app Legacy Network Cut v1] ready');
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
  const gov = source.indexOf('/* GC_APP_LEGACY_GOVERNOR_V1_EARLY_END */');
  if (gov !== -1) {
    const scriptEnd = source.indexOf('</script>', gov);
    if (scriptEnd !== -1) {
      next = source.slice(0, scriptEnd + '</script>'.length) + '\n' + cutScript + source.slice(scriptEnd + '</script>'.length);
    }
  }

  if (next === null) {
    const core = source.indexOf('/* GC_APP_DATA_CORE_PRIMARY_V1_START */');
    const insertAt = core !== -1 ? source.lastIndexOf('<script', core) : source.indexOf('<script');
    if (insertAt === -1) {
      console.error('[GC APP LEGACY NETWORK CUT] Could not find insertion point.');
      process.exit(1);
    }
    next = source.slice(0, insertAt) + cutScript + '\n' + source.slice(insertAt);
  }
}

fs.writeFileSync(appPath, next, 'utf8');

console.log('[GC APP LEGACY NETWORK CUT] Applied /app Legacy Network Cut v1.');
console.log('[GC APP LEGACY NETWORK CUT] Legacy calls are aliased to Data Core or synthetic safe responses.');
console.log('[GC APP LEGACY NETWORK CUT] No endpoints, images or other pages changed.');
console.log('[GC APP LEGACY NETWORK CUT] Run: npm run build');
