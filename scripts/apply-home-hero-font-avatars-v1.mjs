import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-hero-font-avatars-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME V1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');
const original = source;

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const frontmatterAnchor = "import '../styles/public/gc-rating-badges.css';";
if (!source.includes(frontmatterAnchor)) fail('No se encontró el ancla de imports de index.astro.');

if (!source.includes("GC_HOME_STATIC_TRACK_IMAGES_V1")) {
  source = source.replace(
    frontmatterAnchor,
    `${frontmatterAnchor}
import fs from 'node:fs';
import path from 'node:path';

/* GC_HOME_STATIC_TRACK_IMAGES_V1 */
const homeTracksDir = path.join(process.cwd(), 'public', 'images', 'tracks');
const homeTrackExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const homeHeroTrackImages: string[] = [];

function collectHomeTrackImages(directory: string) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectHomeTrackImages(absolute);
      continue;
    }
    if (!homeTrackExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const relative = path.relative(path.join(process.cwd(), 'public'), absolute).split(path.sep).map(encodeURIComponent).join('/');
    homeHeroTrackImages.push(\`/\${relative}\`);
  }
}

collectHomeTrackImages(homeTracksDir);
homeHeroTrackImages.sort((a, b) => a.localeCompare(b));`
  );
}

const mainAnchor = '<main class="gc-home2 gc-home2--main-home" data-gc-home2="hybrid-v4">';
if (!source.includes(mainAnchor)) fail('No se encontró el elemento main de la home.');

source = source.replace(
  mainAnchor,
  `<main
    class="gc-home2 gc-home2--main-home"
    data-gc-home2="hybrid-v4"
    data-home2-static-track-images={JSON.stringify(homeHeroTrackImages)}
  >`
);

const styleEndAnchor = '  </style>\n\n  <script is:inline src="/js/gc-track-images.js"></script>';
if (!source.includes(styleEndAnchor)) fail('No se encontró el final del bloque CSS principal.');

const cssPatch = `
    /* GC_HOME_RATINGS_INTER_FONT_V1
       Fuerza la misma tipografía legible usada en el resto de la home.
       Inter evita que el cero se confunda con un ocho. */
    .gc-home2 .gc-home2-panel--ratings,
    .gc-home2 .gc-home2-panel--ratings *,
    .gc-home2 .gc-home2-rating-table,
    .gc-home2 .gc-home2-rating-table th,
    .gc-home2 .gc-home2-rating-table td,
    .gc-home2 .gc-home2-rating-driver,
    .gc-home2 .gc-home2-rating-driver a,
    .gc-home2 .gc-home2-rating-driver strong,
    .gc-home2 .gc-home2-rating-driver small,
    .gc-home2 .gc-home2-rating-delta,
    .gc-home2 .gc-rating-badge,
    .gc-home2 .gc-rating-badge strong,
    .gc-home2 .gc-rating-badge small{
      font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
      font-variant-numeric:tabular-nums lining-nums;
      font-feature-settings:"tnum" 1,"lnum" 1,"zero" 0;
    }

    .gc-home2 .gc-home2-rating-table .gc-home2-ranking-medal{
      font-family:Inter,system-ui,sans-serif !important;
    }

    /* GC_HOME_STATIC_HERO_TRACK_V1 */
    .gc-home2 .gc-home2-hero__bg{
      transition:none !important;
      animation:none !important;
    }
`;

source = source.replace(
  styleEndAnchor,
  `${cssPatch}\n  </style>\n\n  <script is:inline>\n    /* GC_HOME_STATIC_HERO_TRACK_V1 */\n    (() => {\n      const root = document.querySelector('[data-gc-home2]');\n      const image = document.querySelector('[data-home2-track-image]');\n      if (!root || !image) return;\n\n      let images = [];\n      try {\n        images = JSON.parse(root.getAttribute('data-home2-static-track-images') || '[]');\n      } catch {\n        images = [];\n      }\n\n      if (!Array.isArray(images) || images.length === 0) return;\n      const selected = images[Math.floor(Math.random() * images.length)];\n      window.__GC_HOME_STATIC_HERO_IMAGE__ = selected;\n\n      const applySelected = () => {\n        if (image.getAttribute('src') !== selected) image.setAttribute('src', selected);\n      };\n\n      applySelected();\n      new MutationObserver(applySelected).observe(image, { attributes: true, attributeFilter: ['src'] });\n    })();\n  </script>\n\n  <script is:inline src="/js/gc-track-images.js"></script>`
);

const oldAvatarFunction = `      const ratingPilotAvatarUrl = (row: any): string => {
        const direct = readRatingValue(row, ['avatarUrl', 'avatar_url', 'imageUrl', 'image', 'driver.avatarUrl', 'player.avatarUrl', 'pilot.avatarUrl']);
        if (direct) return String(direct);
        const id = readRatingValue(row, ['profilePlayerId', 'strackerPlayerId', 'pilotId', 'playerId', 'driverId', 'id', 'player.id', 'driver.id']);
        if (id !== undefined && id !== null && id !== '') return \`/api/pilot-avatar/\${encodeURIComponent(String(id))}\`;
        return '/images/pilot-avatar-default.png';
      };`;

const newAvatarFunction = `      /* GC_HOME_RATINGS_CUSTOM_AVATARS_V1 */
      const ratingPilotId = (row: any): string => {
        const direct = readRatingValue(row, [
          'profilePlayerId', 'profile.playerId', 'strackerPlayerId', 'pilotId',
          'playerId', 'driverId', 'rawPlayerId', 'steamGuid', 'steamGUID',
          'steamId', 'steamID', 'steamId64', 'guid', 'GUID',
          'player.id', 'player.guid', 'driver.id', 'driver.guid', 'pilot.id'
        ]);
        if (direct !== undefined && direct !== null && direct !== '') return String(direct);

        const driverKey = String(readRatingValue(row, ['driverKey', 'driver_key', 'identityKey']) || '');
        const keyed = driverKey.match(/^(?:player|pilot|driver|steam|guid):(.+)$/i);
        return keyed?.[1] ? keyed[1] : '';
      };

      const ratingPilotAvatarUrl = (row: any): string => {
        const direct = readRatingValue(row, [
          'customAvatarUrl', 'custom_avatar_url', 'profileAvatarUrl', 'profile_avatar_url',
          'avatarUrl', 'avatar_url', 'avatarPath', 'avatar_path', 'pilotAvatarUrl',
          'pilot_avatar_url', 'imageUrl', 'image',
          'profile.avatarUrl', 'profile.avatar_url', 'profile.avatar',
          'driver.avatarUrl', 'driver.avatar_url', 'driver.imageUrl', 'driver.avatar',
          'player.avatarUrl', 'player.avatar_url', 'player.imageUrl', 'player.avatar',
          'pilot.avatarUrl', 'pilot.avatar_url', 'pilot.imageUrl', 'pilot.avatar'
        ]);
        if (direct && String(direct) !== '/images/pilot-avatar-default.png') return String(direct);

        const id = ratingPilotId(row);
        if (id) return \`/api/pilot-avatar/\${encodeURIComponent(id)}\`;
        return '/images/pilot-avatar-default.png';
      };`;

if (!source.includes(oldAvatarFunction)) fail('No se encontró la función ratingPilotAvatarUrl esperada.');
source = source.replace(oldAvatarFunction, newAvatarFunction);

const oldDriverId = `        const directPlayerId = row?.profilePlayerId || row?.strackerPlayerId || '';
        const driverKey = String(row?.driverKey || '');
        const playerId = directPlayerId || (driverKey.startsWith('player:') ? driverKey.replace('player:', '') : '');`;

const newDriverId = `        const playerId = ratingPilotId(row);`;

if (!source.includes(oldDriverId)) fail('No se encontró la resolución antigua de playerId.');
source = source.replace(oldDriverId, newDriverId);

if (source === original) fail('No se aplicó ningún cambio.');

fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME V1] Cambios aplicados:');
console.log('  - Fondo hero estático por carga usando public/images/tracks.');
console.log('  - Nueva imagen aleatoria únicamente al recargar la página.');
console.log('  - Tipografía Inter en SR/GSR y valores numéricos.');
console.log('  - Resolución ampliada de avatares personalizados.');
console.log(`[GC HOME V1] Backup: ${backupFile}`);
