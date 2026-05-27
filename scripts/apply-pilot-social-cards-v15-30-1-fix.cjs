const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appLayoutPath = path.join(root, 'src', 'layouts', 'AppLayout.astro');

if (!fs.existsSync(appLayoutPath)) {
  console.error('[GC PILOT SEO FIX] No encuentro ' + appLayoutPath);
  process.exit(1);
}

let content = fs.readFileSync(appLayoutPath, 'utf8');
const original = content;

const bad = "const shouldNoindex = noindex ?? currentPathForSeo.startsWith('/admin') || currentPathForSeo.startsWith('/perfil');";
const good = "const shouldNoindex = noindex ?? (currentPathForSeo.startsWith('/admin') || currentPathForSeo.startsWith('/perfil'));";

if (content.includes(good)) {
  console.log('[GC PILOT SEO FIX] La corrección ya estaba aplicada.');
  process.exit(0);
}

if (!content.includes(bad)) {
  console.error('[GC PILOT SEO FIX] No encuentro la línea exacta a corregir.');
  console.error('[GC PILOT SEO FIX] Busca manualmente: shouldNoindex');
  process.exit(1);
}

content = content.replace(bad, good);

const backupPath = appLayoutPath + '.bak-v15-30-1';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, 'utf8');
}

fs.writeFileSync(appLayoutPath, content, 'utf8');

console.log('[GC PILOT SEO FIX] AppLayout corregido.');
console.log('[GC PILOT SEO FIX] Backup: ' + backupPath);
console.log('[GC PILOT SEO FIX] Ejecuta ahora: npm run build');
