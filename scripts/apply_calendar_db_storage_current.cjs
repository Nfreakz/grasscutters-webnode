#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const assetPath = path.join(root, 'scripts', 'patch-assets', 'calendar-db-storage-block.ts.txt');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(serverPath)) fail('No encuentro src/server/index.ts. Ejecuta el script desde la raíz del proyecto.');
if (!fs.existsSync(assetPath)) fail('No encuentro scripts/patch-assets/calendar-db-storage-block.ts.txt. Copia todo el pack antes de ejecutar.');

let source = fs.readFileSync(serverPath, 'utf8');
const block = fs.readFileSync(assetPath, 'utf8').trim() + '\n';

source = source.replace(/\n?\/\/ GC CALENDAR DB STORAGE START[\s\S]*?\/\/ GC CALENDAR DB STORAGE END\n?/g, '\n');

const alreadyHasLegacyCalendar = /\/api\/admin\/calendar-events|\/api\/calendar-events|gc_calendar_events|calendar-events\.json/.test(source);
const marker = 'const app = express();';
const index = source.indexOf(marker);
if (index === -1) {
  fail('No he encontrado "const app = express();". No aplico nada para evitar romper el servidor.');
}

const insertAt = index + marker.length;
source = `${source.slice(0, insertAt)}\n\n${block}${source.slice(insertAt)}`;

fs.writeFileSync(serverPath, source, 'utf8');

console.log('OK: parche de calendario DB aplicado en src/server/index.ts');
console.log(alreadyHasLegacyCalendar
  ? 'INFO: Ya existían rutas/datos de calendario. Las nuevas rutas se han insertado antes para tener prioridad y usar DB.'
  : 'INFO: No he detectado rutas antiguas de calendario. Se han añadido rutas nuevas.');
console.log('Siguiente paso: node .\\scripts\\check_calendar_db_storage_current.cjs && npm run build');
