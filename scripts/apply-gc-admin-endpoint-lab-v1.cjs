#!/usr/bin/env node
/* GC_ADMIN_ENDPOINT_LAB_V1_APPLY
 * Adds /admin/endpoints page and subnav entry.
 * No assets. No public UI changes.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const pageFrom = path.join(root, 'payload', 'src', 'pages', 'admin', 'endpoints.astro');
const pageTo = path.join(root, 'src', 'pages', 'admin', 'endpoints.astro');
const subnavPath = path.join(root, 'src', 'components', 'AdminSubnav.astro');

if (!fs.existsSync(pageFrom)) {
  console.error('[GC ENDPOINT LAB] Missing payload page.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(pageTo), { recursive: true });
if (fs.existsSync(pageTo)) {
  const current = fs.readFileSync(pageTo, 'utf8');
  if (!current.includes('GC_ADMIN_ENDPOINT_LAB_V1')) {
    console.error('[GC ENDPOINT LAB] Refusing to overwrite existing src/pages/admin/endpoints.astro without marker.');
    process.exit(1);
  }
}
fs.copyFileSync(pageFrom, pageTo);
console.log('[GC ENDPOINT LAB] Wrote src/pages/admin/endpoints.astro');

if (!fs.existsSync(subnavPath)) {
  console.warn('[GC ENDPOINT LAB] AdminSubnav.astro not found. Page added but nav not patched.');
  process.exit(0);
}

let subnav = fs.readFileSync(subnavPath, 'utf8');
const navEntry = "  { href: '/admin/endpoints', label: 'Endpoints', desc: 'Pruebas API' },";
if (!subnav.includes("href: '/admin/endpoints'")) {
  const anchor = "  { href: '/admin/sistema', label: 'Sistema', desc: 'Storage y sync' },";
  if (!subnav.includes(anchor)) {
    console.warn('[GC ENDPOINT LAB] Anchor not found in AdminSubnav. Adding before Historial if possible.');
    const fallback = "  { href: '/admin/historial', label: 'Historial', desc: 'Auditoría' }";
    if (subnav.includes(fallback)) {
      subnav = subnav.replace(fallback, navEntry + "\n" + fallback);
    } else {
      console.warn('[GC ENDPOINT LAB] Could not patch subnav automatically.');
    }
  } else {
    subnav = subnav.replace(anchor, navEntry + "\n" + anchor);
  }

  fs.writeFileSync(subnavPath, subnav, 'utf8');
  console.log('[GC ENDPOINT LAB] Patched AdminSubnav.astro');
} else {
  console.log('[GC ENDPOINT LAB] AdminSubnav already contains /admin/endpoints');
}

console.log('[GC ENDPOINT LAB] Done. Run: npm run build');
