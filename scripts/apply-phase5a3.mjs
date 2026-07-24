import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'src/server/index.ts');
const BACKUP_DIR = path.join(ROOT, '_gc_backups', `phase5a3-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const BACKUP = path.join(BACKUP_DIR, 'src/server/index.ts');

function fail(message) {
  console.error(`[GC Phase 5A.3] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail('No existe src/server/index.ts.');
const before = fs.readFileSync(FILE, 'utf8');
let after = before;

function replaceExact(search, replacement, expected, label) {
  const count = after.split(search).length - 1;
  if (count === 0 && after.includes(replacement)) {
    console.log(`[GC Phase 5A.3] Ya aplicado: ${label}`);
    return;
  }
  if (count !== expected) fail(`${label}: esperadas ${expected} coincidencias, encontradas ${count}.`);
  after = after.split(search).join(replacement);
  console.log(`[GC Phase 5A.3] Preparado: ${label} (${expected})`);
}

// Unión GcDataCoreReadResult / error payload.
replaceExact(
  'readSource.message',
  '(readSource as any).message',
  8,
  'mensajes de readSource'
);

replaceExact(
  'const { laps, stracker, source, mysqlMirror, fallbackReason } = readSource;',
  'const { laps, stracker, source, mysqlMirror, fallbackReason } = readSource as any;',
  1,
  'desestructuración Data Core hotlaps'
);

replaceExact(
  'const { laps, comboDefinitions, stracker, source, mysqlMirror, fallbackReason } = readSource;',
  'const { laps, comboDefinitions, stracker, source, mysqlMirror, fallbackReason } = readSource as any;',
  1,
  'desestructuración Data Core combos'
);

// Requests clonados: el doble cast expresa que son adaptadores parciales.
replaceExact(
  '} as express.Request;',
  '} as unknown as express.Request;',
  2,
  'requests de bootstrap por fuente'
);

replaceExact(
  "} } as express.Request, { validOnly: false });",
  "} } as unknown as express.Request, { validOnly: false });",
  1,
  'request filtrado de estadísticas'
);

// Compatibilidad con payloads legacy de vueltas.
const legacyLapFields = [
  ['lap.PlayerId', '(lap as any).PlayerId', 1],
  ['lap.DriverName', '(lap as any).DriverName', 1],
  ['lap.Name', '(lap as any).Name', 1],
  ['lap.CarId', '(lap as any).CarId', 1],
  ['lap.Car', '(lap as any).Car', 1],
  ['lap.TrackId', '(lap as any).TrackId', 1],
  ['lap.Track', '(lap as any).Track', 1],
  ['lap.Valid', '(lap as any).Valid', 1],
  ['lap.Timestamp', '(lap as any).Timestamp', 1],
  ['lap.Date', '(lap as any).Date', 1],
  ['lap.date', '(lap as any).date', 1],
  ['lap.dateIso', '(lap as any).dateIso', 1]
];

for (const [search, replacement, expected] of legacyLapFields) {
  replaceExact(search, replacement, expected, `campo legacy ${search}`);
}

// Propiedades opcionales de objetos canónicos construidos.
replaceExact(
  'tokens.name',
  '(tokens as any).name',
  2,
  'alias name de tokens'
);

replaceExact(
  'latestCombo.id',
  '(latestCombo as any).id',
  1,
  'id legacy de combo'
);

replaceExact(
  'latestCombo.trackName',
  '(latestCombo as any).trackName',
  1,
  'trackName legacy de combo'
);

replaceExact(
  'combo.laps || []',
  '(combo as any).laps || []',
  1,
  'laps opcionales de combo'
);

// Tipado de sectores.
replaceExact(
  'sectors.map((sector) => sector.timeMs)',
  'sectors.map((sector: any) => sector.timeMs)',
  1,
  'sectorTimesMs'
);

replaceExact(
  'sectors.map((sector) => sector.time)',
  'sectors.map((sector: any) => sector.time)',
  1,
  'sectorTimes'
);

if (after === before) {
  console.log('[GC Phase 5A.3] No había cambios pendientes.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, before, 'utf8');
fs.writeFileSync(FILE, after, 'utf8');

console.log('');
console.log('[GC Phase 5A.3] Aplicación completada.');
console.log(`[GC Phase 5A.3] Backup: ${path.relative(ROOT, BACKUP)}`);
console.log('[GC Phase 5A.3] Ejecuta ahora npm run check.');
