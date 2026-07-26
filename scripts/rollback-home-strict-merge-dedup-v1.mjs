import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_STRICT_MERGE_DEDUP_V1';
const root = process.cwd();
const backupDir = path.join(root, '_gc_backups', PACK);

if (!fs.existsSync(backupDir)) throw new Error('No existe backup.');

const backup = fs.readdirSync(backupDir)
  .filter((name) => name.startsWith('index.astro.') && name.endsWith('.bak'))
  .sort((a,b) => Number(b.match(/\.(\d+)\.bak$/)?.[1] || 0) - Number(a.match(/\.(\d+)\.bak$/)?.[1] || 0))[0];

if (!backup) throw new Error('No se encontró backup de index.astro.');

fs.copyFileSync(path.join(backupDir, backup), path.join(root, 'src', 'pages', 'index.astro'));
console.log(`[${PACK}] Restaurado index.astro.`);
