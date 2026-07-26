import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_ROWS_8_10_OVERWRITE_PACK_V1';
const root = process.cwd();
const backupDir = path.join(root, '_gc_backups', PACK);

if (!fs.existsSync(backupDir)) throw new Error('No existe backup.');

const latest = new Map();
for (const file of fs.readdirSync(backupDir)) {
  const m = file.match(/^(.*?)\.(\d+)\.bak$/);
  if (!m) continue;
  const target = m[1].replace(/__/g, path.sep);
  const stamp = Number(m[2]);
  if (!latest.has(target) || latest.get(target).stamp < stamp) latest.set(target, { file, stamp });
}

for (const [target, meta] of latest) {
  const destination = path.join(root, target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(backupDir, meta.file), destination);
  console.log(`Restaurado ${target}`);
}
