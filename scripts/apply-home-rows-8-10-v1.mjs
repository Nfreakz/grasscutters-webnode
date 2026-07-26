import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_ROWS_8_10_OVERWRITE_PACK_V1';
const root = process.cwd();
const runtimeFile = path.join(root, 'public', 'js', 'gc-home-runtime-final.js');
const heroFile = path.join(root, 'src', 'components', 'public', 'PublicHeroFrame.astro');
const backupDir = path.join(root, '_gc_backups', PACK);

if (!fs.existsSync(runtimeFile)) throw new Error(`No existe ${runtimeFile}`);
fs.mkdirSync(backupDir, { recursive: true });

function backup(file) {
  const rel = path.relative(root, file).replace(/[\\/]/g, '__');
  fs.copyFileSync(file, path.join(backupDir, `${rel}.${Date.now()}.bak`));
}

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }

backup(runtimeFile);
let runtime = read(runtimeFile)
  .replace(/const enforceTopSeven = \(selector\) =>/g, 'const enforceTopEight = (selector) =>')
  .replace(/index < 7 \? '' : 'none'/g, "index < 8 ? '' : 'none'")
  .replace(/host\.dataset\.gcVisibleRows = '7';/g, "host.dataset.gcVisibleRows = '8';")
  .replace(/enforceTopSeven\(MAIN_RANKING\)/g, 'enforceTopEight(MAIN_RANKING)')
  .replace(/enforceTopSeven\(GT4_RANKING\)/g, 'enforceTopEight(GT4_RANKING)')
  .replace(/dataset\.gcHomeRuntimeFinal = 'v1'/g, "dataset.gcHomeRuntimeFinal = 'v2-rows-8-10'");

if (!runtime.includes('index < 8')) throw new Error('No se pudo aplicar el límite de 8 filas.');

if (!runtime.includes('TIMING_SHEET')) {
  runtime = runtime.replace(
    "  const GT4_RANKING = '[data-home2-combo-ranking-gt4]';",
    "  const GT4_RANKING = '[data-home2-combo-ranking-gt4]';\n  const TIMING_SHEET = '[data-home2-timing-sheet], [data-home2-latest-laps], .gc-home2-timing-sheet tbody, .gc-home2-timing-list';"
  );

  runtime = runtime.replace(
    "  const enforcePopoverLabels = () => {",
    `  const enforceTimingTen = () => {
    const host = document.querySelector(TIMING_SHEET);
    if (!host) return;
    const rows = Array.from(host.children).filter((node) => node instanceof HTMLElement);
    rows.forEach((row, index) => {
      row.style.display = index < 10 ? '' : 'none';
    });
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '10';
  };

  const enforcePopoverLabels = () => {`
  );

  runtime = runtime.replace(
    "    enforceTopEight(GT4_RANKING);\n    enforcePopoverLabels();",
    "    enforceTopEight(GT4_RANKING);\n    enforceTimingTen();\n    enforcePopoverLabels();"
  );
}

write(runtimeFile, runtime);

const exts = new Set(['.astro', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const roots = [path.join(root, 'src'), path.join(root, 'public')].filter(fs.existsSync);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '_gc_backups'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (exts.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
}

roots.forEach(walk);
const words = /timing\s*sheet|latest\s*laps|recent\s*laps|ultimas\s*vueltas|últimas\s*vueltas|timingSheet|latestLaps|recentLaps/i;
const changed = [];

for (const file of files) {
  let content = read(file);
  if (!words.test(content)) continue;
  const original = content;
  content = content
    .replace(/slice\(\s*0\s*,\s*8\s*\)/g, 'slice(0, 10)')
    .replace(/(?:limit|maxRows|visibleRows|rowLimit|latestLimit|timingLimit)\s*[:=]\s*8\b/g, (m) => m.replace(/\b8\b/, '10'));
  if (content !== original) {
    backup(file);
    write(file, content);
    changed.push(path.relative(root, file));
  }
}

if (fs.existsSync(heroFile)) {
  const hero = read(heroFile);
  const updated = hero.replace(/\/js\/gc-home-runtime-final\.js\?v=[^"' ]+/g, '/js/gc-home-runtime-final.js?v=2');
  if (updated !== hero) {
    backup(heroFile);
    write(heroFile, updated);
  }
}

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Mejores tiempos: 8 filas.`);
console.log(`[${PACK}] Timing Sheet: 10 filas.`);
console.log(`[${PACK}] Archivos de datos ajustados: ${changed.length ? changed.join(', ') : 'fallback visual en runtime'}`);
console.log(`[${PACK}] Ejecuta npm run build`);
