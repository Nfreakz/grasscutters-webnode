import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_STRICT_MERGE_DEDUP_V1';
const pageFile = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(pageFile)) throw new Error(`No existe ${pageFile}`);

let page = fs.readFileSync(pageFile, 'utf8');

if (page.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(pageFile, path.join(backupDir, `index.astro.${Date.now()}.bak`));

const oldBlock = "            const mergedRows = sameStrictCombo ? [...liveRows, ...historicalRows] : liveRows;";

const newBlock = `            /* ${PACK}: live e histórico pueden identificar al mismo piloto con
             * SteamID/hash o nombres distintos. Unificar por identidad canónica y
             * conservar una sola mejor vuelta por piloto.
             */
            const canonicalMergedDriverKey = (row: any) => {
              const rawName = String(first(row, [
                'driverName', 'name', 'DriverName', 'playerName',
                'driver.name', 'driver.displayName'
              ], '') || '');

              let nameKey = normalize(rawName);
              const aliases: Record<string, string> = {
                pdiaz: 'pedrodiaz',
                pedrodiaz: 'pedrodiaz'
              };
              nameKey = aliases[nameKey] || nameKey;

              return nameKey || String(first(row, [
                'steamGuid', 'steamGUID', 'guid', 'GUID',
                'playerId', 'driverId', 'driver.id'
              ], '') || '').trim().toLowerCase();
            };

            const mergedRows = (() => {
              const sourceRows = sameStrictCombo
                ? [...liveRows, ...historicalRows]
                : liveRows;

              const byDriver = new Map<string, any>();

              for (const row of sourceRows) {
                const key = canonicalMergedDriverKey(row);
                if (!key) continue;

                const previous = byDriver.get(key);
                const rowLapMs = Number(first(row, [
                  'bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs'
                ], 0)) || Number.POSITIVE_INFINITY;
                const previousLapMs = previous
                  ? (Number(first(previous, [
                      'bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs'
                    ], 0)) || Number.POSITIVE_INFINITY)
                  : Number.POSITIVE_INFINITY;

                if (!previous || rowLapMs < previousLapMs) {
                  byDriver.set(key, row);
                }
              }

              return [...byDriver.values()].sort((a: any, b: any) => {
                const aMs = Number(first(a, ['bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs'], 0)) || Number.POSITIVE_INFINITY;
                const bMs = Number(first(b, ['bestLapMs', 'lapTimeMs', 'LapTime', 'timeMs'], 0)) || Number.POSITIVE_INFINITY;
                return aMs - bMs;
              });
            })();`;

if (!page.includes(oldBlock)) {
  throw new Error('No se encontró el bloque mergedRows del pack strict combo.');
}

page = page.replace(oldBlock, newBlock);

fs.writeFileSync(pageFile, page, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] El merge live + histórico queda deduplicado por piloto.`);
console.log(`[${PACK}] PDíaz y Pedro Díaz se consideran el mismo piloto.`);
console.log(`[${PACK}] Ejecuta npm run build`);
