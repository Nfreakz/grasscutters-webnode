import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4C_ACSM_LIVE_ACTIVE_COMBO_V1';
const files = {
  home: 'src/pages/index.astro',
  live: 'src/server/gc-acsm-live-test-routes.ts',
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4c-acsm-live-active-combo-${stamp}`);
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

function insertBeforeRequired(text, anchor, block, label) {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
}

// 1. ACSM live: esperar brevemente a que llegue el snapshot inicial.
{
  const relativePath = files.live;
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4C] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    const waitHelpers = `/* ${marker} */
function liveSnapshotWaitMs(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2200;
  return Math.max(0, Math.min(5000, Math.round(parsed)));
}

async function waitForLiveSnapshot(sourceKey: AcsmSourceKey, timeoutMs = 2200) {
  const state = getState(sourceKey);
  await ensureSocket(sourceKey);

  if (state.normalized?.session?.track || timeoutMs <= 0) return state;

  const startedAt = Date.now();
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const ready = Boolean(state.normalized?.session?.track);
      const expired = Date.now() - startedAt >= timeoutMs;
      if (!ready && !expired) return;
      clearInterval(timer);
      resolve();
    }, 50);
  });

  return state;
}`;

    next = insertBeforeRequired(
      next,
      'function queryBool(value: unknown) {',
      waitHelpers,
      'el helper queryBool del live ACSM'
    );

    next = replaceRequired(
      next,
      `    try {
      await ensureSocket(sourceKey);
      res.setHeader('Cache-Control', 'no-store');
      res.json(publicState(state, { raw: queryBool(req.query.raw) }));`,
      `    try {
      await waitForLiveSnapshot(sourceKey, liveSnapshotWaitMs(req.query.waitMs));
      res.setHeader('Cache-Control', 'no-store');
      res.json(publicState(state, { raw: queryBool(req.query.raw) }));`,
      'la espera del endpoint snapshot'
    );

    next = replaceRequired(
      next,
      `    lastPositionDropReason: state.lastPositionDropReason,
    debug: debugState(state)`,
      `    lastPositionDropReason: state.lastPositionDropReason,
    comboAuthority: {
      source: 'acsm-live',
      available: Boolean(state.connected && state.normalized?.session?.track),
      trackCode: state.normalized?.session?.track || null,
      trackConfig: state.normalized?.session?.trackConfig || null,
      receivedAt: state.normalized?.receivedAt || state.lastEventAt || null
    },
    debug: debugState(state)`,
      'el diagnóstico de autoridad live'
    );

    save(relativePath, original, next);
  }
}

// 2. Portada: ACSM live pasa a ser la única autoridad del combo actual.
{
  const relativePath = files.home;
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4C] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    next = replaceRequired(
      next,
      `      const PACK = 'bootstrap-2.3-live-championship-combo';`,
      `      const PACK = 'bootstrap-2.4-acsm-live-authoritative';`,
      'la versión del bootstrap'
    );

    next = replaceRequired(
      next,
      `      const lastGood: { bootstrap: any; championships: Record<string, any> } = { bootstrap: null, championships: {} };`,
      `      const lastGood: { bootstrap: any; championships: Record<string, any>; live: Record<string, any> } = { bootstrap: null, championships: {}, live: {} };`,
      'el estado lastGood'
    );

    const liveOverlayHelpers = `      /* ${marker} */
      const acsmLiveSourcePayload = (source: 'main' | 'gt4', snapshot: any): any | null => {
        const normalized = snapshot?.normalized;
        const session = normalized?.session || {};
        const trackInfo = normalized?.track || {};
        const trackCode = String(session.track || '').trim();
        const trackConfig = String(session.trackConfig || '').trim();
        const connected = snapshot?.connected === true;

        if (!connected || !trackCode) return null;

        const trackDisplay = cleanPublicName(trackInfo.name || trackCode, source);
        const receivedAt = snapshot.lastEventAt || normalized.receivedAt || new Date().toISOString();
        const rawTimes = Array.isArray(normalized.storedTimes) ? normalized.storedTimes : [];
        const rawSlots = Array.isArray(normalized.carSlots) ? normalized.carSlots : [];

        const rows = rawTimes
          .map((row: any) => ({
            ...row,
            sourceKey: source,
            source: source,
            driverName: row.driverName || row.name || '--',
            carName: row.carName || row.carModel || '--',
            carCode: row.carModel || row.carName || '',
            trackName: trackDisplay,
            trackCode,
            trackConfig,
            lapTimeMs: row.bestLapMs,
            bestLapMs: row.bestLapMs,
            valid: true,
            timestamp: receivedAt,
            sessionType: session.typeLabel || 'ACSM live'
          }))
          .filter((row: any) => Number.isFinite(Number(row.bestLapMs)))
          .sort((left: any, right: any) => Number(left.bestLapMs) - Number(right.bestLapMs));

        const carsByKey = new Map<string, any>();
        const rememberCar = (codeValue: unknown, nameValue: unknown) => {
          const code = String(codeValue || nameValue || '').trim();
          const name = cleanPublicName(nameValue || code, source);
          const key = normalize(code || name);
          if (!key || carsByKey.has(key)) return;
          carsByKey.set(key, {
            code,
            rawCode: code,
            name,
            displayName: name,
            publicName: name
          });
        };

        rawTimes.forEach((row: any) => rememberCar(row.carModel, row.carName || row.carModel));
        rawSlots.forEach((row: any) => rememberCar(row.carModel || row.carName, row.carName || row.carModel));
        const cars = [...carsByKey.values()];
        const driverCount = new Set(rows.map((row: any) => normalize(row.driverName)).filter(Boolean)).size;
        const totalLaps = rows.reduce((total: number, row: any) => total + (Number(row.laps) || 0), 0);
        const imageAliases = [
          trackConfig ? \`${'${trackCode}_${trackConfig}'}\` : '',
          trackCode,
          trackDisplay
        ].filter(Boolean);

        const activeCombo = {
          __gcAcsmLive: true,
          __gcComboAuthority: 'acsm-live',
          sourceKey: source,
          source,
          receivedAt,
          track: {
            code: trackCode,
            rawCode: trackCode,
            trackCode,
            trackConfig,
            layout: trackConfig,
            familyKey: trackConfig ? \`${'${trackCode}_${trackConfig}'}\` : trackCode,
            rawName: trackCode,
            name: trackDisplay,
            displayName: trackDisplay,
            publicName: trackDisplay,
            city: trackInfo.city || '',
            country: trackInfo.country || ''
          },
          trackCode,
          trackRaw: trackCode,
          trackName: trackDisplay,
          trackImage: { aliases: imageAliases },
          cars,
          carSummary: cars.map((car: any) => car.displayName).join(' / '),
          carsCount: cars.length,
          driversCount: driverCount,
          totalLaps,
          validLaps: rows.length,
          bestLap: rows[0] || null,
          latestLap: rows[0] || null,
          leaderboard: rows
        };

        return {
          ok: true,
          source: \`acsm-live:\${source}\`,
          sourceKey: source,
          activeCombo,
          leaderboard: rows,
          diagnostics: {
            activeComboAuthority: 'acsm-live',
            liveAvailable: true,
            connected,
            trackCode,
            trackConfig,
            receivedAt,
            storedTimes: rows.length,
            cars: cars.length
          }
        };
      };

      const mergeBootstrapWithAcsmLive = (bootstrap: any, live: Record<string, any>) => {
        const mergeSource = (source: 'main' | 'gt4') => {
          const historical = bootstrap?.[source] || {};
          const livePayload = live[source] || null;
          if (livePayload) {
            return {
              ...historical,
              ...livePayload,
              diagnostics: {
                ...(historical.diagnostics || {}),
                ...(livePayload.diagnostics || {})
              }
            };
          }

          // Sin ACSM live no reutilizamos el último bucket histórico como combo actual.
          return {
            ...historical,
            activeCombo: null,
            leaderboard: [],
            diagnostics: {
              ...(historical.diagnostics || {}),
              activeComboAuthority: 'acsm-live',
              liveAvailable: false,
              staleHistoricalComboSuppressed: true
            }
          };
        };

        return {
          ...bootstrap,
          source: \`${'${bootstrap?.source || \'home-bootstrap\'}'}+acsm-live-authoritative\`,
          main: mergeSource('main'),
          gt4: mergeSource('gt4'),
          comboAuthority: 'acsm-live'
        };
      };

      const fetchAcsmLiveSource = async (source: 'main' | 'gt4') => {
        try {
          const payload = await fetchJson(
            \`/api/gc/live-test/snapshot?source=\${encodeURIComponent(source)}&waitMs=2200&t=\${Date.now()}\`,
            6000
          );
          const normalized = acsmLiveSourcePayload(source, payload);
          if (normalized) lastGood.live[source] = normalized;
          return normalized;
        } catch (error) {
          console.warn(\`[GC Home \${PACK}] ACSM live no disponible\`, source, error);
          return null;
        }
      };

      const sourceUsesAcsmLive = (payload: any): boolean =>
        String(payload?.diagnostics?.activeComboAuthority || '') === 'acsm-live';`;

    next = insertBeforeRequired(
      next,
      `      const setImageWithFallbacks = (img: HTMLImageElement | null, candidates: string[], fallback = FALLBACK_TRACK): void => {`,
      liveOverlayHelpers,
      'el helper setImageWithFallbacks'
    );

    next = replaceRequired(
      next,
      `        const combo = activeCombo(payload?.main) || activeCombo(payload?.gt4) || null;
        if (!combo) return;
        setImageWithFallbacks(img, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);`,
      `        const combo = activeCombo(payload?.main) || activeCombo(payload?.gt4) || null;
        if (!combo) {
          setImageWithFallbacks(img, [], FALLBACK_TRACK);
          return;
        }
        setImageWithFallbacks(img, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);`,
      'el fallback de imagen del héroe'
    );

    next = replaceRequired(
      next,
      `      const heroCandidates = (payload: any) => ([
        { source: 'main', payload: payload?.main, rows: sourceLeaderboard(payload?.main) },
        { source: 'gt4', payload: payload?.gt4, rows: sourceLeaderboard(payload?.gt4) }
      ].filter((item) => item?.payload?.activeCombo || item.rows.length));`,
      `      const heroCandidates = (payload: any) => ([
        {
          source: 'main',
          payload: payload?.main,
          rows: sourceLeaderboard(payload?.main),
          scheduled: Boolean(championshipEventForSource('weekly'))
        },
        {
          source: 'gt4',
          payload: payload?.gt4,
          rows: sourceLeaderboard(payload?.gt4),
          scheduled: Boolean(championshipEventForSource('gt4'))
        }
      ].filter((item) => item?.payload?.activeCombo || item.rows.length || item.scheduled));`,
      'los candidatos del héroe'
    );

    next = replaceRequired(
      next,
      `        if (!candidates.length) return;`,
      `        if (!candidates.length) {
          setText('[data-home2-hero-source]', 'ACSM LIVE');
          setText('[data-home2-track]', 'Servidor sin información');
          setText('[data-home2-cars]', 'Esperando el combo actual');
          setText('[data-home2-best-driver]', '--');
          setText('[data-home2-best-car]', '--');
          setText('[data-home2-best-time]', '--');
          qa('[data-home2-best-avatar]').forEach((img) => { img.src = DEFAULT_AVATAR; });
          return;
        }`,
      'el estado vacío del héroe'
    );

    next = replaceRequired(
      next,
      `        const renderedMain = renderRanking('[data-home2-combo-ranking]', mainRows, true);
        const renderedGt4 = renderRanking('[data-home2-combo-ranking-gt4]', gt4Rows, true);`,
      `        const renderedMain = renderRanking('[data-home2-combo-ranking]', mainRows, !sourceUsesAcsmLive(payload?.main));
        const renderedGt4 = renderRanking('[data-home2-combo-ranking-gt4]', gt4Rows, !sourceUsesAcsmLive(payload?.gt4));`,
      'el vaciado de rankings antiguos'
    );

    const oldRefresh = `          const stamp = Date.now();
          const bootstrap = await fetchJson(\`/api/gc/home-bootstrap?mainLimit=8&gt4Limit=8&timingLimit=8&home=1&t=\${stamp}\`, 15000);
          if (seq !== runSeq) return;
          if (!bootstrap?.ok) throw new Error(bootstrap?.message || 'Home bootstrap no disponible');
          lastGood.bootstrap = bootstrap;
          const rendered = applyBootstrap(bootstrap);
          const championships = await Promise.all([loadChampionship('weekly'), loadChampionship('gt4')]);
          renderHeroFromState();
          renderPulse(bootstrap);
          renderRanking('[data-home2-combo-ranking]', sourceLeaderboard(bootstrap?.main), true);
          renderRanking('[data-home2-combo-ranking-gt4]', sourceLeaderboard(bootstrap?.gt4), true);
          console.info(\`[GC Home \${PACK}]\`, {
            bootstrap: bootstrap.source,
            latencyMs: bootstrap.latencyMs,
            mainActive: bootstrap.main?.diagnostics?.activeComboKey,
            gt4Active: bootstrap.gt4?.diagnostics?.activeComboKey,
            ...rendered,
            championships
          });`;

    const newRefresh = `          const stamp = Date.now();
          const [historicalBootstrap, liveMain, liveGt4] = await Promise.all([
            fetchJson(\`/api/gc/home-bootstrap?mainLimit=8&gt4Limit=8&timingLimit=8&home=1&t=\${stamp}\`, 15000),
            fetchAcsmLiveSource('main'),
            fetchAcsmLiveSource('gt4')
          ]);
          if (seq !== runSeq) return;
          if (!historicalBootstrap?.ok) throw new Error(historicalBootstrap?.message || 'Home bootstrap no disponible');

          const bootstrap = mergeBootstrapWithAcsmLive(historicalBootstrap, {
            main: liveMain,
            gt4: liveGt4
          });

          lastGood.bootstrap = bootstrap;
          const rendered = applyBootstrap(bootstrap);
          const championships = await Promise.all([loadChampionship('weekly'), loadChampionship('gt4')]);
          renderHeroFromState();
          renderPulse(bootstrap);
          renderRanking(
            '[data-home2-combo-ranking]',
            sourceLeaderboard(bootstrap?.main),
            !sourceUsesAcsmLive(bootstrap?.main)
          );
          renderRanking(
            '[data-home2-combo-ranking-gt4]',
            sourceLeaderboard(bootstrap?.gt4),
            !sourceUsesAcsmLive(bootstrap?.gt4)
          );

          document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-v1';
          console.info(\`[GC Home \${PACK}]\`, {
            bootstrap: bootstrap.source,
            latencyMs: historicalBootstrap.latencyMs,
            comboAuthority: bootstrap.comboAuthority,
            mainLiveTrack: liveMain?.diagnostics?.trackCode || null,
            mainLiveLayout: liveMain?.diagnostics?.trackConfig || null,
            gt4LiveTrack: liveGt4?.diagnostics?.trackCode || null,
            gt4LiveLayout: liveGt4?.diagnostics?.trackConfig || null,
            ...rendered,
            championships
          });`;

    next = replaceRequired(next, oldRefresh, newRefresh, 'la carga combinada de bootstrap y ACSM live');

    next = replaceRequired(
      next,
      `      document.documentElement.dataset.gcHomeChampionshipLiveCombo = 'v1';`,
      `      document.documentElement.dataset.gcHomeChampionshipLiveCombo = 'v2-acsm-live';
      document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-v1';`,
      'el marcador de autoridad del DOM'
    );

    save(relativePath, original, next);
  }
}

console.log('');
console.log('[GC Phase 4C] ACSM live configurado como autoridad del combo actual.');
console.log(`[GC Phase 4C] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Phase 4C] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('El último combo histórico ya no se usa como combo activo.');
console.log('Sin vueltas en el combo nuevo, la tabla se vacía y muestra “Sin vueltas para el combo activo”.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
