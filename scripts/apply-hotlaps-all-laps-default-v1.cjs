const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src', 'pages', 'hotlaps.astro');

if (!fs.existsSync(target)) {
  console.error('[GC Hotlaps All Laps] No encuentro src/pages/hotlaps.astro');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');
const original = src;

function replaceOnce(label, pattern, replacement) {
  const before = src;
  src = src.replace(pattern, replacement);
  if (before === src) {
    console.warn(`[GC Hotlaps All Laps] Aviso: no se aplicó ${label}`);
  } else {
    console.log(`[GC Hotlaps All Laps] OK: ${label}`);
  }
}

function replaceAll(label, pattern, replacement) {
  const before = src;
  src = src.replace(pattern, replacement);
  if (before === src) {
    console.warn(`[GC Hotlaps All Laps] Aviso: no se aplicó ${label}`);
  } else {
    console.log(`[GC Hotlaps All Laps] OK: ${label}`);
  }
}

// Textos: Hotlaps debe comunicar "todas las vueltas", no "último circuito activo".
replaceOnce(
  'description AppLayout',
  /description="Consulta rápida de hotlaps con filtro automático del último circuito activo, vueltas válidas y orden por tiempo, velocidad o actividad\."/,
  'description="Consulta todas las vueltas registradas en GrassCutters sin filtro automático de combo. Ordena por tiempo, velocidad o actividad."'
);

replaceOnce(
  'hero subtitle',
  /Consulta rápida del último circuito activo\. Filtra por piloto, coche o circuito y ordena por tiempo, velocidad o actividad\./,
  'Consulta todas las vueltas registradas. El filtro por combo pertenece a Combos; aquí se muestra el histórico completo.'
);

replaceOnce(
  'active track chip text',
  /<span class="gc-chip gc-chip--accent" id="activeTrackChip">Último circuito activo<\/span>/,
  '<span class="gc-chip gc-chip--accent" id="activeTrackChip">Todas las vueltas</span>'
);

replaceOnce(
  'valid chip text',
  /<span class="gc-chip">Vueltas válidas<\/span>/,
  '<span class="gc-chip">Sin filtro de combo</span>'
);

replaceOnce(
  'metric track label',
  /<small id="hotlapMetricTrackMeta">último activo<\/small>/,
  '<small id="hotlapMetricTrackMeta">todos los circuitos</small>'
);

replaceOnce(
  'valid filter default all',
  /<option value="valid" selected>Válidas<\/option>\s*<option value="all">Todas<\/option>/,
  '<option value="valid">Válidas</option>\n          <option value="all" selected>Todas</option>'
);

replaceOnce(
  'active button label',
  /<button class="gc-btn gc-btn--primary" id="activeTrackButton" type="button">Último circuito<\/button>/,
  '<button class="gc-btn gc-btn--primary" id="activeTrackButton" type="button">Ver combos</button>'
);

replaceOnce(
  'initial order text',
  /<span id="leaderboardOrder">Último circuito activo · válidas · más rápido<\/span>/,
  '<span id="leaderboardOrder">Todas las vueltas · todos los circuitos · más rápido</span>'
);

// Helper: probar varios endpoints para cargar todas las vueltas.
if (!src.includes('function fetchCoreJsonFirst(urls)')) {
  replaceOnce(
    'insert fetchCoreJsonFirst helper',
    /      async function fetchCoreJson\(url\) \{\n([\s\S]*?)      \}\n\n      function ensureCoreBadge/,
    `      async function fetchCoreJson(url) {
$1      }

      async function fetchCoreJsonFirst(urls) {
        let lastError = null;

        for (const url of urls) {
          try {
            return await fetchCoreJson(url);
          } catch (error) {
            lastError = error;
            console.warn('[GC /hotlaps] endpoint no disponible:', url, error?.message || error);
          }
        }

        throw lastError || new Error('No hotlaps endpoint available');
      }

      function ensureCoreBadge`
  );
}

// Carga: no usar activeCombo como fuente principal. Hotlaps debe cargar todo.
replaceOnce(
  'load all laps endpoints',
  /          const \[snapshot, leaderboard\] = await Promise\.all\(\[\s*fetchCoreJson\('\/api\/gc\/snapshot\?scope=activeCombo&limit=12'\),\s*fetchCoreJson\('\/api\/gc\/leaderboard\?scope=activeCombo&limit=1000'\)\s*\]\);/,
  `          const [snapshot, leaderboard] = await Promise.all([
            fetchCoreJson('/api/gc/snapshot?scope=activeCombo&limit=12').catch(() => null),
            fetchCoreJsonFirst([
              '/api/gc/leaderboard?scope=all&limit=3000',
              '/api/gc/leaderboard?scope=global&limit=3000',
              '/api/gc/recent-laps?limit=3000&sort=recent&valid=all',
              '/api/laps?limit=3000&sort=recent&valid=all',
              '/api/hotlaps?limit=3000&sort=recent&valid=all'
            ])
          ]);`
);

// Estado inicial: no activar track activo ni solo válidas.
replaceOnce(
  'initial defaults no active filter',
  /            if \(els\.valid\) els\.valid\.value = 'valid';\s*            if \(els\.sort\) els\.sort\.value = 'fastest';\s*            applyActiveTrack\(\);/,
  `            if (els.valid) els.valid.value = 'all';
            if (els.track) els.track.value = 'all';
            if (els.sort) els.sort.value = 'fastest';`
);

// Clear: vuelve a todo, no a combo activo.
replaceOnce(
  'clear defaults no active filter',
  /        if \(els\.valid\) els\.valid\.value = 'valid';\s*        if \(els\.sort\) els\.sort\.value = 'fastest';\s*        applyActiveTrack\(\);\s*        drawCore\(\);/,
  `        if (els.valid) els.valid.value = 'all';
        if (els.track) els.track.value = 'all';
        if (els.sort) els.sort.value = 'fastest';
        drawCore();`
);

// Botón: en Hotlaps no filtra, manda a Combos.
replaceOnce(
  'activeTrackButton goes combos',
  /      els\.activeTrackButton\?\.addEventListener\('click', \(\) => \{ applyActiveTrack\(\); drawCore\(\); \}\);/,
  `      els.activeTrackButton?.addEventListener('click', () => { window.location.href = '/combos'; });`
);

// Draw: no compactar por piloto. El listado debe ser vuelta por vuelta.
replaceOnce(
  'draw all laps no compactByDriver',
  /        const compacted = compactByDriver\(filtered\);\s*        const rows = sortRows\(compacted\);/,
  `        const rows = sortRows(filtered);`
);

// Hint: ya no son pilotos visibles.
replaceOnce(
  'hint all laps wording',
  /          \? `\$\{rows\.length\} pilotos visibles · \$\{filtered\.length\} vueltas filtradas de \$\{state\.cache\.length\} · Data Core primary`/,
  "? `${rows.length} vueltas visibles de ${state.cache.length} · Data Core primary`"
);

// Order label: si todo está neutro, comunicarlo claro.
replaceOnce(
  'order label wording',
  /        return `\$\{trackLabel\} · \$\{validLabel\.toLowerCase\(\)\} · \$\{sortLabel\.toLowerCase\(\)\} · Data Core primary`;/,
  "        return `${trackLabel} · ${validLabel.toLowerCase()} · ${sortLabel.toLowerCase()} · listado completo`;"
);

// Métricas: si track=all, meta claro.
replaceOnce(
  'metric meta wording',
  /if \(els\.metricTrackMeta\) els\.metricTrackMeta\.textContent = isPureActiveComboView \? `combo activo · \$\{state\.activeComboLaps \|\| filtered\.length\} vueltas` : \(activeTrackSelected \? 'combo activo filtrado' : 'filtro manual'\);/,
  "if (els.metricTrackMeta) els.metricTrackMeta.textContent = (els.track?.value || 'all') === 'all' ? 'todos los circuitos' : (activeTrackSelected ? 'combo activo filtrado' : 'filtro manual');"
);

// Badge: mantener visible el combo activo como referencia, pero no como filtro.
replaceOnce(
  'active chip reference wording',
  /if \(els\.activeTrackChip\) els\.activeTrackChip\.textContent = state\.activeTrackLabel \|\| 'Combo activo';/,
  "if (els.activeTrackChip) els.activeTrackChip.textContent = 'Todas las vueltas';"
);

// Data version bump
replaceAll(
  'version labels bump',
  /Data Core primary v1\.1/g,
  'Data Core all laps v1'
);

replaceAll(
  'dataset version bump',
  /document\.documentElement\.dataset\.gcHotlapsDataCoreVersion = 'v1\.1';/g,
  "document.documentElement.dataset.gcHotlapsDataCoreVersion = 'all-laps-v1';"
);

replaceAll(
  'console label bump',
  /\[GC \/hotlaps Data Core Primary v1\.1\]/g,
  '[GC /hotlaps Data Core All Laps v1]'
);

replaceAll(
  'end marker runtime info bump',
  /data-core-primary-clean-v1/g,
  'data-core-all-laps-v1'
);

// Añadir CSS mínimo para que el botón "Ver combos" no parezca filtro activo de la tabla.
if (!src.includes('GC_HOTLAPS_ALL_LAPS_V1_STYLE')) {
  replaceOnce(
    'insert all laps style marker',
    /  <\/style>\n\n  <script is:inline>/,
    `
      /* GC_HOTLAPS_ALL_LAPS_V1_STYLE */
      .gc-hotlaps-v13 #activeTrackButton{
        background:rgba(255,255,255,.08)!important;
        color:var(--text,#f2fff0)!important;
        border-color:rgba(255,255,255,.16)!important;
      }
    </style>

  <script is:inline>`
  );
}

if (src === original) {
  console.log('[GC Hotlaps All Laps] No había cambios que aplicar.');
  process.exit(0);
}

const backup = `${target}.bak-hotlaps-all-laps-v1-${Date.now()}`;
fs.writeFileSync(backup, original, 'utf8');
fs.writeFileSync(target, src, 'utf8');

console.log('[GC Hotlaps All Laps] Aplicado correctamente.');
console.log(`[GC Hotlaps All Laps] Backup: ${backup}`);
