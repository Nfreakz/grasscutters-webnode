const fs = require('fs');
const path = require('path');

const root = process.cwd();

function file(...parts) {
  return path.join(root, ...parts);
}

function read(target) {
  if (!fs.existsSync(target)) {
    console.error(`[GC SEO] No encuentro: ${target}`);
    process.exit(1);
  }
  return fs.readFileSync(target, 'utf8');
}

function backup(target, content, suffix = 'v15-26') {
  const backupPath = `${target}.bak-${suffix}`;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, content, 'utf8');
}

function writeIfChanged(target, next, original) {
  if (next === original) {
    console.warn(`[GC SEO] Sin cambios en ${path.relative(root, target)}`);
    return false;
  }
  backup(target, original);
  fs.writeFileSync(target, next, 'utf8');
  console.log(`[GC SEO] Actualizado: ${path.relative(root, target)}`);
  return true;
}

function replaceOrWarn(content, from, to, label) {
  if (!content.includes(from)) {
    console.warn(`[GC SEO] No encontrado: ${label}`);
    return content;
  }
  return content.replace(from, to);
}

/**
 * 1) MarketingLayout: mejorar OG/Twitter de forma global.
 */
const layoutPath = file('src', 'layouts', 'MarketingLayout.astro');
let layout = read(layoutPath);
const originalLayout = layout;

layout = replaceOrWarn(
  layout,
  `  canonicalPath,
  ogImage,
  noindex = false,`,
  `  canonicalPath,
  ogImage,
  ogImageAlt,
  ogType = 'website',
  noindex = false,`,
  'props ogImageAlt/ogType'
);

layout = replaceOrWarn(
  layout,
  `const selectedOgImage = ogImage || pageOgImages[path] || '/og/home-og.png';
const absoluteOgImage = String(selectedOgImage).startsWith('http') ? selectedOgImage : new URL(selectedOgImage, siteUrl).toString();`,
  `function compactText(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function imageMime(value) {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return new URL('/og/grasscutters-social-card.png', siteUrl).toString();
  if (/^https?:\\/\\//i.test(raw)) return raw;
  return new URL(raw.startsWith('/') ? raw : \`/\${raw}\`, siteUrl).toString();
}

const cleanTitle = compactText(title, 'GrassCutters Racing');
const cleanDescription = compactText(description, 'Comunidad de sim racing, motorsport y archivo técnico de GrassCutters Racing.');
const selectedOgImage = ogImage || pageOgImages[path] || '/og/grasscutters-social-card.png';
const absoluteOgImage = absoluteUrl(selectedOgImage);
const cleanOgImageAlt = compactText(ogImageAlt, \`Imagen social de \${cleanTitle}\`);
const ogImageType = imageMime(selectedOgImage);`,
  'helpers SEO layout'
);

layout = replaceOrWarn(
  layout,
  `    <meta name="description" content={description} />`,
  `    <meta name="description" content={cleanDescription} />`,
  'meta description limpia'
);

layout = replaceOrWarn(
  layout,
  `    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />`,
  `    <meta property="og:locale" content="es_ES" />
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={cleanTitle} />
    <meta property="og:description" content={cleanDescription} />`,
  'og title/description/type'
);

layout = replaceOrWarn(
  layout,
  `    <meta property="og:image:type" content="image/png" />`,
  `    <meta property="og:image:type" content={ogImageType} />`,
  'og image type dinámico'
);

layout = replaceOrWarn(
  layout,
  `    <meta property="og:image:alt" content={\`Imagen social de \${title}\`} />`,
  `    <meta property="og:image:alt" content={cleanOgImageAlt} />`,
  'og image alt'
);

layout = replaceOrWarn(
  layout,
  `    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={absoluteOgImage} />`,
  `    <meta name="twitter:title" content={cleanTitle} />
    <meta name="twitter:description" content={cleanDescription} />
    <meta name="twitter:image" content={absoluteOgImage} />
    <meta name="twitter:image:alt" content={cleanOgImageAlt} />
    <meta name="twitter:url" content={canonicalUrl} />`,
  'twitter metadata'
);

layout = replaceOrWarn(
  layout,
  `    <title>{title}</title>`,
  `    <title>{cleanTitle}</title>`,
  'title limpio'
);

writeIfChanged(layoutPath, layout, originalLayout);

/**
 * 2) Fichas del archivo: pasar canonical, imagen y tipo article.
 */
const itemPagePath = file('src', 'pages', 'archivo', '[tipo]', '[slug].astro');
let itemPage = read(itemPagePath);
const originalItemPage = itemPage;

itemPage = replaceOrWarn(
  itemPage,
  `  getArchiveItem,
  getRelatedArchiveItems,
  normalizeArchiveType,
  prettifyArchiveType,`,
  `  getArchiveImage,
  getArchiveItem,
  getArchiveSummary,
  getRelatedArchiveItems,
  normalizeArchiveType,
  prettifyArchiveType,`,
  'imports ficha archivo'
);

itemPage = replaceOrWarn(
  itemPage,
  `const entry = await getArchiveItem(type, slug);
const related = entry ? await getRelatedArchiveItems(entry) : [];
const label = prettifyArchiveType(type);
const description = entry?.descripcion_corta || entry?.subtitulo || entry?.introduccion || \`Ficha de \${label.toLowerCase()} en el Archivo.\`;

if (!entry) {`,
  `const entry = await getArchiveItem(type, slug);
const related = entry ? await getRelatedArchiveItems(entry) : [];
const label = prettifyArchiveType(type);

function compactDescription(value, fallback) {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\|\\|/g, '. ')
    .replace(/::/g, ': ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 190);
}

function socialImageFor(item) {
  const image = getArchiveImage(item);
  const clean = String(image || '').split('?')[0].toLowerCase();
  if (!image || clean.endsWith('.svg')) return '/og/archivo-og.png';
  return image;
}

const description = entry
  ? compactDescription(
      getArchiveSummary(entry) || entry.importancia || entry.contexto_historico || entry.body,
      \`Ficha de \${label.toLowerCase()} en el Archivo GrassCutters.\`
    )
  : \`Ficha no encontrada en el Archivo GrassCutters.\`;

const seoTitle = entry ? \`\${entry.nombre} | Archivo GrassCutters\` : 'Ficha no encontrada | Archivo GrassCutters';
const seoImage = entry ? socialImageFor(entry) : '/og/archivo-og.png';
const seoImageAlt = entry ? \`Imagen de \${entry.nombre}\` : 'Archivo GrassCutters';

if (!entry) {`,
  'SEO variables ficha archivo'
);

itemPage = replaceOrWarn(
  itemPage,
  `<MarketingLayout bodyClass="gc-archive-public" title={entry ? \`\${entry.nombre} | Archivo\` : \`Ficha no encontrada | Archivo\`} description={description}>`,
  `<MarketingLayout
  bodyClass="gc-archive-public"
  title={seoTitle}
  description={description}
  canonicalPath={entry ? \`/archivo/\${type}/\${slug}/\` : Astro.url.pathname}
  ogImage={seoImage}
  ogImageAlt={seoImageAlt}
  ogType={entry ? 'article' : 'website'}
>`,
  'MarketingLayout ficha archivo'
);

writeIfChanged(itemPagePath, itemPage, originalItemPage);

/**
 * 3) Categorías del archivo: pasar imagen social propia.
 */
const categoryPagePath = file('src', 'pages', 'archivo', '[tipo]', 'index.astro');
let categoryPage = read(categoryPagePath);
const originalCategoryPage = categoryPage;

categoryPage = replaceOrWarn(
  categoryPage,
  `const title = \`\${label} | Archivo GrassCutters\`;
const description = archiveTypeLead(typeParam);
---`,
  `const title = \`\${label} | Archivo GrassCutters\`;
const description = archiveTypeLead(typeParam);
const categoryImage = featured && getArchiveImage(featured) && !String(getArchiveImage(featured)).split('?')[0].toLowerCase().endsWith('.svg')
  ? getArchiveImage(featured)
  : '/og/archivo-og.png';
---`,
  'SEO image categoría'
);

categoryPage = replaceOrWarn(
  categoryPage,
  `<MarketingLayout bodyClass="gc-archive-public" title={title} description={description} canonicalPath={\`/archivo/\${typeParam}/\`}>`,
  `<MarketingLayout
  bodyClass="gc-archive-public"
  title={title}
  description={description}
  canonicalPath={\`/archivo/\${typeParam}/\`}
  ogImage={categoryImage}
  ogImageAlt={\`\${label} del Archivo GrassCutters\`}
>`,
  'MarketingLayout categoría'
);

writeIfChanged(categoryPagePath, categoryPage, originalCategoryPage);

/**
 * 4) Home del archivo: pasar explícitamente imagen social.
 */
const archiveHomePath = file('src', 'pages', 'archivo', 'index.astro');
let archiveHome = read(archiveHomePath);
const originalArchiveHome = archiveHome;

archiveHome = replaceOrWarn(
  archiveHome,
  `<MarketingLayout bodyClass="gc-archive-public" title={pageTitle} description={pageDescription} canonicalPath="/archivo/">`,
  `<MarketingLayout
  bodyClass="gc-archive-public"
  title={pageTitle}
  description={pageDescription}
  canonicalPath="/archivo/"
  ogImage="/og/archivo-og.png"
  ogImageAlt="Archivo GrassCutters Racing"
/>`.replace('/>', '>'),
  'MarketingLayout home archivo'
);

writeIfChanged(archiveHomePath, archiveHome, originalArchiveHome);

console.log('');
console.log('[GC SEO] Listo.');
console.log('[GC SEO] Recuerda revisar PUBLIC_SITE_URL=https://grasscuttersracing.com en producción si Hostinger no lo tiene.');
console.log('[GC SEO] Después de desplegar, fuerza recache en Facebook/LinkedIn/Discord si ya compartiste esas URLs antes.');
