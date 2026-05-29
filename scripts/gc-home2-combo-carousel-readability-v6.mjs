#!/usr/bin/env node
/*
  GC_HOME2_COMBO_CAROUSEL_READABILITY_v6

  Local patcher. No toca GitHub.

  Aplica encima de GC_HOME2_SWAP_RACE_CONTROL_COMBO_CAROUSEL_v5.

  Cambios:
  - Combo Pulse carousel más legible.
  - Textos en mayúsculas.
  - Más tamaño en título, etiquetas, valores y detalle.
  - Barra un poco más alta para que respire.
  - Más contraste y menos sensación de texto microscópico.

  Ejecutar desde raíz:
    node scripts/gc-home2-combo-carousel-readability-v6.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'home2-combo-carousel-readability-v6', stamp);
const targetPath = 'src/styles/home2.css';
const fullTarget = path.join(rootDir, targetPath);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}`);
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function backup(pathName, content) {
  const dest = path.join(backupRoot, pathName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(pathName, before, after) {
  if (before === after) {
    report.unchanged.push(pathName);
    return false;
  }

  backup(pathName, before);
  fs.writeFileSync(path.join(rootDir, pathName), after, 'utf8');
  report.changed.push(pathName);
  return true;
}

const css = `

/* GC_HOME2_COMBO_CAROUSEL_READABILITY_V6_CSS
   Combo Pulse carousel:
   - más legible;
   - mayúsculas;
   - tamaño superior;
   - mejor contraste.
*/

.gc-home2-combo-strip__rail {
  min-height: 54px !important;
}

.gc-home2-combo-strip__title {
  min-height: 54px !important;
  padding: 0 18px !important;
}

.gc-home2-combo-strip__title strong {
  font-size: 12.4px !important;
  letter-spacing: .12em !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-marquee-track {
  min-height: 54px !important;
  animation-duration: 38s !important;
}

.gc-home2-combo-marquee-track > div {
  min-height: 54px !important;
  padding: 0 24px !important;
  gap: 10px !important;
}

.gc-home2-combo-marquee-track dt {
  color: color-mix(in srgb, var(--green, #9cff3f) 78%, var(--muted)) !important;
  font-size: 9.8px !important;
  font-weight: 950 !important;
  letter-spacing: .105em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-marquee-track dt::after {
  margin-left: 10px !important;
  color: var(--green, #9cff3f) !important;
}

.gc-home2-combo-marquee-track dd {
  color: var(--green, #9cff3f) !important;
  font-size: 15.2px !important;
  font-weight: 1000 !important;
  letter-spacing: .015em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
  text-shadow: 0 0 14px rgba(150,255,47,.18) !important;
}

.gc-home2-combo-marquee-track small {
  color: color-mix(in srgb, var(--text, #f2fff0) 88%, var(--green)) !important;
  font-size: 10.8px !important;
  font-weight: 850 !important;
  letter-spacing: .018em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.gc-home2-combo-marquee-track small::before {
  margin-right: 10px !important;
  color: var(--green, #9cff3f) !important;
}

.gc-home2-combo-marquee::before,
.gc-home2-combo-marquee::after {
  width: 92px !important;
}

@media (max-width: 1200px) {
  .gc-home2-combo-strip__rail {
    min-height: auto !important;
  }

  .gc-home2-combo-strip__title {
    min-height: 42px !important;
  }

  .gc-home2-combo-marquee-track,
  .gc-home2-combo-marquee-track > div {
    min-height: 50px !important;
  }

  .gc-home2-combo-marquee-track dd {
    font-size: 14px !important;
  }

  .gc-home2-combo-marquee-track small {
    font-size: 10.2px !important;
  }
}

@media (max-width: 760px) {
  .gc-home2-combo-marquee-track {
    animation-duration: 46s !important;
  }

  .gc-home2-combo-marquee-track > div {
    padding: 0 18px !important;
  }

  .gc-home2-combo-marquee-track dt {
    font-size: 9px !important;
  }

  .gc-home2-combo-marquee-track dd {
    font-size: 13.2px !important;
  }

  .gc-home2-combo-marquee-track small {
    font-size: 9.6px !important;
  }
}
`;

function main() {
  console.log('');
  console.log('GC Home2 Combo Carousel Readability v6');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);

    if (!before.includes('gc-home2-combo-strip')) {
      report.warnings.push('No se detecta gc-home2-combo-strip en home2.css. Aplica primero el pack v5.');
    }

    if (before.includes('GC_HOME2_COMBO_CAROUSEL_READABILITY_V6_CSS')) {
      report.unchanged.push(targetPath);
    } else {
      const after = before + css;
      writeIfChanged(targetPath, before, after);
    }
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
  console.log('Prueba:');
  console.log('  /home2');
  console.log('');
}

main();
