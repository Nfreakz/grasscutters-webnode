import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

const ALLOWED_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);

type MotorsportArchiveMediaOptions = {
  rootDir: string;
};

type ArchiveItem = Record<string, any>;

type ArchiveStore = {
  version: number;
  updatedAt?: string;
  items: ArchiveItem[];
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'archivo';
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function getStorePath(rootDir: string) {
  return process.env.MOTORSPORT_ARCHIVE_PATH?.trim()
    ? path.resolve(rootDir, process.env.MOTORSPORT_ARCHIVE_PATH.trim())
    : path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function readStore(rootDir: string): ArchiveStore {
  const filePath = getStorePath(rootDir);
  const store = readJson<ArchiveStore>(filePath, { version: 1, updatedAt: new Date().toISOString(), items: [] });
  if (!Array.isArray(store.items)) store.items = [];
  return store;
}

function writeStore(rootDir: string, store: ArchiveStore) {
  store.version = store.version || 1;
  store.updatedAt = new Date().toISOString();
  writeJson(getStorePath(rootDir), store);
}

function sanitizeOriginalName(name: string) {
  const parsed = path.parse(name || 'imagen');
  return slugify(parsed.name || 'imagen');
}

function decodeDataUrl(dataUrl: unknown) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return null;
  if (buffer.length > 6 * 1024 * 1024) return null;
  return { mime, buffer };
}

function extensionForMime(mime: string, originalName: string) {
  const originalExt = path.extname(originalName || '').toLowerCase();
  if (ALLOWED_EXT.has(originalExt)) return originalExt === '.jpeg' ? '.jpg' : originalExt;
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

function normalizeMedia(media: any[] | undefined) {
  return Array.isArray(media) ? media : [];
}

function mediaUrlToPath(rootDir: string, url: string) {
  if (!url.startsWith('/archive-media/')) return null;
  return path.join(rootDir, 'public', url.replace(/^\//, ''));
}

function publicMediaRoot(rootDir: string) {
  return path.join(rootDir, 'public', 'archive-media');
}

export function registerMotorsportArchiveMediaRoutes(app: Express, options: MotorsportArchiveMediaOptions) {
  const { rootDir } = options;

  app.post('/api/admin/archive/items/:id/media', (req: Request, res: Response) => {
    try {
      const itemId = String(req.params.id || '').trim();
      const { dataUrl, fileName = 'imagen', alt = '', source = 'GrassCutters Racing', author = '', license = 'Uso propio / pendiente de revisar', type = 'image', makeMain = true, locked = true } = req.body || {};
      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) return res.status(400).json({ ok: false, message: 'Imagen no válida. Usa SVG, PNG, JPG o WEBP de máximo 6 MB.' });

      const store = readStore(rootDir);
      const item = store.items.find((entry) => String(entry.id) === itemId);
      if (!item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });

      const ext = extensionForMime(decoded.mime, String(fileName));
      const itemSlug = slugify(item.slug || item.title || item.id);
      const folder = path.join(publicMediaRoot(rootDir), slugify(item.type || item.category || 'item'), itemSlug);
      ensureDir(folder);

      const safeName = sanitizeOriginalName(String(fileName));
      const finalName = `${safeName}-${crypto.randomBytes(5).toString('hex')}${ext}`;
      const absolutePath = path.join(folder, finalName);
      fs.writeFileSync(absolutePath, decoded.buffer);

      const publicUrl = '/' + path.relative(path.join(rootDir, 'public'), absolutePath).split(path.sep).join('/');
      const mediaId = crypto.randomUUID();
      const mediaItem = {
        id: mediaId,
        type,
        url: publicUrl,
        alt: String(alt || item.title || 'Imagen del Archivo Motorsport'),
        source: String(source || ''),
        author: String(author || ''),
        license: String(license || ''),
        isMain: Boolean(makeMain),
        locked: Boolean(locked),
        local: true,
        createdAt: new Date().toISOString(),
        originalName: String(fileName || '')
      };

      const media = normalizeMedia(item.media);
      if (makeMain) {
        for (const image of media) image.isMain = false;
      }
      media.unshift(mediaItem);
      item.media = media;
      item.coverUrl = makeMain ? publicUrl : (item.coverUrl || media.find((image) => image.isMain)?.url || publicUrl);
      item.updatedAt = new Date().toISOString();
      writeStore(rootDir, store);

      return res.json({ ok: true, item, media: mediaItem });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error subiendo imagen.' });
    }
  });

  app.patch('/api/admin/archive/items/:id/media/:mediaId', (req: Request, res: Response) => {
    try {
      const itemId = String(req.params.id || '').trim();
      const mediaId = String(req.params.mediaId || '').trim();
      const store = readStore(rootDir);
      const item = store.items.find((entry) => String(entry.id) === itemId);
      if (!item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
      const media = normalizeMedia(item.media);
      const mediaItem = media.find((entry) => String(entry.id) === mediaId);
      if (!mediaItem) return res.status(404).json({ ok: false, message: 'Imagen no encontrada.' });

      if ('alt' in req.body) mediaItem.alt = String(req.body.alt || '');
      if ('source' in req.body) mediaItem.source = String(req.body.source || '');
      if ('author' in req.body) mediaItem.author = String(req.body.author || '');
      if ('license' in req.body) mediaItem.license = String(req.body.license || '');
      if ('locked' in req.body) mediaItem.locked = Boolean(req.body.locked);
      if (req.body?.makeMain === true) {
        for (const image of media) image.isMain = false;
        mediaItem.isMain = true;
        item.coverUrl = mediaItem.url;
      }
      item.updatedAt = new Date().toISOString();
      writeStore(rootDir, store);
      return res.json({ ok: true, item, media: mediaItem });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error actualizando imagen.' });
    }
  });

  app.delete('/api/admin/archive/items/:id/media/:mediaId', (req: Request, res: Response) => {
    try {
      const itemId = String(req.params.id || '').trim();
      const mediaId = String(req.params.mediaId || '').trim();
      const store = readStore(rootDir);
      const item = store.items.find((entry) => String(entry.id) === itemId);
      if (!item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
      const media = normalizeMedia(item.media);
      const index = media.findIndex((entry) => String(entry.id) === mediaId);
      if (index < 0) return res.status(404).json({ ok: false, message: 'Imagen no encontrada.' });
      const [removed] = media.splice(index, 1);
      if (req.query.deleteFile === '1' && removed?.url) {
        const localPath = mediaUrlToPath(rootDir, String(removed.url));
        if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
      }
      item.media = media;
      if (item.coverUrl === removed?.url) {
        const nextMain = media.find((entry) => entry.isMain) || media[0];
        item.coverUrl = nextMain?.url || '';
        if (nextMain) nextMain.isMain = true;
      }
      item.updatedAt = new Date().toISOString();
      writeStore(rootDir, store);
      return res.json({ ok: true, item, removed });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'Error eliminando imagen.' });
    }
  });
}
