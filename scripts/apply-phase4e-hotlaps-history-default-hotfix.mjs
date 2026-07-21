import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4E_HOTLAPS_HISTORY_DEFAULT_HOTFIX_V1';
const phase4eMarker = 'GC_PHASE4E_HOTLAPS_ACTIVE_COMBO_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4e-hotlaps-history-default-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function backup(relativePath) {
  const source = target(relativePath);
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function save(relativePath, original, next) {
  if (next === original) return;
  backup(relativePath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function insertAfterRequired(text, anchor, block, label) {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  const end = index + anchor.length;
  return `${text.slice(0, end)}${block}${text.slice(end)}`;
}

// 1. Hotlaps: el archivo histórico vuelve a ser el comportamiento principal.
{
  const relativePath = 'src/pages/hotlaps.astro';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Hotlaps history] ${relativePath} ya estaba corregido.`);
  } else {
    let next = original;

    if (original.includes(phase4eMarker)) {
      // Phase 4E aplicada: se conserva "Combo activo" como vista opcional,
      // pero el histórico completo pasa a ser la vista predeterminada.
      next = replaceRequired(
        next,
        `<option value="active" selected>Combo activo</option>
          <option value="history">Histórico completo</option>`,
        `<option value="active">Combo activo</option>
          <option value="history" selected>Histórico completo</option>`,
        'las opciones de ámbito de Phase 4E'
      );

      next = replaceRequired(
        next,
        `      const requestedScope = ['history','historico','histórico','all'].includes(requestedScopeRaw) || params.get('historico') === '1'
        ? 'history'
        : 'active';`,
        `      const requestedScope = ['active','actual','current','live'].includes(requestedScopeRaw)
        ? 'active'
        : 'history';`,
        'la selección inicial de ámbito'
      );

      next = replaceRequired(
        next,
        `        els.scope.value = 'active';`,
        `        els.scope.value = 'history';`,
        'el ámbito del botón limpiar'
      );

      next = next.replace(
        `document.documentElement.dataset.gcHotlapsScope = els.scope.value;`,
        `document.documentElement.dataset.gcHotlapsScope = els.scope.value;
          document.documentElement.dataset.gcHotlapsArchiveDefault = 'history-v1';`
      );

      next = next.replace(
        `<!-- ${phase4eMarker} -->`,
        `<!-- ${phase4eMarker} -->\n<!-- ${marker} -->`
      );
    } else {
      // Phase 4E no aplicada: mantenemos la página histórica tal como estaba,
      // pero hacemos que los enlaces source=main/gt4 funcionen realmente.
      const stateAnchor = `      const state = { rows: [], filtered: [], page: 1, sortKey: 'recent', sortDir: 'desc' };`;
      const sourceBootstrap = `

      // ${marker}
      // /hotlaps es el archivo completo. El parámetro source solo prefiltra
      // Liga o GT4; nunca convierte el histórico en "combo activo".
      const params = new URLSearchParams(window.location.search);
      const requestedSourceRaw = String(params.get('source') || 'all').trim().toLowerCase();
      const requestedSource = requestedSourceRaw === 'gt4'
        ? 'gt4'
        : ['main','weekly','liga'].includes(requestedSourceRaw)
          ? 'main'
          : 'all';
      els.sourceFilter.value = requestedSource;
      document.documentElement.dataset.gcHotlapsArchiveDefault = 'history-v1';`;

      next = insertAfterRequired(next, stateAnchor, sourceBootstrap, 'el estado inicial de hotlaps');

      next = replaceRequired(
        next,
        `---
import AppLayout from '../layouts/AppLayout.astro';
---
<AppLayout`,
        `---
import AppLayout from '../layouts/AppLayout.astro';
---
<!-- ${marker} -->
<AppLayout`,
        'el encabezado de hotlaps'
      );
    }

    save(relativePath, original, next);
  }
}

// 2. Portada: "Ver todas" abre el archivo histórico de la fuente.
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);

  if (original.includes(`${marker}:HOME_LINKS`)) {
    console.log(`[GC Hotlaps history] ${relativePath} ya estaba corregido.`);
  } else {
    let next = original;

    if (next.includes('/hotlaps?source=main&scope=active')) {
      next = replaceRequired(
        next,
        `<a href="/hotlaps?source=main&scope=active" class="gc-home2-link">Ver combo activo →</a>`,
        `<a href="/hotlaps?source=main&scope=history" class="gc-home2-link">Ver todas →</a>`,
        'el enlace histórico de Liga aplicado por Phase 4E'
      );
    } else {
      next = replaceRequired(
        next,
        `<a href="/hotlaps?source=main" class="gc-home2-link">Ver todas →</a>`,
        `<a href="/hotlaps?source=main&scope=history" class="gc-home2-link">Ver todas →</a>`,
        'el enlace histórico de Liga'
      );
    }

    if (next.includes('/hotlaps?source=gt4&scope=active')) {
      next = replaceRequired(
        next,
        `<a href="/hotlaps?source=gt4&scope=active" class="gc-home2-link">Ver combo activo →</a><!-- ${phase4eMarker}:HOME_LINKS -->`,
        `<a href="/hotlaps?source=gt4&scope=history" class="gc-home2-link">Ver todas →</a><!-- ${phase4eMarker}:HOME_LINKS --><!-- ${marker}:HOME_LINKS -->`,
        'el enlace histórico GT4 aplicado por Phase 4E'
      );
    } else {
      next = replaceRequired(
        next,
        `<a href="/hotlaps?source=gt4" class="gc-home2-link">Ver todas →</a>`,
        `<a href="/hotlaps?source=gt4&scope=history" class="gc-home2-link">Ver todas →</a><!-- ${marker}:HOME_LINKS -->`,
        'el enlace histórico de GT4'
      );
    }

    save(relativePath, original, next);
  }
}

console.log('');
console.log('[GC Hotlaps history] Historial completo restaurado como vista principal.');
console.log(`[GC Hotlaps history] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Hotlaps history] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('Combo activo queda como filtro opcional solo cuando Phase 4E ya estaba instalada.');
console.log('Este instalador no modifica MySQL, ratings, resultados ni sTracker.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
