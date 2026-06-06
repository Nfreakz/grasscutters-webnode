import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'mysql2/promise';
import { cleanDisplayText, displayCarName, displayDriverName, displayTrackName, formatLapMs, textValue } from './utils';
import { getMysqlDatabaseName, hasMysqlConfig, readMysqlConnectionConfig } from './mysqlConnection';
import { openStrackerDb, readRaceDrivers, readRaceLaps, readRaceSession, resolveStrackerDbPath, verifyStrackerTables } from './strackerReader';

export type StrackerMirrorDriver = 'sqlite' | 'mysql';

type SqlJsDatabase = {
  run: (sql: string, params?: any[]) => void;
  prepare: (sql: string) => any;
  close: () => void;
  export: () => Uint8Array;
};

type MirrorBackend =
  | {
      driver: 'mysql';
      query: (sql: string, params?: any[]) => Promise<any[]>;
      run: (sql: string, params?: any[]) => Promise<void>;
      close: () => Promise<void>;
    }
  | {
      driver: 'sqlite';
      query: (sql: string, params?: any[]) => Promise<any[]>;
      run: (sql: string, params?: any[]) => Promise<void>;
      close: () => Promise<void>;
      save: () => Promise<void>;
    };

const SQLITE_MIRROR_PATH = path.join(process.cwd(), 'data', 'gc-stracker-mirror', 'stracker-mirror.sqlite');

let sqlJsPromise: Promise<any> | null = null;

function nowSqlDateTime() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}

function toSqlDateTime(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 23).replace('T', ' ');
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function isBooleanishTrue(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'on', 'yes'].includes(normalized);
  }
  return false;
}

async function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const mod: any = await import('sql.js');
      const initSqlJs = mod.default ?? mod;
      return initSqlJs();
    })();
  }
  return sqlJsPromise;
}

function getMirrorDriverFromEnv(): StrackerMirrorDriver {
  const explicit = String(process.env.GC_STRACKER_MIRROR_DRIVER || '').trim().toLowerCase();
  if (explicit === 'mysql' || explicit === 'sqlite') return explicit;
  return hasMysqlConfig() ? 'mysql' : 'sqlite';
}

function sqliteMirrorExists() {
  return fs.existsSync(SQLITE_MIRROR_PATH);
}

function ensureSqliteMirrorFolder() {
  fs.mkdirSync(path.dirname(SQLITE_MIRROR_PATH), { recursive: true });
}

async function openSqliteMirror(createIfMissing = true) {
  const SQL = await loadSqlJs();
  let db: SqlJsDatabase;

  if (sqliteMirrorExists()) {
    const bytes = new Uint8Array(fs.readFileSync(SQLITE_MIRROR_PATH));
    db = new SQL.Database(bytes);
  } else if (createIfMissing) {
    db = new SQL.Database();
  } else {
    return null;
  }

  db.run('PRAGMA foreign_keys = ON;');
  let dirty = false;

  return {
    driver: 'sqlite' as const,
    query: async (sql: string, params: any[] = []) => {
      const statement = db.prepare(sql);
      try {
        statement.bind(params);
        const rows: any[] = [];
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally {
        try { statement.free(); } catch {}
      }
    },
    run: async (sql: string, params: any[] = []) => {
      db.run(sql, params);
      dirty = true;
    },
    save: async () => {
      if (!dirty) return;
      ensureSqliteMirrorFolder();
      fs.writeFileSync(SQLITE_MIRROR_PATH, Buffer.from(db.export()));
      dirty = false;
    },
    close: async () => {
      try {
        await (dirty ? Promise.resolve().then(() => { ensureSqliteMirrorFolder(); fs.writeFileSync(SQLITE_MIRROR_PATH, Buffer.from(db.export())); }) : Promise.resolve());
      } finally {
        try { db.close(); } catch {}
      }
    }
  } satisfies MirrorBackend;
}

async function openMysqlPool() {
  const config = readMysqlConnectionConfig();
  if (!config) {
    throw new Error('MySQL no configurado. Define MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER o fuerza GC_STRACKER_MIRROR_DRIVER=sqlite.');
  }

  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    charset: 'utf8mb4',
    timezone: 'Z'
  }) as Pool;
}

async function openMysqlBackend(write = false) {
  const pool = await openMysqlPool();

  if (!write) {
    return {
      driver: 'mysql' as const,
      query: async (sql: string, params: any[] = []) => {
        const [rows] = await pool.query(sql, params);
        return rows as any[];
      },
      run: async (sql: string, params: any[] = []) => {
        await pool.query(sql, params);
      },
      close: async () => {
        try { await pool.end(); } catch {}
      }
    } satisfies MirrorBackend;
  }

  const connection = await pool.getConnection();
  return {
    driver: 'mysql' as const,
    query: async (sql: string, params: any[] = []) => {
      const [rows] = await connection.query(sql, params);
      return rows as any[];
    },
    run: async (sql: string, params: any[] = []) => {
      await connection.query(sql, params);
    },
    close: async () => {
      try { connection.release(); } catch {}
      try { await pool.end(); } catch {}
    }
  } satisfies MirrorBackend;
}

export function getStrackerMirrorDriver(): StrackerMirrorDriver {
  return getMirrorDriverFromEnv();
}

function sqliteMirrorPath() {
  return SQLITE_MIRROR_PATH;
}

export function getStrackerMirrorSqlitePath() {
  return SQLITE_MIRROR_PATH;
}

async function openMirrorBackend(write = false) {
  return getMirrorDriverFromEnv() === 'mysql'
    ? openMysqlBackend(write)
    : (await openSqliteMirror(write)) || (() => { throw new Error('No se pudo abrir el mirror SQLite local.'); })();
}

async function ensureSqliteSchema(backend: MirrorBackend) {
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_session (
      session_id INTEGER NOT NULL PRIMARY KEY,
      type TEXT NOT NULL,
      track_raw TEXT NULL,
      track_display TEXT NULL,
      combo_id INTEGER NULL,
      start_time TEXT NULL,
      end_time TEXT NULL,
      player_count INTEGER NOT NULL DEFAULT 0,
      lap_count INTEGER NOT NULL DEFAULT 0,
      max_lap_count INTEGER NOT NULL DEFAULT 0,
      best_lap_ms INTEGER NOT NULL DEFAULT 0,
      source_updated_at TEXT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_type ON gc_stracker_session(type)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_start_time ON gc_stracker_session(start_time)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_track ON gc_stracker_session(track_display)`);

  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_session_driver (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      player_id INTEGER NULL,
      player_in_session_id INTEGER NOT NULL,
      driver_name TEXT NOT NULL,
      steam_guid TEXT NULL,
      car_raw TEXT NULL,
      car_display TEXT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      laps INTEGER NOT NULL DEFAULT 0,
      best_lap_ms INTEGER NOT NULL DEFAULT 0,
      race_time_ms INTEGER NOT NULL DEFAULT 0,
      cuts INTEGER NOT NULL DEFAULT 0,
      collisions_car INTEGER NOT NULL DEFAULT 0,
      collisions_env INTEGER NOT NULL DEFAULT 0,
      race_finished INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_driver_session ON gc_stracker_session_driver(session_id)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_driver_player ON gc_stracker_session_driver(player_id)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_session_driver_guid ON gc_stracker_session_driver(steam_guid)`);

  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_lap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      player_id INTEGER NULL,
      player_in_session_id INTEGER NOT NULL,
      lap_number INTEGER NOT NULL,
      lap_time_ms INTEGER NOT NULL DEFAULT 0,
      valid INTEGER NOT NULL DEFAULT 0,
      cuts INTEGER NOT NULL DEFAULT 0,
      collisions_car INTEGER NOT NULL DEFAULT 0,
      collisions_env INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_lap_session ON gc_stracker_lap(session_id)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_lap_player ON gc_stracker_lap(player_id)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_lap_number ON gc_stracker_lap(lap_number)`);

  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_incident (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      player_id INTEGER NULL,
      type TEXT NOT NULL,
      lap_number INTEGER NULL,
      impact_speed REAL NULL,
      other_player_id INTEGER NULL,
      created_at TEXT NOT NULL
    )
  `);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_incident_session ON gc_stracker_incident(session_id)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_incident_player ON gc_stracker_incident(player_id)`);

  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL,
      sessions_seen INTEGER NOT NULL DEFAULT 0,
      sessions_imported INTEGER NOT NULL DEFAULT 0,
      drivers_imported INTEGER NOT NULL DEFAULT 0,
      laps_imported INTEGER NOT NULL DEFAULT 0,
      incidents_imported INTEGER NOT NULL DEFAULT 0,
      message TEXT NULL
    )
  `);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_sync_log_started ON gc_stracker_sync_log(started_at)`);
  await backend.run(`CREATE INDEX IF NOT EXISTS idx_gc_stracker_sync_log_status ON gc_stracker_sync_log(status)`);
}

async function ensureMysqlSchema(backend: MirrorBackend) {
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_session (
      session_id INT NOT NULL PRIMARY KEY,
      type VARCHAR(24) NOT NULL,
      track_raw VARCHAR(255) NULL,
      track_display VARCHAR(255) NULL,
      combo_id INT NULL,
      start_time DATETIME(3) NULL,
      end_time DATETIME(3) NULL,
      player_count INT NOT NULL DEFAULT 0,
      lap_count INT NOT NULL DEFAULT 0,
      max_lap_count INT NOT NULL DEFAULT 0,
      best_lap_ms INT NOT NULL DEFAULT 0,
      source_updated_at DATETIME(3) NULL,
      imported_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      KEY idx_gc_stracker_session_type (type),
      KEY idx_gc_stracker_session_start_time (start_time),
      KEY idx_gc_stracker_session_track (track_display)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_session_driver (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      player_id INT NULL,
      player_in_session_id INT NOT NULL,
      driver_name VARCHAR(255) NOT NULL,
      steam_guid VARCHAR(191) NULL,
      car_raw VARCHAR(255) NULL,
      car_display VARCHAR(255) NULL,
      position INT NOT NULL DEFAULT 0,
      laps INT NOT NULL DEFAULT 0,
      best_lap_ms INT NOT NULL DEFAULT 0,
      race_time_ms INT NOT NULL DEFAULT 0,
      cuts INT NOT NULL DEFAULT 0,
      collisions_car INT NOT NULL DEFAULT 0,
      collisions_env INT NOT NULL DEFAULT 0,
      race_finished TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      KEY idx_gc_stracker_session_driver_session (session_id),
      KEY idx_gc_stracker_session_driver_player (player_id),
      KEY idx_gc_stracker_session_driver_guid (steam_guid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_lap (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      player_id INT NULL,
      player_in_session_id INT NOT NULL,
      lap_number INT NOT NULL,
      lap_time_ms INT NOT NULL DEFAULT 0,
      valid TINYINT(1) NOT NULL DEFAULT 0,
      cuts INT NOT NULL DEFAULT 0,
      collisions_car INT NOT NULL DEFAULT 0,
      collisions_env INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      KEY idx_gc_stracker_lap_session (session_id),
      KEY idx_gc_stracker_lap_player (player_id),
      KEY idx_gc_stracker_lap_number (lap_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_incident (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      player_id INT NULL,
      type VARCHAR(40) NOT NULL,
      lap_number INT NULL,
      impact_speed DECIMAL(10,2) NULL,
      other_player_id INT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY idx_gc_stracker_incident_session (session_id),
      KEY idx_gc_stracker_incident_player (player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await backend.run(`
    CREATE TABLE IF NOT EXISTS gc_stracker_sync_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NOT NULL,
      status VARCHAR(20) NOT NULL,
      sessions_seen INT NOT NULL DEFAULT 0,
      sessions_imported INT NOT NULL DEFAULT 0,
      drivers_imported INT NOT NULL DEFAULT 0,
      laps_imported INT NOT NULL DEFAULT 0,
      incidents_imported INT NOT NULL DEFAULT 0,
      message TEXT NULL,
      KEY idx_gc_stracker_sync_log_started (started_at),
      KEY idx_gc_stracker_sync_log_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureBackendSchema(backend: MirrorBackend) {
  if (backend.driver === 'sqlite') return ensureSqliteSchema(backend);
  return ensureMysqlSchema(backend);
}

export async function ensureStrackerMirrorSchema() {
  const backend = await openMirrorBackend(true);
  try {
    await ensureBackendSchema(backend);
    if (backend.driver === 'sqlite') await backend.save();
  } finally {
    await backend.close();
  }
}

function buildIncidentRows(sessionId: number, playerId: number | null, laps: any[], createdAt: string) {
  const incidents: Array<{ session_id: number; player_id: number | null; type: string; lap_number: number | null; impact_speed: number | null; other_player_id: number | null; created_at: string }> = [];
  for (const lap of laps) {
    const lapNumber = toInt(lap.lapNumber, 0) || null;
    const cuts = toInt(lap.cuts, 0);
    const collisionsCar = toInt(lap.collisionsCar, 0);
    const collisionsEnv = toInt(lap.collisionsEnv, 0);
    if (cuts > 0) incidents.push({ session_id: sessionId, player_id: playerId, type: 'OFF_TRACK', lap_number: lapNumber, impact_speed: null, other_player_id: null, created_at: createdAt });
    if (collisionsCar > 0) incidents.push({ session_id: sessionId, player_id: playerId, type: 'CAR_CONTACT', lap_number: lapNumber, impact_speed: null, other_player_id: null, created_at: createdAt });
    if (collisionsEnv > 0) incidents.push({ session_id: sessionId, player_id: playerId, type: 'ENV_CONTACT', lap_number: lapNumber, impact_speed: null, other_player_id: null, created_at: createdAt });
  }
  return incidents;
}

function sessionSqliteRow(sessionId: number, session: any) {
  return {
    session_id: sessionId,
    type: String(session.SessionType || '').trim().toLowerCase(),
    track_raw: textValue(session.Track || '', '') || null,
    track_display: displayTrackName(session.UiTrackName || session.Track, 'Circuito'),
    combo_id: toInt(session.ComboId, 0) || null,
    start_time: toSqlDateTime(session.StartTimeDate),
    end_time: toSqlDateTime(session.EndTimeDate),
    player_count: toInt(session.PlayerCount, 0),
    lap_count: toInt(session.LapCount, 0),
    max_lap_count: toInt(session.MaxLapCount, 0),
    best_lap_ms: toInt(session.BestLapMs, 0),
    source_updated_at: toSqlDateTime(session.EndTimeDate || session.StartTimeDate),
    imported_at: nowSqlDateTime(),
    updated_at: nowSqlDateTime()
  };
}

async function upsertSqliteSession(backend: MirrorBackend & { driver: 'sqlite' }, row: ReturnType<typeof sessionSqliteRow>) {
  await backend.run(`
    INSERT INTO gc_stracker_session
    (session_id, type, track_raw, track_display, combo_id, start_time, end_time, player_count, lap_count, max_lap_count, best_lap_ms, source_updated_at, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      type = excluded.type,
      track_raw = excluded.track_raw,
      track_display = excluded.track_display,
      combo_id = excluded.combo_id,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      player_count = excluded.player_count,
      lap_count = excluded.lap_count,
      max_lap_count = excluded.max_lap_count,
      best_lap_ms = excluded.best_lap_ms,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at
  `, [
    row.session_id,
    row.type,
    row.track_raw,
    row.track_display,
    row.combo_id,
    row.start_time,
    row.end_time,
    row.player_count,
    row.lap_count,
    row.max_lap_count,
    row.best_lap_ms,
    row.source_updated_at,
    row.imported_at,
    row.updated_at
  ]);
}

async function upsertMysqlSession(backend: MirrorBackend & { driver: 'mysql' }, row: ReturnType<typeof sessionSqliteRow>) {
  await backend.run(`
    INSERT INTO gc_stracker_session
    (session_id, type, track_raw, track_display, combo_id, start_time, end_time, player_count, lap_count, max_lap_count, best_lap_ms, source_updated_at, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      type = VALUES(type),
      track_raw = VALUES(track_raw),
      track_display = VALUES(track_display),
      combo_id = VALUES(combo_id),
      start_time = VALUES(start_time),
      end_time = VALUES(end_time),
      player_count = VALUES(player_count),
      lap_count = VALUES(lap_count),
      max_lap_count = VALUES(max_lap_count),
      best_lap_ms = VALUES(best_lap_ms),
      source_updated_at = VALUES(source_updated_at),
      updated_at = VALUES(updated_at)
  `, [
    row.session_id,
    row.type,
    row.track_raw,
    row.track_display,
    row.combo_id,
    row.start_time,
    row.end_time,
    row.player_count,
    row.lap_count,
    row.max_lap_count,
    row.best_lap_ms,
    row.source_updated_at,
    row.imported_at,
    row.updated_at
  ]);
}

function mapDriver(sessionId: number, driver: any, createdAt: string) {
  return {
    session_id: sessionId,
    player_id: toInt(driver.PlayerId, 0) || null,
    player_in_session_id: toInt(driver.PlayerInSessionId, 0),
    driver_name: displayDriverName(driver.StrackerName, `Piloto ${driver.PlayerId || driver.PlayerInSessionId || sessionId}`),
    steam_guid: textValue(driver.StrackerGuid, '') || null,
    car_raw: textValue(driver.CarFolder || driver.UiCarName, '') || null,
    car_display: displayCarName(driver.UiCarName || driver.CarFolder, 'Coche'),
    position: toInt(driver.FinishPositionOrig || driver.FinishPosition, 0),
    laps: toInt(driver.LapRows, 0),
    best_lap_ms: toInt(driver.BestLapMs, 0),
    race_time_ms: toInt(driver.RaceTimeMs, 0),
    cuts: toInt(driver.Cuts, 0),
    collisions_car: toInt(driver.CollisionsCar, 0),
    collisions_env: toInt(driver.CollisionsEnv, 0),
    race_finished: isBooleanishTrue(driver.RaceFinished) ? 1 : 0,
    created_at: createdAt,
    updated_at: createdAt
  };
}

async function writeDriverRows(backend: MirrorBackend, driverRows: ReturnType<typeof mapDriver>[]) {
  for (const row of driverRows) {
    await backend.run(`
      INSERT INTO gc_stracker_session_driver
      (session_id, player_id, player_in_session_id, driver_name, steam_guid, car_raw, car_display, position, laps, best_lap_ms, race_time_ms, cuts, collisions_car, collisions_env, race_finished, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      row.session_id,
      row.player_id,
      row.player_in_session_id,
      row.driver_name,
      row.steam_guid,
      row.car_raw,
      row.car_display,
      row.position,
      row.laps,
      row.best_lap_ms,
      row.race_time_ms,
      row.cuts,
      row.collisions_car,
      row.collisions_env,
      row.race_finished,
      row.created_at,
      row.updated_at
    ]);
  }
}

async function writeLapRows(backend: MirrorBackend, lapRows: any[]) {
  for (const row of lapRows) {
    await backend.run(`
      INSERT INTO gc_stracker_lap
      (session_id, player_id, player_in_session_id, lap_number, lap_time_ms, valid, cuts, collisions_car, collisions_env, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      row.session_id,
      row.player_id,
      row.player_in_session_id,
      row.lap_number,
      row.lap_time_ms,
      row.valid,
      row.cuts,
      row.collisions_car,
      row.collisions_env,
      row.created_at
    ]);
  }
}

async function writeIncidentRows(backend: MirrorBackend, incidentRows: any[]) {
  for (const row of incidentRows) {
    await backend.run(`
      INSERT INTO gc_stracker_incident
      (session_id, player_id, type, lap_number, impact_speed, other_player_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      row.session_id,
      row.player_id,
      row.type,
      row.lap_number,
      row.impact_speed,
      row.other_player_id,
      row.created_at
    ]);
  }
}

export async function syncStrackerToSqlMirror(options: { limit?: number } = {}) {
  const sourcePath = resolveStrackerDbPath();
  if (!sourcePath) throw new Error('STRacker no configurado. Falta STRACKER_DB_PATH o data/stracker/stracker.db3.');

  const startedAt = nowSqlDateTime();
  const startedAtDate = new Date();
  const sourceDb = await openStrackerDb(sourcePath);
  const backend = await openMirrorBackend(true);

  let sessionsSeen = 0;
  let sessionsImported = 0;
  let driversImported = 0;
  let lapsImported = 0;
  let incidentsImported = 0;

  try {
    await ensureStrackerMirrorSchema();
    const tableCheck = verifyStrackerTables(sourceDb);
    if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);
    await ensureBackendSchema(backend);

    const sourceIds = sourceDb.all(`
      SELECT s.SessionId
      FROM Session s
      WHERE LOWER(s.SessionType) IN ('race', 'qualy', 'practice')
      ORDER BY s.StartTimeDate ASC, s.SessionId ASC
    `).map((row: any) => toInt(row.SessionId, 0)).filter(Boolean);
    const limit = Math.max(1, Math.min(5000, toInt(options.limit, sourceIds.length || 1)));
    const sessionIds = sourceIds.slice(0, limit);
    sessionsSeen = sessionIds.length;

    let transactionOpen = false;
    let currentPhase: 'sync' | 'transaction' | 'save' = 'sync';
    try {
      if (backend.driver === 'mysql') {
        await backend.run('START TRANSACTION');
        transactionOpen = true;
        currentPhase = 'transaction';
      }

      for (const sessionId of sessionIds) {
        const session = readRaceSession(sourceDb, sessionId);
        if (!session) continue;
        const drivers = readRaceDrivers(sourceDb, sessionId) as any[];
        const createdAt = nowSqlDateTime();
        const sessionRow = sessionSqliteRow(sessionId, session);
        const driverRows = drivers.map((driver) => mapDriver(sessionId, driver, createdAt));
        const lapRows: any[] = [];
        const incidentRows: any[] = [];

        for (const driver of drivers) {
          const playerInSessionId = toInt(driver.PlayerInSessionId, 0);
          const playerId = toInt(driver.PlayerId, 0) || null;
          const laps = readRaceLaps(sourceDb, playerInSessionId) as any[];
          for (const lap of laps) {
            lapRows.push({
              session_id: sessionId,
              player_id: playerId,
              player_in_session_id: playerInSessionId,
              lap_number: toInt(lap.lapNumber, 0),
              lap_time_ms: toInt(lap.lapTimeMs, 0),
              valid: lap.valid ? 1 : 0,
              cuts: toInt(lap.cuts, 0),
              collisions_car: toInt(lap.collisionsCar, 0),
              collisions_env: toInt(lap.collisionsEnv, 0),
              created_at: createdAt
            });
          }
          incidentRows.push(...buildIncidentRows(sessionId, playerId, laps, createdAt));
        }

        if (backend.driver === 'mysql') await upsertMysqlSession(backend, sessionRow);
        else await upsertSqliteSession(backend, sessionRow);

        await backend.run('DELETE FROM gc_stracker_session_driver WHERE session_id = ?', [sessionId]);
        await backend.run('DELETE FROM gc_stracker_lap WHERE session_id = ?', [sessionId]);
        await backend.run('DELETE FROM gc_stracker_incident WHERE session_id = ?', [sessionId]);

        await writeDriverRows(backend, driverRows);
        await writeLapRows(backend, lapRows);
        await writeIncidentRows(backend, incidentRows);

        sessionsImported += 1;
        driversImported += driverRows.length;
        lapsImported += lapRows.length;
        incidentsImported += incidentRows.length;
      }

      await backend.run(`
        INSERT INTO gc_stracker_sync_log
        (started_at, finished_at, status, sessions_seen, sessions_imported, drivers_imported, laps_imported, incidents_imported, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        startedAt,
        nowSqlDateTime(),
        'ok',
        sessionsSeen,
        sessionsImported,
        driversImported,
        lapsImported,
        incidentsImported,
        `Mirror ${getMirrorDriverFromEnv() === 'sqlite' ? 'SQLite local activo' : 'MySQL activo'} desde ${sourcePath}.`
      ]);

      if (backend.driver === 'mysql' && transactionOpen) {
        await backend.run('COMMIT');
        transactionOpen = false;
        currentPhase = 'sync';
      }
      if (backend.driver === 'sqlite') {
        currentPhase = 'save';
        await backend.save();
        currentPhase = 'sync';
      }
    } catch (error) {
      if (backend.driver === 'mysql' && transactionOpen) {
        try { await backend.run('ROLLBACK'); } catch {}
        transactionOpen = false;
      }

      const syncError = error instanceof Error ? error : new Error(String(error));
      (syncError as any).phase = currentPhase;
      (syncError as any).mirrorDriver = getMirrorDriverFromEnv();
      (syncError as any).sqlitePath = backend.driver === 'sqlite' ? SQLITE_MIRROR_PATH : null;
      throw syncError;
    }

    return {
      ok: true as const,
      source: 'gc-ratings-v1' as const,
      storage: getMirrorDriverFromEnv(),
      sessionsSeen,
      sessionsImported,
      driversImported,
      lapsImported,
      incidentsImported,
      durationMs: Date.now() - startedAtDate.getTime()
    };
  } finally {
    try { sourceDb.close(); } catch {}
    try { await backend.close(); } catch {}
  }
}

async function queryMirrorSessionRows(backend: MirrorBackend, limit: number) {
  return backend.query(`
    SELECT
      s.session_id,
      s.type,
      s.track_raw,
      s.track_display,
      s.combo_id,
      s.start_time,
      s.end_time,
      s.player_count,
      s.lap_count,
      s.max_lap_count,
      s.best_lap_ms,
      COALESCE(laps.cuts, 0) AS cuts,
      COALESCE(laps.collisions_car, 0) AS collisions_car,
      COALESCE(laps.collisions_env, 0) AS collisions_env,
      COALESCE(drivers.driver_rows, 0) AS driver_rows
    FROM gc_stracker_session s
    LEFT JOIN (
      SELECT
        session_id,
        COUNT(DISTINCT player_in_session_id) AS driver_rows
      FROM gc_stracker_session_driver
      GROUP BY session_id
    ) drivers ON drivers.session_id = s.session_id
    LEFT JOIN (
      SELECT
        session_id,
        SUM(cuts) AS cuts,
        SUM(collisions_car) AS collisions_car,
        SUM(collisions_env) AS collisions_env
      FROM gc_stracker_lap
      GROUP BY session_id
    ) laps ON laps.session_id = s.session_id
    WHERE s.type = 'race'
      AND s.player_count >= 3
      AND s.lap_count >= 1
    ORDER BY s.start_time DESC, s.session_id DESC
    LIMIT ?
  `, [limit]);
}

export async function getStrackerRaceCandidatesFromMirror(options: { limit?: number } = {}) {
  await ensureStrackerMirrorSchema();
  const backend = await openMirrorBackend(false);
  try {
    const rows = await queryMirrorSessionRows(backend, Math.max(1, Math.min(500, toInt(options.limit, 80))));
    return {
      ok: true as const,
      source: 'gc-ratings-v1' as const,
      mirrorDriver: backend.driver,
      candidates: rows.map((row: any) => ({
        sessionId: toInt(row.session_id, 0),
        eventId: `stracker:${toInt(row.session_id, 0)}`,
        type: row.type,
        name: `Carrera sTracker #${toInt(row.session_id, 0)}`,
        trackRaw: row.track_raw || null,
        track: row.track_display || displayTrackName(row.track_raw, 'Circuito'),
        comboId: row.combo_id ?? null,
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        playerCount: toInt(row.player_count, 0),
        lapCount: toInt(row.lap_count, 0),
        maxLapCount: toInt(row.max_lap_count, 0),
        bestLapMs: toInt(row.best_lap_ms, 0),
        bestLap: formatLapMs(row.best_lap_ms),
        cuts: toInt(row.cuts, 0),
        collisionsCar: toInt(row.collisions_car, 0),
        collisionsEnv: toInt(row.collisions_env, 0),
        source: 'sql-mirror' as const,
        mirrorDriver: backend.driver,
        recommended: toInt(row.player_count, 0) >= 3 && toInt(row.lap_count, 0) >= 1
      }))
    };
  } finally {
    await backend.close();
  }
}

export async function getStrackerSessionDetailFromMirror(sessionId: number) {
  await ensureStrackerMirrorSchema();
  const backend = await openMirrorBackend(false);
  try {
    const sessionRows = await backend.query('SELECT * FROM gc_stracker_session WHERE session_id = ? LIMIT 1', [sessionId]);
    const session = sessionRows[0] || null;
    if (!session) return null;

    const [driverRows, lapRows, incidentRows] = await Promise.all([
      backend.query('SELECT * FROM gc_stracker_session_driver WHERE session_id = ? ORDER BY position ASC, best_lap_ms ASC, id ASC', [sessionId]),
      backend.query('SELECT * FROM gc_stracker_lap WHERE session_id = ? ORDER BY lap_number ASC, id ASC', [sessionId]),
      backend.query('SELECT * FROM gc_stracker_incident WHERE session_id = ? ORDER BY lap_number ASC, id ASC', [sessionId])
    ]);

    return {
      session: {
        sessionId: toInt(session.session_id, 0),
        type: session.type,
        trackRaw: cleanDisplayText(session.track_raw || session.track_display, 'Circuito'),
        track: session.track_display || displayTrackName(session.track_raw, 'Circuito'),
        comboId: session.combo_id ?? null,
        startTime: session.start_time || null,
        endTime: session.end_time || null,
        playerCount: toInt(session.player_count, 0),
        lapCount: toInt(session.lap_count, 0),
        maxLapCount: toInt(session.max_lap_count, 0),
        bestLapMs: toInt(session.best_lap_ms, 0),
        sourceUpdatedAt: session.source_updated_at || null,
        importedAt: session.imported_at || null,
        updatedAt: session.updated_at || null
      },
      source: 'sql-mirror' as const,
      mirrorDriver: backend.driver,
      drivers: driverRows.map((row: any) => ({
        id: row.id,
        sessionId: toInt(row.session_id, 0),
        playerId: row.player_id ?? null,
        playerInSessionId: toInt(row.player_in_session_id, 0),
        driverName: row.driver_name,
        steamGuid: row.steam_guid ?? null,
        carRaw: row.car_raw ?? null,
        carDisplay: row.car_display ?? null,
        position: toInt(row.position, 0),
        laps: toInt(row.laps, 0),
        bestLapMs: toInt(row.best_lap_ms, 0),
        raceTimeMs: toInt(row.race_time_ms, 0),
        cuts: toInt(row.cuts, 0),
        collisionsCar: toInt(row.collisions_car, 0),
        collisionsEnv: toInt(row.collisions_env, 0),
        raceFinished: Boolean(row.race_finished),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      })),
      laps: lapRows.map((row: any) => ({
        id: row.id,
        sessionId: toInt(row.session_id, 0),
        playerId: row.player_id ?? null,
        playerInSessionId: toInt(row.player_in_session_id, 0),
        lapNumber: toInt(row.lap_number, 0),
        lapTimeMs: toInt(row.lap_time_ms, 0),
        valid: Boolean(row.valid),
        cuts: toInt(row.cuts, 0),
        collisionsCar: toInt(row.collisions_car, 0),
        collisionsEnv: toInt(row.collisions_env, 0),
        createdAt: row.created_at || null
      })),
      incidents: incidentRows.map((row: any) => ({
        id: row.id,
        sessionId: toInt(row.session_id, 0),
        playerId: row.player_id ?? null,
        type: row.type,
        lapNumber: row.lap_number ?? null,
        impactSpeed: row.impact_speed ?? null,
        otherPlayerId: row.other_player_id ?? null,
        createdAt: row.created_at || null
      }))
    };
  } finally {
    await backend.close();
  }
}

type MirrorLapRow = Record<string, any>;

function mirrorComboIdentity(sessionId: number, comboId: unknown) {
  const numericComboId = toInt(comboId, 0);
  return numericComboId > 0 ? numericComboId : sessionId;
}

function mirrorTimestampSeconds(value: unknown, fallbackIso: string | null = null) {
  const text = textValue(value);
  const parsed = text ? Date.parse(text) : NaN;
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  if (fallbackIso) {
    const fallbackParsed = Date.parse(fallbackIso);
    if (Number.isFinite(fallbackParsed)) return Math.floor(fallbackParsed / 1000);
  }
  return 0;
}

async function loadMirrorLapRows(backend: MirrorBackend) {
  const rows = await backend.query(`
    SELECT
      l.id AS lap_id,
      l.session_id,
      l.player_id,
      l.player_in_session_id,
      l.lap_number,
      l.lap_time_ms,
      l.valid,
      l.cuts,
      l.collisions_car,
      l.collisions_env,
      l.created_at AS lap_created_at,
      s.type AS session_type,
      s.track_raw,
      s.track_display,
      s.combo_id,
      s.start_time,
      s.end_time,
      s.player_count,
      s.lap_count,
      s.max_lap_count,
      s.best_lap_ms AS session_best_lap_ms,
      d.driver_name,
      d.steam_guid,
      d.car_raw,
      d.car_display,
      d.position AS driver_position,
      d.laps AS driver_laps,
      d.best_lap_ms AS driver_best_lap_ms,
      d.race_time_ms,
      d.cuts AS driver_cuts,
      d.collisions_car AS driver_collisions_car,
      d.collisions_env AS driver_collisions_env,
      d.race_finished
    FROM gc_stracker_lap l
    INNER JOIN gc_stracker_session_driver d
      ON d.session_id = l.session_id
     AND d.player_in_session_id = l.player_in_session_id
    INNER JOIN gc_stracker_session s
      ON s.session_id = l.session_id
    ORDER BY l.created_at DESC, l.lap_time_ms ASC, l.id ASC
  `);

  return rows.map((row: any) => {
    const sessionId = toInt(row.session_id, 0);
    const comboId = mirrorComboIdentity(sessionId, row.combo_id);
    const trackName = displayTrackName(row.track_display || row.track_raw, 'Circuito');
    const trackCode = cleanDisplayText(row.track_raw || row.track_display, 'Circuito');
    const carName = displayCarName(row.car_display || row.car_raw, 'Coche');
    const carCode = cleanDisplayText(row.car_raw || row.car_display, 'Coche');
    const driverName = displayDriverName(row.driver_name, `Piloto ${toInt(row.player_id, 0) || toInt(row.player_in_session_id, 0) || sessionId}`);
    const createdAt = textValue(row.lap_created_at || row.start_time || row.end_time || null);
    return {
      lapId: row.lap_id ?? `${sessionId}:${toInt(row.player_in_session_id, 0)}:${toInt(row.lap_number, 0)}`,
      playerId: row.player_id ?? null,
      driverId: row.player_id ?? row.player_in_session_id ?? null,
      driverName,
      playerName: driverName,
      steamGuid: row.steam_guid ?? null,
      comboId,
      carId: row.car_raw ?? row.car_display ?? row.player_id ?? null,
      carName,
      carCode,
      trackId: comboId,
      trackName,
      trackCode,
      lapTimeMs: toInt(row.lap_time_ms, 0),
      lapTime: formatLapMs(row.lap_time_ms),
      lapTimeFormatted: formatLapMs(row.lap_time_ms),
      valid: Boolean(row.valid),
      isValid: Boolean(row.valid),
      maxSpeedKmh: null,
      cuts: toInt(row.cuts, 0),
      collisionsCar: toInt(row.collisions_car, 0),
      collisionsEnv: toInt(row.collisions_env, 0),
      gripLevel: null,
      temperatureTrack: null,
      temperatureAmbient: null,
      timestamp: mirrorTimestampSeconds(createdAt, row.start_time || row.end_time || null),
      timestampIso: createdAt || row.start_time || row.end_time || null,
      session: {
        type: String(row.session_type || 'race').trim().toUpperCase(),
        multiplayer: null,
        server: null,
        startTime: row.start_time || null,
        startTimeIso: row.start_time || null,
        endTime: row.end_time || null,
        endTimeIso: row.end_time || null
      },
      aids: {
        abs: null,
        tc: null,
        autoBlib: null,
        autoBrake: null,
        autoClutch: null,
        autoShift: null,
        idealLine: null,
        stabilityControl: null,
        slipStream: null,
        tyreBlankets: null
      },
      input: {
        method: null,
        shifter: null
      },
      driver: {
        id: row.player_id ?? row.player_in_session_id ?? null,
        name: driverName,
        steamGuid: row.steam_guid ?? null,
        isOnline: false
      },
      car: {
        id: row.car_raw ?? row.car_display ?? row.player_id ?? null,
        name: carName,
        code: carCode,
        brand: carName.split(' ')[0] || carName
      },
      track: {
        id: comboId,
        name: trackName,
        code: trackCode
      },
      source: 'sql-mirror',
      mirrorDriver: backend.driver
    };
  });
}

function mirrorBuildBestHotlaps(laps: MirrorLapRow[], groupMode: string) {
  const mode = String(groupMode || 'best').toLowerCase();
  if (mode === 'laps' || mode === 'raw' || mode === 'all') {
    return [...laps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  }

  const bestMap = new Map<string, MirrorLapRow>();
  for (const lap of laps) {
    const key = mode === 'driver'
      ? `${lap.driver?.id ?? lap.driver?.name ?? lap.driverName ?? 'unknown'}`
      : mode === 'driver-track'
        ? `${lap.driver?.id ?? lap.driver?.name ?? lap.driverName ?? 'unknown'}|${lap.track?.id ?? lap.track?.name ?? lap.trackName ?? 'unknown'}`
        : mode === 'car-track'
          ? `${lap.car?.id ?? lap.car?.name ?? lap.carName ?? 'unknown'}|${lap.track?.id ?? lap.track?.name ?? lap.trackName ?? 'unknown'}`
          : `${lap.driver?.id ?? lap.driver?.name ?? lap.driverName ?? 'unknown'}|${lap.car?.id ?? lap.car?.name ?? lap.carName ?? 'unknown'}|${lap.track?.id ?? lap.track?.name ?? lap.trackName ?? 'unknown'}`;

    const current = bestMap.get(key);
    if (!current || Number(lap.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      bestMap.set(key, lap);
    }
  }

  return Array.from(bestMap.values()).sort((left, right) => Number(left.lapTimeMs ?? Infinity) - Number(right.lapTimeMs ?? Infinity));
}

function mirrorLapSummary(laps: MirrorLapRow[]) {
  const valid = laps.filter((lap) => lap?.valid !== false && lap?.isValid !== false);
  const tracks = new Set(laps.map((lap) => String(lap.track?.id ?? lap.track?.name ?? lap.trackName ?? '')).filter(Boolean));
  const cars = new Set(laps.map((lap) => String(lap.car?.id ?? lap.car?.name ?? lap.carName ?? '')).filter(Boolean));
  const drivers = new Set(laps.map((lap) => String(lap.driver?.id ?? lap.driver?.name ?? lap.driverName ?? '')).filter(Boolean));
  const bestLap = valid.slice().sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] || null;
  const latestLap = [...laps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))[0] || null;

  return {
    totalLaps: laps.length,
    validLaps: valid.length,
    invalidLaps: Math.max(0, laps.length - valid.length),
    driversCount: drivers.size,
    carsCount: cars.size,
    tracksCount: tracks.size,
    bestLap,
    latestLap
  };
}

async function getMirrorHotlapBase(options: { limit?: number } = {}) {
  await ensureStrackerMirrorSchema();
  const backend = await openMirrorBackend(false);
  try {
    const diagnostics = await getStrackerMirrorDiagnostics();
    const laps = await loadMirrorLapRows(backend);
    return {
      backend,
      diagnostics,
      laps,
      limit: Math.max(1, Math.min(50000, toInt(options.limit, 1000)))
    };
  } catch (error) {
    await backend.close();
    throw error;
  }
}

export async function getHotlapsFromMirror(options: {
  limit?: number;
  sort?: string;
  group?: string;
  valid?: string;
  sinceHours?: number | string;
  driver?: string;
  pilot?: string;
  player?: string;
  car?: string;
  coche?: string;
  track?: string;
  circuit?: string;
  brand?: string;
  sessionType?: string;
  session?: string;
  playerId?: number | string;
  carId?: number | string;
  trackId?: number | string;
  comboId?: number | string;
  fallback?: boolean;
} = {}) {
  const base = await getMirrorHotlapBase({ limit: options.limit });
  const query = options || {};
  const validValue = String(query.valid ?? '1').toLowerCase();
  const validOnly = !['all', 'any', '0', 'false', 'no'].includes(validValue);
  const includeInvalidOnly = ['invalid', 'false-only'].includes(validValue);
  const sinceHours = textValue(query.sinceHours) ? toInt(query.sinceHours, NaN) : NaN;
  const now = Date.now();
  const playerId = textValue(query.playerId) ? toInt(query.playerId, NaN) : NaN;
  const carId = textValue(query.carId) ? toInt(query.carId, NaN) : NaN;
  const trackId = textValue(query.trackId) ? toInt(query.trackId, NaN) : NaN;
  const comboId = textValue(query.comboId) ? toInt(query.comboId, NaN) : NaN;
  const driverFilter = textValue(query.driver || query.pilot || query.player);
  const carFilter = textValue(query.car || query.coche);
  const trackFilter = textValue(query.track || query.circuit);
  const brandFilter = textValue(query.brand);
  const sessionTypeFilter = textValue(query.sessionType || query.session);

  let filtered = base.laps.filter((lap) => {
    if (validOnly && !lap.valid) return false;
    if (includeInvalidOnly && lap.valid) return false;
    if (Number.isFinite(playerId) && toInt(lap.driver?.id, 0) !== playerId) return false;
    if (Number.isFinite(carId) && toInt(lap.car?.id, 0) !== carId) return false;
    if (Number.isFinite(trackId) && toInt(lap.track?.id, 0) !== trackId) return false;
    if (Number.isFinite(comboId) && toInt(lap.comboId, 0) !== comboId) return false;
    if (driverFilter && !String(`${lap.driver?.name || lap.driverName || ''}`).toLowerCase().includes(driverFilter.toLowerCase())) return false;
    if (carFilter && !String(`${lap.car?.name || lap.carName || ''} ${lap.car?.code || lap.carCode || ''}`).toLowerCase().includes(carFilter.toLowerCase())) return false;
    if (trackFilter && !String(`${lap.track?.name || lap.trackName || ''} ${lap.track?.code || lap.trackCode || ''}`).toLowerCase().includes(trackFilter.toLowerCase())) return false;
    if (brandFilter && !String(lap.car?.brand || '').toLowerCase().includes(brandFilter.toLowerCase())) return false;
    if (sessionTypeFilter && !String(lap.session?.type || '').toLowerCase().includes(sessionTypeFilter.toLowerCase())) return false;
    if (Number.isFinite(sinceHours)) {
      const timestampMs = lap.timestamp ? lap.timestamp * 1000 : null;
      if (!timestampMs || now - timestampMs > sinceHours * 60 * 60 * 1000) return false;
    }
    return true;
  });

  const groupMode = textValue(query.group, 'best').toLowerCase();
  const sort = textValue(query.sort, 'fastest').toLowerCase();
  if (sort === 'recent') {
    filtered = [...filtered].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0) || Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  } else if (sort === 'oldest') {
    filtered = [...filtered].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0) || Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  } else {
    filtered = [...filtered].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  }

  const items = mirrorBuildBestHotlaps(filtered, groupMode).slice(0, base.limit);
  await base.backend.close();
  return {
    ok: true as const,
    source: 'gc-ratings-v1' as const,
    candidateSource: 'sql-mirror' as const,
    mirrorDriver: base.diagnostics.mirrorDriver,
    syncRequired: Number(base.diagnostics.sessionsImported || 0) === 0,
    limit: base.limit,
    group: groupMode,
    sort,
    count: items.length,
    totalMatchedLaps: filtered.length,
    filters: {
      valid: validValue,
      driver: driverFilter || null,
      playerId: Number.isFinite(playerId) ? String(playerId) : null,
      car: carFilter || null,
      carId: Number.isFinite(carId) ? String(carId) : null,
      track: trackFilter || null,
      trackId: Number.isFinite(trackId) ? String(trackId) : null,
      brand: brandFilter || null,
      sessionType: sessionTypeFilter || null,
      sinceHours: Number.isFinite(sinceHours) ? String(sinceHours) : null
    },
    options: options.fallback ? { fallback: true } : undefined,
    stracker: {
      exists: Boolean(base.diagnostics.sqliteExists),
      sizeBytes: base.diagnostics.sqliteExists ? fs.statSync(SQLITE_MIRROR_PATH).size : 0,
      modifiedAt: base.diagnostics.sqliteExists ? fs.statSync(SQLITE_MIRROR_PATH).mtime.toISOString() : null
    },
    items,
    hotlaps: items,
    leaderboard: items,
    laps: items,
    data: {
      leaderboard: items,
      laps: items,
      items,
      stats: {
        ...mirrorLapSummary(filtered)
      }
    },
    message: Number(base.diagnostics.sessionsImported || 0) === 0
      ? 'SQL mirror vacío. Ejecuta sync sTracker → SQL.'
      : 'Hotlaps generadas desde SQL mirror.'
  };
}

export async function getLeaderboardFromMirror(options: {
  scope?: 'activeCombo' | 'global';
  limit?: number;
  recentLimit?: number;
  fallback?: boolean;
} = {}) {
  const base = await getMirrorHotlapBase({ limit: options.limit ?? options.recentLimit });
  const scope = options.scope === 'activeCombo' ? 'activeCombo' : 'global';
  const validLaps = base.laps.filter((lap) => lap?.valid !== false && lap?.isValid !== false);
  const latestSessionRow = await base.backend.query(`
    SELECT
      s.session_id,
      s.type,
      s.track_raw,
      s.track_display,
      s.combo_id,
      s.start_time,
      s.end_time,
      s.player_count,
      s.lap_count,
      s.max_lap_count,
      s.best_lap_ms
    FROM gc_stracker_session s
    ORDER BY s.start_time DESC, s.session_id DESC
    LIMIT 1
  `);
  const latestSession = latestSessionRow[0] || null;
  const activeComboId = latestSession ? mirrorComboIdentity(toInt(latestSession.session_id, 0), latestSession.combo_id) : null;
  const scopedLaps = scope === 'activeCombo' && activeComboId ? validLaps.filter((lap) => toInt(lap.comboId, 0) === activeComboId) : validLaps;
  const leaderboardLimitSource = textValue(options.limit ?? options.recentLimit) ? (options.limit ?? options.recentLimit) : 20;
  const leaderboardLimit = Math.max(1, Math.min(50000, toInt(leaderboardLimitSource, 20)));
  const leaderboard = mirrorBuildBestHotlaps(scopedLaps, 'best').slice(0, leaderboardLimit);
  const recentLaps = [...scopedLaps]
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0) || Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))
    .slice(0, Math.max(1, Math.min(50000, toInt(options.recentLimit, 20))));
  const latestLap = [...scopedLaps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0) || Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] || null;
  const bestLap = [...scopedLaps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] || null;
  const stats = mirrorLapSummary(base.laps);
  const scopedStats = mirrorLapSummary(scopedLaps);
  const activeCombo = latestSession ? {
    id: String(activeComboId ?? latestSession.session_id),
    comboId: activeComboId,
    track: {
      id: activeComboId ?? latestSession.session_id,
      name: displayTrackName(latestSession.track_display || latestSession.track_raw, 'Circuito'),
      code: cleanDisplayText(latestSession.track_raw || latestSession.track_display, 'Circuito')
    },
    cars: Array.from(new Map(scopedLaps
      .filter((lap) => toInt(lap.comboId, 0) === activeComboId)
      .map((lap) => [String(lap.car?.id ?? lap.car?.name ?? lap.carCode ?? ''), lap.car])
      .filter(([key]) => Boolean(key))).values()).map((car: any) => car).filter(Boolean),
    driversCount: toInt(latestSession.player_count, 0),
    lapsCount: toInt(latestSession.lap_count, 0),
    bestLap: bestLap ? {
      lapTime: bestLap.lapTime,
      driverName: bestLap.driverName,
      carName: bestLap.carName
    } : null
  } : null;

  await base.backend.close();
  return {
    ok: true as const,
    mode: 'gc-data-core-v1' as const,
    source: 'sql-mirror' as const,
    generatedAt: new Date().toISOString(),
    scope,
    requestedScope: scope,
    mirrorDriver: base.diagnostics.mirrorDriver,
    syncRequired: Number(base.diagnostics.sessionsImported || 0) === 0,
    count: leaderboard.length,
    total: leaderboard.length,
    items: leaderboard,
    hotlaps: leaderboard,
    laps: leaderboard,
    leaderboard,
    data: {
      activeCombo,
      latestLap,
      bestLap,
      recentLaps,
      leaderboard,
      scopedStats,
      stats
    },
    message: Number(base.diagnostics.sessionsImported || 0) === 0
      ? 'SQL mirror vacío. Ejecuta sync sTracker → SQL.'
      : `Leaderboard ${scope === 'activeCombo' ? 'del combo activo' : 'global'} generado desde SQL mirror.`
  };
}

export async function getTrackStatsFromMirror(options: { limit?: number } = {}) {
  const base = await getMirrorHotlapBase({ limit: options.limit });
  const byTrack = new Map<string, any>();
  for (const lap of base.laps) {
    const key = String(lap.track?.id ?? lap.track?.name ?? lap.trackCode ?? 'unknown');
    const current = byTrack.get(key) || {
      track: lap.track,
      trackName: lap.track?.name || lap.trackName || 'Circuito',
      trackCode: lap.track?.code || lap.trackCode || null,
      sessions: new Set<string>(),
      drivers: new Set<string>(),
      cars: new Set<string>(),
      laps: 0,
      validLaps: 0,
      bestLap: null
    };
    current.sessions.add(String(lap.session?.startTime || lap.session?.endTime || lap.track?.id || lap.comboId || 'session'));
    current.drivers.add(String(lap.driver?.id ?? lap.driver?.name ?? lap.driverName ?? ''));
    current.cars.add(String(lap.car?.id ?? lap.car?.name ?? lap.carName ?? ''));
    current.laps += 1;
    if (lap.valid) current.validLaps += 1;
    if (!current.bestLap || Number(lap.lapTimeMs ?? Infinity) < Number(current.bestLap.lapTimeMs ?? Infinity)) {
      current.bestLap = lap;
    }
    byTrack.set(key, current);
  }

  const items = Array.from(byTrack.values())
    .map((item) => ({
      track: item.track,
      trackName: item.trackName,
      trackCode: item.trackCode,
      sessionsCount: item.sessions.size,
      driversCount: item.drivers.size,
      carsCount: item.cars.size,
      lapsCount: item.laps,
      validLaps: item.validLaps,
      invalidLaps: Math.max(0, item.laps - item.validLaps),
      bestLap: item.bestLap ? {
        lapTime: item.bestLap.lapTime,
        lapTimeMs: item.bestLap.lapTimeMs,
        driverName: item.bestLap.driverName,
        carName: item.bestLap.carName
      } : null
    }))
    .sort((left, right) => right.lapsCount - left.lapsCount || String(left.trackName).localeCompare(String(right.trackName)));

  await base.backend.close();
  return {
    ok: true as const,
    source: 'sql-mirror' as const,
    mirrorDriver: base.diagnostics.mirrorDriver,
    syncRequired: Number(base.diagnostics.sessionsImported || 0) === 0,
    count: items.length,
    items,
    message: Number(base.diagnostics.sessionsImported || 0) === 0
      ? 'SQL mirror vacío. Ejecuta sync sTracker → SQL.'
      : 'Track stats generados desde SQL mirror.'
  };
}

export async function getStrackerMirrorDiagnostics() {
  const driver = getMirrorDriverFromEnv();
  const sqlitePath = sqliteMirrorPath();
  const sqliteExists = sqliteMirrorExists();
  const strackerDbPath = resolveStrackerDbPath();
  const strackerDbExists = Boolean(strackerDbPath && fs.existsSync(strackerDbPath));

  try {
    await ensureStrackerMirrorSchema();
  } catch (error) {
    return {
      ok: false as const,
      source: 'gc-ratings-v1' as const,
      mirrorDriver: driver,
      mysqlConfigured: hasMysqlConfig(),
      dbName: getMysqlDatabaseName() || null,
      sqlitePath,
      sqliteExists,
      strackerDbPath: strackerDbPath || null,
      strackerDbExists,
      tables: {
        session: false,
        sessionDriver: false,
        lap: false,
        incident: false,
        syncLog: false
      },
      latestSync: null,
      sessionsImported: 0,
      latestSession: null,
      phase: 'schema',
      message: 'No se pudieron crear las tablas del SQL mirror.'
    };
  }

  const backend = await openMirrorBackend(false);
  try {
    const tables = backend.driver === 'mysql'
      ? await backend.query(`
          SELECT table_name AS tableName
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN (
              'gc_stracker_session',
              'gc_stracker_session_driver',
              'gc_stracker_lap',
              'gc_stracker_incident',
              'gc_stracker_sync_log'
            )
        `)
      : await backend.query(`
          SELECT name AS tableName
          FROM sqlite_master
          WHERE type='table'
            AND name IN (
              'gc_stracker_session',
              'gc_stracker_session_driver',
              'gc_stracker_lap',
              'gc_stracker_incident',
              'gc_stracker_sync_log'
            )
        `);
    const tableSet = new Set(tables.map((row: any) => String(row.tableName)));

    const syncRows = await backend.query('SELECT * FROM gc_stracker_sync_log ORDER BY finished_at DESC, id DESC LIMIT 1');
    const latestSync = syncRows[0] || null;
    const sessionCountRows = await backend.query('SELECT COUNT(*) AS total FROM gc_stracker_session');
    const latestSessionRows = await backend.query('SELECT * FROM gc_stracker_session ORDER BY start_time DESC, session_id DESC LIMIT 1');
    const latestSession = latestSessionRows[0] || null;

    return {
      ok: true as const,
      source: 'gc-ratings-v1' as const,
      mirrorDriver: driver,
      mysqlConfigured: hasMysqlConfig(),
      dbName: getMysqlDatabaseName() || null,
      sqlitePath,
      sqliteExists,
      strackerDbPath: strackerDbPath || null,
      strackerDbExists,
      tables: {
        session: tableSet.has('gc_stracker_session'),
        sessionDriver: tableSet.has('gc_stracker_session_driver'),
        lap: tableSet.has('gc_stracker_lap'),
        incident: tableSet.has('gc_stracker_incident'),
        syncLog: tableSet.has('gc_stracker_sync_log')
      },
      latestSync: latestSync ? {
        id: latestSync.id,
        startedAt: latestSync.started_at || null,
        finishedAt: latestSync.finished_at || null,
        status: latestSync.status,
        sessionsSeen: toInt(latestSync.sessions_seen, 0),
        sessionsImported: toInt(latestSync.sessions_imported, 0),
        driversImported: toInt(latestSync.drivers_imported, 0),
        lapsImported: toInt(latestSync.laps_imported, 0),
        incidentsImported: toInt(latestSync.incidents_imported, 0),
        message: latestSync.message || null
      } : null,
      sessionsImported: toInt(sessionCountRows[0]?.total, 0),
      latestSession: latestSession ? {
        sessionId: toInt(latestSession.session_id, 0),
        type: latestSession.type,
        track: latestSession.track_display || displayTrackName(latestSession.track_raw, 'Circuito'),
        startTime: latestSession.start_time || null,
        endTime: latestSession.end_time || null,
        playerCount: toInt(latestSession.player_count, 0),
        lapCount: toInt(latestSession.lap_count, 0)
      } : null,
      message: driver === 'sqlite' ? 'Mirror SQLite local activo.' : 'Mirror MySQL activo.'
    };
  } finally {
    await backend.close();
  }
}
