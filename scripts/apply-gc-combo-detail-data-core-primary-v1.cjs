#!/usr/bin/env node
/* GC_COMBO_DETAIL_DATA_CORE_PRIMARY_V1_APPLY
 * Adds canonical /api/gc/combos/:comboId and makes /combos/[comboId] fetch it first.
 * Legacy /api/combos/:comboId remains fallback.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const comboDetailPath = path.join(root, 'src', 'pages', 'combos', '[comboId].astro');

const START = '/* GC_COMBO_DETAIL_DATA_CORE_PRIMARY_V1_START */';
const END = '/* GC_COMBO_DETAIL_DATA_CORE_PRIMARY_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC COMBO DETAIL CORE] Missing src/server/index.ts');
  process.exit(1);
}

if (!fs.existsSync(comboDetailPath)) {
  console.error('[GC COMBO DETAIL CORE] Missing src/pages/combos/[comboId].astro');
  process.exit(1);
}

let server = fs.readFileSync(serverPath, 'utf8');

const required = [
  'getSafeStrackerOrRespond',
  'readJoinedLaps',
  'getCombos',
  'buildComboStatsFromLaps',
  'readDisplayNameStoreAsync',
  'lapTimeToText'
];

for (const name of required) {
  if (!server.includes(name)) {
    console.error(`[GC COMBO DETAIL CORE] Required function not found: ${name}`);
    console.error('[GC COMBO DETAIL CORE] Apply after Race Data Core packs.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
function gcComboDetailTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcComboDetailNumberV1(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gcComboDetailValueAtV1(source: any, pathName: string) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, pathName)) return source[pathName];
  return String(pathName).split('.').reduce((acc: any, part: string) => acc == null ? undefined : acc[part], source);
}

function gcComboDetailPickV1(source: any, paths: string[]) {
  for (const pathName of paths) {
    const value = gcComboDetailValueAtV1(source, pathName);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function gcComboDetailNormalizeKeyV1(value: unknown) {
  return gcComboDetailTextV1(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function gcComboDetailEntityNameV1(value: any, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return gcComboDetailTextV1(value, fallback);
  return gcComboDetailTextV1(
    value.displayName ?? value.visibleName ?? value.cleanName ?? value.uiName ?? value.name ?? value.Name ?? value.code,
    fallback
  );
}

function gcComboDetailTrackNameV1(row: any) {
  return gcComboDetailTextV1(
    gcComboDetailPickV1(row, ['track.displayName', 'track.visibleName', 'track.name', 'trackName', 'uiTrackName', 'Track']),
    'Circuito'
  );
}

function gcComboDetailCarNameV1(row: any) {
  return gcComboDetailTextV1(
    gcComboDetailPickV1(row, ['car.displayName', 'car.visibleName', 'car.name', 'carName', 'uiCarName', 'Car']),
    'Coche'
  );
}

function gcComboDetailDriverNameV1(row: any) {
  return gcComboDetailTextV1(
    gcComboDetailPickV1(row, ['driver.displayName', 'driver.visibleName', 'driver.name', 'driverName', 'playerName', 'Name']),
    'Piloto'
  );
}

function gcComboDetailLapMsV1(row: any) {
  return gcComboDetailNumberV1(gcComboDetailPickV1(row, ['lapTimeMs', 'LapTime', 'timeMs']), 0);
}

function gcComboDetailLapTimeV1(row: any) {
  return gcComboDetailTextV1(
    gcComboDetailPickV1(row, ['lapTimeFormatted', 'lapTimeText', 'lapTime']),
    lapTimeToText(gcComboDetailLapMsV1(row)) || '--'
  );
}

function gcComboDetailIsValidV1(row: any) {
  const value = gcComboDetailPickV1(row, ['valid', 'isValid', 'Valid']);
  return !(value === 0 || value === false || value === '0' || value === 'false' || value === 'no');
}

function gcComboDetailDateMsV1(row: any) {
  const iso = gcComboDetailPickV1(row, ['timestampIso', 'dateIso', 'createdAt', 'updatedAt', 'lastSeenAt']);
  if (iso) {
    const parsed = Date.parse(String(iso));
    if (Number.isFinite(parsed)) return parsed;
  }

  const raw = gcComboDetailPickV1(row, ['timestamp', 'Timestamp', 'Date', 'date']);
  if (typeof raw === 'number') return raw > 20000000000 ? raw : raw * 1000;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function gcComboDetailSpeedV1(row: any) {
  return gcComboDetailNumberV1(gcComboDetailPickV1(row, ['maxSpeedKmh', 'MaxSpeed_KMH', 'maxSpeed']), 0);
}

function gcComboDetailCutsV1(row: any) {
  return gcComboDetailNumberV1(gcComboDetailPickV1(row, ['cuts', 'Cuts']), 0);
}

function gcComboDetailCompactLapV1(row: any, position?: number, bestMs?: number) {
  const playerId = gcComboDetailPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']);
  const lapMs = gcComboDetailLapMsV1(row);
  const dateMs = gcComboDetailDateMsV1(row);
  const deltaMs = bestMs && lapMs ? lapMs - bestMs : 0;

  return {
    position: position ?? null,
    lapId: gcComboDetailPickV1(row, ['lapId', 'LapId']) ?? null,
    comboId: gcComboDetailPickV1(row, ['comboId', 'ComboId']) ?? null,
    playerId,
    driverId: playerId,
    driverName: gcComboDetailDriverNameV1(row),
    playerName: gcComboDetailDriverNameV1(row),
    carName: gcComboDetailCarNameV1(row),
    trackName: gcComboDetailTrackNameV1(row),
    lapTimeMs: lapMs || null,
    lapTime: gcComboDetailLapTimeV1(row),
    lapTimeFormatted: gcComboDetailLapTimeV1(row),
    delta: position === 1 ? '+0.000' : deltaMs > 0 ? '+' + (deltaMs / 1000).toFixed(3) : '--',
    valid: gcComboDetailIsValidV1(row),
    isValid: gcComboDetailIsValidV1(row),
    maxSpeedKmh: gcComboDetailSpeedV1(row),
    cuts: gcComboDetailCutsV1(row),
    timestamp: gcComboDetailPickV1(row, ['timestamp', 'Timestamp']) ?? null,
    timestampIso: dateMs ? new Date(dateMs).toISOString() : null,
    driver: row.driver ?? null,
    car: row.car ?? null,
    track: row.track ?? null
  };
}

function gcComboDetailComboIdV1(combo: any) {
  return gcComboDetailPickV1(combo, ['comboId', 'canonicalComboId', 'id']);
}

function gcComboDetailComboMatchesIdV1(combo: any, requestedId: string) {
  const wanted = String(requestedId);
  const ids = [
    gcComboDetailPickV1(combo, ['comboId']),
    gcComboDetailPickV1(combo, ['canonicalComboId']),
    gcComboDetailPickV1(combo, ['id']),
    ...(Array.isArray(combo?.memberComboIds) ? combo.memberComboIds : []),
    ...(Array.isArray(combo?.comboIds) ? combo.comboIds : [])
  ].filter((value) => value !== undefined && value !== null).map(String);

  return ids.includes(wanted);
}

function gcComboDetailLapMatchesComboV1(lap: any, combo: any) {
  if (!combo) return false;

  const comboIds = new Set([
    gcComboDetailPickV1(combo, ['comboId']),
    gcComboDetailPickV1(combo, ['canonicalComboId']),
    gcComboDetailPickV1(combo, ['id']),
    ...(Array.isArray(combo?.memberComboIds) ? combo.memberComboIds : []),
    ...(Array.isArray(combo?.comboIds) ? combo.comboIds : [])
  ].filter((value) => value !== undefined && value !== null).map(String));

  const lapComboId = gcComboDetailPickV1(lap, ['comboId', 'ComboId']);
  if (lapComboId !== undefined && lapComboId !== null && comboIds.has(String(lapComboId))) return true;

  const comboTrack = gcComboDetailNormalizeKeyV1(
    gcComboDetailPickV1(combo, ['track.displayName', 'track.visibleName', 'track.name', 'trackName'])
  );
  const lapTrack = gcComboDetailNormalizeKeyV1(gcComboDetailTrackNameV1(lap));
  const trackMatches = comboTrack && lapTrack && comboTrack === lapTrack;

  const comboCars = Array.isArray(combo?.cars) ? combo.cars : [];
  const comboCarNames = new Set(comboCars.map((car: any) => gcComboDetailNormalizeKeyV1(gcComboDetailEntityNameV1(car))).filter(Boolean));
  const lapCar = gcComboDetailNormalizeKeyV1(gcComboDetailCarNameV1(lap));
  const carMatches = !comboCarNames.size || comboCarNames.has(lapCar);

  return Boolean(trackMatches && carMatches);
}

function gcComboDetailCarsV1(combo: any, laps: any[]) {
  const map = new Map<string, any>();

  const inputCars = Array.isArray(combo?.cars) ? combo.cars : [];
  for (const car of inputCars) {
    const name = gcComboDetailEntityNameV1(car, '');
    if (!name) continue;
    const key = gcComboDetailNormalizeKeyV1(name);
    map.set(key, typeof car === 'object' ? { ...car, name } : { name });
  }

  for (const lap of laps) {
    const name = gcComboDetailCarNameV1(lap);
    const key = gcComboDetailNormalizeKeyV1(name);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        id: gcComboDetailPickV1(lap, ['carId', 'car.id', 'CarId']) ?? null,
        code: gcComboDetailPickV1(lap, ['carCode', 'car.code', 'Car']) ?? null,
        name,
        displayName: name
      });
    }
  }

  return [...map.values()];
}

function gcComboDetailTop10AverageV1(rows: any[]) {
  const times = rows
    .filter(gcComboDetailIsValidV1)
    .map(gcComboDetailLapMsV1)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)
    .slice(0, 10);

  if (!times.length) return '--';
  const avg = Math.round(times.reduce((sum, value) => sum + value, 0) / times.length);
  return lapTimeToText(avg) || '--';
}

function gcComboDetailBuildLeaderboardV1(rows: any[]) {
  const bestByDriver = new Map<string, any>();

  for (const row of rows.filter(gcComboDetailIsValidV1)) {
    const playerId = gcComboDetailPickV1(row, ['playerId', 'driverId', 'driver.id', 'PlayerId']);
    const key = String(playerId ?? gcComboDetailDriverNameV1(row));
    const current = bestByDriver.get(key);
    if (!current || gcComboDetailLapMsV1(row) < gcComboDetailLapMsV1(current)) {
      bestByDriver.set(key, row);
    }
  }

  const sorted = [...bestByDriver.values()]
    .filter((row) => gcComboDetailLapMsV1(row) > 0)
    .sort((a, b) => gcComboDetailLapMsV1(a) - gcComboDetailLapMsV1(b));

  const bestMs = sorted.length ? gcComboDetailLapMsV1(sorted[0]) : 0;
  return sorted.slice(0, 100).map((row, index) => gcComboDetailCompactLapV1(row, index + 1, bestMs));
}

function gcComboDetailBuildItemV1(combo: any, rows: any[]) {
  const trackName = gcComboDetailEntityNameV1(
    gcComboDetailPickV1(combo, ['track', 'track.displayName', 'track.name', 'trackName']),
    rows[0] ? gcComboDetailTrackNameV1(rows[0]) : 'Circuito'
  );

  const cars = gcComboDetailCarsV1(combo, rows);
  const leaderboard = gcComboDetailBuildLeaderboardV1(rows);
  const recentLaps = [...rows]
    .sort((a, b) => gcComboDetailDateMsV1(b) - gcComboDetailDateMsV1(a))
    .slice(0, 80)
    .map((row) => gcComboDetailCompactLapV1(row));

  const validRows = rows.filter(gcComboDetailIsValidV1);
  const bestLap = leaderboard[0] || null;
  const latest = recentLaps[0] || null;
  const maxSpeed = Math.max(0, ...rows.map(gcComboDetailSpeedV1));
  const totalLaps = gcComboDetailNumberV1(combo?.totalLaps ?? combo?.stats?.totalLaps, rows.length);
  const validLaps = gcComboDetailNumberV1(combo?.validLaps ?? combo?.stats?.validLaps, validRows.length);
  const driversCount = gcComboDetailNumberV1(combo?.driversCount ?? combo?.stats?.driversCount, leaderboard.length);
  const comboId = gcComboDetailComboIdV1(combo);

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
      ? cars.slice(0, 3).map((car: any) => gcComboDetailEntityNameV1(car, '')).filter(Boolean).join(' + ') + (cars.length > 3 ? ' +' + (cars.length - 3) + ' más' : '')
      : 'Sin coches detectados',
    summary: {
      totalLaps,
      validLaps,
      invalidLaps: Math.max(0, totalLaps - validLaps),
      driversCount,
      usedCarsCount: cars.length,
      bestLap,
      bestLapTime: bestLap?.lapTime ?? '--',
      best10Average: gcComboDetailTop10AverageV1(rows),
      maxSpeedKmh: maxSpeed,
      lastSeenAt: latest?.timestampIso ?? null,
      lastActivityAt: latest?.timestampIso ?? null,
      latestLapAt: latest?.timestampIso ?? null,
      cleanRate: totalLaps ? Math.round((validLaps / totalLaps) * 100) : 0
    },
    leaderboard,
    recentLaps,
    source: 'gc-data-core'
  };
}

app.get('/api/gc/combos/:comboId', async (req, res) => {
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
    const combo = combos.find((entry: any) => gcComboDetailComboMatchesIdV1(entry, requestedId));

    if (!combo) {
      return res.status(404).json({
        ok: false,
        source: 'gc-data-core',
        generatedAt: new Date().toISOString(),
        message: 'Combo no encontrado en Race Data Core.',
        comboId: requestedId
      });
    }

    const rows = laps.filter((lap: any) => gcComboDetailLapMatchesComboV1(lap, combo));
    const item = gcComboDetailBuildItemV1(combo, rows);

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      item,
      meta: {
        requestedComboId: requestedId,
        matchedComboId: item.comboId,
        lapsMatched: rows.length,
        totalCombos: combos.length,
        endpoint: '/api/gc/combos/:comboId'
      },
      message: 'Ficha de combo generada desde Race Data Core.'
    });
  } catch (error) {
    console.error('[GC Combo Detail Data Core] detail error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      item: null,
      message: 'No se pudo generar la ficha del combo desde Race Data Core.',
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
    console.error(`[GC COMBO DETAIL CORE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }
  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

let nextServer = replaceMarkedBlock(server, START, END, routeBlock);

if (nextServer === null) {
  const anchor =
    server.includes("app.get('/api/gc/combos'")
      ? "app.get('/api/gc/combos'"
      : server.includes("app.get('/api/gc/leaderboard'")
        ? "app.get('/api/gc/leaderboard'"
        : server.includes("app.get('/api/gc/snapshot'")
          ? "app.get('/api/gc/snapshot'"
          : "app.get('/api/health'";
  nextServer = insertBefore(server, anchor, routeBlock, '/api/gc/combos/:comboId');
}

fs.writeFileSync(serverPath, nextServer, 'utf8');

let page = fs.readFileSync(comboDetailPath, 'utf8');

// Patch fetch inside load().
const oldFetch = "const response = await fetch(`/api/combos/${encodeURIComponent(comboId)}`, { credentials:'same-origin', cache:'no-store' });\n        const data = await response.json();\n        if (!data.ok || !data.item) throw new Error(data.message || 'Combo no encontrado');";

const newFetch = `let response = await fetch(\`/api/gc/combos/\${encodeURIComponent(comboId)}\`, { credentials:'same-origin', cache:'no-store' });
        let data = await response.json();

        if (!data.ok || !data.item) {
          console.warn('[GC combo detail Data Core primary] fallback legacy', data?.message || data);
          response = await fetch(\`/api/combos/\${encodeURIComponent(comboId)}\`, { credentials:'same-origin', cache:'no-store' });
          data = await response.json();
        }

        if (!data.ok || !data.item) throw new Error(data.message || 'Combo no encontrado');

        document.documentElement.dataset.gcComboDetailDataCore = data.source === 'gc-data-core' ? 'primary' : 'legacy-fallback';
        document.documentElement.dataset.gcComboDetailDataCoreVersion = 'v1';`;

if (page.includes(oldFetch)) {
  page = page.replace(oldFetch, newFetch);
} else if (!page.includes('gcComboDetailDataCore')) {
  console.warn('[GC COMBO DETAIL CORE] Exact fetch block not found; adding marker only.');
}

// Add console source info if not present.
if (!page.includes('[GC combo detail Data Core primary] loaded')) {
  page = page.replace(
    "console.info('[GC combo detail layout v5.4]', {",
    "console.info('[GC combo detail Data Core primary] loaded', { source: data.source || 'legacy', comboId: item.comboId });\n\n        console.info('[GC combo detail layout v5.4]', {"
  );
}

fs.writeFileSync(comboDetailPath, page, 'utf8');

console.log('[GC COMBO DETAIL CORE] Added /api/gc/combos/:comboId and patched combo detail page.');
console.log('[GC COMBO DETAIL CORE] Run: npm run build');
