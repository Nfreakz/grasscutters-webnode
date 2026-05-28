#!/usr/bin/env node
/* GC_COMBO_PUBLIC_MIN_DRIVERS_ZOLDER_MERGE_V1_2_APPLY
 * Adds public combo rule: hide combos with only 1 driver.
 * Improves canonical track grouping for Zolder/Phillip Island style variants.
 * Scope: combo list/public combo aliases only. Does not change global stats/pilots/hotlaps.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC COMBO PUBLIC RULES] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('GC_COMBO_CANONICAL_PUBLIC_FILTER_V1_START')) {
  console.error('[GC COMBO PUBLIC RULES] Canonical public filter block not found. Apply canonical filter v1 first.');
  process.exit(1);
}

let patched = 0;

// 1) Add public minimum drivers constant after min car laps constant.
if (!source.includes('GC_COMBO_CANONICAL_MIN_PUBLIC_DRIVERS_V1')) {
  const needle = "const GC_COMBO_CANONICAL_MIN_PUBLIC_CAR_LAPS_V1 = Number(process.env.GC_COMBO_MIN_PUBLIC_CAR_LAPS || 5);";
  if (!source.includes(needle)) {
    console.error('[GC COMBO PUBLIC RULES] Missing min car laps constant anchor.');
    process.exit(1);
  }

  source = source.replace(
    needle,
    needle + "\nconst GC_COMBO_CANONICAL_MIN_PUBLIC_DRIVERS_V1 = Number(process.env.GC_COMBO_MIN_PUBLIC_DRIVERS || 2);"
  );
  patched += 1;
}

// 2) Improve track token cleaning: drop nrms and split compact year/online variants.
if (source.includes("const drop = new Set([") && !source.includes("'nrms', 'nrs'")) {
  source = source.replace(
    "'ks', 'rt', 'mx', 'nrs', 'acu', 'acf', 'actk', 'sim', 'track', 'circuit',",
    "'ks', 'rt', 'mx', 'nrms', 'nrs', 'acu', 'acf', 'actk', 'sim', 'track', 'circuit',"
  );
  patched += 1;
}

if (!source.includes('GC_COMBO_CANONICAL_ALIAS_MAP_V1')) {
  const aliasBlock = `
const GC_COMBO_CANONICAL_ALIAS_MAP_V1 = new Map<string, string>([
  ['zolder', 'zolder'],
  ['zolder2017', 'zolder'],
  ['zolder_2017', 'zolder'],
  ['zolder2017online', 'zolder'],
  ['zolder_2017_online', 'zolder'],
  ['nrms_zolder', 'zolder'],
  ['nrs_zolder', 'zolder'],
  ['rt_zolder', 'zolder'],
  ['circuit_zolder', 'zolder'],
  ['terlaemen', 'zolder'],

  ['phillip_island', 'phillip_island'],
  ['philip_island', 'phillip_island'],
  ['phillip_island_2013', 'phillip_island'],
  ['philip_island_2013', 'phillip_island'],
  ['phillipisland2013', 'phillip_island'],
  ['philipisland2013', 'phillip_island'],
  ['vr_phillip_island', 'phillip_island'],
  ['vr_phillip_island_2013', 'phillip_island'],

  ['mugello', 'mugello'],
  ['ks_mugello', 'mugello'],
  ['mx_mugello', 'mugello'],
  ['rt_mugello_gp', 'mugello'],

  ['sebring', 'sebring'],
  ['rt_sebring', 'sebring'],
  ['sebring2021', 'sebring'],
  ['sebring_2021', 'sebring'],

  ['hockenheim', 'hockenheim'],
  ['hockenheimring', 'hockenheim'],
  ['vhe_hockenheim', 'hockenheim'],
  ['hockenheim_gp', 'hockenheim'],

  ['spa', 'spa'],
  ['ks_spa', 'spa'],
  ['spa_francorchamps', 'spa'],

  ['brands_hatch', 'brands_hatch'],
  ['ks_brands_hatch', 'brands_hatch'],

  ['salzburgring', 'salzburgring'],
  ['suzuka', 'suzuka']
]);

function gcComboCanonicalAliasKeyV1(value: unknown) {
  const normalized = gcComboCanonicalNormalizeV1(value);
  if (!normalized) return '';
  if (GC_COMBO_CANONICAL_ALIAS_MAP_V1.has(normalized)) return GC_COMBO_CANONICAL_ALIAS_MAP_V1.get(normalized) || normalized;

  const compact = normalized.replace(/_/g, '');
  for (const [alias, canonical] of GC_COMBO_CANONICAL_ALIAS_MAP_V1.entries()) {
    const aliasCompact = alias.replace(/_/g, '');
    if (aliasCompact.length >= 5 && compact.includes(aliasCompact)) return canonical;
    if (compact.length >= 5 && aliasCompact.includes(compact)) return canonical;
  }

  return normalized;
}
`;

  const anchor = "function gcComboCanonicalCleanTrackTokensV1(value: unknown) {";
  if (!source.includes(anchor)) {
    console.error('[GC COMBO PUBLIC RULES] Missing clean track tokens anchor.');
    process.exit(1);
  }
  source = source.replace(anchor, aliasBlock + "\n" + anchor);
  patched += 1;
}

// 3) Patch clean tokens to split compact tokens like zolder2017online / phillipisland2013.
const oldTokenLine = "const tokens = raw\n    .split(/\\s+/)\n    .map((token) => token.trim())\n    .filter((token) => token && !drop.has(token));";
const newTokenLine = "const tokens = raw\n    .split(/\\s+/)\n    .flatMap((token) => {\n      const compact = token.trim();\n      if (!compact) return [];\n      return compact\n        .replace(/(zolder)(20\\d{2})?(online)?/g, '$1 ')\n        .replace(/(phill?ip)(island)(20\\d{2})?/g, 'phillip island ')\n        .replace(/(hockenheim)(ring|gp)?/g, '$1 ')\n        .replace(/(sebring)(20\\d{2})?/g, '$1 ')\n        .split(/\\s+/);\n    })\n    .map((token) => token.trim())\n    .filter((token) => token && !drop.has(token));";

if (source.includes(oldTokenLine)) {
  source = source.replace(oldTokenLine, newTokenLine);
  patched += 1;
}

// 4) Patch canonical key to use alias map.
const oldTrackKey = `function gcComboCanonicalTrackKeyV1(row: any) {
  const display = gcComboCanonicalTrackNameV1(row);
  const code = gcComboCanonicalTrackCodeV1(row);
  const displayTokens = gcComboCanonicalCleanTrackTokensV1(display);
  const codeTokens = gcComboCanonicalCleanTrackTokensV1(code);
  const tokens = displayTokens.length >= codeTokens.length ? displayTokens : codeTokens;
  return gcComboCanonicalNormalizeV1(tokens.join('_')) || gcComboCanonicalNormalizeV1(display || code);
}`;

const newTrackKey = `function gcComboCanonicalTrackKeyV1(row: any) {
  const display = gcComboCanonicalTrackNameV1(row);
  const code = gcComboCanonicalTrackCodeV1(row);
  const candidates = [
    code,
    display,
    gcComboCanonicalCleanTrackTokensV1(code).join('_'),
    gcComboCanonicalCleanTrackTokensV1(display).join('_')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const alias = gcComboCanonicalAliasKeyV1(candidate);
    if (alias && alias !== 'unknown_track') return alias;
  }

  const displayTokens = gcComboCanonicalCleanTrackTokensV1(display);
  const codeTokens = gcComboCanonicalCleanTrackTokensV1(code);
  const tokens = displayTokens.length >= codeTokens.length ? displayTokens : codeTokens;
  return gcComboCanonicalAliasKeyV1(tokens.join('_')) || gcComboCanonicalNormalizeV1(display || code);
}`;

if (source.includes(oldTrackKey)) {
  source = source.replace(oldTrackKey, newTrackKey);
  patched += 1;
} else if (!source.includes('const candidates = [')) {
  console.warn('[GC COMBO PUBLIC RULES] TrackKey exact block not found; skipped full replacement.');
}

// 5) Patch display to use alias nice title.
const oldTrackDisplay = `function gcComboCanonicalTrackDisplayV1(row: any) {
  const display = gcComboCanonicalTrackNameV1(row);
  const tokens = gcComboCanonicalCleanTrackTokensV1(display);
  const clean = tokens.length ? tokens.join(' ') : display;
  return gcComboCanonicalTitleV1(clean, 'Circuito');
}`;

const newTrackDisplay = `function gcComboCanonicalTrackDisplayV1(row: any) {
  const canonicalKey = gcComboCanonicalTrackKeyV1(row);
  if (canonicalKey && canonicalKey !== 'unknown_track') {
    return gcComboCanonicalTitleV1(canonicalKey, 'Circuito');
  }

  const display = gcComboCanonicalTrackNameV1(row);
  const tokens = gcComboCanonicalCleanTrackTokensV1(display);
  const clean = tokens.length ? tokens.join(' ') : display;
  return gcComboCanonicalTitleV1(clean, 'Circuito');
}`;

if (source.includes(oldTrackDisplay)) {
  source = source.replace(oldTrackDisplay, newTrackDisplay);
  patched += 1;
}

// 6) Add is-public helper after findById.
if (!source.includes('function gcComboCanonicalIsPublicItemV1')) {
  const helper = `
function gcComboCanonicalIsPublicItemV1(item: any) {
  const drivers = gcComboCanonicalNumberV1(item?.summary?.driversCount ?? item?.driversCount, 0);
  const laps = gcComboCanonicalNumberV1(item?.summary?.totalLaps ?? item?.totalLaps, 0);
  return drivers >= GC_COMBO_CANONICAL_MIN_PUBLIC_DRIVERS_V1 && laps > 0;
}
`;
  const anchor = "async function gcComboCanonicalReadItemsV1(strackerPath: string, sort = 'recent') {";
  if (!source.includes(anchor)) {
    console.error('[GC COMBO PUBLIC RULES] Missing read items anchor.');
    process.exit(1);
  }
  source = source.replace(anchor, helper + "\n" + anchor);
  patched += 1;
}

// 7) Filter public list only. Detail stays accessible.
source = source.replace(
  "const publicItems = items.slice(0, limit);",
  "const publicItems = items.filter(gcComboCanonicalIsPublicItemV1).slice(0, limit);"
);

// If replacement happened several times, good.
patched += 1;

// 8) Patch totalMatched/totalCombos and activeCombo metrics to public base where relevant.
source = source.replace(
  "totalMatched: items.length,",
  "totalMatched: items.filter(gcComboCanonicalIsPublicItemV1).length,"
);

source = source.replace(
  "totalCombos: items.length,",
  "totalCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,"
);

source = source.replace(
  "activeCombos: items.filter((item) => (item.summary?.totalLaps || 0) > 0).length,",
  "activeCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,"
);

source = source.replace(
  "totalLaps: items.reduce((sum, item) => sum + (item.summary?.totalLaps || 0), 0),",
  "totalLaps: items.filter(gcComboCanonicalIsPublicItemV1).reduce((sum, item) => sum + (item.summary?.totalLaps || 0), 0),"
);

// 9) Add policy min drivers where min car appears.
source = source.replaceAll(
  "minPublicCarLaps: GC_COMBO_CANONICAL_MIN_PUBLIC_CAR_LAPS_V1,",
  "minPublicCarLaps: GC_COMBO_CANONICAL_MIN_PUBLIC_CAR_LAPS_V1,\n        minPublicDrivers: GC_COMBO_CANONICAL_MIN_PUBLIC_DRIVERS_V1,"
);

source = source.replaceAll(
  "scope: 'combos-only'",
  "scope: 'combos-only'"
);

fs.writeFileSync(serverPath, source, 'utf8');

console.log(`[GC COMBO PUBLIC RULES] Applied. Patches: ${patched}.`);
console.log('[GC COMBO PUBLIC RULES] Public list now hides combos with < 2 drivers.');
console.log('[GC COMBO PUBLIC RULES] Zolder / Phillip Island / Hockenheim aliases improved.');
console.log('[GC COMBO PUBLIC RULES] Detail endpoints remain accessible for direct URLs.');
console.log('[GC COMBO PUBLIC RULES] Run: npm run build');
