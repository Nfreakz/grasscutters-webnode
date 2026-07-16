import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2h-ratings-backend-types-${stamp}`);
const changed = [];

const files = {
  ratingService: 'src/server/gc-ratings/ratingService.ts',
  mysqlStore: 'src/server/gc-ratings/mysqlRatingStore.ts',
  routes: 'src/server/gc-ratings/routes.ts',
  collisionTest: 'src/server/gc-ratings/srCollisionClustering.test.ts',
  mirror: 'src/server/gc-ratings/strackerSqlMirror.ts',
};

const markers = {
  ratingService: 'GC_PHASE2H_RATINGS_ARRAY_TYPES_V1',
  mysqlStore: 'GC_PHASE2H_MYSQL_REVIEW_STATUS_V1',
  routes: 'GC_PHASE2H_RATINGS_ROUTES_TYPES_V1',
  collisionTest: 'GC_PHASE2H_SR_TEST_NARROWING_V1',
  mirror: 'GC_PHASE2H_MIRROR_CARS_MAP_V1',
};

function target(relativePath) {
  return path.join(root, relativePath);
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function writePreservingEol(relativePath, original, normalized) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const output = eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
  backup(relativePath);
  fs.writeFileSync(target(relativePath), output, 'utf8');
  changed.push(relativePath);
}

for (const relativePath of Object.values(files)) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}.`);
  }
}

// ratingService.ts
{
  const original = fs.readFileSync(target(files.ratingService), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(markers.ratingService)) {
    if (!next.includes("from './utils';")
      || !next.includes('function enrichChampionship(')
      || !next.includes('buildManualStrackerEventFromSession')) {
      throw new Error('ratingService.ts no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      `import { ensureArray, formatLapMs, isoNow, parseDateMs, ratingClassFromGsr, ratingClassFromSr, roundTo, safeFiniteNumber, textValue, uniqueId } from './utils';`,
      `import { formatLapMs, isoNow, parseDateMs, ratingClassFromGsr, ratingClassFromSr, roundTo, safeFiniteNumber, textValue, uniqueId } from './utils';

/* ${markers.ratingService} */
function ratingArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}`,
      'el import de utilidades de ratings',
    );

    next = next.replace(/\bensureArray\(/g, 'ratingArray(');

    next = replaceRequired(
      next,
      `  const strackerSeries = {`,
      `  const strackerSeries: PlainObject = {`,
      'el objeto strackerSeries',
    );

    next = replaceRequired(
      next,
      `        const session = context.strackerAvailable && context.db
          ? forcedSessionId
            ? context.sessions.find((candidate: PlainObject) => safeFiniteNumber(candidate.SessionId, 0) === forcedSessionId) || readRaceSession(context.db, forcedSessionId) || identifyRaceSession(event, context.sessions)
            : identifyRaceSession(event, context.sessions)
          : null;`,
      `        const session = (context.strackerAvailable && context.db
          ? forcedSessionId
            ? context.sessions.find((candidate: PlainObject) => safeFiniteNumber(candidate.SessionId, 0) === forcedSessionId) || readRaceSession(context.db, forcedSessionId) || identifyRaceSession(event, context.sessions)
            : identifyRaceSession(event, context.sessions)
          : null) as PlainObject | null;`,
      'la sesión ACSM/sTracker tipada',
    );

    const eventAnchor = `const event = await this.buildManualStrackerEventFromSession(sessionId, options);`;
    if (!next.includes(eventAnchor)) {
      throw new Error('No se encontró buildManualStrackerEventFromSession.');
    }
    next = next.replace(
      new RegExp(eventAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      `const event = await this.buildManualStrackerEventFromSession(sessionId, options) as PlainObject;`,
    );

    if (next.includes('ensureArray(')) {
      throw new Error('Quedaron usos ensureArray sin migrar en ratingService.ts.');
    }

    writePreservingEol(files.ratingService, original, next);
  } else {
    console.log('[GC Phase 2H] ratingService ya tipado.');
  }
}

// mysqlRatingStore.ts
{
  const original = fs.readFileSync(target(files.mysqlStore), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(markers.mysqlStore)) {
    next = replaceRequired(
      next,
      `        status: row.status === 'reviewed-unrated' ? 'reviewed-unrated' : 'ignored',`,
      `        // ${markers.mysqlStore}
        status: (row.status === 'reviewed-unrated' ? 'reviewed-unrated' : 'ignored') as RatingStrackerSessionReview['status'],`,
      'el estado de revisión MySQL',
    );
    writePreservingEol(files.mysqlStore, original, next);
  } else {
    console.log('[GC Phase 2H] Estado MySQL ya tipado.');
  }
}

// routes.ts
{
  const original = fs.readFileSync(target(files.routes), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(markers.routes)) {
    next = replaceRequired(
      next,
      `  function parseBooleanish(value: unknown, fallback: boolean | undefined = undefined) {`,
      `  /* ${markers.routes} */
  function queryLimit(value: unknown): number | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    const parsed = Number(first);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  function parseBooleanish(value: unknown, fallback: boolean | undefined = undefined) {`,
      'el helper parseBooleanish',
    );

    next = replaceRequired(
      next,
      `        return res.json({
          ok: true,
          source: 'gc-ratings-v1:v18-source-aware-official-recalc',
          ...payload
        });`,
      `        return res.json({
          ...payload,
          ok: true,
          source: 'gc-ratings-v1:v18-source-aware-official-recalc'
        });`,
      'la respuesta del recálculo oficial',
    );

    next = next.replace(/limit: req\.query\.limit/g, 'limit: queryLimit(req.query.limit)');

    if (next.includes('limit: req.query.limit')) {
      throw new Error('Quedaron límites de query sin normalizar en routes.ts.');
    }

    writePreservingEol(files.routes, original, next);
  } else {
    console.log('[GC Phase 2H] Rutas de ratings ya tipadas.');
  }
}

// srCollisionClustering.test.ts
{
  const original = fs.readFileSync(target(files.collisionTest), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(markers.collisionTest)) {
    next = replaceRequired(
      next,
      `  assert.equal(result.breakdown.rawCollisionCount, 4);`,
      `  /* ${markers.collisionTest} */
  if (!('rawCollisionCount' in result.breakdown)) {
    assert.fail('Se esperaba un breakdown SR con telemetría fiable.');
  }

  assert.equal(result.breakdown.rawCollisionCount, 4);`,
      'el narrowing del test SR',
    );
    writePreservingEol(files.collisionTest, original, next);
  } else {
    console.log('[GC Phase 2H] Test SR ya estrechado.');
  }
}

// strackerSqlMirror.ts
{
  const original = fs.readFileSync(target(files.mirror), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(markers.mirror)) {
    next = replaceRequired(
      next,
      `    cars: Array.from(new Map(scopedLaps
      .filter((lap) => toInt(lap.comboId, 0) === activeComboId)
      .map((lap) => [String(lap.car?.id ?? lap.car?.name ?? lap.carCode ?? ''), lap.car])
      .filter(([key]) => Boolean(key))).values()).map((car: any) => car).filter(Boolean),`,
      `    // ${markers.mirror}
    cars: Array.from(new Map<string, any>(scopedLaps
      .filter((lap) => toInt(lap.comboId, 0) === activeComboId)
      .map((lap): [string, any] => [String(lap.car?.id ?? lap.car?.name ?? lap.carCode ?? ''), lap.car])
      .filter(([key]) => Boolean(key))).values()).filter(Boolean),`,
      'el mapa de coches del combo activo',
    );
    writePreservingEol(files.mirror, original, next);
  } else {
    console.log('[GC Phase 2H] Mapa de coches ya tipado.');
  }
}

console.log('');
console.log('[GC Phase 2H] Tipos del backend de ratings aplicados.');
console.log(`[GC Phase 2H] Backup: ${backupDir}`);
console.log(`[GC Phase 2H] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('No se modifican fórmulas SR/GSR, pesos, matching, elegibilidad, persistencia ni endpoints.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
