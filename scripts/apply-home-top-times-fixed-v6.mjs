import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(
  process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode'
);
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(
  projectRoot,
  '_gc_backups',
  `home-top-times-fixed-v6-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME TOP TIMES V6] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_TOP_TIMES_FIXED_ROWS_V6')) {
  console.log('[GC HOME TOP TIMES V6] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

/*
 * Reduce explicit render limits from 7 to 6.
 * CSS also enforces the six-row maximum as a final safeguard.
 */
let limitChanges = 0;
source = source.replace(/\.slice\(\s*0\s*,\s*7\s*\)/g, (match) => {
  limitChanges += 1;
  return '.slice(0, 6)';
});

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) {
  fail('No se encontró el cierre de MarketingLayout.');
}

const patch = `
  <style is:global>
    /* GC_HOME_TOP_TIMES_FIXED_ROWS_V6 */

    .gc-home2 [data-home2-combo-ranking],
    .gc-home2 [data-home2-combo-ranking-gt4]{
      display:grid !important;
      grid-template-columns:minmax(0,1fr) !important;
      grid-auto-rows:40px !important;
      align-content:start !important;
      gap:5px !important;
      min-height:0 !important;
      height:auto !important;
    }

    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank{
      display:grid !important;
      grid-template-columns:22px minmax(0,1fr) 23px 74px !important;
      align-items:center !important;
      column-gap:7px !important;
      box-sizing:border-box !important;
      width:100% !important;
      min-width:0 !important;
      height:40px !important;
      min-height:40px !important;
      max-height:40px !important;
      padding:4px 8px !important;
      overflow:hidden !important;
      contain:layout paint !important;
    }

    /* Maximum six visible drivers, regardless of asynchronous renderer output. */
    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank:nth-child(n+7),
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank:nth-child(n+7){
      display:none !important;
    }

    /* Empty/loading placeholders never reserve a row. */
    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank--loading,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank--loading{
      display:none !important;
    }

    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank > div,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank > div{
      display:flex !important;
      flex-direction:column !important;
      justify-content:center !important;
      align-items:flex-start !important;
      min-width:0 !important;
      height:31px !important;
      transform:translateY(-1px) !important;
      overflow:hidden !important;
    }

    .gc-home2 .gc-home2-combo-rank .gc-home-pilot-link,
    .gc-home2 .gc-home2-combo-rank strong{
      display:block !important;
      width:100% !important;
      margin:0 !important;
      padding:0 !important;
      font-size:11.5px !important;
      font-weight:900 !important;
      line-height:1 !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
    }

    .gc-home2 .gc-home2-combo-rank small{
      display:block !important;
      width:100% !important;
      margin:3px 0 0 !important;
      padding:0 !important;
      color:rgba(196,205,190,.72) !important;
      font-size:8.6px !important;
      font-weight:700 !important;
      line-height:1 !important;
      letter-spacing:.015em !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
    }

    .gc-home2 .gc-home2-combo-ranking-list .gc-home2-rank-badge{
      width:22px !important;
      min-width:22px !important;
      height:22px !important;
      min-height:22px !important;
      max-width:22px !important;
      max-height:22px !important;
      margin:0 !important;
      font-size:12px !important;
      line-height:1 !important;
    }

    .gc-home2 .gc-home2-combo-rank__avatar{
      width:23px !important;
      min-width:23px !important;
      max-width:23px !important;
      height:23px !important;
      min-height:23px !important;
      max-height:23px !important;
      margin:0 !important;
      align-self:center !important;
    }

    .gc-home2 .gc-home2-combo-rank em{
      display:block !important;
      width:74px !important;
      min-width:74px !important;
      max-width:74px !important;
      margin:0 !important;
      font-size:12.5px !important;
      font-weight:900 !important;
      line-height:1 !important;
      text-align:right !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      font-style:normal !important;
    }

    /* Prevent temporary font/image changes from altering row geometry. */
    .gc-home2 [data-home2-combo-ranking] *,
    .gc-home2 [data-home2-combo-ranking-gt4] *{
      box-sizing:border-box !important;
    }

    @media(max-width:700px){
      .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank,
      .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank{
        grid-template-columns:21px minmax(0,1fr) 22px 68px !important;
      }

      .gc-home2 .gc-home2-combo-rank em{
        width:68px !important;
        min-width:68px !important;
        max-width:68px !important;
        font-size:11.5px !important;
      }
    }
  </style>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

const reportDir = path.join(projectRoot, '_gc_reports', 'home');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'home-top-times-fixed-v6.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    renderLimitChanges: limitChanges,
    maximumVisibleRows: 6,
    fixedRowHeightPx: 40,
    fixedColumns: {
      rankPx: 22,
      driver: 'minmax(0,1fr)',
      avatarPx: 23,
      timePx: 74
    },
    loadingRowsHidden: true,
    timingSheetChanged: false
  }, null, 2) + '\n',
  'utf8'
);

console.log('[GC HOME TOP TIMES V6] Aplicado.');
console.log(`  - Límites 7 -> 6 modificados: ${limitChanges}`);
console.log('  - Liga y GT4: máximo 6 filas.');
console.log('  - Altura fija por fila: 40px.');
console.log('  - Columnas fijas: posición, piloto, avatar y tiempo.');
console.log('  - Filas loading ocultas.');
console.log('  - Timing Sheet sin cambios.');
console.log(`  - Backup: ${backupFile}`);
