import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-championship-compact-v1-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME CHAMP COMPACT V1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);
let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_CHAMPIONSHIP_BLOCKS_COMPACT_V1')) {
  console.log('[GC HOME CHAMP COMPACT V1] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_CHAMPIONSHIP_BLOCKS_COMPACT_V1 */
    .gc-home2 .gc-home2-championship-compact{
      padding:12px 14px !important;
      gap:10px !important;
    }
    .gc-home2 .gc-home2-championship-compact > header,
    .gc-home2 .gc-home2-championship-compact .gc-home2-section__head{
      margin-bottom:8px !important;
      gap:10px !important;
    }
    .gc-home2 .gc-home2-championship-compact h2{
      margin:2px 0 0 !important;
      font-size:20px !important;
      line-height:1 !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-section__sub{
      margin-top:5px !important;
      font-size:11px !important;
      line-height:1.25 !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-btn{
      min-height:36px !important;
      padding:0 18px !important;
      font-size:10px !important;
    }
    .gc-home2 .gc-home2-championship-compact [class*="championship-grid"],
    .gc-home2 .gc-home2-championship-compact [class*="champ-grid"],
    .gc-home2 .gc-home2-championship-compact [class*="champ-body"]{
      gap:10px !important;
      align-items:stretch !important;
    }
    .gc-home2 .gc-home2-championship-compact img:not(.gc-home2-champ-standing-avatar){
      max-height:165px !important;
      object-fit:cover !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-row{
      min-height:36px !important;
      padding:6px 9px !important;
      gap:7px !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-meta strong,
    .gc-home2 .gc-home2-championship-compact .gc-home-pilot-link{
      font-size:11px !important;
      line-height:1 !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-points strong{
      font-size:10px !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-points small{
      font-size:7px !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-avatar,
    .gc-home2 .gc-home2-championship-compact .gc-home2-champ-standing-row img{
      width:22px !important;
      min-width:22px !important;
      height:22px !important;
      min-height:22px !important;
    }
    .gc-home2 .gc-home2-championship-compact .gc-home2-rank-badge,
    .gc-home2 .gc-home2-championship-compact .gc-home2-ranking-medal{
      width:22px !important;
      min-width:22px !important;
      height:22px !important;
      min-height:22px !important;
      font-size:12px !important;
    }
    .gc-home2 .gc-home2-championship-compact [class*="metric"],
    .gc-home2 .gc-home2-championship-compact [class*="stats"] > div{
      padding:7px 8px !important;
    }
    @media (min-width:900px){
      .gc-home2 .gc-home2-championship-compact [class*="championship-grid"],
      .gc-home2 .gc-home2-championship-compact [class*="champ-grid"],
      .gc-home2 .gc-home2-championship-compact [class*="champ-body"]{
        grid-template-columns:minmax(310px,.9fr) 82px minmax(0,1.35fr) !important;
      }
    }
    @media (max-width:899px){
      .gc-home2 .gc-home2-championship-compact{padding:11px !important;}
      .gc-home2 .gc-home2-championship-compact img:not(.gc-home2-champ-standing-avatar){
        max-height:150px !important;
      }
    }
  </style>

  <script>
    /* GC_HOME_CHAMPIONSHIP_BLOCKS_COMPACT_V1 */
    (() => {
      const markChampionshipBlocks = (): void => {
        document.querySelectorAll<HTMLElement>('.gc-home2-champ-standing-row').forEach((row) => {
          let current: HTMLElement | null = row.parentElement;
          while (current && !current.matches('[data-gc-home2]')) {
            const rows = current.querySelectorAll('.gc-home2-champ-standing-row').length;
            const hasHeading = Boolean(current.querySelector('h2'));
            const text = String(current.textContent || '').toLowerCase();
            const isChampionship = text.includes('campeonato') || text.includes('liga combos');
            if (rows >= 4 && hasHeading && isChampionship) {
              current.classList.add('gc-home2-championship-compact');
              break;
            }
            current = current.parentElement;
          }
        });
      };

      markChampionshipBlocks();
      let timer = 0;
      const observer = new MutationObserver(() => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = 0;
          markChampionshipBlocks();
        },100);
      });
      const root = document.querySelector('[data-gc-home2]');
      if (root) observer.observe(root,{childList:true,subtree:true});
      window.setTimeout(markChampionshipBlocks,1000);
      window.setTimeout(markChampionshipBlocks,2500);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME CHAMP COMPACT V1] Aplicado.');
console.log(`  - Backup: ${backupFile}`);
