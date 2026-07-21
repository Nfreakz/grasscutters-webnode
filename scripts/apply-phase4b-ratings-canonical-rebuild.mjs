import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4b-ratings-canonical-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4b-ratings-canonical-payload');
const MARKER = 'GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1';
const PHASE4A = 'GC_PHASE4A_RATINGS_INTEGRITY_GUARD_V1';
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readPayload(name) {
  const filePath = path.join(payloadDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Falta payload ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8').trimEnd();
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function save(relativePath, original, next) {
  if (next === original) return false;
  backup(relativePath);
  fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
  return true;
}

function replaceRequired(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`No se encontró el bloque requerido: ${label}`);
  return text.replace(oldValue, newValue);
}

function injectBeforeRequired(text, marker, block, label) {
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`No se encontró el marcador requerido: ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
}

const markerFiles = [
  'src/server/gc-ratings/ratingService.ts',
  'src/server/gc-ratings/mysqlRatingStore.ts',
  'src/server/gc-ratings/routes.ts',
  'src/pages/admin/integridad-ratings.astro',
  'src/components/AdminSubnav.astro'
];
const alreadyApplied = markerFiles.every((relativePath) =>
  fs.existsSync(target(relativePath)) && fs.readFileSync(target(relativePath), 'utf8').includes(MARKER)
);
if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4B] Sin cambios: ${MARKER} ya estaba aplicado.`);
  process.exit(0);
}

const serviceHelpers = readPayload('service-helpers.txt');
const serviceMethods = readPayload('service-methods.txt');
const adminPage = readPayload('ratings-integridad.astro');

// 1) Servicio: selección canónica, cola de mutaciones, dry-run y reconstrucción global Liga + GT4.
{
  const relativePath = 'src/server/gc-ratings/ratingService.ts';
  const original = read(relativePath);
  if (!original.includes(PHASE4A)) {
    throw new Error('Phase 4A no está aplicada en ratingService.ts. Aplica primero GC_PHASE4A_RATINGS_INTEGRITY_GUARD_V1.');
  }

  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4B] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    next = replaceRequired(
      next,
      "import { identifyRaceSession, matchOfficialToStracker, officialDriverName } from './acsmMatcher';",
      "import fs from 'node:fs';\nimport path from 'node:path';\nimport { identifyRaceSession, matchOfficialToStracker, officialDriverName } from './acsmMatcher';",
      'imports fs/path'
    );

    const oldComparator = `function ratingResultQualityCompareV1(left: RatingEventResult, right: RatingEventResult) {
  const dateDiff = parseDateMs(right.processedAt || right.eventDate) - parseDateMs(left.processedAt || left.eventDate);
  if (dateDiff) return dateDiff;

  const identityDiff = ratingResultIdentityStrengthV1(right) - ratingResultIdentityStrengthV1(left);
  if (identityDiff) return identityDiff;

  const confidenceDiff = safeFiniteNumber(right.match?.confidence, 0) - safeFiniteNumber(left.match?.confidence, 0);
  if (confidenceDiff) return confidenceDiff;

  const detailDiff = ratingArray(right.lapsDetail).length - ratingArray(left.lapsDetail).length;
  if (detailDiff) return detailDiff;

  return textValue(right.id).localeCompare(textValue(left.id));
}`;

    const newComparator = `function ratingResultQualityCompareV1(left: RatingEventResult, right: RatingEventResult) {
  // Phase 4B: primero calidad de identidad/telemetría. Si las dos filas son
  // equivalentes, conservamos la primera aplicación cronológica, no el reprocesado.
  const identityDiff = ratingResultIdentityStrengthV1(right) - ratingResultIdentityStrengthV1(left);
  if (identityDiff) return identityDiff;

  const confidenceDiff = safeFiniteNumber(right.match?.confidence, 0) - safeFiniteNumber(left.match?.confidence, 0);
  if (confidenceDiff) return confidenceDiff;

  const telemetryDiff =
    Number(Boolean(right.strackerSessionId && right.strackerPlayerId)) -
    Number(Boolean(left.strackerSessionId && left.strackerPlayerId));
  if (telemetryDiff) return telemetryDiff;

  const rightFallback = textValue(right.match?.method).includes('fallback') ? 1 : 0;
  const leftFallback = textValue(left.match?.method).includes('fallback') ? 1 : 0;
  if (rightFallback !== leftFallback) return leftFallback - rightFallback;

  const detailDiff = ratingArray(right.lapsDetail).length - ratingArray(left.lapsDetail).length;
  if (detailDiff) return detailDiff;

  const dateDiff = parseDateMs(left.processedAt || left.eventDate) - parseDateMs(right.processedAt || right.eventDate);
  if (dateDiff) return dateDiff;

  return textValue(left.id).localeCompare(textValue(right.id));
}`;

    next = replaceRequired(next, oldComparator, newComparator, 'comparador canónico Phase 4A');

    next = injectBeforeRequired(
      next,
      'function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {',
      serviceHelpers,
      'helpers de reconstrucción'
    );

    next = replaceRequired(
      next,
      `export class GcRatingsService {
  private readonly store = createRatingStore();
  private cachedSnapshot: RatingsSnapshot | null = null;`,
      `export class GcRatingsService {
  private readonly store = createRatingStore();
  private cachedSnapshot: RatingsSnapshot | null = null;
  private ratingMutationQueueV1: Promise<unknown> = Promise.resolve();

  private queueRatingMutationV1<T>(task: () => Promise<T>): Promise<T> {
    const run = this.ratingMutationQueueV1.then(task, task);
    this.ratingMutationQueueV1 = run.then(() => undefined, () => undefined);
    return run;
  }`,
      'cola de mutaciones'
    );

    next = injectBeforeRequired(
      next,
      '  async processNewEvents(options: PlainObject = {}) {',
      serviceMethods,
      'métodos de reconstrucción'
    );

    next = replaceRequired(
      next,
      '  async processNewEvents(options: PlainObject = {}) {\n    const source = normalizeChampionshipSource(options.source || \'weekly\');',
      `  async processNewEvents(options: PlainObject = {}) {
    return this.queueRatingMutationV1(() => this.processNewEventsUnlockedV1(options));
  }

  private async processNewEventsUnlockedV1(options: PlainObject = {}) {
    const source = normalizeChampionshipSource(options.source || 'weekly');`,
      'wrapper serializado processNewEvents'
    );

    next = replaceRequired(
      next,
      `    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(championship, this.store.kind);
    const allCompleted = completedEvents(championship);`,
      `    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(championship, this.store.kind);
    const integrityAudit = buildRatingDuplicateAuditV1(baseSnapshot.eventResults);
    if (integrityAudit.duplicateGroups > 0) {
      throw new Error(\`Procesamiento bloqueado: hay \${integrityAudit.duplicateGroups} grupo(s) de resultados duplicados. Ejecuta primero /admin/integridad-ratings.\`);
    }
    const allCompleted = completedEvents(championship);`,
      'bloqueo de proceso con duplicados'
    );

    next = replaceRequired(
      next,
      `    const duplicateAudit = buildRatingDuplicateAuditV1(snapshot.eventResults);
    if (duplicateAudit.duplicateGroups > 0) megaAuditWarnings.push(\`Hay \${duplicateAudit.duplicateGroups} grupo(s) de resultados duplicados. La vista pública los está suprimiendo sin borrar datos.\`);`,
      `    const duplicateAudit = {
      ...buildRatingDuplicateAuditV1(snapshot.eventResults),
      destructiveCleanupApplied: ratingArray<RecalculationLog>(snapshot.recalculationLogs)
        .some((log) => textValue(log.message).includes(GC_PHASE4B_CLEANUP_LOG_MARKER_V1))
    };
    if (duplicateAudit.duplicateGroups > 0) megaAuditWarnings.push(\`Hay \${duplicateAudit.duplicateGroups} grupo(s) de resultados duplicados. La vista pública los está suprimiendo sin borrar datos.\`);`,
      'estado de limpieza en diagnostics'
    );

    save(relativePath, original, next);
  }
}

// 2) MySQL: sustituir una fila existente de la misma carrera/posición antes de insertar.
{
  const relativePath = 'src/server/gc-ratings/mysqlRatingStore.ts';
  const original = read(relativePath);
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4B] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;
    next = replaceRequired(
      next,
      `  private async insertEventResult(connection: PoolConnection, result: RatingEventResult) {
      await connection.query(\``,
      `  private async insertEventResult(connection: PoolConnection, result: RatingEventResult) {
    // ${MARKER}
    // Segunda barrera: una carrera solo puede tener una fila por posición oficial.
    // La cola del servicio serializa escrituras; esta limpieza protege append/reintentos.
    const [existingRows] = await connection.query(
      'SELECT id FROM gc_rating_event_result WHERE event_id = ? AND position = ? FOR UPDATE',
      [result.eventId, mysqlInt(result.position)]
    );
    for (const existing of existingRows as any[]) {
      const existingId = String(existing?.id || '');
      if (!existingId || existingId === result.id) continue;
      await connection.query('DELETE FROM gc_rating_lap_detail WHERE event_result_id = ?', [existingId]);
      await connection.query('DELETE FROM gc_rating_incident WHERE event_result_id = ?', [existingId]);
      await connection.query('DELETE FROM gc_rating_event_result WHERE id = ?', [existingId]);
    }

      await connection.query(\``,
      'guardia MySQL insertEventResult'
    );
    save(relativePath, original, next);
  }
}

// 3) Ruta admin-only: simulación y aplicación explícita.
{
  const relativePath = 'src/server/gc-ratings/routes.ts';
  const original = read(relativePath);
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4B] ${relativePath} ya estaba aplicado.`);
  } else {
    const block = `

  // ${MARKER}
  app.post('/api/gc/ratings/integrity-rebuild', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const dryRun = parseBooleanish(req.body?.dryRun ?? req.query.dryRun, true) !== false;
      const confirmation = String(req.body?.confirmation || req.query.confirmation || '').trim();
      const payload = await service.rebuildCanonicalRatingsIntegrityV1({ dryRun, confirmation });
      res.json(payload);
    } catch (error) {
      res.status(400).json({
        ok: false,
        source: 'gc-ratings-v1:phase4b-integrity',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
`;
    const next = injectBeforeRequired(
      original,
      "  app.post('/api/gc/ratings/recalculate', async (req, res) => {",
      block.trimEnd(),
      'ruta recalculate'
    );
    save(relativePath, original, next);
  }
}

// 4) Página funcional de administración.
{
  const relativePath = 'src/pages/admin/integridad-ratings.astro';
  const original = fs.existsSync(target(relativePath)) ? read(relativePath) : '';
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4B] ${relativePath} ya estaba aplicado.`);
  } else {
    backup(relativePath);
    fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
    fs.writeFileSync(target(relativePath), adminPage, 'utf8');
    changed.push(relativePath);
  }
}

// 5) Acceso desde la navegación admin.
{
  const relativePath = 'src/components/AdminSubnav.astro';
  const original = read(relativePath);
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4B] ${relativePath} ya estaba aplicado.`);
  } else {
    const next = replaceRequired(
      original,
      `      { href: '/admin/ratings', label: 'Ratings', desc: 'Carreras sTracker' },`,
      `      { href: '/admin/ratings', label: 'Ratings', desc: 'Carreras sTracker' },
      { href: '/admin/integridad-ratings', label: 'Integridad ratings', desc: 'Duplicados y rebuild' }, <!-- ${MARKER} -->`,
      'enlace de integridad'
    );
    save(relativePath, original, next);
  }
}

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

if (!changed.length) {
  console.log(`[GC Phase 4B] Sin cambios: ${MARKER} ya estaba aplicado.`);
  process.exit(0);
}

console.log('[GC Phase 4B] Instalación funcional completada.');
console.log(`[GC Phase 4B] Backup de código: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4B] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('[GC Phase 4B] Este instalador NO modifica MySQL.');
console.log('[GC Phase 4B] Despliega y abre /admin/integridad-ratings.');
console.log('[GC Phase 4B] Primero ejecuta la simulación; la reconstrucción exige confirmación exacta.');
