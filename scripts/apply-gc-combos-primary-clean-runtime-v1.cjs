#!/usr/bin/env node
/* GC_COMBOS_PRIMARY_CLEAN_RUNTIME_V1_APPLY
 * Cleans /combos temporary runtime guard after legacy server aliases are green.
 * Removes GCCombosLegacyNetworkCut script from /combos.
 * Keeps Combos Data Core Primary loader, GCTrackImages fuzzy resolver and server aliases untouched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const combosPath = path.join(root, 'src', 'pages', 'combos.astro');

if (!fs.existsSync(combosPath)) {
  console.error('[GC COMBOS PRIMARY CLEAN] Missing src/pages/combos.astro');
  process.exit(1);
}

let source = fs.readFileSync(combosPath, 'utf8');

if (!source.includes('GC_COMBOS_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC COMBOS PRIMARY CLEAN] Data Core Primary block not found. Refusing to clean.');
  process.exit(1);
}

const blocks = [
  ['/* GC_COMBOS_LEGACY_NETWORK_CUT_V1_START */', '/* GC_COMBOS_LEGACY_NETWORK_CUT_V1_END */', 'Combos Legacy Network Cut']
];

let removed = 0;

function removeMarkedScript(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    console.log(`[GC COMBOS PRIMARY CLEAN] ${label}: not present`);
    return text;
  }

  const scriptStart = text.lastIndexOf('<script', start);
  const scriptEnd = text.indexOf('</script>', end);

  if (scriptStart !== -1 && scriptEnd !== -1) {
    removed += 1;
    console.log(`[GC COMBOS PRIMARY CLEAN] Removed ${label}`);
    return text.slice(0, scriptStart) + text.slice(scriptEnd + '</script>'.length);
  }

  removed += 1;
  console.log(`[GC COMBOS PRIMARY CLEAN] Removed marker body for ${label}`);
  return text.slice(0, start) + text.slice(end + endMarker.length);
}

for (const [start, end, label] of blocks) {
  source = removeMarkedScript(source, start, end, label);
}

const markerStart = '/* GC_COMBOS_PRIMARY_CLEAN_RUNTIME_V1_START */';
const markerEnd = '/* GC_COMBOS_PRIMARY_CLEAN_RUNTIME_V1_END */';

const markerScript = `
  <script is:inline>
    ${markerStart}
    (() => {
      document.documentElement.dataset.gcCombosRuntime = 'data-core-primary-clean-v1';
      window.GCCombosRuntimeStatus = () => ({
        runtime: document.documentElement.dataset.gcCombosRuntime,
        dataCore: document.documentElement.dataset.gcCombosDataCore || null,
        dataCoreVersion: document.documentElement.dataset.gcCombosDataCoreVersion || null,
        legacyNetworkCut: Boolean(window.GCCombosLegacyNetworkCut),
        trackImages: window.GCTrackImages?.version || null
      });
      console.info('[GC /combos Runtime] Data Core primary clean v1');
    })();
    ${markerEnd}
  </script>
`;

function replaceOrInsertMarker(text) {
  const start = text.indexOf(markerStart);
  const end = text.indexOf(markerEnd);

  if (start !== -1 && end !== -1 && end > start) {
    const scriptStart = text.lastIndexOf('<script', start);
    const scriptEnd = text.indexOf('</script>', end);
    if (scriptStart !== -1 && scriptEnd !== -1) {
      return text.slice(0, scriptStart) + markerScript + text.slice(scriptEnd + '</script>'.length);
    }
  }

  const anchor = '</AppLayout>';
  const idx = text.lastIndexOf(anchor);
  if (idx === -1) {
    console.warn('[GC COMBOS PRIMARY CLEAN] Missing </AppLayout>; marker not inserted.');
    return text;
  }

  return text.slice(0, idx) + markerScript + '\n' + text.slice(idx);
}

source = replaceOrInsertMarker(source);

fs.writeFileSync(combosPath, source, 'utf8');

console.log(`[GC COMBOS PRIMARY CLEAN] Done. Removed temporary blocks: ${removed}.`);
console.log('[GC COMBOS PRIMARY CLEAN] Kept Combos Data Core Primary loader and fuzzy image resolver.');
console.log('[GC COMBOS PRIMARY CLEAN] Run: npm run build');
