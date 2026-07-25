import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_CARD_FINISH_V15';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_SERVER_HEADER_MINIMAL_V14')) {
  console.error(`[${PACK}] No se detecta la V14.`);
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
    /* GC_HOME_CARD_FINISH_V15 */
    .gc-home2-combo-card--consolidated {
      min-height: 304px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__content {
      min-height: 304px !important;
      padding: 7px 10px 8px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__head--minimal {
      min-height: 24px !important;
      padding: 0 8px 1px !important;
      margin: 0 !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__track-copy {
      min-height: 90px !important;
      padding: 6px 7px 7px !important;
      margin: 0 !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__best {
      min-height: 98px !important;
      padding: 9px 13px !important;
      margin: 0 !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver {
      grid-template-columns: 96px minmax(0, 1fr) !important;
      gap: 14px !important;
      align-items: center !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__avatar {
      justify-self: center !important;
      align-self: center !important;
      width: 82px !important;
      height: 82px !important;
      margin: 0 !important;
      transform: translateX(4px) !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__avatar img {
      width: 82px !important;
      height: 82px !important;
      object-position: center center !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-driver__dot {
      right: -1px !important;
      bottom: 7px !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__cta {
      min-height: 46px !important;
      margin: 8px 0 0 !important;
      padding: 0 18px !important;
      border: 1px solid rgba(190, 72, 241, .95) !important;
      border-radius: 10px !important;
      color: #fff !important;
      background:
        linear-gradient(180deg, #b23bf0 0%, #7b20b4 58%, #65158f 100%) !important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.16),
        0 12px 26px rgba(124, 31, 178, .34) !important;
      font-size: .76rem !important;
      font-weight: 950 !important;
      letter-spacing: .09em !important;
      text-transform: uppercase !important;
    }

    .gc-home2-combo-card--consolidated .gc-home2-combo-card__cta:hover {
      background:
        linear-gradient(180deg, #c64cf7 0%, #8a2ac4 58%, #731ca1 100%) !important;
      filter: brightness(1.04) !important;
      transform: translateY(-1px) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--consolidated,
      .gc-home2-combo-card--consolidated .gc-home2-combo-card__content {
        min-height: 292px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-combo-card__track-copy {
        min-height: 84px !important;
        padding-top: 5px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-driver {
        grid-template-columns: 70px minmax(0, 1fr) !important;
        gap: 10px !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-driver__avatar {
        width: 64px !important;
        height: 64px !important;
        transform: translateX(2px) !important;
      }

      .gc-home2-combo-card--consolidated .gc-home2-driver__avatar img {
        width: 64px !important;
        height: 64px !important;
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
console.log(`[${PACK}] Avatar centrado.`);
console.log(`[${PACK}] Espacio superior e inferior reducido.`);
console.log(`[${PACK}] CTA violeta forzado con selector específico.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
