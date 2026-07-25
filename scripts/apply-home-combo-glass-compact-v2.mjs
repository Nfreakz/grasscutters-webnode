import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_COMPACT_V2';
const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'index.astro');

if (!fs.existsSync(target)) {
  console.error(`[${PACK}] No existe: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (!source.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) {
  console.error(`[${PACK}] No se detecta GC_HOME_COMBO_GLASS_ACSM_V1. Aplica primero el pack V1.`);
  process.exit(2);
}

if (source.includes('GC_HOME_COMBO_GLASS_COMPACT_V2')) {
  console.log(`[${PACK}] Ya estaba aplicado. No se realizan cambios.`);
  process.exit(0);
}

const backupDir = path.join(root, '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(
  backupDir,
  `index.astro.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
);
fs.copyFileSync(target, backup);

let changes = 0;

const rotationBlock = `
            <div class="gc-home2-combo-card__rotation" aria-label="Rotación automática de servidores">
              <span class="is-active" data-home2-combo-state="main"><i></i>Liga</span>
              <span data-home2-combo-state="gt4"><i></i>GT4</span>
            </div>`;

if (source.includes(rotationBlock)) {
  source = source.replace(rotationBlock, '');
  changes++;
} else {
  console.warn(`[${PACK}] No se encontró el bloque inferior Liga/GT4; se continúa con la compactación.`);
}

const replacements = [
  ['min-height: 460px;', 'min-height: 360px;'],
  ['min-height: 460px;\n      padding: 18px;', 'min-height: 360px;\n      padding: 14px;'],
  ['min-height: 52px;', 'min-height: 44px;'],
  ['padding: 8px 11px;', 'padding: 6px 9px;'],
  ['width: 34px;\n      height: 34px;', 'width: 30px;\n      height: 30px;'],
  ['padding: 38px 5px 20px;', 'padding: 24px 4px 14px;'],
  ['font-size: clamp(2.3rem, 5vw, 4.1rem) !important;', 'font-size: clamp(1.9rem, 4vw, 3.1rem) !important;'],
  ['margin: 10px 0 0 !important;', 'margin: 7px 0 0 !important;'],
  ['padding: 15px 16px !important;', 'padding: 11px 13px !important;'],
  ['gap: 16px;', 'gap: 12px;'],
  ['min-width: 126px;', 'min-width: 108px;'],
  ['padding-left: 16px;', 'padding-left: 12px;'],
  ['font-size: clamp(1.45rem, 3.2vw, 2.22rem) !important;', 'font-size: clamp(1.28rem, 2.7vw, 1.85rem) !important;'],
  ['min-height: 50px;', 'min-height: 44px;'],
  ['margin-top: 12px;', 'margin-top: 9px;'],
];

for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changes++;
  }
}

// Remove the old rotation CSS completely.
source = source.replace(
  /\n\s*\.gc-home2-combo-card__rotation\s*\{[\s\S]*?\n\s*\.gc-home2-combo-card__rotation \.is-active i\s*\{[\s\S]*?\n\s*\}\n/,
  '\n'
);

// Compact mobile values.
source = source.replace(
  `.gc-home2-combo-card--glass,
      .gc-home2-combo-card__glass-content {
        min-height: 430px;
      }`,
  `.gc-home2-combo-card--glass,
      .gc-home2-combo-card__glass-content {
        min-height: 350px;
      }`
);

source = source.replace(
  `.gc-home2-combo-card__glass-content {
        padding: 13px;
      }`,
  `.gc-home2-combo-card__glass-content {
        padding: 11px;
      }`
);

const marker = `
    /* GC_HOME_COMBO_GLASS_COMPACT_V2 */
    .gc-home2-combo-card--glass .gc-home2-driver__avatar {
      width: 54px;
      height: 54px;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 54px;
      height: 54px;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong {
      font-size: .98rem;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small {
      font-size: .72rem;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0,1fr) auto;
        align-items: center;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 96px;
        padding: 0 0 0 10px;
        border-top: 0;
        border-left: 1px solid rgba(255,255,255,.12);
        text-align: right;
      }

      .gc-home2-combo-card--glass h2 {
        font-size: clamp(1.75rem, 9vw, 2.55rem) !important;
      }
    }
`;

const styleClose = '  </style>';
const lastStyleClose = source.lastIndexOf(styleClose);
if (lastStyleClose < 0) {
  console.error(`[${PACK}] No se encontró el cierre del bloque de estilos.`);
  process.exit(3);
}
source = source.slice(0, lastStyleClose) + marker + '\n' + source.slice(lastStyleClose);
changes++;

fs.writeFileSync(target, source, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Cambios realizados: ${changes}`);
console.log(`[${PACK}] Se ha eliminado el selector inferior Liga/GT4.`);
console.log(`[${PACK}] Se ha reducido altura, espaciado, avatar, título, tiempo y CTA.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta: npm run deps:baseline && npm run quality`);
