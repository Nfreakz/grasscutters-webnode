import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';

type ArchiveStore = {
  version?: number;
  updatedAt?: string;
  items?: any[];
};

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDirForFile(filePath);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function getArchiveStoragePath(rootDir: string) {
  const candidates = [
    process.env.ARCHIVE_DATA_PATH,
    process.env.MOTORSPORT_ARCHIVE_PATH,
    process.env.GC_ARCHIVE_DATA_PATH,
  ];

  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value) continue;
    return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
  }

  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function sameIdOrSlug(item: any, wanted: string) {
  const id = String(item?.id || '').trim();
  const slug = String(item?.slug || '').trim();
  const legacyId = String(item?._id || '').trim();
  return id === wanted || slug === wanted || legacyId === wanted;
}

/**
 * Hard-delete route for Archivo Motorsport.
 *
 * It MUST be registered before legacy archive routes, because older routes may
 * turn DELETE into a soft-hide operation: { status: "hidden", deleted: false }.
 */
export function registerMotorsportArchiveHardDeleteRoutes(app: Express, { rootDir }: { rootDir: string }) {
  app.delete('/api/admin/archive/items/:id', (req: Request, res: Response) => {
    try {
      const archiveStorageDriver = String(process.env.ARCHIVE_STORAGE_DRIVER || 'json').trim().toLowerCase();
      if (archiveStorageDriver === 'mysql' || archiveStorageDriver === 'mariadb') {
        return res.status(501).json({
          ok: false,
          deleted: false,
          error: 'Hard delete MySQL todavía no está implementado en este endpoint local.',
          storageDriver: archiveStorageDriver,
        });
      }

      const wanted = String(req.params.id || '').trim();
      if (!wanted) {
        return res.status(400).json({ ok: false, deleted: false, error: 'Falta id/slug de ficha.' });
      }

      const storagePath = getArchiveStoragePath(rootDir);
      if (!fs.existsSync(storagePath)) {
        return res.status(404).json({
          ok: false,
          deleted: false,
          error: 'No existe el storage del Archivo Motorsport.',
          storagePath,
        });
      }

      const store = readJson<ArchiveStore>(storagePath, { version: 1, updatedAt: new Date().toISOString(), items: [] });
      const beforeItems = Array.isArray(store.items) ? store.items : [];
      const beforeCount = beforeItems.length;
      const removedItem = beforeItems.find((item) => sameIdOrSlug(item, wanted)) || null;

      if (!removedItem) {
        return res.status(404).json({
          ok: false,
          deleted: false,
          error: 'No se ha encontrado la ficha para borrar.',
          id: wanted,
          storagePath,
          beforeCount,
          afterCount: beforeCount,
        });
      }

      const afterItems = beforeItems.filter((item) => !sameIdOrSlug(item, wanted));
      const afterCount = afterItems.length;

      if (afterCount === beforeCount) {
        return res.status(500).json({
          ok: false,
          deleted: false,
          error: 'La ficha se encontró, pero no se pudo eliminar del array.',
          id: wanted,
          storagePath,
          beforeCount,
          afterCount,
        });
      }

      const backupPath = `${storagePath}.backup-hard-delete-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.copyFileSync(storagePath, backupPath);

      const nextStore = {
        ...store,
        version: store.version || 1,
        updatedAt: new Date().toISOString(),
        items: afterItems,
      };

      writeJson(storagePath, nextStore);

      const verify = readJson<ArchiveStore>(storagePath, { items: [] });
      const verifyItems = Array.isArray(verify.items) ? verify.items : [];
      const stillExists = verifyItems.some((item) => sameIdOrSlug(item, wanted));

      if (stillExists) {
        return res.status(500).json({
          ok: false,
          deleted: false,
          error: 'Se escribió el archivo, pero la ficha sigue existiendo al verificar.',
          id: wanted,
          storagePath,
          backupPath,
          beforeCount,
          afterCount: verifyItems.length,
        });
      }

      return res.json({
        ok: true,
        deleted: true,
        id: wanted,
        removed: {
          id: removedItem.id || null,
          slug: removedItem.slug || null,
          title: removedItem.title || removedItem.name || null,
          status: removedItem.status || null,
        },
        storagePath,
        backupPath,
        beforeCount,
        afterCount: verifyItems.length,
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        deleted: false,
        error: error?.message || 'Error borrando ficha.',
      });
    }
  });
}
