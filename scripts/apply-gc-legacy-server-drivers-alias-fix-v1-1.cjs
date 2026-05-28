#!/usr/bin/env node
/* GC_LEGACY_SERVER_DRIVERS_ALIAS_FIX_V1_1_APPLY
 * Fixes /api/drivers legacy alias returning 500.
 * Replaces internal Express router forwarding with a direct Data Core-backed handler.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC DRIVERS ALIAS FIX] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('GC_LEGACY_SERVER_ALIASES_V1_START')) {
  console.error('[GC DRIVERS ALIAS FIX] Legacy Server Aliases block not found. Apply GC_Legacy_Server_Aliases_v1 first.');
  process.exit(1);
}

const badRouteRegex = /app\.get\('\/api\/drivers',\s*async\s*\(req,\s*res\)\s*=>\s*\{\s*req\.url\s*=\s*req\.url\.replace\('\/api\/drivers',\s*'\/api\/pilots'\);\s*return\s*\(app\s+as\s+any\)\._router\.handle\(req,\s*res\);\s*\}\);/m;

const newRoute = `app.get('/api/drivers', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 800, 1, 2000);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const bestByDriver = new Map<string, any>();

    for (const row of laps) {
      const key = String(gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? gcLegacyAliasDriverNameV1(row));
      const current = bestByDriver.get(key);
      if (!current || gcLegacyAliasDateMsV1(row) > gcLegacyAliasDateMsV1(current)) {
        bestByDriver.set(key, row);
      }
    }

    const items = [...bestByDriver.values()].slice(0, limit).map((row) => {
      const playerId = gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? null;
      return {
        id: playerId,
        playerId,
        driverId: playerId,
        name: gcLegacyAliasDriverNameV1(row),
        displayName: gcLegacyAliasDriverNameV1(row),
        driverName: gcLegacyAliasDriverNameV1(row),
        carName: gcLegacyAliasCarNameV1(row),
        trackName: gcLegacyAliasTrackNameV1(row),
        avatarUrl: playerId ? '/api/pilot-avatar/' + encodeURIComponent(String(playerId)) : null,
        source: 'gc-data-core-legacy-server-alias'
      };
    });

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/drivers',
      canonicalEndpoint: '/api/gc/recent-laps + identity projection',
      count: items.length,
      totalDrivers: items.length,
      items,
      drivers: items,
      pilots: items
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/drivers error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/drivers',
      items: [],
      drivers: [],
      pilots: [],
      message: 'No se pudo resolver /api/drivers desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});`;

if (badRouteRegex.test(source)) {
  source = source.replace(badRouteRegex, newRoute);
  console.log('[GC DRIVERS ALIAS FIX] Replaced broken /api/drivers router forwarding.');
} else if (!source.includes("legacyEndpoint: '/api/drivers'")) {
  const pilotsRoute = "app.get('/api/pilots'";
  const idx = source.indexOf(pilotsRoute);
  if (idx === -1) {
    console.error('[GC DRIVERS ALIAS FIX] Could not find /api/pilots route anchor.');
    process.exit(1);
  }

  const nextRouteIdx = source.indexOf("\n\napp.get('/api/drivers'", idx);
  if (nextRouteIdx !== -1) {
    const nextEnd = source.indexOf("\n\napp.get(", nextRouteIdx + 2);
    if (nextEnd !== -1) {
      source = source.slice(0, nextRouteIdx) + "\n\n" + newRoute + source.slice(nextEnd);
    } else {
      source = source.slice(0, nextRouteIdx) + "\n\n" + newRoute;
    }
  } else {
    const afterPilots = source.indexOf("\n\napp.get('/api/stats/overview'", idx);
    if (afterPilots === -1) {
      console.error('[GC DRIVERS ALIAS FIX] Could not find insertion point after /api/pilots.');
      process.exit(1);
    }
    source = source.slice(0, afterPilots) + "\n\n" + newRoute + source.slice(afterPilots);
  }

  console.log('[GC DRIVERS ALIAS FIX] Inserted direct /api/drivers alias handler.');
} else {
  console.log('[GC DRIVERS ALIAS FIX] /api/drivers already appears to be direct alias. No route replacement needed.');
}

fs.writeFileSync(serverPath, source, 'utf8');

console.log('[GC DRIVERS ALIAS FIX] Done.');
console.log('[GC DRIVERS ALIAS FIX] Run: npm run build');
