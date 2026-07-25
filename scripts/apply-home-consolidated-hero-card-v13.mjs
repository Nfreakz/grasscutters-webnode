import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_CONSOLIDATED_HERO_CARD_V13';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

if (!src.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) {
  console.error(`[${PACK}] No se reconoce la Home actual.`);
  process.exit(2);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

/* -------------------------------------------------------------------------- */
/* 1. Un único inventario de fondos generales de Home                         */
/* -------------------------------------------------------------------------- */

const mediaInventoryPattern =
  /\/\* GC_HOME_STATIC_TRACK_IMAGES_V1 \*\/[\s\S]*?homeComboRandomImages\.sort\(\(a, b\) => a\.localeCompare\(b\)\);/;

const mediaInventory = `/* ${PACK}: HERO_MEDIA */
const homeHeroImagesDir = path.join(process.cwd(), 'public', 'images', 'imagenes');
const homeHeroImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const homeHeroRandomImages: string[] = [];

function collectHomeHeroRandomImages(directory: string) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectHomeHeroRandomImages(absolute);
      continue;
    }

    if (!homeHeroImageExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    const relative = path
      .relative(path.join(process.cwd(), 'public'), absolute)
      .split(path.sep)
      .map(encodeURIComponent)
      .join('/');

    homeHeroRandomImages.push(\`/\${relative}\`);
  }
}

collectHomeHeroRandomImages(homeHeroImagesDir);
homeHeroRandomImages.sort((a, b) => a.localeCompare(b));`;

if (!mediaInventoryPattern.test(src)) {
  console.error(`[${PACK}] No se encontró el inventario antiguo de imágenes.`);
  process.exit(3);
}

src = src.replace(mediaInventoryPattern, mediaInventory);

/* Eliminar atributos antiguos y dejar una sola fuente de fondos. */
src = src.replace(
  /\s*data-home2-static-track-images=\{JSON\.stringify\(homeHeroTrackImages\)\}\s*/,
  '\n    '
);

src = src.replace(
  /data-home2-combo-random-images=\{JSON\.stringify\(homeComboRandomImages\)\}/,
  'data-home2-random-hero-images={JSON.stringify(homeHeroRandomImages)}'
);

/* Hero principal: selector exclusivo, sin hooks del resolver de circuitos. */
const oldHeroImage = /<img\s+class="gc-home2-hero__bg"\s+data-home2-track-image\s+data-gc-home-static-managed="1"\s+src="\/ui\/home2\/gc-home2-track-fallback\.svg"\s+alt=""\s+width="1600"\s+height="900"\s+loading="eager"\s+decoding="async"\s*\/>/;

const newHeroImage = `<img
        class="gc-home2-hero__bg"
        data-home2-random-hero
        src={homeHeroRandomImages[0] || '/ui/home2/gc-home2-track-fallback.svg'}
        alt=""
        width="1600"
        height="900"
        loading="eager"
        decoding="async"
      />`;

if (!oldHeroImage.test(src)) {
  console.error(`[${PACK}] No se encontró la imagen principal antigua.`);
  process.exit(4);
}

src = src.replace(oldHeroImage, newHeroImage);

/* -------------------------------------------------------------------------- */
/* 2. Tarjeta consolidada: sin imagen interna y con layout estable             */
/* -------------------------------------------------------------------------- */

const cardPattern =
  /<!-- GC_HOME_COMBO_GLASS_ACSM_V1 -->[\s\S]*?<\/article>\s*(?=<\/div>\s*<\/section>\s*<!-- GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_V5_HTML -->)/;

const cleanCard = `<!-- ${PACK}: SERVER_CARD -->
        <article
          class="gc-home2-combo-card gc-home2-combo-card--consolidated"
          aria-labelledby="gc-home2-combo-title"
          data-home2-combo-source="main"
        >
          <div class="gc-home2-combo-card__content">
            <header class="gc-home2-combo-card__head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>
                Servidor 1 · Liga
              </p>
              <span class="gc-home2-combo-card__chevron" aria-hidden="true"></span>
            </header>

            <div class="gc-home2-combo-card__track-copy">
              <h2 id="gc-home2-combo-title" data-home2-track>Actualizando</h2>
              <p class="gc-home2-combo-card__cars" data-home2-cars>
                Esperando datos del combo
              </p>
            </div>

            <div class="gc-home2-combo-card__best">
              <div class="gc-home2-driver">
                <div class="gc-home2-driver__avatar">
                  <img
                    data-home2-best-avatar
                    src="/images/pilot-avatar-default.png"
                    alt=""
                    width="82"
                    height="82"
                    loading="lazy"
                    decoding="async"
                  />
                  <span class="gc-home2-driver__dot" aria-hidden="true"></span>
                </div>

                <div class="gc-home2-driver__meta">
                  <strong data-home2-best-driver>--</strong>
                  <small data-home2-best-car>--</small>
                </div>
              </div>

              <div class="gc-home2-combo-card__time" data-home2-best-time>--</div>
            </div>

            <a
              class="gc-home2-btn gc-home2-combo-card__cta"
              href="https://acstuff.ru/s/q:race/online/join?httpPort=8381&ip=145.239.131.153"
              target="_blank"
              rel="noreferrer"
            >
              Entrar al servidor
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
        `;

if (!cardPattern.test(src)) {
  console.error(`[${PACK}] No se encontró la tarjeta acumulada completa.`);
  process.exit(5);
}

src = src.replace(cardPattern, cleanCard);

/* -------------------------------------------------------------------------- */
/* 3. Control exclusivo del fondo aleatorio                                   */
/* -------------------------------------------------------------------------- */

const heroScript = `
    <script is:inline>
      (() => {
        const root = document.querySelector('[data-gc-home2]');
        const image = root?.querySelector('[data-home2-random-hero]');
        if (!(image instanceof HTMLImageElement) || !root) return;

        let images = [];
        try {
          const parsed = JSON.parse(
            root.getAttribute('data-home2-random-hero-images') || '[]'
          );
          images = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          images = [];
        }

        if (!images.length) return;

        const selected =
          images[Math.floor(Math.random() * images.length)] || images[0];

        image.onerror = () => {
          image.onerror = null;
          image.src = '/ui/home2/gc-home2-track-fallback.svg';
        };

        image.src = selected;
      })();
    </script>
`;

const heroInsertAnchor =
  '    <!-- GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_V5_HTML -->';

if (!src.includes(heroInsertAnchor)) {
  console.error(`[${PACK}] No se encontró el ancla posterior al hero.`);
  process.exit(6);
}

src = src.replace(heroInsertAnchor, heroScript + '\n' + heroInsertAnchor);

/* -------------------------------------------------------------------------- */
/* 4. Limpiar runtime acumulado que intentaba controlar imágenes antiguas      */
/* -------------------------------------------------------------------------- */

/* El selector antiguo ya no existe, pero eliminamos también el código muerto. */
src = src.replace(
  /\n\s*\/\/ GC_HOME_HERO_RANDOM_PILOT_FIX_V12[\s\S]*?window\.requestAnimationFrame\(\(\) => \{[\s\S]*?\n\s*\}\);\n/,
  '\n'
);

src = src.replace(
  /\n\s*const setHeroBackgroundFromMain = \([\s\S]*?\n\s*\};\n(?=\s*const renderRanking)/,
  '\n'
);

src = src.replace(
  /^\s*setHeroBackgroundFromMain\([^;]*\);\s*$/gm,
  ''
);

src = src.replace(
  /\n\s*const glassTrackImage = q\('\[data-home2-combo-track-image\]'\)[\s\S]*?\n\s*\}\n(?=\s*setText\('\[data-home2-hero-source\]')/,
  '\n'
);

/* Quitar estado exclusivamente ligado a los intentos antiguos de imagen. */
src = src.replace(
  /^\s*const failedGlassTrackAssets = new Map<string, number>\(\);\s*$/gm,
  ''
);
src = src.replace(/^\s*let lastGlassComboKey = '';\s*$/gm, '');
src = src.replace(
  /^\s*const GLASS_ASSET_FAIL_TTL_MS = \d+;\s*$/gm,
  ''
);
src = src.replace(/^\s*let lastComboRandomImage = '';\s*$/gm, '');
src = src.replace(/^\s*let fixedRandomHeroImage = '';\s*$/gm, '');

/* Funciones muertas de imagen interna. */
src = src.replace(
  /\n\s*const setGlassTrackImageStable = \([\s\S]*?\n\s*\};\n(?=\s*const setRandomComboImage|\s*const trackImageAliasVariants)/,
  '\n'
);
src = src.replace(
  /\n\s*const setRandomComboImage = \([\s\S]*?\n\s*\};\n(?=\s*\/\/ GC_HOME_COMBO_PILOT_VISIBLE_V10|\s*const visiblePilotAvatarByName|\s*const trackImageAliasVariants)/,
  '\n'
);

/* -------------------------------------------------------------------------- */
/* 5. Sustituir TODO el CSS Glass V1-V12 por una sola fuente de verdad         */
/* -------------------------------------------------------------------------- */

const cssMarker = '/* GC_HOME_COMBO_GLASS_ACSM_V1 */';
const markerIndex = src.indexOf(cssMarker);

if (markerIndex < 0) {
  console.error(`[${PACK}] No se encontró el bloque CSS Glass acumulado.`);
  process.exit(7);
}

const styleStart = src.lastIndexOf('<style is:global>', markerIndex);
const styleEnd = src.indexOf('</style>', markerIndex);

if (styleStart < 0 || styleEnd < 0) {
  console.error(`[${PACK}] No se pudo delimitar el bloque CSS Glass.`);
  process.exit(8);
}

const cleanCss = `<style is:global>
    /* ${PACK}: SINGLE_SOURCE_OF_TRUTH */

    @media (min-width: 980px) {
      .gc-home2-hero__shell {
        grid-template-columns: minmax(0, 1fr) minmax(540px, 620px) !important;
        gap: clamp(30px, 4vw, 70px) !important;
      }
    }

    .gc-home2-combo-card--consolidated {
      position: relative;
      isolation: isolate;
      width: min(100%, 620px);
      min-height: 338px;
      justify-self: end;
      overflow: hidden;
      border: 1px solid rgba(124, 255, 0, .62);
      border-radius: 18px;
      background: rgba(4, 7, 6, .15);
      box-shadow:
        0 18px 46px rgba(0, 0, 0, .32),
        0 0 0 1px rgba(255, 255, 255, .025) inset;
    }

    .gc-home2-combo-card__content {
      display: flex;
      flex-direction: column;
      min-height: 338px;
      padding: 11px;
      background: linear-gradient(
        180deg,
        rgba(3, 6, 5, .10),
        rgba(3, 6, 5, .18)
      );
    }

    .gc-home2-combo-card__head {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 45px;
      padding: 6px 10px;
      border: 1px solid rgba(124, 255, 0, .18);
      border-radius: 12px;
      background: rgba(5, 9, 7, .74);
      box-shadow: inset 0 1px rgba(255, 255, 255, .04);
    }

    .gc-home2-combo-card__server-icon {
      display: grid;
      place-content: center;
      gap: 3px;
      width: 31px;
      height: 31px;
      border-radius: 9px;
      color: #fff;
      background: linear-gradient(145deg, #78c925, #33590d);
      box-shadow: 0 7px 18px rgba(124, 255, 0, .18);
    }

    .gc-home2-combo-card__server-icon i {
      display: block;
      width: 15px;
      height: 3px;
      border-radius: 999px;
      background: currentColor;
    }

    .gc-home2-combo-card__label {
      margin: 0;
      overflow: hidden;
      color: #ff665f;
      font-size: .7rem;
      font-weight: 900;
      letter-spacing: .085em;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .gc-home2-combo-card__chevron {
      width: 9px;
      height: 9px;
      margin-right: 4px;
      border-right: 2px solid rgba(255, 255, 255, .92);
      border-bottom: 2px solid rgba(255, 255, 255, .92);
      transform: rotate(45deg) translateY(-2px);
    }

    .gc-home2-combo-card__track-copy {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 105px;
      padding: 20px 6px 9px;
      text-shadow: 0 3px 18px rgba(0, 0, 0, .7);
    }

    .gc-home2-combo-card__track-copy h2 {
      display: -webkit-box;
      overflow: hidden;
      max-width: 92%;
      margin: 0;
      color: #fff;
      font-size: clamp(1.8rem, 3vw, 2.55rem);
      font-weight: 950;
      letter-spacing: -.045em;
      line-height: .94;
      text-transform: uppercase;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .gc-home2-combo-card__track-copy h2[data-title-size="medium"] {
      font-size: clamp(1.62rem, 2.65vw, 2.25rem);
    }

    .gc-home2-combo-card__track-copy h2[data-title-size="long"] {
      font-size: clamp(1.35rem, 2.2vw, 1.85rem);
      line-height: .98;
    }

    .gc-home2-combo-card__cars {
      overflow: hidden;
      max-width: 92%;
      margin: 7px 0 0;
      color: rgba(236, 239, 236, .82);
      font-size: .84rem;
      font-weight: 700;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home2-combo-card__best {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(175px, 205px);
      align-items: center;
      gap: 18px;
      min-height: 106px;
      padding: 11px 15px;
      border: 1px solid rgba(124, 255, 0, .16);
      border-radius: 14px;
      background: rgba(5, 9, 7, .42);
      box-shadow: 0 10px 24px rgba(0, 0, 0, .18);
    }

    .gc-home2-driver {
      display: grid;
      grid-template-columns: 86px minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .gc-home2-driver__avatar {
      position: relative;
      width: 82px;
      height: 82px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      box-shadow: none;
    }

    .gc-home2-driver__avatar img {
      display: block;
      width: 82px;
      height: 82px;
      border: 2px solid #7cff00;
      border-radius: 50%;
      object-fit: cover;
      background: rgba(0, 0, 0, .26);
      box-shadow: 0 0 18px rgba(124, 255, 0, .18);
    }

    .gc-home2-driver__dot {
      position: absolute;
      right: 0;
      bottom: 7px;
      width: 11px;
      height: 11px;
      border: 2px solid #071006;
      border-radius: 50%;
      background: #7cff00;
      box-shadow: 0 0 10px rgba(124, 255, 0, .82);
    }

    .gc-home2-driver__meta {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      width: 100%;
      opacity: 1;
      visibility: visible;
    }

    .gc-home2-driver__meta strong[data-home2-best-driver] {
      display: block;
      overflow: hidden;
      width: 100%;
      margin: 0;
      color: #7cff00;
      font-size: 1.14rem;
      font-weight: 950;
      letter-spacing: .015em;
      line-height: 1.08;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
      opacity: 1;
      visibility: visible;
    }

    .gc-home2-driver__meta small[data-home2-best-car] {
      display: block;
      overflow: hidden;
      width: 100%;
      margin-top: 6px;
      color: rgba(235, 238, 235, .74);
      font-size: .78rem;
      font-weight: 700;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 1;
      visibility: visible;
    }

    .gc-home2-combo-card__time {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 175px;
      min-height: 70px;
      padding-left: 18px;
      border-left: 1px solid rgba(255, 255, 255, .14);
      color: #bb40ef;
      font-family: "JetBrains Mono", "Roboto Mono", monospace;
      font-size: clamp(1.75rem, 2.7vw, 2.38rem);
      font-weight: 900;
      letter-spacing: -.065em;
      line-height: 1;
      text-align: right;
      text-shadow: 0 0 18px rgba(187, 64, 239, .28);
      white-space: nowrap;
    }

    .gc-home2-combo-card__cta {
      justify-content: center;
      width: 100%;
      min-height: 48px;
      margin-top: 10px;
      border: 1px solid rgba(187, 64, 239, .9);
      border-radius: 11px;
      color: #fff;
      background: linear-gradient(180deg, #a72fe8 0%, #6f1aa5 100%);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, .14),
        0 12px 26px rgba(128, 32, 184, .30);
      font-size: .76rem;
      font-weight: 900;
      letter-spacing: .09em;
      text-transform: uppercase;
      transition: transform .2s ease, filter .2s ease;
    }

    .gc-home2-combo-card__cta:hover {
      transform: translateY(-1px);
      filter: brightness(1.1);
    }

    .gc-home2-hero__bg[data-home2-random-hero] {
      object-fit: cover;
      object-position: center;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--consolidated,
      .gc-home2-combo-card__content {
        min-height: 326px;
      }

      .gc-home2-combo-card__content {
        padding: 9px;
      }

      .gc-home2-combo-card__track-copy {
        min-height: 96px;
        padding-top: 16px;
      }

      .gc-home2-combo-card__track-copy h2 {
        font-size: clamp(1.62rem, 8vw, 2.25rem);
      }

      .gc-home2-combo-card__track-copy h2[data-title-size="medium"] {
        font-size: clamp(1.45rem, 7vw, 1.95rem);
      }

      .gc-home2-combo-card__track-copy h2[data-title-size="long"] {
        font-size: clamp(1.22rem, 5.9vw, 1.62rem);
      }

      .gc-home2-combo-card__best {
        grid-template-columns: minmax(0, 1fr) minmax(122px, 140px);
        gap: 10px;
        min-height: 96px;
        padding: 9px 10px;
      }

      .gc-home2-driver {
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 10px;
      }

      .gc-home2-driver__avatar,
      .gc-home2-driver__avatar img {
        width: 60px;
        height: 60px;
      }

      .gc-home2-driver__meta strong[data-home2-best-driver] {
        font-size: .94rem;
      }

      .gc-home2-driver__meta small[data-home2-best-car] {
        font-size: .67rem;
      }

      .gc-home2-combo-card__time {
        min-width: 122px;
        min-height: 58px;
        padding-left: 10px;
        font-size: clamp(1.32rem, 6.6vw, 1.78rem);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .gc-home2-combo-card__cta {
        transition: none;
      }
    }
  </style>`;

src =
  src.slice(0, styleStart) +
  cleanCss +
  src.slice(styleEnd + '</style>'.length);

/* Marcar la migración en el archivo final. */
src = src.replace(
  '<!-- GC_PROMOTE_HOME2_TO_MAIN_HOME_V1 -->',
  `<!-- ${PACK} -->\n<!-- GC_PROMOTE_HOME2_TO_MAIN_HOME_V1 -->`
);

fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Refactor consolidado aplicado.`);
console.log(`[${PACK}] Fondo Home: solo public/images/imagenes.`);
console.log(`[${PACK}] Tarjeta: una única estructura y un único CSS.`);
console.log(`[${PACK}] Nombre del piloto: selector visible y columna reservada.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
