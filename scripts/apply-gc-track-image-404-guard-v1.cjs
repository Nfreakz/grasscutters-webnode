#!/usr/bin/env node
/* GC_TRACK_IMAGE_404_GUARD_V1_APPLY
 * Adds safe track-image resolver and SVG fallback for /images/tracks/*.
 * Goal: stop console 404 spam caused by guessed track image filenames.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_TRACK_IMAGE_404_GUARD_V1_START */';
const END = '/* GC_TRACK_IMAGE_404_GUARD_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC TRACK IMAGE GUARD] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('const rootDir') || !source.includes('const distDir')) {
  console.error('[GC TRACK IMAGE GUARD] rootDir/distDir not found in src/server/index.ts');
  process.exit(1);
}

const routeBlock = `
${START}
const gcTrackImageExtensionsV1 = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);

function gcTrackImageDirsV1() {
  return [
    path.join(rootDir, 'public', 'images', 'tracks'),
    path.join(rootDir, 'frontend', 'public', 'images', 'tracks'),
    path.join(rootDir, 'dist', 'client', 'images', 'tracks'),
    path.join(distDir, 'client', 'images', 'tracks'),
    path.join(distDir, 'images', 'tracks')
  ];
}

function gcSafeTrackImageFilenameV1(file: unknown) {
  const raw = String(file ?? '').trim();
  const base = path.basename(raw);
  if (!base || base !== raw || base.includes('..')) return null;
  const ext = path.extname(base).toLowerCase();
  if (!gcTrackImageExtensionsV1.has(ext)) return null;
  return base;
}

function gcTrackImageMimeV1(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  return 'application/octet-stream';
}

function gcFindTrackImageFileV1(file: string) {
  for (const dir of gcTrackImageDirsV1()) {
    const candidate = path.join(dir, file);
    if (candidate.startsWith(dir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function gcListTrackImagesV1() {
  const found = new Map<string, { file: string; url: string; sizeBytes: number; modifiedAt: string }>();

  for (const dir of gcTrackImageDirsV1()) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir)) {
      const safe = gcSafeTrackImageFilenameV1(file);
      if (!safe || found.has(safe)) continue;

      const fullPath = path.join(dir, safe);
      const stats = fs.statSync(fullPath);
      found.set(safe, {
        file: safe,
        url: '/images/tracks/' + encodeURIComponent(safe),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
  }

  return [...found.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function gcTrackFallbackSvgV1(label: string) {
  const clean = String(label || 'Track image').replace(/[<>&'"]/g, '');
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="\${clean}">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#071506"/>
        <stop offset="0.45" stop-color="#10240b"/>
        <stop offset="1" stop-color="#020602"/>
      </linearGradient>
      <radialGradient id="r" cx="72%" cy="20%" r="72%">
        <stop offset="0" stop-color="#89ff35" stop-opacity="0.22"/>
        <stop offset="0.42" stop-color="#89ff35" stop-opacity="0.06"/>
        <stop offset="1" stop-color="#89ff35" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="675" fill="url(#g)"/>
    <rect width="1200" height="675" fill="url(#r)"/>
    <g opacity="0.18" stroke="#b4ff73" stroke-width="2">
      <path d="M-50 540 C 180 420, 290 420, 485 510 S 820 660, 1250 430" fill="none"/>
      <path d="M-40 585 C 190 465, 310 465, 500 555 S 820 708, 1250 475" fill="none"/>
      <path d="M-20 180 L 1220 180 M -20 300 L 1220 300 M -20 420 L 1220 420" opacity="0.22"/>
      <path d="M200 -20 L200 700 M400 -20 L400 700 M600 -20 L600 700 M800 -20 L800 700 M1000 -20 L1000 700" opacity="0.16"/>
    </g>
    <g font-family="Inter, Segoe UI, Arial, sans-serif">
      <text x="64" y="84" fill="#9dff47" font-size="28" font-weight="800" letter-spacing="4">GRASSCUTTERS</text>
      <text x="64" y="140" fill="#f1ffe8" font-size="44" font-weight="900">Track image pending</text>
      <text x="64" y="192" fill="#afc6a2" font-size="26">Añade una imagen real en /images/tracks para este circuito.</text>
    </g>
  </svg>\`;
}

app.get('/api/gc/assets/tracks', (_req, res) => {
  try {
    const items = gcListTrackImagesV1();
    res.json({
      ok: true,
      source: 'gc-assets-core',
      generatedAt: new Date().toISOString(),
      domain: 'track-images',
      count: items.length,
      items,
      message: 'Listado seguro de imágenes reales disponibles en /images/tracks.'
    });
  } catch (error) {
    console.error('[GC Track Image Guard] assets/tracks error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-assets-core',
      generatedAt: new Date().toISOString(),
      domain: 'track-images',
      count: 0,
      items: [],
      message: 'No se pudo listar imágenes de circuito.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/images/tracks/:file', (req, res) => {
  const safe = gcSafeTrackImageFilenameV1(req.params.file);
  if (!safe) {
    return res.status(400).type('image/svg+xml').send(gcTrackFallbackSvgV1('Invalid track image'));
  }

  const existing = gcFindTrackImageFileV1(safe);
  if (existing) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(gcTrackImageMimeV1(safe));
    return res.sendFile(existing);
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('image/svg+xml');
  return res.status(200).send(gcTrackFallbackSvgV1(safe));
});
${END}
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC TRACK IMAGE GUARD] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }
  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

let next = replaceMarkedBlock(source, START, END, routeBlock);

if (next === null) {
  const anchor =
    source.includes("app.get('/api/gc/archive/snapshot'")
      ? "app.get('/api/gc/archive/snapshot'"
      : source.includes("app.get('/api/gc/diagnostics'")
        ? "app.get('/api/gc/diagnostics'"
        : source.includes("app.get('/api/gc/snapshot'")
          ? "app.get('/api/gc/snapshot'"
          : "app.get('/api/health'";
  next = insertBefore(source, anchor, routeBlock, 'track image guard');
}

fs.writeFileSync(serverPath, next, 'utf8');
console.log('[GC TRACK IMAGE GUARD] Added /api/gc/assets/tracks and /images/tracks/:file fallback.');
console.log('[GC TRACK IMAGE GUARD] Run: npm run build');
