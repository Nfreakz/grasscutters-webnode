const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src/server/index.ts');
const blockPath = path.join(root, 'scripts/patch-assets/acsm-sync-current-block.ts.txt');
const start = '// GC ACSM SYNC START';
const end = '// GC ACSM SYNC END';
const calendarEnd = '// GC CALENDAR DB STORAGE END';

if (!fs.existsSync(serverPath)) {
  console.error('ERROR: no encuentro src/server/index.ts. Ejecuta desde la raíz del proyecto.');
  process.exit(1);
}
if (!fs.existsSync(blockPath)) {
  console.error('ERROR: falta scripts/patch-assets/acsm-sync-current-block.ts.txt');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');
const block = fs.readFileSync(blockPath, 'utf8').trim() + '\n';

if (!source.includes('GC CALENDAR DB STORAGE START') || !source.includes(calendarEnd)) {
  console.error('ERROR: no encuentro el bloque de calendario DB. Aplica primero el pack de calendario en MySQL.');
  process.exit(1);
}
if (!source.includes('gcCalendarReadEventsDbV8') || !source.includes('gcCalendarWriteEventsDbV8')) {
  console.error('ERROR: el calendario no parece tener las funciones DB V8 necesarias.');
  process.exit(1);
}

const backupPath = `${serverPath}.backup-acsm-current-combo-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backupPath, source, 'utf8');

const existingStart = source.indexOf(start);
const existingEnd = source.indexOf(end);
if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
  source = source.slice(0, existingStart) + block + source.slice(existingEnd + end.length);
} else {
  const index = source.indexOf(calendarEnd);
  source = source.slice(0, index) + block + '\n' + source.slice(index);
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('OK: endpoints ACSM añadidos a src/server/index.ts');
console.log(`Backup: ${path.relative(root, backupPath)}`);
console.log('Rutas nuevas:');
console.log('  GET  /api/admin/acsm/status');
console.log('  POST /api/admin/acsm/sync-current-combo');
