import fs from 'node:fs';

const target = 'src/pages/index.astro';

if (!fs.existsSync(target)) {
  console.error(`[repair-home-build-normalize-v7] No encuentro ${target}. Ejecuta este script desde la raíz del proyecto.`);
  process.exit(1);
}

const original = fs.readFileSync(target, 'utf8');

const archiveMarker = '      const archiveImage = (item, index = 0) => {';
const archiveIndex = original.indexOf(archiveMarker);

if (archiveIndex < 0) {
  console.error('[repair-home-build-normalize-v7] No encuentro el marcador "const archiveImage". No modifico nada.');
  process.exit(1);
}

const helperLines = [
  '      const normalizeArchiveType = (value) => {',
  "        const raw = slugify(value || 'archivo');",
  "        if (['circuito', 'circuit', 'track', 'tracks'].includes(raw)) return 'circuitos';",
  "        if (['coche', 'coches', 'car', 'cars', 'vehiculo', 'vehiculos', 'vehicle'].includes(raw)) return 'coches';",
  "        if (['piloto', 'pilotos', 'driver', 'drivers'].includes(raw)) return 'pilotos';",
  "        if (raw.endsWith('s')) return raw;",
  "        return raw + 's';",
  '      };'
];
const helper = helperLines.join('\n');

let before = original.slice(0, archiveIndex);
let after = original.slice(archiveIndex);

// Elimina cualquier bloque roto o duplicado de normalizeArchiveType justo antes de archiveImage.
// Es intencionadamente local: solo corta desde la ultima aparicion antes de archiveImage.
const previousNormalizeIndex = before.lastIndexOf('      const normalizeArchiveType');
if (previousNormalizeIndex >= 0) {
  const tail = before.slice(previousNormalizeIndex);
  if (tail.length < 2500) {
    before = before.slice(0, previousNormalizeIndex);
  } else {
    console.error('[repair-home-build-normalize-v7] Hay demasiado contenido entre normalizeArchiveType y archiveImage. No modifico para evitar danos.');
    process.exit(1);
  }
}

const updated = before.replace(/\s*$/, '\n\n') + helper + '\n\n' + after;

if (updated === original) {
  console.log('[repair-home-build-normalize-v7] Sin cambios necesarios.');
  process.exit(0);
}

fs.writeFileSync(target, updated, 'utf8');
console.log('[repair-home-build-normalize-v7] OK: normalizeArchiveType reparado en src/pages/index.astro.');
