#!/usr/bin/env node
/* GC_DATA_CORE_NAMES_PIPELINE_V1_APPLY
 * Adds canonical name pipeline helpers for Data Core.
 * Does not remove legacy code.
 * Adds /api/gc/names/preview for diagnostics and patches /api/gc/display-names/status when present.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const HELPERS_START = '/* GC_DATA_CORE_NAMES_PIPELINE_V1_START */';
const HELPERS_END = '/* GC_DATA_CORE_NAMES_PIPELINE_V1_END */';
const ROUTE_START = '/* GC_DATA_CORE_NAMES_PREVIEW_V1_START */';
const ROUTE_END = '/* GC_DATA_CORE_NAMES_PREVIEW_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC NAMES PIPELINE] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'autoTitleFromCode',
  'buildDisplayNameCatalogItem',
  'readDisplayNameStoreAsync',
  'sanitizeDisplayNameKind'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC NAMES PIPELINE] Required function not found: ${name}`);
    console.error('[GC NAMES PIPELINE] Apply this only after the admin display-name system exists.');
    process.exit(1);
  }
}

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
    console.error(`[GC NAMES PIPELINE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

function insertAfter(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC NAMES PIPELINE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index + anchor.length) + '\n\n' + block + text.slice(index + anchor.length);
}

const helpersBlock = `
${HELPERS_START}
type GcDataCoreNameEntity = {
  kind: DisplayNameKind;
  id: number | null;
  code: string | null;
  rawName: string;
  autoName: string;
  displayName: string;
  hasOverride: boolean;
  entryId: string | null;
  notes: string | null;
  enabled: boolean;
};

function gcDataCoreNameEntity(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown, fallback = ''): GcDataCoreNameEntity {
  const safeKind = sanitizeDisplayNameKind(kind) || kind;
  const rawName =
    compactNullableText(sourceName) ||
    compactNullableText(sourceCode) ||
    compactNullableText(sourceId) ||
    fallback ||
    'unknown';

  const autoName = autoTitleFromCode(sourceName ?? sourceCode ?? rawName, fallback || rawName);
  const catalog = buildDisplayNameCatalogItem(safeKind, sourceId, sourceCode, rawName, autoName);

  return {
    kind: safeKind,
    id: numberOrNull(sourceId),
    code: compactNullableText(sourceCode),
    rawName,
    autoName,
    displayName: compactNullableText(catalog.displayName) || autoName || rawName,
    hasOverride: Boolean(catalog.hasOverride),
    entryId: catalog.entryId,
    notes: catalog.notes,
    enabled: catalog.enabled
  };
}

function gcDataCoreDriverNameEntity(row: PlainObject): GcDataCoreNameEntity {
  const raw = getRawDriverName(row);
  return gcDataCoreNameEntity('driver', row.PlayerId, row.SteamGuid, raw, raw);
}

function gcDataCoreCarNameEntity(row: PlainObject): GcDataCoreNameEntity {
  return gcDataCoreNameEntity('car', row.CarId, row.Car, getRawDisplayCar(row), 'Coche desconocido');
}

function gcDataCoreTrackNameEntity(row: PlainObject): GcDataCoreNameEntity {
  return gcDataCoreNameEntity('track', row.TrackId, row.Track, getRawDisplayTrack(row), 'Circuito desconocido');
}

function gcDataCoreApplyNamePipelineToLap(row: PlainObject) {
  const driver = gcDataCoreDriverNameEntity(row);
  const car = gcDataCoreCarNameEntity(row);
  const track = gcDataCoreTrackNameEntity(row);

  return {
    ...row,
    driver,
    car,
    track,
    driverName: driver.displayName,
    carName: car.displayName,
    trackName: track.displayName,
    driverRawName: driver.rawName,
    carRawName: car.rawName,
    trackRawName: track.rawName,
    driverAutoName: driver.autoName,
    carAutoName: car.autoName,
    trackAutoName: track.autoName
  };
}

function gcDataCoreApplyNamePipelineToLaps<T extends PlainObject>(rows: T[]) {
  return rows.map((row) => gcDataCoreApplyNamePipelineToLap(row));
}

function gcDataCoreCombosNamePipelineDiagnostics(rows: PlainObject[]) {
  const sampleRows = rows.slice(0, 200);
  const drivers = new Map<string, GcDataCoreNameEntity>();
  const cars = new Map<string, GcDataCoreNameEntity>();
  const tracks = new Map<string, GcDataCoreNameEntity>();

  for (const row of sampleRows) {
    const driver = gcDataCoreDriverNameEntity(row);
    const car = gcDataCoreCarNameEntity(row);
    const track = gcDataCoreTrackNameEntity(row);

    drivers.set(String(driver.id ?? driver.code ?? driver.rawName), driver);
    cars.set(String(car.id ?? car.code ?? car.rawName), car);
    tracks.set(String(track.id ?? track.code ?? track.rawName), track);
  }

  const entries = [...drivers.values(), ...cars.values(), ...tracks.values()];
  return {
    sampledRows: sampleRows.length,
    drivers: drivers.size,
    cars: cars.size,
    tracks: tracks.size,
    overridesApplied: entries.filter((entry) => entry.hasOverride).length,
    rawAutoDiffs: entries.filter((entry) => entry.rawName !== entry.autoName).length,
    samples: {
      drivers: [...drivers.values()].slice(0, 10),
      cars: [...cars.values()].slice(0, 10),
      tracks: [...tracks.values()].slice(0, 10)
    }
  };
}
${HELPERS_END}
`;

let replacedHelpers = replaceMarkedBlock(source, HELPERS_START, HELPERS_END, helpersBlock);
if (replacedHelpers !== null) {
  source = replacedHelpers;
} else {
  source = insertAfter(
    source,
    'function buildDisplayNameCatalogItem(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown, autoName: string, store = readDisplayNameStore()) {\n',
    '',
    'helper anchor check'
  );

  // Revert the harmless empty insertion and insert after full function by a stable following anchor.
  source = source.replace('\n\n\n  const entry = findDisplayNameEntry', '\n  const entry = findDisplayNameEntry');

  const anchor = 'function createEmptyUserStore(): AppUserStore {';
  source = insertBefore(source, anchor, helpersBlock, 'Data Core name helpers');
}

const previewRoute = `
${ROUTE_START}
app.get('/api/gc/names/preview', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    await readDisplayNameStoreAsync();

    const limit = getQueryNumber(req, 'limit', 50, 1, 200);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const sample = gcDataCoreApplyNamePipelineToLaps(laps.slice(0, limit));
    const diagnostics = gcDataCoreCombosNamePipelineDiagnostics(laps);

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      count: sample.length,
      diagnostics,
      items: sample.map((lap: any) => ({
        lapId: lap.LapId ?? lap.lapId ?? null,
        driver: lap.driver,
        car: lap.car,
        track: lap.track,
        lapTimeMs: lap.LapTime ?? lap.lapTimeMs ?? null,
        lapTimeFormatted: lapTimeToText(lap.LapTime ?? lap.lapTimeMs)
      })),
      message: 'Previsualización del pipeline de nombres: rawName -> autoName -> displayName.'
    });
  } catch (error) {
    console.error('[GC Data Core] Error generando /api/gc/names/preview:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      items: [],
      message: 'No se pudo generar la previsualización del pipeline de nombres.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${ROUTE_END}
`;

let replacedRoute = replaceMarkedBlock(source, ROUTE_START, ROUTE_END, previewRoute);
if (replacedRoute !== null) {
  source = replacedRoute;
} else {
  const anchor =
    source.includes("app.get('/api/gc/display-names/status'")
      ? "app.get('/api/gc/display-names/status'"
      : source.includes("app.get('/api/gc/snapshot'")
        ? "app.get('/api/gc/snapshot'"
        : "app.get('/api/health'";
  source = insertBefore(source, anchor, previewRoute, '/api/gc/names/preview');
}

// Strengthen display-name status route if it exists from previous pack.
if (source.includes("app.get('/api/gc/display-names/status'") && !source.includes('pipeline: {')) {
  source = source.replace(
    "message: 'Display-name overrides cargados para Data Core.'",
    "pipeline: {\n        order: ['rawName', 'autoName', 'displayName'],\n        automaticCleaner: 'autoTitleFromCode',\n        adminOverride: 'applyDisplayName / gc_display_names',\n        previewEndpoint: '/api/gc/names/preview'\n      },\n      message: 'Display-name overrides cargados para Data Core.'"
  );
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC NAMES PIPELINE] Done. Added helpers and /api/gc/names/preview.');
console.log('[GC NAMES PIPELINE] Run: npm run build');
