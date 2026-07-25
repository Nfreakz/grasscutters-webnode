import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_WIDE_TRANSPARENT_V7';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_COMBO_GLASS_PROPORTIONS_V6')) {
  console.error(`[${PACK}] No se detecta la V6.`);
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
    /* GC_HOME_COMBO_GLASS_WIDE_TRANSPARENT_V7 */
    @media (min-width: 980px) {
      .gc-home2-hero__shell {
        grid-template-columns: minmax(0, 1fr) minmax(650px, 720px) !important;
      }
    }

    .gc-home2-combo-card--glass {
      width: min(100%, 710px) !important;
      max-width: 710px !important;
      min-height: 350px !important;
      border-color: rgba(146,255,59,.58) !important;
      background: transparent !important;
      box-shadow:
        0 18px 46px rgba(0,0,0,.3),
        0 0 0 1px rgba(255,255,255,.02) inset !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      min-height: 350px !important;
      padding: 10px !important;
      background: transparent !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__media,
    .gc-home2-combo-card--glass .gc-home2-combo-card__media-shade,
    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      display: none !important;
    }

    .gc-home2-combo-card__reference-head {
      min-height: 44px !important;
      background: rgba(6,9,8,.58) !important;
      border-color: rgba(124,255,0,.17) !important;
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__server-icon {
      background: linear-gradient(145deg, #7acb27, #31520f) !important;
      box-shadow: 0 7px 18px rgba(124,255,0,.18) !important;
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__label {
      color: #c9ff9f !important;
    }

    .gc-home2-combo-card__live-chip {
      background: rgba(5,8,7,.66) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
      min-height: 112px !important;
      padding: 28px 6px 8px !important;
    }

    .gc-home2-combo-card--glass h2[data-home2-track] {
      max-width: 90% !important;
      font-size: clamp(1.7rem, 2.8vw, 2.45rem) !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="medium"] {
      font-size: clamp(1.55rem, 2.55vw, 2.15rem) !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="long"] {
      font-size: clamp(1.28rem, 2.1vw, 1.75rem) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cars {
      max-width: 88% !important;
      color: rgba(235,238,236,.82) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      grid-template-columns: minmax(0, 1fr) minmax(180px, 210px) !important;
      min-height: 96px !important;
      padding: 10px 14px !important;
      background: rgba(7,10,9,.68) !important;
      border-color: rgba(124,255,0,.16) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.18) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver {
      grid-template-columns: 78px minmax(0, 1fr) !important;
      gap: 15px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar,
    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 72px !important;
      height: 72px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong {
      font-size: 1.05rem !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small {
      font-size: .76rem !important;
    }

    .gc-home2-combo-card__time-wrap {
      min-width: 180px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      font-size: clamp(1.7rem, 2.6vw, 2.35rem) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      min-height: 52px !important;
      margin-top: 10px !important;
      border: 1px solid rgba(186,77,240,.78) !important;
      border-radius: 12px !important;
      background: linear-gradient(180deg, #9f2de0 0%, #6e1aa1 100%) !important;
      box-shadow:
        inset 0 1px rgba(255,255,255,.14),
        0 14px 28px rgba(111,27,162,.28) !important;
      font-size: .82rem !important;
      letter-spacing: .09em !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta:hover {
      background: linear-gradient(180deg, #b239ef 0%, #7b20b2 100%) !important;
      transform: translateY(-1px) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass {
        width: 100% !important;
        min-height: 338px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
        min-height: 338px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
        min-height: 106px !important;
        padding-top: 25px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0, 1fr) minmax(132px, 150px) !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver {
        grid-template-columns: 62px minmax(0, 1fr) !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__avatar,
      .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
        width: 58px !important;
        height: 58px !important;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 132px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
        min-height: 48px !important;
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
console.log(`[${PACK}] Tarjeta 25% más ancha, transparente y con CTA corregido.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
