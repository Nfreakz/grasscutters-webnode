import fs from 'node:fs';
import path from 'node:path';
import { boolValue, formatLapMs, numberValue } from './utils';
import type { PlainObject } from './types';

type StrackerDb = {
  driver: 'sql.js';
  path: string;
  all: (sql: string, params?: any[]) => PlainObject[];
  close: () => void;
};

function rowsFromStatement(statement: any) {
  const rows: PlainObject[] = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

export function resolveStrackerDbPath() {
  const envPath =
    process.env.STRACKER_DB_PATH ||
    process.env.STRACKER_DB3_PATH ||
    process.env.AC_STRACKER_DB_PATH ||
    process.env.LOCAL_STRACKER_DB_PATH ||
    '';

  const candidates = [
    envPath,
    path.join(process.cwd(), 'data', 'stracker', 'stracker.db3'),
    path.join(process.cwd(), 'stracker.db3')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    if (fs.existsSync(absolute)) return absolute;
  }

  return envPath ? path.resolve(envPath) : '';
}

export async function openStrackerDb(dbPath: string): Promise<StrackerDb> {
  const initSqlJsModule: any = await import('sql.js');
  const initSqlJs = initSqlJsModule.default ?? initSqlJsModule;
  const SQL = await initSqlJs();
  const bytes = new Uint8Array(fs.readFileSync(dbPath));
  const sqliteDb = new SQL.Database(bytes);

  return {
    driver: 'sql.js',
    path: dbPath,
    all(sql: string, params: any[] = []) {
      const statement = sqliteDb.prepare(sql);
      statement.bind(params);
      return rowsFromStatement(statement);
    },
    close() {
      sqliteDb.close();
    }
  };
}

export function verifyStrackerTables(db: StrackerDb) {
  const tables = db.all(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    ORDER BY name ASC
  `).map((row) => String(row.name));

  const required = ['Session', 'PlayerInSession', 'Lap', 'Players', 'Cars', 'Tracks'];
  const missing = required.filter((name) => !tables.includes(name));
  return { ok: missing.length === 0, missing, tables };
}

export function findRaceSessions(db: StrackerDb, limit = 200) {
  return db.all(`
    SELECT
      s.SessionId,
      s.SessionType,
      s.StartTimeDate,
      s.EndTimeDate,
      s.NumberOfLaps,
      t.Track,
      t.UiTrackName,
      COUNT(DISTINCT pis.PlayerInSessionId) AS PlayerCount,
      COUNT(l.LapId) AS LapCount
    FROM Session s
    LEFT JOIN Tracks t ON t.TrackId = s.TrackId
    LEFT JOIN PlayerInSession pis ON pis.SessionId = s.SessionId
    LEFT JOIN Lap l ON l.PlayerInSessionId = pis.PlayerInSessionId
    WHERE LOWER(s.SessionType) = 'race'
    GROUP BY s.SessionId
    ORDER BY s.StartTimeDate ASC
    LIMIT ?
  `, [limit]);
}

export function readRaceDrivers(db: StrackerDb, sessionId: number) {
  return db.all(`
    SELECT
      pis.PlayerInSessionId,
      pis.SessionId,
      pis.PlayerId,
      pis.CarId,
      pis.FinishPosition,
      pis.FinishPositionOrig,
      pis.RaceFinished,
      pis.FinishTime,
      p.Name AS StrackerName,
      p.SteamGuid AS StrackerGuid,
      c.Car AS CarFolder,
      c.UiCarName AS UiCarName,
      COUNT(l.LapId) AS LapRows,
      COALESCE(MIN(CASE WHEN l.LapTime > 0 THEN l.LapTime END), 0) AS BestLapMs,
      COALESCE(MAX(l.LapCount), 0) AS MaxLapCount,
      COALESCE(SUM(l.Cuts), 0) AS Cuts,
      COALESCE(SUM(l.CollisionsCar), 0) AS CollisionsCar,
      COALESCE(SUM(l.CollisionsEnv), 0) AS CollisionsEnv,
      COALESCE(SUM(CASE WHEN l.Valid = 1 THEN 1 ELSE 0 END), 0) AS ValidLaps,
      COALESCE(SUM(CASE WHEN l.Valid = 0 THEN 1 ELSE 0 END), 0) AS InvalidLaps,
      COALESCE(SUM(CASE WHEN l.Valid = 0 AND COALESCE(l.Cuts, 0) = 0 THEN 1 ELSE 0 END), 0) AS InvalidNoCutLaps,
      COALESCE(MAX(l.SessionTime), 0) AS RaceTimeMs,
      COALESCE(MAX(l.Timestamp), 0) AS LastLapUnix
    FROM PlayerInSession pis
    JOIN Players p ON p.PlayerId = pis.PlayerId
    LEFT JOIN Cars c ON c.CarId = pis.CarId
    LEFT JOIN Lap l ON l.PlayerInSessionId = pis.PlayerInSessionId
    WHERE pis.SessionId = ?
    GROUP BY pis.PlayerInSessionId
    ORDER BY FinishPositionOrig ASC, FinishPosition ASC, BestLapMs ASC
  `, [sessionId]);
}

export function readRaceLaps(db: StrackerDb, playerInSessionId: number) {
  return db.all(`
    SELECT
      LapId,
      LapCount,
      LapTime,
      Valid,
      Cuts,
      CollisionsCar,
      CollisionsEnv,
      COALESCE(TimeInPitLane, 0) AS TimeInPitLane,
      COALESCE(TimeInPit, 0) AS TimeInPit,
      ESCPressed
    FROM Lap
    WHERE PlayerInSessionId = ?
    ORDER BY LapCount ASC, LapId ASC
  `, [playerInSessionId]).map((lap: PlainObject, index: number) => {
    const cuts = numberValue(lap.Cuts, 0);
    const collisionsCar = numberValue(lap.CollisionsCar, 0);
    const collisionsEnv = numberValue(lap.CollisionsEnv, 0);
    const valid = boolValue(lap.Valid);
    const timeInPitLaneMs = numberValue(lap.TimeInPitLane, 0);
    const timeInPitMs = numberValue(lap.TimeInPit, 0);
    const invalidNoCut = !valid && cuts <= 0;
    const notes: string[] = [];
    if (cuts > 0) notes.push(`Salida x${cuts}`);
    if (collisionsCar > 0) notes.push(`Contacto x${collisionsCar}`);
    if (collisionsEnv > 0) notes.push(`Muro x${collisionsEnv}`);
    if (!valid && !invalidNoCut) notes.push('Vuelta invalida');
    if (boolValue(lap.ESCPressed)) notes.push('ESC');
    return {
      lapNumber: numberValue(lap.LapCount, index + 1),
      lapTimeMs: numberValue(lap.LapTime, 0),
      lapTime: formatLapMs(lap.LapTime),
      valid,
      cuts,
      collisionsCar,
      collisionsEnv,
      timeInPitLaneMs,
      timeInPitMs,
      escPressed: boolValue(lap.ESCPressed),
      invalidNoCut,
      notes
    };
  });
}


export function readRaceSession(db: StrackerDb, sessionId: number) {
  return db.all(`
    SELECT
      s.SessionId,
      s.SessionType,
      s.StartTimeDate,
      s.EndTimeDate,
      s.NumberOfLaps,
      s.Duration,
      s.ComboId,
      t.Track,
      t.UiTrackName,
      COUNT(DISTINCT pis.PlayerInSessionId) AS PlayerCount,
      COUNT(l.LapId) AS LapCount,
      COALESCE(MAX(l.Timestamp), 0) AS LastLapUnix
    FROM Session s
    LEFT JOIN Tracks t ON t.TrackId = s.TrackId
    LEFT JOIN PlayerInSession pis ON pis.SessionId = s.SessionId
    LEFT JOIN Lap l ON l.PlayerInSessionId = pis.PlayerInSessionId
    WHERE s.SessionId = ?
    GROUP BY s.SessionId
    LIMIT 1
  `, [sessionId])[0] || null;
}

export function findRatingCandidateRaceSessions(db: StrackerDb, options: {
  limit?: number;
  minDrivers?: number;
  minTotalLaps?: number;
} = {}) {
  const limit = Math.max(1, Math.min(500, numberValue(options.limit, 80)));
  const minDrivers = Math.max(1, numberValue(options.minDrivers, 2));
  const minTotalLaps = Math.max(1, numberValue(options.minTotalLaps, 10));

  return db.all(`
    SELECT
      s.SessionId,
      s.SessionType,
      s.StartTimeDate,
      s.EndTimeDate,
      s.NumberOfLaps,
      s.Duration,
      s.ComboId,
      t.Track,
      t.UiTrackName,
      COUNT(DISTINCT pis.PlayerInSessionId) AS PlayerCount,
      COUNT(l.LapId) AS LapCount,
      COALESCE(MAX(l.Timestamp), 0) AS LastLapUnix,
      COALESCE(MAX(l.LapCount), 0) AS MaxLapCount,
      COALESCE(MIN(CASE WHEN l.LapTime > 0 THEN l.LapTime END), 0) AS BestLapMs,
      COALESCE(SUM(l.Cuts), 0) AS Cuts,
      COALESCE(SUM(l.CollisionsCar), 0) AS CollisionsCar,
      COALESCE(SUM(l.CollisionsEnv), 0) AS CollisionsEnv
    FROM Session s
    LEFT JOIN Tracks t ON t.TrackId = s.TrackId
    LEFT JOIN PlayerInSession pis ON pis.SessionId = s.SessionId
    LEFT JOIN Lap l ON l.PlayerInSessionId = pis.PlayerInSessionId
    WHERE LOWER(s.SessionType) = 'race'
    GROUP BY s.SessionId
    HAVING PlayerCount >= ? AND LapCount >= ?
    ORDER BY s.StartTimeDate DESC
    LIMIT ?
  `, [minDrivers, minTotalLaps, limit]);
}
