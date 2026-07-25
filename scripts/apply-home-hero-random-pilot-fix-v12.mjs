import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_HERO_RANDOM_PILOT_FIX_V12';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_HERO_RANDOM_PILOT_LABEL_V11')) {
  console.error(`[${PACK}] No se detecta la V11.`);
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

/* 1. Nombre de piloto como elemento fuerte independiente y visible. */
const oldPilot = `<span class="gc-home2-card-label gc-home2-card-label--pilot" data-home2-best-driver>--</span>
                  <small data-home2-best-car>--</small>`;

const newPilot = `<strong class="gc-home2-driver-name" data-home2-best-driver>--</strong>
                  <small data-home2-best-car>--</small>`;

if (!src.includes(oldPilot)) {
  console.error(`[${PACK}] No se encontró el markup de piloto V11.`);
  process.exit(3);
}
src = src.replace(oldPilot, newPilot);

/* 2. Fijar una imagen aleatoria real de public/images/imagenes en el hero. */
const stateAnchor = `      let lastComboRandomImage = '';`;
const stateReplacement = `${stateAnchor}
      let fixedRandomHeroImage = '';`;

if (!src.includes(stateAnchor)) {
  console.error(`[${PACK}] No se encontró el estado de imágenes aleatorias.`);
  process.exit(4);
}
src = src.replace(stateAnchor, stateReplacement);

const oldHeroBackground = `      const setHeroBackgroundFromMain = (_payload: any) => {
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

const newHeroBackground = `      const setHeroBackgroundFromMain = (_payload: any) => {
        const img = q('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        if (!img) return;
        img.dataset.gcHomeStaticManaged = '1';
        img.dataset.gcHomeRandomHero = 'v12';

        if (!comboRandomImages.length) {
          setImageWithFallbacks(img, [], FALLBACK_TRACK);
          return;
        }

        if (!fixedRandomHeroImage) {
          fixedRandomHeroImage = comboRandomImages[Math.floor(Math.random() * comboRandomImages.length)]
            || comboRandomImages[0]
            || FALLBACK_TRACK;
        }

        setImageWithFallbacks(img, [fixedRandomHeroImage], FALLBACK_TRACK);
      };`;

if (!src.includes(oldHeroBackground)) {
  console.error(`[${PACK}] No se encontró setHeroBackgroundFromMain V11.`);
  process.exit(5);
}
src = src.replace(oldHeroBackground, newHeroBackground);

/* 3. Aplicar la imagen aleatoria también al arrancar, antes del primer fetch. */
const rootAnchor = `      if (!root) return;`;
const rootReplacement = `${rootAnchor}

      // GC_HOME_HERO_RANDOM_PILOT_FIX_V12
      window.requestAnimationFrame(() => {
        const img = root.querySelector('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        try {
          const parsed = JSON.parse(root.getAttribute('data-home2-combo-random-images') || '[]');
          const images = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
          if (img && images.length) {
            const selected = images[Math.floor(Math.random() * images.length)] || images[0];
            if (selected) img.src = selected;
          }
        } catch {}
      });`;

if (!src.includes(rootAnchor)) {
  console.error(`[${PACK}] No se encontró el arranque del loader.`);
  process.exit(6);
}
src = src.replace(rootAnchor, rootReplacement);

/* 4. CSS final: nombre visible, espacio completo y CTA violeta. */
const css = `
    /* GC_HOME_HERO_RANDOM_PILOT_FIX_V12 */
    .gc-home2-combo-card--glass .gc-home2-driver__meta {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      min-width: 0 !important;
      width: 100% !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver-name[data-home2-best-driver] {
      display: block !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 0 5px !important;
      color: #7cff00 !important;
      font-size: 1.15rem !important;
      font-weight: 900 !important;
      line-height: 1.08 !important;
      letter-spacing: .02em !important;
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
      color: rgba(236,238,236,.76) !important;
      font-size: .78rem !important;
      line-height: 1.15 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      border-color: rgba(186,77,240,.9) !important;
      color: #fff !important;
      background: linear-gradient(180deg, #a72fe8 0%, #6f1aa5 100%) !important;
      box-shadow:
        inset 0 1px rgba(255,255,255,.14),
        0 12px 26px rgba(128,32,184,.30) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta:hover {
      background: linear-gradient(180deg, #bd3cf3 0%, #7d20b8 100%) !important;
    }

    .gc-home2-hero__bg[data-gc-home-random-hero="v12"],
    .gc-home2-hero__bg[data-home2-track-image] {
      object-fit: cover !important;
      object-position: center !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass .gc-home2-driver-name[data-home2-best-driver] {
        font-size: .98rem !important;
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

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Nombre del piloto forzado como <strong>.`);
console.log(`[${PACK}] CTA violeta.`);
console.log(`[${PACK}] Hero fijado a una imagen aleatoria de public/images/imagenes.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
