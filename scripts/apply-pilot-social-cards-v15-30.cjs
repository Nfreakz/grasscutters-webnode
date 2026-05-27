const fs = require('fs');
const path = require('path');

const root = process.cwd();

function target(...parts) {
  return path.join(root, ...parts);
}

function read(file) {
  if (!fs.existsSync(file)) {
    console.error('[GC PILOT SEO] No encuentro ' + file);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

function backup(file, original) {
  const backupPath = file + '.bak-v15-30-pilot-social';
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
  return backupPath;
}

function write(file, next, original) {
  if (next === original) {
    console.warn('[GC PILOT SEO] Sin cambios: ' + path.relative(root, file));
    return;
  }
  backup(file, original);
  fs.writeFileSync(file, next, 'utf8');
  console.log('[GC PILOT SEO] Actualizado: ' + path.relative(root, file));
}

function replaceOrFail(content, from, to, label) {
  if (!content.includes(from)) {
    console.error('[GC PILOT SEO] No encuentro bloque: ' + label);
    process.exit(1);
  }
  return content.replace(from, to);
}

/**
 * 1) AppLayout: añadir soporte OG/Twitter si aún no existe.
 */
const appLayoutPath = target('src', 'layouts', 'AppLayout.astro');
let appLayout = read(appLayoutPath);
const originalAppLayout = appLayout;

if (!appLayout.includes('og:site_name')) {
  appLayout = replaceOrFail(
    appLayout,
    `const {
  title = 'GrassCutters Platform',
  description = 'GrassCutters Racing Platform'
} = Astro.props;

const normalizePath = (path) => {`,
    `const {
  title = 'GrassCutters Platform',
  description = 'GrassCutters Racing Platform',
  canonicalPath,
  ogImage,
  ogImageAlt,
  ogType = 'website',
  noindex,
} = Astro.props;

const siteUrl = (import.meta.env.PUBLIC_SITE_URL || Astro.site?.toString() || Astro.url.origin || 'https://grasscuttersracing.com').replace(/\\/$/, '');
const normalizePath = (path) => {
  if (!path || path === '/') return '/';
  return path.replace(/\\/$/, '');
};
const currentPathForSeo = normalizePath(Astro.url.pathname);
const canonicalUrl = new URL(canonicalPath || Astro.url.pathname, siteUrl).toString();

const pageOgImages = {
  '/app': '/og/platform-og.png',
  '/hotlaps': '/og/hotlaps-og.png',
  '/combos': '/og/combos-og.png',
  '/pilotos': '/og/pilotos-og.png',
  '/perfil': '/og/perfil-og.png',
  '/login': '/og/login-og.png',
  '/herramientas/fov': '/og/fov-og.png',
  '/admin': '/og/admin-og.png',
};

function compactSeoText(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function absoluteSeoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return new URL('/og/platform-og.png', siteUrl).toString();
  if (/^https?:\\/\\//i.test(raw)) return raw;
  return new URL(raw.startsWith('/') ? raw : '/' + raw, siteUrl).toString();
}

function seoImageMime(value) {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

const cleanTitle = compactSeoText(title, 'GrassCutters Platform');
const cleanDescription = compactSeoText(description, 'Panel de pista, hotlaps, combos y perfiles de GrassCutters Racing.');
const matchedOgImage = pageOgImages[currentPathForSeo] || Object.entries(pageOgImages).find(([prefix]) => currentPathForSeo.startsWith(prefix + '/'))?.[1];
const selectedOgImage = ogImage || matchedOgImage || '/og/platform-og.png';
const absoluteOgImage = absoluteSeoUrl(selectedOgImage);
const cleanOgImageAlt = compactSeoText(ogImageAlt, 'Imagen social de ' + cleanTitle);
const ogImageType = seoImageMime(selectedOgImage);
const shouldNoindex = noindex ?? currentPathForSeo.startsWith('/admin') || currentPathForSeo.startsWith('/perfil');

const normalizePath = (path) => {`
  );

  appLayout = replaceOrFail(
    appLayout,
    `<meta name="description" content={description} />
    <meta name="theme-color" content="#07110a" />
    <title>{title}</title>`,
    `<meta name="description" content={cleanDescription} />
    <meta name="robots" content={shouldNoindex ? 'noindex,nofollow' : 'index,follow'} />
    <meta name="theme-color" content="#07110a" />
    <link rel="canonical" href={canonicalUrl} />

    <meta property="og:site_name" content="GrassCutters Racing" />
    <meta property="og:locale" content="es_ES" />
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={cleanTitle} />
    <meta property="og:description" content={cleanDescription} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:image" content={absoluteOgImage} />
    <meta property="og:image:secure_url" content={absoluteOgImage} />
    <meta property="og:image:type" content={ogImageType} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={cleanOgImageAlt} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={cleanTitle} />
    <meta name="twitter:description" content={cleanDescription} />
    <meta name="twitter:image" content={absoluteOgImage} />
    <meta name="twitter:image:alt" content={cleanOgImageAlt} />
    <meta name="twitter:url" content={canonicalUrl} />

    <title>{cleanTitle}</title>`
  );
} else {
  console.log('[GC PILOT SEO] AppLayout ya parece tener OG/Twitter.');
}

write(appLayoutPath, appLayout, originalAppLayout);

/**
 * 2) /pilotos/[id].astro: SEO server-side por piloto.
 */
const pilotPagePath = target('src', 'pages', 'pilotos', '[id].astro');
let pilotPage = read(pilotPagePath);
const originalPilotPage = pilotPage;

if (!pilotPage.includes('GC_PILOT_SOCIAL_V15_30')) {
  pilotPage = replaceOrFail(
    pilotPage,
    `const rawId = Astro.params.id ?? '';
const pageTitle = \`Ficha piloto #\${rawId} · GrassCutters\`;
---`,
    `const rawId = Astro.params.id ?? '';

/* GC_PILOT_SOCIAL_V15_30 START */
const isNumericPilotId = /^\\d+$/.test(String(rawId || ''));
const defaultPilotSeo = {
  title: \`Piloto #\${rawId} | GrassCutters Racing\`,
  description: \`Ficha pública del piloto #\${rawId} en GrassCutters Racing.\`,
  image: '/og/pilotos-og.png',
  imageAlt: \`Piloto #\${rawId} en GrassCutters Racing\`,
};

function cleanSeoText(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function valueAt(source, dottedPath) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, dottedPath)) return source[dottedPath];
  return String(dottedPath).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function firstPath(source, paths) {
  for (const item of paths) {
    const value = valueAt(source, item);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function pilotDisplayName(pilot, data) {
  const raw = firstPath(pilot, ['displayName', 'visibleName', 'cleanName', 'name', 'driverName', 'playerName']) || data?.pilotLink?.strackerName || \`Piloto #\${rawId}\`;
  return cleanSeoText(String(raw).replace(/_/g, ' '), \`Piloto #\${rawId}\`);
}

function numberText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('es-ES') : null;
}

function lapText(value) {
  return cleanSeoText(value, '') || null;
}

async function loadPilotSeo() {
  if (!isNumericPilotId) return defaultPilotSeo;

  try {
    const apiUrl = new URL(\`/api/pilots/\${encodeURIComponent(rawId)}/profile\`, Astro.url.origin);
    const response = await fetch(apiUrl, {
      headers: { accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) return defaultPilotSeo;

    const pilot = firstValue(data.pilot, data.driver) || {};
    const summary = data.summary || {};
    const best = firstValue(summary.bestLap, data.bestLap);
    const name = pilotDisplayName(pilot, data);

    const validLaps = numberText(firstValue(summary.validLaps, data.validLaps));
    const totalLaps = numberText(firstValue(summary.totalLaps, data.totalLaps));
    const cars = numberText(firstValue(summary.carsCount, data.carsCount));
    const tracks = numberText(firstValue(summary.tracksCount, data.tracksCount));
    const bestLap = lapText(firstValue(best?.lapTimeFormatted, best?.lapTime, best?.bestLapTimeFormatted, summary.bestLapTime));

    const parts = [
      totalLaps ? \`\${totalLaps} vueltas\` : '',
      validLaps ? \`\${validLaps} válidas\` : '',
      cars ? \`\${cars} coches\` : '',
      tracks ? \`\${tracks} circuitos\` : '',
      bestLap ? \`mejor vuelta \${bestLap}\` : '',
    ].filter(Boolean);

    return {
      title: \`\${name} | Piloto GrassCutters\`,
      description: parts.length
        ? \`\${name} en GrassCutters Racing: \${parts.join(', ')}.\`
        : \`Ficha pública de \${name} en GrassCutters Racing.\`,
      image: \`/api/pilot-avatar/\${encodeURIComponent(rawId)}\`,
      imageAlt: \`Avatar de \${name}\`,
    };
  } catch {
    return defaultPilotSeo;
  }
}

const pilotSeo = await loadPilotSeo();
const pageTitle = pilotSeo.title;
/* GC_PILOT_SOCIAL_V15_30 END */
---`
  );

  pilotPage = replaceOrFail(
    pilotPage,
    `<AppLayout title={pageTitle}>`,
    `<AppLayout
  title={pageTitle}
  description={pilotSeo.description}
  canonicalPath={\`/pilotos/\${rawId}\`}
  ogImage={pilotSeo.image}
  ogImageAlt={pilotSeo.imageAlt}
  ogType="profile"
>`
  );
} else {
  console.log('[GC PILOT SEO] /pilotos/[id].astro ya parece parcheado.');
}

write(pilotPagePath, pilotPage, originalPilotPage);

console.log('');
console.log('[GC PILOT SEO] Listo.');
console.log('[GC PILOT SEO] Prueba HTML: /pilotos/27 y busca og:title, og:description, og:image.');
