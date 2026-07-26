import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_ACTIVE_COMBO_STRICT_TOP8_FIX_V1';
const root = process.cwd();
const backupDir = path.join(root, '_gc_backups', PACK);
if (!fs.existsSync(backupDir)) throw new Error('No existe backup.');

const files = fs.readdirSync(backupDir);
const newest = (prefix) => files
  .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
  .sort((a,b) => Number(b.match(/\.(\d+)\.bak$/)?.[1] || 0) - Number(a.match(/\.(\d+)\.bak$/)?.[1] || 0))[0];

const serverBackup = newest('index.ts.');
const pageBackup = newest('index.astro.');
if (!serverBackup || !pageBackup) throw new Error('Backups incompletos.');

fs.copyFileSync(path.join(backupDir, serverBackup), path.join(root, 'src', 'server', 'index.ts'));
fs.copyFileSync(path.join(backupDir, pageBackup), path.join(root, 'src', 'pages', 'index.astro'));
console.log(`[${PACK}] Restaurados index.ts e index.astro.`);
