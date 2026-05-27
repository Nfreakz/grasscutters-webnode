const fs = require('fs');
const path = require('path');

const root = process.cwd();
const routePath = path.join(root, 'src', 'pages', 'api', 'pilot-social-image', '[playerId].png.ts');

if (!fs.existsSync(routePath)) {
  console.error('[GC PILOT AVATAR SOCIAL FIX] No encuentro ' + routePath);
  process.exit(1);
}

const original = fs.readFileSync(routePath, 'utf8');

const fixed = `import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_PILOT_AVATAR_URL, readAvatarImage } from '../../../lib/pilot-avatars';

export const prerender = false;

const WIDTH = 1200;
const HEIGHT = 630;
const AVATAR_SIZE = 472;

function defaultAvatarBuffer() {
  const cleanDefaultAvatarUrl = String(DEFAULT_PILOT_AVATAR_URL || '').replaceAll('\\\\\\\\', '/');
  const relative = cleanDefaultAvatarUrl.split('/').filter(Boolean).join('/');
  const filePath = path.join(process.cwd(), 'public', relative);

  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);

  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#07110a"/><circle cx="256" cy="208" r="86" fill="#9cff3f"/><path d="M112 440c25-93 91-136 144-136s119 43 144 136" fill="#9cff3f"/></svg>'
  );
}

function avatarMaskSvg(size: number) {
  const radius = size / 2;
  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg"><circle cx="' + radius + '" cy="' + radius + '" r="' + radius + '" fill="#fff"/></svg>'
  );
}

function backgroundSvg() {
  return Buffer.from(
    '<svg width="' + WIDTH + '" height="' + HEIGHT + '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<radialGradient id="g1" cx="50%" cy="48%" r="56%">' +
          '<stop offset="0%" stop-color="#16351e"/>' +
          '<stop offset="48%" stop-color="#07130a"/>' +
          '<stop offset="100%" stop-color="#020503"/>' +
        '</radialGradient>' +
        '<radialGradient id="g2" cx="50%" cy="48%" r="38%">' +
          '<stop offset="0%" stop-color="#9cff3f" stop-opacity=".22"/>' +
          '<stop offset="68%" stop-color="#9cff3f" stop-opacity=".05"/>' +
          '<stop offset="100%" stop-color="#9cff3f" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>' +
      '</defs>' +
      '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#g1)"/>' +
      '<circle cx="600" cy="315" r="270" fill="url(#g2)" filter="url(#blur)"/>' +
      '<circle cx="600" cy="315" r="253" fill="none" stroke="#9cff3f" stroke-opacity=".30" stroke-width="2"/>' +
      '<circle cx="600" cy="315" r="262" fill="none" stroke="#45f1db" stroke-opacity=".12" stroke-width="1"/>' +
    '</svg>'
  );
}

function avatarFrameSvg(size: number) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#9cff3f" stroke-width="10" stroke-opacity=".92"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 13) + '" fill="none" stroke="#45f1db" stroke-width="3" stroke-opacity=".42"/>' +
    '</svg>'
  );
}

export const GET: APIRoute = async ({ params }) => {
  const playerId = params.playerId || '';
  const storedAvatar = readAvatarImage(playerId);
  const sourceBuffer = storedAvatar?.buffer || defaultAvatarBuffer();

  try {
    const avatar = await sharp(sourceBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .png()
      .composite([{ input: avatarMaskSvg(AVATAR_SIZE), blend: 'dest-in' }])
      .png()
      .toBuffer();

    const left = Math.round((WIDTH - AVATAR_SIZE) / 2);
    const top = Math.round((HEIGHT - AVATAR_SIZE) / 2);

    const image = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: '#050805',
      },
    })
      .composite([
        { input: backgroundSvg(), left: 0, top: 0 },
        { input: avatar, left, top },
        { input: avatarFrameSvg(AVATAR_SIZE), left, top },
      ])
      .png({ compressionLevel: 8, adaptiveFiltering: true })
      .toBuffer();

    return new Response(image, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-GC-Social-Image': 'pilot-avatar-only-v15.30.4',
      },
    });
  } catch (error) {
    console.error('[GC] Error generando pilot social image:', error);

    return new Response(sourceBuffer, {
      status: 200,
      headers: {
        'Content-Type': storedAvatar?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=600',
        'X-GC-Social-Image': 'pilot-avatar-fallback-v15.30.4',
      },
    });
  }
};
`;

const backupPath = routePath + '.bak-v15-30-4';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, 'utf8');
}

fs.writeFileSync(routePath, fixed, 'utf8');

console.log('[GC PILOT AVATAR SOCIAL FIX] Ruta de imagen social reescrita sin regex problemática.');
console.log('[GC PILOT AVATAR SOCIAL FIX] Backup: ' + backupPath);
console.log('[GC PILOT AVATAR SOCIAL FIX] Ejecuta ahora: npm run build');
