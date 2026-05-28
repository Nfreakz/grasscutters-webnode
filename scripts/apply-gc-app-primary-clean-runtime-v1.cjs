#!/usr/bin/env node
/* GC_APP_PRIMARY_CLEAN_RUNTIME_V1_APPLY
 * Cleans /app temporary runtime guards after legacy server aliases are green.
 * Removes GCAppLegacyGovernor and GCAppLegacyNetworkCut scripts from /app.
 * Keeps Data Core Primary loader and legacy server aliases/fallbacks untouched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(appPath)) {
  console.error('[GC APP PRIMARY CLEAN] Missing src/pages/app.astro');
  process.exit(1);
}

let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes('GC_APP_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC APP PRIMARY CLEAN] Data Core Primary block not found. Refusing to clean.');
  process.exit(1);
}

const blocks = [
  ['/* GC_APP_LEGACY_GOVERNOR_V1_EARLY_START */', '/* GC_APP_LEGACY_GOVERNOR_V1_EARLY_END */', 'Legacy Governor early'],
  ['/* GC_APP_LEGACY_GOVERNOR_V1_LATE_START */', '/* GC_APP_LEGACY_GOVERNOR_V1_LATE_END */', 'Legacy Governor late'],
  ['/* GC_APP_LEGACY_NETWORK_CUT_V1_START */', '/* GC_APP_LEGACY_NETWORK_CUT_V1_END */', 'Legacy Network Cut']
];

let removed = 0;

function removeMarkedScript(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    console.log(`[GC APP PRIMARY CLEAN] ${label}: not present`);
    return text;
  }

  const scriptStart = text.lastIndexOf('<script', start);
  const scriptEnd = text.indexOf('</script>', end);

  if (scriptStart !== -1 && scriptEnd !== -1) {
    removed += 1;
    console.log(`[GC APP PRIMARY CLEAN] Removed ${label}`);
    return text.slice(0, scriptStart) + text.slice(scriptEnd + '</script>'.length);
  }

  removed += 1;
  console.log(`[GC APP PRIMARY CLEAN] Removed marker body for ${label}`);
  return text.slice(0, start) + text.slice(end + endMarker.length);
}

for (const [start, end, label] of blocks) {
  source = removeMarkedScript(source, start, end, label);
}

// Remove the call to a governor marker if it remains inside Data Core primary.
source = source.replace(/\n\s*window\.GCAppLegacyGovernor\?\.markCorePaint\?\(\);/g, '');

// Add a compact final marker/status script.
const markerStart = '/* GC_APP_PRIMARY_CLEAN_RUNTIME_V1_START */';
const markerEnd = '/* GC_APP_PRIMARY_CLEAN_RUNTIME_V1_END */';

const markerScript = `
  <script is:inline>
    ${markerStart}
    (() => {
      document.documentElement.dataset.gcAppRuntime = 'data-core-primary-clean-v1';
      window.GCAppRuntimeStatus = () => ({
        runtime: document.documentElement.dataset.gcAppRuntime,
        dataCore: document.documentElement.dataset.gcAppDataCore || null,
        dataCoreVersion: document.documentElement.dataset.gcAppDataCoreVersion || null,
        legacyGovernor: Boolean(window.GCAppLegacyGovernor),
        legacyNetworkCut: Boolean(window.GCAppLegacyNetworkCut)
      });
      console.info('[GC /app Runtime] Data Core primary clean v1');
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
    console.warn('[GC APP PRIMARY CLEAN] Missing </AppLayout>; marker not inserted.');
    return text;
  }

  return text.slice(0, idx) + markerScript + '\n' + text.slice(idx);
}

source = replaceOrInsertMarker(source);

fs.writeFileSync(appPath, source, 'utf8');

console.log(`[GC APP PRIMARY CLEAN] Done. Removed temporary blocks: ${removed}.`);
console.log('[GC APP PRIMARY CLEAN] Kept Data Core Primary loader.');
console.log('[GC APP PRIMARY CLEAN] Run: npm run build');
