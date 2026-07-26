import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_UNIQUE_8_POPUP_ALIAS_FIX_V1_1';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');
if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);

let content = fs.readFileSync(file, 'utf8');
if (content.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(file, path.join(backupDir, `index.astro.${Date.now()}.bak`));

const oldBest = [
"      const isValid = (row: any): boolean => {",
"        const value = first(row, ['valid', 'Valid', 'isValid', 'is_valid'], true);",
"        return !(value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false');",
"      };",
"      const bestPerDriver = (rows: any[]): any[] => {",
"        const pool = Array.isArray(rows) ? rows.filter((row: any) => Number.isFinite(rowTimeMs(row))) : [];",
"        const valid = pool.filter(isValid);",
"        const source = valid.length ? valid : pool;",
"        const map = new Map<string, any>();",
"        for (const row of source) {",
"          const key = normalize(driverName(row)) || String(first(row, ['playerId', 'driverId', 'rawPlayerId'], Math.random()));",
"          const current = map.get(key);",
"          if (!current || (rowTimeMs(row) ?? Number.POSITIVE_INFINITY) < (rowTimeMs(current) ?? Number.POSITIVE_INFINITY)) map.set(key, row);",
"        }",
"        return [...map.values()].sort((a: any, b: any) => (rowTimeMs(a) ?? Number.POSITIVE_INFINITY) - (rowTimeMs(b) ?? Number.POSITIVE_INFINITY));",
"      };"
].join('\n');

const newBest = [
"      const isValid = (row: any): boolean => {",
"        const value = first(row, ['valid', 'Valid', 'isValid', 'is_valid'], true);",
"        return !(value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false');",
"      };",
"",
"      /* " + PACK + ": identidad pública estable en todos los bloques de la home. */",
"      const canonicalDriverNameKey = (value: unknown): string => {",
"        const key = normalize(value);",
"        const compact = key.replace(/_/g, '');",
"        if (['pdiaz', 'pedrodiaz'].includes(compact)) return 'pdiaz';",
"        return key;",
"      };",
"",
"      const bestPerDriver = (rows: any[]): any[] => {",
"        const pool = Array.isArray(rows)",
"          ? rows.filter((row: any) => Number.isFinite(rowTimeMs(row)))",
"          : [];",
"",
"        const groups = new Map<string, any[]>();",
"        for (const row of pool) {",
"          const identity = first(row, [",
"            'steamGuid', 'steamGUID', 'steamId', 'steamID', 'guid', 'GUID',",
"            'profilePlayerId', 'strackerPlayerId', 'playerId', 'driverId', 'rawPlayerId'",
"          ], '');",
"          const key = identity",
"            ? 'id:' + String(identity).trim().toLowerCase()",
"            : 'name:' + canonicalDriverNameKey(driverName(row));",
"",
"          const bucket = groups.get(key) || [];",
"          bucket.push(row);",
"          groups.set(key, bucket);",
"        }",
"",
"        const selected = [...groups.values()].map((bucket) => {",
"          const validRows = bucket.filter(isValid);",
"          const candidates = validRows.length ? validRows : bucket;",
"          return [...candidates].sort((a: any, b: any) =>",
"            (rowTimeMs(a) ?? Number.POSITIVE_INFINITY) -",
"            (rowTimeMs(b) ?? Number.POSITIVE_INFINITY)",
"          )[0];",
"        }).filter(Boolean);",
"",
"        return selected.sort((a: any, b: any) =>",
"          (rowTimeMs(a) ?? Number.POSITIVE_INFINITY) -",
"          (rowTimeMs(b) ?? Number.POSITIVE_INFINITY)",
"        );",
"      };"
].join('\n');

if (!content.includes(oldBest)) throw new Error('No se encontró bestPerDriver esperado.');
content = content.replace(oldBest, newBest);

content = content.replace(
  '/api/gc/home-bootstrap?mainLimit=8&gt4Limit=8&timingLimit=10&home=1&t=${stamp}',
  '/api/gc/home-bootstrap?mainLimit=50&gt4Limit=50&timingLimit=10&home=1&t=${stamp}'
);

content = content.replace(
  'const list = bestPerDriver(rows).slice(0, 10);',
  'const list = bestPerDriver(rows).slice(0, 8);'
);

const popoverMarker = '    /* GC_HOME_PILOT_LINKS_POPOVER_V1 */';
const markerIndex = content.indexOf(popoverMarker);
if (markerIndex < 0) throw new Error('No se encontró el bloque del popup.');

const before = content.slice(0, markerIndex);
let after = content.slice(markerIndex);

const oldNormalize = [
"      const normalize = (value: unknown): string => String(value || '')",
"        .trim()",
"        .toLowerCase()",
"        .normalize('NFD')",
"        .replace(/[\\u0300-\\u036f]/g,'')",
"        .replace(/[^a-z0-9]+/g,'');"
].join('\n');

const newNormalize = [
"      const normalize = (value: unknown): string => {",
"        const normalized = String(value || '')",
"          .trim()",
"          .toLowerCase()",
"          .normalize('NFD')",
"          .replace(/[\\u0300-\\u036f]/g,'')",
"          .replace(/[^a-z0-9]+/g,'');",
"",
"        if (['pdiaz', 'pedrodiaz'].includes(normalized)) return 'pdiaz';",
"        return normalized;",
"      };"
].join('\n');

if (!after.includes(oldNormalize)) throw new Error('No se encontró normalize del popup.');
after = after.replace(oldNormalize, newNormalize);

content = before + after;
content = content.replace(
  '/* GC_HOME_HERO_TOP7_V17 */',
  '/* GC_HOME_HERO_TOP7_V17 */\n/* ' + PACK + ' */'
);

fs.writeFileSync(file, content, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Home solicita hasta 50 registros por servidor.`);
console.log(`[${PACK}] Se muestran 8 pilotos únicos.`);
console.log(`[${PACK}] PEDRO DÍAZ / PDÍAZ / PDIAZ comparten identidad para el popup.`);
console.log(`[${PACK}] Ejecuta npm run build`);
