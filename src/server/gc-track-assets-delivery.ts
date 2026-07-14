import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request } from 'express';
import { resolveGcTrackAssets } from './gc-track-assets-resolver';

type DeliveryOptions = { rootDir?: string };
type AssetKind = 'photo' | 'map';

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.avif', '.svg']);

function uniqueDirectories(values: string[]) {
  return values.map((value) => path.resolve(value))
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function publicRoots(rootDir: string) {
  return uniqueDirectories([
    rootDir,
    path.join(rootDir, 'client'),
    path.join(rootDir, 'public'),
    path.join(rootDir, 'dist'),
    path.join(rootDir, 'dist', 'client'),
    path.join(rootDir, '..'),
    path.join(rootDir, '..', 'public'),
    path.join(rootDir, '..', 'dist'),
    path.join(rootDir, '..', 'dist', 'client')
  ]);
}

function safeRelativePath(publicUrl: string) {
  const withoutQuery = String(publicUrl || '').split('?')[0].split('#')[0];
  if (!withoutQuery.startsWith('/')) return '';

  let decoded = '';
  try { decoded = decodeURIComponent(withoutQuery); } catch { return ''; }

  const relative = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!relative || relative.includes('\0')) return '';
  if (relative.split('/').some((segment) => segment === '..' || segment === '.')) return '';
  if (!IMAGE_EXTENSIONS.has(path.extname(relative).toLowerCase())) return '';
  return relative;
}

function isInsideRoot(candidate: string, root: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep);
}

function findPhysicalAsset(rootDir: string, publicUrl: string) {
  const relative = safeRelativePath(publicUrl);
  if (!relative) return null;

  for (const root of publicRoots(rootDir)) {
    const candidate = path.resolve(root, relative);
    if (!isInsideRoot(candidate, root)) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return { filePath: candidate, root, relative };
    } catch {
      // Continue with the next runtime root.
    }
  }
  return null;
}

function queryValues(req: Request) {
  return [req.query.track, req.query.trackRaw, req.query.name, req.query.event, req.query.hint]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean);
}

function selectedKind(req: Request): AssetKind {
  return String(req.query.kind || '').toLowerCase() === 'map' ? 'map' : 'photo';
}

export function registerGcTrackAssetDeliveryRoutes(app: Express, options: DeliveryOptions = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());

  app.get('/api/gc/track-assets/file', (req, res) => {
    const kind = selectedKind(req);
    const values = queryValues(req);
    const force = String(req.query.refresh || '') === '1';
    const resolved = resolveGcTrackAssets(values, { rootDir, force });
    const publicUrl = kind === 'map' ? resolved.map : resolved.photo;
    const physical = findPhysicalAsset(rootDir, publicUrl);

    res.setHeader('X-GC-Track-Asset-Kind', kind);
    res.setHeader('X-GC-Track-Asset-Resolver', 'online-delivery-v1');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');

    if (!publicUrl || !physical) {
      res.status(404).json({
        ok: false,
        message: 'Track asset not found.',
        kind,
        track: resolved.track,
        publicUrl,
        matchedPhoto: resolved.matchedPhoto,
        matchedMap: resolved.matchedMap
      });
      return;
    }

    res.setHeader('X-GC-Track-Asset-Url', publicUrl);
    res.sendFile(physical.filePath);
  });

  app.get('/api/runtime/status', (_req, res) => {
    const candidates = publicRoots(rootDir).map((candidate) => {
      let isDirectory = false;
      try { isDirectory = fs.statSync(candidate).isDirectory(); } catch { isDirectory = false; }
      return { path: candidate, exists: fs.existsSync(candidate), isDirectory };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      mode: 'gc-runtime-early-status-v1',
      rootDir,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      trackAssetDelivery: '/api/gc/track-assets/file',
      candidates
    });
  });
}
