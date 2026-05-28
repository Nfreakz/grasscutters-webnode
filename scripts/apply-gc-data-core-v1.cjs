const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const docsDir = path.join(root, 'docs');
const docsPath = path.join(docsDir, 'GC_ENDPOINTS_MAP.md');

if (!fs.existsSync(serverPath)) {
  console.error('[GC DATA CORE] No encuentro src/server/index.ts. Ejecuta este script desde la raíz del repo.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const markerStart = '/* GC_DATA_CORE_V1_START */';
const markerEnd = '/* GC_DATA_CORE_V1_END */';

if (source.includes(markerStart)) {
  console.log('[GC DATA CORE] El bloque GC_DATA_CORE_V1 ya existe. No se vuelve a insertar.');
} else {
  const anchor = "app.get('/gc-data/hotlaps'";
  const index = source.indexOf(anchor);

  if (index === -1) {
    console.error('[GC DATA CORE] No encuentro el ancla app.get(\\'/gc-data/hotlaps\\'. Revisa src/server/index.ts.');
    process.exit(1);
  }

  const block = `
${markerStart}
/**
 * GC Data Core v1
 *
 * Objetivo:
 * - crear una capa canónica de lectura para bloques nuevos.
 * - evitar que cada página calcule por su cuenta combo activo, últimas vueltas,
 *   leaderboard, mejor vuelta y métricas globales.
 *
 * Importante:
 * - no sustituye todavía los endpoints legacy.
 * - /api/hotlaps, /api/laps, /api/combos/stats, /api/stats/overview siguen vivos.
 * - los nuevos bloques deberían consumir /api/gc/*.
 */
type GcDataCoreScope = 'global' | 'activeCombo';

function gcDataCorePositiveNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function gcDataCoreQueryNumber(req: express.Request, name: string, fallback: number, min: number, max: number) {
  return Math.max(min, Math.min(max, getQueryNumber(req, name, fallback, min, max)));
}

function gcDataCoreItems(value: any) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return value.items || value.data || value.results || value.laps || value.hotlaps || value.combos || [];
}

function gcDataCoreLapTimeMs(lap: any) {
  const raw = lap?.lapTimeMs ?? lap?.LapTime ?? lap?.lapTime ?? lap?.timeMs ?? lap?.time;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : Number.POSITIVE_INFINITY;

  const textValue = String(raw ?? '').trim();
  if (!textValue) return Number.POSITIVE_INFINITY;

  const direct = Number(textValue);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const match = textValue.match(/^(?:(\\d+):)?(\\d{1,2})(?:\\.(\\d{1,3}))?$/);
  if (!match) return Number.POSITIVE_INFINITY;

  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2] || 0);
  const millis = Number(String(match[3] || '0').padEnd(3, '0').slice(0, 3));
  return minutes * 60000 + seconds * 1000 + millis;
}

function gcDataCoreLapTimestampMs(lap: any) {
  const raw =
    lap?.timestampIso ??
    lap?.dateIso ??
    lap?.createdAt ??
    lap?.updatedAt ??
    lap?.timestamp ??
    lap?.Timestamp ??
    lap?.session?.endTimeIso ??
    lap?.session?.startTimeIso ??
    lap?.lastSeenAt;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 20000000000 ? raw : raw * 1000;
  }

  const parsed = Date.parse(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function gcDataCoreBestLap(laps: any[]) {
  return [...laps]
    .filter((lap) => lap?.valid !== false && lap?.Valid !== 0 && gcDataCoreLapTimeMs(lap) !== Number.POSITIVE_INFINITY)
    .sort((a, b) => gcDataCoreLapTimeMs(a) - gcDataCoreLapTimeMs(b) || gcDataCoreLapTimestampMs(b) - gcDataCoreLapTimestampMs(a))[0] ?? null;
}

function gcDataCoreLatestLap(laps: any[]) {
  return [...laps]
    .filter(Boolean)
    .sort((a, b) => gcDataCoreLapTimestampMs(b) - gcDataCoreLapTimestampMs(a) || gcDataCoreLapTimeMs(a) - gcDataCoreLapTimeMs(b))[0] ?? null;
}

function gcDataCoreActiveCombo(comboStats: any[]) {
  return [...comboStats]
    .filter((combo) => Number(combo?.totalLaps ?? 0) > 0)
    .sort((a, b) => {
      const recent = Number(b?.lastSeenTimestamp ?? 0) - Number(a?.lastSeenTimestamp ?? 0);
      if (recent) return recent;
      return Number(b?.totalLaps ?? 0) - Number(a?.totalLaps ?? 0);
    })[0] ?? null;
}

function gcDataCoreComboLapMatch(lap: any, combo: any) {
  if (!lap || !combo) return false;

  const comboId = Number(combo?.comboId ?? combo?.canonicalComboId ?? combo?.id);
  const lapComboId = Number(lap?.comboId ?? lap?.ComboId ?? lap?.session?.comboId);
  const memberComboIds = Array.isArray(combo?.memberComboIds)
    ? combo.memberComboIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  if (Number.isFinite(comboId) && Number.isFinite(lapComboId)) {
    return lapComboId === comboId || memberComboIds.includes(lapComboId);
  }

  const comboTrackId = Number(combo?.trackId ?? combo?.track?.id);
  const lapTrackId = Number(lap?.trackId ?? lap?.TrackId ?? lap?.track?.id);
  const comboCarIds = Array.isArray(combo?.carIds)
    ? combo.carIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : Array.isArray(combo?.cars)
      ? combo.cars.map((car: any) => Number(car?.id)).filter((id: number) => Number.isFinite(id))
      : [];
  const lapCarId = Number(lap?.carId ?? lap?.CarId ?? lap?.car?.id);

  if (Number.isFinite(comboTrackId) && Number.isFinite(lapTrackId) && comboTrackId !== lapTrackId) return false;
  if (comboCarIds.length && Number.isFinite(lapCarId) && !comboCarIds.includes(lapCarId)) return false;

  return Number.isFinite(comboTrackId) && Number.isFinite(lapTrackId);
}

function gcDataCoreLeaderboard(laps: any[], limit: number) {
  return makeBestHotlaps(laps.filter((lap) => lap?.valid !== false && lap?.Valid !== 0), 'best').slice(0, limit);
}

function gcDataCorePublicStracker(stracker: any) {
  return {
    exists: Boolean(stracker?.exists),
    validSQLite: Boolean(stracker?.validSQLite),
    sizeBytes: stracker?.sizeBytes ?? 0,
    modifiedAt: stracker?.modifiedAt ?? null
  };
}

async function buildGcDataCorePayload(req: express.Request, options: { scope?: GcDataCoreScope; recentLimit?: number; leaderboardLimit?: number } = {}) {
  const stracker = getSafeStrackerOrRespond(null as any);
  if (!stracker?.resolvedPath) {
    return {
      ok: false,
      mode: 'unavailable',
      generatedAt: new Date().toISOString(),
      source: 'stracker',
      data: null,
      message: 'stracker.db3 no está disponible.'
    };
  }

  const scope = options.scope || 'global';
  const recentLimit = gcDataCorePositiveNumber(options.recentLimit, 20);
  const leaderboardLimit = gcDataCorePositiveNumber(options.leaderboardLimit, 20);

  const [laps, comboDefinitions] = await Promise.all([
    readJoinedLaps(stracker.resolvedPath),
    getCombos(stracker.resolvedPath)
  ]);

  const comboStats = buildComboStatsFromLaps(laps, comboDefinitions);
  const activeCombo = gcDataCoreActiveCombo(comboStats);
  const scopedLaps = scope === 'activeCombo' && activeCombo
    ? laps.filter((lap: any) => gcDataCoreComboLapMatch(lap, activeCombo))
    : laps;

  const validLaps = laps.filter((lap: any) => lap?.valid !== false && lap?.Valid !== 0);
  const scopedValidLaps = scopedLaps.filter((lap: any) => lap?.valid !== false && lap?.Valid !== 0);
  const latestLap = gcDataCoreLatestLap(scopedLaps);
  const bestLap = gcDataCoreBestLap(scopedLaps);
  const recentLaps = [...scopedLaps]
    .sort((a: any, b: any) => gcDataCoreLapTimestampMs(b) - gcDataCoreLapTimestampMs(a) || gcDataCoreLapTimeMs(a) - gcDataCoreLapTimeMs(b))
    .slice(0, recentLimit);
  const leaderboard = gcDataCoreLeaderboard(scopedLaps, leaderboardLimit);

  return {
    ok: true,
    mode: 'gc-data-core-v1',
    generatedAt: new Date().toISOString(),
    source: 'stracker',
    scope,
    filters: {
      recentLimit,
      leaderboardLimit
    },
    stracker: gcDataCorePublicStracker(stracker),
    data: {
      stats: {
        totalLaps: laps.length,
        validLaps: validLaps.length,
        invalidLaps: Math.max(0, laps.length - validLaps.length),
        driversCount: new Set(laps.map((lap: any) => lap?.driver?.id ?? lap?.driver?.name)).size,
        carsCount: new Set(laps.map((lap: any) => lap?.car?.id ?? lap?.car?.name)).size,
        tracksCount: new Set(laps.map((lap: any) => lap?.track?.id ?? lap?.track?.name)).size,
        combosCount: comboStats.length
      },
      activeCombo,
      latestLap,
      bestLap,
      recentLaps,
      leaderboard,
      scopedStats: {
        totalLaps: scopedLaps.length,
        validLaps: scopedValidLaps.length,
        invalidLaps: Math.max(0, scopedLaps.length - scopedValidLaps.length),
        latestLap,
        bestLap
      }
    },
    legacy: {
      hotlaps: '/api/hotlaps',
      laps: '/api/laps',
      combosStats: '/api/combos/stats',
      overview: '/api/stats/overview'
    },
    message: scope === 'activeCombo'
      ? 'Snapshot canónico del combo activo generado desde stracker.db3.'
      : 'Snapshot canónico global generado desde stracker.db3.'
  };
}

app.get('/api/gc/snapshot', async (req, res) => {
  try {
    const payload = await buildGcDataCorePayload(req, {
      scope: getQueryString(req, 'scope', 'global') === 'activeCombo' ? 'activeCombo' : 'global',
      recentLimit: gcDataCoreQueryNumber(req, 'recentLimit', 20, 1, 100),
      leaderboardLimit: gcDataCoreQueryNumber(req, 'leaderboardLimit', 20, 1, 100)
    });
    res.status(payload.ok ? 200 : 200).json(payload);
  } catch (error) {
    console.error('[GC DATA CORE] /api/gc/snapshot:', error);
    res.status(200).json({ ok: false, mode: 'gc-data-core-v1', data: null, message: 'No se pudo generar el snapshot canónico.' });
  }
});

app.get('/api/gc/active-combo', async (req, res) => {
  try {
    const payload = await buildGcDataCorePayload(req, {
      scope: 'activeCombo',
      recentLimit: gcDataCoreQueryNumber(req, 'recentLimit', 12, 1, 50),
      leaderboardLimit: gcDataCoreQueryNumber(req, 'leaderboardLimit', 12, 1, 50)
    });

    res.json({
      ok: payload.ok,
      mode: payload.mode,
      generatedAt: payload.generatedAt,
      source: payload.source,
      stracker: payload.stracker,
      data: payload.data ? {
        activeCombo: payload.data.activeCombo,
        latestLap: payload.data.latestLap,
        bestLap: payload.data.bestLap,
        recentLaps: payload.data.recentLaps,
        leaderboard: payload.data.leaderboard,
        stats: payload.data.scopedStats
      } : null,
      message: payload.ok ? 'Combo activo canónico.' : payload.message
    });
  } catch (error) {
    console.error('[GC DATA CORE] /api/gc/active-combo:', error);
    res.status(200).json({ ok: false, mode: 'gc-data-core-v1', data: null, message: 'No se pudo generar el combo activo canónico.' });
  }
});

app.get('/api/gc/leaderboard', async (req, res) => {
  try {
    const scope = getQueryString(req, 'scope', 'activeCombo') === 'global' ? 'global' : 'activeCombo';
    const limit = gcDataCoreQueryNumber(req, 'limit', 30, 1, 200);
    const payload = await buildGcDataCorePayload(req, {
      scope,
      recentLimit: 1,
      leaderboardLimit: limit
    });

    res.json({
      ok: payload.ok,
      mode: payload.mode,
      generatedAt: payload.generatedAt,
      source: payload.source,
      scope,
      stracker: payload.stracker,
      data: payload.data ? {
        activeCombo: payload.data.activeCombo,
        leaderboard: payload.data.leaderboard,
        stats: payload.data.scopedStats
      } : null,
      message: payload.ok ? 'Leaderboard canónico generado desde GC Data Core.' : payload.message
    });
  } catch (error) {
    console.error('[GC DATA CORE] /api/gc/leaderboard:', error);
    res.status(200).json({ ok: false, mode: 'gc-data-core-v1', data: null, message: 'No se pudo generar el leaderboard canónico.' });
  }
});

app.get('/api/gc/recent-laps', async (req, res) => {
  try {
    const scope = getQueryString(req, 'scope', 'global') === 'activeCombo' ? 'activeCombo' : 'global';
    const limit = gcDataCoreQueryNumber(req, 'limit', 30, 1, 200);
    const payload = await buildGcDataCorePayload(req, {
      scope,
      recentLimit: limit,
      leaderboardLimit: 1
    });

    res.json({
      ok: payload.ok,
      mode: payload.mode,
      generatedAt: payload.generatedAt,
      source: payload.source,
      scope,
      stracker: payload.stracker,
      data: payload.data ? {
        activeCombo: payload.data.activeCombo,
        recentLaps: payload.data.recentLaps,
        latestLap: payload.data.latestLap,
        stats: payload.data.scopedStats
      } : null,
      message: payload.ok ? 'Vueltas recientes canónicas generadas desde GC Data Core.' : payload.message
    });
  } catch (error) {
    console.error('[GC DATA CORE] /api/gc/recent-laps:', error);
    res.status(200).json({ ok: false, mode: 'gc-data-core-v1', data: null, message: 'No se pudieron generar las vueltas recientes canónicas.' });
  }
});
${markerEnd}

`;

  source = source.slice(0, index) + block + '\n' + source.slice(index);
  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('[GC DATA CORE] Bloque insertado en src/server/index.ts.');
}

const docs = `# GrassCutters WebNode - GC Data Core v1

Fecha: 2026-05-28  
Pack: GC Data Core v1  
Tipo: backend / endpoints / documentación  
UI: no toca  
Assets: no toca  

## 1. Objetivo

Crear una primera capa canónica para que los nuevos bloques de la web no calculen cada uno su propia versión de:

- combo activo,
- últimas vueltas,
- mejor vuelta,
- leaderboard,
- métricas globales,
- métricas del combo activo.

Este pack no elimina endpoints antiguos. Solo añade endpoints nuevos bajo /api/gc/*.

## 2. Endpoints nuevos

### GET /api/gc/snapshot

Snapshot global o de combo activo.

Parámetros:

- scope=global | activeCombo
- recentLimit=1..100
- leaderboardLimit=1..100

Uso recomendado:

- home rediseñada,
- /pitwall,
- bloques de resumen,
- paneles tipo race bulletin.

### GET /api/gc/active-combo

Devuelve el combo activo canónico con:

- activeCombo,
- latestLap,
- bestLap,
- recentLaps,
- leaderboard,
- stats.

Uso recomendado:

- bloque "Now on track",
- combo de la semana,
- tarjetas de servidor activo.

### GET /api/gc/leaderboard

Leaderboard canónico.

Parámetros:

- scope=activeCombo | global
- limit=1..200

Uso recomendado:

- timing sheet,
- ranking compacto,
- bloques de top drivers.

### GET /api/gc/recent-laps

Vueltas recientes canónicas.

Parámetros:

- scope=global | activeCombo
- limit=1..200

Uso recomendado:

- actividad reciente,
- live feed,
- últimas vueltas del combo.

## 3. Endpoints legacy que siguen vivos

No se eliminan:

- GET /api/hotlaps
- GET /api/laps
- GET /api/combos
- GET /api/combos/stats
- GET /api/combos/:comboId
- GET /api/stats/overview
- GET /api/activity/recent

## 4. Regla nueva para futuros bloques

Un bloque nuevo NO debe calcular por su cuenta:

- último circuito activo,
- combo activo,
- mejor piloto del combo,
- total de vueltas,
- última actividad,
- leaderboard.

Debe consumir primero:

- /api/gc/snapshot
- /api/gc/active-combo
- /api/gc/leaderboard
- /api/gc/recent-laps

## 5. Archivos tocados

- src/server/index.ts
- docs/GC_ENDPOINTS_MAP.md

## 6. Archivos NO tocados

- src/pages/index.astro
- src/pages/app.astro
- src/pages/hotlaps.astro
- public/images/*
- public/og/*
- archive-media/*
- estilos CSS
- componentes UI

## 7. Comandos de prueba

\`\`\`powershell
npm run build
npm run dev
\`\`\`

Probar:

\`\`\`txt
/api/gc/snapshot
/api/gc/snapshot?scope=activeCombo
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/leaderboard?scope=global&limit=20
/api/gc/recent-laps
/api/gc/recent-laps?scope=activeCombo&limit=20
\`\`\`

## 8. Siguiente paso recomendado

Si el build pasa y los endpoints devuelven datos coherentes:

1. crear /pitwall como ruta aislada,
2. hacer que /pitwall use solo /api/gc/*,
3. comparar datos con /app y /hotlaps,
4. después adaptar /app para reducir llamadas duplicadas.

## 9. Nota técnica

Este v1 inserta el bloque directamente en src/server/index.ts porque las funciones importantes actuales no están exportadas a módulos externos:

- readJoinedLaps
- getCombos
- buildComboStatsFromLaps
- makeBestHotlaps
- getSafeStrackerOrRespond

Una fase posterior debería extraer estas funciones a un servicio real:

\`\`\`txt
src/server/data/gc-data-core.ts
src/server/data/stracker-service.ts
src/server/data/combo-service.ts
\`\`\`

Pero para este primer pack se evita una refactorización grande.
`;

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(docsPath, docs, 'utf8');
console.log('[GC DATA CORE] Documento escrito en docs/GC_ENDPOINTS_MAP.md.');
console.log('[GC DATA CORE] Terminado. Ejecuta npm run build.');
