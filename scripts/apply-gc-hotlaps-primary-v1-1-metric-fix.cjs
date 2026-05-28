#!/usr/bin/env node
/* GC_HOTLAPS_PRIMARY_V1_1_METRIC_FIX_APPLY
 * Fixes /hotlaps active combo metric semantics.
 * Problem: metricDrivers was counting visible/filtered rows instead of activeCombo.driversCount.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const hotlapsPath = path.join(root, 'src', 'pages', 'hotlaps.astro');

if (!fs.existsSync(hotlapsPath)) {
  console.error('[GC HOTLAPS v1.1] Missing src/pages/hotlaps.astro');
  process.exit(1);
}

let source = fs.readFileSync(hotlapsPath, 'utf8');

if (!source.includes('GC_HOTLAPS_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC HOTLAPS v1.1] Data Core Primary v1 block not found. Apply GC_Hotlaps_Data_Core_Primary_v1 first.');
  process.exit(1);
}

let patched = 0;

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) {
    console.warn(`[GC HOTLAPS v1.1] Needle not found for ${label}`);
    return;
  }
  source = source.replace(needle, replacement);
  patched += 1;
}

replaceOnce(
  "activeTrackLabel: 'Último circuito activo',\n        coreReady: false,",
  "activeTrackLabel: 'Último circuito activo',\n        activeComboDrivers: 0,\n        activeComboLaps: 0,\n        activeComboTrack: '',\n        coreReady: false,",
  "state activeCombo metrics"
);

replaceOnce(
  "const activeTrack = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName']), '');\n\n        if (activeTrack) {",
  "const activeTrack = text(pick(activeCombo, ['track.displayName','track.visibleName','track.name','trackName']), '');\n        state.activeComboDrivers = number(pick(activeCombo, ['driversCount','stats.driversCount','pilotsCount','totalDrivers']), 0);\n        state.activeComboLaps = number(pick(activeCombo, ['totalLaps','stats.totalLaps','laps']), 0);\n        state.activeComboTrack = activeTrack || '';\n\n        if (activeTrack) {",
  "detect active combo metrics"
);

replaceOnce(
  "const drivers = uniqueMap(filtered, driverName);\n        const selectedTrack = els.track?.value === 'all' ? 'Todos' : (els.track?.options[els.track.selectedIndex]?.textContent || state.activeTrackLabel);\n\n        if (els.metricTrack) els.metricTrack.textContent = selectedTrack;\n        if (els.metricTrackMeta) els.metricTrackMeta.textContent = els.track?.value === state.activeTrackValue ? 'combo activo' : 'filtro manual';",
  "const drivers = uniqueMap(filtered, driverName);\n        const selectedTrack = els.track?.value === 'all' ? 'Todos' : (els.track?.options[els.track.selectedIndex]?.textContent || state.activeTrackLabel);\n        const neutralSearch = !normalize(els.search?.value || '');\n        const neutralDriver = (els.driver?.value || 'all') === 'all';\n        const neutralCar = (els.car?.value || 'all') === 'all';\n        const activeTrackSelected = (els.track?.value || 'all') === state.activeTrackValue;\n        const isPureActiveComboView = neutralSearch && neutralDriver && neutralCar && activeTrackSelected;\n        const driverMetric = isPureActiveComboView && state.activeComboDrivers ? state.activeComboDrivers : drivers.size;\n\n        if (els.metricTrack) els.metricTrack.textContent = selectedTrack;\n        if (els.metricTrackMeta) els.metricTrackMeta.textContent = isPureActiveComboView ? `combo activo · ${state.activeComboLaps || filtered.length} vueltas` : (activeTrackSelected ? 'combo activo filtrado' : 'filtro manual');",
  "updateMetrics semantic driver count"
);

replaceOnce(
  "if (els.metricDrivers) els.metricDrivers.textContent = String(drivers.size);",
  "if (els.metricDrivers) els.metricDrivers.textContent = String(driverMetric);",
  "metric drivers active combo count"
);

replaceOnce(
  "document.documentElement.dataset.gcHotlapsDataCoreVersion = 'v1';",
  "document.documentElement.dataset.gcHotlapsDataCoreVersion = 'v1.1';",
  "dataset version"
);

replaceOnce(
  "ensureCoreBadge('ok', 'Data Core primary');",
  "ensureCoreBadge('ok', 'Data Core primary v1.1');",
  "badge version"
);

replaceOnce(
  "console.info('[GC /hotlaps Data Core Primary v1]', {",
  "console.info('[GC /hotlaps Data Core Primary v1.1]', {",
  "console info version"
);

if (patched < 4) {
  console.error(`[GC HOTLAPS v1.1] Only ${patched} patches applied. Refusing to continue to avoid partial semantic fix.`);
  process.exit(1);
}

fs.writeFileSync(hotlapsPath, source, 'utf8');
console.log(`[GC HOTLAPS v1.1] Metric semantics fixed. Patches applied: ${patched}.`);
console.log('[GC HOTLAPS v1.1] Run: npm run build');
