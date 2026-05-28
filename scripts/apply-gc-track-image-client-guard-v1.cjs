#!/usr/bin/env node
/* GC_TRACK_IMAGE_CLIENT_GUARD_V1_APPLY
 * Fixes broken gc-track-image.js and prevents guessed track image 404 spam.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const payloadFile = path.join(root, 'payload', 'public', 'gc-track-image.js');
if (!fs.existsSync(payloadFile)) {
  console.error('[GC TRACK IMAGE CLIENT GUARD] Missing payload/public/gc-track-image.js');
  process.exit(1);
}

const content = fs.readFileSync(payloadFile, 'utf8');

const outputFiles = [
  path.join(root, 'public', 'gc-track-image.js'),
  path.join(root, 'public', 'js', 'gc-track-image.js'),
  path.join(root, 'frontend', 'public', 'gc-track-image.js'),
  path.join(root, 'frontend', 'public', 'js', 'gc-track-image.js')
];

let written = 0;

for (const file of outputFiles) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC TRACK IMAGE CLIENT GUARD] Wrote ' + path.relative(root, file));
    written += 1;
  } catch (error) {
    console.warn('[GC TRACK IMAGE CLIENT GUARD] Could not write ' + path.relative(root, file) + ': ' + error.message);
  }
}

// Also overwrite any existing file named like gc-track-image*.js in common public/src folders.
const searchRoots = [
  path.join(root, 'public'),
  path.join(root, 'frontend', 'public'),
  path.join(root, 'src')
];

function walk(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.astro'].includes(entry)) continue;
      found.push(...walk(full));
    } else if (/gc[-_]?track[-_]?image.*\.js$/i.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

for (const file of new Set(searchRoots.flatMap(walk))) {
  try {
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC TRACK IMAGE CLIENT GUARD] Normalized existing ' + path.relative(root, file));
  } catch (error) {
    console.warn('[GC TRACK IMAGE CLIENT GUARD] Could not normalize ' + path.relative(root, file) + ': ' + error.message);
  }
}

// Patch combos page so Data Core primary has an inline guard even if external script load order changes.
const combosPath = path.join(root, 'src', 'pages', 'combos.astro');
const INLINE_START = '/* GC_TRACK_IMAGE_CLIENT_GUARD_INLINE_V1_START */';
const INLINE_END = '/* GC_TRACK_IMAGE_CLIENT_GUARD_INLINE_V1_END */';

if (fs.existsSync(combosPath)) {
  let page = fs.readFileSync(combosPath, 'utf8');

  const inline = `
  <script is:inline>
    ${INLINE_START}
    (() => {
      if (window.GCTrackImages?.placeholderUrl && window.GCTrackImages?.candidates) return;

      const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const svg = (label) => {
        const clean = String(label || 'Track image pending').replace(/[<>&'"]/g, '');
        return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#071506"/><text x="64" y="120" fill="#9dff47" font-size="42" font-family="Arial" font-weight="800">GrassCutters</text><text x="64" y="180" fill="#f1ffe8" font-size="34" font-family="Arial">' + clean + '</text><text x="64" y="230" fill="#afc6a2" font-size="24" font-family="Arial">Track image pending</text></svg>';
      };
      const placeholderUrl = (label) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(label));

      window.GCTrackImages = {
        version: 'inline-v1',
        normalize,
        placeholderUrl,
        candidates: (trackName) => [placeholderUrl(trackName)],
        load: async () => false,
        applyAll: (root = document) => {
          root.querySelectorAll('.gc-track-banner-v42 img').forEach((img) => {
            const label = img.alt || 'Track image pending';
            img.onerror = null;
            if (!img.src || /\\/images\\/tracks\\//.test(img.getAttribute('src') || '')) img.src = placeholderUrl(label);
          });
        }
      };
    })();
    ${INLINE_END}
  </script>
`;

  if (page.includes(INLINE_START) && page.includes(INLINE_END)) {
    const start = page.indexOf(INLINE_START);
    const end = page.indexOf(INLINE_END);
    const scriptStart = page.lastIndexOf('<script', start);
    const scriptEnd = page.indexOf('</script>', end);
    if (scriptStart !== -1 && scriptEnd !== -1) {
      page = page.slice(0, scriptStart) + inline + page.slice(scriptEnd + '</script>'.length);
    }
  } else {
    const anchor = page.includes('GC_COMBOS_DATA_CORE_PRIMARY_V1_START')
      ? '/* GC_COMBOS_DATA_CORE_PRIMARY_V1_START */'
      : '</AppLayout>';
    const index = page.indexOf(anchor);
    if (index !== -1) {
      const insertAt = anchor === '</AppLayout>' ? index : page.lastIndexOf('<script', index);
      page = page.slice(0, insertAt) + inline + '\n' + page.slice(insertAt);
    }
  }

  // Patch renderBanner image tag to include data-track-name and avoid browser auto-fallback chains.
  page = page.replace(
    '<img src="${escapeHtml(primary)}" alt="${escapeHtml(displayTrack(combo))}" loading="lazy" data-fallbacks="${fallbackList}" data-fallback-index="0"',
    '<img src="${escapeHtml(primary)}" alt="${escapeHtml(displayTrack(combo))}" data-track-name="${escapeHtml(displayTrack(combo))}" loading="lazy" data-fallbacks="${fallbackList}" data-fallback-index="0"'
  );

  fs.writeFileSync(combosPath, page, 'utf8');
  console.log('[GC TRACK IMAGE CLIENT GUARD] Patched src/pages/combos.astro inline guard');
} else {
  console.warn('[GC TRACK IMAGE CLIENT GUARD] combos.astro not found, skipped inline guard');
}

console.log('[GC TRACK IMAGE CLIENT GUARD] Done. Files written: ' + written);
console.log('[GC TRACK IMAGE CLIENT GUARD] Run: npm run build');
