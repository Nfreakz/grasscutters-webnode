import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readMotorsportArchiveStoreAsync, writeMotorsportArchiveStoreAsync } from '../lib/motorsport-archive/storage';

function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }
function compact(value: any) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function stripHtml(value: any) { return compact(String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')); }
function slugify(value: string) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'item'; }
function extFromContentType(contentType: string) { const t = String(contentType || '').toLowerCase(); if (t.includes('jpeg')) return '.jpg'; if (t.includes('png')) return '.png'; if (t.includes('svg')) return '.svg'; if (t.includes('webp')) return '.webp'; if (t.includes('gif')) return '.gif'; return ''; }
function extFromUrl(url: string) { const clean = String(url || '').split('?')[0]; const match = clean.match(/\.([a-z0-9]{2,5})$/i); return match ? '.' + match[1].toLowerCase() : ''; }
function boolish(value: any) { return ['1', 'true', 'yes', 'si', 'sí', true].includes(value); }
function inferCategory(item: any) { return item?.category || item?.type || 'general'; }
function ensureMediaArray(item: any) { if (!Array.isArray(item.media)) item.media = []; return item.media; }

export function getArchiveMediaRoot(rootDir: string) {
  const configured = process.env.ARCHIVE_MEDIA_DIR?.trim();
  if (!configured) return path.join(rootDir, 'public', 'archive-media');
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

export function getArchiveMediaPublicUrl() {
  return (process.env.ARCHIVE_MEDIA_PUBLIC_URL?.trim() || '/archive-media').replace(/\/$/, '') || '/archive-media';
}

function extractWikimediaFileName(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = decodeURIComponent(url.pathname);
    if (host.includes('commons.wikimedia.org')) {
      const fileMatch = pathname.match(/\/wiki\/File:(.+)$/i);
      if (fileMatch) return fileMatch[1];
      const specialMatch = pathname.match(/\/wiki\/Special:(?:FilePath|Redirect\/file)\/(.+)$/i);
      if (specialMatch) return specialMatch[1];
    }
    if (host.includes('upload.wikimedia.org')) {
      const parts = pathname.split('/').filter(Boolean);
      const thumbIndex = parts.indexOf('thumb');
      if (thumbIndex >= 0 && parts.length > thumbIndex + 3) return parts[thumbIndex + 3];
      if (parts.length >= 4) return parts[parts.length - 1];
    }
  } catch { return null; }
  return null;
}
function metaValue(ext: any, key: string) { return stripHtml(ext?.[key]?.value ?? ''); }

async function inspectWikimediaImage(rawUrl: string) {
  const fileName = extractWikimediaFileName(rawUrl);
  if (!fileName) return null;
  const title = fileName.startsWith('File:') ? fileName : `File:${fileName}`;
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('origin', '*');
  api.searchParams.set('titles', title);
  api.searchParams.set('prop', 'imageinfo');
  api.searchParams.set('iiprop', 'url|extmetadata|mime|size');
  api.searchParams.set('iiurlwidth', '1600');
  const res = await fetch(api.toString(), { headers: { 'user-agent': 'GrassCutters Archivo Motorsport/1.0' } });
  if (!res.ok) throw new Error(`Wikimedia API ${res.status}`);
  const json: any = await res.json();
  const page = Object.values(json?.query?.pages || {})[0] as any;
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const ext = info.extmetadata || {};
  const license = metaValue(ext, 'LicenseShortName') || metaValue(ext, 'UsageTerms');
  const author = metaValue(ext, 'Artist') || metaValue(ext, 'Author');
  const credit = metaValue(ext, 'Credit');
  const objectName = metaValue(ext, 'ObjectName') || title.replace(/^File:/i, '');
  const description = metaValue(ext, 'ImageDescription') || objectName;
  return {
    provider: 'wikimedia',
    imageUrl: info.thumburl || info.url || rawUrl,
    originalUrl: info.url || rawUrl,
    source: 'Wikimedia Commons',
    sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title).replace(/%3A/i, ':')}`,
    author,
    license,
    licenseUrl: metaValue(ext, 'LicenseUrl'),
    credit,
    alt: stripHtml(description || objectName),
    contentType: info.mime || ''
  };
}
async function inspectImageUrl(rawUrl: string) {
  const imageUrl = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(imageUrl)) throw new Error('La URL debe empezar por http:// o https://.');
  const wikimedia = await inspectWikimediaImage(imageUrl).catch(() => null);
  if (wikimedia) return wikimedia;
  return { provider: 'external', imageUrl, originalUrl: imageUrl, source: 'URL externa', sourceUrl: imageUrl, author: '', license: '', licenseUrl: '', credit: '', alt: '', contentType: '' };
}
async function downloadImage(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'GrassCutters Archivo Motorsport/1.0' } });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) return { ok: false, status: res.status, reason: `http-${res.status}`, contentType } as any;
    if (!/^image\//i.test(contentType)) return { ok: false, status: res.status, reason: 'not-image', contentType } as any;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, contentType, bytes: buffer, finalUrl: res.url } as any;
  } catch (error: any) {
    return { ok: false, status: 0, reason: error?.name === 'AbortError' ? 'timeout' : 'fetch-error', contentType: '' } as any;
  } finally { clearTimeout(timer); }
}

function sendArchiveMediaFile(rootDir: string, req: any, res: any, next: any) {
  const publicUrl = getArchiveMediaPublicUrl();
  const rawPath = decodeURIComponent(String(req.path || '').replace(publicUrl, '').replace(/^\//, ''));
  const mediaRoot = getArchiveMediaRoot(rootDir);
  const filePath = path.resolve(mediaRoot, rawPath);
  if (!filePath.startsWith(path.resolve(mediaRoot))) return res.status(403).send('Forbidden');
  if (!fs.existsSync(filePath)) return next();
  return res.sendFile(filePath);
}

export function registerMotorsportArchiveImageUrlRoutes(app: any, { rootDir }: { rootDir: string }) {
  const mediaRoot = getArchiveMediaRoot(rootDir);
  const mediaPublicUrl = getArchiveMediaPublicUrl();
  ensureDir(mediaRoot);
  

  app.post('/api/admin/archive/media/inspect-url', async (req: any, res: any) => {
    try {
      const imageUrl = String(req.body?.imageUrl || req.body?.url || '').trim();
      const metadata = await inspectImageUrl(imageUrl);
      return res.json({ ok: true, metadata });
    } catch (error: any) {
      return res.status(400).json({ ok: false, error: error?.message || 'No se pudo inspeccionar la URL.' });
    }
  });

  app.post('/api/admin/archive/items/:id/media/from-url', async (req: any, res: any) => {
    const itemId = String(req.params.id || '').trim();
    const originalImageUrl = String(req.body?.imageUrl || req.body?.url || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Falta el ID de la ficha.' });
    if (!/^https?:\/\//i.test(originalImageUrl)) return res.status(400).json({ ok: false, error: 'La URL de imagen debe empezar por http:// o https://.' });

    const metadata = await inspectImageUrl(originalImageUrl).catch(() => null);
    const downloadUrl = metadata?.imageUrl || originalImageUrl;
    const store = await readMotorsportArchiveStoreAsync(rootDir);
    const item = store.items.find((candidate: any) => String(candidate.id) === itemId);
    if (!item) return res.status(404).json({ ok: false, error: 'No se ha encontrado la ficha.' });

    const result = await downloadImage(downloadUrl);
    if (!result.ok) return res.status(400).json({ ok: false, error: `No se pudo descargar la imagen (${result.reason}).`, detail: result, metadata });

    const category = slugify(inferCategory(item));
    const itemSlug = slugify(item.slug || item.title || item.id || 'item');
    const folder = path.join(mediaRoot, category, itemSlug);
    ensureDir(folder);

    const ext = extFromContentType(result.contentType) || extFromUrl(result.finalUrl || downloadUrl) || '.jpg';
    const hash = crypto.createHash('sha1').update(String(result.finalUrl || downloadUrl)).digest('hex').slice(0, 10);
    const fileName = `${itemSlug}-${hash}${ext}`;
    const absoluteFile = path.join(folder, fileName);
    const publicUrl = `${mediaPublicUrl}/${category}/${itemSlug}/${fileName}`;
    const relFile = path.relative(rootDir, absoluteFile).split(path.sep).join('/');
    fs.writeFileSync(absoluteFile, result.bytes);

    const media = ensureMediaArray(item);
    const makePrimary = boolish(req.body?.makePrimary) || media.length === 0;
    const locked = boolish(req.body?.locked) || makePrimary;
    const mediaId = `media-${Date.now()}`;
    const mediaItem = {
      id: mediaId,
      type: 'photo',
      url: publicUrl,
      alt: compact(req.body?.alt) || metadata?.alt || item.title || 'Imagen del Archivo Motorsport',
      source: compact(req.body?.source) || metadata?.source || 'URL externa',
      sourceUrl: compact(req.body?.sourceUrl) || metadata?.sourceUrl || originalImageUrl,
      author: compact(req.body?.author) || metadata?.author || '',
      license: compact(req.body?.license) || metadata?.license || '',
      isMain: Boolean(makePrimary),
      locked: Boolean(locked),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      localPath: relFile,
      originalUrl: originalImageUrl,
      resolvedUrl: downloadUrl,
      contentType: result.contentType,
      provider: metadata?.provider || 'external',
      licenseUrl: metadata?.licenseUrl || '',
      credit: metadata?.credit || ''
    };
    if (mediaItem.isMain) for (const m of media) m.isMain = false;
    media.push(mediaItem as any);
    await writeMotorsportArchiveStoreAsync(store, rootDir);
    return res.json({ ok: true, itemId, itemTitle: item.title, media: mediaItem, metadata });
  });
}
