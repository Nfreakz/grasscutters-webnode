import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_NAMES_LAYOUT_V3';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
if (!src.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) {
  console.error(`[${PACK}] Falta la tarjeta Glass V1.`);
  process.exit(2);
}
if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

const oldHead = `            <header class="gc-home2-combo-card__glass-head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>Combo activo</p>
              <span class="gc-home2-combo-card__status"><i aria-hidden="true"></i>ACTIVO</span>
            </header>`;

const newHead = `            <!-- GC_HOME_COMBO_GLASS_NAMES_LAYOUT_V3 -->
            <div class="gc-home2-combo-card__compact-status">
              <span data-home2-hero-source>LIGA</span>
              <i aria-hidden="true"></i>
              <strong>ACTIVO</strong>
            </div>`;

if (!src.includes(oldHead)) {
  console.error(`[${PACK}] No se encontró la cabecera esperada.`);
  process.exit(3);
}
src = src.replace(oldHead, newHead);

const oldCleaner = `      const cleanPublicName = (value: unknown, source: unknown = ''): string => {
        let out = String(value ?? '').trim();
        if (!out || out === '--') return out || '--';
        if (String(source).toLowerCase() === 'gt4') out = out.replace(/^00[\\s_-]+/i, '').trim();
        return out.replace(/\\s+/g, ' ');
      };`;

const newCleaner = oldCleaner + `

      const cleanHeroTrackName = (value: unknown): string => {
        const raw = cleanPublicName(value);
        if (!raw || raw === '--') return raw;
        return raw
          .replace(/\\s*\\((?:chicane|full|gp|grand prix|national|short|long|club)\\)\\s*$/i, '')
          .replace(/\\s+(?:19|20)\\d{2}\\s*$/i, '')
          .replace(/\\s+/g, ' ')
          .trim() || raw;
      };

      const cleanHeroCarName = (value: unknown, source: unknown = ''): string => {
        const raw = cleanPublicName(value, source);
        if (!raw || raw === '--') return raw;
        return raw
          .replace(/^(?:acf|rss|ks|gc)\\s+(?:gt2|gt3|gt4|dtm|btcc)\\s*[-–—:]\\s*/i, '')
          .replace(/^(?:acf|rss|ks|gc)\\s*[-–—:]\\s*/i, '')
          .replace(/\\s+(?:19|20)\\d{2}\\s*$/i, '')
          .replace(/\\s+/g, ' ')
          .trim() || raw;
      };`;

if (!src.includes(oldCleaner)) {
  console.error(`[${PACK}] No se encontró cleanPublicName().`);
  process.exit(4);
}
src = src.replace(oldCleaner, newCleaner);

const oldNames = `        const track = cleanPublicName(comboTrackName || fallbackTrack, source);
        const cars = comboCarNames.length ? comboCarNames : fallbackCars;
        const label = source === 'gt4' ? 'Servidor 2 · GT4' : 'Servidor 1 · Liga';`;

const newNames = `        const track = cleanHeroTrackName(comboTrackName || fallbackTrack);
        const cars = (comboCarNames.length ? comboCarNames : fallbackCars)
          .map((name) => cleanHeroCarName(name, source))
          .filter(Boolean);
        const label = source === 'gt4' ? 'GT4' : 'LIGA';`;

if (!src.includes(oldNames)) {
  console.error(`[${PACK}] No se encontró el bloque de nombres del hero.`);
  process.exit(5);
}
src = src.replace(oldNames, newNames);

const oldSet = `        setText('[data-home2-hero-source]', label);
        setText('[data-home2-track]', track || 'Combo activo');
        setText('[data-home2-cars]', cars.slice(0, 3).join(' / ') || carName(best));`;

const newSet = `        setText('[data-home2-hero-source]', label);
        setText('[data-home2-track]', track || 'Combo activo');
        setText('[data-home2-cars]', cars.slice(0, 3).join(' / ') || cleanHeroCarName(carName(best), source));
        const heroTrackTitle = q('[data-home2-track]');
        if (heroTrackTitle) {
          const length = String(track || '').length;
          heroTrackTitle.dataset.titleSize = length > 24 ? 'long' : length > 14 ? 'medium' : 'short';
        }`;

if (!src.includes(oldSet)) {
  console.error(`[${PACK}] No se encontró el render del hero.`);
  process.exit(6);
}
src = src.replace(oldSet, newSet);

const css = `
    /* GC_HOME_COMBO_GLASS_NAMES_LAYOUT_V3 */
    .gc-home2-combo-card--glass,
    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      min-height: 330px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      padding: 13px !important;
    }

    .gc-home2-combo-card__compact-status {
      position: absolute;
      z-index: 4;
      top: 13px;
      right: 13px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 27px;
      padding: 5px 9px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 999px;
      background: rgba(7,9,13,.62);
      box-shadow: 0 8px 22px rgba(0,0,0,.24);
      backdrop-filter: blur(12px) saturate(1.15);
      font-size: .58rem;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .gc-home2-combo-card__compact-status > span {
      color: #d66aff;
      font-weight: 900;
    }

    .gc-home2-combo-card__compact-status > i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #7cff00;
      box-shadow: 0 0 10px rgba(124,255,0,.9);
    }

    .gc-home2-combo-card__compact-status > strong {
      color: #c7ffad;
      font-size: inherit;
      font-weight: 900;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 114px;
      margin-top: 0 !important;
      padding: 47px 4px 12px !important;
    }

    .gc-home2-combo-card--glass h2[data-home2-track] {
      display: -webkit-box;
      overflow: hidden;
      min-height: 1.84em;
      max-width: 100%;
      font-size: clamp(2rem, 4.3vw, 3.25rem) !important;
      line-height: .92 !important;
      word-break: normal;
      overflow-wrap: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card--glass h2[data-title-size="medium"] {
      font-size: clamp(1.82rem, 3.75vw, 2.8rem) !important;
    }

    .gc-home2-combo-card--glass h2[data-title-size="long"] {
      font-size: clamp(1.48rem, 3.05vw, 2.18rem) !important;
      line-height: .96 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cars {
      display: -webkit-box;
      overflow: hidden;
      min-height: 1.25em;
      margin-top: 5px !important;
      font-size: .82rem !important;
      line-height: 1.25;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      min-height: 100px;
      padding: 10px 12px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      min-height: 42px !important;
      margin-top: 8px !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass,
      .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
        min-height: 318px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
        min-height: 105px;
        padding-top: 41px !important;
      }

      .gc-home2-combo-card--glass h2[data-home2-track] {
        font-size: clamp(1.78rem, 8vw, 2.45rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="medium"] {
        font-size: clamp(1.55rem, 7vw, 2.08rem) !important;
      }

      .gc-home2-combo-card--glass h2[data-title-size="long"] {
        font-size: clamp(1.3rem, 5.8vw, 1.72rem) !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(7);
}
src = src.slice(0, pos) + css + '\n' + src.slice(pos);

fs.writeFileSync(file, src, 'utf8');
console.log(`[${PACK}] Aplicado.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
