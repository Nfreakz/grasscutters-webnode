#!/usr/bin/env node
/* GC_COMBO_DETAIL_PRIMARY_CLEAN_RUNTIME_V1_APPLY
 * Cleans /combos/:comboId temporary runtime guard after legacy server aliases are green.
 * Removes GCComboDetailLegacyNetworkCut script from /combos/[comboId].astro.
 * Keeps Combo Detail Data Core Primary, hardened track image and server aliases untouched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const comboDetailPath = path.join(root, 'src', 'pages', 'combos', '[comboId].astro');

if (!fs.existsSync(comboDetailPath)) {
  console.error('[GC COMBO DETAIL PRIMARY CLEAN] Missing src/pages/combos/[comboId].astro');
  process.exit(1);
}

let source = fs.readFileSync(comboDetailPath, 'utf8');

if (!source.includes('gcComboDetailDataCore')) {
  console.error('[GC COMBO DETAIL PRIMARY CLEAN] Combo detail Data Core marker not found. Refusing to clean.');
  process.exit(1);
}

if (!source.includes('gcComboDetailTrackImage')) {
  console.error('[GC COMBO DETAIL PRIMARY CLEAN] Hardened track image marker not found. Refusing to clean.');
  process.exit(1);
}

const blocks = [
  ['/* GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_START */', '/* GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1_END */', 'Combo Detail Legacy Network Cut']
];

let removed = 0;

function removeMarkedScript(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    console.log(`[GC COMBO DETAIL PRIMARY CLEAN] ${label}: not present`);
    return text;
  }

  const scriptStart = text.lastIndexOf('<script', start);
  const scriptEnd = text.indexOf('</script>', end);

  if (scriptStart !== -1 && scriptEnd !== -1) {
    removed += 1;
    console.log(`[GC COMBO DETAIL PRIMARY CLEAN] Removed ${label}`);
    return text.slice(0, scriptStart) + text.slice(scriptEnd + '</script>'.length);
  }

  removed += 1;
  console.log(`[GC COMBO DETAIL PRIMARY CLEAN] Removed marker body for ${label}`);
  return text.slice(0, start) + text.slice(end + endMarker.length);
}

for (const [start, end, label] of blocks) {
  source = removeMarkedScript(source, start, end, label);
}

const markerStart = '/* GC_COMBO_DETAIL_PRIMARY_CLEAN_RUNTIME_V1_START */';
const markerEnd = '/* GC_COMBO_DETAIL_PRIMARY_CLEAN_RUNTIME_V1_END */';

const markerScript = `
  <script is:inline>
    ${markerStart}
    (() => {
      document.documentElement.dataset.gcComboDetailRuntime = 'data-core-primary-clean-v1';
      window.GCComboDetailRuntimeStatus = () => ({
        runtime: document.documentElement.dataset.gcComboDetailRuntime,
        dataCore: document.documentElement.dataset.gcComboDetailDataCore || null,
        dataCoreVersion: document.documentElement.dataset.gcComboDetailDataCoreVersion || null,
        trackImage: document.documentElement.dataset.gcComboDetailTrackImage || null,
        trackImages: window.GCTrackImages?.version || null,
        legacyNetworkCut: Boolean(window.GCComboDetailLegacyNetworkCut)
      });
      console.info('[GC /combos/:id Runtime] Data Core primary clean v1');
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
    console.warn('[GC COMBO DETAIL PRIMARY CLEAN] Missing </AppLayout>; marker not inserted.');
    return text;
  }

  return text.slice(0, idx) + markerScript + '\n' + text.slice(idx);
}

source = replaceOrInsertMarker(source);

fs.writeFileSync(comboDetailPath, source, 'utf8');

console.log(`[GC COMBO DETAIL PRIMARY CLEAN] Done. Removed temporary blocks: ${removed}.`);
console.log('[GC COMBO DETAIL PRIMARY CLEAN] Kept Combo Detail Data Core Primary and hardened image system.');
console.log('[GC COMBO DETAIL PRIMARY CLEAN] Run: npm run build');
