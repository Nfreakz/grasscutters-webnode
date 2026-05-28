#!/usr/bin/env node
/* GC_RACE_DATA_CORE_DIAGNOSTICS_V1_APPLY
 * Adds a safe /api/gc/diagnostics endpoint.
 * No UI changes. No sensitive filesystem paths exposed.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_RACE_DATA_CORE_DIAGNOSTICS_V1_START */';
const END = '/* GC_RACE_DATA_CORE_DIAGNOSTICS_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC RACE DIAGNOSTICS] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'getStrackerConfig',
  'readDisplayNameStoreAsync',
  'readJoinedLaps',
  'getCombos',
  'buildComboStatsFromLaps'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC RACE DIAGNOSTICS] Required function not found: ${name}`);
    console.error('[GC RACE DIAGNOSTICS] Apply after Data Core packs and existing stracker helpers.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
app.get('/api/gc/diagnostics', async (_req, res) => {
  const generatedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const stracker = getStrackerConfig();
    const displayStore = await readDisplayNameStoreAsync();

    const displayEnabled = displayStore.entries.filter((entry: DisplayNameEntry) => entry.enabled !== false);
    const displayByKind = displayEnabled.reduce((acc: Record<string, number>, entry: DisplayNameEntry) => {
      acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
      return acc;
    }, {});

    const diagnostics: any = {
      ok: true,
      source: 'gc-race-data-core',
      generatedAt,
      latencyMs: 0,
      health: 'checking',
      domains: {
        raceDataCore: 'stracker',
        championshipCore: 'acsm-separated',
        archiveCore: 'archive-separated',
        identityCore: 'users-pilot-links',
        calendarCore: 'calendar-events'
      },
      stracker: {
        exists: Boolean(stracker.exists),
        validSQLite: Boolean(stracker.validSQLite),
        sizeBytes: Number(stracker.sizeBytes ?? 0),
        sizeMb: Math.round(((Number(stracker.sizeBytes ?? 0) / 1024 / 1024) || 0) * 10) / 10,
        modifiedAt: stracker.modifiedAt ?? null,
        configured: Boolean(stracker.configured),
        source: stracker.source ?? null
      },
      displayNames: {
        loaded: true,
        total: displayStore.entries.length,
        enabled: displayEnabled.length,
        disabled: displayStore.entries.length - displayEnabled.length,
        byKind: displayByKind,
        cacheLoaded: Boolean(displayNameCache),
        cacheUpdatedAt: displayNameCache?.store?.updatedAt ?? displayStore.updatedAt,
        pipeline: {
          order: ['rawName', 'autoName', 'displayName'],
          automaticCleaner: 'autoTitleFromCode',
          adminOverride: 'gc_display_names',
          previewEndpoint: '/api/gc/names/preview'
        }
      },
      raceData: {
        readable: false,
        lapsCount: 0,
        validLapsCount: 0,
        invalidLapsCount: 0,
        driversCount: 0,
        carsCount: 0,
        tracksCount: 0,
        combosCount: 0,
        activeCombosCount: 0,
        latestLapAt: null,
        oldestLapAt: null,
        latestCombo: null
      },
      endpoints: {
        snapshot: '/api/gc/snapshot',
        activeCombo: '/api/gc/active-combo',
        leaderboard: '/api/gc/leaderboard',
        recentLaps: '/api/gc/recent-laps',
        combos: '/api/gc/combos',
        namesPreview: '/api/gc/names/preview',
        displayNamesStatus: '/api/gc/display-names/status'
      },
      warnings: []
    };

    if (!stracker.exists || !stracker.resolvedPath) {
      diagnostics.ok = false;
      diagnostics.health = 'degraded';
      diagnostics.warnings.push('stracker database not found');
      diagnostics.latencyMs = Date.now() - startedAt;
      return res.status(200).json(diagnostics);
    }

    if (!stracker.validSQLite) {
      diagnostics.ok = false;
      diagnostics.health = 'degraded';
      diagnostics.warnings.push('stracker database is not a valid SQLite file');
      diagnostics.latencyMs = Date.now() - startedAt;
      return res.status(200).json(diagnostics);
    }

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const comboStats = buildComboStatsFromLaps(laps, comboDefinitions);

    const uniqueDrivers = new Set<string>();
    const uniqueCars = new Set<string>();
    const uniqueTracks = new Set<string>();
    let validLaps = 0;
    let invalidLaps = 0;
    let latestLapAt = 0;
    let oldestLapAt = 0;

    for (const lap of laps) {
      const playerId = lap.PlayerId ?? lap.playerId ?? lap.driverId ?? lap.DriverName ?? lap.Name;
      const carId = lap.CarId ?? lap.Car ?? lap.carId ?? lap.carName;
      const trackId = lap.TrackId ?? lap.Track ?? lap.trackId ?? lap.trackName;

      if (playerId !== null && playerId !== undefined && String(playerId).trim()) uniqueDrivers.add(String(playerId));
      if (carId !== null && carId !== undefined && String(carId).trim()) uniqueCars.add(String(carId));
      if (trackId !== null && trackId !== undefined && String(trackId).trim()) uniqueTracks.add(String(trackId));

      const valid = lap.Valid ?? lap.valid ?? lap.isValid;
      if (valid === 0 || valid === false || valid === '0' || valid === 'false') invalidLaps += 1;
      else validLaps += 1;

      const rawDate = lap.Timestamp ?? lap.timestamp ?? lap.Date ?? lap.date ?? lap.timestampIso ?? lap.dateIso;
      let ms = 0;
      if (typeof rawDate === 'number') ms = rawDate > 20000000000 ? rawDate : rawDate * 1000;
      else if (rawDate) {
        const parsed = Date.parse(String(rawDate));
        if (Number.isFinite(parsed)) ms = parsed;
      }

      if (ms) {
        latestLapAt = Math.max(latestLapAt, ms);
        oldestLapAt = oldestLapAt ? Math.min(oldestLapAt, ms) : ms;
      }
    }

    const activeCombos = comboStats.filter((combo: any) => Number(combo.totalLaps ?? 0) > 0);
    const latestCombo = [...activeCombos]
      .sort((a: any, b: any) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0) || Number(b.totalLaps ?? 0) - Number(a.totalLaps ?? 0))[0] || null;

    diagnostics.raceData = {
      readable: true,
      lapsCount: laps.length,
      validLapsCount: validLaps,
      invalidLapsCount: invalidLaps,
      driversCount: uniqueDrivers.size,
      carsCount: uniqueCars.size,
      tracksCount: uniqueTracks.size,
      combosCount: comboStats.length,
      activeCombosCount: activeCombos.length,
      latestLapAt: latestLapAt ? new Date(latestLapAt).toISOString() : null,
      oldestLapAt: oldestLapAt ? new Date(oldestLapAt).toISOString() : null,
      latestCombo: latestCombo ? {
        comboId: latestCombo.comboId ?? latestCombo.canonicalComboId ?? latestCombo.id ?? null,
        trackName: latestCombo.track?.displayName ?? latestCombo.track?.name ?? latestCombo.trackName ?? null,
        carsCount: Array.isArray(latestCombo.cars) ? latestCombo.cars.length : Number(latestCombo.carsCount ?? 0),
        totalLaps: Number(latestCombo.totalLaps ?? 0),
        driversCount: Number(latestCombo.driversCount ?? 0),
        lastSeenTimestamp: latestCombo.lastSeenTimestamp ?? null
      } : null
    };

    if (!laps.length) diagnostics.warnings.push('no laps found');
    if (!comboStats.length) diagnostics.warnings.push('no combos generated');
    if (!displayEnabled.length) diagnostics.warnings.push('no display-name overrides enabled');
    if (!diagnostics.raceData.latestLapAt) diagnostics.warnings.push('latest lap date not detected');

    diagnostics.health = diagnostics.warnings.length ? 'ok_with_warnings' : 'ok';
    diagnostics.latencyMs = Date.now() - startedAt;

    res.json(diagnostics);
  } catch (error) {
    console.error('[GC Race Data Core] diagnostics error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-race-data-core',
      generatedAt,
      latencyMs: Date.now() - startedAt,
      health: 'error',
      warnings: ['diagnostics failed'],
      message: 'No se pudo generar el diagnóstico Race Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${END}
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC RACE DIAGNOSTICS] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

const replaced = replaceMarkedBlock(source, START, END, routeBlock);
if (replaced !== null) {
  source = replaced;
} else {
  const anchor =
    source.includes("app.get('/api/gc/names/preview'")
      ? "app.get('/api/gc/names/preview'"
      : source.includes("app.get('/api/gc/display-names/status'")
        ? "app.get('/api/gc/display-names/status'"
        : source.includes("app.get('/api/gc/snapshot'")
          ? "app.get('/api/gc/snapshot'"
          : "app.get('/api/health'";

  source = insertBefore(source, anchor, routeBlock, '/api/gc/diagnostics');
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC RACE DIAGNOSTICS] Added/updated /api/gc/diagnostics.');
console.log('[GC RACE DIAGNOSTICS] Run: npm run build');
