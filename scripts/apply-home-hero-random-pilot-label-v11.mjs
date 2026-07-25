import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_HERO_RANDOM_PILOT_LABEL_V11';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_COMBO_RANDOM_MEDIA_PILOT_V9')) {
  console.error(`[${PACK}] No se detecta la V9.`);
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

/* 1. El nombre del piloto sustituye a "Mejor vuelta". */
const oldPilotMarkup = `                <div class="gc-home2-driver__meta">
                  <span class="gc-home2-card-label">Mejor vuelta</span>
                  <strong data-home2-best-driver>--</strong>
                  <small data-home2-best-car>--</small>
                </div>`;

const newPilotMarkup = `                <div class="gc-home2-driver__meta">
                  <span class="gc-home2-card-label gc-home2-card-label--pilot" data-home2-best-driver>--</span>
                  <small data-home2-best-car>--</small>
                </div>`;

if (!src.includes(oldPilotMarkup)) {
  console.error(`[${PACK}] No se encontró el bloque de piloto esperado.`);
  process.exit(3);
}
src = src.replace(oldPilotMarkup, newPilotMarkup);

/* 2. Las imágenes aleatorias pasan al hero principal, no a la tarjeta. */
const oldHeroBackground = `      const setHeroBackgroundFromMain = (payload: any) => {
        const img = q('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        if (!img) return;
        img.dataset.gcHomeStaticManaged = '1';
        const combo = activeCombo(payload?.main) || activeCombo(payload?.gt4) || null;
        if (!combo) {
          setImageWithFallbacks(img, [], FALLBACK_TRACK);
          return;
        }
        setImageWithFallbacks(img, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);
      };`;

const newHeroBackground = `      const setHeroBackgroundFromMain = (_payload: any) => {
        const img = q('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        if (!img) return;
        img.dataset.gcHomeStaticManaged = '1';

        if (!comboRandomImages.length) {
          setImageWithFallbacks(img, [], FALLBACK_TRACK);
          return;
        }

        const pool = comboRandomImages.filter((item) => item !== lastComboRandomImage);
        const source = pool.length ? pool : comboRandomImages;
        const selected = source[Math.floor(Math.random() * source.length)] || comboRandomImages[0] || FALLBACK_TRACK;
        lastComboRandomImage = selected;

        setImageWithFallbacks(img, [selected], FALLBACK_TRACK);
      };`;

if (!src.includes(oldHeroBackground)) {
  console.error(`[${PACK}] No se encontró setHeroBackgroundFromMain().`);
  process.exit(4);
}
src = src.replace(oldHeroBackground, newHeroBackground);

/* 3. La tarjeta deja de cargar imágenes aleatorias internas. */
const oldCardRandom = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        setRandomComboImage(glassTrackImage);`;

const newCardRandom = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        if (glassTrackImage) {
          glassTrackImage.onerror = null;
          glassTrackImage.removeAttribute('src');
        }`;

if (!src.includes(oldCardRandom)) {
  console.error(`[${PACK}] No se encontró la carga aleatoria interna de la tarjeta.`);
  process.exit(5);
}
src = src.replace(oldCardRandom, newCardRandom);

/* 4. CSS: tarjeta sin imagen, opacidad ligera y nombre de piloto visible. */
const css = `
    /* GC_HOME_HERO_RANDOM_PILOT_LABEL_V11 */
    .gc-home2-combo-card--glass {
      background: rgba(4, 7, 6, .15) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      background: rgba(4, 7, 6, .15) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__media,
    .gc-home2-combo-card--glass .gc-home2-combo-card__media-shade,
    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      display: none !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      min-width: 0 !important;
      overflow: visible !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-card-label--pilot {
      display: block !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 0 6px !important;
      color: #7cff00 !important;
      font-size: 1.05rem !important;
      font-weight: 900 !important;
      line-height: 1.08 !important;
      letter-spacing: .025em !important;
      text-overflow: ellipsis !important;
      text-transform: uppercase !important;
      white-space: nowrap !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small[data-home2-best-car] {
      display: block !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      color: rgba(232,235,232,.74) !important;
      font-size: .78rem !important;
      line-height: 1.15 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-hero__bg[data-home2-track-image] {
      transition: opacity .45s ease, transform 1s ease !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass .gc-home2-card-label--pilot {
        font-size: .92rem !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(6);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Imágenes aleatorias movidas al hero principal.`);
console.log(`[${PACK}] Tarjeta sin imagen interna.`);
console.log(`[${PACK}] "Mejor vuelta" sustituido por el nombre del piloto.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
