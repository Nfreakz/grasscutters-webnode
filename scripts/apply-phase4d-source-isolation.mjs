import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4D_SOURCE_ISOLATION_V1';
const phase4bMarker = 'GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1';
const payloadDir = path.join(root, 'scripts', 'phase4d-source-isolation-payload');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4d-source-isolation-${stamp}`);
const changed = [];

const files = {
  types: 'src/server/gc-ratings/types.ts',
  store: 'src/server/gc-ratings/ratingStore.ts',
  mysql: 'src/server/gc-ratings/mysqlRatingStore.ts',
  service: 'src/server/gc-ratings/ratingService.ts',
  routes: 'src/server/gc-ratings/routes.ts',
  integrityPage: 'src/pages/admin/integridad-ratings.astro',
  sourcePage: 'src/pages/admin/integridad-ratings/fuentes.astro'
};

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
  if (next === original) return;
  backup(relativePath);
  fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function replaceAllRequired(text, from, to, minimum, label) {
  if (!text.includes(from)) {
    if (text.includes(to)) return text;
    throw new Error(`No se encontró ${label}`);
  }
  const count = text.split(from).length - 1;
  if (count < minimum) throw new Error(`${label}: se esperaban al menos ${minimum}, encontrados ${count}`);
  return text.split(from).join(to);
}

function insertBeforeRequired(text, anchor, block, label) {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
}

const markerFiles = Object.values(files);
const alreadyApplied = markerFiles.every((relativePath) =>
  fs.existsSync(target(relativePath)) && read(relativePath).includes(marker)
);

if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4D] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

const serviceHelpers = readPayload('service-helpers.txt');
const serviceMethod = readPayload('service-method.txt');
const sourcePage = readPayload('fuentes.astro');

if (!read(files.service).includes(phase4bMarker)) {
  throw new Error('Phase 4B no está aplicada. Debes completar primero la reconstrucción canónica.');
}

// 1. Tipos.
{
  const relativePath = files.types;
  const original = read(relativePath);
  let next = original;

  next = replaceRequired(
    next,
    `export type PlainObject = Record<string, any>;`,
    `export type PlainObject = Record<string, any>;

/* ${marker} */
export type RatingSourceKey = 'weekly' | 'gt4' | 'stracker-manual' | 'unknown';`,
    'el tipo PlainObject'
  );

  next = replaceRequired(
    next,
    `  eventDate: string | null;
  strackerSessionId: number | null;`,
    `  eventDate: string | null;
  sourceKey?: RatingSourceKey;
  championshipId?: string | null;
  championshipName?: string | null;
  resultIdentityKey?: string;
  eventScopeKey?: string;
  strackerSessionId: number | null;`,
    'los campos de RatingEventResult'
  );

  next = replaceRequired(
    next,
    `  processedEventIds: string[];
  drivers: DriverRatingState[];`,
    `  processedEventIds: string[];
  processedEventKeys?: string[];
  sourceIsolationVersion?: string | null;
  drivers: DriverRatingState[];`,
    'los campos de RatingsSnapshot'
  );

  save(relativePath, original, next);
}

// 2. Contrato del store.
{
  const relativePath = files.store;
  const original = read(relativePath);
  const next = replaceRequired(
    original,
    `  diagnostics?(): Promise<Record<string, unknown>>;`,
    `  /* ${marker} */
  ensureSourceIsolationConstraints?(): Promise<void>;
  diagnostics?(): Promise<Record<string, unknown>>;`,
    'el contrato diagnostics del store'
  );
  save(relativePath, original, next);
}

// 3. Persistencia MySQL.
{
  const relativePath = files.mysql;
  const original = read(relativePath);
  let next = original;

  const mysqlHelpers = `/* ${marker} */
function mysqlRatingSourceKey(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  if (source === 'gt4') return 'gt4';
  if (source === 'weekly' || source === 'main') return 'weekly';
  if (source === 'stracker-manual' || source === 'stracker') return 'stracker-manual';
  return 'unknown';
}

function mysqlRatingIdentityKey(result: Partial<RatingEventResult> & Record<string, any>) {
  const explicit = String(result.resultIdentityKey || '').trim();
  if (explicit) return explicit;
  const steamGuid = String(result.steamGuid || '').trim();
  if (steamGuid) return \`steam:\${steamGuid}\`;
  const playerId = mysqlInt(result.strackerPlayerId, 0);
  if (playerId > 0) return \`player:\${playerId}\`;
  const driverKey = String(result.driverKey || '').trim();
  if (driverKey) return driverKey;
  const name = String(result.displayName || 'unknown')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return \`name:\${name || 'unknown'}\`;
}

function mysqlRatingEventScopeKey(result: Partial<RatingEventResult> & Record<string, any>) {
  return \`\${mysqlRatingSourceKey(result.sourceKey)}:\${String(result.eventId || 'unknown-event')}\`;
}

async function mysqlIndexExists(pool: Pool, tableName: string, indexName: string) {
  const [rows] = await pool.query(\`
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
  \`, [tableName, indexName]);
  return Number((rows as any[])[0]?.total || 0) > 0;
}

async function addIndexIfMissing(pool: Pool, tableName: string, indexName: string, definition: string) {
  if (await mysqlIndexExists(pool, tableName, indexName)) return;
  await pool.query(\`ALTER TABLE \${tableName} ADD \${definition}\`);
}`;

  next = insertBeforeRequired(
    next,
    'export class MysqlRatingStore implements RatingStore {',
    mysqlHelpers,
    'la clase MysqlRatingStore'
  );

  next = replaceRequired(
    next,
    `        event_name VARCHAR(255) NOT NULL,
        event_date DATETIME(3) NULL,
        stracker_session_id INT NULL,`,
    `        event_name VARCHAR(255) NOT NULL,
        event_date DATETIME(3) NULL,
        source_key VARCHAR(24) NOT NULL DEFAULT 'unknown',
        championship_id VARCHAR(191) NULL,
        championship_name VARCHAR(255) NULL,
        result_identity_key VARCHAR(255) NOT NULL DEFAULT '',
        event_scope_key VARCHAR(255) NOT NULL DEFAULT '',
        stracker_session_id INT NULL,`,
    'las columnas base de gc_rating_event_result'
  );

  next = replaceRequired(
    next,
    `        KEY idx_gc_rating_event_result_event (event_id, position),
        KEY idx_gc_rating_event_result_driver (driver_key),`,
    `        KEY idx_gc_rating_event_result_event (event_id, position),
        KEY idx_gc_rating_event_result_scope (source_key, event_id),
        KEY idx_gc_rating_event_result_identity (source_key, event_id, result_identity_key),
        KEY idx_gc_rating_event_result_driver (driver_key),`,
    'los índices base de gc_rating_event_result'
  );

  next = replaceRequired(
    next,
    `    await addColumnIfMissing(pool, 'gc_rating_event_result', 'cluster_window_seconds', 'INT NULL');`,
    `    await addColumnIfMissing(pool, 'gc_rating_event_result', 'cluster_window_seconds', 'INT NULL');
    await addColumnIfMissing(pool, 'gc_rating_event_result', 'source_key', "VARCHAR(24) NOT NULL DEFAULT 'unknown'");
    await addColumnIfMissing(pool, 'gc_rating_event_result', 'championship_id', 'VARCHAR(191) NULL');
    await addColumnIfMissing(pool, 'gc_rating_event_result', 'championship_name', 'VARCHAR(255) NULL');
    await addColumnIfMissing(pool, 'gc_rating_event_result', 'result_identity_key', "VARCHAR(255) NOT NULL DEFAULT ''");
    await addColumnIfMissing(pool, 'gc_rating_event_result', 'event_scope_key', "VARCHAR(255) NOT NULL DEFAULT ''");
    await addIndexIfMissing(pool, 'gc_rating_event_result', 'idx_gc_rating_event_result_scope', 'INDEX idx_gc_rating_event_result_scope (source_key, event_id)');
    await addIndexIfMissing(pool, 'gc_rating_event_result', 'idx_gc_rating_event_result_identity', 'INDEX idx_gc_rating_event_result_identity (source_key, event_id, result_identity_key)');`,
    'la evolución de columnas del resultado'
  );

  next = replaceRequired(
    next,
    `      eventDate: mysqlToIso(row.event_date),
      strackerSessionId: row.stracker_session_id ?? null,`,
    `      eventDate: mysqlToIso(row.event_date),
      sourceKey: mysqlRatingSourceKey(row.source_key),
      championshipId: row.championship_id ?? null,
      championshipName: row.championship_name ?? null,
      resultIdentityKey: String(row.result_identity_key || ''),
      eventScopeKey: String(row.event_scope_key || ''),
      strackerSessionId: row.stracker_session_id ?? null,`,
    'la lectura source-aware del resultado'
  );

  next = replaceRequired(
    next,
    `    const processedEventIds = [...new Set(eventResults.map((row) => row.eventId))];`,
    `    const processedEventIds = [...new Set(eventResults.map((row) => row.eventId))];
    const processedEventKeys = [...new Set(eventResults.map((row) =>
      row.eventScopeKey || mysqlRatingEventScopeKey(row)
    ))];`,
    'las claves procesadas del snapshot'
  );

  next = replaceRequired(
    next,
    `      processedEventIds,
      drivers,`,
    `      processedEventIds,
      processedEventKeys,
      sourceIsolationVersion: recalculationLogs.some((log) => String(log.message || '').includes('${marker}'))
        ? '${marker}'
        : null,
      drivers,`,
    'la metadata source-aware del snapshot'
  );

  const saveInsertOld = `        await connection.query(\`
          INSERT INTO gc_rating_event_result
          (id, event_id, event_name, event_date, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes, raw_collision_count, collision_cluster_count, suppressed_collision_count, cluster_window_seconds)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`, [
          result.id,
          result.eventId,
          result.eventName,
          isoToMysql(result.eventDate),
          result.strackerSessionId,`;

  const saveInsertNew = `        const sourceKey = mysqlRatingSourceKey(result.sourceKey);
        const resultIdentityKey = mysqlRatingIdentityKey(result);
        const eventScopeKey = result.eventScopeKey || mysqlRatingEventScopeKey(result);
        await connection.query(\`
          INSERT INTO gc_rating_event_result
          (id, event_id, event_name, event_date, source_key, championship_id, championship_name, result_identity_key, event_scope_key, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes, raw_collision_count, collision_cluster_count, suppressed_collision_count, cluster_window_seconds)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`, [
          result.id,
          result.eventId,
          result.eventName,
          isoToMysql(result.eventDate),
          sourceKey,
          result.championshipId ?? null,
          result.championshipName ?? null,
          resultIdentityKey,
          eventScopeKey,
          result.strackerSessionId,`;

  next = replaceRequired(next, saveInsertOld, saveInsertNew, 'el INSERT completo de resultados');

  const guardOld = `    // GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1
    // Segunda barrera: una carrera solo puede tener una fila por posición oficial.
    // La cola del servicio serializa escrituras; esta limpieza protege append/reintentos.
    const [existingRows] = await connection.query(
      'SELECT id FROM gc_rating_event_result WHERE event_id = ? AND position = ? FOR UPDATE',
      [result.eventId, mysqlInt(result.position)]
    );`;

  const guardNew = `    // ${marker}
    // Una fuente + evento + identidad canónica solo puede producir una fila.
    const sourceKey = mysqlRatingSourceKey(result.sourceKey);
    const resultIdentityKey = mysqlRatingIdentityKey(result);
    const eventScopeKey = result.eventScopeKey || mysqlRatingEventScopeKey(result);
    const [existingRows] = await connection.query(
      'SELECT id FROM gc_rating_event_result WHERE source_key = ? AND event_id = ? AND result_identity_key = ? FOR UPDATE',
      [sourceKey, result.eventId, resultIdentityKey]
    );`;

  next = replaceRequired(next, guardOld, guardNew, 'la guardia de inserción Phase 4B');

  const appendInsertOld = `      await connection.query(\`
        INSERT INTO gc_rating_event_result
        (id, event_id, event_name, event_date, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes, raw_collision_count, collision_cluster_count, suppressed_collision_count, cluster_window_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      \`, [
      result.id,
      result.eventId,
      result.eventName,
      isoToMysql(result.eventDate),
      result.strackerSessionId,`;

  const appendInsertNew = `      await connection.query(\`
        INSERT INTO gc_rating_event_result
        (id, event_id, event_name, event_date, source_key, championship_id, championship_name, result_identity_key, event_scope_key, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes, raw_collision_count, collision_cluster_count, suppressed_collision_count, cluster_window_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      \`, [
      result.id,
      result.eventId,
      result.eventName,
      isoToMysql(result.eventDate),
      sourceKey,
      result.championshipId ?? null,
      result.championshipName ?? null,
      resultIdentityKey,
      eventScopeKey,
      result.strackerSessionId,`;

  next = replaceRequired(next, appendInsertOld, appendInsertNew, 'el INSERT incremental de resultados');

  const constraintMethod = `  async ensureSourceIsolationConstraints() {
    await this.ensureSchema();
    const pool = await this.getPool();

    const [unknownRows] = await pool.query(\`
      SELECT COUNT(*) AS total
      FROM gc_rating_event_result
      WHERE source_key = 'unknown'
         OR result_identity_key = ''
         OR event_scope_key = ''
    \`);
    const unknown = Number((unknownRows as any[])[0]?.total || 0);
    if (unknown > 0) {
      throw new Error(\`No se puede activar la restricción source-aware: quedan \${unknown} fila(s) sin migrar.\`);
    }

    const [duplicateRows] = await pool.query(\`
      SELECT source_key, event_id, result_identity_key, COUNT(*) AS total
      FROM gc_rating_event_result
      GROUP BY source_key, event_id, result_identity_key
      HAVING COUNT(*) > 1
      LIMIT 20
    \`);
    if ((duplicateRows as any[]).length > 0) {
      throw new Error('No se puede activar la restricción source-aware: existen identidades duplicadas.');
    }

    await addIndexIfMissing(
      pool,
      'gc_rating_event_result',
      'uq_gc_rating_event_result_source_identity',
      'UNIQUE INDEX uq_gc_rating_event_result_source_identity (source_key, event_id, result_identity_key)'
    );
  }

`;

  next = insertBeforeRequired(next, '  async diagnostics() {', constraintMethod, 'el método diagnostics del store');

  save(relativePath, original, next);
}

// 4. Servicio.
{
  const relativePath = files.service;
  const original = read(relativePath);
  let next = original;

  next = insertBeforeRequired(
    next,
    'function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {',
    serviceHelpers,
    'el helper enrichChampionship'
  );

  next = replaceRequired(
    next,
    `    processedEventIds: [],
    drivers: [],`,
    `    processedEventIds: [],
    processedEventKeys: [],
    sourceIsolationVersion: null,
    drivers: [],`,
    'el snapshot vacío'
  );

  next = replaceRequired(
    next,
    `function ratingResultFingerprintV1(row: RatingEventResult) {
  const eventId = textValue(row.eventId, 'unknown-event');
  const position = safeFiniteNumber(row.position, 0);
  const name = normalizeDriverNameKey(row.displayName || row.driverKey || 'unknown');`,
    `function ratingResultFingerprintV1(row: RatingEventResult) {
  const explicitIdentity = textValue(row.resultIdentityKey);
  if (explicitIdentity) return \`${'${ratingEventScopeKeyV1(row.sourceKey, row.eventId)}'}:\${explicitIdentity}\`;

  const eventId = ratingEventScopeKeyV1(row.sourceKey, textValue(row.eventId, 'unknown-event'));
  const position = safeFiniteNumber(row.position, 0);
  const name = normalizeDriverNameKey(row.displayName || row.driverKey || 'unknown');`,
    'la firma de duplicados'
  );

  next = replaceRequired(
    next,
    `    const processedEventIds = new Set(baseSnapshot.processedEventIds);
    const context = await createProcessingContext(events.length, mode, options.source || 'weekly');`,
    `    const processedEventIds = new Set(baseSnapshot.processedEventIds);
    const processedEventKeys = new Set(
      ratingArray<string>(baseSnapshot.processedEventKeys).length
        ? ratingArray<string>(baseSnapshot.processedEventKeys)
        : ratingArray<RatingEventResult>(baseSnapshot.eventResults).map((row) =>
            ratingEventScopeKeyV1(row.sourceKey, row.eventId)
          )
    );
    const defaultSourceKey = normalizeRatingSourceKeyV1(options.source || 'weekly');
    const defaultChampionshipId = textValue(options.championshipId) || null;
    const defaultChampionshipName = textValue(options.championshipName) || null;
    const context = await createProcessingContext(events.length, mode, options.source || 'weekly');`,
    'las claves procesadas de computeEventUpdates'
  );

  next = replaceRequired(
    next,
    `      for (const event of events) {
        const forcedSessionId`,
    `      for (const event of events) {
        const eventSourceKey: RatingSourceKeyV1 = String(event?.id || '').startsWith('stracker:')
          ? 'stracker-manual'
          : defaultSourceKey;
        const eventChampionshipId = eventSourceKey === 'stracker-manual' ? null : defaultChampionshipId;
        const eventChampionshipName = eventSourceKey === 'stracker-manual' ? null : defaultChampionshipName;
        const forcedSessionId`,
    'la fuente de cada evento'
  );

  next = replaceRequired(
    next,
    `            eventDate: event.completedAt || event.scheduledAt || null,
            strackerSessionId: session ? Number(session.SessionId) : null,`,
    `            eventDate: event.completedAt || event.scheduledAt || null,
            sourceKey: eventSourceKey,
            championshipId: eventChampionshipId,
            championshipName: eventChampionshipName,
            resultIdentityKey: ratingResultIdentityKeyV1({
              driverKey,
              steamGuid,
              strackerPlayerId,
              displayName
            } as RatingEventResult),
            eventScopeKey: ratingEventScopeKeyV1(eventSourceKey, event.id),
            strackerSessionId: session ? Number(session.SessionId) : null,`,
    'la metadata provisional del resultado'
  );

  next = replaceRequired(
    next,
    `            eventDate: row.eventDate,
            strackerSessionId: row.strackerSessionId,`,
    `            eventDate: row.eventDate,
            sourceKey: row.sourceKey,
            championshipId: row.championshipId,
            championshipName: row.championshipName,
            resultIdentityKey: row.resultIdentityKey,
            eventScopeKey: row.eventScopeKey,
            strackerSessionId: row.strackerSessionId,`,
    'la metadata final del resultado'
  );

  next = replaceRequired(
    next,
    `        processedEventIds.add(String(event.id));`,
    `        processedEventIds.add(String(event.id));
        processedEventKeys.add(ratingEventScopeKeyV1(eventSourceKey, event.id));`,
    'la clave procesada del evento'
  );

  next = replaceRequired(
    next,
    `        processedEventIds: [...processedEventIds],
        drivers:`,
    `        processedEventIds: [...processedEventIds],
        processedEventKeys: [...processedEventKeys],
        drivers:`,
    'el retorno de claves procesadas'
  );

  next = insertBeforeRequired(
    next,
    '  async processNewEvents(options: PlainObject = {}) {',
    serviceMethod,
    'el método processNewEvents'
  );

  next = replaceRequired(
    next,
    `    const integrityAudit = buildRatingDuplicateAuditV1(baseSnapshot.eventResults);
    if (integrityAudit.duplicateGroups > 0) {`,
    `    const sourceIsolationAudit = buildRatingSourceIsolationAuditV1(baseSnapshot);
    if (baseSnapshot.eventResults.length > 0 && !sourceIsolationAudit.ready) {
      throw new Error('Procesamiento bloqueado: ejecuta primero /admin/integridad-ratings/fuentes.');
    }
    const integrityAudit = buildRatingDuplicateAuditV1(baseSnapshot.eventResults);
    if (integrityAudit.duplicateGroups > 0) {`,
    'el bloqueo de integridad antes de procesar'
  );

  next = replaceRequired(
    next,
    `    const allCompleted = completedEvents(championship);
    const processedIds = new Set([...baseSnapshot.processedEventIds, ...baseSnapshot.eventResults.map((row) => row.eventId)]);
    const newEvents = allCompleted.filter((event: PlainObject) => !processedIds.has(String(event.id)));`,
    `    const allCompleted = completedEvents(championship);
    const processedKeys = new Set(
      ratingArray<string>(baseSnapshot.processedEventKeys).length
        ? ratingArray<string>(baseSnapshot.processedEventKeys)
        : baseSnapshot.eventResults.map((row) => ratingEventScopeKeyV1(row.sourceKey, row.eventId))
    );
    const newEvents = allCompleted.filter((event: PlainObject) =>
      !processedKeys.has(ratingEventScopeKeyV1(source, event.id))
    );`,
    'la detección source-aware de eventos nuevos'
  );

  next = replaceRequired(
    next,
    `    const computed = await this.computeEventUpdates(baseSnapshot, newEvents, 'incremental', { source });`,
    `    const computed = await this.computeEventUpdates(baseSnapshot, newEvents, 'incremental', {
      source,
      championshipId: textValue(championship.id) || null,
      championshipName: textValue(championship.name) || null
    });`,
    'el procesamiento incremental source-aware'
  );

  next = replaceAllRequired(
    next,
    `      processedEventIds: computed.processedEventIds,
      drivers: computed.drivers,`,
    `      processedEventIds: computed.processedEventIds,
      processedEventKeys: computed.processedEventKeys,
      drivers: computed.drivers,`,
    1,
    'la propagación de processedEventKeys'
  );

  next = next.replace(
    /(processedEventIds:\s*computed\.processedEventIds,\s*\n)(\s*)(?!processedEventKeys:)drivers:\s*computed\.drivers,/g,
    `$1$2processedEventKeys: computed.processedEventKeys,\n$2drivers: computed.drivers,`
  );

  if (/(processedEventIds:\s*computed\.processedEventIds,\s*\n\s*)drivers:\s*computed\.drivers,/.test(next)) {
    throw new Error('Quedó una propagación de processedEventIds sin processedEventKeys.');
  }

  next = replaceRequired(
    next,
    `        const computed = await this.computeEventUpdates(candidate, [item.event], 'rebuild', { source: item.source });`,
    `        const computed = await this.computeEventUpdates(candidate, [item.event], 'rebuild', {
          source: item.source,
          championshipId: item.championshipId,
          championshipName: item.championshipName
        });`,
    'el rebuild canónico source-aware'
  );

  next = replaceRequired(
    next,
    `    const computed = await this.computeEventUpdates(baseSnapshot, allCompleted, 'rebuild', { source });`,
    `    if (options.allSources !== true) {
      throw new Error('Rebuild de una sola fuente bloqueado por Phase 4D. Usa el flujo global de integridad para no borrar la otra liga.');
    }
    const computed = await this.computeEventUpdates(baseSnapshot, allCompleted, 'rebuild', {
      source,
      championshipId: textValue(championship.id) || null,
      championshipName: textValue(championship.name) || null
    });`,
    'la protección del rebuild destructivo'
  );

  next = replaceRequired(
    next,
    `      const computed = await this.computeEventUpdates(currentSnapshot, [target.event], 'rebuild', { source: recalcSource });`,
    `      const computed = await this.computeEventUpdates(currentSnapshot, [target.event], 'rebuild', {
        source: recalcSource,
        championshipId: textValue(championship.id) || null,
        championshipName: textValue(championship.name) || null
      });`,
    'el recálculo oficial source-aware'
  );

  next = replaceRequired(
    next,
    `    const duplicateAudit = {
      ...buildRatingDuplicateAuditV1(snapshot.eventResults),`,
    `    const sourceIsolation = buildRatingSourceIsolationAuditV1(snapshot);
    if (!sourceIsolation.ready) {
      megaAuditWarnings.push('Los resultados aún no están aislados por Liga/GT4. Ejecuta /admin/integridad-ratings/fuentes.');
    }
    const duplicateAudit = {
      ...buildRatingDuplicateAuditV1(snapshot.eventResults),`,
    'el audit de aislamiento'
  );

  next = replaceRequired(
    next,
    `      dataIntegrity: duplicateAudit,
      preDeployStatus,`,
    `      dataIntegrity: duplicateAudit,
      sourceIsolation,
      preDeployStatus,`,
    'el bloque sourceIsolation de diagnostics'
  );

  save(relativePath, original, next);
}

// 5. Ruta admin.
{
  const relativePath = files.routes;
  const original = read(relativePath);

  const block = `  // ${marker}
  app.post('/api/gc/ratings/source-isolation', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const dryRunRaw = req.query.dryRun ?? req.body?.dryRun;
      const confirmationRaw = req.query.confirmation ?? req.body?.confirmation;
      const dryRun = parseBooleanish(dryRunRaw, true) !== false;
      const confirmation = String(confirmationRaw || '').trim();
      const payload = await service.migrateRatingSourceIsolationV1({ dryRun, confirmation });
      res.json(payload);
    } catch (error) {
      res.status(400).json({
        ok: false,
        source: 'gc-ratings-v1:phase4d-source-isolation',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

`;

  const next = insertBeforeRequired(
    original,
    `  // GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1`,
    block.trimEnd(),
    'la ruta de integridad Phase 4B'
  );
  save(relativePath, original, next);
}

// 6. Página nueva.
{
  const relativePath = files.sourcePage;
  const original = fs.existsSync(target(relativePath)) ? read(relativePath) : '';
  backup(relativePath);
  fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
  fs.writeFileSync(target(relativePath), sourcePage, 'utf8');
  changed.push(relativePath);
}

// 7. Enlace desde integridad.
{
  const relativePath = files.integrityPage;
  const original = read(relativePath);
  const oldGrid = `      <div class="gc-integrity-grid">
        <article><span>Filas almacenadas</span><strong id="storedRows">—</strong></article>
        <article><span>Filas únicas</span><strong id="uniqueRows">—</strong></article>
        <article><span>Duplicados</span><strong id="duplicateRows">—</strong></article>
        <article><span>Grupos afectados</span><strong id="duplicateGroups">—</strong></article>
      </div>`;

  const newGrid = `      <div class="gc-integrity-grid">
        <article><span>Filas almacenadas</span><strong id="storedRows">—</strong></article>
        <article><span>Filas únicas</span><strong id="uniqueRows">—</strong></article>
        <article><span>Duplicados</span><strong id="duplicateRows">—</strong></article>
        <article><span>Grupos afectados</span><strong id="duplicateGroups">—</strong></article>
      </div>

      <!-- ${marker} -->
      <section class="gc-section gc-integrity-card">
        <div class="gc-section-head">
          <div>
            <span class="gc-kicker">Phase 4D</span>
            <h2>Aislamiento Liga / GT4</h2>
            <p>Etiqueta los resultados por servidor y activa la unicidad por fuente, evento y piloto.</p>
          </div>
          <a class="gc-btn gc-btn--primary" href="/admin/integridad-ratings/fuentes">Abrir aislamiento</a>
        </div>
      </section>`;

  const next = replaceRequired(original, oldGrid, newGrid, 'el resumen de la página de integridad');
  save(relativePath, original, next);
}

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4D] Aislamiento persistente Liga / GT4 instalado.');
console.log(`[GC Phase 4D] Backup de código: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4D] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('[GC Phase 4D] El instalador NO reescribe los 75 resultados.');
console.log('[GC Phase 4D] Despliega, reinicia Node y abre /admin/integridad-ratings/fuentes.');
console.log('[GC Phase 4D] Primero simula y después aplica con la confirmación exacta.');
