#!/usr/bin/env node
/* GC_DATA_CORE_LAB_FIXES_V1_APPLY
 * Fixes two issues detected by /admin/endpoints:
 * 1) /api/gc/names/preview missing (404)
 * 2) /api/gc/recent-laps?scope=activeCombo returning zero items while active leaderboard exists
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_DATA_CORE_LAB_FIXES_V1_START */';
const END = '/* GC_DATA_CORE_LAB_FIXES_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC DATA CORE LAB FIXES] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'getSafeStrackerOrRespond',
  'readJoinedLaps',
  'getCombos',
  'buildComboStatsFromLaps',
  'getQueryNumber',
  'getQueryString',
  'readDisplayNameStoreAsync',
  'autoTitleFromCode',
  'lapTimeToText'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC DATA CORE LAB FIXES] Required function not found: ${name}`);
    console.error('[GC DATA CORE LAB FIXES] Apply after Race Data Core, display names and stracker helpers exist.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
function gcLabFixTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcLabFixNumberV1(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gcLabFixValueAtV1(source: any, path: string) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return String(path).split('.').reduce((acc: any, part: string) => acc == null ? undefined : acc[part], source);
}

function gcLabFixPickV1(source: any, paths: string[]) {
  for (const path of paths) {
    const value = gcLabFixValueAtV1(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function gcLabFixDateMsV1(row: any) {
  const iso = gcLabFixPickV1(row, ['timestampIso', 'dateIso', 'createdAt', 'updatedAt', 'lastSeenAt']);
  if (iso) {
    const parsed = Date.parse(String(iso));
    if (Number.isFinite(parsed)) return parsed;
  }

  const raw = gcLabFixPickV1(row, ['timestamp', 'Timestamp', 'Date', 'date']);
  if (typeof raw === 'number') return raw > 20000000000 ? raw : raw * 1000;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function gcLabFixLapMsV1(row: any) {
  return gcLabFixNumberV1(gcLabFixPickV1(row, ['lapTimeMs', 'LapTime', 'timeMs', 'bestLapMs']), 0);
}

function gcLabFixLapTimeV1(row: any) {
  return gcLabFixTextV1(
    gcLabFixPickV1(row, ['lapTimeFormatted', 'lapTime', 'lapTimeText', 'bestLapTime']),
    lapTimeToText(gcLabFixLapMsV1(row)) || '--'
  );
}

function gcLabFixEntityNameV1(row: any, kind: 'driver' | 'car' | 'track') {
  if (kind === 'driver') {
    return gcLabFixTextV1(gcLabFixPickV1(row, ['driver.displayName', 'driver.visibleName', 'driver.name', 'driverName', 'playerName', 'Name', 'DriverName']), 'Piloto desconocido');
  }
  if (kind === 'car') {
    return gcLabFixTextV1(gcLabFixPickV1(row, ['car.displayName', 'car.visibleName', 'car.name', 'carName', 'uiCarName', 'UiCarName', 'carCode', 'Car']), 'Coche desconocido');
  }
  return gcLabFixTextV1(gcLabFixPickV1(row, ['track.displayName', 'track.visibleName', 'track.name', 'trackName', 'uiTrackName', 'UiTrackName', 'trackCode', 'Track']), 'Circuito desconocido');
}

function gcLabFixCompactLapV1(row: any) {
  const dateMs = gcLabFixDateMsV1(row);
  return {
    lapId: gcLabFixPickV1(row, ['lapId', 'LapId']) ?? null,
    comboId: gcLabFixPickV1(row, ['comboId', 'ComboId']) ?? null,
    playerId: gcLabFixPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? null,
    driverName: gcLabFixEntityNameV1(row, 'driver'),
    carName: gcLabFixEntityNameV1(row, 'car'),
    trackName: gcLabFixEntityNameV1(row, 'track'),
    driver: row.driver ?? null,
    car: row.car ?? null,
    track: row.track ?? null,
    lapTimeMs: gcLabFixLapMsV1(row) || null,
    lapTimeFormatted: gcLabFixLapTimeV1(row),
    valid: Boolean(gcLabFixPickV1(row, ['valid', 'isValid', 'Valid'])),
    timestamp: gcLabFixPickV1(row, ['timestamp', 'Timestamp']) ?? null,
    timestampIso: dateMs ? new Date(dateMs).toISOString() : null,
    maxSpeedKmh: gcLabFixPickV1(row, ['maxSpeedKmh', 'MaxSpeed_KMH', 'maxSpeed']) ?? null,
    cuts: gcLabFixPickV1(row, ['cuts', 'Cuts']) ?? 0
  };
}

function gcLabFixNameEntityV1(kind: 'driver' | 'car' | 'track', row: any) {
  if (kind === 'driver') {
    const rawName = gcLabFixTextV1(gcLabFixPickV1(row, ['driverRawName', 'driver.name', 'driverName', 'Name', 'DriverName']), gcLabFixEntityNameV1(row, 'driver'));
    const autoName = rawName;
    const displayName = gcLabFixEntityNameV1(row, 'driver');
    return {
      kind,
      id: gcLabFixPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? null,
      code: gcLabFixPickV1(row, ['steamGuid', 'driver.steamGuid', 'SteamGuid']) ?? null,
      rawName,
      autoName,
      displayName,
      hasOverride: rawName !== displayName && displayName !== autoName
    };
  }

  if (kind === 'car') {
    const code = gcLabFixTextV1(gcLabFixPickV1(row, ['carCode', 'car.code', 'Car']));
    const rawName = gcLabFixTextV1(gcLabFixPickV1(row, ['carRawName', 'uiCarName', 'car.uiName', 'UiCarName', 'carName', 'car.name', 'Car']), code || gcLabFixEntityNameV1(row, 'car'));
    const autoName = autoTitleFromCode(code || rawName, rawName);
    const displayName = gcLabFixEntityNameV1(row, 'car');
    return {
      kind,
      id: gcLabFixPickV1(row, ['carId', 'car.id', 'CarId']) ?? null,
      code: code || null,
      rawName,
      autoName,
      displayName,
      hasOverride: autoName !== displayName
    };
  }

  const code = gcLabFixTextV1(gcLabFixPickV1(row, ['trackCode', 'track.code', 'Track']));
  const rawName = gcLabFixTextV1(gcLabFixPickV1(row, ['trackRawName', 'uiTrackName', 'track.uiName', 'UiTrackName', 'trackName', 'track.name', 'Track']), code || gcLabFixEntityNameV1(row, 'track'));
  const autoName = autoTitleFromCode(code || rawName, rawName);
  const displayName = gcLabFixEntityNameV1(row, 'track');

  return {
    kind,
    id: gcLabFixPickV1(row, ['trackId', 'track.id', 'TrackId']) ?? null,
    code: code || null,
    rawName,
    autoName,
    displayName,
    hasOverride: autoName !== displayName
  };
}

function gcLabFixBestActiveComboV1(combos: any[]) {
  return [...combos]
    .filter((combo) => gcLabFixNumberV1(combo.totalLaps ?? combo.stats?.totalLaps, 0) > 0)
    .sort((a, b) =>
      gcLabFixNumberV1(b.lastSeenTimestamp ?? b.latestLap?.timestamp, 0) -
      gcLabFixNumberV1(a.lastSeenTimestamp ?? a.latestLap?.timestamp, 0) ||
      gcLabFixNumberV1(b.totalLaps ?? b.stats?.totalLaps, 0) -
      gcLabFixNumberV1(a.totalLaps ?? a.stats?.totalLaps, 0)
    )[0] || null;
}

function gcLabFixStringKeyV1(value: unknown) {
  return gcLabFixTextV1(value).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
}

function gcLabFixLapMatchesComboV1(lap: any, combo: any) {
  if (!combo) return true;

  const comboId = gcLabFixPickV1(combo, ['comboId', 'canonicalComboId', 'id']);
  const lapComboId = gcLabFixPickV1(lap, ['comboId', 'ComboId']);
  if (comboId !== undefined && comboId !== null && lapComboId !== undefined && lapComboId !== null && String(comboId) === String(lapComboId)) {
    return true;
  }

  const comboTrackId = gcLabFixPickV1(combo, ['track.id', 'trackId']);
  const lapTrackId = gcLabFixPickV1(lap, ['track.id', 'trackId', 'TrackId']);
  const trackMatchesById = comboTrackId !== undefined && comboTrackId !== null && lapTrackId !== undefined && lapTrackId !== null && String(comboTrackId) === String(lapTrackId);

  const comboTrackNames = [
    gcLabFixPickV1(combo, ['track.name', 'track.displayName', 'track.visibleName', 'track.code', 'trackName'])
  ].map(gcLabFixStringKeyV1).filter(Boolean);

  const lapTrackNames = [
    gcLabFixEntityNameV1(lap, 'track'),
    gcLabFixPickV1(lap, ['track.code', 'trackCode', 'Track'])
  ].map(gcLabFixStringKeyV1).filter(Boolean);

  const trackMatchesByName = comboTrackNames.some((name) => lapTrackNames.includes(name));

  const comboCars = Array.isArray(combo.cars) ? combo.cars : [];
  const comboCarIds = new Set(
    [
      ...(Array.isArray(combo.carIds) ? combo.carIds : []),
      ...comboCars.map((car: any) => car?.id)
    ].filter((value) => value !== undefined && value !== null).map(String)
  );
  const lapCarId = gcLabFixPickV1(lap, ['car.id', 'carId', 'CarId']);
  const carMatchesById = comboCarIds.size ? comboCarIds.has(String(lapCarId)) : true;

  const comboCarNames = comboCars
    .flatMap((car: any) => [car?.name, car?.displayName, car?.visibleName, car?.code, car?.uiName])
    .map(gcLabFixStringKeyV1)
    .filter(Boolean);

  const lapCarNames = [
    gcLabFixEntityNameV1(lap, 'car'),
    gcLabFixPickV1(lap, ['car.code', 'carCode', 'Car'])
  ].map(gcLabFixStringKeyV1).filter(Boolean);

  const carMatchesByName = comboCarNames.length ? comboCarNames.some((name: string) => lapCarNames.includes(name)) : true;

  return (trackMatchesById || trackMatchesByName) && (carMatchesById || carMatchesByName);
}

app.get('/api/gc/names/preview', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 50, 1, 200);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const sample = laps.slice(0, limit);

    const uniqueDrivers = new Map<string, any>();
    const uniqueCars = new Map<string, any>();
    const uniqueTracks = new Map<string, any>();

    for (const lap of laps.slice(0, 1000)) {
      const driver = gcLabFixNameEntityV1('driver', lap);
      const car = gcLabFixNameEntityV1('car', lap);
      const track = gcLabFixNameEntityV1('track', lap);

      uniqueDrivers.set(String(driver.id ?? driver.displayName), driver);
      uniqueCars.set(String(car.id ?? car.code ?? car.displayName), car);
      uniqueTracks.set(String(track.id ?? track.code ?? track.displayName), track);
    }

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      count: sample.length,
      diagnostics: {
        sampledRows: Math.min(laps.length, 1000),
        drivers: uniqueDrivers.size,
        cars: uniqueCars.size,
        tracks: uniqueTracks.size,
        overridesApplied: [...uniqueDrivers.values(), ...uniqueCars.values(), ...uniqueTracks.values()].filter((item: any) => item.hasOverride).length,
        samples: {
          drivers: [...uniqueDrivers.values()].slice(0, 12),
          cars: [...uniqueCars.values()].slice(0, 12),
          tracks: [...uniqueTracks.values()].slice(0, 12)
        }
      },
      items: sample.map((lap: any) => ({
        lapId: gcLabFixPickV1(lap, ['lapId', 'LapId']) ?? null,
        driver: gcLabFixNameEntityV1('driver', lap),
        car: gcLabFixNameEntityV1('car', lap),
        track: gcLabFixNameEntityV1('track', lap),
        lapTimeMs: gcLabFixLapMsV1(lap) || null,
        lapTimeFormatted: gcLabFixLapTimeV1(lap)
      })),
      message: 'Previsualización del pipeline de nombres: rawName -> autoName -> displayName.'
    });
  } catch (error) {
    console.error('[GC Data Core Lab Fixes] names preview error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      items: [],
      message: 'No se pudo generar /api/gc/names/preview.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/gc/recent-laps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 20, 1, 200);
    const scope = getQueryString(req, 'scope', 'global').toLowerCase();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const combos = buildComboStatsFromLaps(laps, comboDefinitions);
    const activeCombo = gcLabFixBestActiveComboV1(combos);
    const warnings: string[] = [];

    let filtered = [...laps];

    if (scope === 'activecombo' || scope === 'active-combo') {
      if (activeCombo) {
        filtered = laps.filter((lap: any) => gcLabFixLapMatchesComboV1(lap, activeCombo));

        if (!filtered.length) {
          warnings.push('activeCombo filter returned 0 rows; fallback to global recent laps');
          filtered = [...laps];
        }
      } else {
        warnings.push('activeCombo not detected; fallback to global recent laps');
      }
    }

    filtered = filtered
      .filter((lap: any) => gcLabFixDateMsV1(lap) > 0)
      .sort((a: any, b: any) => gcLabFixDateMsV1(b) - gcLabFixDateMsV1(a));

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      scope,
      count: Math.min(filtered.length, limit),
      totalMatched: filtered.length,
      activeCombo: activeCombo ? {
        comboId: activeCombo.comboId ?? activeCombo.canonicalComboId ?? activeCombo.id ?? null,
        track: activeCombo.track ?? null,
        cars: activeCombo.cars ?? [],
        totalLaps: activeCombo.totalLaps ?? null,
        driversCount: activeCombo.driversCount ?? null,
        lastSeenTimestamp: activeCombo.lastSeenTimestamp ?? null
      } : null,
      warnings,
      items: filtered.slice(0, limit).map(gcLabFixCompactLapV1),
      message: 'Vueltas recientes canónicas desde Race Data Core.'
    });
  } catch (error) {
    console.error('[GC Data Core Lab Fixes] recent laps error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      items: [],
      message: 'No se pudieron generar recent laps desde Race Data Core.',
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
    console.error(`[GC DATA CORE LAB FIXES] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

let next = replaceMarkedBlock(source, START, END, routeBlock);

if (next === null) {
  const recentAnchor = "app.get('/api/gc/recent-laps'";
  if (source.includes(recentAnchor)) {
    next = insertBefore(source, recentAnchor, routeBlock, 'override /api/gc/recent-laps');
  } else {
    const anchor =
      source.includes("app.get('/api/gc/leaderboard'")
        ? "app.get('/api/gc/leaderboard'"
        : source.includes("app.get('/api/gc/snapshot'")
          ? "app.get('/api/gc/snapshot'"
          : "app.get('/api/health'";
    next = insertBefore(source, anchor, routeBlock, 'Data Core lab fix routes');
  }
}

fs.writeFileSync(serverPath, next, 'utf8');
console.log('[GC DATA CORE LAB FIXES] Added/updated /api/gc/names/preview and /api/gc/recent-laps override.');
console.log('[GC DATA CORE LAB FIXES] Run: npm run build');
