import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function patch(relPath, transform) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[patch-hotlaps-all-laps] ${relPath} no existe. Se omite.`);
    return;
  }

  const before = fs.readFileSync(fullPath, 'utf8');
  const after = transform(before);

  if (after !== before) {
    fs.writeFileSync(fullPath, after, 'utf8');
    console.log(`[patch-hotlaps-all-laps] ${relPath} actualizado.`);
  } else {
    console.log(`[patch-hotlaps-all-laps] ${relPath} sin cambios.`);
  }
}

patch('src/server/index.ts', (source) => source.replace(
  "const scope = getQueryString(req, 'scope', 'activeCombo');",
  "const scope = getQueryString(req, 'scope', 'all');"
));

patch('src/pages/hotlaps.astro', (source) => {
  let next = source;

  next = next.replace(
    "fetch('/api/gc/leaderboard?limit=1500', { cache:'no-store', credentials:'include' })",
    "fetch('/api/gc/leaderboard?scope=all&limit=3000', { cache:'no-store', credentials:'include' })"
  );

  next = next.replaceAll('applyActiveTrack();', "if (els.track) els.track.value = 'all';");
  next = next.replaceAll("els.activeTrackButton?.addEventListener('click', () => { window.location.href = '/combos'; });", "els.activeTrackButton?.addEventListener('click', () => { window.location.href = '/combos'; });");

  return next;
});

patch('src/pages/app.astro', (source) => {
  if (source.includes('GC_APP_HOTLAPS_ALL_TRACKS_SAFE_V1')) return source;
  const marker = `\n  <script is:inline>\n    /* GC_APP_HOTLAPS_ALL_TRACKS_SAFE_V1 */\n    (() => {\n      document.documentElement.dataset.gcAppHotlapsScope = 'all-tracks';\n    })();\n  </script>\n`;
  return source.includes('</AppLayout>') ? source.replace('</AppLayout>', marker + '</AppLayout>') : source;
});

console.log('[patch-hotlaps-all-laps] OK');
