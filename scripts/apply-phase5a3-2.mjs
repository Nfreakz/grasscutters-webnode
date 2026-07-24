import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'src/server/index.ts');
const BACKUP_DIR = path.join(ROOT, '_gc_backups', `phase5a3-2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const BACKUP = path.join(BACKUP_DIR, 'src/server/index.ts');

function fail(message) {
  console.error(`[GC Phase 5A.3.2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail('No existe src/server/index.ts.');
const before = fs.readFileSync(FILE, 'utf8');
let after = before;

function replaceExact(search, replacement, expected, label) {
  const count = after.split(search).length - 1;
  if (count === 0 && after.includes(replacement)) {
    console.log(`[GC Phase 5A.3.2] Ya aplicado: ${label}`);
    return;
  }
  if (count !== expected) fail(`${label}: esperadas ${expected} coincidencias, encontradas ${count}.`);
  after = after.split(search).join(replacement);
  console.log(`[GC Phase 5A.3.2] Preparado: ${label} (${expected})`);
}

replaceExact('readSource.message', '(readSource as any).message', 8, 'mensajes de readSource');

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

replaceExact(
  'const playerId = lap.PlayerId ?? lap.playerId ?? lap.driverId ?? lap.DriverName ?? lap.Name;',
  'const playerId = (lap as any).PlayerId ?? lap.playerId ?? lap.driverId ?? (lap as any).DriverName ?? (lap as any).Name;',
  1,
  'campos legacy de identidad de vuelta'
);

replaceExact(
  'const carId = lap.CarId ?? lap.Car ?? lap.carId ?? lap.carName;',
  'const carId = (lap as any).CarId ?? (lap as any).Car ?? lap.carId ?? lap.carName;',
  1,
  'campos legacy de coche'
);

replaceExact(
  'const trackId = lap.TrackId ?? lap.Track ?? lap.trackId ?? lap.trackName;',
  'const trackId = (lap as any).TrackId ?? (lap as any).Track ?? lap.trackId ?? lap.trackName;',
  1,
  'campos legacy de circuito'
);

replaceExact(
  'const valid = lap.Valid ?? lap.valid ?? lap.isValid;',
  'const valid = (lap as any).Valid ?? lap.valid ?? lap.isValid;',
  1,
  'campo legacy de validez'
);

replaceExact(
  'const rawDate = lap.Timestamp ?? lap.timestamp ?? lap.Date ?? lap.date ?? lap.timestampIso ?? lap.dateIso;',
  'const rawDate = (lap as any).Timestamp ?? lap.timestamp ?? (lap as any).Date ?? (lap as any).date ?? lap.timestampIso ?? (lap as any).dateIso;',
  1,
  'campos legacy de fecha'
);

replaceExact(
  "const key = tokens.key || gcComboUnifySlugV1(tokens.name || tokens.code || '');",
  "const key = tokens.key || gcComboUnifySlugV1((tokens as any).name || tokens.code || '');",
  1,
  'tokens.name para clave'
);

replaceExact(
  "    tokens.name,",
  "    (tokens as any).name,",
  1,
  'tokens.name para alias'
);

replaceExact('latestCombo.id', '(latestCombo as any).id', 1, 'id legacy de combo');
replaceExact('latestCombo.trackName', '(latestCombo as any).trackName', 1, 'trackName legacy de combo');
replaceExact('combo.laps || []', '(combo as any).laps || []', 1, 'laps opcionales de combo');

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
  console.log('[GC Phase 5A.3.2] No había cambios pendientes.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, before, 'utf8');
fs.writeFileSync(FILE, after, 'utf8');

console.log('');
console.log('[GC Phase 5A.3.2] Aplicación completada.');
console.log(`[GC Phase 5A.3.2] Backup: ${path.relative(ROOT, BACKUP)}`);
console.log('[GC Phase 5A.3.2] Ejecuta ahora npm run check.');
