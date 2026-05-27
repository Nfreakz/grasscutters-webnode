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

const marker = "const shouldNoindex = noindex ?? (currentPathForSeo.startsWith('/admin') || currentPathForSeo.startsWith('/perfil'));";

if (!content.includes(marker)) {
  console.error('[GC PILOT SEO FIX] No encuentro el bloque SEO esperado. Busca manualmente: shouldNoindex');
  process.exit(1);
}

const duplicateBlock = `
const normalizePath = (path) => {
  if (!path || path === '/') return '/';
  return path.replace(/\\/$/, '');
};
`;

const markerIndex = content.indexOf(marker);
const afterMarker = content.slice(markerIndex + marker.length);

if (!afterMarker.includes(duplicateBlock)) {
  const count = (content.match(/const normalizePath = \(path\) => \{/g) || []).length;
  if (count <= 1) {
    console.log('[GC PILOT SEO FIX] No hay normalizePath duplicado. Nada que corregir.');
    process.exit(0);
  }

  console.error('[GC PILOT SEO FIX] Hay duplicados, pero no coinciden con el bloque esperado.');
  console.error('[GC PILOT SEO FIX] Ocurrencias normalizePath: ' + count);
  process.exit(1);
}

content =
  content.slice(0, markerIndex + marker.length) +
  afterMarker.replace(duplicateBlock, '\n');

const countAfter = (content.match(/const normalizePath = \(path\) => \{/g) || []).length;
if (countAfter !== 1) {
  console.error('[GC PILOT SEO FIX] Después de corregir siguen quedando ' + countAfter + ' normalizePath.');
  process.exit(1);
}

const backupPath = appLayoutPath + '.bak-v15-30-2';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, 'utf8');
}

fs.writeFileSync(appLayoutPath, content, 'utf8');

console.log('[GC PILOT SEO FIX] normalizePath duplicado eliminado.');
console.log('[GC PILOT SEO FIX] Backup: ' + backupPath);
console.log('[GC PILOT SEO FIX] Ejecuta ahora: npm run build');
