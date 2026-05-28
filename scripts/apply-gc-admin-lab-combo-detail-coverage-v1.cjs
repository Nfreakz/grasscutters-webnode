#!/usr/bin/env node
/* GC_ADMIN_LAB_COMBO_DETAIL_COVERAGE_V1_APPLY
 * Extends /admin/endpoints with combo detail Data Core and track image asset diagnostics.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const labPath = path.join(root, 'src', 'pages', 'admin', 'endpoints.astro');

if (!fs.existsSync(labPath)) {
  console.error('[GC ADMIN LAB COVERAGE] Missing src/pages/admin/endpoints.astro');
  process.exit(1);
}

let source = fs.readFileSync(labPath, 'utf8');

if (!source.includes('GC_ADMIN_ENDPOINT_LAB_V1')) {
  console.warn('[GC ADMIN LAB COVERAGE] Endpoint Lab marker not found. Continuing carefully.');
}

let patched = 0;

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) {
    console.warn(`[GC ADMIN LAB COVERAGE] Needle not found for ${label}`);
    return false;
  }
  source = source.replace(needle, replacement);
  patched += 1;
  return true;
}

// 1) Add ComboId input after PlayerId input.
if (!source.includes('id="endpointComboId"')) {
  replaceOnce(
`          <label>
            <span>PlayerId para perfil</span>
            <input class="gc-input" id="endpointPlayerId" type="number" min="1" value="1" />
          </label>`,
`          <label>
            <span>PlayerId para perfil</span>
            <input class="gc-input" id="endpointPlayerId" type="number" min="1" value="1" />
          </label>

          <label>
            <span>ComboId para ficha</span>
            <input class="gc-input" id="endpointComboId" type="number" min="1" value="47" />
          </label>`,
    'comboId input'
  );

  // widen controls grid slightly
  source = source.replace(
    'grid-template-columns: minmax(120px,.45fr) minmax(220px,1fr) minmax(180px,.55fr);',
    'grid-template-columns: minmax(120px,.35fr) minmax(120px,.35fr) minmax(220px,1fr) minmax(180px,.55fr);'
  );
}

// 2) Add combo element ref.
if (!source.includes("comboId: $('endpointComboId')")) {
  replaceOnce(
"        playerId: $('endpointPlayerId'),",
"        playerId: $('endpointPlayerId'),\n        comboId: $('endpointComboId'),",
    'comboId element ref'
  );
}

// 3) Add endpoints if missing.
if (!source.includes("id:'combo-detail-core'")) {
  replaceOnce(
"        { id:'combos-core', group:'race', critical:true, title:'Combos core', url:'/api/gc/combos?limit=100&sort=recent', expect:'combos' },",
"        { id:'combos-core', group:'race', critical:true, title:'Combos core', url:'/api/gc/combos?limit=100&sort=recent', expect:'combos' },\n        { id:'combo-detail-core', group:'race', critical:true, title:'Combo detail Data Core', url:() => `/api/gc/combos/${encodeURIComponent(String(els.comboId?.value || 47))}`, expect:'comboDetail' },\n        { id:'track-assets', group:'race', critical:false, title:'Track image assets', url:'/api/gc/assets/tracks', expect:'trackAssets' },\n        { id:'track-manifest', group:'race', critical:false, title:'Track image manifest', url:'/gc-track-images-manifest.json', expect:'trackAssetsMaybeStatic' },",
    'combo detail endpoints'
  );
}

// 4) Add validators.
if (!source.includes("endpoint.expect === 'comboDetail'")) {
  replaceOnce(
`        if (endpoint.expect === 'identityStatus') {
          if (!data?.users) warns.push('Sin bloque users');
        }

        if (endpoint.expect === 'pilotProfile') {`,
`        if (endpoint.expect === 'identityStatus') {
          if (!data?.users) warns.push('Sin bloque users');
        }

        if (endpoint.expect === 'comboDetail') {
          if (!data?.item) issues.push('Sin item de combo');
          if (!data?.item?.summary) issues.push('Sin summary de combo');
          if (!Array.isArray(data?.item?.leaderboard)) warns.push('leaderboard no es array');
          if (!Array.isArray(data?.item?.recentLaps)) warns.push('recentLaps no es array');
          if (!data?.item?.trackName && !data?.item?.track?.name && !data?.item?.track?.displayName) issues.push('Sin trackName');
          if (data?.source !== 'gc-data-core') warns.push('source no es gc-data-core');
          if (number(data?.item?.summary?.totalLaps, 0) === 0) warns.push('Combo sin vueltas');
        }

        if (endpoint.expect === 'trackAssets') {
          if (!Array.isArray(data?.items)) issues.push('Sin items de imágenes');
          if (Array.isArray(data?.items) && data.items.length === 0) warns.push('No hay imágenes reales en /images/tracks');
        }

        if (endpoint.expect === 'trackAssetsMaybeStatic') {
          if (!Array.isArray(data?.items)) warns.push('Manifest sin items');
          if (Array.isArray(data?.items) && data.items.length === 0) warns.push('Manifest de imágenes vacío');
        }

        if (endpoint.expect === 'pilotProfile') {`,
    'combo detail validators'
  );
}

// 5) Invalidate combo-detail result when combo id changes.
if (!source.includes("state.results.has('combo-detail-core')")) {
  replaceOnce(
`      els.playerId?.addEventListener('change', () => {
        if (state.results.has('pilot-profile')) state.results.delete('pilot-profile');
        renderList();
      });`,
`      els.playerId?.addEventListener('change', () => {
        if (state.results.has('pilot-profile')) state.results.delete('pilot-profile');
        renderList();
      });

      els.comboId?.addEventListener('change', () => {
        if (state.results.has('combo-detail-core')) state.results.delete('combo-detail-core');
        renderList();
      });`,
    'comboId change listener'
  );
}

// 6) Add combo id to report.
if (!source.includes('comboId: els.comboId')) {
  replaceOnce(
"          playerId: els.playerId.value || null,",
"          playerId: els.playerId.value || null,\n          comboId: els.comboId?.value || null,",
    'comboId report'
  );
}

// 7) Mobile grid.
if (!source.includes('.gc-endpoint-lab .gc-endpoint-controls{')) {
  console.warn('[GC ADMIN LAB COVERAGE] styles block not found for controls.');
}

fs.writeFileSync(labPath, source, 'utf8');

console.log(`[GC ADMIN LAB COVERAGE] Patched /admin/endpoints. Patches applied: ${patched}.`);
console.log('[GC ADMIN LAB COVERAGE] Run: npm run build');
