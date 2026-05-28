#!/usr/bin/env node
/* GC_LEGACY_PILOTS_STATS_ALIAS_FIX_V1_2_APPLY
 * Fixes /pilotos page after legacy server aliases.
 * /api/pilots and /api/drivers now return full per-pilot stats expected by src/pages/pilotos.astro.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC PILOTS STATS ALIAS FIX] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('GC_LEGACY_SERVER_ALIASES_V1_START')) {
  console.error('[GC PILOTS STATS ALIAS FIX] Legacy Server Aliases block not found. Apply GC_Legacy_Server_Aliases_v1 first.');
  process.exit(1);
}

const pilotsRoute = `app.get('/api/pilots', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 800, 1, 5000);
    const validFilter = getQueryString(req, 'valid', 'all').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);

    const statsByDriver = new Map<string, any>();

    for (const row of laps) {
      const playerId = gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? null;
      const name = gcLegacyAliasDriverNameV1(row);
      const key = String(playerId ?? name);
      const lapMs = gcLegacyAliasLapMsV1(row);
      const dateMs = gcLegacyAliasDateMsV1(row);
      const valid = gcLegacyAliasIsValidV1(row);

      if (validFilter === 'valid' && !valid) continue;
      if (validFilter === 'invalid' && valid) continue;

      if (!statsByDriver.has(key)) {
        statsByDriver.set(key, {
          id: playerId,
          playerId,
          driverId: playerId,
          pilotId: playerId,
          steamGuid: gcLegacyAliasPickV1(row, ['steamGuid', 'SteamGuid', 'driver.steamGuid', 'guid']) ?? null,
          name,
          displayName: name,
          visibleName: name,
          driverName: name,
          playerName: name,
          totalLaps: 0,
          laps: 0,
          lapCount: 0,
          validLaps: 0,
          invalidLaps: 0,
          firstSeenMs: 0,
          lastSeenMs: 0,
          firstSeenAt: null,
          lastSeenAt: null,
          firstActivityAt: null,
          lastActivityAt: null,
          latestLapAt: null,
          bestLapMs: null,
          bestLapTime: '--',
          bestLapTimeFormatted: '--',
          maxSpeedKmh: 0,
          lastCarName: null,
          lastCarDisplayName: null,
          carName: null,
          lastTrackName: null,
          trackName: null,
          isOnline: false,
          online: false,
          source: 'gc-data-core-legacy-server-alias'
        });
      }

      const item = statsByDriver.get(key);

      item.totalLaps += 1;
      item.laps += 1;
      item.lapCount += 1;
      if (valid) item.validLaps += 1;
      else item.invalidLaps += 1;

      if (dateMs > 0 && (!item.firstSeenMs || dateMs < item.firstSeenMs)) {
        item.firstSeenMs = dateMs;
        item.firstSeenAt = new Date(dateMs).toISOString();
        item.firstActivityAt = item.firstSeenAt;
      }

      if (dateMs > 0 && (!item.lastSeenMs || dateMs > item.lastSeenMs)) {
        item.lastSeenMs = dateMs;
        item.lastSeenAt = new Date(dateMs).toISOString();
        item.lastActivityAt = item.lastSeenAt;
        item.latestLapAt = item.lastSeenAt;
        item.lastCarName = gcLegacyAliasCarNameV1(row);
        item.lastCarDisplayName = item.lastCarName;
        item.carName = item.lastCarName;
        item.lastTrackName = gcLegacyAliasTrackNameV1(row);
        item.trackName = item.lastTrackName;
      }

      if (valid && lapMs > 0 && (!item.bestLapMs || lapMs < item.bestLapMs)) {
        item.bestLapMs = lapMs;
        item.bestLapTime = gcLegacyAliasLapTimeV1(row);
        item.bestLapTimeFormatted = item.bestLapTime;
        item.bestCarName = gcLegacyAliasCarNameV1(row);
        item.bestTrackName = gcLegacyAliasTrackNameV1(row);
      }

      const speed = gcLegacyAliasSpeedV1(row);
      if (speed > item.maxSpeedKmh) item.maxSpeedKmh = speed;
    }

    const now = Date.now();
    const items = [...statsByDriver.values()]
      .map((item) => {
        const active7d = item.lastSeenMs > 0 && (now - item.lastSeenMs) <= 7 * 24 * 60 * 60 * 1000;

        return {
          ...item,
          stats: {
            totalLaps: item.totalLaps,
            validLaps: item.validLaps,
            invalidLaps: item.invalidLaps,
            firstSeenAt: item.firstSeenAt,
            lastSeenAt: item.lastSeenAt,
            bestLapMs: item.bestLapMs,
            bestLapTime: item.bestLapTime,
            maxSpeedKmh: item.maxSpeedKmh
          },
          cleanRate: item.totalLaps ? Math.round((item.validLaps / item.totalLaps) * 100) : 0,
          active7d,
          avatarUrl: item.playerId ? '/api/pilot-avatar/' + encodeURIComponent(String(item.playerId)) : null,
          profileUrl: item.playerId ? '/pilotos/' + encodeURIComponent(String(item.playerId)) : null
        };
      })
      .sort((a, b) => {
        const sort = getQueryString(req, 'sort', 'recent').toLowerCase();
        if (sort === 'laps') return b.totalLaps - a.totalLaps;
        if (sort === 'name') return String(a.displayName).localeCompare(String(b.displayName), 'es', { sensitivity: 'base' });
        return (b.lastSeenMs || 0) - (a.lastSeenMs || 0) || b.totalLaps - a.totalLaps;
      })
      .slice(0, limit);

    const active7dCount = items.filter((item) => item.active7d).length;
    const totalLaps = items.reduce((sum, item) => sum + item.totalLaps, 0);
    const top = [...items].sort((a, b) => b.totalLaps - a.totalLaps)[0] || null;

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/pilots',
      canonicalEndpoint: '/api/gc/recent-laps + pilot stats projection',
      count: items.length,
      total: items.length,
      totalDrivers: items.length,
      active7dCount,
      totalLaps,
      topPilot: top ? {
        playerId: top.playerId,
        displayName: top.displayName,
        totalLaps: top.totalLaps
      } : null,
      items,
      pilots: items,
      drivers: items
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/pilots error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/pilots',
      items: [],
      pilots: [],
      drivers: [],
      message: 'No se pudo resolver /api/pilots desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});`;

const driversRoute = `app.get('/api/drivers', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 800, 1, 5000);
    const validFilter = getQueryString(req, 'valid', 'all').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);

    const statsByDriver = new Map<string, any>();

    for (const row of laps) {
      const playerId = gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? null;
      const name = gcLegacyAliasDriverNameV1(row);
      const key = String(playerId ?? name);
      const lapMs = gcLegacyAliasLapMsV1(row);
      const dateMs = gcLegacyAliasDateMsV1(row);
      const valid = gcLegacyAliasIsValidV1(row);

      if (validFilter === 'valid' && !valid) continue;
      if (validFilter === 'invalid' && valid) continue;

      if (!statsByDriver.has(key)) {
        statsByDriver.set(key, {
          id: playerId,
          playerId,
          driverId: playerId,
          pilotId: playerId,
          steamGuid: gcLegacyAliasPickV1(row, ['steamGuid', 'SteamGuid', 'driver.steamGuid', 'guid']) ?? null,
          name,
          displayName: name,
          visibleName: name,
          driverName: name,
          playerName: name,
          totalLaps: 0,
          laps: 0,
          lapCount: 0,
          validLaps: 0,
          invalidLaps: 0,
          firstSeenMs: 0,
          lastSeenMs: 0,
          firstSeenAt: null,
          lastSeenAt: null,
          firstActivityAt: null,
          lastActivityAt: null,
          latestLapAt: null,
          bestLapMs: null,
          bestLapTime: '--',
          bestLapTimeFormatted: '--',
          maxSpeedKmh: 0,
          lastCarName: null,
          lastCarDisplayName: null,
          carName: null,
          lastTrackName: null,
          trackName: null,
          isOnline: false,
          online: false,
          source: 'gc-data-core-legacy-server-alias'
        });
      }

      const item = statsByDriver.get(key);

      item.totalLaps += 1;
      item.laps += 1;
      item.lapCount += 1;
      if (valid) item.validLaps += 1;
      else item.invalidLaps += 1;

      if (dateMs > 0 && (!item.firstSeenMs || dateMs < item.firstSeenMs)) {
        item.firstSeenMs = dateMs;
        item.firstSeenAt = new Date(dateMs).toISOString();
        item.firstActivityAt = item.firstSeenAt;
      }

      if (dateMs > 0 && (!item.lastSeenMs || dateMs > item.lastSeenMs)) {
        item.lastSeenMs = dateMs;
        item.lastSeenAt = new Date(dateMs).toISOString();
        item.lastActivityAt = item.lastSeenAt;
        item.latestLapAt = item.lastSeenAt;
        item.lastCarName = gcLegacyAliasCarNameV1(row);
        item.lastCarDisplayName = item.lastCarName;
        item.carName = item.lastCarName;
        item.lastTrackName = gcLegacyAliasTrackNameV1(row);
        item.trackName = item.lastTrackName;
      }

      if (valid && lapMs > 0 && (!item.bestLapMs || lapMs < item.bestLapMs)) {
        item.bestLapMs = lapMs;
        item.bestLapTime = gcLegacyAliasLapTimeV1(row);
        item.bestLapTimeFormatted = item.bestLapTime;
        item.bestCarName = gcLegacyAliasCarNameV1(row);
        item.bestTrackName = gcLegacyAliasTrackNameV1(row);
      }

      const speed = gcLegacyAliasSpeedV1(row);
      if (speed > item.maxSpeedKmh) item.maxSpeedKmh = speed;
    }

    const now = Date.now();
    const items = [...statsByDriver.values()]
      .map((item) => {
        const active7d = item.lastSeenMs > 0 && (now - item.lastSeenMs) <= 7 * 24 * 60 * 60 * 1000;

        return {
          ...item,
          stats: {
            totalLaps: item.totalLaps,
            validLaps: item.validLaps,
            invalidLaps: item.invalidLaps,
            firstSeenAt: item.firstSeenAt,
            lastSeenAt: item.lastSeenAt,
            bestLapMs: item.bestLapMs,
            bestLapTime: item.bestLapTime,
            maxSpeedKmh: item.maxSpeedKmh
          },
          cleanRate: item.totalLaps ? Math.round((item.validLaps / item.totalLaps) * 100) : 0,
          active7d,
          avatarUrl: item.playerId ? '/api/pilot-avatar/' + encodeURIComponent(String(item.playerId)) : null,
          profileUrl: item.playerId ? '/pilotos/' + encodeURIComponent(String(item.playerId)) : null
        };
      })
      .sort((a, b) => {
        const sort = getQueryString(req, 'sort', 'recent').toLowerCase();
        if (sort === 'laps') return b.totalLaps - a.totalLaps;
        if (sort === 'name') return String(a.displayName).localeCompare(String(b.displayName), 'es', { sensitivity: 'base' });
        return (b.lastSeenMs || 0) - (a.lastSeenMs || 0) || b.totalLaps - a.totalLaps;
      })
      .slice(0, limit);

    const active7dCount = items.filter((item) => item.active7d).length;
    const totalLaps = items.reduce((sum, item) => sum + item.totalLaps, 0);
    const top = [...items].sort((a, b) => b.totalLaps - a.totalLaps)[0] || null;

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/drivers',
      canonicalEndpoint: '/api/gc/recent-laps + pilot stats projection',
      count: items.length,
      total: items.length,
      totalDrivers: items.length,
      active7dCount,
      totalLaps,
      topPilot: top ? {
        playerId: top.playerId,
        displayName: top.displayName,
        totalLaps: top.totalLaps
      } : null,
      items,
      pilots: items,
      drivers: items
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/drivers error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/drivers',
      items: [],
      pilots: [],
      drivers: [],
      message: 'No se pudo resolver /api/drivers desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});`;

function replaceRouteByAnchor(text, routeStart, nextRouteStart, replacement, label) {
  const start = text.indexOf(routeStart);
  if (start === -1) {
    console.error(`[GC PILOTS STATS ALIAS FIX] Missing ${label} start: ${routeStart}`);
    process.exit(1);
  }

  const end = text.indexOf(nextRouteStart, start + routeStart.length);
  if (end === -1) {
    console.error(`[GC PILOTS STATS ALIAS FIX] Missing ${label} end anchor: ${nextRouteStart}`);
    process.exit(1);
  }

  return text.slice(0, start) + replacement + '\n\n' + text.slice(end);
}

source = replaceRouteByAnchor(
  source,
  "app.get('/api/pilots'",
  "app.get('/api/drivers'",
  pilotsRoute,
  '/api/pilots'
);

source = replaceRouteByAnchor(
  source,
  "app.get('/api/drivers'",
  "app.get('/api/stats/overview'",
  driversRoute,
  '/api/drivers'
);

fs.writeFileSync(serverPath, source, 'utf8');

console.log('[GC PILOTS STATS ALIAS FIX] Replaced /api/pilots and /api/drivers with full stats aliases.');
console.log('[GC PILOTS STATS ALIAS FIX] Run: npm run build');
