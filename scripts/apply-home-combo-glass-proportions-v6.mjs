import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_PROPORTIONS_V6';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_COMBO_GLASS_REFERENCE_V5')) {
  console.error(`[${PACK}] No se detecta la V5 de referencia.`);
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
    /* GC_HOME_COMBO_GLASS_PROPORTIONS_V6 */
    @media (min-width: 980px) {
      .gc-home2-hero__shell {
        grid-template-columns: minmax(0, 1fr) minmax(500px, 570px) !important;
      }
    }

    .gc-home2-combo-card--glass {
      width: min(100%, 570px) !important;
      max-width: 570px !important;
      min-height: 372px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      min-height: 372px !important;
      padding: 10px !important;
    }

    .gc-home2-combo-card__reference-head {
      min-height: 44px !important;
      padding: 6px 9px !important;
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__server-icon {
      width: 29px !important;
      height: 29px !important;
    }

    .gc-home2-combo-card__live-chip {
      top: 58px !important;
      right: 13px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
      min-height: 126px !important;
      padding: 34px 5px 10px !important;
    }

    .gc-home2-combo-card--glass h2[data-home2-track] {
      min-height: 1.7em !important;
      max-width: 86% !important;
      font-size: clamp(1.8rem, 3.3vw, 2.75rem) !important;
      line-height: .94 !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="medium"] {
      font-size: clamp(1.65rem, 2.95vw, 2.4rem) !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="long"] {
      font-size: clamp(1.38rem, 2.45vw, 1.95rem) !important;
      line-height: .97 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cars {
      max-width: 84% !important;
      margin-top: 5px !important;
      font-size: .82rem !important;
      -webkit-line-clamp: 1 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      grid-template-columns: minmax(0, 1fr) minmax(150px, 180px) !important;
      gap: 16px !important;
      min-height: 102px !important;
      padding: 11px 14px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver {
      display: grid !important;
      grid-template-columns: 70px minmax(0, 1fr) !important;
      align-items: center !important;
      gap: 13px !important;
      min-width: 0 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar,
    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 66px !important;
      height: 66px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta {
      min-width: 0 !important;
      overflow: hidden !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong {
      display: block !important;
      overflow: hidden !important;
      max-width: 100% !important;
      font-size: 1rem !important;
      line-height: 1.1 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small {
      display: block !important;
      overflow: hidden !important;
      max-width: 100% !important;
      margin-top: 4px !important;
      font-size: .72rem !important;
      line-height: 1.15 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
    }

    .gc-home2-combo-card__time-wrap {
      min-width: 150px !important;
      padding-left: 15px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      font-size: clamp(1.55rem, 2.75vw, 2.15rem) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      min-height: 42px !important;
      margin-top: 9px !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass {
        min-height: 356px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
        min-height: 356px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
        min-height: 116px !important;
        padding-top: 31px !important;
      }

      .gc-home2-combo-card--glass h2[data-home2-track] {
        max-width: 88% !important;
        font-size: clamp(1.72rem, 8vw, 2.35rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="medium"] {
        font-size: clamp(1.55rem, 7vw, 2.05rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="long"] {
        font-size: clamp(1.28rem, 5.8vw, 1.72rem) !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0, 1fr) minmax(124px, 142px) !important;
        gap: 10px !important;
        min-height: 98px !important;
        padding: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver {
        grid-template-columns: 58px minmax(0, 1fr) !important;
        gap: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__avatar,
      .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
        width: 56px !important;
        height: 56px !important;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 124px !important;
        padding-left: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__time {
        font-size: clamp(1.35rem, 6.7vw, 1.82rem) !important;
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
console.log(`[${PACK}] Tarjeta más ancha, más baja y con tipografía corregida.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
