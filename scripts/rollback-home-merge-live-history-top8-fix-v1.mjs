import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_MERGE_LIVE_HISTORY_TOP8_FIX_V1';
const root = process.cwd();
const backupDir = path.join(root, '_gc_backups', PACK);

if (!fs.existsSync(backupDir)) throw new Error('No existe backup.');

const backups = fs.readdirSync(backupDir)
  .filter((name) => /^index\.astro\.\d+\.bak$/.test(name))
  .sort((a,b) => Number(b.match(/\.(\d+)\.bak$/)?.[1] || 0) - Number(a.match(/\.(\d+)\.bak$/)?.[1] || 0));

if (!backups.length) throw new Error('No se encontró backup de index.astro.');

fs.copyFileSync(
  path.join(backupDir, backups[0]),
  path.join(root, 'src', 'pages', 'index.astro')
);

console.log(`[${PACK}] index.astro restaurado.`);
