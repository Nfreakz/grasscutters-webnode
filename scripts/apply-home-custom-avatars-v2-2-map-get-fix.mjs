import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-custom-avatars-v2-2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME AVATARS V2.2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_CUSTOM_AVATAR_DIRECTORY_V2')) {
  fail('No se encontró el bloque V2 de avatares.');
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const oldId = "if (safeId && byId.has(safeId)) return byId.get(safeId);";
const newId = "if (safeId && byId.has(safeId)) return byId.get(safeId) || '';";

const oldName = "if (safeName && byName.has(safeName)) return byName.get(safeName);";
const newName = "if (safeName && byName.has(safeName)) return byName.get(safeName) || '';";

if (!source.includes(oldId)) fail('No se encontró la resolución byId esperada.');
if (!source.includes(oldName)) fail('No se encontró la resolución byName esperada.');

source = source.replace(oldId, newId);
source = source.replace(oldName, newName);

fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME AVATARS V2.2] Map.get corregido.');
console.log(`  - Backup: ${backupFile}`);
