import type express from 'express';
import {
  archiveMotorsportArchiveItemAsync,
  deleteMotorsportArchiveItemAsync,
  getMotorsportArchiveStorageStatus,
  readMotorsportArchiveStoreAsync,
  upsertMotorsportArchiveItemAsync,
  writeMotorsportArchiveStoreAsync
} from '../lib/motorsport-archive/storage';
import { normalizeMotorsportArchiveItem } from '../lib/motorsport-archive/schema';

type RegisterOptions = { rootDir: string };

function allowLocalAdmin(req: express.Request) {
  if (process.env.GC_ARCHIVO_ADMIN_OPEN === 'true') return true;
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'localhost') return true;
  const host = String(req.headers.host || '');
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

function protectMotorsportArchive(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (allowLocalAdmin(req)) return next();
  // Mantiene el comportamiento seguro actual. En producción hay que conectarlo al requireAdmin real.
  return res.status(403).json({ ok: false, message: 'Archivo Motorsport API desactivada en producción. Integra requireAdmin antes de abrir escrituras.' });
}

export function registerMotorsportArchiveRoutes(app: express.Express, options: RegisterOptions) {
  const rootDir = options.rootDir;

  app.get('/api/admin/archive/status', protectMotorsportArchive, async (_req, res) => {
    try {
      const store = await readMotorsportArchiveStoreAsync(rootDir);
      const storage = await getMotorsportArchiveStorageStatus(rootDir);
      const counts = store.items.reduce((acc: Record<string, number>, item) => {
        acc.total += 1;
        acc[item.category] = (acc[item.category] || 0) + 1;
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, { total: 0, published: 0, draft: 0, hidden: 0 });
      res.json({ ok: true, updatedAt: store.updatedAt, counts, storage });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || 'Error leyendo Archivo Motorsport.' });
    }
  });

  app.get('/api/admin/archive/items', protectMotorsportArchive, async (req, res) => {
    try {
      const store = await readMotorsportArchiveStoreAsync(rootDir);
      const category = String(req.query.category || '').trim();
      const q = String(req.query.q || '').trim().toLowerCase();
      let items = store.items;
      if (category) items = items.filter((item) => item.category === category);
      if (q) items = items.filter((item) => [item.title, item.slug, item.summary, item.body].join(' ').toLowerCase().includes(q));
      res.json({ ok: true, items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || 'Error leyendo fichas.' });
    }
  });

  app.get('/api/admin/archive/items/:id', protectMotorsportArchive, async (req, res) => {
    const store = await readMotorsportArchiveStoreAsync(rootDir);
    const item = store.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
    return res.json({ ok: true, item });
  });

  app.post('/api/admin/archive/items', protectMotorsportArchive, async (req, res) => {
    const item = normalizeMotorsportArchiveItem(req.body || {});
    const result = await upsertMotorsportArchiveItemAsync(item, rootDir);
    res.json({ ok: true, item: result.item, updatedAt: result.store.updatedAt });
  });

  app.put('/api/admin/archive/items/:id', protectMotorsportArchive, async (req, res) => {
    const store = await readMotorsportArchiveStoreAsync(rootDir);
    const existing = store.items.find((entry) => entry.id === req.params.id);
    if (!existing) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
    const item = normalizeMotorsportArchiveItem({ ...existing, ...(req.body || {}), id: existing.id, createdAt: existing.createdAt });
    const result = await upsertMotorsportArchiveItemAsync(item, rootDir);
    return res.json({ ok: true, item: result.item, updatedAt: result.store.updatedAt });
  });

  app.delete('/api/admin/archive/items/:id', protectMotorsportArchive, async (req, res) => {
    const hard = String(req.query.hard || '').trim() === '1';
    const result = hard
      ? await deleteMotorsportArchiveItemAsync(req.params.id, rootDir)
      : await archiveMotorsportArchiveItemAsync(req.params.id, rootDir);
    if (!result.item) return res.status(404).json({ ok: false, message: 'Ficha no encontrada.' });
    return res.json({ ok: true, item: result.item, deleted: hard, updatedAt: result.store.updatedAt });
  });

  app.post('/api/admin/archive/reset-demo', protectMotorsportArchive, async (_req, res) => {
    const now = new Date().toISOString();
    const demo = await writeMotorsportArchiveStoreAsync({
      version: 1,
      updatedAt: now,
      items: [
        {
          id: 'circuit-monza',
          category: 'circuit',
          slug: 'autodromo-nazionale-monza',
          title: 'Autodromo Nazionale Monza',
          status: 'draft',
          summary: 'Circuito italiano histórico, ligado a la velocidad pura y a las grandes carreras europeas.',
          body: 'Ficha base de prueba. Desde el admin podrás sustituir este texto por una descripción revisada y añadir imágenes locales creadas o seleccionadas por GrassCutters.',
          facts: [
            { label: 'País', value: 'Italia' },
            { label: 'Tipo', value: 'Permanente' },
            { label: 'Longitud', value: '5.793 km' },
            { label: 'Año', value: '1922' }
          ],
          media: [],
          relatedIds: [],
          seoTitle: '',
          seoDescription: '',
          createdAt: now,
          updatedAt: now
        }
      ]
    }, rootDir);
    res.json({ ok: true, store: demo });
  });
}
