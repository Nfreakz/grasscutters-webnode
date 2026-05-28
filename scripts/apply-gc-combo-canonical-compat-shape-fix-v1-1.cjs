#!/usr/bin/env node
/* GC_COMBO_CANONICAL_COMPAT_SHAPE_FIX_V1_1_APPLY
 * Adds legacy-compatible top-level fields to canonical combo items.
 * Fixes /combos showing 0 laps / 0 pilots while combo detail has data.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC COMBO COMPAT SHAPE] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('GC_COMBO_CANONICAL_PUBLIC_FILTER_V1_START')) {
  console.error('[GC COMBO COMPAT SHAPE] Canonical public filter block not found. Apply v1 first.');
  process.exit(1);
}

if (!source.includes('function gcComboCanonicalCompatShapeV1')) {
  const anchor = 'function gcComboCanonicalSortItemsV1(items: any[], sort: string) {';
  if (!source.includes(anchor)) {
    console.error('[GC COMBO COMPAT SHAPE] Could not find sort helper anchor.');
    process.exit(1);
  }
  source = source.replace(anchor, "\nfunction gcComboCanonicalCompatShapeV1(item: any) {\n  if (!item || typeof item !== 'object') return item;\n\n  const summary = item.summary || {};\n  const publicCars = Array.isArray(item.publicComboCars)\n    ? item.publicComboCars\n    : Array.isArray(item.cars)\n      ? item.cars\n      : [];\n\n  const carNames = publicCars\n    .map((car: any) => gcComboCanonicalTextV1(car?.displayName ?? car?.name ?? car?.carName ?? car?.code, ''))\n    .filter(Boolean);\n\n  const bestLap = summary.bestLap || item.bestLap || null;\n  const bestLapMs = gcComboCanonicalNumberV1(\n    bestLap?.lapTimeMs ?? bestLap?.bestLapMs ?? item.bestLapMs ?? item.bestLapTimeMs,\n    0\n  );\n\n  const bestLapTime = gcComboCanonicalTextV1(\n    bestLap?.lapTimeFormatted ??\n    bestLap?.lapTime ??\n    summary.bestLapTime ??\n    item.bestLapTimeFormatted ??\n    item.bestLapTime,\n    bestLapMs ? (lapTimeToText(bestLapMs) || '--') : '--'\n  );\n\n  const bestDriverName = gcComboCanonicalTextV1(\n    bestLap?.driverName ??\n    bestLap?.playerName ??\n    bestLap?.name ??\n    item.bestDriverName,\n    ''\n  );\n\n  const bestCarName = gcComboCanonicalTextV1(\n    bestLap?.carName ??\n    bestLap?.car?.displayName ??\n    bestLap?.car?.name ??\n    bestLap?.car ??\n    item.bestCarName ??\n    carNames[0],\n    ''\n  );\n\n  const lastSeenAt = gcComboCanonicalTextV1(\n    summary.lastSeenAt ??\n    summary.lastActivityAt ??\n    summary.latestLapAt ??\n    item.lastSeenAt ??\n    item.lastActivityAt ??\n    item.latestLapAt,\n    ''\n  );\n\n  const firstSeenAt = gcComboCanonicalTextV1(\n    summary.firstSeenAt ??\n    item.firstSeenAt ??\n    item.mainVariant?.firstSeenAt,\n    ''\n  );\n\n  const totalLaps = gcComboCanonicalNumberV1(summary.totalLaps ?? item.totalLaps, 0);\n  const validLaps = gcComboCanonicalNumberV1(summary.validLaps ?? item.validLaps, 0);\n  const invalidLaps = gcComboCanonicalNumberV1(summary.invalidLaps ?? item.invalidLaps, Math.max(0, totalLaps - validLaps));\n  const driversCount = gcComboCanonicalNumberV1(summary.driversCount ?? item.driversCount, 0);\n  const usedCarsCount = publicCars.length;\n\n  const compat = {\n    totalLaps,\n    laps: totalLaps,\n    lapCount: totalLaps,\n    validLaps,\n    validLapCount: validLaps,\n    cleanLaps: validLaps,\n    invalidLaps,\n    driversCount,\n    driverCount: driversCount,\n    pilots: driversCount,\n    usedCarsCount,\n    carsCount: usedCarsCount,\n    publicCarsCount: usedCarsCount,\n    carNames,\n    carList: carNames,\n    carModels: carNames,\n    carSummary: item.carSummary || (\n      carNames.length\n        ? carNames.slice(0, 3).join(' + ') + (carNames.length > 3 ? ' + ' + (carNames.length - 3) + ' más' : '')\n        : 'Sin coches públicos'\n    ),\n    displayTrackName: item.trackName || item.canonicalTrackName || item.track?.displayName || item.track?.name || 'Circuito',\n    trackName: item.trackName || item.canonicalTrackName || item.track?.displayName || item.track?.name || 'Circuito',\n    bestLap,\n    bestLapMs,\n    bestLapTimeMs: bestLapMs,\n    bestTimeMs: bestLapMs,\n    bestLapTime,\n    bestLapTimeFormatted: bestLapTime,\n    bestTimeFormatted: bestLapTime,\n    bestLapFormatted: bestLapTime,\n    bestDriverName,\n    fastestDriverName: bestDriverName,\n    bestCarName,\n    fastestCarName: bestCarName,\n    maxSpeedKmh: gcComboCanonicalNumberV1(summary.maxSpeedKmh ?? item.maxSpeedKmh, 0),\n    firstSeenAt,\n    firstActivityAt: firstSeenAt,\n    lastSeenAt,\n    lastActivityAt: lastSeenAt,\n    lastActivityIso: lastSeenAt,\n    latestActivityAt: lastSeenAt,\n    latestLapAt: lastSeenAt,\n    lastLapAt: lastSeenAt,\n    updatedAt: lastSeenAt,\n    cleanRate: gcComboCanonicalNumberV1(summary.cleanRate ?? item.cleanRate, totalLaps ? Math.round((validLaps / totalLaps) * 100) : 0)\n  };\n\n  return {\n    ...item,\n    ...compat,\n    summary: {\n      ...summary,\n      totalLaps,\n      validLaps,\n      invalidLaps,\n      driversCount,\n      usedCarsCount,\n      bestLap,\n      bestLapTime,\n      maxSpeedKmh: compat.maxSpeedKmh,\n      firstSeenAt,\n      lastSeenAt,\n      lastActivityAt: lastSeenAt,\n      latestLapAt: lastSeenAt,\n      cleanRate: compat.cleanRate\n    },\n    track: {\n      ...(item.track || {}),\n      name: compat.trackName,\n      displayName: compat.displayTrackName\n    }\n  };\n}\n" + '\n' + anchor);
}

let patched = 0;

function replaceAllLiteral(needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count > 0) {
    source = source.split(needle).join(replacement);
    patched += count;
    console.log(`[GC COMBO COMPAT SHAPE] Patched ${label}: ${count} occurrence(s).`);
  } else {
    console.log(`[GC COMBO COMPAT SHAPE] No occurrence for ${label}.`);
  }
}

replaceAllLiteral(
  'const items = gcComboCanonicalSortItemsV1(gcComboCanonicalBuildGroupsV1(laps), sort);',
  'const items = gcComboCanonicalSortItemsV1(gcComboCanonicalBuildGroupsV1(laps), sort).map(gcComboCanonicalCompatShapeV1);',
  'items read with sort'
);

replaceAllLiteral(
  "const { items } = await gcComboCanonicalReadItemsV1(stracker.resolvedPath, 'recent');",
  "const { items } = await gcComboCanonicalReadItemsV1(stracker.resolvedPath, 'recent');",
  'detail read no-op'
);

// Ensure read helper itself also returns compat items, if not already.
const readReturn = 'const items = gcComboCanonicalSortItemsV1(gcComboCanonicalBuildGroupsV1(laps), sort);\n  return { laps, items };';
if (source.includes(readReturn)) {
  source = source.replace(
    readReturn,
    'const items = gcComboCanonicalSortItemsV1(gcComboCanonicalBuildGroupsV1(laps), sort).map(gcComboCanonicalCompatShapeV1);\n  return { laps, items };'
  );
  patched += 1;
  console.log('[GC COMBO COMPAT SHAPE] Patched gcComboCanonicalReadItemsV1 return.');
}

// Avoid double .map if direct endpoints were already patched and read helper was patched.
source = source.replace(/\.map\(gcComboCanonicalCompatShapeV1\)\.map\(gcComboCanonicalCompatShapeV1\)/g, '.map(gcComboCanonicalCompatShapeV1)');

fs.writeFileSync(serverPath, source, 'utf8');

console.log(`[GC COMBO COMPAT SHAPE] Done. Patch count: ${patched}.`);
console.log('[GC COMBO COMPAT SHAPE] Run: npm run build');
