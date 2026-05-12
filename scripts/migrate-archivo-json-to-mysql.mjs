#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const storageUrl = pathToFileURL(path.join(root, 'src', 'lib', 'motorsport-archive', 'storage.ts')).href;

async function main() {
  const mod = await import(storageUrl);
  const jsonDriver = process.env.ARCHIVE_STORAGE_DRIVER;
  process.env.ARCHIVE_STORAGE_DRIVER = 'json';
  const source = mod.readMotorsportArchiveStore(root);
  process.env.ARCHIVE_STORAGE_DRIVER = 'mysql';
  const written = await mod.writeMotorsportArchiveStoreAsync(source, root);
  process.env.ARCHIVE_STORAGE_DRIVER = jsonDriver || '';
  console.log('[Archivo Motorsport] Migración JSON → MySQL completada.');
  console.log(`[Archivo Motorsport] Fichas migradas: ${written.items.length}`);
}
main().catch((error) => {
  console.error('[Archivo Motorsport] Error migrando a MySQL:', error?.stack || error?.message || error);
  process.exit(1);
});
