#!/usr/bin/env node
/* GC_HOTLAPS_PRIMARY_CLEAN_RUNTIME_V1_APPLY
 * Cleans /hotlaps temporary runtime guard after legacy server aliases are green.
 * Removes GCHotlapsLegacyNetworkCut script from /hotlaps.
 * Keeps Hotlaps Data Core Primary v1.1 loader and server legacy aliases untouched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const hotlapsPath = path.join(root, 'src', 'pages', 'hotlaps.astro');

if (!fs.existsSync(hotlapsPath)) {
  console.error('[GC HOTLAPS PRIMARY CLEAN] Missing src/pages/hotlaps.astro');
  process.exit(1);
}

let source = fs.readFileSync(hotlapsPath, 'utf8');

if (!source.includes('GC_HOTLAPS_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC HOTLAPS PRIMARY CLEAN] Data Core Primary block not found. Refusing to clean.');
  process.exit(1);
}

const blocks = [
  ['/* GC_HOTLAPS_LEGACY_NETWORK_CUT_V1_START */', '/* GC_HOTLAPS_LEGACY_NETWORK_CUT_V1_END */', 'Hotlaps Legacy Network Cut']
];

let removed = 0;

function removeMarkedScript(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    console.log(`[GC HOTLAPS PRIMARY CLEAN] ${label}: not present`);
    return text;
  }

  const scriptStart = text.lastIndexOf('<script', start);
  const scriptEnd = text.indexOf('</script>', end);

  if (scriptStart !== -1 && scriptEnd !== -1) {
    removed += 1;
    console.log(`[GC HOTLAPS PRIMARY CLEAN] Removed ${label}`);
    return text.slice(0, scriptStart) + text.slice(scriptEnd + '</script>'.length);
  }

  removed += 1;
  console.log(`[GC HOTLAPS PRIMARY CLEAN] Removed marker body for ${label}`);
  return text.slice(0, start) + text.slice(end + endMarker.length);
}

for (const [start, end, label] of blocks) {
  source = removeMarkedScript(source, start, end, label);
}

const markerStart = '/* GC_HOTLAPS_PRIMARY_CLEAN_RUNTIME_V1_START */';
const markerEnd = '/* GC_HOTLAPS_PRIMARY_CLEAN_RUNTIME_V1_END */';

const markerScript = `
  <script is:inline>
    ${markerStart}
    (() => {
      document.documentElement.dataset.gcHotlapsRuntime = 'data-core-primary-clean-v1';
      window.GCHotlapsRuntimeStatus = () => ({
        runtime: document.documentElement.dataset.gcHotlapsRuntime,
        dataCore: document.documentElement.dataset.gcHotlapsDataCore || null,
        dataCoreVersion: document.documentElement.dataset.gcHotlapsDataCoreVersion || null,
        legacyNetworkCut: Boolean(window.GCHotlapsLegacyNetworkCut)
      });
      console.info('[GC /hotlaps Runtime] Data Core primary clean v1');
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
    console.warn('[GC HOTLAPS PRIMARY CLEAN] Missing </AppLayout>; marker not inserted.');
    return text;
  }

  return text.slice(0, idx) + markerScript + '\n' + text.slice(idx);
}

source = replaceOrInsertMarker(source);

fs.writeFileSync(hotlapsPath, source, 'utf8');

console.log(`[GC HOTLAPS PRIMARY CLEAN] Done. Removed temporary blocks: ${removed}.`);
console.log('[GC HOTLAPS PRIMARY CLEAN] Kept Hotlaps Data Core Primary loader.');
console.log('[GC HOTLAPS PRIMARY CLEAN] Run: npm run build');
