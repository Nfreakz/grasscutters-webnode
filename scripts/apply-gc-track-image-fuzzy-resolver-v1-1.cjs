#!/usr/bin/env node
/* GC_TRACK_IMAGE_FUZZY_RESOLVER_V1_1_APPLY
 * Restores intelligent image matching without 404 spam.
 * It scans real track images and writes a manifest consumed by gc-track-image.js.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const payloadFile = path.join(root, 'payload', 'public', 'gc-track-image.js');
if (!fs.existsSync(payloadFile)) {
  console.error('[GC TRACK IMAGE FUZZY] Missing payload/public/gc-track-image.js');
  process.exit(1);
}

const clientContent = fs.readFileSync(payloadFile, 'utf8');

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);
const scanDirs = [
  path.join(root, 'public', 'images', 'tracks'),
  path.join(root, 'frontend', 'public', 'images', 'tracks'),
  path.join(root, 'src', 'assets', 'tracks'),
  path.join(root, 'src', 'assets', 'images', 'tracks')
];

function walkImages(dir, baseUrl = '/images/tracks') {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const items = [];

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      items.push(...walkImages(full, baseUrl + '/' + encodeURIComponent(entry)));
      continue;
    }

    const ext = path.extname(entry).toLowerCase();
    if (!imageExtensions.has(ext)) continue;

    items.push({
      file: entry,
      url: baseUrl + '/' + encodeURIComponent(entry),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return items;
}

const seen = new Map();
for (const dir of scanDirs) {
  const items = walkImages(dir);
  for (const item of items) {
    if (!seen.has(item.url)) seen.set(item.url, item);
  }
}

const manifest = {
  ok: true,
  source: 'gc-track-image-fuzzy-resolver',
  generatedAt: new Date().toISOString(),
  count: seen.size,
  items: [...seen.values()].sort((a, b) => a.file.localeCompare(b.file))
};

const outputFiles = [
  path.join(root, 'public', 'gc-track-image.js'),
  path.join(root, 'public', 'js', 'gc-track-image.js'),
  path.join(root, 'frontend', 'public', 'gc-track-image.js'),
  path.join(root, 'frontend', 'public', 'js', 'gc-track-image.js')
];

for (const file of outputFiles) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, clientContent, 'utf8');
  console.log('[GC TRACK IMAGE FUZZY] Wrote ' + path.relative(root, file));
}

const manifestFiles = [
  path.join(root, 'public', 'gc-track-images-manifest.json'),
  path.join(root, 'public', 'js', 'gc-track-images-manifest.json'),
  path.join(root, 'frontend', 'public', 'gc-track-images-manifest.json'),
  path.join(root, 'frontend', 'public', 'js', 'gc-track-images-manifest.json')
];

for (const file of manifestFiles) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('[GC TRACK IMAGE FUZZY] Wrote ' + path.relative(root, file) + ' (' + manifest.count + ' images)');
}

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

for (const file of new Set([path.join(root, 'public', 'gc-track-image.js'), ...walk(path.join(root, 'public')), ...walk(path.join(root, 'frontend', 'public')), ...walk(path.join(root, 'src'))])) {
  try {
    fs.writeFileSync(file, clientContent, 'utf8');
    console.log('[GC TRACK IMAGE FUZZY] Normalized ' + path.relative(root, file));
  } catch (error) {
    console.warn('[GC TRACK IMAGE FUZZY] Could not normalize ' + path.relative(root, file) + ': ' + error.message);
  }
}

const combosPath = path.join(root, 'src', 'pages', 'combos.astro');
if (fs.existsSync(combosPath)) {
  let page = fs.readFileSync(combosPath, 'utf8');

  page = page.replace(
    '<img src="${escapeHtml(primary)}" alt="${escapeHtml(displayTrack(combo))}" loading="lazy" data-fallbacks="${fallbackList}" data-fallback-index="0"',
    '<img src="${escapeHtml(primary)}" alt="${escapeHtml(displayTrack(combo))}" data-track-name="${escapeHtml(displayTrack(combo))}" loading="lazy" data-fallbacks="${fallbackList}" data-fallback-index="0"'
  );

  // Remove overly defensive inline placeholder-only guard if previous pack inserted it.
  const inlineStart = '/* GC_TRACK_IMAGE_CLIENT_GUARD_INLINE_V1_START */';
  const inlineEnd = '/* GC_TRACK_IMAGE_CLIENT_GUARD_INLINE_V1_END */';
  if (page.includes(inlineStart) && page.includes(inlineEnd)) {
    const start = page.indexOf(inlineStart);
    const end = page.indexOf(inlineEnd);
    const scriptStart = page.lastIndexOf('<script', start);
    const scriptEnd = page.indexOf('</script>', end);
    if (scriptStart !== -1 && scriptEnd !== -1) {
      page = page.slice(0, scriptStart) + page.slice(scriptEnd + '</script>'.length);
      console.log('[GC TRACK IMAGE FUZZY] Removed placeholder-only inline guard from combos.');
    }
  }

  const fuzzyInlineStart = '/* GC_TRACK_IMAGE_FUZZY_INLINE_V1_1_START */';
  const fuzzyInlineEnd = '/* GC_TRACK_IMAGE_FUZZY_INLINE_V1_1_END */';

  const inline = `
  <script is:inline>
    ${fuzzyInlineStart}
    (() => {
      const run = () => window.GCTrackImages?.applyAll?.(document);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
      else run();
      window.addEventListener('load', () => setTimeout(run, 500), { once: true });
    })();
    ${fuzzyInlineEnd}
  </script>
`;

  if (!page.includes(fuzzyInlineStart)) {
    const anchor = page.includes('GC_COMBOS_DATA_CORE_PRIMARY_V1_START')
      ? page.lastIndexOf('<script', page.indexOf('GC_COMBOS_DATA_CORE_PRIMARY_V1_START'))
      : page.lastIndexOf('</AppLayout>');
    if (anchor !== -1) page = page.slice(0, anchor) + inline + '\n' + page.slice(anchor);
  }

  fs.writeFileSync(combosPath, page, 'utf8');
  console.log('[GC TRACK IMAGE FUZZY] Patched src/pages/combos.astro');
}

console.log('[GC TRACK IMAGE FUZZY] Manifest images: ' + manifest.count);
console.log('[GC TRACK IMAGE FUZZY] Done. Run: npm run build');
