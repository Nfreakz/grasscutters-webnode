const fs = require('fs');
const path = require('path');

const root = process.cwd();

function mustFile(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error('[GC APP UPTIME] No encuentro ' + rel);
    process.exit(1);
  }
  return file;
}

function backup(file, original, suffix) {
  const bak = file + '.bak-' + suffix;
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, original, 'utf8');
  return bak;
}

/**
 * 1) /app: cambiar Best por Servidor online y calcular días.
 */
{
  const file = mustFile('src/pages/app.astro');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_APP_SERVER_UPTIME_V15_35_10')) {
    // Cambiar la tarjeta "Best" por uptime del servidor.
    const oldCard = `<div class="gc-app-readout-v3"><span>Best</span><strong id="gcQuickTop">--</strong><small id="gcQuickTopMeta">sin datos</small></div>`;
    const newCard = `<div class="gc-app-readout-v3 gc-app-server-uptime-v1535"><span>Servidor online</span><strong id="gcServerUptimeDays">--</strong><small id="gcServerUptimeMeta">desde primer registro</small></div>`;

    if (content.includes(oldCard)) {
      content = content.replace(oldCard, newCard);
    } else {
      // Fallback por si el HTML está formateado distinto.
      content = content.replace(
        /<div class="gc-app-readout-v3">\s*<span>Best<\/span>\s*<strong id="gcQuickTop">--<\/strong>\s*<small id="gcQuickTopMeta">sin datos<\/small>\s*<\/div>/,
        newCard
      );
    }

    // Insertar función renderServerUptime.
    const helper = `      /* GC_APP_SERVER_UPTIME_V15_35_10 START */
      function renderServerUptime(originCandidates, recentData, bestData){
        const candidateGroups = Array.isArray(originCandidates) ? originCandidates : [originCandidates];
        const rows = [
          ...candidateGroups.flatMap((data) => items(data)),
          ...items(recentData),
          ...items(bestData),
        ].filter(Boolean);

        const timestamps = rows
          .map((row) => lapDate(row))
          .filter((ms) => Number.isFinite(ms) && ms > 0)
          .sort((a, b) => a - b);

        const firstMs = timestamps[0];

        if (!firstMs) {
          setText('gcServerUptimeDays', '--');
          setText('gcServerUptimeMeta', 'sin fecha base');
          return;
        }

        const now = Date.now();
        const diffMs = Math.max(0, now - firstMs);
        const days = Math.max(1, Math.floor(diffMs / 86400000) + 1);
        const firstDate = new Date(firstMs).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit' });

        setText('gcServerUptimeDays', String(days));
        setText('gcServerUptimeMeta', \`desde \${firstDate}\`);
      }
      /* GC_APP_SERVER_UPTIME_V15_35_10 END */

`;

    if (!content.includes('function renderServerUptime(originCandidates, recentData, bestData)')) {
      const anchor = content.indexOf('function renderStracker(');
      if (anchor === -1) {
        console.error('[GC APP UPTIME] No encuentro renderStracker para insertar renderServerUptime.');
        process.exit(1);
      }
      content = content.slice(0, anchor) + helper + content.slice(anchor);
    }

    // Insertar lectura del primer dato de BD/laps después de combosData.
    const combosDataLine = `        const combosData = items(combos).length ? combos : combosFallback;`;
    const originFetch = `        const serverOriginCandidates = await Promise.all([
          fetchJson('/api/laps?limit=1&sort=oldest&valid=all').catch(() => null),
          fetchJson('/api/laps?limit=1&sort=asc&valid=all').catch(() => null),
          fetchJson('/api/laps?limit=1&order=asc&valid=all').catch(() => null),
        ]);`;

    if (!content.includes('const serverOriginCandidates = await Promise.all')) {
      if (!content.includes(combosDataLine)) {
        console.error('[GC APP UPTIME] No encuentro const combosData para insertar serverOriginCandidates.');
        process.exit(1);
      }
      content = content.replace(combosDataLine, combosDataLine + '\n' + originFetch);
    }

    // Llamar renderServerUptime después de renderLapReadout.
    if (!content.includes('renderServerUptime(serverOriginCandidates, recentLaps, bestHotlaps);')) {
      const call = `        renderLapReadout(bestHotlaps, recentLaps);`;
      if (content.includes(call)) {
        content = content.replace(call, call + `\n        renderServerUptime(serverOriginCandidates, recentLaps, bestHotlaps);`);
      } else {
        const callRegex = /renderLapReadout\([^\n;]*\);\s*/;
        const match = content.match(callRegex);
        if (!match || match.index === undefined) {
          console.error('[GC APP UPTIME] No encuentro renderLapReadout para llamar renderServerUptime.');
          process.exit(1);
        }
        const insertAt = match.index + match[0].length;
        content = content.slice(0, insertAt) + `        renderServerUptime(serverOriginCandidates, recentLaps, bestHotlaps);\n` + content.slice(insertAt);
      }
    }

    // Dejar las llamadas viejas a gcQuickTop sin efecto o quitarlas para que no haya ruido.
    content = content.replace(/\n\s*setText\('gcQuickTop', best \? lapTime\(best\) : '--'\);\s*/g, '\n');
    content = content.replace(/\n\s*setText\('gcQuickTopMeta', best \? \[driverName\(best\), carName\(best\), trackName\(best\)\]\.filter\(Boolean\)\.join\(' · '\) : 'sin datos'\);\s*/g, '\n');

    const css = `
    /* GC_APP_SERVER_UPTIME_V15_35_10_STYLE */
    .gc-app-server-uptime-v1535 strong{
      font-variant-numeric:tabular-nums;
    }

    .gc-app-server-uptime-v1535 small{
      color:color-mix(in srgb,var(--text,#f2fff0) 52%,var(--muted));
    }
`;

    if (!content.includes('GC_APP_SERVER_UPTIME_V15_35_10_STYLE')) {
      const close = '  </style>';
      if (!content.includes(close)) {
        console.error('[GC APP UPTIME] No encuentro cierre </style>.');
        process.exit(1);
      }
      content = content.replace(close, css + '\n' + close);
    }
  }

  if (content !== original) {
    backup(file, original, 'v15-35-10-server-uptime');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP UPTIME] Actualizado src/pages/app.astro');
  } else {
    console.log('[GC APP UPTIME] Sin cambios en app.astro');
  }
}

/**
 * 2) Quitar fondo/recuadro del logo en app.
 */
{
  const file = mustFile('src/styles/global.css');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_LOGO_CLEAN_V15_35_10_APP')) {
    const css = `

/* GC_LOGO_CLEAN_V15_35_10_APP */
.gc-brand__mark.gc-brand__mark--logo{
  width:48px;
  height:48px;
  background:transparent!important;
  box-shadow:none!important;
  color:inherit!important;
  border-radius:0!important;
  overflow:visible!important;
}

.gc-brand__mark.gc-brand__mark--logo img{
  width:48px;
  height:48px;
  object-fit:contain;
  filter:drop-shadow(0 0 14px color-mix(in srgb,var(--accent,#9dff00) 20%,transparent));
}
`;
    content += css;
  }

  if (content !== original) {
    backup(file, original, 'v15-35-10-logo-clean-app');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP UPTIME] Actualizado src/styles/global.css');
  } else {
    console.log('[GC APP UPTIME] Sin cambios en global.css');
  }
}

/**
 * 3) Quitar fondo/recuadro del logo en web pública.
 */
{
  const file = mustFile('src/styles/marketing.css');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_LOGO_CLEAN_V15_35_10_PUBLIC')) {
    const css = `

/* GC_LOGO_CLEAN_V15_35_10_PUBLIC */
.gc-public-brand-mark.gc-public-brand-mark--logo{
  width:42px;
  height:42px;
  background:transparent!important;
  box-shadow:none!important;
  color:inherit!important;
  border-radius:0!important;
  overflow:visible!important;
}

.gc-public-brand-mark.gc-public-brand-mark--logo img{
  width:42px;
  height:42px;
  object-fit:contain;
  filter:drop-shadow(0 0 14px rgba(155,245,66,.18));
}
`;
    content += css;
  }

  if (content !== original) {
    backup(file, original, 'v15-35-10-logo-clean-public');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP UPTIME] Actualizado src/styles/marketing.css');
  } else {
    console.log('[GC APP UPTIME] Sin cambios en marketing.css');
  }
}

console.log('[GC APP UPTIME] Listo. Ejecuta npm run build');
