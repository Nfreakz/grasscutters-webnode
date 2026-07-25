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
  `home-champ-numbers-white-v6-3-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME CHAMP V6.3] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_CHAMP_NUMBERS_WHITE_MEDALS_V6_3')) {
  console.log('[GC HOME CHAMP V6.3] El parche ya está aplicado.');
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
    /* GC_HOME_CHAMP_NUMBERS_WHITE_MEDALS_V6_3 */

    /* Solo bloques de clasificación de campeonatos */
    .gc-home2 .gc-home2-champ-standing-row .gc-home2-rank-badge--plain{
      color:#f5fff1 !important;
      font-size:18px !important;
      font-weight:1000 !important;
      border:0 !important;
      background:transparent !important;
      background-image:none !important;
      box-shadow:none !important;
      text-shadow:0 0 8px rgba(255,255,255,.10) !important;
    }

    .gc-home2 .gc-home2-champ-standing-row:nth-child(-n+3)
    .gc-home2-ranking-medal:not(.gc-home2-rank-badge--plain),
    .gc-home2 .gc-home2-champ-standing-row:nth-child(-n+3)
    .gc-home2-rank-badge:not(.gc-home2-rank-badge--plain){
      width:29px !important;
      min-width:29px !important;
      max-width:29px !important;
      height:29px !important;
      min-height:29px !important;
      max-height:29px !important;
      font-size:19px !important;
      line-height:1 !important;
      filter:drop-shadow(0 0 9px rgba(255,220,90,.22)) !important;
    }
  </style>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME CHAMP V6.3] Aplicado.');
console.log('  - Campeonatos: números en blanco.');
console.log('  - Campeonatos: medallas 1-2-3 un poco más grandes.');
console.log(`  - Backup: ${backupFile}`);
