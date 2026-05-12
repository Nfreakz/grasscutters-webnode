#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const storageUrl = pathToFileURL(path.join(root, 'src', 'lib', 'motorsport-archive', 'storage.ts')).href;

async function main() {
  const mod = await import(storageUrl);
  const previous = process.env.ARCHIVE_STORAGE_DRIVER;
  process.env.ARCHIVE_STORAGE_DRIVER = 'mysql';
  const store = await mod.readMotorsportArchiveStoreAsync(root);
  process.env.ARCHIVE_STORAGE_DRIVER = previous || '';
  console.log('[Archivo Motorsport] Snapshot JSON actualizado desde MySQL.');
  console.log(`[Archivo Motorsport] Fichas: ${store.items.length}`);
  console.log(`[Archivo Motorsport] Snapshot: ${mod.getMotorsportArchiveSnapshotPath(root)}`);
}
main().catch((error) => {
  console.error('[Archivo Motorsport] Error sincronizando desde MySQL:', error?.stack || error?.message || error);
  process.exit(1);
});
