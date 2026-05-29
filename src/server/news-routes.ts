import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';

type RequireAdmin = (req: Request, res: Response) => Promise<any | null>;

type NewsPost = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'hidden';
  category: string;
  excerpt: string;
  body: string;
  image: string;
  imageAlt: string;
  href: string;
  featured: boolean;
  pinned: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isMysql() {
  const driver = String(process.env.NEWS_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  return driver === 'mysql' || driver === 'mariadb';
}

function text(value: unknown, fallback = '') {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on', 'published', 'destacado'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'hidden'].includes(raw)) return false;
  return fallback;
}

function slugify(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120) || 'noticia';
}

function mysqlDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 23).replace('T', ' ')
    : date.toISOString().slice(0, 23).replace('T', ' ');
}

function resolveStoragePath(rootDir: string, value: string) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function appDataRoot(rootDir: string) {
  const configured = process.env.APP_DATA_DIR?.trim();
  return configured ? resolveStoragePath(rootDir, configured) : path.join(rootDir, 'data');
}

function newsJsonPath(rootDir: string) {
  const configured = process.env.NEWS_DATA_PATH?.trim() || process.env.APP_NEWS_PATH?.trim();
  if (configured) return resolveStoragePath(rootDir, configured);
  return path.join(appDataRoot(rootDir), 'app', 'news-posts.json');
}

function emptyStore() {
  return { version: 1, updatedAt: nowIso(), posts: [] as NewsPost[] };
}

function newsMediaConfig(rootDir: string) {
  const configuredDir = process.env.NEWS_MEDIA_DIR?.trim() || process.env.ARCHIVE_MEDIA_DIR?.trim();
  const uploadDir = configuredDir
    ? (path.isAbsolute(configuredDir) ? configuredDir : path.resolve(rootDir, configuredDir))
    : path.join(rootDir, 'public', 'uploads', 'news');

  const publicBase = (process.env.NEWS_MEDIA_PUBLIC_BASE || process.env.ARCHIVE_MEDIA_PUBLIC_BASE || '/uploads/news')
    .replace(/\/+$/, '');

  return { uploadDir, publicBase };
}

function extensionFromMime(mime: string) {
  const clean = String(mime || '').toLowerCase();
  if (clean.includes('jpeg') || clean.includes('jpg')) return 'jpg';
  if (clean.includes('png')) return 'png';
  if (clean.includes('webp')) return 'webp';
  if (clean.includes('svg')) return 'svg';
  return 'bin';
}

function parseDataUrl(dataUrl: string) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    const error: any = new Error('Formato de imagen no válido.');
    error.statusCode = 400;
    throw error;
  }

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const maxBytes = Number(process.env.NEWS_MEDIA_MAX_BYTES || process.env.ARCHIVE_MEDIA_MAX_BYTES || 8 * 1024 * 1024);

  if (!buffer.length) {
    const error: any = new Error('Imagen vacía.');
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > maxBytes) {
    const error: any = new Error(`La imagen supera el límite permitido (${(maxBytes / 1024 / 1024).toFixed(1)} MB).`);
    error.statusCode = 413;
    throw error;
  }

  return { mime, buffer, extension: extensionFromMime(mime) };
}

function safeFileBase(value: unknown) {
  return slugify(String(value || 'noticia')).slice(0, 90) || 'noticia';
}


function safeDate(value: unknown, fallback = nowIso()) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function normalizeStatus(value: unknown, fallback: NewsPost['status'] = 'draft'): NewsPost['status'] {
  const raw = String(value || '').trim().toLowerCase();
  if (['published', 'publicado', 'visible'].includes(raw)) return 'published';
  if (['hidden', 'oculto'].includes(raw)) return 'hidden';
  if (['draft', 'borrador'].includes(raw)) return 'draft';
  return fallback;
}

function normalizePost(input: any = {}, existing?: Partial<NewsPost> | null): NewsPost {
  const title = text(input.title ?? input.titulo ?? input.name ?? existing?.title, 'Noticia sin título').slice(0, 180);
  const slug = slugify(input.slug ?? existing?.slug ?? title);
  const status = normalizeStatus(input.status ?? input.estado, existing?.status || 'draft');
  const createdAt = existing?.createdAt || safeDate(input.createdAt, nowIso());
  const publishedAt = safeDate(input.publishedAt ?? input.date ?? input.fecha ?? existing?.publishedAt, status === 'published' ? nowIso() : createdAt);

  return {
    id: text(existing?.id || input.id, `news-${crypto.randomUUID()}`),
    title,
    slug,
    status,
    category: text(input.category ?? input.categoria ?? existing?.category, 'Paddock').slice(0, 80),
    excerpt: text(input.excerpt ?? input.summary ?? input.resumen ?? existing?.excerpt).slice(0, 320),
    body: text(input.body ?? input.content ?? input.contenido ?? existing?.body).slice(0, 20000),
    image: text(input.image ?? input.imageUrl ?? input.imagen ?? existing?.image).slice(0, 800),
    imageAlt: text(input.imageAlt ?? input.alt ?? existing?.imageAlt ?? title).slice(0, 180),
    href: text(input.href ?? input.linkUrl ?? input.link ?? existing?.href).slice(0, 800),
    featured: bool(input.featured ?? input.destacado, existing?.featured || false),
    pinned: bool(input.pinned ?? input.fijado, existing?.pinned || false),
    publishedAt,
    createdAt,
    updatedAt: nowIso(),
  };
}

function publicPost(post: NewsPost) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: post.category,
    excerpt: post.excerpt,
    body: post.body,
    image: post.image,
    imageAlt: post.imageAlt,
    href: post.href,
    featured: post.featured,
    pinned: post.pinned,
    publishedAt: post.publishedAt,
    date: post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
    updatedAt: post.updatedAt,
  };
}

function sortPosts(posts: NewsPost[]) {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)) || a.title.localeCompare(b.title, 'es');
  });
}

function readJsonStore(rootDir: string) {
  const filePath = newsJsonPath(rootDir);
  if (!fs.existsSync(filePath)) return { filePath, store: emptyStore() };

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const posts = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : [];
    return {
      filePath,
      store: {
        version: 1,
        updatedAt: text(parsed?.updatedAt, nowIso()),
        posts: posts.map((post: any) => normalizePost(post, post)),
      },
    };
  } catch {
    return { filePath, store: emptyStore() };
  }
}

function writeJsonStore(rootDir: string, posts: NewsPost[]) {
  const filePath = newsJsonPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const store = { version: 1, updatedAt: nowIso(), posts: sortPosts(posts) };
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  return { filePath, store };
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);
  if (!host || !database || !user) throw new Error('Faltan variables MySQL para Noticias.');

  const mysql = await importMysql2();
  return mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
}

async function ensureMysqlSchema(connection: any) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS gc_news_posts (
      id VARCHAR(120) NOT NULL PRIMARY KEY,
      slug VARCHAR(160) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      post_json LONGTEXT NOT NULL,
      published_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_gc_news_status (status),
      INDEX idx_gc_news_published_at (published_at),
      INDEX idx_gc_news_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function mysqlList() {
  const connection = await getConnection();
  try {
    await ensureMysqlSchema(connection);
    const [rows] = await connection.execute('SELECT id, slug, title, status, post_json, published_at, updated_at FROM gc_news_posts ORDER BY COALESCE(published_at, updated_at) DESC');
    return (Array.isArray(rows) ? rows : []).map((row: any) => {
      try {
        const parsed = JSON.parse(row.post_json || '{}');
        return normalizePost({ ...parsed, id: parsed.id || row.id, slug: parsed.slug || row.slug, title: parsed.title || row.title, status: parsed.status || row.status }, parsed);
      } catch {
        return normalizePost({ id: row.id, slug: row.slug, title: row.title, status: row.status });
      }
    });
  } finally {
    await connection.end();
  }
}

async function mysqlFind(idOrSlug: string) {
  const connection = await getConnection();
  try {
    await ensureMysqlSchema(connection);
    const [rows] = await connection.execute('SELECT id, slug, title, status, post_json FROM gc_news_posts WHERE id = ? OR slug = ? LIMIT 1', [idOrSlug, idOrSlug]);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.post_json || '{}');
      return normalizePost({ ...parsed, id: parsed.id || row.id, slug: parsed.slug || row.slug, title: parsed.title || row.title, status: parsed.status || row.status }, parsed);
    } catch {
      return normalizePost({ id: row.id, slug: row.slug, title: row.title, status: row.status });
    }
  } finally {
    await connection.end();
  }
}

async function mysqlSave(raw: any, id?: string) {
  const connection = await getConnection();
  try {
    await ensureMysqlSchema(connection);
    const existing = id ? await mysqlFind(id) : null;
    const post = normalizePost({ ...(existing || {}), ...(raw || {}), id: existing?.id || raw?.id || id || undefined }, existing);
    await connection.execute(
      `INSERT INTO gc_news_posts (id, slug, title, status, post_json, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         slug = VALUES(slug),
         title = VALUES(title),
         status = VALUES(status),
         post_json = VALUES(post_json),
         published_at = VALUES(published_at),
         updated_at = VALUES(updated_at)`,
      [post.id, post.slug, post.title, post.status, JSON.stringify(post), post.publishedAt ? mysqlDate(post.publishedAt) : null, mysqlDate(post.createdAt), mysqlDate(post.updatedAt)]
    );
    return post;
  } finally {
    await connection.end();
  }
}

async function mysqlDelete(id: string) {
  const existing = await mysqlFind(id);
  if (!existing) return { deleted: false, post: null };
  const connection = await getConnection();
  try {
    await ensureMysqlSchema(connection);
    const [result]: any = await connection.execute('DELETE FROM gc_news_posts WHERE id = ?', [existing.id]);
    return { deleted: Number(result?.affectedRows || 0) > 0, post: existing };
  } finally {
    await connection.end();
  }
}

async function listPosts(rootDir: string) {
  if (isMysql()) return { posts: await mysqlList(), storage: { source: 'mysql', table: 'gc_news_posts' } };

  const { filePath, store } = readJsonStore(rootDir);
  return { posts: store.posts, storage: { source: 'json', path: filePath, persistent: Boolean(process.env.APP_DATA_DIR || process.env.NEWS_DATA_PATH || process.env.APP_NEWS_PATH) } };
}

async function findPost(rootDir: string, id: string) {
  if (isMysql()) return await mysqlFind(id);
  const { store } = readJsonStore(rootDir);
  const post = store.posts.find((entry) => entry.id === id || entry.slug === id);
  return post || null;
}

async function savePost(rootDir: string, raw: any, id?: string) {
  if (isMysql()) return { post: await mysqlSave(raw, id), storage: { source: 'mysql', table: 'gc_news_posts' } };

  const { store } = readJsonStore(rootDir);
  const index = id ? store.posts.findIndex((entry) => entry.id === id || entry.slug === id) : -1;
  const existing = index >= 0 ? store.posts[index] : null;
  const post = normalizePost({ ...(existing || {}), ...(raw || {}), id: existing?.id || raw?.id || id || undefined }, existing);
  if (index >= 0) store.posts[index] = post;
  else store.posts.unshift(post);
  const result = writeJsonStore(rootDir, store.posts);
  return { post, storage: { source: 'json', path: result.filePath, persistent: Boolean(process.env.APP_DATA_DIR || process.env.NEWS_DATA_PATH || process.env.APP_NEWS_PATH) } };
}

async function deletePost(rootDir: string, id: string) {
  if (isMysql()) return { ...(await mysqlDelete(id)), storage: { source: 'mysql', table: 'gc_news_posts' } };

  const { store } = readJsonStore(rootDir);
  const before = store.posts.length;
  const post = store.posts.find((entry) => entry.id === id || entry.slug === id) || null;
  const posts = store.posts.filter((entry) => entry.id !== id && entry.slug !== id);
  const result = writeJsonStore(rootDir, posts);
  return { deleted: posts.length < before, post, storage: { source: 'json', path: result.filePath, persistent: Boolean(process.env.APP_DATA_DIR || process.env.NEWS_DATA_PATH || process.env.APP_NEWS_PATH) } };
}

function demoPosts() {
  return [
    normalizePost({
      id: 'news-demo-hud-lite',
      title: 'HUD Lite recibe una actualización de rendimiento',
      slug: 'hud-lite-actualizacion-rendimiento',
      status: 'draft',
      category: 'Update',
      excerpt: 'Nuevos ajustes de compatibilidad, mejoras visuales y una base más ligera para sesiones largas.',
      body: 'Entrada de ejemplo para validar el sistema de noticias editable.',
      image: '/ui/home2/gc-home2-news-hud.svg',
      featured: true,
      publishedAt: nowIso(),
    }),
    normalizePost({
      id: 'news-demo-combo-week',
      title: 'Nuevo combo semanal en pruebas',
      slug: 'nuevo-combo-semanal-pruebas',
      status: 'draft',
      category: 'Comunidad',
      excerpt: 'La comunidad prueba una combinación centrada en ritmo constante y referencias comparables.',
      body: 'Entrada de ejemplo para validar el sistema de noticias editable.',
      image: '/ui/home2/gc-home2-news-combo.svg',
      featured: true,
      publishedAt: nowIso(),
    }),
  ];
}

export function registerNewsRoutes(app: Express, { rootDir, requireAdmin }: { rootDir: string; requireAdmin: RequireAdmin }) {
  app.get(['/api/news', '/api/noticias'], async (req: Request, res: Response) => {
    try {
      const result = await listPosts(rootDir);
      let posts = sortPosts(result.posts).filter((post) => post.status === 'published');
      if (String(req.query.featured || '').toLowerCase() === '1' || String(req.query.featured || '').toLowerCase() === 'true') {
        const featured = posts.filter((post) => post.featured || post.pinned);
        if (featured.length) posts = featured;
      }
      const category = text(req.query.category);
      if (category) posts = posts.filter((post) => post.category.toLowerCase() === category.toLowerCase());
      const limit = Math.max(1, Math.min(Number(req.query.limit || 20) || 20, 100));
      return res.json({ ok: true, posts: posts.slice(0, limit).map(publicPost), count: posts.length, storage: result.storage, api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudieron cargar las noticias.' });
    }
  });

  app.get(['/api/news/:slug', '/api/noticias/:slug'], async (req: Request, res: Response) => {
    try {
      const post = await findPost(rootDir, String(req.params.slug || ''));
      if (!post || post.status !== 'published') return res.status(404).json({ ok: false, message: 'Noticia no encontrada.' });
      return res.json({ ok: true, post: publicPost(post), api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudo cargar la noticia.' });
    }
  });

  app.get('/api/admin/news', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const result = await listPosts(rootDir);
      const posts = sortPosts(result.posts);
      return res.json({
        ok: true,
        posts,
        count: posts.length,
        published: posts.filter((post) => post.status === 'published').length,
        drafts: posts.filter((post) => post.status !== 'published').length,
        storage: result.storage,
        api: 'gc-news-v2'
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudieron cargar las noticias.' });
    }
  });

  app.get('/api/admin/news/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const post = await findPost(rootDir, String(req.params.id || ''));
      if (!post) return res.status(404).json({ ok: false, message: 'Noticia no encontrada.' });
      return res.json({ ok: true, post, api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudo cargar la noticia.' });
    }
  });

  async function save(req: Request, res: Response) {
    if (!(await requireAdmin(req, res))) return;
    try {
      const result = await savePost(rootDir, req.body || {}, req.params.id ? String(req.params.id) : undefined);
      return res.json({ ok: true, ...result, api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(400).json({ ok: false, message: error?.message || 'No se pudo guardar la noticia.' });
    }
  }

  app.post('/api/admin/news', save);
  app.put('/api/admin/news/:id', save);
  app.patch('/api/admin/news/:id', save);

  app.delete('/api/admin/news/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const result = await deletePost(rootDir, String(req.params.id || ''));
      if (!result.deleted) return res.status(404).json({ ok: false, deleted: false, message: 'Noticia no encontrada.' });
      return res.json({ ok: true, ...result, api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(400).json({ ok: false, message: error?.message || 'No se pudo borrar la noticia.' });
    }
  });

  app.post('/api/admin/news/image-upload', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const dataUrl = String(req.body?.dataUrl || req.body?.image || '');
      const title = text(req.body?.title || req.body?.fileName || 'noticia');
      const parsed = parseDataUrl(dataUrl);
      const cfg = newsMediaConfig(rootDir);
      fs.mkdirSync(cfg.uploadDir, { recursive: true });

      const fileName = `${new Date().toISOString().slice(0, 10)}-${safeFileBase(title)}-${crypto.randomBytes(4).toString('hex')}.${parsed.extension}`;
      const filePath = path.join(cfg.uploadDir, fileName);
      fs.writeFileSync(filePath, parsed.buffer);

      const publicUrl = `${cfg.publicBase}/${fileName}`.replace(/\/+/g, '/');
      return res.json({
        ok: true,
        url: publicUrl,
        localUrl: publicUrl,
        fileName,
        mime: parsed.mime,
        sizeBytes: parsed.buffer.length,
        storage: { source: 'file', path: filePath, publicBase: cfg.publicBase },
        api: 'gc-news-v2'
      });
    } catch (error: any) {
      return res.status(error?.statusCode || 400).json({ ok: false, message: error?.message || 'No se pudo subir la imagen.' });
    }
  });

  app.post('/api/admin/news/demo', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      let created = 0;
      let skipped = 0;
      for (const post of demoPosts()) {
        const existing = await findPost(rootDir, post.id);
        if (existing) { skipped += 1; continue; }
        await savePost(rootDir, post);
        created += 1;
      }
      const result = await listPosts(rootDir);
      return res.json({ ok: true, created, skipped, posts: sortPosts(result.posts), storage: result.storage, api: 'gc-news-v2' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudo crear la demo.' });
    }
  });
}
