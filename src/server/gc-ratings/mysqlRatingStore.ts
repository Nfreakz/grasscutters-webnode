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
          host: process.env.MYSQL_HOST?.trim(),
          port: Number(process.env.MYSQL_PORT || 3306),
          database: process.env.MYSQL_DATABASE?.trim(),
          user: process.env.MYSQL_USER?.trim(),
          password: process.env.MYSQL_PASSWORD ?? '',
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

    const drivers: DriverRatingState[] = (driversRows as any[]).map((row) => ({
      driverKey: row.driver_key,
      steamGuid: row.steam_guid,
      strackerPlayerId: row.stracker_player_id ?? null,
      displayName: row.display_name,
      srScore: Number(row.sr_score || 0),
      srClass: row.sr_class,
      gsrMu: Number(row.gsr_mu || 0),
      gsrSigma: Number(row.gsr_sigma || 0),
      gsrRating: Number(row.gsr_rating || 0),
      gsrClass: row.gsr_class,
      racesCount: Number(row.races_count || 0),
      cleanRaces: Number(row.clean_races || 0),
      wins: Number(row.wins || 0),
      podiums: Number(row.podiums || 0),
      incidentPointsTotal: Number(row.incident_points_total || 0),
      lastDeltaSr: Number(row.last_delta_sr || 0),
      lastDeltaGsr: Number(row.last_delta_gsr || 0),
      lastEventId: row.last_event_id ?? null,
      lastRaceAt: mysqlToIso(row.last_race_at),
      createdAt: mysqlToIso(row.created_at) || new Date().toISOString(),
      updatedAt: mysqlToIso(row.updated_at) || new Date().toISOString()
    }));

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
      oldSr: Number(row.old_sr || 0),
      newSr: Number(row.new_sr || 0),
      deltaSr: Number(row.delta_sr || 0),
      oldGsr: Number(row.old_gsr || 0),
      newGsr: Number(row.new_gsr || 0),
      deltaGsr: Number(row.delta_gsr || 0),
      gsrMuBefore: Number(row.gsr_mu_before || 0),
      gsrMuAfter: Number(row.gsr_mu_after || 0),
      gsrSigmaBefore: Number(row.gsr_sigma_before || 0),
      gsrSigmaAfter: Number(row.gsr_sigma_after || 0),
      incidentPoints: Number(row.incident_points || 0),
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
}

