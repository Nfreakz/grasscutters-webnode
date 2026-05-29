#!/usr/bin/env node
/*
  GC_ARCHIVO_HOME2_NO_GRID_UNIFY_v1

  Local patcher. No toca GitHub.

  Objetivo:
  - Unificar /archivo, /archivo/:tipo y /archivo/:tipo/:slug con el look de Home2.
  - Eliminar/reducir fondos con grid visibles dentro de Archivo.
  - Quitar gc-home2-grid.svg en fondos de cards, spotlight y páginas interiores.
  - Hacer que slugs de Archivo usen paneles/fondos sobrios como Home2.

  Ejecutar desde raíz:
    node scripts/gc-archivo-home2-no-grid-unify-v1.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'archivo-home2-no-grid-unify-v1', stamp);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function full(rel) {
  return path.join(rootDir, rel);
}

function read(rel) {
  const p = full(rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function backup(rel, content) {
  const dest = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(rel, before, after) {
  if (before === after) {
    report.unchanged.push(rel);
    return false;
  }

  backup(rel, before);
  fs.writeFileSync(full(rel), after, 'utf8');
  report.changed.push(rel);
  return true;
}

const archiveCss = `

/* GC_ARCHIVO_HOME2_NO_GRID_UNIFY_V1
   Coherencia visual Archivo + slugs con Home2:
   - fuera grid visible;
   - fondos oscuros sobrios;
   - paneles con bordes finos;
   - menos glow y menos textura repetida.
*/

.gc-archive-home2,
.gc-archive-type-home2,
.gc-archive-detail-inner-v1 {
  --archive-panel-bg-v1: linear-gradient(180deg, rgba(7,11,8,.96), rgba(4,7,5,.985));
  --archive-panel-bg-soft-v1: linear-gradient(180deg, rgba(8,13,9,.92), rgba(4,7,5,.97));
  --archive-border-v1: rgba(150,255,47,.14);
  --archive-border-strong-v1: rgba(150,255,47,.28);
  background:
    radial-gradient(circle at 18% 0%, rgba(150,255,47,.045), transparent 26rem),
    radial-gradient(circle at 78% 10%, rgba(33,200,214,.022), transparent 24rem),
    linear-gradient(180deg, #020402 0%, #030503 46%, #020402 100%) !important;
}

/* Quitar grid global de Archivo. */
.gc-archive-home2::before,
.gc-archive-type-home2::before,
.gc-archive-detail-inner-v1::before {
  opacity: 0 !important;
  background-image: none !important;
}

/* Superficies principales como Home2: oscuras, sin patrón de rejilla. */
.gc-archive-command-card,
.gc-archive-section--panel,
.gc-archive-type-card,
.gc-archive-card,
.gc-archive-spotlight,
.gc-archive-empty,
.gc-archive-az,
.gc-archive-inner-v1 .gc-archive-section--panel,
.gc-archive-inner-side-v1 .gc-archive-type-card {
  border-color: var(--archive-border-v1) !important;
  background: var(--archive-panel-bg-v1) !important;
  box-shadow:
    0 18px 58px rgba(0,0,0,.38),
    inset 0 0 0 1px rgba(255,255,255,.018) !important;
}

/* El marco interior se mantiene, pero muy discreto. */
.gc-archive-command-card::before,
.gc-archive-section--panel::before,
.gc-archive-type-card::before,
.gc-archive-card::before,
.gc-archive-spotlight::before,
.gc-archive-empty::before,
.gc-archive-az::before {
  border-color: rgba(255,255,255,.025) !important;
}

/* Fondos de imagen/placeholder sin grid. */
.gc-archive-spotlight figure,
.gc-archive-card img,
.gc-archive-card__mark,
.gc-archive-spotlight__mark,
.gc-archive-inner-spotlight-v1 figure,
.gc-archive-inner-gallery-v1 figure {
  background:
    radial-gradient(circle at 50% 12%, rgba(150,255,47,.055), transparent 18rem),
    linear-gradient(180deg, rgba(8,14,10,.82), rgba(3,5,3,.96)) !important;
  background-image:
    radial-gradient(circle at 50% 12%, rgba(150,255,47,.055), transparent 18rem),
    linear-gradient(180deg, rgba(8,14,10,.82), rgba(3,5,3,.96)) !important;
}

/* Grid cards del catálogo con tamaño Home2 y menos textura. */
.gc-archive-grid {
  gap: 12px !important;
}

.gc-archive-card {
  min-height: 100% !important;
}

.gc-archive-card > div {
  background: rgba(3,5,3,.16) !important;
}

.gc-archive-card strong {
  font-size: clamp(18px, 1.5vw, 22px) !important;
  line-height: 1.02 !important;
}

.gc-archive-card p {
  font-size: 13.5px !important;
  line-height: 1.42 !important;
}

/* Categorías un poco más compactas y alineadas con Home2. */
.gc-archive-type-card {
  min-height: 132px !important;
  padding: 14px !important;
}

.gc-archive-type-card strong {
  font-size: clamp(20px, 2.15vw, 28px) !important;
}

/* Slugs: paneles interiores sin sensación de dashboard ajeno. */
.gc-archive-detail-inner-v1 .gc-archive-inner-v1 {
  padding-bottom: 42px !important;
}

.gc-archive-inner-layout-v1 {
  gap: 14px !important;
}

.gc-archive-inner-main-v1 {
  gap: 14px !important;
}

.gc-archive-inner-main-v1 .gc-archive-section--panel {
  padding: 24px !important;
  border-radius: var(--radius) !important;
}

.gc-archive-inner-prose-v1 {
  color: var(--soft) !important;
  font-size: 15px !important;
  line-height: 1.62 !important;
}

.gc-archive-inner-facts-v1 div,
.gc-archive-inner-sources-v1 div,
.gc-archive-inner-items-v1 article,
.gc-archive-inner-related-v1 a,
.gc-archive-inner-tags-v1 span {
  border-color: rgba(255,255,255,.065) !important;
  background: rgba(255,255,255,.014) !important;
  box-shadow: none !important;
}

.gc-archive-inner-gallery-v1 figure {
  border-color: rgba(255,255,255,.065) !important;
  background:
    linear-gradient(180deg, rgba(7,11,8,.96), rgba(4,7,5,.985)) !important;
}

.gc-archive-inner-spotlight-v1 h2 {
  font-size: clamp(25px, 2.8vw, 38px) !important;
}

/* Hero del slug: menos gris, más Home2 oscuro. */
.gc-archive-detail-inner-v1 .gc-archive-race-hero {
  background:
    radial-gradient(circle at 76% 0%, rgba(150,255,47,.06), transparent 25rem),
    linear-gradient(180deg, #020402 0%, #030503 100%) !important;
}

.gc-archive-detail-inner-v1 .gc-archive-race-hero::after,
.gc-archive-home2 .gc-archive-race-hero::after,
.gc-archive-type-home2 .gc-archive-race-hero::after {
  background:
    linear-gradient(90deg, rgba(3,5,3,.92) 0%, rgba(3,5,3,.64) 38%, rgba(3,5,3,.20) 62%, rgba(3,5,3,.88) 100%),
    linear-gradient(180deg, rgba(3,5,3,.14) 0%, rgba(3,5,3,.04) 52%, rgba(3,5,3,.96) 100%) !important;
}

/* Buscador y A-Z sobrios, sin verde excesivo. */
.gc-archive-search,
.gc-archive-az {
  background: rgba(5,9,6,.78) !important;
  border-color: var(--archive-border-v1) !important;
}

.gc-archive-search input {
  background: rgba(3,5,3,.92) !important;
}

/* Responsive, sin romper layouts existentes. */
@media (max-width: 1120px) {
  .gc-archive-inner-layout-v1 {
    grid-template-columns: 1fr !important;
  }

  .gc-archive-inner-side-v1 {
    position: static !important;
  }
}

@media (max-width: 720px) {
  .gc-archive-inner-main-v1 .gc-archive-section--panel,
  .gc-archive-section--panel {
    padding: 18px !important;
  }
}
`;

const dossierStyle = `

  /* GC_ARCHIVO_HOME2_NO_GRID_UNIFY_V1_DETAIL
     Overrides colocados dentro del propio componente para ganar orden frente a estilos inline anteriores.
  */

  .gc-archive-detail-inner-v1 .gc-archive-inner-spotlight-v1 figure {
    background:
      radial-gradient(circle at 50% 12%, rgba(150,255,47,.055), transparent 18rem),
      linear-gradient(180deg, rgba(8,14,10,.82), rgba(3,5,3,.96)) !important;
    background-image:
      radial-gradient(circle at 50% 12%, rgba(150,255,47,.055), transparent 18rem),
      linear-gradient(180deg, rgba(8,14,10,.82), rgba(3,5,3,.96)) !important;
  }

  .gc-archive-detail-inner-v1 .gc-archive-inner-gallery-v1 figure,
  .gc-archive-detail-inner-v1 .gc-archive-inner-facts-v1 div,
  .gc-archive-detail-inner-v1 .gc-archive-inner-sources-v1 div,
  .gc-archive-detail-inner-v1 .gc-archive-inner-items-v1 article,
  .gc-archive-detail-inner-v1 .gc-archive-inner-related-v1 a {
    background: rgba(255,255,255,.014) !important;
    border-color: rgba(255,255,255,.065) !important;
  }

  .gc-archive-detail-inner-v1 .gc-archive-inner-main-v1 .gc-archive-section--panel,
  .gc-archive-detail-inner-v1 .gc-archive-inner-side-v1 .gc-archive-type-card {
    background:
      linear-gradient(180deg, rgba(7,11,8,.96), rgba(4,7,5,.985)) !important;
    border-color: rgba(150,255,47,.14) !important;
    box-shadow:
      0 18px 58px rgba(0,0,0,.38),
      inset 0 0 0 1px rgba(255,255,255,.018) !important;
  }
`;

function patchArchiveCss() {
  const rel = 'src/styles/archive-home2-polish.css';
  const before = read(rel);
  let after = before;

  if (!after.includes('GC_ARCHIVO_HOME2_NO_GRID_UNIFY_V1')) {
    after += archiveCss;
  }

  writeIfChanged(rel, before, after);
}

function patchDossierComponent() {
  const rel = 'src/components/archive/ArchiveDossierPage.astro';
  const before = read(rel);
  let after = before;

  if (!after.includes('GC_ARCHIVO_HOME2_NO_GRID_UNIFY_V1_DETAIL')) {
    if (!after.includes('</style>')) {
      report.warnings.push('ArchiveDossierPage.astro no tiene </style>; no se pudo insertar override interno.');
    } else {
      after = after.replace('</style>', `${dossierStyle}\n</style>`);
    }
  }

  writeIfChanged(rel, before, after);
}

function main() {
  console.log('');
  console.log('GC Archivo Home2 No Grid Unify v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    patchArchiveCss();
    patchDossierComponent();
  } catch (error) {
    report.errors.push(error?.message || String(error));
  }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log('');
    console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }

  if (report.errors.length) {
    console.log('');
    console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }

  if (report.changed.length) {
    console.log('');
    console.log('Backups creados en:');
    console.log(backupRoot);
  }

  console.log('');
  console.log('Siguiente paso:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('');
  console.log('Pruebas:');
  console.log('  /archivo/');
  console.log('  /archivo/circuitos/');
  console.log('  /archivo/circuitos/autodromo-nazionale-monza/');
  console.log('');
}

main();
