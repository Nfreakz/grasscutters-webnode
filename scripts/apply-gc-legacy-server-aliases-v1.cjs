#!/usr/bin/env node
/* GC_LEGACY_SERVER_ALIASES_V1_APPLY
 * Converts legacy server API endpoints into aliases backed by Race Data Core.
 * Keeps old URLs alive, but centralizes data at server level.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_LEGACY_SERVER_ALIASES_V1_START */';
const END = '/* GC_LEGACY_SERVER_ALIASES_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC LEGACY SERVER ALIASES] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'getSafeStrackerOrRespond',
  'readJoinedLaps',
  'getCombos',
  'buildComboStatsFromLaps',
  'readDisplayNameStoreAsync',
  'getQueryNumber',
  'getQueryString',
  'lapTimeToText'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC LEGACY SERVER ALIASES] Required function not found: ${name}`);
    console.error('[GC LEGACY SERVER ALIASES] Apply after Race Data Core packs.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
function gcLegacyAliasTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcLegacyAliasNumberV1(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gcLegacyAliasValueAtV1(source: any, pathName: string) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, pathName)) return source[pathName];
  return String(pathName).split('.').reduce((acc: any, part: string) => acc == null ? undefined : acc[part], source);
}

function gcLegacyAliasPickV1(source: any, paths: string[]) {
  for (const pathName of paths) {
    const value = gcLegacyAliasValueAtV1(source, pathName);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function gcLegacyAliasNormalizeV1(value: unknown) {
  return gcLegacyAliasTextV1(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function gcLegacyAliasDriverNameV1(row: any) {
  return gcLegacyAliasTextV1(
    gcLegacyAliasPickV1(row, ['driver.displayName', 'driver.visibleName', 'driver.name', 'driverName', 'playerName', 'Name']),
    'Piloto'
  );
}

function gcLegacyAliasCarNameV1(row: any) {
  return gcLegacyAliasTextV1(
    gcLegacyAliasPickV1(row, ['car.displayName', 'car.visibleName', 'car.name', 'carName', 'uiCarName', 'Car']),
    'Coche'
  );
}

function gcLegacyAliasTrackNameV1(row: any) {
  return gcLegacyAliasTextV1(
    gcLegacyAliasPickV1(row, ['track.displayName', 'track.visibleName', 'track.name', 'trackName', 'uiTrackName', 'Track']),
    'Circuito'
  );
}

function gcLegacyAliasLapMsV1(row: any) {
  return gcLegacyAliasNumberV1(gcLegacyAliasPickV1(row, ['lapTimeMs', 'LapTime', 'timeMs', 'bestLapMs']), 0);
}

function gcLegacyAliasLapTimeV1(row: any) {
  return gcLegacyAliasTextV1(
    gcLegacyAliasPickV1(row, ['lapTimeFormatted', 'lapTimeText', 'lapTime', 'bestLapTime']),
    lapTimeToText(gcLegacyAliasLapMsV1(row)) || '--'
  );
}

function gcLegacyAliasIsValidV1(row: any) {
  const value = gcLegacyAliasPickV1(row, ['valid', 'isValid', 'Valid']);
  return !(value === 0 || value === false || value === '0' || value === 'false' || value === 'no');
}

function gcLegacyAliasDateMsV1(row: any) {
  const iso = gcLegacyAliasPickV1(row, ['timestampIso', 'dateIso', 'createdAt', 'updatedAt', 'lastSeenAt']);
  if (iso) {
    const parsed = Date.parse(String(iso));
    if (Number.isFinite(parsed)) return parsed;
  }

  const raw = gcLegacyAliasPickV1(row, ['timestamp', 'Timestamp', 'Date', 'date']);
  if (typeof raw === 'number') return raw > 20000000000 ? raw : raw * 1000;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function gcLegacyAliasSpeedV1(row: any) {
  return gcLegacyAliasNumberV1(gcLegacyAliasPickV1(row, ['maxSpeedKmh', 'MaxSpeed_KMH', 'maxSpeed']), 0);
}

function gcLegacyAliasCutsV1(row: any) {
  return gcLegacyAliasNumberV1(gcLegacyAliasPickV1(row, ['cuts', 'Cuts']), 0);
}

function gcLegacyAliasCompactLapV1(row: any, position?: number, bestMs?: number) {
  const playerId = gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']);
  const lapMs = gcLegacyAliasLapMsV1(row);
  const dateMs = gcLegacyAliasDateMsV1(row);
  const deltaMs = bestMs && lapMs ? lapMs - bestMs : 0;

  return {
    position: position ?? null,
    lapId: gcLegacyAliasPickV1(row, ['lapId', 'LapId']) ?? null,
    comboId: gcLegacyAliasPickV1(row, ['comboId', 'ComboId']) ?? null,
    playerId,
    driverId: playerId,
    driverName: gcLegacyAliasDriverNameV1(row),
    playerName: gcLegacyAliasDriverNameV1(row),
    name: gcLegacyAliasDriverNameV1(row),
    carName: gcLegacyAliasCarNameV1(row),
    trackName: gcLegacyAliasTrackNameV1(row),
    lapTimeMs: lapMs || null,
    lapTime: gcLegacyAliasLapTimeV1(row),
    lapTimeFormatted: gcLegacyAliasLapTimeV1(row),
    bestLapTime: gcLegacyAliasLapTimeV1(row),
    delta: position === 1 ? '+0.000' : deltaMs > 0 ? '+' + (deltaMs / 1000).toFixed(3) : '--',
    valid: gcLegacyAliasIsValidV1(row),
    isValid: gcLegacyAliasIsValidV1(row),
    maxSpeedKmh: gcLegacyAliasSpeedV1(row),
    maxSpeed: gcLegacyAliasSpeedV1(row),
    cuts: gcLegacyAliasCutsV1(row),
    timestamp: gcLegacyAliasPickV1(row, ['timestamp', 'Timestamp']) ?? null,
    timestampIso: dateMs ? new Date(dateMs).toISOString() : null,
    driver: row.driver ?? null,
    car: row.car ?? null,
    track: row.track ?? null,
    source: 'gc-data-core-legacy-server-alias'
  };
}

function gcLegacyAliasComboIdV1(combo: any) {
  return gcLegacyAliasPickV1(combo, ['comboId', 'canonicalComboId', 'id']);
}

function gcLegacyAliasEntityNameV1(value: any, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return gcLegacyAliasTextV1(value, fallback);
  return gcLegacyAliasTextV1(
    value.displayName ?? value.visibleName ?? value.cleanName ?? value.uiName ?? value.name ?? value.Name ?? value.code,
    fallback
  );
}

function gcLegacyAliasComboMatchesIdV1(combo: any, requestedId: string) {
  const wanted = String(requestedId);
  const ids = [
    gcLegacyAliasPickV1(combo, ['comboId']),
    gcLegacyAliasPickV1(combo, ['canonicalComboId']),
    gcLegacyAliasPickV1(combo, ['id']),
    ...(Array.isArray(combo?.memberComboIds) ? combo.memberComboIds : []),
    ...(Array.isArray(combo?.comboIds) ? combo.comboIds : [])
  ].filter((value) => value !== undefined && value !== null).map(String);

  return ids.includes(wanted);
}

function gcLegacyAliasLapMatchesComboV1(lap: any, combo: any) {
  if (!combo) return false;

  const comboIds = new Set([
    gcLegacyAliasPickV1(combo, ['comboId']),
    gcLegacyAliasPickV1(combo, ['canonicalComboId']),
    gcLegacyAliasPickV1(combo, ['id']),
    ...(Array.isArray(combo?.memberComboIds) ? combo.memberComboIds : []),
    ...(Array.isArray(combo?.comboIds) ? combo.comboIds : [])
  ].filter((value) => value !== undefined && value !== null).map(String));

  const lapComboId = gcLegacyAliasPickV1(lap, ['comboId', 'ComboId']);
  if (lapComboId !== undefined && lapComboId !== null && comboIds.has(String(lapComboId))) return true;

  const comboTrack = gcLegacyAliasNormalizeV1(
    gcLegacyAliasPickV1(combo, ['track.displayName', 'track.visibleName', 'track.name', 'trackName'])
  );
  const lapTrack = gcLegacyAliasNormalizeV1(gcLegacyAliasTrackNameV1(lap));
  const trackMatches = comboTrack && lapTrack && comboTrack === lapTrack;

  const comboCars = Array.isArray(combo?.cars) ? combo.cars : [];
  const comboCarNames = new Set(comboCars.map((car: any) => gcLegacyAliasNormalizeV1(gcLegacyAliasEntityNameV1(car))).filter(Boolean));
  const lapCar = gcLegacyAliasNormalizeV1(gcLegacyAliasCarNameV1(lap));
  const carMatches = !comboCarNames.size || comboCarNames.has(lapCar);

  return Boolean(trackMatches && carMatches);
}

function gcLegacyAliasBuildLeaderboardV1(rows: any[]) {
  const bestByDriver = new Map<string, any>();

  for (const row of rows.filter(gcLegacyAliasIsValidV1)) {
    const playerId = gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']);
    const key = String(playerId ?? gcLegacyAliasDriverNameV1(row));
    const current = bestByDriver.get(key);

    if (!current || gcLegacyAliasLapMsV1(row) < gcLegacyAliasLapMsV1(current)) {
      bestByDriver.set(key, row);
    }
  }

  const sorted = [...bestByDriver.values()]
    .filter((row) => gcLegacyAliasLapMsV1(row) > 0)
    .sort((a, b) => gcLegacyAliasLapMsV1(a) - gcLegacyAliasLapMsV1(b));

  const bestMs = sorted.length ? gcLegacyAliasLapMsV1(sorted[0]) : 0;
  return sorted.map((row, index) => gcLegacyAliasCompactLapV1(row, index + 1, bestMs));
}

function gcLegacyAliasBestActiveComboV1(combos: any[]) {
  return [...combos]
    .filter((combo) => gcLegacyAliasNumberV1(combo.totalLaps ?? combo.stats?.totalLaps, 0) > 0)
    .sort((a, b) =>
      gcLegacyAliasNumberV1(b.lastSeenTimestamp ?? b.latestLap?.timestamp, 0) -
      gcLegacyAliasNumberV1(a.lastSeenTimestamp ?? a.latestLap?.timestamp, 0) ||
      gcLegacyAliasNumberV1(b.totalLaps ?? b.stats?.totalLaps, 0) -
      gcLegacyAliasNumberV1(a.totalLaps ?? a.stats?.totalLaps, 0)
    )[0] || null;
}

function gcLegacyAliasRowsForScopeV1(laps: any[], combos: any[], scope: string) {
  const normalizedScope = gcLegacyAliasTextV1(scope, 'global').toLowerCase();
  if (normalizedScope !== 'activecombo' && normalizedScope !== 'active-combo') return laps;

  const activeCombo = gcLegacyAliasBestActiveComboV1(combos);
  if (!activeCombo) return laps;

  const rows = laps.filter((lap) => gcLegacyAliasLapMatchesComboV1(lap, activeCombo));
  return rows.length ? rows : laps;
}

function gcLegacyAliasComboCarsV1(combo: any, rows: any[]) {
  const map = new Map<string, any>();

  const inputCars = Array.isArray(combo?.cars) ? combo.cars : [];
  for (const car of inputCars) {
    const name = gcLegacyAliasEntityNameV1(car, '');
    if (!name) continue;
    const key = gcLegacyAliasNormalizeV1(name);
    map.set(key, typeof car === 'object' ? { ...car, name, displayName: name } : { name, displayName: name });
  }

  for (const row of rows) {
    const name = gcLegacyAliasCarNameV1(row);
    const key = gcLegacyAliasNormalizeV1(name);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        id: gcLegacyAliasPickV1(row, ['carId', 'car.id', 'CarId']) ?? null,
        code: gcLegacyAliasPickV1(row, ['carCode', 'car.code', 'Car']) ?? null,
        name,
        displayName: name
      });
    }
  }

  return [...map.values()];
}

function gcLegacyAliasBuildComboDetailV1(combo: any, rows: any[]) {
  const trackName = gcLegacyAliasEntityNameV1(
    gcLegacyAliasPickV1(combo, ['track', 'track.displayName', 'track.name', 'trackName']),
    rows[0] ? gcLegacyAliasTrackNameV1(rows[0]) : 'Circuito'
  );

  const cars = gcLegacyAliasComboCarsV1(combo, rows);
  const leaderboard = gcLegacyAliasBuildLeaderboardV1(rows);
  const recentLaps = [...rows]
    .sort((a, b) => gcLegacyAliasDateMsV1(b) - gcLegacyAliasDateMsV1(a))
    .slice(0, 80)
    .map((row) => gcLegacyAliasCompactLapV1(row));

  const validRows = rows.filter(gcLegacyAliasIsValidV1);
  const bestLap = leaderboard[0] || null;
  const latest = recentLaps[0] || null;
  const maxSpeed = Math.max(0, ...rows.map(gcLegacyAliasSpeedV1));
  const totalLaps = gcLegacyAliasNumberV1(combo?.totalLaps ?? combo?.stats?.totalLaps, rows.length);
  const validLaps = gcLegacyAliasNumberV1(combo?.validLaps ?? combo?.stats?.validLaps, validRows.length);
  const driversCount = gcLegacyAliasNumberV1(combo?.driversCount ?? combo?.stats?.driversCount, leaderboard.length);
  const comboId = gcLegacyAliasComboIdV1(combo);

  return {
    comboId,
    canonicalComboId: combo?.canonicalComboId ?? comboId,
    memberComboIds: Array.isArray(combo?.memberComboIds) ? combo.memberComboIds : [comboId].filter(Boolean),
    track: {
      ...(typeof combo?.track === 'object' ? combo.track : {}),
      name: trackName,
      displayName: trackName
    },
    trackName,
    cars,
    carSummary: cars.length
      ? cars.slice(0, 3).map((car: any) => gcLegacyAliasEntityNameV1(car, '')).filter(Boolean).join(' + ') + (cars.length > 3 ? ' +' + (cars.length - 3) + ' más' : '')
      : 'Sin coches detectados',
    summary: {
      totalLaps,
      validLaps,
      invalidLaps: Math.max(0, totalLaps - validLaps),
      driversCount,
      usedCarsCount: cars.length,
      bestLap,
      bestLapTime: bestLap?.lapTime ?? '--',
      maxSpeedKmh: maxSpeed,
      lastSeenAt: latest?.timestampIso ?? null,
      lastActivityAt: latest?.timestampIso ?? null,
      latestLapAt: latest?.timestampIso ?? null,
      cleanRate: totalLaps ? Math.round((validLaps / totalLaps) * 100) : 0
    },
    leaderboard,
    recentLaps,
    source: 'gc-data-core-legacy-server-alias'
  };
}

function gcLegacyAliasComboSummaryV1(combo: any) {
  const comboId = gcLegacyAliasComboIdV1(combo);
  const trackName = gcLegacyAliasEntityNameV1(
    gcLegacyAliasPickV1(combo, ['track', 'track.displayName', 'track.name', 'trackName']),
    'Circuito'
  );

  return {
    ...combo,
    comboId,
    id: comboId,
    trackName,
    track: typeof combo?.track === 'object' ? { ...combo.track, name: trackName, displayName: trackName } : { name: trackName, displayName: trackName },
    totalLaps: gcLegacyAliasNumberV1(combo.totalLaps ?? combo.stats?.totalLaps, 0),
    validLaps: gcLegacyAliasNumberV1(combo.validLaps ?? combo.stats?.validLaps, 0),
    driversCount: gcLegacyAliasNumberV1(combo.driversCount ?? combo.stats?.driversCount, 0),
    source: 'gc-data-core-legacy-server-alias'
  };
}

app.get('/api/hotlaps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 300, 1, 1000);
    const scope = getQueryString(req, 'scope', 'activeCombo');

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const combos = buildComboStatsFromLaps(laps, comboDefinitions);
    const rows = gcLegacyAliasRowsForScopeV1(laps, combos, scope);
    const leaderboard = gcLegacyAliasBuildLeaderboardV1(rows).slice(0, limit);

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/hotlaps',
      canonicalEndpoint: '/api/gc/leaderboard',
      scope,
      count: leaderboard.length,
      items: leaderboard,
      hotlaps: leaderboard,
      leaderboard
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/hotlaps error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/hotlaps',
      items: [],
      hotlaps: [],
      message: 'No se pudo resolver /api/hotlaps desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/laps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 50, 1, 1000);
    const scope = getQueryString(req, 'scope', 'global');
    const sort = getQueryString(req, 'sort', getQueryString(req, 'order', 'recent')).toLowerCase();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const combos = buildComboStatsFromLaps(laps, comboDefinitions);
    const rows = gcLegacyAliasRowsForScopeV1(laps, combos, scope)
      .filter((row) => {
        const valid = getQueryString(req, 'valid', 'all').toLowerCase();
        if (valid === 'valid') return gcLegacyAliasIsValidV1(row);
        if (valid === 'invalid') return !gcLegacyAliasIsValidV1(row);
        return true;
      })
      .sort((a, b) => {
        if (sort === 'oldest' || sort === 'asc') return gcLegacyAliasDateMsV1(a) - gcLegacyAliasDateMsV1(b);
        return gcLegacyAliasDateMsV1(b) - gcLegacyAliasDateMsV1(a);
      })
      .slice(0, limit)
      .map((row) => gcLegacyAliasCompactLapV1(row));

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/laps',
      canonicalEndpoint: '/api/gc/recent-laps',
      scope,
      count: rows.length,
      totalMatchedLaps: rows.length,
      items: rows,
      laps: rows
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/laps error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/laps',
      items: [],
      laps: [],
      message: 'No se pudo resolver /api/laps desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/combos/stats', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
    const sort = getQueryString(req, 'sort', 'recent').toLowerCase();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    let combos = buildComboStatsFromLaps(laps, comboDefinitions).map(gcLegacyAliasComboSummaryV1);

    combos = combos.sort((a: any, b: any) => {
      if (sort === 'laps') return gcLegacyAliasNumberV1(b.totalLaps, 0) - gcLegacyAliasNumberV1(a.totalLaps, 0);
      if (sort === 'drivers') return gcLegacyAliasNumberV1(b.driversCount, 0) - gcLegacyAliasNumberV1(a.driversCount, 0);
      return gcLegacyAliasNumberV1(b.lastSeenTimestamp ?? b.latestLap?.timestamp, 0) - gcLegacyAliasNumberV1(a.lastSeenTimestamp ?? a.latestLap?.timestamp, 0);
    });

    const totalLaps = combos.reduce((sum: number, combo: any) => sum + gcLegacyAliasNumberV1(combo.totalLaps, 0), 0);
    const activeCombos = combos.filter((combo: any) => gcLegacyAliasNumberV1(combo.totalLaps, 0) > 0).length;

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/combos/stats',
      canonicalEndpoint: '/api/gc/combos',
      count: Math.min(combos.length, limit),
      totalCombos: combos.length,
      activeCombos,
      totalLaps,
      items: combos.slice(0, limit),
      combos: combos.slice(0, limit),
      activeCombo: gcLegacyAliasBestActiveComboV1(combos)
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/combos/stats error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/combos/stats',
      items: [],
      combos: [],
      message: 'No se pudo resolver /api/combos/stats desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/combos/:comboId', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const requestedId = String(req.params.comboId || '').trim();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const combos = buildComboStatsFromLaps(laps, comboDefinitions);
    const combo = combos.find((entry: any) => gcLegacyAliasComboMatchesIdV1(entry, requestedId));

    if (!combo) {
      return res.status(404).json({
        ok: false,
        source: 'gc-data-core-legacy-server-alias',
        generatedAt: new Date().toISOString(),
        legacyEndpoint: '/api/combos/:comboId',
        canonicalEndpoint: '/api/gc/combos/:comboId',
        message: 'Combo no encontrado en Data Core.',
        comboId: requestedId
      });
    }

    const rows = laps.filter((lap: any) => gcLegacyAliasLapMatchesComboV1(lap, combo));
    const item = gcLegacyAliasBuildComboDetailV1(combo, rows);

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/combos/:comboId',
      canonicalEndpoint: '/api/gc/combos/:comboId',
      item,
      meta: {
        requestedComboId: requestedId,
        matchedComboId: item.comboId,
        lapsMatched: rows.length,
        totalCombos: combos.length
      }
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/combos/:comboId error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/combos/:comboId',
      item: null,
      message: 'No se pudo resolver /api/combos/:comboId desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/pilots', async (req, res) => {
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
      legacyEndpoint: '/api/pilots',
      count: items.length,
      totalDrivers: items.length,
      items,
      pilots: items
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
      message: 'No se pudo resolver /api/pilots desde Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/drivers', async (req, res) => {
  req.url = req.url.replace('/api/drivers', '/api/pilots');
  return (app as any)._router.handle(req, res);
});

app.get('/api/stats/overview', async (_req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    const combos = buildComboStatsFromLaps(laps, comboDefinitions);
    const validLaps = laps.filter(gcLegacyAliasIsValidV1).length;
    const drivers = new Set(laps.map((row: any) => String(gcLegacyAliasPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']) ?? gcLegacyAliasDriverNameV1(row))));
    const cars = new Set(laps.map(gcLegacyAliasCarNameV1));
    const tracks = new Set(laps.map(gcLegacyAliasTrackNameV1));
    const dates = laps.map(gcLegacyAliasDateMsV1).filter((value) => value > 0);

    res.json({
      ok: true,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/stats/overview',
      canonicalEndpoint: '/api/gc/diagnostics',
      totalLaps: laps.length,
      lapsCount: laps.length,
      validLaps,
      validLapsCount: validLaps,
      invalidLaps: laps.length - validLaps,
      invalidLapsCount: laps.length - validLaps,
      driversCount: drivers.size,
      carsCount: cars.size,
      tracksCount: tracks.size,
      combosCount: combos.length,
      activeCombos: combos.filter((combo: any) => gcLegacyAliasNumberV1(combo.totalLaps ?? combo.stats?.totalLaps, 0) > 0).length,
      latestLapAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      oldestLapAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null
    });
  } catch (error) {
    console.error('[GC Legacy Server Alias] /api/stats/overview error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core-legacy-server-alias',
      generatedAt: new Date().toISOString(),
      legacyEndpoint: '/api/stats/overview',
      message: 'No se pudo resolver /api/stats/overview desde Data Core.',
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
    console.error(`[GC LEGACY SERVER ALIASES] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }
  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

let next = replaceMarkedBlock(source, START, END, routeBlock);

if (next === null) {
  const anchors = [
    "app.get('/api/hotlaps'",
    'app.get("/api/hotlaps"',
    "app.get('/api/laps'",
    'app.get("/api/laps"',
    "app.get('/api/combos/stats'",
    'app.get("/api/combos/stats"',
    "app.get('/api/stats/overview'",
    'app.get("/api/stats/overview"',
    "app.get('/api/health'",
    'app.get("/api/health"'
  ];

  const anchor = anchors.find((candidate) => source.includes(candidate));
  if (!anchor) {
    console.error('[GC LEGACY SERVER ALIASES] No legacy/health anchor found.');
    process.exit(1);
  }

  next = insertBefore(source, anchor, routeBlock, 'legacy aliases');
}

fs.writeFileSync(serverPath, next, 'utf8');

console.log('[GC LEGACY SERVER ALIASES] Legacy server API aliases added before old routes.');
console.log('[GC LEGACY SERVER ALIASES] Old URLs remain alive but are backed by Race Data Core.');
console.log('[GC LEGACY SERVER ALIASES] Run: npm run build');
