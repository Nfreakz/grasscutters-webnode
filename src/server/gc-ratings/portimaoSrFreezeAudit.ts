import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { buildSrComputation } from './srModel';

const VERSION = 'GC_PHASE4J_3_PORTIMAO_SR_EVENT_DISCOVERY_AUDIT_V1';
const DEFAULT_MIN_CONFIDENCE = 0.55;
const TARGET_SOURCE_KEY = 'weekly';
const TARGET_EVENT_ID = '3cf3c3d8-de34-491d-8ef7-0f9944312c4c';

const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value: unknown, fallback = 0) => Math.trunc(number(value, fallback));

function mysqlConfig() {
  const url = text(process.env.MYSQL_URL || process.env.DATABASE_URL);
  if (url) return { uri: url };
  return {
    host: text(process.env.MYSQL_HOST || '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: text(process.env.MYSQL_USER),
    password: String(process.env.MYSQL_PASSWORD || ''),
    database: text(process.env.MYSQL_DATABASE)
  };
}

async function createPool(): Promise<Pool> {
  const config: any = mysqlConfig();
  if (config.uri) return mysql.createPool(config.uri);
  if (!config.user || !config.database) throw new Error('MySQL no está configurado.');
  return mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
}

function parseNotes(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [text(parsed)].filter(Boolean);
  } catch {
    return [raw];
  }
}

async function readMirrorDriver(db: Pool, row: any) {
  const conditions: string[] = [];
  const values: unknown[] = [integer(row.stracker_session_id)];
  if (integer(row.match_player_in_session_id) > 0) {
    conditions.push('d.player_in_session_id = ?');
    values.push(integer(row.match_player_in_session_id));
  }
  if (integer(row.stracker_player_id) > 0) {
    conditions.push('d.player_id = ?');
    values.push(integer(row.stracker_player_id));
  }
  if (text(row.steam_guid)) {
    conditions.push('LOWER(d.steam_guid) = LOWER(?)');
    values.push(text(row.steam_guid));
  }
  if (!integer(row.stracker_session_id) || !conditions.length) return null;

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT d.*
    FROM gc_stracker_session_driver d
    WHERE d.session_id = ? AND (${conditions.join(' OR ')})
    ORDER BY
      (d.player_in_session_id = ?) DESC,
      (d.player_id = ?) DESC,
      (LOWER(COALESCE(d.steam_guid, '')) = LOWER(?)) DESC,
      d.id ASC
    LIMIT 1
  `, [
    ...values,
    integer(row.match_player_in_session_id),
    integer(row.stracker_player_id),
    text(row.steam_guid)
  ]);
  return (rows as any[])[0] || null;
}

async function readMirrorLaps(db: Pool, row: any, driver: any) {
  if (!driver || !integer(row.stracker_session_id)) return [];
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT l.id, l.lap_number, l.lap_time_ms, l.valid, l.cuts,
      l.collisions_car, l.collisions_env
    FROM gc_stracker_lap l
    WHERE l.session_id = ? AND l.player_in_session_id = ?
    ORDER BY l.lap_number ASC, l.id ASC
  `, [integer(row.stracker_session_id), integer(driver.player_in_session_id)]);
  return (rows as any[]).map((lap) => ({
    id: integer(lap.id),
    lapNumber: integer(lap.lap_number),
    lapTimeMs: integer(lap.lap_time_ms),
    valid: Boolean(lap.valid),
    cuts: integer(lap.cuts),
    collisionsCar: integer(lap.collisions_car),
    collisionsEnv: integer(lap.collisions_env)
  }));
}

function classify(row: any, notes: string[], mirrorDriver: any, mirrorLaps: any[], minConfidence: number) {
  const confidence = number(row.match_confidence);
  const noteText = notes.join(' ').toLowerCase();
  const usableLaps = mirrorLaps.filter((lap) => number(lap.lapTimeMs) > 0).length;
  const reasons: string[] = [];

  if (!integer(row.stracker_session_id)) reasons.push('missing-stracker-session-link');
  if (confidence < minConfidence) reasons.push('low-confidence-stracker-match');
  if (!integer(row.match_player_in_session_id) && !integer(row.stracker_player_id) && !text(row.steam_guid)) {
    reasons.push('missing-driver-match-identifiers');
  }
  if (integer(row.stracker_session_id) && !mirrorDriver) reasons.push('matched-driver-not-found-in-mirror');
  if (mirrorDriver && usableLaps === 0) reasons.push('no-usable-stracker-laps');
  if (noteText.includes('congel') || noteText.includes('sin telemetría')) reasons.push('stored-telemetry-freeze-note');

  const uniqueReasons = [...new Set(reasons)];
  const telemetryReliableNow = Boolean(
    integer(row.stracker_session_id) &&
    mirrorDriver &&
    usableLaps > 0 &&
    confidence >= minConfidence
  );

  return {
    classification: uniqueReasons.length ? 'telemetry-freeze' : 'zero-economy-delta',
    reasons: uniqueReasons,
    telemetryReliableNow,
    usableLaps
  };
}

export async function readMysqlPortimaoSrFreezeAuditV1() {
  const db = await createPool();
  const minConfidence = number(process.env.GC_SR_MIN_STRACKER_MATCH_CONFIDENCE, DEFAULT_MIN_CONFIDENCE);
  try {
    const [candidateRows] = await db.query<RowDataPacket[]>(`
      SELECT e.id, e.event_id, e.event_name, e.event_date, e.source_key,
        e.championship_id, e.championship_name, e.event_scope_key,
        e.stracker_session_id, e.driver_key, e.steam_guid, e.stracker_player_id,
        e.display_name, e.car, e.position, e.laps, e.best_lap_ms,
        e.old_sr, e.new_sr, e.delta_sr, e.incident_points, e.clean_race,
        e.dnf, e.dsq, e.processed_at, e.match_confidence, e.match_method,
        e.match_best_lap_diff_ms, e.match_lap_diff, e.match_player_in_session_id,
        e.notes, e.raw_collision_count, e.collision_cluster_count,
        e.suppressed_collision_count, e.cluster_window_seconds,
        s.track_raw, s.track_display, s.type AS stracker_session_type,
        s.start_time AS stracker_start_time, s.end_time AS stracker_end_time,
        s.player_count AS stracker_player_count, s.lap_count AS stracker_lap_count,
        s.max_lap_count AS stracker_max_lap_count,
        (SELECT COUNT(*) FROM gc_rating_lap_detail ld WHERE ld.event_result_id=e.id) stored_lap_rows,
        (SELECT COALESCE(SUM(ld.valid=1),0) FROM gc_rating_lap_detail ld WHERE ld.event_result_id=e.id) stored_valid_laps,
        (SELECT COALESCE(SUM(ld.cuts),0) FROM gc_rating_lap_detail ld WHERE ld.event_result_id=e.id) stored_cuts,
        (SELECT COALESCE(SUM(ld.collisions_car),0) FROM gc_rating_lap_detail ld WHERE ld.event_result_id=e.id) stored_collisions_car,
        (SELECT COALESCE(SUM(ld.collisions_env),0) FROM gc_rating_lap_detail ld WHERE ld.event_result_id=e.id) stored_collisions_env,
        (SELECT COUNT(*) FROM gc_rating_incident i WHERE i.event_result_id=e.id) stored_incident_rows
      FROM gc_rating_event_result e
      LEFT JOIN gc_stracker_session s ON s.session_id=e.stracker_session_id
      WHERE e.source_key = ?
        AND e.event_id = ?
      ORDER BY COALESCE(e.event_date,e.processed_at),e.position,e.display_name,e.id
    `, [TARGET_SOURCE_KEY, TARGET_EVENT_ID]);

    const results = [];
    for (const row of candidateRows as any[]) {
      const notes = parseNotes(row.notes);
      const mirrorDriver = await readMirrorDriver(db, row);
      const mirrorLaps = await readMirrorLaps(db, row, mirrorDriver);
      const diagnosis = classify(row, notes, mirrorDriver, mirrorLaps, minConfidence);
      const simulation = buildSrComputation({
        eventId: text(row.event_id),
        eventResultId: text(row.id),
        driverKey: text(row.driver_key),
        oldSr: number(row.old_sr, 80),
        laps: mirrorLaps,
        officialResult: {
          numLaps: integer(row.laps),
          dnf: Boolean(row.dnf),
          dsq: Boolean(row.dsq),
          disqualified: Boolean(row.dsq),
          __srTelemetryReliable: diagnosis.telemetryReliableNow
        },
        matchedRow: mirrorDriver,
        maxRaceLaps: integer(row.stracker_max_lap_count, integer(row.laps))
      });
      const simulationBreakdown = simulation.breakdown as any;

      results.push({
        resultId: text(row.id),
        eventId: text(row.event_id),
        eventName: text(row.event_name),
        eventDate: row.event_date,
        sourceKey: text(row.source_key),
        championshipId: text(row.championship_id) || null,
        championshipName: text(row.championship_name) || null,
        driverKey: text(row.driver_key),
        steamGuid: text(row.steam_guid) || null,
        strackerPlayerId: row.stracker_player_id == null ? null : integer(row.stracker_player_id),
        displayName: text(row.display_name),
        car: text(row.car),
        position: integer(row.position),
        stored: {
          oldSr: number(row.old_sr),
          newSr: number(row.new_sr),
          deltaSr: number(row.delta_sr),
          isFrozenOrZero: (
            Math.abs(number(row.delta_sr, number(row.new_sr) - number(row.old_sr))) < 0.005 &&
            Math.abs(number(row.new_sr) - number(row.old_sr)) < 0.011
          ),
          incidentPoints: number(row.incident_points),
          cleanRace: Boolean(row.clean_race),
          laps: integer(row.laps),
          lapRows: integer(row.stored_lap_rows),
          validLaps: integer(row.stored_valid_laps),
          cuts: integer(row.stored_cuts),
          collisionsCar: integer(row.stored_collisions_car),
          collisionsEnv: integer(row.stored_collisions_env),
          incidentRows: integer(row.stored_incident_rows),
          notes
        },
        match: {
          confidence: number(row.match_confidence),
          minimumConfidence: minConfidence,
          method: text(row.match_method) || null,
          strackerSessionId: row.stracker_session_id == null ? null : integer(row.stracker_session_id),
          playerInSessionId: row.match_player_in_session_id == null ? null : integer(row.match_player_in_session_id),
          bestLapDiffMs: row.match_best_lap_diff_ms == null ? null : integer(row.match_best_lap_diff_ms),
          lapDiff: row.match_lap_diff == null ? null : integer(row.match_lap_diff)
        },
        stracker: {
          sessionFound: Boolean(row.stracker_session_id && (row.track_raw != null || row.track_display != null)),
          trackRaw: text(row.track_raw) || null,
          trackDisplay: text(row.track_display) || null,
          sessionType: text(row.stracker_session_type) || null,
          startTime: row.stracker_start_time,
          endTime: row.stracker_end_time,
          playerCount: integer(row.stracker_player_count),
          sessionLapCount: integer(row.stracker_lap_count),
          maxLapCount: integer(row.stracker_max_lap_count),
          driverFound: Boolean(mirrorDriver),
          driver: mirrorDriver ? {
            playerId: mirrorDriver.player_id == null ? null : integer(mirrorDriver.player_id),
            playerInSessionId: integer(mirrorDriver.player_in_session_id),
            name: text(mirrorDriver.driver_name),
            steamGuid: text(mirrorDriver.steam_guid) || null,
            laps: integer(mirrorDriver.laps),
            bestLapMs: integer(mirrorDriver.best_lap_ms),
            cuts: integer(mirrorDriver.cuts),
            collisionsCar: integer(mirrorDriver.collisions_car),
            collisionsEnv: integer(mirrorDriver.collisions_env),
            raceFinished: Boolean(mirrorDriver.race_finished)
          } : null,
          lapRows: mirrorLaps.length,
          usableLaps: diagnosis.usableLaps,
          validLaps: mirrorLaps.filter((lap) => lap.valid).length,
          cuts: mirrorLaps.reduce((sum, lap) => sum + integer(lap.cuts), 0),
          collisionsCar: mirrorLaps.reduce((sum, lap) => sum + integer(lap.collisionsCar), 0),
          collisionsEnv: mirrorLaps.reduce((sum, lap) => sum + integer(lap.collisionsEnv), 0)
        },
        diagnosis: {
          ...diagnosis,
          currentModelSimulation: {
            oldSr: simulation.oldSr,
            newSr: simulation.newSr,
            deltaSr: simulation.deltaSr,
            telemetryReliable: Boolean(simulationBreakdown?.telemetryReliable),
            positiveCap: simulationBreakdown?.positiveCap ?? null,
            negativeCap: simulationBreakdown?.negativeCap ?? null,
            rawDelta: simulationBreakdown?.rawDelta ?? null,
            explanations: simulation.explanations
          }
        }
      });
    }

    const frozenOrZero = results.filter((row) => row.stored.isFrozenOrZero);
    const telemetryFreezes = frozenOrZero.filter((row) => row.diagnosis.classification === 'telemetry-freeze');
    const zeroEconomy = frozenOrZero.filter((row) => row.diagnosis.classification === 'zero-economy-delta');
    const nowRecoverable = frozenOrZero.filter((row) =>
      row.diagnosis.telemetryReliableNow &&
      Math.abs(number(row.diagnosis.currentModelSimulation.deltaSr)) >= 0.005
    );
    const expectedSeven = results.length === 7;

    return {
      ok: true,
      source: 'gc-ratings-v1:portimao-sr-freeze:mysql',
      version: VERSION,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      safeToContinue: expectedSeven,
      summary: {
        targetEventResults: results.length,
        frozenOrZeroResults: frozenOrZero.length,
        expectedResults: 7,
        expectedSeven,
        telemetryFreezes: telemetryFreezes.length,
        zeroEconomyDeltas: zeroEconomy.length,
        currentlyRecoverableWithTelemetry: nowRecoverable.length,
        belowConfidenceThreshold: results.filter((row) => row.match.confidence < minConfidence).length,
        missingSessionLinks: results.filter((row) => !row.match.strackerSessionId).length,
        missingMirrorDrivers: results.filter((row) => !row.stracker.driverFound).length,
        missingUsableLaps: results.filter((row) => row.stracker.usableLaps === 0).length
      },
      thresholds: {
        minimumStrackerMatchConfidence: minConfidence,
        frozenDeltaTolerance: 0.005,
        storedSrEqualityTolerance: 0.011
      },
      target: {
        sourceKey: TARGET_SOURCE_KEY,
        eventId: TARGET_EVENT_ID
      },
      results,
      conclusions: {
        requiresCorrectionPlan: frozenOrZero.length > 0 && nowRecoverable.length > 0,
        correctionNotIncluded: true,
        reason: expectedSeven
          ? frozenOrZero.length > 0
            ? `Se han localizado los siete resultados; ${frozenOrZero.length} siguen congelados o con delta cero. Este auditor no modifica ni reprocesa datos.`
            : 'Se han localizado los siete resultados y ninguno sigue congelado o con delta cero. No corresponde preparar una corrección.'
          : `Se esperaban siete resultados y se han localizado ${results.length}; no debe prepararse una corrección hasta resolver la diferencia.`
      },
      message: expectedSeven
        ? frozenOrZero.length > 0
          ? `Auditoría completada: ${frozenOrZero.length} de los siete resultados siguen congelados o con delta cero.`
          : 'Auditoría completada: los siete resultados existen y ninguno continúa congelado.'
        : `Revisión bloqueada: se esperaban siete resultados SR de Portimão y se han localizado ${results.length}.`
    };
  } finally {
    await db.end();
  }
}
