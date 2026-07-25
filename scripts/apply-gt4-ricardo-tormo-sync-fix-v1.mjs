import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_GT4_RICARDO_TORMO_SYNC_FIX_V1';

const files = {
  matcher: path.join(process.cwd(), 'src', 'server', 'gc-ratings', 'acsmMatcher.ts'),
  utils: path.join(process.cwd(), 'src', 'server', 'gc-ratings', 'utils.ts'),
  stracker: path.join(process.cwd(), 'src', 'server', 'gc-ratings', 'strackerReader.ts'),
  ratings: path.join(process.cwd(), 'src', 'server', 'gc-ratings', 'ratingService.ts'),
  championship: path.join(process.cwd(), 'src', 'server', 'acsm-championship-routes.ts')
};

for (const [key, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    console.error(`[${PACK}] Falta ${key}: ${file}`);
    process.exit(1);
  }
}

const contents = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')])
);

if (Object.values(contents).some((content) => content.includes(PACK))) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
for (const [key, file] of Object.entries(files)) {
  fs.copyFileSync(file, path.join(backupDir, `${key}.${Date.now()}.bak`));
}

/* -------------------------------------------------------------------------- */
/* 1. Canonicalización de Ricardo Tormo / Valencia / Cheste                    */
/* -------------------------------------------------------------------------- */

let utils = contents.utils;

const normalizeTrackOld = `export function normalizeTrack(value: unknown) {
  return slugify(value)
    .replace(/^(fn|ks|rt|mx|acu|nrms)_/, '')
    .replace(/_?(circuit|circuito|track|spain|italy|italia)$/g, '');
}`;

const normalizeTrackNew = `export function normalizeTrack(value: unknown) {
  const normalized = slugify(value)
    .replace(/^(fn|ks|rt|mx|acu|nrms)_/, '')
    .replace(/_?(circuit|circuito|track|spain|italy|italia)$/g, '');

  // ${PACK}: ACSM y sTracker pueden nombrar el mismo circuito como
  // Ricardo Tormo, Valencia o Cheste. Todos deben producir una clave única.
  const aliases: Record<string, string> = {
    ricardo_tormo: 'ricardo_tormo',
    circuit_ricardo_tormo: 'ricardo_tormo',
    circuito_ricardo_tormo: 'ricardo_tormo',
    circuit_de_ricardo_tormo: 'ricardo_tormo',
    circuit_de_la_comunitat_valenciana_ricardo_tormo: 'ricardo_tormo',
    circuito_de_la_comunitat_valenciana_ricardo_tormo: 'ricardo_tormo',
    comunitat_valenciana_ricardo_tormo: 'ricardo_tormo',
    valencia: 'ricardo_tormo',
    valencia_gp: 'ricardo_tormo',
    cheste: 'ricardo_tormo',
    circuit_valencia: 'ricardo_tormo',
    circuito_valencia: 'ricardo_tormo'
  };

  if (aliases[normalized]) return aliases[normalized];

  if (
    normalized.includes('ricardo_tormo') ||
    normalized.includes('comunitat_valenciana') ||
    normalized === 'valencia' ||
    normalized.includes('valencia_gp') ||
    normalized === 'cheste'
  ) {
    return 'ricardo_tormo';
  }

  return normalized;
}`;

if (!utils.includes(normalizeTrackOld)) {
  console.error(`[${PACK}] No se encontró normalizeTrack() esperado.`);
  process.exit(2);
}
utils = utils.replace(normalizeTrackOld, normalizeTrackNew);

/* -------------------------------------------------------------------------- */
/* 2. Matching ACSM ↔ sTracker no bloqueante por nombre de circuito            */
/* -------------------------------------------------------------------------- */

let matcher = contents.matcher;

const matcherBlock = /function eventTrackKeys\(event: PlainObject\) \{[\s\S]*?export function identifyRaceSession\(event: PlainObject, sessions: PlainObject\[\]\) \{[\s\S]*?\n\}/;

const matcherReplacement = `function eventTrackKeys(event: PlainObject) {
  return [...new Set(
    [event.trackRaw, event.track, event.trackSlug, event.name]
      .map(normalizeTrack)
      .filter(Boolean)
  )];
}

function sessionTrackKeys(session: PlainObject) {
  return [...new Set(
    [session.Track, session.UiTrackName]
      .map(normalizeTrack)
      .filter(Boolean)
  )];
}

function trackMatchQuality(event: PlainObject, session: PlainObject) {
  const eventKeys = eventTrackKeys(event);
  const sessionKeys = sessionTrackKeys(session);
  if (!eventKeys.length || !sessionKeys.length) return 0;

  for (const eventKey of eventKeys) {
    for (const sessionKey of sessionKeys) {
      if (eventKey === sessionKey) return 3;
      if (eventKey.includes(sessionKey) || sessionKey.includes(eventKey)) return 2;
    }
  }

  return -1;
}

export function identifyRaceSession(event: PlainObject, sessions: PlainObject[]) {
  const targetMs = sessionTimeMs(event.completedAt || event.scheduledAt || event.startedAt || event.date);
  const officialRows = Array.isArray(event.raceResults) ? event.raceResults : [];
  const officialDriverCount = officialRows.length;
  const officialLapTotal = officialRows.reduce((sum, row) => sum + numberValue(row.numLaps, 0), 0);

  const ranked = sessions
    .map((session) => {
      const startMs = numberValue(session.StartTimeDate, 0) * 1000;
      const timeDiffSeconds = targetMs && startMs
        ? Math.round(Math.abs(startMs - targetMs) / 1000)
        : 0;
      const driverDiff = officialDriverCount
        ? Math.abs(numberValue(session.PlayerCount, 0) - officialDriverCount)
        : 0;
      const lapDiff = officialLapTotal
        ? Math.abs(numberValue(session.LapCount, 0) - officialLapTotal)
        : 0;
      const trackQuality = trackMatchQuality(event, session);

      const trackAdjustment = trackQuality === 3
        ? -7200
        : trackQuality === 2
          ? -3600
          : trackQuality === 0
            ? 0
            : 21600;

      const score =
        timeDiffSeconds +
        driverDiff * 180 +
        lapDiff * 2 +
        trackAdjustment;

      return {
        ...session,
        _timeDiffSeconds: timeDiffSeconds,
        _driverDiff: driverDiff,
        _lapDiff: lapDiff,
        _trackMatchQuality: trackQuality,
        _matchScore: score
      };
    })
    .filter((session) =>
      !targetMs ||
      !session._timeDiffSeconds ||
      session._timeDiffSeconds <= 72 * 60 * 60
    )
    .sort((left, right) =>
      numberValue(left._matchScore, 0) - numberValue(right._matchScore, 0)
    );

  return ranked[0] || null;
}`;

if (!matcherBlock.test(matcher)) {
  console.error(`[${PACK}] No se encontró el bloque de matching actual.`);
  process.exit(3);
}
matcher = matcher.replace(matcherBlock, matcherReplacement);

/* -------------------------------------------------------------------------- */
/* 3. GT4 no puede caer silenciosamente en la DB principal                     */
/* -------------------------------------------------------------------------- */

let stracker = contents.stracker;

const candidatesOld = `  const envPath = source === 'gt4' ? (gt4EnvPath || mainEnvPath) : mainEnvPath;
  const candidates = source === 'gt4'
    ? [
        gt4EnvPath,
        path.join(process.cwd(), 'data', 'stracker', 'stracker-gt4.db3'),
        path.join(process.cwd(), 'data', 'stracker', 'gt4.db3'),
        path.join(process.cwd(), 'stracker-gt4.db3'),
        mainEnvPath,
        path.join(process.cwd(), 'data', 'stracker', 'stracker.db3'),
        path.join(process.cwd(), 'stracker.db3')
      ]
    : [
        mainEnvPath,
        path.join(process.cwd(), 'data', 'stracker', 'stracker.db3'),
        path.join(process.cwd(), 'stracker.db3')
      ];`;

const candidatesNew = `  const envPath = source === 'gt4' ? gt4EnvPath : mainEnvPath;
  const candidates = source === 'gt4'
    ? [
        gt4EnvPath,
        path.join(process.cwd(), 'data', 'stracker', 'stracker-gt4.db3'),
        path.join(process.cwd(), 'data', 'stracker', 'gt4.db3'),
        path.join(process.cwd(), 'stracker-gt4.db3')
      ]
    : [
        mainEnvPath,
        path.join(process.cwd(), 'data', 'stracker', 'stracker.db3'),
        path.join(process.cwd(), 'stracker.db3')
      ];`;

if (!stracker.includes(candidatesOld)) {
  console.error(`[${PACK}] No se encontró el fallback GT4→main esperado.`);
  process.exit(4);
}
stracker = stracker.replace(candidatesOld, candidatesNew);

/* -------------------------------------------------------------------------- */
/* 4. ACSM lastResult incorpora fecha real de carrera                          */
/* -------------------------------------------------------------------------- */

let championship = contents.championship;

const lastResultOld = `          lastResult: {
            eventId: event.id,
            eventName: event.name,
            position: row.position,
            points: row.points,
            bestLap: row.bestLap,
            numLaps: row.numLaps
          }`;

const lastResultNew = `          lastResult: {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.completedAt || event.scheduledAt || event.startedAt || null,
            position: row.position,
            points: row.points,
            bestLap: row.bestLap,
            numLaps: row.numLaps
          }`;

if (!championship.includes(lastResultOld)) {
  console.error(`[${PACK}] No se encontró lastResult ACSM.`);
  process.exit(5);
}
championship = championship.replace(lastResultOld, lastResultNew);

/* -------------------------------------------------------------------------- */
/* 5. La clasificación no debe preferir un snapshot de ratings antiguo         */
/* -------------------------------------------------------------------------- */

let ratings = contents.ratings;

const standingsOld = `    const ratingLastResult = lastOfficialResultForRating(rating);
    const acsmLastResult = row.lastResult || null;
    const lastResult = ratingLastResult || acsmLastResult || null;
    const officialWins = officialResults.length ? officialResults.filter((result) => result.position === 1).length : null;
    const officialPodiums = officialResults.length ? officialResults.filter((result) => result.position >= 1 && result.position <= 3).length : null;`;

const standingsNew = `    const ratingLastResult = lastOfficialResultForRating(rating);
    const acsmLastResult = row.lastResult || null;
    const ratingLastMs = parseDateMs(ratingLastResult?.eventDate || ratingLastResult?.processedAt);
    const acsmLastMs = parseDateMs(acsmLastResult?.eventDate || acsmLastResult?.completedAt);
    const lastResult = acsmLastResult && (!ratingLastResult || acsmLastMs >= ratingLastMs)
      ? acsmLastResult
      : ratingLastResult || acsmLastResult || null;

    // La clasificación del campeonato es ACSM-only. No sobrescribimos victorias
    // o podios actuales con un snapshot de ratings que todavía no ha procesado
    // la última carrera.
    const officialWins = row.wins ?? null;
    const officialPodiums = row.podiums ?? null;`;

if (!ratings.includes(standingsOld)) {
  console.error(`[${PACK}] No se encontró la fusión de clasificación esperada.`);
  process.exit(6);
}
ratings = ratings.replace(standingsOld, standingsNew);

/* -------------------------------------------------------------------------- */
/* Escritura                                                                  */
/* -------------------------------------------------------------------------- */

const outputs = { utils, matcher, stracker, championship, ratings };

for (const [key, content] of Object.entries(outputs)) {
  const marker = key === 'utils'
    ? `// ${PACK}`
    : content.includes(PACK)
      ? ''
      : `\n// ${PACK}\n`;

  fs.writeFileSync(files[key], marker ? content + marker : content, 'utf8');
}

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Ricardo Tormo / Valencia / Cheste canonicalizados.`);
console.log(`[${PACK}] Matching por circuito deja de bloquear sesiones válidas.`);
console.log(`[${PACK}] GT4 ya no cae silenciosamente a la DB principal.`);
console.log(`[${PACK}] Clasificación ACSM prioriza la carrera más reciente.`);
console.log(`[${PACK}] Backup: ${backupDir}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
