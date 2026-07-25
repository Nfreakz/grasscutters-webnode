import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_HERO_TOP7_V17';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

/* Está pensado para el estado actual consolidado de Home. */
const knownMarkers = [
  'GC_HOME_CONSOLIDATED_HERO_CARD_V13',
  'GC_HOME_SERVER_HEADER_MINIMAL_V14',
  'GC_HOME_CARD_FINISH_V15',
  'GC_HOME_CARD_PROPORTIONS_V16',
];
if (!knownMarkers.some((marker) => src.includes(marker))) {
  console.error(`[${PACK}] No se reconoce la Home actual.`);
  process.exit(2);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

/* -------------------------------------------------------------------------- */
/* 1. Top lists: pasar de 6 a 7 filas                                          */
/* -------------------------------------------------------------------------- */

let sliceReplacements = 0;

/* Reemplazo conservador para los recortes a 6 filas usados en rankings/home. */
src = src.replace(/\.slice\(\s*0\s*,\s*6\s*\)/g, (match) => {
  sliceReplacements += 1;
  return match.replace(/6/, '7');
});

/* Algunas implementaciones usan constantes. */
src = src.replace(/\bTOP_(?:ROWS|RANKING|HOTLAPS|HOTLAP_ROWS)\b\s*=\s*6\b/g, (match) => {
  sliceReplacements += 1;
  return match.replace(/6\b/, '7');
});

src = src.replace(/\b(?:maxRows|maxHotlaps|maxRankingRows)\s*=\s*6\b/g, (match) => {
  sliceReplacements += 1;
  return match.replace(/6\b/, '7');
});

if (sliceReplacements === 0) {
  console.error(`[${PACK}] No se encontró ningún límite de 6 filas para sustituir por 7.`);
  process.exit(3);
}

/* -------------------------------------------------------------------------- */
/* 2. Override visual: quitar el borde verde exterior del bloque hero          */
/* -------------------------------------------------------------------------- */

const css = `
  /* ${PACK} */
  .gc-home2-combo-card--consolidated {
    border: 0 !important;
    box-shadow:
      0 18px 46px rgba(0,0,0,.32),
      inset 0 0 0 1px rgba(255,255,255,.04) !important;
  }

  .gc-home2-combo-card--consolidated::before,
  .gc-home2-combo-card--consolidated::after {
    border: 0 !important;
    box-shadow: none !important;
  }

  /* Si los listados quedan justos al pasar a 7, compactamos ligeramente. */
  .gc-home2 .gc-home2-hotlap-row,
  .gc-home2 .gc-home2-ranking-row,
  .gc-home2 .gc-home2-list-row {
    min-height: 36px !important;
  }

  .gc-home2 .gc-home2-hotlap-row,
  .gc-home2 .gc-home2-ranking-row,
  .gc-home2 .gc-home2-list-row,
  .gc-home2 .gc-home2-hotlap-row > *,
  .gc-home2 .gc-home2-ranking-row > *,
  .gc-home2 .gc-home2-list-row > * {
    line-height: 1.1 !important;
  }
`;

const close = '</style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(4);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);

/* Marcar instalación */
src = `/* ${PACK} */\n` + src;

fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Reemplazos de límites 6→7: ${sliceReplacements}.`);
console.log(`[${PACK}] Borde verde exterior eliminado del bloque hero.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
