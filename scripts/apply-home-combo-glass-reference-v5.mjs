import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_REFERENCE_V5';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) {
  console.error(`[${PACK}] No se detecta la tarjeta Glass V1.`);
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

/* 1) Cabecera exacta del diseño de referencia. */
const compactStatus = `            <div class="gc-home2-combo-card__compact-status">
              <span data-home2-hero-source>LIGA</span>
              <i aria-hidden="true"></i>
              <strong>ACTIVO</strong>
            </div>`;

const fullHeader = `            <!-- GC_HOME_COMBO_GLASS_REFERENCE_V5 -->
            <header class="gc-home2-combo-card__reference-head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>Servidor 1 · Liga</p>
              <span class="gc-home2-combo-card__chevron" aria-hidden="true"></span>
            </header>

            <div class="gc-home2-combo-card__live-chip">
              <span>EN VIVO</span>
              <i aria-hidden="true"></i>
            </div>`;

if (src.includes(compactStatus)) {
  src = src.replace(compactStatus, fullHeader);
} else {
  const oldHeader = `            <header class="gc-home2-combo-card__glass-head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>Combo activo</p>
              <span class="gc-home2-combo-card__status"><i aria-hidden="true"></i>ACTIVO</span>
            </header>`;
  if (!src.includes(oldHeader)) {
    console.error(`[${PACK}] No se encontró una cabecera compatible.`);
    process.exit(3);
  }
  src = src.replace(oldHeader, fullHeader);
}

/* 2) Etiquetas de servidor como en el diseño aprobado. */
src = src.replace(
  `        const label = source === 'gt4' ? 'GT4' : 'LIGA';`,
  `        const label = source === 'gt4' ? 'Servidor 2 · GT4' : 'Servidor 1 · Liga';`
);
src = src.replace(
  `        const label = source === 'gt4' ? 'Servidor 2 · GT4' : 'Servidor 1 · Liga';`,
  `        const label = source === 'gt4' ? 'Servidor 2 · GT4' : 'Servidor 1 · Liga';`
);

/* 3) CSS final de referencia. */
const css = `
    /* GC_HOME_COMBO_GLASS_REFERENCE_V5 */
    @media (min-width: 980px) {
      .gc-home2-hero__shell {
        grid-template-columns: minmax(0, 1fr) minmax(430px, 510px) !important;
        gap: clamp(28px, 4vw, 64px) !important;
      }
    }

    .gc-home2-combo-card--glass {
      --gc-glass-accent: #9b2be2 !important;
      width: min(100%, 510px) !important;
      max-width: 510px !important;
      min-height: 430px !important;
      justify-self: end;
      border: 1px solid rgba(175, 77, 237, .82) !important;
      border-radius: 18px !important;
      background: #080a0f !important;
      box-shadow:
        0 22px 58px rgba(0,0,0,.46),
        0 0 0 1px rgba(255,255,255,.025) inset,
        0 0 24px rgba(155,43,226,.12) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      min-height: 430px !important;
      padding: 12px !important;
    }

    .gc-home2-combo-card__reference-head {
      position: relative;
      z-index: 5;
      display: grid;
      grid-template-columns: auto minmax(0,1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 7px 10px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(25,27,35,.9), rgba(11,13,18,.86));
      box-shadow: inset 0 1px rgba(255,255,255,.045), 0 10px 24px rgba(0,0,0,.22);
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__server-icon {
      width: 32px !important;
      height: 32px !important;
      border-radius: 8px !important;
      background: linear-gradient(145deg, #a22ee7, #52206d) !important;
      box-shadow: 0 7px 18px rgba(155,43,226,.28) !important;
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__label {
      margin: 0 !important;
      color: #f6f6f8 !important;
      font-size: .68rem !important;
      font-weight: 900 !important;
      letter-spacing: .085em !important;
      text-transform: uppercase;
    }

    .gc-home2-combo-card__reference-head .gc-home2-combo-card__label::first-letter {
      color: inherit;
    }

    .gc-home2-combo-card__chevron {
      width: 9px;
      height: 9px;
      margin-right: 4px;
      border-right: 2px solid rgba(255,255,255,.9);
      border-bottom: 2px solid rgba(255,255,255,.9);
      transform: rotate(45deg) translateY(-2px);
    }

    .gc-home2-combo-card__live-chip {
      position: absolute;
      z-index: 5;
      top: 66px;
      right: 15px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 25px;
      padding: 5px 9px;
      border: 1px solid rgba(124,255,0,.2);
      border-radius: 999px;
      color: #a8ff45;
      background: rgba(5,8,8,.78);
      font-size: .54rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .gc-home2-combo-card__live-chip i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #7cff00;
      box-shadow: 0 0 10px rgba(124,255,0,.95);
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
      display: flex !important;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 150px !important;
      margin: 0 !important;
      padding: 42px 5px 14px !important;
    }

    .gc-home2-combo-card--glass h2[data-home2-track] {
      display: -webkit-box;
      overflow: hidden;
      min-height: 1.82em !important;
      margin: 0 !important;
      max-width: 82%;
      color: #fff !important;
      font-size: clamp(2.4rem, 4.4vw, 3.65rem) !important;
      font-weight: 950 !important;
      letter-spacing: -.055em !important;
      line-height: .91 !important;
      text-shadow: 0 3px 18px rgba(0,0,0,.72);
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card--glass h2[data-title-size="medium"] {
      font-size: clamp(2.15rem, 3.9vw, 3.15rem) !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="long"] {
      font-size: clamp(1.72rem, 3.1vw, 2.42rem) !important;
      line-height: .95 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cars {
      display: -webkit-box;
      overflow: hidden;
      min-height: 1.2em;
      max-width: 76%;
      margin: 8px 0 0 !important;
      color: rgba(242,242,245,.72) !important;
      font-size: .9rem !important;
      font-weight: 650;
      line-height: 1.22;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__media-shade {
      background:
        linear-gradient(180deg, rgba(7,8,12,.16) 0%, rgba(7,8,12,.32) 42%, rgba(7,8,12,.78) 72%, rgba(7,8,12,.96) 100%) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      opacity: .72 !important;
      object-position: center 42% !important;
      filter: saturate(.9) contrast(1.05) brightness(.68) !important;
      transform: scale(1.025) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) minmax(138px, auto) !important;
      align-items: center !important;
      gap: 14px !important;
      min-height: 112px !important;
      margin: 0 !important;
      padding: 13px 14px !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      border-radius: 14px !important;
      background: linear-gradient(135deg, rgba(18,21,28,.9), rgba(8,10,14,.88)) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.035), 0 12px 28px rgba(0,0,0,.25) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver {
      min-width: 0;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar,
    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 58px !important;
      height: 58px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar {
      border-color: #7cff00 !important;
      box-shadow: 0 0 0 1px rgba(124,255,0,.35), 0 0 18px rgba(124,255,0,.16) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-card-label {
      color: #7cff00 !important;
      font-size: .62rem !important;
      font-weight: 900 !important;
      letter-spacing: .08em !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong {
      color: #fff !important;
      font-size: 1rem !important;
      line-height: 1.1;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small {
      display: -webkit-box;
      overflow: hidden;
      color: rgba(226,228,233,.62) !important;
      font-size: .7rem !important;
      line-height: 1.22;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card__time-wrap {
      display: flex !important;
      flex-direction: column;
      justify-content: center;
      align-items: flex-end;
      min-width: 138px !important;
      padding-left: 14px !important;
      border-left: 1px solid rgba(255,255,255,.13) !important;
      text-align: right !important;
    }

    .gc-home2-combo-card__time-wrap > span {
      display: block !important;
      margin: 0 0 6px !important;
      color: rgba(237,238,243,.52) !important;
      font-size: .58rem !important;
      font-weight: 850 !important;
      letter-spacing: .1em !important;
      text-transform: uppercase;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time::before,
    .gc-home2-combo-card--glass .gc-home2-combo-card__time::after {
      display: none !important;
      content: none !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      color: #b83df0 !important;
      font-family: "JetBrains Mono", "Roboto Mono", monospace !important;
      font-size: clamp(1.72rem, 3.4vw, 2.45rem) !important;
      font-weight: 900 !important;
      letter-spacing: -.065em !important;
      line-height: 1 !important;
      text-shadow: 0 0 18px rgba(184,61,240,.28) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      justify-content: center !important;
      width: 100% !important;
      min-height: 46px !important;
      margin-top: 11px !important;
      border: 1px solid rgba(197,79,255,.62) !important;
      border-radius: 9px !important;
      color: #fff !important;
      background: linear-gradient(180deg, #8d29d0, #5f168d) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.11), 0 11px 24px rgba(108,24,158,.22) !important;
      font-size: .72rem !important;
      font-weight: 900 !important;
      letter-spacing: .08em !important;
      text-transform: uppercase;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta:hover {
      transform: translateY(-1px) !important;
      background: linear-gradient(180deg, #a52ee8, #6d1aa0) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass {
        width: 100% !important;
        min-height: 408px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
        min-height: 408px !important;
        padding: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
        min-height: 140px !important;
        padding-top: 39px !important;
      }

      .gc-home2-combo-card--glass h2[data-home2-track] {
        max-width: 88%;
        font-size: clamp(2.05rem, 10vw, 3rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="medium"] {
        font-size: clamp(1.75rem, 8.6vw, 2.55rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="long"] {
        font-size: clamp(1.45rem, 7vw, 2rem) !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0, 1fr) minmax(112px, auto) !important;
        gap: 10px !important;
        min-height: 104px !important;
        padding: 11px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__avatar,
      .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
        width: 50px !important;
        height: 50px !important;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 112px !important;
        padding-left: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__time {
        font-size: clamp(1.4rem, 7vw, 1.9rem) !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró el cierre del bloque de estilos.`);
  process.exit(4);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Diseño de referencia aplicado sin mapa pequeño del circuito.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta: npm run deps:baseline && npm run quality`);
