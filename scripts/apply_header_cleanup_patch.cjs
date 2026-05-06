#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const target = filePath(relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`No existe ${relativePath}. Ejecuta este script desde la raíz del proyecto.`);
  }
  return fs.readFileSync(target, 'utf8');
}

function write(relativePath, content) {
  const target = filePath(relativePath);
  const backup = `${target}.backup-header-cleanup-v1`;
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  fs.writeFileSync(target, content, 'utf8');
  console.log(`[GC] Actualizado ${relativePath}`);
}

function replaceBlock(content, blockName, replacement, relativePath) {
  const pattern = new RegExp(`const\\s+${blockName}\\s*=\\s*\\[[\\s\\S]*?\\];`);
  if (!pattern.test(content)) {
    throw new Error(`No se ha encontrado const ${blockName} en ${relativePath}.`);
  }
  return content.replace(pattern, replacement);
}

function patchMarketingLayout() {
  const relativePath = 'src/layouts/MarketingLayout.astro';
  let content = read(relativePath);

  const navItems = `const navItems = [
  { href: '/', label: 'INICIO', match: '/' },
  { href: '/comunidad', label: 'COMUNIDAD', match: '/comunidad' },
  { href: '/calendario', label: 'CALENDARIO', match: '/calendario' },
  { href: '/app-android', label: 'APP ANDROID', match: '/app-android' },
  { href: '/estado', label: 'ESTADO', match: '/estado' },
  { href: '/app', label: 'PLATAFORMA', match: '/app' },
];`;

  content = replaceBlock(content, 'navItems', navItems, relativePath);

  content = content.replace(
    /\n\s*<a\s+class=(["'])gc-public-cta\1\s+href=(["'])\/app\2>[\s\S]*?<\/a>/g,
    ''
  );

  write(relativePath, content);
}

function patchAppLayout() {
  const relativePath = 'src/layouts/AppLayout.astro';
  let content = read(relativePath);

  const nav = `const nav = [
  { href: '/', label: 'Inicio', code: '00' },
  { href: '/app', label: 'Panel', code: '01' },
  { href: '/calendario', label: 'Calendario', code: '02' },
  { href: '/hotlaps', label: 'Hotlaps', code: '03' },
  { href: '/pilotos', label: 'Pilotos', code: '04' },
  { href: '/combos', label: 'Combos', code: '05' },
  { href: '/herramientas', label: 'Herramientas', code: '06' },
  { href: '/perfil', label: 'Perfil', code: '07' },
  { href: '/admin', label: 'Admin', code: '08', adminOnly: true },
  { href: '/admin/calendario', label: 'Calendario admin', code: '09', adminOnly: true }
];`;

  content = replaceBlock(content, 'nav', nav, relativePath);

  content = content.replace(
    /\n\s*<nav\s+class=(["'])gc-topnav\1[\s\S]*?<\/nav>\s*/g,
    '\n'
  );

  write(relativePath, content);
}

function patchHeaderCss() {
  const relativePath = 'src/styles/auth-header-status.css';
  let content = read(relativePath);

  const marker = '/* Pack header cleanup v1 */';
  if (content.includes(marker)) {
    console.log('[GC] CSS header cleanup v1 ya estaba aplicado.');
    return;
  }

  const css = `
${marker}
.gc-public-header .gc-public-nav a{
  text-transform:uppercase !important;
  font-size:.82rem !important;
  font-weight:950 !important;
  letter-spacing:.095em !important;
}

.gc-public-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
}

.gc-public-actions .gc-theme{
  order:1;
}

.gc-public-actions [data-auth-status]{
  order:2;
}

.gc-public-actions [data-auth-link],
.gc-public-actions .gc-public-link,
.gc-public-actions .gc-auth-profile-link{
  order:3;
}

.gc-public-actions [data-auth-logout],
.gc-public-actions .gc-auth-logout{
  order:4;
}

.gc-public-actions .gc-public-cta{
  display:none !important;
}

.gc-topbar .gc-topnav,
.gc-topnav--empty{
  display:none !important;
}
`;

  content = `${content.trimEnd()}\n\n${css}`;
  write(relativePath, content);
}

try {
  patchMarketingLayout();
  patchAppLayout();
  patchHeaderCss();
  console.log('[GC] Header público ajustado: menú en mayúsculas, Plataforma al menú y Salir al extremo derecho.');
} catch (error) {
  console.error('[GC] Error aplicando header cleanup:', error.message);
  process.exit(1);
}
