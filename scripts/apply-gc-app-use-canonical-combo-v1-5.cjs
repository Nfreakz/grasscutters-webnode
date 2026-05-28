#!/usr/bin/env node
/* GC_APP_USE_CANONICAL_COMBO_V1_5_APPLY
 * Fixes /app panel still showing raw snapshot combo data:
 * - Estado: "2 combos"
 * - 6 cars instead of canonical public 5 cars
 *
 * /app Data Core Primary will now fetch /api/gc/combos and use the first canonical public combo
 * for the visible combo card, while keeping /api/gc/snapshot for global server totals/readout.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(appPath)) {
  console.error('[GC APP CANONICAL COMBO] Missing src/pages/app.astro');
  process.exit(1);
}

let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes('GC_APP_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC APP CANONICAL COMBO] Data Core Primary block not found.');
  process.exit(1);
}

let patched = 0;

// 1) Make comboCars prefer public canonical car fields.
const oldComboCars = `const comboCars = (combo) => {
        const raw = pick(combo, ['cars','carList','availableCars','comboCars']);
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,|;]/g) : []);
        const seen = new Set();
        return arr.map((car) => text(car, '')).filter(Boolean).filter((name) => {
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };`;

const newComboCars = `const comboCars = (combo) => {
        const raw = pick(combo, [
          'publicComboCars',
          'carNames',
          'carList',
          'cars',
          'availableCars',
          'comboCars',
          'mainVariantAllCars'
        ]);
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,|;]/g) : []);
        const seen = new Set();
        return arr.map((car) => text(car, '')).filter(Boolean).filter((name) => {
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };`;

if (source.includes(oldComboCars)) {
  source = source.replace(oldComboCars, newComboCars);
  patched += 1;
} else {
  console.warn('[GC APP CANONICAL COMBO] comboCars block not matched; skipping cars preference patch.');
}

// 2) Add helpers after comboUrl.
if (!source.includes('function gcAppCanonicalComboFromCombosV1')) {
  const anchor = "const comboUrl = (combo) => combo?.url || (comboId(combo) != null ? `/combos/${encodeURIComponent(comboId(combo))}` : '/combos');";
  if (!source.includes(anchor)) {
    console.error('[GC APP CANONICAL COMBO] comboUrl anchor not found.');
    process.exit(1);
  }

  const helper = `${anchor}

      function gcAppCanonicalComboFromCombosV1(combosData) {
        const rows = list(combosData).filter(Boolean);
        if (!rows.length) return null;

        return [...rows].sort((a, b) => {
          const aLast = dateMs(pick(a, ['lastSeenAt','lastActivityAt','latestLapAt','summary.lastSeenAt','summary.lastActivityAt']));
          const bLast = dateMs(pick(b, ['lastSeenAt','lastActivityAt','latestLapAt','summary.lastSeenAt','summary.lastActivityAt']));
          if (bLast !== aLast) return bLast - aLast;
          return number(pick(b, ['totalLaps','summary.totalLaps']), 0) - number(pick(a, ['totalLaps','summary.totalLaps']), 0);
        })[0] || null;
      }

      function gcAppComboDisplayStateV1(combo) {
        const variants = number(pick(combo, ['variantsCount','summary.variantsCount']), 0);
        const hiddenCars = number(pick(combo, ['hiddenLowLapCarsCount','summary.hiddenLowLapCarsCount']), 0);
        if (hiddenCars > 0) return 'Filtrado';
        if (variants > 1) return 'Canónico';
        return 'Activo';
      }`;

  source = source.replace(anchor, helper);
  patched += 1;
}

// 3) Change renderCore signature.
source = source.replace(
  'function renderCore(snapshotData, leaderboardData, recentData) {',
  'function renderCore(snapshotData, leaderboardData, recentData, combosData) {'
);
patched += 1;

// 4) Replace activeCombo source block.
const oldActive = `const activeCombo = snapshot.activeCombo || snapshot.combo || {};
        const leaderboard = list(leaderboardData);
        const recent = list(recentData);
        const bestLap = activeCombo.bestLap || leaderboard[0] || snapshot.bestLap || {};
        const latestLap = activeCombo.latestLap || recent[0] || snapshot.latestLap || {};
        const cars = comboCars(activeCombo).slice(0, 10);
        const track = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName']), trackName(latestLap));`;

const newActive = `const snapshotCombo = snapshot.activeCombo || snapshot.combo || {};
        const canonicalCombo = gcAppCanonicalComboFromCombosV1(combosData);
        const activeCombo = canonicalCombo || snapshotCombo;
        const leaderboard = list(leaderboardData);
        const recent = list(recentData);
        const bestLap = activeCombo.bestLap || activeCombo.summary?.bestLap || leaderboard[0] || snapshot.bestLap || {};
        const latestLap = activeCombo.latestLap || recent[0] || snapshot.latestLap || {};
        const cars = comboCars(activeCombo).slice(0, 10);
        const track = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName','canonicalTrackName','displayTrackName']), trackName(latestLap));`;

if (source.includes(oldActive)) {
  source = source.replace(oldActive, newActive);
  patched += 1;
} else {
  console.warn('[GC APP CANONICAL COMBO] activeCombo block not matched; skipping active combo source patch.');
}

// 5) Prefer summary fields and public state in card.
source = source.replace(
  "setText('gcComboLaps', formatNumber(pick(activeCombo, ['totalLaps','stats.totalLaps','laps'])));",
  "setText('gcComboLaps', formatNumber(pick(activeCombo, ['totalLaps','summary.totalLaps','stats.totalLaps','laps'])));"
);

source = source.replace(
  "setText('gcComboDrivers', formatNumber(pick(activeCombo, ['driversCount','stats.driversCount','pilotsCount'])));",
  "setText('gcComboDrivers', formatNumber(pick(activeCombo, ['driversCount','summary.driversCount','stats.driversCount','pilotsCount'])));"
);

source = source.replace(
  "setText('gcComboFamily', number(pick(activeCombo, ['mergedCombosCount']), 1) > 1 ? `${number(pick(activeCombo, ['mergedCombosCount']), 1)} combos` : 'Activo');",
  "setText('gcComboFamily', gcAppComboDisplayStateV1(activeCombo));"
);
patched += 3;

// 6) Fetch combos canonical in loadPrimary.
const oldPromiseBlock = `const [snapshot, leaderboard, recent] = await Promise.all([
            fetchCoreJson('/api/gc/snapshot?scope=activeCombo&limit=12'),
            fetchCoreJson('/api/gc/leaderboard?scope=activeCombo&limit=20'),
            fetchCoreJson('/api/gc/recent-laps?scope=activeCombo&limit=12')
          ]);
          renderCore(snapshot, leaderboard, recent);`;

const newPromiseBlock = `const [snapshot, leaderboard, recent, combos] = await Promise.all([
            fetchCoreJson('/api/gc/snapshot?scope=activeCombo&limit=12'),
            fetchCoreJson('/api/gc/leaderboard?scope=activeCombo&limit=20'),
            fetchCoreJson('/api/gc/recent-laps?scope=activeCombo&limit=12'),
            fetchCoreJson('/api/gc/combos?limit=1&sort=recent').catch(() => null)
          ]);
          renderCore(snapshot, leaderboard, recent, combos);`;

if (source.includes(oldPromiseBlock)) {
  source = source.replace(oldPromiseBlock, newPromiseBlock);
  patched += 1;
} else {
  console.warn('[GC APP CANONICAL COMBO] Promise block not matched; skipping fetch combos patch.');
}

// 7) Extend debug payload.
source = source.replace(
  "lastGoodPayload = { snapshot: snapshotData, leaderboard: leaderboardData, recent: recentData, renderedAt: new Date().toISOString() };",
  "lastGoodPayload = { snapshot: snapshotData, leaderboard: leaderboardData, recent: recentData, combos: combosData, renderedAt: new Date().toISOString() };"
);

source = source.replace(
  "console.info('[GC /app Data Core Primary v1]', { stats, activeCombo, leaderboard: leaderboard.length, recent: recent.length });",
  "console.info('[GC /app Data Core Primary v1.5 canonical combo]', { stats, activeCombo, canonicalCombo: Boolean(canonicalCombo), cars: cars.length, leaderboard: leaderboard.length, recent: recent.length });"
);

patched += 2;

// 8) Marker script for runtime status.
if (!source.includes('GC_APP_CANONICAL_COMBO_V1_5_MARKER')) {
  const marker = `
  <script is:inline>
    /* GC_APP_CANONICAL_COMBO_V1_5_MARKER */
    (() => {
      document.documentElement.dataset.gcAppCanonicalCombo = 'v1.5';
    })();
  </script>
`;
  const idx = source.lastIndexOf('</AppLayout>');
  if (idx !== -1) {
    source = source.slice(0, idx) + marker + '\n' + source.slice(idx);
    patched += 1;
  }
}

fs.writeFileSync(appPath, source, 'utf8');

console.log(`[GC APP CANONICAL COMBO] Applied. Patches: ${patched}.`);
console.log('[GC APP CANONICAL COMBO] /app combo card now reads canonical /api/gc/combos for visible combo/cars.');
console.log('[GC APP CANONICAL COMBO] Snapshot remains source for global server totals.');
console.log('[GC APP CANONICAL COMBO] Run: npm run build');
