import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'index.astro');
const backupDir = path.join(root, '_gc_backups');
const reportDir = path.join(root, '_gc_reports', 'home-build-fix-v6');

fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });

if (!fs.existsSync(target)) {
  throw new Error(`No existe ${target}. Ejecuta este script desde la raíz del proyecto.`);
}

const before = fs.readFileSync(target, 'utf8');
const backupPath = path.join(backupDir, `index-before-home-build-fix-v6-${Date.now()}.astro`);
fs.writeFileSync(backupPath, before, 'utf8');

const helper = `      const normalizeArchiveType = (value) => {\n        const raw = slugify(value || 'archivo');\n        if (['circuito', 'circuit', 'track', 'tracks'].includes(raw)) return 'circuitos';\n        if (['coche', 'coches', 'car', 'cars', 'vehiculo', 'vehiculos', 'vehicle'].includes(raw)) return 'coches';\n        if (['piloto', 'pilotos', 'driver', 'drivers'].includes(raw)) return 'pilotos';\n        if (raw.endsWith('s')) return raw;\n        return `${raw}s`;\n      };`;

const validNormalizeRegex = /const\s+normalizeArchiveType\s*=\s*\([^)]*\)\s*=>\s*\{/g;
const brokenLineRegexes = [
  /^\s*const\s+normalizeArchiveType\s*;\s*$/,
  /^\s*const\s+normalizeArchiveType\s*=\s*;\s*$/,
  /^\s*const\s+normalizeArchiveType\s*=\s*$/
];

let changed = false;
let text = before;

const validBefore = (text.match(validNormalizeRegex) || []).length;
let removedBroken = 0;

const lines = text.split(/\r?\n/);
const repairedLines = [];
for (const line of lines) {
  const isBroken = brokenLineRegexes.some((regex) => regex.test(line));
  if (isBroken) {
    removedBroken += 1;
    changed = true;
    // Si no hay helper válido en el archivo, reponemos aquí el helper completo.
    // Si ya hay uno válido, eliminamos solo la línea rota para evitar duplicados.
    if (validBefore === 0 && !repairedLines.some((l) => l.includes('const normalizeArchiveType ='))) {
      repairedLines.push(helper);
    }
    continue;
  }
  repairedLines.push(line);
}
text = repairedLines.join('\n');

const validAfterBrokenPass = (text.match(validNormalizeRegex) || []).length;

if (validAfterBrokenPass === 0) {
  const insertionPoints = [
    /\n\s*const\s+archiveImage\s*=\s*\(/,
    /\n\s*const\s+archiveHref\s*=\s*\(/,
    /\n\s*const\s+publicImageCandidates\s*=\s*\(/
  ];

  let inserted = false;
  for (const point of insertionPoints) {
    if (point.test(text)) {
      text = text.replace(point, `\n${helper}\n$&`);
      inserted = true;
      changed = true;
      break;
    }
  }

  if (!inserted) {
    throw new Error('No he encontrado punto seguro para insertar normalizeArchiveType. Revisa index.astro manualmente.');
  }
}

const validAfter = (text.match(validNormalizeRegex) || []).length;
if (validAfter > 1) {
  // Mantener el primer helper y eliminar duplicados exactos posteriores solo si son el helper estándar.
  let seen = false;
  text = text.replace(/\n\s*const\s+normalizeArchiveType\s*=\s*\(value\)\s*=>\s*\{\n\s*const\s+raw\s*=\s*slugify\(value\s*\|\|\s*'archivo'\);\n\s*if\s*\(\['circuito',\s*'circuit',\s*'track',\s*'tracks'\]\.includes\(raw\)\)\s*return\s*'circuitos';\n\s*if\s*\(\['coche',\s*'coches',\s*'car',\s*'cars',\s*'vehiculo',\s*'vehiculos',\s*'vehicle'\]\.includes\(raw\)\)\s*return\s*'coches';\n\s*if\s*\(\['piloto',\s*'pilotos',\s*'driver',\s*'drivers'\]\.includes\(raw\)\)\s*return\s*'pilotos';\n\s*if\s*\(raw\.endsWith\('s'\)\)\s*return\s*raw;\n\s*return\s*`\$\{raw\}s`;\n\s*\};/g, (match) => {
    if (!seen) {
      seen = true;
      return match;
    }
    changed = true;
    return '';
  });
}

if (!/const\s+normalizeArchiveType\s*=\s*\([^)]*\)\s*=>\s*\{/.test(text)) {
  throw new Error('normalizeArchiveType sigue sin estar inicializado después del fix.');
}

if (text !== before) {
  fs.writeFileSync(target, text, 'utf8');
  changed = true;
}

const report = [
  '# home-build-fix-v6',
  '',
  `Backup: ${path.relative(root, backupPath)}`,
  `Líneas rotas eliminadas/reparadas: ${removedBroken}`,
  `Helper válido antes: ${validBefore}`,
  `Helper válido después: ${(text.match(validNormalizeRegex) || []).length}`,
  `Archivo modificado: ${changed ? 'sí' : 'no'}`,
  '',
  'Siguiente comando:',
  '',
  '```powershell',
  'npm run build',
  '```',
  ''
].join('\n');

fs.writeFileSync(path.join(reportDir, 'report.md'), report, 'utf8');
console.log(report);
