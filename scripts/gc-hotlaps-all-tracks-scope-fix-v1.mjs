#!/usr/bin/env node
/*
  GC_HOTLAPS_ALL_TRACKS_SCOPE_FIX_v1

  Local patcher. No toca GitHub.

  Corrige el bug de /hotlaps donde solo aparece Mugello:
  - frontend pedía /api/gc/leaderboard?scope=all&limit=3000
  - backend solo trataba scope=global como global
  - scope=all caía a activeCombo, por eso solo devolvía el combo activo

  Este pack:
  1) hace que /api/gc/leaderboard acepte scope=all/global/history/full como global;
  2) para scope global/all devuelve items top-level con todas las vueltas filtradas;
  3) cambia hotlaps.astro para pedir scope=global&valid=all.

  Ejecutar desde raíz:
    node scripts/gc-hotlaps-all-tracks-scope-fix-v1.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'hotlaps-all-tracks-scope-fix-v1', stamp);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function full(rel) {
  return path.join(rootDir, rel);
}

function read(rel) {
  const p = full(rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function backup(rel, content) {
  const dest = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(rel, before, after) {
  if (before === after) {
    report.unchanged.push(rel);
    return false;
  }
  backup(rel, before);
  fs.writeFileSync(full(rel), after, 'utf8');
  report.changed.push(rel);
  return true;
}

function patchHotlapsFrontend() {
  const rel = 'src/pages/hotlaps.astro';
  let content = read(rel);
  const before = content;

  content = content.split('/api/gc/leaderboard?scope=all&limit=3000')
    .join('/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000');

  // Remove possible old marker if any and add a visible runtime marker.
  if (!content.includes('GC_HOTLAPS_ALL_TRACKS_SCOPE_FIX_V1_FRONTEND')) {
    content = content.replace(
      "document.documentElement.dataset.gcHotlapsRuntime = 'data-core-all-laps-v1';",
      "document.documentElement.dataset.gcHotlapsRuntime = 'data-core-all-laps-v1';\n      document.documentElement.dataset.gcHotlapsAllTracksScopeFix = 'v1';"
    );
  }

  writeIfChanged(rel, before, content);
}

function leaderboardRouteReplacement() {
  return `app.get('/api/gc/leaderboard', async (req, res) => {
  try {
    /* GC_HOTLAPS_ALL_TRACKS_SCOPE_FIX_V1_BACKEND */
    await readDisplayNameStoreAsync();

    const rawScope = getQueryString(req, 'scope', 'activeCombo').toLowerCase();
    const globalScopes = ['global', 'all', 'history', 'historico', 'histórico', 'full', 'complete', 'completo'];
    const scope = globalScopes.includes(rawScope) ? 'global' : 'activeCombo';
    const wantsRawGlobal = scope === 'global';
    const limit = gcDataCoreQueryNumber(req, 'limit', wantsRawGlobal ? 3000 : 30, 1, 5000);

    if (wantsRawGlobal) {
      const stracker = getSafeStrackerOrRespond(res);
      if (!stracker?.resolvedPath) return;

      const laps = await readJoinedLaps(stracker.resolvedPath);
      const filtered = filterLaps(laps, req, { validOnly: false });
      const groupMode = getQueryString(req, 'group', 'all').toLowerCase();
      const rows = makeBestHotlaps(filtered, groupMode === 'driver' ? 'driver' : 'all').slice(0, limit);
      const items = rows.map((lap) => compactLapForCombo(lap));

      const validRows = filtered.filter((lap) => lap.valid);
      const tracks = new Set(filtered.map((lap) => String(lap.track?.id ?? lap.track?.name ?? '')).filter(Boolean));
      const cars = new Set(filtered.map((lap) => String(lap.car?.id ?? lap.car?.name ?? '')).filter(Boolean));
      const drivers = new Set(filtered.map((lap) => String(lap.driver?.id ?? lap.driver?.name ?? '')).filter(Boolean));
      const bestLap = validRows.slice().sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] || null;
      const latestLap = filtered.slice().sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))[0] || null;

      res.json({
        ok: true,
        mode: 'gc-data-core-v1',
        generatedAt: new Date().toISOString(),
        source: 'gc-hotlaps-all-tracks-scope-fix-v1',
        scope,
        requestedScope: rawScope,
        stracker,
        count: items.length,
        total: items.length,
        totalFilteredLaps: filtered.length,
        totalLaps: laps.length,
        items,
        hotlaps: items,
        laps: items,
        leaderboard: items,
        data: {
          activeCombo: null,
          leaderboard: items,
          laps: items,
          items,
          stats: {
            totalLaps: filtered.length,
            visibleLaps: items.length,
            validLaps: validRows.length,
            invalidLaps: Math.max(0, filtered.length - validRows.length),
            driversCount: drivers.size,
            carsCount: cars.size,
            tracksCount: tracks.size,
            bestLap: bestLap ? compactLapForCombo(bestLap) : null,
            latestLap: latestLap ? compactLapForCombo(latestLap) : null
          }
        },
        filters: summarizeFilters(req),
        message: 'Hotlaps globales generadas desde stracker.db3. scope=all/global devuelve histórico completo.'
      });
      return;
    }

    const payload = await buildGcDataCorePayload(req, {
      scope,
      recentLimit: 1,
      leaderboardLimit: limit
    });

    const leaderboard = payload.data?.leaderboard || [];

    res.json({
      ok: payload.ok,
      mode: payload.mode,
      generatedAt: payload.generatedAt,
      source: payload.source,
      scope,
      requestedScope: rawScope,
      stracker: payload.stracker,
      count: Array.isArray(leaderboard) ? leaderboard.length : 0,
      items: leaderboard,
      hotlaps: leaderboard,
      laps: leaderboard,
      leaderboard,
      data: payload.data ? {
        activeCombo: payload.data.activeCombo,
        leaderboard: payload.data.leaderboard,
        items: payload.data.leaderboard,
        laps: payload.data.leaderboard,
        stats: payload.data.scopedStats
      } : null,
      message: payload.ok ? 'Leaderboard canónico generado desde GC Data Core.' : payload.message
    });
  } catch (error) {
    console.error('[GC DATA CORE] /api/gc/leaderboard:', error);
    res.status(200).json({ ok: false, mode: 'gc-data-core-v1', data: null, items: [], laps: [], hotlaps: [], leaderboard: [], message: 'No se pudo generar el leaderboard canónico.' });
  }
});`;
}

function patchServerLeaderboard() {
  const rel = 'src/server/index.ts';
  let content = read(rel);
  const before = content;

  if (content.includes('GC_HOTLAPS_ALL_TRACKS_SCOPE_FIX_V1_BACKEND')) {
    report.unchanged.push(`${rel} backend marker already present`);
    return;
  }

  const regex = /app\.get\('\/api\/gc\/leaderboard', async \(req, res\) => \{[\s\S]*?\n\}\);\n\n\n\/\* GC_DATA_CORE_LAB_FIXES_V1_START \*\//;

  if (!regex.test(content)) {
    report.errors.push('No se pudo localizar el bloque exacto app.get(/api/gc/leaderboard) en src/server/index.ts');
    return;
  }

  content = content.replace(
    regex,
    leaderboardRouteReplacement() + "\n\n\n/* GC_DATA_CORE_LAB_FIXES_V1_START */"
  );

  writeIfChanged(rel, before, content);
}

function main() {
  console.log('');
  console.log('GC Hotlaps All Tracks Scope Fix v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    patchHotlapsFrontend();
    patchServerLeaderboard();
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
  console.log('Prueba API:');
  console.log('  http://localhost:4321/api/gc/leaderboard?scope=global&valid=all&group=all&limit=3000');
  console.log('');
  console.log('Prueba UI:');
  console.log('  /hotlaps');
  console.log('');
  console.log('Resultado esperado:');
  console.log('  El selector Circuito debe listar todos los circuitos detectados, no solo Mugello.');
  console.log('');
}

main();
