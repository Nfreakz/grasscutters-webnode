#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'pages', 'index.astro');
const MARKER = 'GC_HOME_BUILD_FIX_NORMALIZE_ARCHIVE_TYPE_V8';

const fixedFunction = `const normalizeArchiveType = (value) => {
  const raw = slugify(value || 'archivo');

  if (['circuito', 'circuit', 'track', 'tracks'].includes(raw)) return 'circuitos';
  if (['coche', 'coches', 'car', 'cars', 'vehiculo', 'vehiculos', 'vehicle'].includes(raw)) return 'coches';
  if (['piloto', 'pilotos', 'driver', 'drivers'].includes(raw)) return 'pilotos';

  if (raw.endsWith('s')) return raw;
  return raw + 's';
};`;

function fail(message) {
  console.error(`\n[${MARKER}] ERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`No encuentro ${TARGET}. Ejecuta este script desde la raíz del repo.`);
}

let source = fs.readFileSync(TARGET, 'utf8');
const original = source;

const decl = /const\s+normalizeArchiveType\b/.exec(source);
if (!decl) {
  fail('No encuentro "const normalizeArchiveType" en src/pages/index.astro.');
}

const start = decl.index;
const tail = source.slice(start);

let end = -1;
let mode = '';

// Caso 1: ya existe una función completa, la sustituimos por la versión limpia.
const fullFn = /^const\s+normalizeArchiveType\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s*\};?/.exec(tail);
if (fullFn) {
  end = start + fullFn[0].length;
  mode = 'replace-complete-function';
} else {
  const lineEnd = source.indexOf('\n', start);
  if (lineEnd === -1) {
    end = source.length;
    mode = 'replace-end-of-file-line';
  } else {
    const firstLine = source.slice(start, lineEnd).trim();

    // Caso 2: el fallo típico del build: "const normalizeArchiveType" sin inicializar.
    if (/^const\s+normalizeArchiveType\s*;?$/.test(firstLine)) {
      end = lineEnd;
      mode = 'replace-broken-declaration-line';
    } else {
      // Caso 3: quedó una función parcial. Cortamos hasta la siguiente declaración de primer nivel.
      const rest = source.slice(lineEnd);
      const nextDecl = /\n(?:const|let|var|function)\s+[A-Za-z_$]/.exec(rest);

      if (nextDecl && nextDecl.index > 0 && nextDecl.index < 2500) {
        end = lineEnd + nextDecl.index;
        mode = 'replace-partial-function-block';
      } else {
        // Fallback conservador: sustituir solo la línea.
        end = lineEnd;
        mode = 'replace-first-line-conservative';
      }
    }
  }
}

source = source.slice(0, start) + fixedFunction + source.slice(end);

// Sanity checks básicos antes de escribir.
const declarations = source.match(/const\s+normalizeArchiveType\b/g) || [];
if (declarations.length !== 1) {
  fail(`Después de reparar quedan ${declarations.length} declaraciones de normalizeArchiveType. No escribo cambios.`);
}

if (/const\s+normalizeArchiveType\s*(?:;|\n)/.test(source)) {
  fail('La declaración rota sigue apareciendo después de reparar. No escribo cambios.');
}

if (source === original) {
  console.log(`[${MARKER}] No había cambios que aplicar.`);
  process.exit(0);
}

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${MARKER}] OK`);
console.log(`Archivo reparado: src/pages/index.astro`);
console.log(`Modo: ${mode}`);
console.log(`Siguiente paso: npm run build`);
