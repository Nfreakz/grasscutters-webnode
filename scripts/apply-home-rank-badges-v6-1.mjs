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
  `home-rank-badges-v6-1-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME RANK BADGES V6.1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_RANK_BADGES_VISUAL_V6_1')) {
  console.log('[GC HOME RANK BADGES V6.1] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) {
  fail('No se encontró el cierre de MarketingLayout.');
}

const patch = `
  <style is:global>
    /* GC_HOME_RANK_BADGES_VISUAL_V6_1 */

    /* --------------------------------------------------------------- */
    /* Liga / GT4: podium 1-3 larger                                   */
    /* --------------------------------------------------------------- */

    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank:nth-child(-n+3) .gc-home2-rank-badge,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank:nth-child(-n+3) .gc-home2-rank-badge{
      width:25px !important;
      min-width:25px !important;
      max-width:25px !important;
      height:25px !important;
      min-height:25px !important;
      max-height:25px !important;
      font-size:16px !important;
      line-height:1 !important;
      color:#f5fff1 !important;
      border:0 !important;
      background:transparent !important;
      box-shadow:none !important;
      filter:drop-shadow(0 0 7px rgba(255,220,90,.18)) !important;
    }

    /* Liga / GT4: positions 4+ plain white, matching SR/GSR style. */
    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank:nth-child(n+4) .gc-home2-rank-badge,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank:nth-child(n+4) .gc-home2-rank-badge{
      width:22px !important;
      min-width:22px !important;
      max-width:22px !important;
      height:22px !important;
      min-height:22px !important;
      max-height:22px !important;
      color:#f5fff1 !important;
      font-size:13px !important;
      font-weight:1000 !important;
      line-height:1 !important;
      border:0 !important;
      border-radius:0 !important;
      background:transparent !important;
      background-image:none !important;
      box-shadow:none !important;
      text-shadow:0 0 8px rgba(255,255,255,.12) !important;
      filter:none !important;
    }

    /* Prevent old green "plain" styling from leaking into Liga / GT4. */
    .gc-home2 [data-home2-combo-ranking] .gc-home2-rank-badge--plain,
    .gc-home2 [data-home2-combo-ranking-gt4] .gc-home2-rank-badge--plain{
      color:#f5fff1 !important;
      border:0 !important;
      background:transparent !important;
      box-shadow:none !important;
    }

    /* --------------------------------------------------------------- */
    /* SR / GSR: exactly 1px smaller                                    */
    /* --------------------------------------------------------------- */

    .gc-home2 .gc-home2-rating-table .gc-home2-rank-badge.gc-home2-ranking-medal,
    .gc-home2 .gc-home2-rating-table td:first-child .gc-home2-rank-badge{
      width:35px !important;
      min-width:35px !important;
      max-width:35px !important;
      height:35px !important;
      min-height:35px !important;
      max-height:35px !important;
    }

    .gc-home2 .gc-home2-rating-table .gc-home2-rank-badge.gc-home2-ranking-medal:not(.gc-home2-rank-badge--plain){
      font-size:24px !important;
    }

    .gc-home2 .gc-home2-rating-table .gc-home2-rank-badge--plain.gc-home2-ranking-medal,
    .gc-home2 .gc-home2-rating-table td:first-child .gc-home2-rank-badge--plain{
      font-size:19px !important;
      color:#f5fff1 !important;
    }
  </style>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME RANK BADGES V6.1] Aplicado.');
console.log('  - Liga/GT4: podios 1-3 más grandes.');
console.log('  - Liga/GT4: posiciones 4+ en blanco.');
console.log('  - SR/GSR: iconos y números reducidos 1px.');
console.log(`  - Backup: ${backupFile}`);
