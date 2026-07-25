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
  `home-champ-sr-badges-v6-2-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME BADGES V6.2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_CHAMP_SR_BADGES_TUNING_V6_2')) {
  console.log('[GC HOME BADGES V6.2] El parche ya está aplicado.');
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
    /* GC_HOME_CHAMP_SR_BADGES_TUNING_V6_2 */

    /* --------------------------------------------------------------- */
    /* CAMPEONATOS GT4 / LIGA COMBOS                                   */
    /* --------------------------------------------------------------- */

    .gc-home2 .gc-home2-champ-standing-row:nth-child(-n+3)
    .gc-home2-ranking-medal:not(.gc-home2-rank-badge--plain),
    .gc-home2 .gc-home2-champ-standing-row:nth-child(-n+3)
    .gc-home2-rank-badge:not(.gc-home2-rank-badge--plain){
      width:27px !important;
      min-width:27px !important;
      max-width:27px !important;
      height:27px !important;
      min-height:27px !important;
      max-height:27px !important;
      font-size:18px !important;
      line-height:1 !important;
      filter:drop-shadow(0 0 8px rgba(255,220,90,.20)) !important;
    }

    .gc-home2 .gc-home2-champ-standing-points strong{
      font-size:11.5px !important;
      font-weight:1000 !important;
      line-height:1 !important;
      color:#f5fff1 !important;
    }

    .gc-home2 .gc-home2-champ-standing-points small{
      font-size:8px !important;
      font-weight:900 !important;
      line-height:1 !important;
      color:rgba(220,228,215,.72) !important;
    }

    /* --------------------------------------------------------------- */
    /* SR / GSR                                                        */
    /* --------------------------------------------------------------- */

    .gc-home2 .gc-home2-rating-table
    .gc-home2-rank-badge.gc-home2-ranking-medal{
      width:33px !important;
      min-width:33px !important;
      max-width:33px !important;
      height:33px !important;
      min-height:33px !important;
      max-height:33px !important;
    }

    .gc-home2 .gc-home2-rating-table
    .gc-home2-rank-badge.gc-home2-ranking-medal:not(.gc-home2-rank-badge--plain){
      font-size:22px !important;
    }

    .gc-home2 .gc-home2-rating-table
    .gc-home2-rank-badge--plain.gc-home2-ranking-medal,
    .gc-home2 .gc-home2-rating-table td:first-child
    .gc-home2-rank-badge--plain{
      font-size:17px !important;
      color:#f5fff1 !important;
      text-shadow:0 0 8px rgba(255,255,255,.10) !important;
    }
  </style>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME BADGES V6.2] Aplicado.');
console.log('  - Campeonatos: medallas 1-3 un poco más grandes.');
console.log('  - Campeonatos: puntos más legibles.');
console.log('  - SR/GSR: medallas y números más pequeños.');
console.log(`  - Backup: ${backupFile}`);
