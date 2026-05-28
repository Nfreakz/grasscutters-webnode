#!/usr/bin/env node
/* GC_ADMIN_LAB_LEGACY_ALIAS_VALIDATION_V1_APPLY
 * Extends /admin/endpoints validators so legacy endpoints must report
 * source=gc-data-core-legacy-server-alias after server alias pack.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const labPath = path.join(root, 'src', 'pages', 'admin', 'endpoints.astro');

if (!fs.existsSync(labPath)) {
  console.error('[GC ADMIN LAB LEGACY ALIAS] Missing src/pages/admin/endpoints.astro');
  process.exit(1);
}

let source = fs.readFileSync(labPath, 'utf8');

if (!source.includes('GC_ADMIN_ENDPOINT_LAB_V1')) {
  console.warn('[GC ADMIN LAB LEGACY ALIAS] Endpoint Lab marker not found. Continuing carefully.');
}

let patched = 0;

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) {
    console.warn(`[GC ADMIN LAB LEGACY ALIAS] Needle not found for ${label}`);
    return false;
  }
  source = source.replace(needle, replacement);
  patched += 1;
  return true;
}

// 1) Change expectations for legacy endpoints.
source = source.replace(
  "{ id:'legacy-hotlaps', group:'legacy', critical:false, title:'Legacy hotlaps', url:'/api/hotlaps?limit=50', expect:'items' },",
  "{ id:'legacy-hotlaps', group:'legacy', critical:false, title:'Legacy hotlaps alias', url:'/api/hotlaps?limit=50', expect:'legacyAliasItems' },"
);

source = source.replace(
  "{ id:'legacy-laps', group:'legacy', critical:false, title:'Legacy laps recent', url:'/api/laps?limit=50&sort=recent&valid=all', expect:'items' },",
  "{ id:'legacy-laps', group:'legacy', critical:false, title:'Legacy laps alias', url:'/api/laps?limit=50&sort=recent&valid=all', expect:'legacyAliasItems' },"
);

source = source.replace(
  "{ id:'legacy-combos-stats', group:'legacy', critical:false, title:'Legacy combos stats', url:'/api/combos/stats?limit=50&sort=recent', expect:'items' },",
  "{ id:'legacy-combos-stats', group:'legacy', critical:false, title:'Legacy combos stats alias', url:'/api/combos/stats?limit=50&sort=recent', expect:'legacyAliasItems' },"
);

source = source.replace(
  "{ id:'legacy-overview', group:'legacy', critical:false, title:'Legacy stats overview', url:'/api/stats/overview', expect:'maybeOk' }",
  "{ id:'legacy-overview', group:'legacy', critical:false, title:'Legacy stats overview alias', url:'/api/stats/overview', expect:'legacyAliasOverview' },\n        { id:'legacy-combo-detail', group:'legacy', critical:false, title:'Legacy combo detail alias', url:() => `/api/combos/${encodeURIComponent(String(els.comboId?.value || 47))}`, expect:'legacyAliasComboDetail' },\n        { id:'legacy-pilots', group:'legacy', critical:false, title:'Legacy pilots alias', url:'/api/pilots?limit=50', expect:'legacyAliasItems' },\n        { id:'legacy-drivers', group:'legacy', critical:false, title:'Legacy drivers alias', url:'/api/drivers?limit=50', expect:'legacyAliasItems' }"
);

if (source.includes("expect:'legacyAliasItems'")) patched += 1;

// 2) Add validator block.
if (!source.includes("endpoint.expect === 'legacyAliasItems'")) {
  replaceOnce(
`        if (endpoint.expect === 'trackAssetsMaybeStatic') {
          if (!Array.isArray(data?.items)) warns.push('Manifest sin items');
          if (Array.isArray(data?.items) && data.items.length === 0) warns.push('Manifest de imágenes vacío');
        }

        if (endpoint.expect === 'pilotProfile') {`,
`        if (endpoint.expect === 'trackAssetsMaybeStatic') {
          if (!Array.isArray(data?.items)) warns.push('Manifest sin items');
          if (Array.isArray(data?.items) && data.items.length === 0) warns.push('Manifest de imágenes vacío');
        }

        if (endpoint.expect === 'legacyAliasItems') {
          if (data?.source !== 'gc-data-core-legacy-server-alias') {
            issues.push('Legacy endpoint todavía no informa source=gc-data-core-legacy-server-alias');
          }
          const rows = items(data);
          if (!rows.length) warns.push('Legacy alias sin items');
          if (!data?.legacyEndpoint) warns.push('Sin legacyEndpoint');
        }

        if (endpoint.expect === 'legacyAliasOverview') {
          if (data?.source !== 'gc-data-core-legacy-server-alias') {
            issues.push('Legacy overview todavía no informa source=gc-data-core-legacy-server-alias');
          }
          if (!number(data?.totalLaps, 0) && !number(data?.lapsCount, 0)) warns.push('Overview sin totalLaps');
          if (!data?.legacyEndpoint) warns.push('Sin legacyEndpoint');
        }

        if (endpoint.expect === 'legacyAliasComboDetail') {
          if (data?.source !== 'gc-data-core-legacy-server-alias') {
            issues.push('Legacy combo detail todavía no informa source=gc-data-core-legacy-server-alias');
          }
          if (!data?.item) issues.push('Legacy combo detail sin item');
          if (!data?.item?.summary) warns.push('Legacy combo detail sin summary');
          if (!data?.legacyEndpoint) warns.push('Sin legacyEndpoint');
        }

        if (endpoint.expect === 'pilotProfile') {`,
    'legacy alias validators'
  );
}

// 3) Make critical run include legacy aliases optionally? Do not make them critical, but add button.
if (!source.includes('runLegacyAliases')) {
  replaceOnce(
`          <button class="gc-btn" id="runCriticalEndpoints" type="button">Ejecutar críticos</button>
          <button class="gc-btn" id="clearEndpointResults" type="button">Limpiar</button>`,
`          <button class="gc-btn" id="runCriticalEndpoints" type="button">Ejecutar críticos</button>
          <button class="gc-btn" id="runLegacyAliases" type="button">Probar legacy aliases</button>
          <button class="gc-btn" id="clearEndpointResults" type="button">Limpiar</button>`,
    'legacy alias button'
  );

  replaceOnce(
`        runCritical: $('runCriticalEndpoints'),`,
`        runCritical: $('runCriticalEndpoints'),
        runLegacyAliases: $('runLegacyAliases'),`,
    'legacy alias element'
  );

  replaceOnce(
`      els.runCritical?.addEventListener('click', () => runMany(endpoints.filter((endpoint) => endpoint.critical)));
      els.clear?.addEventListener('click', clearResults);`,
`      els.runCritical?.addEventListener('click', () => runMany(endpoints.filter((endpoint) => endpoint.critical)));
      els.runLegacyAliases?.addEventListener('click', () => runMany(endpoints.filter((endpoint) => endpoint.group === 'legacy')));
      els.clear?.addEventListener('click', clearResults);`,
    'legacy alias click'
  );
}

// 4) Add comboId invalidation for legacy combo detail too.
if (source.includes("state.results.has('combo-detail-core')") && !source.includes("state.results.has('legacy-combo-detail')")) {
  source = source.replace(
    "if (state.results.has('combo-detail-core')) state.results.delete('combo-detail-core');",
    "if (state.results.has('combo-detail-core')) state.results.delete('combo-detail-core');\n        if (state.results.has('legacy-combo-detail')) state.results.delete('legacy-combo-detail');"
  );
  patched += 1;
}

const marker = '/* GC_ADMIN_LAB_LEGACY_ALIAS_VALIDATION_V1_MARKER */';
if (!source.includes(marker)) {
  const markerScript = `
  <script is:inline>
    ${marker}
    document.documentElement.dataset.gcAdminLabLegacyAliasValidation = 'v1';
  </script>
`;
  const anchor = '</AppLayout>';
  const index = source.lastIndexOf(anchor);
  if (index !== -1) {
    source = source.slice(0, index) + markerScript + '\n' + source.slice(index);
    patched += 1;
  }
}

fs.writeFileSync(labPath, source, 'utf8');

console.log(`[GC ADMIN LAB LEGACY ALIAS] Patched Endpoint Lab. Patches applied: ${patched}.`);
console.log('[GC ADMIN LAB LEGACY ALIAS] Run: npm run build');
