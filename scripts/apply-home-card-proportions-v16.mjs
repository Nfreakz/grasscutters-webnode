import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_CARD_PROPORTIONS_V16';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_CARD_FINISH_V15')) {
  console.error(`[${PACK}] No se detecta la V15.`);
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
    /* GC_HOME_CARD_PROPORTIONS_V16 */

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__track-copy {
      min-height: 96px !important;
      padding: 8px 7px 16px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__best {
      margin-top: 10px !important;
      min-height: 94px !important;
      padding: 10px 14px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver {
      grid-template-columns: 76px minmax(0, 1fr) !important;
      gap: 14px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__avatar {
      width: 66px !important;
      height: 66px !important;
      transform: none !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__avatar img {
      width: 66px !important;
      height: 66px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__dot {
      right: -1px !important;
      bottom: 5px !important;
      width: 10px !important;
      height: 10px !important;
    }

    .gc-home2-combo-card--consolidated a.gc-home2-btn.gc-home2-combo-card__cta {
      min-height: 46px !important;
      margin-top: 10px !important;
      border: 1px solid rgba(198, 83, 255, .95) !important;
      border-radius: 10px !important;
      color: #fff !important;
      background-color: #8f28c9 !important;
      background-image:
        linear-gradient(180deg, #b63df0 0%, #8e27c7 58%, #6f1a9c 100%) !important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.16),
        0 12px 26px rgba(128,31,184,.36) !important;
    }

    .gc-home2-combo-card--consolidated a.gc-home2-btn.gc-home2-combo-card__cta:hover {
      background-color: #a330dd !important;
      background-image:
        linear-gradient(180deg, #c94cf7 0%, #9f31d8 58%, #7c20ae 100%) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--consolidated .gc-home2-combo-card__track-copy {
        min-height: 90px !important;
        padding-bottom: 13px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-combo-card__best {
        margin-top: 8px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-driver {
        grid-template-columns: 62px minmax(0, 1fr) !important;
        gap: 10px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-driver__avatar,
      .gc-home2-combo-card--consolidated .gc-home2-driver__avatar img {
        width: 56px !important;
        height: 56px !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);

if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(3);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Avatar reducido.`);
console.log(`[${PACK}] Más separación entre coche y panel inferior.`);
console.log(`[${PACK}] CTA violeta forzado con mayor especificidad.`);
console.log(`[${PACK}] Backup: ${backup}`);
