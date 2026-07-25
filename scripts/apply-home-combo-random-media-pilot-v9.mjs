import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_RANDOM_MEDIA_PILOT_V9';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_COMBO_GLASS_WIDE_TRANSPARENT_V7')) {
  console.error(`[${PACK}] No se detecta la V7.`);
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

/* 1. Inventario estático de imágenes genéricas. */
const frontmatterAnchor = `collectHomeTrackImages(homeTracksDir);
homeHeroTrackImages.sort((a, b) => a.localeCompare(b));`;

const frontmatterReplacement = `${frontmatterAnchor}

/* GC_HOME_COMBO_RANDOM_MEDIA_PILOT_V9 */
const homeComboRandomDir = path.join(process.cwd(), 'public', 'images', 'imagenes');
const homeComboRandomImages: string[] = [];

function collectHomeComboRandomImages(directory: string) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectHomeComboRandomImages(absolute);
      continue;
    }
    if (!homeTrackExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const relative = path.relative(path.join(process.cwd(), 'public'), absolute)
      .split(path.sep)
      .map(encodeURIComponent)
      .join('/');
    homeComboRandomImages.push(\`/\${relative}\`);
  }
}

collectHomeComboRandomImages(homeComboRandomDir);
homeComboRandomImages.sort((a, b) => a.localeCompare(b));`;

if (!src.includes(frontmatterAnchor)) {
  console.error(`[${PACK}] No se encontró el inventario de imágenes del frontmatter.`);
  process.exit(3);
}
src = src.replace(frontmatterAnchor, frontmatterReplacement);

/* 2. Exponer lista al frontend. */
const mainAttrAnchor = `data-home2-static-track-images={JSON.stringify(homeHeroTrackImages)}`;
const mainAttrReplacement = `${mainAttrAnchor}
    data-home2-combo-random-images={JSON.stringify(homeComboRandomImages)}`;

if (!src.includes(mainAttrAnchor)) {
  console.error(`[${PACK}] No se encontró el atributo de imágenes de Home.`);
  process.exit(4);
}
src = src.replace(mainAttrAnchor, mainAttrReplacement);

/* 3. Quitar la palabra redundante TIEMPO del markup. */
src = src.replace(
  `<div class="gc-home2-combo-card__time-wrap">
                <span>Tiempo</span>
                <div class="gc-home2-combo-card__time" data-home2-best-time>--</div>
              </div>`,
  `<div class="gc-home2-combo-card__time-wrap">
                <div class="gc-home2-combo-card__time" data-home2-best-time>--</div>
              </div>`
);

/* 4. Estado y función para seleccionar imágenes aleatorias. */
const stateAnchor = `      const lastGood: { bootstrap: any; championships: Record<string, any>; live: Record<string, any> } = { bootstrap: null, championships: {}, live: {} };`;
const stateReplacement = `${stateAnchor}
      const comboRandomImages: string[] = (() => {
        try {
          const parsed = JSON.parse(root.getAttribute('data-home2-combo-random-images') || '[]');
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          return [];
        }
      })();
      let lastComboRandomImage = '';`;

if (!src.includes(stateAnchor)) {
  console.error(`[${PACK}] No se encontró el estado principal.`);
  process.exit(5);
}
src = src.replace(stateAnchor, stateReplacement);

const helperAnchor = `      const trackImageAliasVariants = (values: unknown[]): string[] => {`;
const helper = `
      const setRandomComboImage = (img: HTMLImageElement | null): void => {
        if (!img || !comboRandomImages.length) return;
        const pool = comboRandomImages.filter((item) => item !== lastComboRandomImage);
        const source = pool.length ? pool : comboRandomImages;
        const selected = source[Math.floor(Math.random() * source.length)] || '';
        if (!selected) return;
        lastComboRandomImage = selected;
        img.onerror = () => {
          img.onerror = null;
          img.src = FALLBACK_TRACK;
        };
        if (img.getAttribute('src') !== selected) img.src = selected;
      };

      const heroBestAvatar = (best: any, rows: any[] = []): string => {
        const target = normalize(driverName(best));
        const cached = avatarNameCache.get(target);
        if (cached && cached !== DEFAULT_AVATAR) return cached;

        const candidates = [
          best,
          ...rows,
          ...sourceLeaderboard(heroState.payload?.main),
          ...sourceLeaderboard(heroState.payload?.gt4),
          ...sourceLeaderboard(lastGood.bootstrap?.main),
          ...sourceLeaderboard(lastGood.bootstrap?.gt4)
        ].filter((row: any) => normalize(driverName(row)) === target);

        for (const row of candidates) {
          const direct = first(row, [
            'profileAvatarUrl', 'profile.avatarUrl', 'driver.avatarUrl', 'driver.avatar',
            'avatarUrl', 'avatar_url', 'imageUrl', 'image', 'player.avatarUrl', 'pilot.avatarUrl'
          ], '');
          if (direct && String(direct) !== DEFAULT_AVATAR) return rememberAvatar(row, String(direct));
        }

        for (const row of candidates) {
          const value = avatar(row);
          if (value && value !== DEFAULT_AVATAR) return rememberAvatar(row, value);
        }

        return DEFAULT_AVATAR;
      };

`;
if (!src.includes(helperAnchor)) {
  console.error(`[${PACK}] No se encontró el ancla de helpers.`);
  process.exit(6);
}
src = src.replace(helperAnchor, helper + helperAnchor);

/* 5. Sustituir imagen por circuito por imagen aleatoria local. */
const oldImageCall = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        setGlassTrackImageStable(glassTrackImage, combo, glassCard as HTMLElement | null);`;

const fallbackOldImageCall = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        if (glassTrackImage) {
          glassCard?.classList.add('is-track-loading');
          glassTrackImage.onload = () => glassCard?.classList.remove('is-track-loading');
          setImageWithFallbacks(glassTrackImage, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);
          window.setTimeout(() => glassCard?.classList.remove('is-track-loading'), 1800);
        }`;

const newImageCall = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        setRandomComboImage(glassTrackImage);`;

if (src.includes(oldImageCall)) {
  src = src.replace(oldImageCall, newImageCall);
} else if (src.includes(fallbackOldImageCall)) {
  src = src.replace(fallbackOldImageCall, newImageCall);
} else {
  console.error(`[${PACK}] No se encontró el bloque actual de imagen de la tarjeta.`);
  process.exit(7);
}

/* 6. Usar avatar resuelto por nombre. */
const oldAvatarBlock = `        qa('[data-home2-best-avatar]').forEach((img) => {
          img.onerror = function(){ this.onerror=null; this.src=DEFAULT_AVATAR; };
          img.src = avatar(best);
        });`;
const newAvatarBlock = `        const bestAvatarSrc = heroBestAvatar(best, rows);
        qa('[data-home2-best-avatar]').forEach((img) => {
          img.onerror = function(){ this.onerror=null; this.src=DEFAULT_AVATAR; };
          img.src = bestAvatarSrc;
        });`;

if (!src.includes(oldAvatarBlock)) {
  console.error(`[${PACK}] No se encontró el bloque de avatar del hero.`);
  process.exit(8);
}
src = src.replace(oldAvatarBlock, newAvatarBlock);

/* 7. CSS final. */
const css = `
    /* GC_HOME_COMBO_RANDOM_MEDIA_PILOT_V9 */
    .gc-home2-combo-card--glass {
      background: rgba(4, 7, 6, .15) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-content {
      background: rgba(4, 7, 6, .15) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__media,
    .gc-home2-combo-card--glass .gc-home2-combo-card__media-shade,
    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      display: block !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      opacity: .42 !important;
      object-fit: cover !important;
      object-position: center !important;
      filter: saturate(.82) contrast(1.05) brightness(.55) !important;
      transform: scale(1.02) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__media-shade {
      background:
        linear-gradient(180deg, rgba(4,7,6,.20) 0%, rgba(4,7,6,.28) 48%, rgba(4,7,6,.62) 100%) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      grid-template-columns: minmax(0, 1fr) minmax(175px, 205px) !important;
      background: rgba(4, 7, 6, .38) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver {
      display: grid !important;
      grid-template-columns: 84px minmax(0, 1fr) !important;
      gap: 16px !important;
      min-width: 0 !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar {
      width: 80px !important;
      height: 80px !important;
      border: 0 !important;
      border-radius: 50% !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 80px !important;
      height: 80px !important;
      border: 2px solid #7cff00 !important;
      border-radius: 50% !important;
      object-fit: cover !important;
      background: rgba(0,0,0,.28) !important;
      box-shadow: 0 0 18px rgba(124,255,0,.18) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta {
      min-width: 0 !important;
      overflow: hidden !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong {
      display: block !important;
      overflow: hidden !important;
      max-width: 100% !important;
      font-size: 1.12rem !important;
      line-height: 1.1 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small {
      display: block !important;
      overflow: hidden !important;
      max-width: 100% !important;
      margin-top: 5px !important;
      font-size: .76rem !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .gc-home2-combo-card__time-wrap {
      justify-content: center !important;
      min-width: 175px !important;
    }

    .gc-home2-combo-card__time-wrap > span {
      display: none !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      font-size: clamp(1.7rem, 2.7vw, 2.35rem) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0, 1fr) minmax(128px, 145px) !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver {
        grid-template-columns: 64px minmax(0, 1fr) !important;
        gap: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__avatar,
      .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
        width: 62px !important;
        height: 62px !important;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 128px !important;
      }
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(9);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Imágenes aleatorias: public/images/imagenes`);
console.log(`[${PACK}] Fondo interno: 15%`);
console.log(`[${PACK}] Avatar circular sin rectángulo y resolución reforzada por nombre.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
