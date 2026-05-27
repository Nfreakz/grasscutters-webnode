const fs = require('fs');
const path = require('path');

const root = process.cwd();

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('[GC PILOT SOCIAL EXPRESS] No encuentro ' + filePath);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function backup(filePath, original, suffix) {
  const backupPath = filePath + '.bak-' + suffix;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
  return backupPath;
}

function write(filePath, content, original, suffix) {
  if (content === original) {
    console.log('[GC PILOT SOCIAL EXPRESS] Sin cambios: ' + path.relative(root, filePath));
    return;
  }
  const backupPath = backup(filePath, original, suffix);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[GC PILOT SOCIAL EXPRESS] Actualizado: ' + path.relative(root, filePath));
  console.log('[GC PILOT SOCIAL EXPRESS] Backup: ' + path.relative(root, backupPath));
}

/**
 * 1) src/server/index.ts
 * Registrar la ruta en Express real, porque /api/... está respondiendo Cannot GET.
 */
const serverPath = path.join(root, 'src', 'server', 'index.ts');
let server = readRequired(serverPath);
const originalServer = server;

if (!server.includes("from '../lib/pilot-avatars'")) {
  server = server.replace(
    "import crypto from 'node:crypto';",
    "import crypto from 'node:crypto';\nimport { DEFAULT_PILOT_AVATAR_URL, readAvatarImage } from '../lib/pilot-avatars';"
  );
}

if (!server.includes('GC_PILOT_SOCIAL_IMAGE_EXPRESS_V15_30_5')) {
  const marker = 'const app = express();';
  const index = server.indexOf(marker);
  if (index === -1) {
    console.error('[GC PILOT SOCIAL EXPRESS] No encuentro const app = express();');
    process.exit(1);
  }

  const insertAt = index + marker.length;
  server = server.slice(0, insertAt) + "\n\n" + "/* GC_PILOT_SOCIAL_IMAGE_EXPRESS_V15_30_5 START */\nfunction gcPilotSocialDefaultAvatarBuffer() {\n  const relative = String(DEFAULT_PILOT_AVATAR_URL || '/images/pilot-avatar-default.png')\n    .replace(/\\\\/g, '/')\n    .split('/')\n    .filter(Boolean)\n    .join('/');\n  const filePath = path.join(rootDir, 'public', relative);\n  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);\n\n  return Buffer.from(\n    '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><rect width=\"512\" height=\"512\" fill=\"#07110a\"/><circle cx=\"256\" cy=\"208\" r=\"86\" fill=\"#9cff3f\"/><path d=\"M112 440c25-93 91-136 144-136s119 43 144 136\" fill=\"#9cff3f\"/></svg>'\n  );\n}\n\nfunction gcPilotSocialMaskSvg(size: number) {\n  const radius = size / 2;\n  return Buffer.from(\n    '<svg width=\"' + size + '\" height=\"' + size + '\" viewBox=\"0 0 ' + size + ' ' + size + '\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"' + radius + '\" cy=\"' + radius + '\" r=\"' + radius + '\" fill=\"#fff\"/></svg>'\n  );\n}\n\nfunction gcPilotSocialBackgroundSvg(width: number, height: number) {\n  return Buffer.from(\n    '<svg width=\"' + width + '\" height=\"' + height + '\" viewBox=\"0 0 ' + width + ' ' + height + '\" xmlns=\"http://www.w3.org/2000/svg\">' +\n      '<defs>' +\n        '<radialGradient id=\"g1\" cx=\"50%\" cy=\"48%\" r=\"56%\">' +\n          '<stop offset=\"0%\" stop-color=\"#16351e\"/>' +\n          '<stop offset=\"48%\" stop-color=\"#07130a\"/>' +\n          '<stop offset=\"100%\" stop-color=\"#020503\"/>' +\n        '</radialGradient>' +\n        '<radialGradient id=\"g2\" cx=\"50%\" cy=\"48%\" r=\"38%\">' +\n          '<stop offset=\"0%\" stop-color=\"#9cff3f\" stop-opacity=\".22\"/>' +\n          '<stop offset=\"68%\" stop-color=\"#9cff3f\" stop-opacity=\".05\"/>' +\n          '<stop offset=\"100%\" stop-color=\"#9cff3f\" stop-opacity=\"0\"/>' +\n        '</radialGradient>' +\n        '<filter id=\"blur\"><feGaussianBlur stdDeviation=\"34\"/></filter>' +\n      '</defs>' +\n      '<rect width=\"' + width + '\" height=\"' + height + '\" fill=\"url(#g1)\"/>' +\n      '<circle cx=\"600\" cy=\"315\" r=\"270\" fill=\"url(#g2)\" filter=\"url(#blur)\"/>' +\n      '<circle cx=\"600\" cy=\"315\" r=\"253\" fill=\"none\" stroke=\"#9cff3f\" stroke-opacity=\".30\" stroke-width=\"2\"/>' +\n      '<circle cx=\"600\" cy=\"315\" r=\"262\" fill=\"none\" stroke=\"#45f1db\" stroke-opacity=\".12\" stroke-width=\"1\"/>' +\n    '</svg>'\n  );\n}\n\nfunction gcPilotSocialFrameSvg(size: number) {\n  const cx = size / 2;\n  const cy = size / 2;\n  const r = size / 2 - 8;\n\n  return Buffer.from(\n    '<svg width=\"' + size + '\" height=\"' + size + '\" viewBox=\"0 0 ' + size + ' ' + size + '\" xmlns=\"http://www.w3.org/2000/svg\">' +\n      '<circle cx=\"' + cx + '\" cy=\"' + cy + '\" r=\"' + r + '\" fill=\"none\" stroke=\"#9cff3f\" stroke-width=\"10\" stroke-opacity=\".92\"/>' +\n      '<circle cx=\"' + cx + '\" cy=\"' + cy + '\" r=\"' + (r - 13) + '\" fill=\"none\" stroke=\"#45f1db\" stroke-width=\"3\" stroke-opacity=\".42\"/>' +\n    '</svg>'\n  );\n}\n\nasync function gcBuildPilotSocialImage(playerId: string) {\n  const width = 1200;\n  const height = 630;\n  const avatarSize = 472;\n  const storedAvatar = readAvatarImage(playerId);\n  const sourceBuffer = storedAvatar?.buffer || gcPilotSocialDefaultAvatarBuffer();\n  const sharpModule: any = await import('sharp');\n  const sharp = sharpModule.default ?? sharpModule;\n\n  const avatar = await sharp(sourceBuffer)\n    .resize(avatarSize, avatarSize, { fit: 'cover' })\n    .png()\n    .composite([{ input: gcPilotSocialMaskSvg(avatarSize), blend: 'dest-in' }])\n    .png()\n    .toBuffer();\n\n  const left = Math.round((width - avatarSize) / 2);\n  const top = Math.round((height - avatarSize) / 2);\n\n  return sharp({\n    create: {\n      width,\n      height,\n      channels: 4,\n      background: '#050805',\n    },\n  })\n    .composite([\n      { input: gcPilotSocialBackgroundSvg(width, height), left: 0, top: 0 },\n      { input: avatar, left, top },\n      { input: gcPilotSocialFrameSvg(avatarSize), left, top },\n    ])\n    .png({ compressionLevel: 8, adaptiveFiltering: true })\n    .toBuffer();\n}\n\napp.get(['/api/pilot-social-image/:playerId.png', '/api/pilot-social-image/:playerId'], async (req, res) => {\n  const playerId = String(req.params.playerId || '').replace(/\\.png$/i, '').trim();\n\n  if (!/^[0-9]+$/.test(playerId)) {\n    res.status(400).type('text/plain').send('Invalid pilot id');\n    return;\n  }\n\n  try {\n    const image = await gcBuildPilotSocialImage(playerId);\n    res\n      .status(200)\n      .setHeader('Content-Type', 'image/png');\n    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');\n    res.setHeader('X-GC-Social-Image', 'pilot-avatar-express-v15.30.5');\n    res.send(image);\n  } catch (error) {\n    console.error('[GC] Error generando pilot social image express:', error);\n\n    const fallback = readAvatarImage(playerId);\n    if (fallback?.buffer) {\n      res.status(200);\n      res.setHeader('Content-Type', fallback.contentType || 'image/png');\n      res.setHeader('Cache-Control', 'public, max-age=600');\n      res.setHeader('X-GC-Social-Image', 'pilot-avatar-raw-fallback-v15.30.5');\n      res.send(fallback.buffer);\n      return;\n    }\n\n    res.redirect(302, DEFAULT_PILOT_AVATAR_URL);\n  }\n});\n/* GC_PILOT_SOCIAL_IMAGE_EXPRESS_V15_30_5 END */" + "\n" + server.slice(insertAt);
}

write(serverPath, server, originalServer, 'v15-30-5');

/**
 * 2) Eliminar endpoint Astro duplicado si existe.
 * No lo usamos porque Express intercepta /api y online devuelve Cannot GET si no está en server/index.ts.
 */
const astroEndpoint = path.join(root, 'src', 'pages', 'api', 'pilot-social-image', '[playerId].png.ts');
if (fs.existsSync(astroEndpoint)) {
  const originalEndpoint = fs.readFileSync(astroEndpoint, 'utf8');
  backup(astroEndpoint, originalEndpoint, 'v15-30-5');
  fs.unlinkSync(astroEndpoint);
  console.log('[GC PILOT SOCIAL EXPRESS] Eliminado endpoint Astro duplicado: ' + path.relative(root, astroEndpoint));
}

/**
 * 3) src/pages/pilotos/[id].astro
 * Asegurar que incluso el fallback usa la imagen social por avatar.
 */
const pilotPagePath = path.join(root, 'src', 'pages', 'pilotos', '[id].astro');
let pilotPage = readRequired(pilotPagePath);
const originalPilotPage = pilotPage;

if (pilotPage.includes("image: '/og/pilotos-og.png',")) {
  pilotPage = pilotPage.replace(
    "image: '/og/pilotos-og.png',",
    "image: isNumericPilotId ? `/api/pilot-social-image/${encodeURIComponent(rawId)}.png` : '/og/pilotos-og.png',"
  );
}

pilotPage = pilotPage.replace(
  /image:\s*`\/api\/pilot-avatar\/\$\{encodeURIComponent\(rawId\)\}`,/g,
  "image: `/api/pilot-social-image/${encodeURIComponent(rawId)}.png`,"
);

pilotPage = pilotPage.replace(
  /image:\s*`\/api\/pilot-social-image\/\$\{encodeURIComponent\(rawId\)\}\.png`,/g,
  "image: `/api/pilot-social-image/${encodeURIComponent(rawId)}.png`,"
);

write(pilotPagePath, pilotPage, originalPilotPage, 'v15-30-5');

console.log('');
console.log('[GC PILOT SOCIAL EXPRESS] Listo.');
console.log('[GC PILOT SOCIAL EXPRESS] Ejecuta ahora: npm run build');
console.log('[GC PILOT SOCIAL EXPRESS] Prueba luego: /api/pilot-social-image/27.png');
