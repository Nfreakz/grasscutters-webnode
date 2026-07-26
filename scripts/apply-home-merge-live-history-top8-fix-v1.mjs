import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_MERGE_LIVE_HISTORY_TOP8_FIX_V1';
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

const oldBlock = [
"            return {",
"              ...historical,",
"              ...livePayload,",
"              diagnostics: {",
"                ...(historical.diagnostics || {}),",
"                ...(livePayload.diagnostics || {})",
"              }",
"            };"
].join('\n');

const newBlock = [
"            /* " + PACK + "",
"             * ACSM live puede devolver solo StoredTimes recientes o parciales.",
"             * Cuando el circuito/layout coincide con el combo histórico, unimos",
"             * ambos conjuntos para no perder pilotos que ya rodaron en el combo.",
"             */",
"            const mergedRows = sameTrack",
"              ? [...liveRows, ...historicalRows]",
"              : liveRows;",
"",
"            return {",
"              ...historical,",
"              ...livePayload,",
"              activeCombo: {",
"                ...(historical.activeCombo || {}),",
"                ...(livePayload.activeCombo || {}),",
"                bestLap: mergedRows[0] || livePayload.activeCombo?.bestLap || historical.activeCombo?.bestLap || null,",
"                latestLap: livePayload.activeCombo?.latestLap || historical.activeCombo?.latestLap || mergedRows[0] || null,",
"                leaderboard: mergedRows",
"              },",
"              leaderboard: mergedRows,",
"              diagnostics: {",
"                ...(historical.diagnostics || {}),",
"                ...(livePayload.diagnostics || {}),",
"                activeComboAuthority: sameTrack ? 'acsm-live+historical-merged' : 'acsm-live',",
"                liveHistoricalLeaderboardMerged: sameTrack,",
"                liveRows: liveRows.length,",
"                historicalRows: historicalRows.length,",
"                mergedRows: mergedRows.length",
"              }",
"            };"
].join('\n');

if (!content.includes(oldBlock)) {
  throw new Error('No se encontró el bloque de merge ACSM live esperado.');
}

content = content.replace(oldBlock, newBlock);
content = content.replace(
  '/* GC_HOME_HERO_TOP7_V17 */',
  '/* GC_HOME_HERO_TOP7_V17 */\n/* ' + PACK + ' */'
);

fs.writeFileSync(file, content, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] ACSM live + histórico se fusionan cuando circuito y layout coinciden.`);
console.log(`[${PACK}] Los rankings pueden recuperar pilotos que ya rodaron pero no aparecen en StoredTimes live.`);
console.log(`[${PACK}] Ejecuta npm run build`);
