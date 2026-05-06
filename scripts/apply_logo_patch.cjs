const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appLayoutPath = path.join(root, 'src', 'layouts', 'AppLayout.astro');
const marketingLayoutPath = path.join(root, 'src', 'layouts', 'MarketingLayout.astro');
const globalCssPath = path.join(root, 'src', 'styles', 'global.css');
const marketingCssPath = path.join(root, 'src', 'styles', 'marketing.css');
const logoPath = path.join(root, 'src', 'assets', 'logo.png');

function fail(message) {
  console.error(`[GC LOGO PATCH] ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) fail(`No existe: ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.backup-logo-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`[GC LOGO PATCH] Backup creado: ${path.relative(root, backupPath)}`);
}

function ensureImport(content) {
  if (content.includes("../assets/logo.png")) return content;
  return content.replace(/(import\s+[^\n]+;\s*)/, `$1\nimport logoUrl from '../assets/logo.png';\n`);
}

function patchAppLayout() {
  let content = read(appLayoutPath);
  const before = content;
  content = ensureImport(content);

  content = content.replace(
    /<span\s+class="gc-brand__mark">\s*GC\s*<\/span>/,
    '<span class="gc-brand__mark gc-brand__mark--logo"><img src={logoUrl.src} alt="" loading="eager" /></span>'
  );

  if (content === before) {
    console.log('[GC LOGO PATCH] AppLayout ya estaba actualizado o no se encontró el marcador GC exacto.');
  } else {
    backup(appLayoutPath);
    write(appLayoutPath, content);
    console.log('[GC LOGO PATCH] AppLayout actualizado.');
  }
}

function patchMarketingLayout() {
  if (!fs.existsSync(marketingLayoutPath)) return;
  let content = read(marketingLayoutPath);
  const before = content;
  content = ensureImport(content);

  content = content.replace(
    /<span\s+class="gc-public-brand-mark">\s*GC\s*<\/span>/,
    '<span class="gc-public-brand-mark gc-public-brand-mark--logo"><img src={logoUrl.src} alt="" loading="eager" /></span>'
  );

  if (content === before) {
    console.log('[GC LOGO PATCH] MarketingLayout ya estaba actualizado o no se encontró el marcador GC exacto.');
  } else {
    backup(marketingLayoutPath);
    write(marketingLayoutPath, content);
    console.log('[GC LOGO PATCH] MarketingLayout actualizado.');
  }
}

function appendOnce(filePath, marker, css) {
  if (!fs.existsSync(filePath)) return;
  let content = read(filePath);
  if (content.includes(marker)) {
    console.log(`[GC LOGO PATCH] CSS ya presente en ${path.relative(root, filePath)}.`);
    return;
  }
  backup(filePath);
  content = `${content.trimEnd()}\n\n${css.trim()}\n`;
  write(filePath, content);
  console.log(`[GC LOGO PATCH] CSS añadido a ${path.relative(root, filePath)}.`);
}

function patchCss() {
  appendOnce(globalCssPath, 'Pack logo real sidebar', `
/* Pack logo real sidebar */
.gc-brand__mark--logo{
  background:transparent !important;
  box-shadow:none !important;
  padding:0 !important;
  overflow:hidden;
}
.gc-brand__mark--logo img{
  width:100%;
  height:100%;
  display:block;
  object-fit:contain;
}
`);

  appendOnce(marketingCssPath, 'Pack logo real public header', `
/* Pack logo real public header */
.gc-public-brand-mark--logo{
  background:transparent !important;
  box-shadow:none !important;
  padding:0 !important;
  overflow:hidden;
}
.gc-public-brand-mark--logo img{
  width:100%;
  height:100%;
  display:block;
  object-fit:contain;
}
`);
}

if (!fs.existsSync(logoPath)) {
  console.warn('[GC LOGO PATCH] Aviso: no encuentro src/assets/logo.png. El patch se aplicará, pero el build fallará si ese archivo no existe.');
}

patchAppLayout();
patchMarketingLayout();
patchCss();
console.log('[GC LOGO PATCH] Listo. Ejecuta npm run build y reinicia el servidor.');
