import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RatingStore } from './ratingStore';
import type { DriverRatingState, RatingEventResult, RatingIncident, RatingLapDetail, RatingsSnapshot, RecalculationLog } from './types';

function isoToMysql(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function mysqlToIso(value: unknown) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function mysqlNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mysqlInt(value: unknown, fallback = 0) {
  return Math.round(mysqlNumber(value, fallback));
}

function mysqlSr(value: unknown, fallback = 80) {
  return mysqlNumber(value, fallback);
}

function mysqlGsr(value: unknown, fallback = 1500) {
  return mysqlInt(value, fallback);
}

function mysqlDriverRatingState(row: any): DriverRatingState {
  return {
    driverKey: row.driver_key,
    steamGuid: row.steam_guid,
    strackerPlayerId: row.stracker_player_id ?? null,
    displayName: row.display_name,
    srScore: mysqlSr(row.sr_score, 80),
    srClass: row.sr_class,
    gsrMu: mysqlNumber(row.gsr_mu, 25),
    gsrSigma: mysqlNumber(row.gsr_sigma, 25 / 3),
    gsrRating: mysqlGsr(row.gsr_rating, 1500),
    gsrClass: row.gsr_class,
    racesCount: mysqlInt(row.races_count, 0),
    cleanRaces: mysqlInt(row.clean_races, 0),
    wins: mysqlInt(row.wins, 0),
    podiums: mysqlInt(row.podiums, 0),
    incidentPointsTotal: mysqlNumber(row.incident_points_total, 0),
    lastDeltaSr: mysqlNumber(row.last_delta_sr, 0),
    lastDeltaGsr: mysqlInt(row.last_delta_gsr, 0),
    lastEventId: row.last_event_id ?? null,
    lastRaceAt: mysqlToIso(row.last_race_at),
    createdAt: mysqlToIso(row.created_at) || new Date().toISOString(),
    updatedAt: mysqlToIso(row.updated_at) || new Date().toISOString()
  };
}

export class MysqlRatingStore implements RatingStore {
  kind = 'mysql' as const;
  private poolPromise: Promise<Pool> | null = null;
  private schemaReady = false;

  private async getPool() {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const mod: any = await import('mysql2/promise');
        const mysql = mod.default ?? mod;
        return mysql.createPool({
          host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
          port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
          database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
          user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
          password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
          waitForConnections: true,
          connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
          charset: 'utf8mb4',
          timezone: 'Z'
        });
      })();
    }
    return this.poolPromise;
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    const pool = await this.getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gc_driver_rating (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        driver_key VARCHAR(191) NOT NULL UNIQUE,
        steam_guid VARCHAR(191) NULL,
        stracker_player_id INT NULL,
        display_name VARCHAR(255) NOT NULL,
        sr_score DECIMAL(6,2) NOT NULL,
        sr_class VARCHAR(8) NOT NULL,
        gsr_mu DECIMAL(10,4) NOT NULL,
        gsr_sigma DECIMAL(10,4) NOT NULL,
        gsr_rating INT NOT NULL,
        gsr_class VARCHAR(16) NOT NULL,
        races_count INT NOT NULL,
        clean_races INT NOT NULL,
        wins INT NOT NULL DEFAULT 0,
        podiums INT NOT NULL DEFAULT 0,
        incident_points_total DECIMAL(10,2) NOT NULL,
        last_delta_sr DECIMAL(6,2) NOT NULL DEFAULT 0,
        last_delta_gsr INT NOT NULL DEFAULT 0,
        last_event_id VARCHAR(191) NULL,
        last_race_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        KEY idx_gc_driver_rating_sr (sr_score),
        KEY idx_gc_driver_rating_gsr (gsr_rating),
        KEY idx_gc_driver_rating_player (stracker_player_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gc_rating_event_result (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        event_id VARCHAR(191) NOT NULL,
        event_name VARCHAR(255) NOT NULL,
        event_date DATETIME(3) NULL,
        stracker_session_id INT NULL,
        driver_key VARCHAR(191) NOT NULL,
        steam_guid VARCHAR(191) NULL,
        stracker_player_id INT NULL,
        display_name VARCHAR(255) NOT NULL,
        car VARCHAR(255) NOT NULL,
        position INT NOT NULL,
        points DECIMAL(10,2) NOT NULL,
        laps INT NOT NULL DEFAULT 0,
        best_lap_ms INT NOT NULL DEFAULT 0,
        old_sr DECIMAL(6,2) NOT NULL,
        new_sr DECIMAL(6,2) NOT NULL,
        delta_sr DECIMAL(6,2) NOT NULL,
        old_gsr INT NOT NULL,
        new_gsr INT NOT NULL,
        delta_gsr INT NOT NULL,
        gsr_mu_before DECIMAL(10,4) NOT NULL,
        gsr_mu_after DECIMAL(10,4) NOT NULL,
        gsr_sigma_before DECIMAL(10,4) NOT NULL,
        gsr_sigma_after DECIMAL(10,4) NOT NULL,
        incident_points DECIMAL(10,2) NOT NULL,
        clean_race TINYINT(1) NOT NULL,
        dnf TINYINT(1) NOT NULL,
        dsq TINYINT(1) NOT NULL,
        processed_at DATETIME(3) NOT NULL,
        match_confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
        match_method VARCHAR(120) NOT NULL,
        match_best_lap_diff_ms INT NULL,
        match_lap_diff INT NULL,
        match_player_in_session_id INT NULL,
        notes LONGTEXT NULL,
        KEY idx_gc_rating_event_result_event (event_id, position),
        KEY idx_gc_rating_event_result_driver (driver_key),
        KEY idx_gc_rating_event_result_player (stracker_player_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gc_rating_incident (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        event_result_id VARCHAR(80) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        driver_key VARCHAR(191) NOT NULL,
        lap_number INT NULL,
        type VARCHAR(40) NOT NULL,
        count INT NOT NULL,
        sr_delta DECIMAL(6,2) NOT NULL,
        description TEXT NOT NULL,
        source VARCHAR(80) NOT NULL,
        KEY idx_gc_rating_incident_result (event_result_id),
        KEY idx_gc_rating_incident_driver (driver_key),
        KEY idx_gc_rating_incident_event (event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gc_rating_lap_detail (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        event_result_id VARCHAR(80) NOT NULL,
        lap_number INT NOT NULL,
        lap_time_ms INT NOT NULL,
        valid TINYINT(1) NOT NULL,
        cuts INT NOT NULL,
        collisions_car INT NOT NULL,
        collisions_env INT NOT NULL,
        sr_delta DECIMAL(6,2) NOT NULL,
        notes TEXT NULL,
        KEY idx_gc_rating_lap_detail_result (event_result_id),
        KEY idx_gc_rating_lap_detail_lap (lap_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gc_rating_recalculation_log (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        event_id VARCHAR(191) NULL,
        mode VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    this.schemaReady = true;
  }

  async load() {
    await this.ensureSchema();
    const pool = await this.getPool();
    const [driversRows] = await pool.query('SELECT * FROM gc_driver_rating ORDER BY gsr_rating DESC, sr_score DESC, display_name ASC');
    const [resultRows] = await pool.query('SELECT * FROM gc_rating_event_result ORDER BY event_date ASC, processed_at ASC, position ASC');
    const [incidentRows] = await pool.query('SELECT * FROM gc_rating_incident ORDER BY event_id ASC, event_result_id ASC, lap_number ASC');
    const [lapRows] = await pool.query('SELECT * FROM gc_rating_lap_detail ORDER BY event_result_id ASC, lap_number ASC');
    const [logRows] = await pool.query('SELECT * FROM gc_rating_recalculation_log ORDER BY created_at ASC');

    const incidentsByResult = new Map<string, RatingIncident[]>();
    for (const row of incidentRows as any[]) {
      const incident: RatingIncident = {
        id: row.id,
        eventResultId: row.event_result_id,
        eventId: row.event_id,
        driverKey: row.driver_key,
        lapNumber: row.lap_number ?? null,
        type: row.type,
        count: Number(row.count || 0),
        srDelta: Number(row.sr_delta || 0),
        description: row.description,
        source: row.source
      };
      const bucket = incidentsByResult.get(incident.eventResultId) || [];
      bucket.push(incident);
      incidentsByResult.set(incident.eventResultId, bucket);
    }

    const lapsByResult = new Map<string, RatingLapDetail[]>();
    for (const row of lapRows as any[]) {
      const lap: RatingLapDetail = {
        id: row.id,
        eventResultId: row.event_result_id,
        lapNumber: Number(row.lap_number || 0),
        lapTimeMs: Number(row.lap_time_ms || 0),
        valid: Boolean(row.valid),
        cuts: Number(row.cuts || 0),
        collisionsCar: Number(row.collisions_car || 0),
        collisionsEnv: Number(row.collisions_env || 0),
        srDelta: Number(row.sr_delta || 0),
        notes: row.notes || ''
      };
      const bucket = lapsByResult.get(lap.eventResultId) || [];
      bucket.push(lap);
      lapsByResult.set(lap.eventResultId, bucket);
    }

    const drivers: DriverRatingState[] = (driversRows as any[]).map((row) => mysqlDriverRatingState(row));

    const eventResults: RatingEventResult[] = (resultRows as any[]).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      eventDate: mysqlToIso(row.event_date),
      strackerSessionId: row.stracker_session_id ?? null,
      driverKey: row.driver_key,
      steamGuid: row.steam_guid,
      strackerPlayerId: row.stracker_player_id ?? null,
      displayName: row.display_name,
      car: row.car,
      position: Number(row.position || 0),
      points: Number(row.points || 0),
      laps: Number(row.laps || 0),
      bestLapMs: Number(row.best_lap_ms || 0),
      bestLap: '',
      oldSr: mysqlSr(row.old_sr, 80),
      newSr: mysqlSr(row.new_sr, 80),
      deltaSr: mysqlNumber(row.delta_sr, 0),
      oldGsr: mysqlGsr(row.old_gsr, 1500),
      newGsr: mysqlGsr(row.new_gsr, 1500),
      deltaGsr: mysqlInt(row.delta_gsr, 0),
      gsrMuBefore: mysqlNumber(row.gsr_mu_before, 25),
      gsrMuAfter: mysqlNumber(row.gsr_mu_after, 25),
      gsrSigmaBefore: mysqlNumber(row.gsr_sigma_before, 25 / 3),
      gsrSigmaAfter: mysqlNumber(row.gsr_sigma_after, 25 / 3),
      incidentPoints: mysqlNumber(row.incident_points, 0),
      cleanRace: Boolean(row.clean_race),
      dnf: Boolean(row.dnf),
      dsq: Boolean(row.dsq),
      processedAt: mysqlToIso(row.processed_at) || new Date().toISOString(),
      incidents: incidentsByResult.get(row.id) || [],
      lapsDetail: lapsByResult.get(row.id) || [],
      match: {
        confidence: Number(row.match_confidence || 0),
        method: row.match_method,
        bestLapDiffMs: row.match_best_lap_diff_ms ?? null,
        lapDiff: row.match_lap_diff ?? null,
        strackerPlayerInSessionId: row.match_player_in_session_id ?? null,
        strackerSessionId: row.stracker_session_id ?? null
      },
      notes: row.notes ? JSON.parse(row.notes) : []
    }));

    const recalculationLogs: RecalculationLog[] = (logRows as any[]).map((row) => ({
      id: row.id,
      eventId: row.event_id ?? null,
      mode: row.mode,
      status: row.status,
      message: row.message,
      createdAt: mysqlToIso(row.created_at) || new Date().toISOString()
    }));

    if (!drivers.length && !eventResults.length) return null;

    const processedEventIds = [...new Set(eventResults.map((row) => row.eventId))];
    const lastLog = recalculationLogs[recalculationLogs.length - 1];

    return {
      version: 1,
      championshipId: 'unknown',
      championshipName: 'GrassCutters Ratings',
      source: 'gc-ratings-mysql',
      storage: 'mysql',
      strackerDbPath: null,
      generatedAt: lastLog?.createdAt || new Date().toISOString(),
      processedEventIds,
      drivers,
      eventResults,
      recalculationLogs
    } as RatingsSnapshot;
  }

  async save(snapshot: RatingsSnapshot) {
    await this.ensureSchema();
    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM gc_rating_lap_detail');
      await connection.query('DELETE FROM gc_rating_incident');
      await connection.query('DELETE FROM gc_rating_event_result');
      await connection.query('DELETE FROM gc_driver_rating');
      await connection.query('DELETE FROM gc_rating_recalculation_log');

      for (const driver of snapshot.drivers) {
        await connection.query(`
          INSERT INTO gc_driver_rating
          (driver_key, steam_guid, stracker_player_id, display_name, sr_score, sr_class, gsr_mu, gsr_sigma, gsr_rating, gsr_class, races_count, clean_races, wins, podiums, incident_points_total, last_delta_sr, last_delta_gsr, last_event_id, last_race_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          driver.driverKey,
          driver.steamGuid,
          driver.strackerPlayerId,
          driver.displayName,
          mysqlNumber(driver.srScore),
          driver.srClass,
          mysqlNumber(driver.gsrMu),
          mysqlNumber(driver.gsrSigma),
          mysqlInt(driver.gsrRating),
          driver.gsrClass,
          mysqlInt(driver.racesCount),
          mysqlInt(driver.cleanRaces),
          mysqlInt(driver.wins),
          mysqlInt(driver.podiums),
          mysqlNumber(driver.incidentPointsTotal),
          mysqlNumber(driver.lastDeltaSr),
          mysqlInt(driver.lastDeltaGsr),
          driver.lastEventId,
          isoToMysql(driver.lastRaceAt),
          isoToMysql(driver.createdAt),
          isoToMysql(driver.updatedAt)
        ]);
      }

      for (const result of snapshot.eventResults) {
        await connection.query(`
          INSERT INTO gc_rating_event_result
          (id, event_id, event_name, event_date, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          result.id,
          result.eventId,
          result.eventName,
          isoToMysql(result.eventDate),
          result.strackerSessionId,
          result.driverKey,
          result.steamGuid,
          result.strackerPlayerId,
          result.displayName,
          result.car,
          mysqlInt(result.position),
          mysqlNumber(result.points),
          mysqlInt(result.laps),
          mysqlInt(result.bestLapMs),
          mysqlNumber(result.oldSr),
          mysqlNumber(result.newSr),
          mysqlNumber(result.deltaSr),
          mysqlInt(result.oldGsr),
          mysqlInt(result.newGsr),
          mysqlInt(result.deltaGsr),
          mysqlNumber(result.gsrMuBefore),
          mysqlNumber(result.gsrMuAfter),
          mysqlNumber(result.gsrSigmaBefore),
          mysqlNumber(result.gsrSigmaAfter),
          mysqlNumber(result.incidentPoints),
          result.cleanRace ? 1 : 0,
          result.dnf ? 1 : 0,
          result.dsq ? 1 : 0,
          isoToMysql(result.processedAt),
          mysqlNumber(result.match?.confidence),
          result.match.method,
          Number.isFinite(Number(result.match?.bestLapDiffMs)) ? Number(result.match.bestLapDiffMs) : null,
          Number.isFinite(Number(result.match?.lapDiff)) ? Number(result.match.lapDiff) : null,
          Number.isFinite(Number(result.match?.strackerPlayerInSessionId)) ? Number(result.match.strackerPlayerInSessionId) : null,
          JSON.stringify(result.notes || [])
        ]);

        for (const incident of result.incidents) {
          await connection.query(`
            INSERT INTO gc_rating_incident
            (id, event_result_id, event_id, driver_key, lap_number, type, count, sr_delta, description, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            incident.id,
            incident.eventResultId,
            incident.eventId,
            incident.driverKey,
            incident.lapNumber,
            incident.type,
            mysqlInt(incident.count),
            mysqlNumber(incident.srDelta),
            incident.description,
            incident.source
          ]);
        }

        for (const lap of result.lapsDetail) {
          await connection.query(`
            INSERT INTO gc_rating_lap_detail
            (id, event_result_id, lap_number, lap_time_ms, valid, cuts, collisions_car, collisions_env, sr_delta, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            lap.id,
            lap.eventResultId,
            mysqlInt(lap.lapNumber),
            mysqlInt(lap.lapTimeMs),
            lap.valid ? 1 : 0,
            mysqlInt(lap.cuts),
            mysqlInt(lap.collisionsCar),
            mysqlInt(lap.collisionsEnv),
            mysqlNumber(lap.srDelta),
            lap.notes
          ]);
        }
      }

      for (const log of snapshot.recalculationLogs) {
        await connection.query(`
          INSERT INTO gc_rating_recalculation_log (id, event_id, mode, status, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [log.id, log.eventId, log.mode, log.status, log.message, isoToMysql(log.createdAt)]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async upsertDriver(connection: PoolConnection, driver: DriverRatingState) {
    await connection.query(`
      INSERT INTO gc_driver_rating
      (driver_key, steam_guid, stracker_player_id, display_name, sr_score, sr_class, gsr_mu, gsr_sigma, gsr_rating, gsr_class, races_count, clean_races, wins, podiums, incident_points_total, last_delta_sr, last_delta_gsr, last_event_id, last_race_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        steam_guid = VALUES(steam_guid),
        stracker_player_id = VALUES(stracker_player_id),
        display_name = VALUES(display_name),
        sr_score = VALUES(sr_score),
        sr_class = VALUES(sr_class),
        gsr_mu = VALUES(gsr_mu),
        gsr_sigma = VALUES(gsr_sigma),
        gsr_rating = VALUES(gsr_rating),
        gsr_class = VALUES(gsr_class),
        races_count = VALUES(races_count),
        clean_races = VALUES(clean_races),
        wins = VALUES(wins),
        podiums = VALUES(podiums),
        incident_points_total = VALUES(incident_points_total),
        last_delta_sr = VALUES(last_delta_sr),
        last_delta_gsr = VALUES(last_delta_gsr),
        last_event_id = VALUES(last_event_id),
        last_race_at = VALUES(last_race_at),
        updated_at = VALUES(updated_at)
    `, [
      driver.driverKey,
      driver.steamGuid,
      driver.strackerPlayerId,
      driver.displayName,
      mysqlSr(driver.srScore, 80),
      driver.srClass,
      mysqlNumber(driver.gsrMu, 25),
      mysqlNumber(driver.gsrSigma, 25 / 3),
      mysqlGsr(driver.gsrRating, 1500),
      driver.gsrClass,
      mysqlInt(driver.racesCount, 0),
      mysqlInt(driver.cleanRaces, 0),
      mysqlInt(driver.wins, 0),
      mysqlInt(driver.podiums, 0),
      mysqlNumber(driver.incidentPointsTotal, 0),
      mysqlNumber(driver.lastDeltaSr, 0),
      mysqlInt(driver.lastDeltaGsr, 0),
      driver.lastEventId,
      isoToMysql(driver.lastRaceAt),
      isoToMysql(driver.createdAt),
      isoToMysql(driver.updatedAt)
    ]);
  }

  private async insertEventResult(connection: PoolConnection, result: RatingEventResult) {
    await connection.query(`
      INSERT INTO gc_rating_event_result
      (id, event_id, event_name, event_date, stracker_session_id, driver_key, steam_guid, stracker_player_id, display_name, car, position, points, laps, best_lap_ms, old_sr, new_sr, delta_sr, old_gsr, new_gsr, delta_gsr, gsr_mu_before, gsr_mu_after, gsr_sigma_before, gsr_sigma_after, incident_points, clean_race, dnf, dsq, processed_at, match_confidence, match_method, match_best_lap_diff_ms, match_lap_diff, match_player_in_session_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      result.id,
      result.eventId,
      result.eventName,
      isoToMysql(result.eventDate),
      result.strackerSessionId,
      result.driverKey,
      result.steamGuid,
      result.strackerPlayerId,
      result.displayName,
      result.car,
      mysqlInt(result.position),
      mysqlNumber(result.points),
      mysqlInt(result.laps),
      mysqlInt(result.bestLapMs),
      mysqlSr(result.oldSr, 80),
      mysqlSr(result.newSr, 80),
      mysqlNumber(result.deltaSr, 0),
      mysqlGsr(result.oldGsr, 1500),
      mysqlGsr(result.newGsr, 1500),
      mysqlInt(result.deltaGsr, 0),
      mysqlNumber(result.gsrMuBefore, 25),
      mysqlNumber(result.gsrMuAfter, 25),
      mysqlNumber(result.gsrSigmaBefore, 25 / 3),
      mysqlNumber(result.gsrSigmaAfter, 25 / 3),
      mysqlNumber(result.incidentPoints, 0),
      result.cleanRace ? 1 : 0,
      result.dnf ? 1 : 0,
      result.dsq ? 1 : 0,
      isoToMysql(result.processedAt),
      mysqlNumber(result.match?.confidence),
      result.match.method,
      Number.isFinite(Number(result.match?.bestLapDiffMs)) ? Number(result.match.bestLapDiffMs) : null,
      Number.isFinite(Number(result.match?.lapDiff)) ? Number(result.match.lapDiff) : null,
      Number.isFinite(Number(result.match?.strackerPlayerInSessionId)) ? Number(result.match.strackerPlayerInSessionId) : null,
      JSON.stringify(result.notes || [])
    ]);

    for (const incident of result.incidents) {
      await connection.query(`
        INSERT INTO gc_rating_incident
        (id, event_result_id, event_id, driver_key, lap_number, type, count, sr_delta, description, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        incident.id,
        incident.eventResultId,
        incident.eventId,
        incident.driverKey,
        incident.lapNumber,
        incident.type,
        mysqlInt(incident.count),
        mysqlNumber(incident.srDelta, 0),
        incident.description,
        incident.source
      ]);
    }

    for (const lap of result.lapsDetail) {
      await connection.query(`
        INSERT INTO gc_rating_lap_detail
        (id, event_result_id, lap_number, lap_time_ms, valid, cuts, collisions_car, collisions_env, sr_delta, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        lap.id,
        lap.eventResultId,
        mysqlInt(lap.lapNumber),
        mysqlInt(lap.lapTimeMs),
        lap.valid ? 1 : 0,
        mysqlInt(lap.cuts),
        mysqlInt(lap.collisionsCar),
        mysqlInt(lap.collisionsEnv),
        mysqlNumber(lap.srDelta, 0),
        lap.notes
      ]);
    }
  }

  async append(payload: {
    snapshot: RatingsSnapshot;
    drivers: DriverRatingState[];
    eventResults: RatingEventResult[];
    recalculationLogs: RecalculationLog[];
  }) {
    await this.ensureSchema();
    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const driver of payload.drivers) {
        await this.upsertDriver(connection, driver);
      }
      for (const result of payload.eventResults) {
        await this.insertEventResult(connection, result);
      }
      for (const log of payload.recalculationLogs) {
        await connection.query(`
          INSERT INTO gc_rating_recalculation_log (id, event_id, mode, status, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [log.id, log.eventId, log.mode, log.status, log.message, isoToMysql(log.createdAt)]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async diagnostics() {
    const configured = Boolean(
      (process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim()) &&
      (process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim()) &&
      (process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim())
    );
    if (!configured) {
      return { storage: 'mysql', mysqlConfigured: false, mysqlConnected: false };
    }

    try {
      await this.ensureSchema();
      const pool = await this.getPool();
      await pool.query('SELECT 1 AS ok');
      return { storage: 'mysql', mysqlConfigured: true, mysqlConnected: true };
    } catch {
      return { storage: 'mysql', mysqlConfigured: true, mysqlConnected: false };
    }
  }
}
