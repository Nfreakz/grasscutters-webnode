import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_SERVER_HEADER_MINIMAL_V14';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_CONSOLIDATED_HERO_CARD_V13')) {
  console.error(`[${PACK}] No se detecta la V13 consolidada.`);
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

/* 1. Simplificar físicamente la cabecera. */
const oldHeader = `            <header class="gc-home2-combo-card__head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>
                Servidor 1 · Liga
              </p>
              <span class="gc-home2-combo-card__chevron" aria-hidden="true"></span>
            </header>`;

const newHeader = `            <!-- GC_HOME_SERVER_HEADER_MINIMAL_V14 -->
            <header class="gc-home2-combo-card__head gc-home2-combo-card__head--minimal">
              <p class="gc-home2-combo-card__label" data-home2-hero-source>
                SERVIDOR 1 LIGA
              </p>
            </header>`;

if (!src.includes(oldHeader)) {
  console.error(`[${PACK}] No se encontró la cabecera consolidada V13.`);
  process.exit(3);
}

src = src.replace(oldHeader, newHeader);

/* 2. Cambiar las etiquetas dinámicas. */
const oldLabel = `        const label = source === 'gt4' ? 'Servidor 2 · GT4' : 'Servidor 1 · Liga';`;
const newLabel = `        const label = source === 'gt4' ? 'SERVIDOR 2 CAMPEONATO' : 'SERVIDOR 1 LIGA';`;

if (!src.includes(oldLabel)) {
  console.error(`[${PACK}] No se encontró la etiqueta dinámica de servidor.`);
  process.exit(4);
}

src = src.replace(oldLabel, newLabel);

/* 3. Overrides finales limpios. */
const css = `
    /* GC_HOME_SERVER_HEADER_MINIMAL_V14 */
    .gc-home2-combo-card__head--minimal {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      min-height: 34px !important;
      padding: 4px 10px !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .gc-home2-combo-card__head--minimal .gc-home2-combo-card__label {
      margin: 0 !important;
      color: #ff4b45 !important;
      font-size: .72rem !important;
      font-weight: 950 !important;
      letter-spacing: .09em !important;
      line-height: 1 !important;
      text-transform: uppercase !important;
      white-space: nowrap !important;
    }

    .gc-home2-combo-card__track-copy {
      padding-top: 10px !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card__head--minimal {
        min-height: 31px !important;
        padding: 3px 8px !important;
      }

      .gc-home2-combo-card__head--minimal .gc-home2-combo-card__label {
        font-size: .66rem !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);

if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(5);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);

fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Liga: SERVIDOR 1 LIGA`);
console.log(`[${PACK}] GT4: SERVIDOR 2 CAMPEONATO`);
console.log(`[${PACK}] Icono, chevron, fondo y borde de cabecera eliminados.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
