#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const storageUrl = pathToFileURL(path.join(root, 'src', 'lib', 'motorsport-archive', 'storage.ts')).href;

async function main() {
  const mod = await import(storageUrl);
  const store = await mod.readMotorsportArchiveStoreAsync(root);
  const status = await mod.getMotorsportArchiveStorageStatus(root);
  console.log(JSON.stringify({ ok: true, storage: status, items: store.items.length }, null, 2));
}
main().catch((error) => {
  console.error('[Archivo Motorsport] Storage check fallido:', error?.stack || error?.message || error);
  process.exit(1);
});
