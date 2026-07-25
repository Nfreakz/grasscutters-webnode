import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_PILOT_POPOVER_BADGES_FULL_V1_2';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_PILOT_POPOVER_PROPOSAL_A_V1_1')) {
  console.error(`[${PACK}] No se detecta la V1.1 del popup.`);
  process.exit(2);
}

if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

const css = `
  /* ${PACK} */
  .gc-home-pilot-popover__ratings {
    gap: 12px !important;
    padding-top: 14px !important;
  }

  .gc-home-pilot-popover__rating {
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: stretch !important;
    min-height: 74px !important;
    padding: 12px 14px !important;
    border-radius: 12px !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.04),
      0 0 0 1px rgba(150,255,47,.03) !important;
  }

  .gc-home-pilot-popover__rating:first-child {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.04),
      0 0 0 1px rgba(33,203,255,.06) !important;
  }

  .gc-home-pilot-popover__rating > span {
    display: flex !important;
    align-items: center !important;
    align-self: stretch !important;
    min-height: 100% !important;
    padding: 0 12px !important;
    border: 1px solid currentColor !important;
    border-radius: 10px !important;
    background: rgba(0,0,0,.14) !important;
    font-size: 11px !important;
    line-height: 1 !important;
  }

  .gc-home-pilot-popover__rating > strong {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    align-self: stretch !important;
    min-height: 100% !important;
    padding-left: 16px !important;
    font-size: 28px !important;
    line-height: 1 !important;
    letter-spacing: -.03em !important;
  }

  @media (max-width: 700px) {
    .gc-home-pilot-popover__rating {
      min-height: 68px !important;
      padding: 11px 12px !important;
    }

    .gc-home-pilot-popover__rating > strong {
      font-size: 24px !important;
      padding-left: 12px !important;
    }
  }

  @media (max-width: 430px) {
    .gc-home-pilot-popover__ratings {
      grid-template-columns: 1fr !important;
    }

    .gc-home-pilot-popover__rating > strong {
      font-size: 22px !important;
    }
  }
`;

const close = '</style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(3);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Badges SR/GSR ampliadas para ocupar toda la fila.`);
console.log(`[${PACK}] Backup: ${backup}`);
