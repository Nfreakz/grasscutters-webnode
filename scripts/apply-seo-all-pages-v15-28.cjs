const fs = require('fs');
const path = require('path');

const root = process.cwd();

function file(...parts) {
  return path.join(root, ...parts);
}

function exists(target) {
  return fs.existsSync(target);
}

function read(target) {
  if (!exists(target)) {
    console.warn(`[GC SEO] No existe: ${path.relative(root, target)}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function backup(target, original) {
  const backupPath = `${target}.bak-v15-28`;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
}

function write(target, next, original) {
  if (!original || next === original) {
    console.warn(`[GC SEO] Sin cambios: ${path.relative(root, target)}`);
    return;
  }
  backup(target, original);
  fs.writeFileSync(target, next, 'utf8');
  console.log(`[GC SEO] Actualizado: ${path.relative(root, target)}`);
}

function replace(content, from, to, label) {
  if (!content.includes(from)) {
    console.warn(`[GC SEO] No encontrado: ${label}`);
    return content;
  }
  return content.replace(from, to);
}

/**
 * 1) AppLayout: añadir SEO social completo a todas las páginas de plataforma.
 */
const appLayoutPath = file('src', 'layouts', 'AppLayout.astro');
let appLayout = read(appLayoutPath);
const originalAppLayout = appLayout;

if (appLayout && !appLayout.includes('og:site_name')) {
  appLayout = replace(
    appLayout,
    `const {
  title = 'GrassCutters Platform',
  description = 'GrassCutters Racing Platform'
} = Astro.props;`,
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
const currentPath = Astro.url.pathname.replace(/\\/$/, '') || '/';
const canonicalUrl = new URL(canonicalPath || Astro.url.pathname, siteUrl).toString();

const pageOgImages = {
  '/app': '/og/platform-og.png',
  '/hotlaps': '/og/hotlaps-og.png',
  '/combos': '/og/combos-og.png',
  '/pilotos': '/og/pilotos-og.png',
  '/perfil': '/og/perfil-og.png',
  '/login': '/og/login-og.png',
  '/admin': '/og/admin-og.png',
  '/herramientas/fov': '/og/fov-og.png',
};

function compactText(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return new URL('/og/platform-og.png', siteUrl).toString();
  if (/^https?:\\/\\//i.test(raw)) return raw;
  return new URL(raw.startsWith('/') ? raw : \`/\${raw}\`, siteUrl).toString();
}

function imageMime(value) {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

const cleanTitle = compactText(title, 'GrassCutters Platform');
const cleanDescription = compactText(description, 'Panel de pista, hotlaps, combos y perfiles de GrassCutters Racing.');
const matchedImage = pageOgImages[currentPath] || Object.entries(pageOgImages).find(([prefix]) => currentPath.startsWith(prefix + '/'))?.[1];
const selectedOgImage = ogImage || matchedImage || '/og/platform-og.png';
const absoluteOgImage = absoluteUrl(selectedOgImage);
const cleanOgImageAlt = compactText(ogImageAlt, \`Imagen social de \${cleanTitle}\`);
const ogImageType = imageMime(selectedOgImage);
const shouldNoindex = noindex ?? currentPath.startsWith('/admin') || currentPath.startsWith('/perfil');`,
    'AppLayout props SEO'
  );

  appLayout = replace(
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

    <title>{cleanTitle}</title>`,
    'AppLayout head SEO'
  );
}

write(appLayoutPath, appLayout, originalAppLayout);

/**
 * 2) MarketingLayout: ampliar el mapa de OG y asegurar fallback si ya estaba parcheado.
 */
const marketingLayoutPath = file('src', 'layouts', 'MarketingLayout.astro');
let marketingLayout = read(marketingLayoutPath);
const originalMarketingLayout = marketingLayout;

if (marketingLayout) {
  if (!marketingLayout.includes("'/app': '/og/platform-og.png'")) {
    marketingLayout = replace(
      marketingLayout,
      `  '/calendario': '/og/calendario-og.png',
};`,
      `  '/calendario': '/og/calendario-og.png',
  '/app': '/og/platform-og.png',
  '/hotlaps': '/og/hotlaps-og.png',
  '/combos': '/og/combos-og.png',
  '/pilotos': '/og/pilotos-og.png',
  '/login': '/og/login-og.png',
};`,
      'MarketingLayout OG map extra'
    );
  }

  if (!marketingLayout.includes("ogImageAlt")) {
    console.warn('[GC SEO] MarketingLayout parece no tener el parche v15.26. Aplica también el pack v15.26 o revisa manualmente.');
  }
}

write(marketingLayoutPath, marketingLayout, originalMarketingLayout);

/**
 * 3) Páginas públicas marketing: añadir canonical/ogImage explícito si faltan.
 */
const pagePatches = [
  {
    path: ['src','pages','index.astro'],
    from: `<MarketingLayout title="GrassCutters Racing | Comunidad sim racing" description="GrassCutters Racing: comunidad de Assetto Corsa con Discord, WhatsApp, rankings, perfiles de piloto y herramientas para seguir la actividad del servidor.">`,
    to: `<MarketingLayout
  title="GrassCutters Racing | Comunidad sim racing"
  description="GrassCutters Racing: comunidad de Assetto Corsa con Discord, WhatsApp, rankings, perfiles de piloto y herramientas para seguir la actividad del servidor."
  canonicalPath="/"
  ogImage="/og/home-og.png"
  ogImageAlt="GrassCutters Racing"
/>`.replace('/>', '>')
  },
  {
    path: ['src','pages','calendario.astro'],
    from: `<MarketingLayout title="Calendario | GrassCutters Racing" description="Calendario mensual de GrassCutters Racing con combo semanal, carreras LFM y carreras GrassCutters.">`,
    to: `<MarketingLayout
  title="Calendario | GrassCutters Racing"
  description="Calendario mensual de GrassCutters Racing con combo semanal, carreras LFM y carreras GrassCutters."
  canonicalPath="/calendario"
  ogImage="/og/calendario-og.png"
  ogImageAlt="Calendario GrassCutters Racing"
/>`.replace('/>', '>')
  },
  {
    path: ['src','pages','app-android.astro'],
    from: `<MarketingLayout title="App Android | GrassCutters Racing" description="App Android de GrassCutters Racing para acceder a la comunidad desde el móvil.">`,
    to: `<MarketingLayout
  title="App Android | GrassCutters Racing"
  description="App Android de GrassCutters Racing para acceder a la comunidad desde el móvil."
  canonicalPath="/app-android"
  ogImage="/og/app-android-og.png"
  ogImageAlt="App Android GrassCutters Racing"
/>`.replace('/>', '>')
  },
];

for (const patch of pagePatches) {
  const target = file(...patch.path);
  let content = read(target);
  const original = content;
  if (!content) continue;

  if (content.includes(patch.from)) {
    content = content.replace(patch.from, patch.to);
  } else if (!content.includes('ogImage=') && content.includes('<MarketingLayout')) {
    console.warn(`[GC SEO] ${patch.path.join('/')} no coincide exactamente. Revisa si ya se tocó.`);
  }

  write(target, content, original);
}

/**
 * 4) Páginas AppLayout importantes: añadir description más clara donde estaba demasiado genérica.
 */
const appPagePatches = [
  {
    path: ['src','pages','app.astro'],
    from: `<AppLayout title="Panel | GrassCutters">`,
    to: `<AppLayout
  title="Panel | GrassCutters Racing"
  description="Panel de pista de GrassCutters Racing con combo activo, actividad reciente, hotlaps y accesos principales."
  canonicalPath="/app"
  ogImage="/og/platform-og.png"
  ogImageAlt="Plataforma GrassCutters Racing"
>`
  },
];

for (const patch of appPagePatches) {
  const target = file(...patch.path);
  let content = read(target);
  const original = content;
  if (!content) continue;
  if (content.includes(patch.from)) {
    content = content.replace(patch.from, patch.to);
  }
  write(target, content, original);
}

console.log('');
console.log('[GC SEO] Pack global aplicado.');
console.log('[GC SEO] Recuerda: PUBLIC_SITE_URL=https://grasscuttersracing.com');
console.log('[GC SEO] Si ya compartiste URLs antes, las redes pueden seguir mostrando caché hasta forzar recache.');
