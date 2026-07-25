import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_PILOT_VISIBLE_V10';
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

/* Resolver el avatar desde las imágenes ya hidratadas de rankings/perfil. */
const helperAnchor = `      const heroBestAvatar = (best: any, rows: any[] = []): string => {`;
const helper = `
      // GC_HOME_COMBO_PILOT_VISIBLE_V10
      const visiblePilotAvatarByName = (nameValue: unknown): string => {
        const target = normalize(nameValue);
        if (!target) return '';
        const images = qa('[data-gc-avatar-driver]') as HTMLImageElement[];
        for (const image of images) {
          const imageName = normalize(image.getAttribute('data-gc-avatar-driver') || '');
          const imageSrc = image.currentSrc || image.src || '';
          if (imageName === target && imageSrc && !imageSrc.includes('pilot-avatar-default')) {
            return imageSrc;
          }
        }
        return '';
      };

      const syncHeroPilotAvatarByName = (nameValue: unknown): void => {
        const resolved = visiblePilotAvatarByName(nameValue);
        if (!resolved) return;
        qa('[data-home2-best-avatar]').forEach((image: HTMLImageElement) => {
          image.onerror = function(){ this.onerror = null; this.src = DEFAULT_AVATAR; };
          if (image.getAttribute('src') !== resolved) image.src = resolved;
        });
      };

`;
if (!src.includes(helperAnchor)) {
  console.error(`[${PACK}] No se encontró heroBestAvatar().`);
  process.exit(3);
}
src = src.replace(helperAnchor, helper + helperAnchor);

/* Reforzar el setHero y reintentar después de hidratar rankings. */
const oldAvatarBlock = `        const bestAvatarSrc = heroBestAvatar(best, rows);
        qa('[data-home2-best-avatar]').forEach((img) => {
          img.onerror = function(){ this.onerror=null; this.src=DEFAULT_AVATAR; };
          img.src = bestAvatarSrc;
        });`;

const newAvatarBlock = `        const bestDriverName = driverName(best);
        const bestAvatarSrc = visiblePilotAvatarByName(bestDriverName) || heroBestAvatar(best, rows);
        qa('[data-home2-best-avatar]').forEach((img) => {
          img.onerror = function(){ this.onerror=null; this.src=DEFAULT_AVATAR; };
          img.src = bestAvatarSrc;
        });
        window.setTimeout(() => syncHeroPilotAvatarByName(bestDriverName), 300);
        window.setTimeout(() => syncHeroPilotAvatarByName(bestDriverName), 1200);`;

if (!src.includes(oldAvatarBlock)) {
  console.error(`[${PACK}] No se encontró el bloque de avatar V9.`);
  process.exit(4);
}
src = src.replace(oldAvatarBlock, newAvatarBlock);

/* CSS definitivo para mostrar nombre + coche + avatar + crono sin chip EN VIVO. */
const css = `
    /* GC_HOME_COMBO_PILOT_VISIBLE_V10 */
    .gc-home2-combo-card__live-chip {
      display: none !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__track-copy {
      padding-top: 18px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      display: grid !important;
      grid-template-columns: 86px minmax(0, 1fr) minmax(185px, 215px) !important;
      align-items: center !important;
      gap: 16px !important;
      min-height: 108px !important;
      padding: 12px 16px !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver {
      display: contents !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar {
      grid-column: 1 !important;
      width: 84px !important;
      height: 84px !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: 50% !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
      width: 84px !important;
      height: 84px !important;
      border: 2px solid #7cff00 !important;
      border-radius: 50% !important;
      object-fit: cover !important;
      background: rgba(0,0,0,.22) !important;
      box-shadow: 0 0 18px rgba(124,255,0,.18) !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta {
      grid-column: 2 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      min-width: 0 !important;
      width: 100% !important;
      overflow: visible !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-card-label {
      display: block !important;
      margin: 0 0 5px !important;
      color: #7cff00 !important;
      font-size: .65rem !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      letter-spacing: .08em !important;
      white-space: nowrap !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta strong[data-home2-best-driver] {
      display: block !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: none !important;
      color: #fff !important;
      font-size: 1.18rem !important;
      font-weight: 900 !important;
      line-height: 1.08 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card--glass .gc-home2-driver__meta small[data-home2-best-car] {
      display: block !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: none !important;
      margin-top: 5px !important;
      color: rgba(232,235,232,.72) !important;
      font-size: .78rem !important;
      line-height: 1.15 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .gc-home2-combo-card__time-wrap {
      grid-column: 3 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      min-width: 185px !important;
      padding-left: 16px !important;
      border-left: 1px solid rgba(255,255,255,.14) !important;
    }

    .gc-home2-combo-card__time-wrap > span {
      display: none !important;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      font-size: clamp(1.75rem, 2.8vw, 2.4rem) !important;
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: 66px minmax(0, 1fr) minmax(124px, 145px) !important;
        gap: 10px !important;
        padding: 10px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__avatar,
      .gc-home2-combo-card--glass .gc-home2-driver__avatar img {
        width: 64px !important;
        height: 64px !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__meta strong[data-home2-best-driver] {
        font-size: .98rem !important;
      }

      .gc-home2-combo-card--glass .gc-home2-driver__meta small[data-home2-best-car] {
        font-size: .68rem !important;
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
  process.exit(5);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] EN VIVO eliminado.`);
console.log(`[${PACK}] Nombre y coche ocupan el espacio central completo.`);
console.log(`[${PACK}] Avatar reforzado usando imágenes ya hidratadas por nombre.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
