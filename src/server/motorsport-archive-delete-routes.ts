import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';

type ArchiveItem = Record<string, any>;
type ArchiveStore = {
  version?: number;
  updatedAt?: string;
  items?: ArchiveItem[];
  [key: string]: any;
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveMaybeRooted(rootDir: string, value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

function getArchiveStorePath(rootDir: string) {
  const candidates = [
    process.env.ARCHIVE_DATA_PATH,
    process.env.MOTORSPORT_ARCHIVE_PATH,
    process.env.GC_ARCHIVE_DATA_PATH,
  ];

  for (const candidate of candidates) {
    const resolved = resolveMaybeRooted(rootDir, String(candidate || ''));
    if (resolved) return resolved;
  }

  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function readJson(filePath: string): ArchiveStore {
  if (!fs.existsSync(filePath)) {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw || '{}') as ArchiveStore;
  if (!Array.isArray(parsed.items)) parsed.items = [];
  return parsed;
}

function writeJsonAtomic(filePath: string, data: ArchiveStore) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function backupFile(filePath: string) {
  if (!fs.existsSync(filePath)) return '';
  const backupPath = `${filePath}.backup-delete-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function sameItem(item: ArchiveItem, wanted: string) {
  const id = normalize(item.id);
  const slug = normalize(item.slug);
  const legacyId = normalize(item._id);
  const wantedNorm = normalize(wanted);
  return id === wantedNorm || slug === wantedNorm || legacyId === wantedNorm;
}

function scrubRelations(store: ArchiveStore, deletedIds: string[]) {
  const deleted = new Set(deletedIds.map(normalize));
  const items = Array.isArray(store.items) ? store.items : [];
  for (const item of items) {
    for (const key of ['relations', 'related', 'manualRelations', 'hiddenRelations', 'pinnedRelations']) {
      if (!Array.isArray(item[key])) continue;
      item[key] = item[key].filter((rel: any) => {
        if (typeof rel === 'string') return !deleted.has(normalize(rel));
        const relId = normalize(rel?.id || rel?.targetId || rel?.itemId || rel?.slug || rel?.targetSlug);
        return !deleted.has(relId);
      });
    }
  }
}

export function registerMotorsportArchiveDeleteRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.delete('/api/admin/archive/items/:id', async (req: Request, res: Response) => {
    const requestedId = String(req.params.id || '').trim();
    const force = String(req.query.force || '').trim() === '1';

    try {
      if (!requestedId) {
        return res.status(400).json({ ok: false, deleted: false, message: 'Falta el ID de la ficha.' });
      }

      const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
      if (driver && driver !== 'json' && !force) {
        return res.status(409).json({
          ok: false,
          deleted: false,
          message: `El borrado JSON está desactivado porque ARCHIVE_STORAGE_DRIVER/APP_STORAGE_DRIVER=${driver}. En MySQL hay que usar el borrado DB.`,
          driver,
        });
      }

      const storagePath = getArchiveStorePath(rootDir);
      const store = readJson(storagePath);
      const beforeItems = Array.isArray(store.items) ? store.items : [];
      const beforeCount = beforeItems.length;

      const deletedItems = beforeItems.filter((item) => sameItem(item, requestedId));
      if (!deletedItems.length) {
        return res.status(404).json({
          ok: false,
          deleted: false,
          message: 'No se ha encontrado la ficha en el storage activo.',
          requestedId,
          storagePath,
          beforeCount,
          sampleIds: beforeItems.slice(0, 8).map((item) => ({ id: item.id, slug: item.slug, title: item.title || item.name })),
        });
      }

      const removedKeys = deletedItems.flatMap((item) => [item.id, item.slug, item._id]).filter(Boolean).map(String);
      const afterItems = beforeItems.filter((item) => !sameItem(item, requestedId));
      store.items = afterItems;
      store.updatedAt = new Date().toISOString();
      scrubRelations(store, removedKeys);

      const backupPath = backupFile(storagePath);
      writeJsonAtomic(storagePath, store);

      const verifyStore = readJson(storagePath);
      const stillExists = (verifyStore.items || []).some((item) => sameItem(item, requestedId));
      const afterCount = Array.isArray(verifyStore.items) ? verifyStore.items.length : afterItems.length;

      if (stillExists || afterCount >= beforeCount) {
        return res.status(500).json({
          ok: false,
          deleted: false,
          message: 'La ruta intentó borrar, pero la verificación indica que la ficha sigue en el storage.',
          requestedId,
          storagePath,
          beforeCount,
          afterCount,
          stillExists,
          backupPath,
        });
      }

      return res.json({
        ok: true,
        deleted: true,
        requestedId,
        deletedItems: deletedItems.map((item) => ({ id: item.id, slug: item.slug, title: item.title || item.name })),
        storagePath,
        backupPath,
        beforeCount,
        afterCount,
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        deleted: false,
        message: error?.message || 'Error borrando ficha.',
        requestedId,
      });
    }
  });
}
