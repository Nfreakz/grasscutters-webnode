import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-pilot-links-style-v1-1-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME PILOT LINKS STYLE V1.1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  fail('No se encontró el bloque de enlaces/popover V1.');
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const oldBase = `    .gc-home2 .gc-home-pilot-link{
      color:inherit;
      font:inherit;
      font-weight:inherit;
      text-decoration:none;
      cursor:pointer;
      border-radius:4px;
      outline:none;
    }`;

const newBase = `    .gc-home2 .gc-home-pilot-link{
      color:inherit;
      font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:inherit;
      font-style:normal;
      font-weight:900;
      line-height:inherit;
      letter-spacing:inherit;
      text-transform:uppercase;
      text-decoration:none !important;
      cursor:pointer;
      border-radius:4px;
      outline:none;
    }`;

const oldHover = `    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible{
      color:var(--green,#96ff2f);
      text-decoration:underline;
      text-decoration-thickness:1px;
      text-underline-offset:3px;
    }`;

const newHover = `    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible{
      color:var(--green,#96ff2f);
      font-weight:900;
      text-decoration:none !important;
    }`;

if (!source.includes(oldBase)) fail('No se encontró el estilo base esperado.');
if (!source.includes(oldHover)) fail('No se encontró el estilo hover esperado.');

source = source.replace(oldBase, newBase);
source = source.replace(oldHover, newHover);

fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME PILOT LINKS STYLE V1.1] Estilo actualizado.');
console.log('  - Sin subrayado.');
console.log('  - Negrita 900.');
console.log('  - Hover solo cambia a verde.');
console.log(`  - Backup: ${backupFile}`);
