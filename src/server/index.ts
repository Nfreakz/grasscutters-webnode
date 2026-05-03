import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const distDir = path.join(rootDir, 'dist');
const defaultStrackerRelativePath = './data/stracker/stracker.db3';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const startedAt = new Date().toISOString();
const discordEnabled = process.env.DISCORD_ENABLED === 'true';

type PlainObject = Record<string, unknown>;
type SqlJsDatabase = any;

let syncInProgress = false;
let lastSyncResult: null | {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  sizeBytes?: number;
  savedPath?: string;
  backupPath?: string | null;
  error?: string;
} = null;

let autoSyncTimer: NodeJS.Timeout | null = null;
let nextAutoSyncAt: string | null = null;
let autoSyncRunCount = 0;
let autoSyncFailureCount = 0;
let lastAutoSyncResult: null | {
  ok: boolean;
  reason: 'startup' | 'scheduled' | 'manual';
  startedAt: string;
  finishedAt: string;
  message: string;
  statusCode?: number;
  sync?: typeof lastSyncResult;
  error?: string;
} = null;

function resolveProjectPath(value: string | undefined | null) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function fileExists(filePath: string | null) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function isSQLiteFile(filePath: string) {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    return bytesRead === 16 && header.toString('utf8') === 'SQLite format 3\u0000';
  } finally {
    fs.closeSync(fd);
  }
}

function getStrackerConfig() {
  const envPath = process.env.STRACKER_DB_PATH;
  const configuredPath = envPath && envPath.trim().length > 0 ? envPath : defaultStrackerRelativePath;
  const resolvedPath = resolveProjectPath(configuredPath);
  const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;
  const stats = exists && resolvedPath ? fs.statSync(resolvedPath) : null;

  return {
    configured: Boolean(configuredPath),
    source: envPath ? 'env' : 'default',
    relativePath: configuredPath,
    resolvedPath,
    exists,
    validSQLite: resolvedPath && exists ? isSQLiteFile(resolvedPath) : false,
    sizeBytes: stats?.size ?? 0,
    modifiedAt: stats?.mtime?.toISOString?.() ?? null
  };
}

function getRemoteStrackerConfig() {
  const host = process.env.GTX_SFTP_HOST ?? '';
  const port = Number(process.env.GTX_SFTP_PORT ?? 22);
  const username = process.env.GTX_SFTP_USER ?? '';
  const password = process.env.GTX_SFTP_PASS ?? '';
  const remotePath = process.env.GTX_STRACKER_REMOTE_PATH ?? '';
  const secret = process.env.STRACKER_SYNC_SECRET ?? '';

  return {
    configured: Boolean(host && username && password && remotePath && secret),
    host: host ? host : null,
    port,
    usernameConfigured: Boolean(username),
    passwordConfigured: Boolean(password),
    remotePath: remotePath ? remotePath : null,
    secretConfigured: Boolean(secret),
    target: getStrackerConfig()
  };
}

function readBooleanEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function getAutoSyncConfig() {
  const enabled = readBooleanEnv('STRACKER_AUTO_SYNC_ENABLED', false);
  const intervalMinutes = readNumberEnv('STRACKER_AUTO_SYNC_INTERVAL_MINUTES', 5, 1, 24 * 60);
  const initialDelaySeconds = readNumberEnv('STRACKER_AUTO_SYNC_INITIAL_DELAY_SECONDS', 30, 0, 60 * 60);
  const remote = getRemoteStrackerConfig();

  return {
    enabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    initialDelaySeconds,
    initialDelayMs: initialDelaySeconds * 1000,
    canRun: enabled && remote.configured,
    remoteConfigured: remote.configured,
    nextAutoSyncAt,
    syncInProgress,
    runCount: autoSyncRunCount,
    failureCount: autoSyncFailureCount,
    lastAutoSync: lastAutoSyncResult,
    message: enabled
      ? remote.configured
        ? `Auto-sync activo cada ${intervalMinutes} minutos.`
        : 'Auto-sync activado, pero faltan variables SFTP/secret.'
      : 'Auto-sync desactivado. Activa STRACKER_AUTO_SYNC_ENABLED=true.'
  };
}

function scheduleNextAutoSync(delayMs: number) {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  nextAutoSyncAt = new Date(Date.now() + delayMs).toISOString();
  autoSyncTimer = setTimeout(() => {
    void runAutoSyncCycle('scheduled');
  }, delayMs);

  if (typeof autoSyncTimer.unref === 'function') {
    autoSyncTimer.unref();
  }
}

async function runAutoSyncCycle(reason: 'startup' | 'scheduled' | 'manual' = 'scheduled') {
  const config = getAutoSyncConfig();

  if (!config.enabled) {
    nextAutoSyncAt = null;
    return;
  }

  if (!config.remoteConfigured) {
    console.warn('[GC] Auto-sync activado, pero faltan variables SFTP o STRACKER_SYNC_SECRET.');
    lastAutoSyncResult = {
      ok: false,
      reason,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: 'Faltan variables SFTP o STRACKER_SYNC_SECRET para ejecutar auto-sync.',
      statusCode: 400
    };
    autoSyncFailureCount += 1;
    scheduleNextAutoSync(config.intervalMs);
    return;
  }

  const started = new Date().toISOString();
  autoSyncRunCount += 1;
  console.log(`[GC] Auto-sync stracker iniciado (${reason}).`);

  try {
    const result = await syncStrackerFromGTX();
    const ok = Boolean(result.ok);
    if (!ok) autoSyncFailureCount += 1;

    lastAutoSyncResult = {
      ok,
      reason,
      startedAt: started,
      finishedAt: new Date().toISOString(),
      message: result.message,
      statusCode: result.statusCode,
      sync: lastSyncResult,
      error: ok ? undefined : result.sync?.error
    };

    console.log(`[GC] Auto-sync stracker finalizado: ${ok ? 'OK' : 'ERROR'} - ${result.message}`);
  } catch (error) {
    autoSyncFailureCount += 1;
    lastAutoSyncResult = {
      ok: false,
      reason,
      startedAt: started,
      finishedAt: new Date().toISOString(),
      message: 'Auto-sync falló con una excepción no esperada.',
      statusCode: 500,
      error: error instanceof Error ? error.message : String(error)
    };
    console.error('[GC] Auto-sync stracker exception:', error);
  } finally {
    scheduleNextAutoSync(getAutoSyncConfig().intervalMs);
  }
}

function startAutoSyncScheduler() {
  const config = getAutoSyncConfig();

  if (!config.enabled) {
    console.log('[GC] Auto-sync stracker desactivado.');
    return;
  }

  if (!config.remoteConfigured) {
    console.warn('[GC] Auto-sync stracker activado, pero faltan variables de entorno SFTP/secret.');
  }

  console.log(`[GC] Auto-sync stracker programado cada ${config.intervalMinutes} minutos.`);
  scheduleNextAutoSync(config.initialDelayMs);
}

function getModules() {
  const stracker = getStrackerConfig();
  const remote = getRemoteStrackerConfig();

  return {
    web: {
      enabled: true,
      status: fs.existsSync(distDir) ? 'active' : 'missing_dist',
      message: fs.existsSync(distDir)
        ? 'Web Astro estática servida desde dist.'
        : 'No existe dist todavía. Revisa que el build haya terminado.'
    },
    api: {
      enabled: true,
      status: 'active',
      message: 'API Express activa en modo Hostinger seguro.'
    },
    discord: {
      enabled: discordEnabled,
      status: discordEnabled ? 'configured_later' : 'disabled',
      message: discordEnabled
        ? 'Discord marcado como activo, pero el bot real no arranca todavía.'
        : 'Discord apagado en este despliegue.'
    },
    stracker: {
      enabled: stracker.exists,
      status: stracker.exists ? 'file_detected' : 'waiting_sync',
      message: stracker.exists
        ? 'stracker.db3 detectado. Endpoints reales activos: /api/hotlaps, /api/drivers, /api/cars, /api/tracks.'
        : 'stracker preparado. Sincroniza desde GTX con /api/stracker/sync.',
      db: stracker,
      remote,
      autoSync: getAutoSyncConfig()
    },
    users: {
      enabled: false,
      status: 'mock',
      message: 'Área de pilotos en modo maqueta. Login y base de datos pendientes.'
    }
  };
}

function safeSqlValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function getOneQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return getOneQueryValue(value[0]);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function getQueryString(req: express.Request, name: string, fallback = '') {
  return getOneQueryValue(req.query[name])?.trim() ?? fallback;
}

function getQueryNumber(req: express.Request, name: string, fallback: number, min?: number, max?: number) {
  const raw = getOneQueryValue(req.query[name]);
  const parsed = Number(raw);
  let value = Number.isFinite(parsed) ? parsed : fallback;
  if (typeof min === 'number') value = Math.max(min, value);
  if (typeof max === 'number') value = Math.min(max, value);
  return value;
}

function getQueryBool(req: express.Request, name: string, fallback: boolean) {
  const raw = getOneQueryValue(req.query[name]);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function includesFilter(value: unknown, filter: string) {
  const normalizedFilter = normalizeText(filter);
  if (!normalizedFilter) return true;
  return normalizeText(value).includes(normalizedFilter);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lapTimeToText(msValue: unknown) {
  const ms = Number(msValue);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function unixToIso(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const millis = numeric > 1000000000000 ? numeric : numeric * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function compactNullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function getDisplayCar(row: PlainObject) {
  return compactNullableText(row.UiCarName) ?? compactNullableText(row.Car) ?? 'Coche desconocido';
}

function getDisplayTrack(row: PlainObject) {
  return compactNullableText(row.UiTrackName) ?? compactNullableText(row.Track) ?? 'Circuito desconocido';
}

function getDriverName(row: PlainObject) {
  return compactNullableText(row.DriverName) ?? compactNullableText(row.Name) ?? 'Piloto desconocido';
}

function toObjects(result: any) {
  const first = result?.[0];
  if (!first) return [];
  const columns = first.columns ?? [];
  return (first.values ?? []).map((row: unknown[]) =>
    Object.fromEntries(columns.map((column: string, index: number) => [column, safeSqlValue(row[index])]))
  ) as PlainObject[];
}

async function withStrackerDb<T>(dbPath: string, callback: (db: SqlJsDatabase) => T | Promise<T>) {
  const initSqlJsModule = await import('sql.js');
  const initSqlJs = initSqlJsModule.default;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

async function runStrackerQuery(dbPath: string, sql: string) {
  return withStrackerDb(dbPath, (db) => toObjects(db.exec(sql)));
}

function getSafeStrackerOrRespond(res: express.Response) {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.status(200).json({
      ok: false,
      stracker,
      message: stracker.exists
        ? 'stracker.db3 existe, pero no parece SQLite válido.'
        : 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
    });
    return null;
  }

  return stracker;
}

async function readStrackerTables(dbPath: string) {
  return withStrackerDb(dbPath, (db) => {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const names = tableResult[0]?.values?.map((row: unknown[]) => String(row[0])) ?? [];

    const tables = names.map((name: string) => {
      let columns: Array<{ name: string; type: string | null; notNull: boolean; primaryKey: boolean }> = [];
      let rowCount: number | null = null;

      try {
        const escapedName = name.replaceAll('"', '""');
        const pragma = db.exec(`PRAGMA table_info("${escapedName}")`);
        columns =
          pragma[0]?.values?.map((row: unknown[]) => ({
            name: String(row[1]),
            type: row[2] ? String(row[2]) : null,
            notNull: Boolean(row[3]),
            primaryKey: Boolean(row[5])
          })) ?? [];
      } catch (error) {
        columns = [];
      }

      try {
        const escapedName = name.replaceAll('"', '""');
        const countResult = db.exec(`SELECT COUNT(*) AS total FROM "${escapedName}"`);
        rowCount = Number(countResult[0]?.values?.[0]?.[0] ?? 0);
      } catch (error) {
        rowCount = null;
      }

      return {
        name,
        rowCount,
        columns
      };
    });

    return tables;
  });
}

async function previewStrackerTable(dbPath: string, tableName: string, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 25));

  return withStrackerDb(dbPath, (db) => {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const allowedTables = tableResult[0]?.values?.map((row: unknown[]) => String(row[0])) ?? [];

    if (!allowedTables.includes(tableName)) {
      return {
        ok: false,
        columns: [],
        rows: [],
        message: `La tabla ${tableName} no existe en stracker.db3.`
      };
    }

    const escapedName = tableName.replaceAll('"', '""');
    const result = db.exec(`SELECT * FROM "${escapedName}" LIMIT ${safeLimit}`);
    const columns = result[0]?.columns ?? [];
    const rows =
      result[0]?.values?.map((row: unknown[]) =>
        Object.fromEntries(columns.map((column: string, index: number) => [column, safeSqlValue(row[index])]))
      ) ?? [];

    return {
      ok: true,
      columns,
      rows,
      limit: safeLimit,
      message: `Preview de ${tableName} generado correctamente.`
    };
  });
}

function readRequestSecret(req: express.Request) {
  const headerSecret = req.headers['x-gc-secret'];
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : null;
  const bodySecret = typeof req.body?.secret === 'string' ? req.body.secret : null;

  if (typeof headerSecret === 'string' && headerSecret.trim()) return headerSecret;
  if (bearer && bearer.trim()) return bearer;
  if (bodySecret && bodySecret.trim()) return bodySecret;
  if (querySecret && querySecret.trim()) return querySecret;
  return '';
}

function assertSyncSecret(req: express.Request) {
  const expected = process.env.STRACKER_SYNC_SECRET ?? '';
  const provided = readRequestSecret(req);

  return Boolean(expected && provided && expected === provided);
}

async function syncStrackerFromGTX() {
  if (syncInProgress) {
    return {
      ok: false,
      statusCode: 409,
      message: 'Ya hay una sincronización en curso.'
    };
  }

  const started = new Date().toISOString();
  const remote = getRemoteStrackerConfig();
  const target = getStrackerConfig();

  if (!remote.configured) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Faltan variables GTX_SFTP_HOST, GTX_SFTP_PORT, GTX_SFTP_USER, GTX_SFTP_PASS, GTX_STRACKER_REMOTE_PATH o STRACKER_SYNC_SECRET.',
      remote
    };
  }

  if (!target.resolvedPath) {
    return {
      ok: false,
      statusCode: 400,
      message: 'No se pudo resolver la ruta local de stracker.db3.'
    };
  }

  syncInProgress = true;
  ensureDirForFile(target.resolvedPath);

  const tempPath = `${target.resolvedPath}.download`;
  const backupPath = fileExists(target.resolvedPath)
    ? `${target.resolvedPath}.backup-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`
    : null;

  let sftp: any = null;

  try {
    const sftpModule = await import('ssh2-sftp-client');
    const SftpClient = sftpModule.default;
    sftp = new SftpClient('grasscutters-stracker-sync');

    await sftp.connect({
      host: process.env.GTX_SFTP_HOST,
      port: Number(process.env.GTX_SFTP_PORT ?? 22),
      username: process.env.GTX_SFTP_USER,
      password: process.env.GTX_SFTP_PASS,
      readyTimeout: Number(process.env.GTX_SFTP_TIMEOUT_MS ?? 20000)
    });

    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    await sftp.fastGet(process.env.GTX_STRACKER_REMOTE_PATH, tempPath);

    const stats = fs.statSync(tempPath);

    if (stats.size < 100) {
      throw new Error(`Archivo descargado demasiado pequeño: ${stats.size} bytes.`);
    }

    if (!isSQLiteFile(tempPath)) {
      throw new Error('El archivo descargado no parece SQLite válido. Cabecera incorrecta.');
    }

    if (backupPath && fs.existsSync(target.resolvedPath)) {
      fs.copyFileSync(target.resolvedPath, backupPath);
    }

    fs.renameSync(tempPath, target.resolvedPath);

    const finished = new Date().toISOString();
    lastSyncResult = {
      ok: true,
      startedAt: started,
      finishedAt: finished,
      sizeBytes: stats.size,
      savedPath: target.relativePath,
      backupPath: backupPath ? path.relative(rootDir, backupPath) : null
    };

    return {
      ok: true,
      statusCode: 200,
      message: 'stracker.db3 sincronizado correctamente desde GTX.',
      sync: lastSyncResult,
      stracker: getStrackerConfig()
    };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {
        // no-op
      }
    }

    const finished = new Date().toISOString();
    lastSyncResult = {
      ok: false,
      startedAt: started,
      finishedAt: finished,
      error: error instanceof Error ? error.message : String(error)
    };

    return {
      ok: false,
      statusCode: 500,
      message: 'No se pudo sincronizar stracker.db3 desde GTX.',
      sync: lastSyncResult
    };
  } finally {
    syncInProgress = false;
    if (sftp) {
      try {
        await sftp.end();
      } catch (_) {
        // no-op
      }
    }
  }
}

const joinedLapsSql = `
  SELECT
    L.LapId,
    L.PlayerInSessionId,
    L.TyreCompoundId,
    L.LapCount,
    L.SessionTime,
    L.LapTime,
    L.SectorTime0,
    L.SectorTime1,
    L.SectorTime2,
    L.SectorTime3,
    L.SectorTime4,
    L.SectorTime5,
    L.SectorTime6,
    L.SectorTime7,
    L.SectorTime8,
    L.SectorTime9,
    L.FuelRatio,
    L.Valid,
    L.SectorsAreSoftSplits,
    L.MaxABS,
    L.MaxTC,
    L.TemperatureAmbient,
    L.TemperatureTrack,
    L.Timestamp,
    L.AidABS,
    L.AidTC,
    L.AidAutoBlib,
    L.AidAutoBrake,
    L.AidAutoClutch,
    L.AidAutoShift,
    L.AidIdealLine,
    L.AidStabilityControl,
    L.AidSlipStream,
    L.AidTyreBlankets,
    L.MaxSpeed_KMH,
    L.TimeInPitLane,
    L.TimeInPit,
    L.ESCPressed,
    L.Cuts,
    L.CollisionsCar,
    L.CollisionsEnv,
    L.GripLevel,
    L.Ballast,
    P.PlayerId,
    P.Name AS DriverName,
    P.SteamGuid,
    P.IsOnline,
    P.Whitelisted,
    P.Anonymized,
    PIS.CarId,
    PIS.SessionId,
    PIS.ACVersion,
    PIS.InputMethod,
    PIS.Shifter,
    C.Car,
    C.UiCarName,
    C.Brand,
    S.TrackId,
    S.SessionType,
    S.Multiplayer,
    S.ServerIpPort,
    S.StartTimeDate,
    S.EndTimeDate,
    S.ComboId,
    T.Track,
    T.UiTrackName,
    T.Length AS TrackLength
  FROM Lap L
  LEFT JOIN PlayerInSession PIS ON PIS.PlayerInSessionId = L.PlayerInSessionId
  LEFT JOIN Players P ON P.PlayerId = PIS.PlayerId
  LEFT JOIN Cars C ON C.CarId = PIS.CarId
  LEFT JOIN Session S ON S.SessionId = PIS.SessionId
  LEFT JOIN Tracks T ON T.TrackId = S.TrackId
  WHERE L.LapTime IS NOT NULL AND L.LapTime > 0
`;

function mapLapRow(row: PlainObject) {
  const sectorTimes = [
    row.SectorTime0,
    row.SectorTime1,
    row.SectorTime2,
    row.SectorTime3,
    row.SectorTime4,
    row.SectorTime5,
    row.SectorTime6,
    row.SectorTime7,
    row.SectorTime8,
    row.SectorTime9
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    lapId: numberOrNull(row.LapId),
    playerInSessionId: numberOrNull(row.PlayerInSessionId),
    sessionId: numberOrNull(row.SessionId),
    comboId: numberOrNull(row.ComboId),
    driver: {
      id: numberOrNull(row.PlayerId),
      name: getDriverName(row),
      steamGuid: compactNullableText(row.SteamGuid),
      isOnline: compactNullableText(row.IsOnline),
      whitelisted: numberOrNull(row.Whitelisted),
      anonymized: numberOrNull(row.Anonymized)
    },
    car: {
      id: numberOrNull(row.CarId),
      code: compactNullableText(row.Car),
      name: getDisplayCar(row),
      uiName: compactNullableText(row.UiCarName),
      brand: compactNullableText(row.Brand)
    },
    track: {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: getDisplayTrack(row),
      uiName: compactNullableText(row.UiTrackName),
      length: numberOrNull(row.TrackLength)
    },
    lapTimeMs: numberOrNull(row.LapTime),
    lapTime: lapTimeToText(row.LapTime),
    valid: Number(row.Valid) === 1,
    cuts: numberOrNull(row.Cuts),
    collisionsCar: numberOrNull(row.CollisionsCar),
    collisionsEnv: numberOrNull(row.CollisionsEnv),
    maxSpeedKmh: numberOrNull(row.MaxSpeed_KMH),
    sectorTimesMs: sectorTimes,
    sectorTimes: sectorTimes.map(lapTimeToText),
    fuelRatio: numberOrNull(row.FuelRatio),
    gripLevel: numberOrNull(row.GripLevel),
    ballast: numberOrNull(row.Ballast),
    temperatureAmbient: numberOrNull(row.TemperatureAmbient),
    temperatureTrack: numberOrNull(row.TemperatureTrack),
    timestamp: numberOrNull(row.Timestamp),
    timestampIso: unixToIso(row.Timestamp),
    session: {
      type: compactNullableText(row.SessionType),
      multiplayer: numberOrNull(row.Multiplayer),
      server: compactNullableText(row.ServerIpPort),
      startTime: numberOrNull(row.StartTimeDate),
      startTimeIso: unixToIso(row.StartTimeDate),
      endTime: numberOrNull(row.EndTimeDate),
      endTimeIso: unixToIso(row.EndTimeDate)
    },
    aids: {
      abs: numberOrNull(row.AidABS),
      tc: numberOrNull(row.AidTC),
      autoBlib: numberOrNull(row.AidAutoBlib),
      autoBrake: numberOrNull(row.AidAutoBrake),
      autoClutch: numberOrNull(row.AidAutoClutch),
      autoShift: numberOrNull(row.AidAutoShift),
      idealLine: numberOrNull(row.AidIdealLine),
      stabilityControl: numberOrNull(row.AidStabilityControl),
      slipStream: numberOrNull(row.AidSlipStream),
      tyreBlankets: numberOrNull(row.AidTyreBlankets)
    },
    input: {
      method: compactNullableText(row.InputMethod),
      shifter: numberOrNull(row.Shifter)
    }
  };
}

async function readJoinedLaps(dbPath: string) {
  const rows = await runStrackerQuery(dbPath, `${joinedLapsSql} ORDER BY L.LapTime ASC`);
  return rows.map(mapLapRow);
}

function filterLaps(laps: ReturnType<typeof mapLapRow>[], req: express.Request, defaults?: { validOnly?: boolean }) {
  const validParam = getQueryString(req, 'valid', defaults?.validOnly === false ? 'all' : '1').toLowerCase();
  const validOnly = !['all', 'any', '0', 'false', 'no'].includes(validParam);
  const includeInvalidOnly = ['invalid', 'false-only'].includes(validParam);
  const driverFilter = getQueryString(req, 'driver') || getQueryString(req, 'pilot') || getQueryString(req, 'player');
  const carFilter = getQueryString(req, 'car') || getQueryString(req, 'coche');
  const trackFilter = getQueryString(req, 'track') || getQueryString(req, 'circuit');
  const brandFilter = getQueryString(req, 'brand') || getQueryString(req, 'marca');
  const sessionTypeFilter = getQueryString(req, 'sessionType') || getQueryString(req, 'session');
  const playerId = getQueryNumber(req, 'playerId', NaN);
  const carId = getQueryNumber(req, 'carId', NaN);
  const trackId = getQueryNumber(req, 'trackId', NaN);
  const comboId = getQueryNumber(req, 'comboId', NaN);
  const sinceHours = getQueryNumber(req, 'sinceHours', NaN, 1, 24 * 365 * 10);
  const now = Date.now();

  return laps.filter((lap) => {
    if (validOnly && !lap.valid) return false;
    if (includeInvalidOnly && lap.valid) return false;
    if (Number.isFinite(playerId) && lap.driver.id !== playerId) return false;
    if (Number.isFinite(carId) && lap.car.id !== carId) return false;
    if (Number.isFinite(trackId) && lap.track.id !== trackId) return false;
    if (Number.isFinite(comboId) && lap.comboId !== comboId) return false;
    if (driverFilter && !includesFilter(lap.driver.name, driverFilter)) return false;
    if (carFilter && !includesFilter(`${lap.car.name} ${lap.car.code}`, carFilter)) return false;
    if (trackFilter && !includesFilter(`${lap.track.name} ${lap.track.code}`, trackFilter)) return false;
    if (brandFilter && !includesFilter(lap.car.brand, brandFilter)) return false;
    if (sessionTypeFilter && !includesFilter(lap.session.type, sessionTypeFilter)) return false;

    if (Number.isFinite(sinceHours)) {
      const timestampMs = lap.timestamp ? lap.timestamp * 1000 : null;
      if (!timestampMs || now - timestampMs > sinceHours * 60 * 60 * 1000) return false;
    }

    return true;
  });
}

function makeBestHotlaps(laps: ReturnType<typeof mapLapRow>[], groupMode: string) {
  if (groupMode === 'laps' || groupMode === 'raw' || groupMode === 'all') {
    return [...laps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity));
  }

  const bestMap = new Map<string, ReturnType<typeof mapLapRow>>();

  for (const lap of laps) {
    const key = groupMode === 'driver'
      ? `${lap.driver.id ?? lap.driver.name}`
      : groupMode === 'driver-track'
        ? `${lap.driver.id ?? lap.driver.name}|${lap.track.id ?? lap.track.name}`
        : groupMode === 'car-track'
          ? `${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`
          : `${lap.driver.id ?? lap.driver.name}|${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`;

    const current = bestMap.get(key);
    if (!current || Number(lap.lapTimeMs ?? Infinity) < Number(current.lapTimeMs ?? Infinity)) {
      bestMap.set(key, lap);
    }
  }

  return Array.from(bestMap.values()).sort(
    (a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity)
  );
}

function buildOptionsFromLaps(laps: ReturnType<typeof mapLapRow>[]) {
  const cars = new Map<string, unknown>();
  const tracks = new Map<string, unknown>();
  const drivers = new Map<string, unknown>();

  for (const lap of laps) {
    if (lap.car.id !== null) cars.set(String(lap.car.id), lap.car);
    if (lap.track.id !== null) tracks.set(String(lap.track.id), lap.track);
    if (lap.driver.id !== null) drivers.set(String(lap.driver.id), lap.driver);
  }

  return {
    drivers: Array.from(drivers.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    cars: Array.from(cars.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    tracks: Array.from(tracks.values()).sort((a: any, b: any) => a.name.localeCompare(b.name))
  };
}

function summarizeFilters(req: express.Request) {
  return {
    valid: getQueryString(req, 'valid', '1'),
    driver: getQueryString(req, 'driver') || getQueryString(req, 'pilot') || getQueryString(req, 'player') || null,
    playerId: getQueryString(req, 'playerId') || null,
    car: getQueryString(req, 'car') || getQueryString(req, 'coche') || null,
    carId: getQueryString(req, 'carId') || null,
    track: getQueryString(req, 'track') || getQueryString(req, 'circuit') || null,
    trackId: getQueryString(req, 'trackId') || null,
    comboId: getQueryString(req, 'comboId') || null,
    brand: getQueryString(req, 'brand') || getQueryString(req, 'marca') || null,
    sessionType: getQueryString(req, 'sessionType') || getQueryString(req, 'session') || null,
    sinceHours: getQueryString(req, 'sinceHours') || null
  };
}

function reduceDriverStats(laps: ReturnType<typeof mapLapRow>[]) {
  const map = new Map<string, any>();

  for (const lap of laps) {
    const id = String(lap.driver.id ?? lap.driver.name);
    if (!map.has(id)) {
      map.set(id, {
        id: lap.driver.id,
        name: lap.driver.name,
        steamGuid: lap.driver.steamGuid,
        isOnline: lap.driver.isOnline,
        totalLaps: 0,
        validLaps: 0,
        invalidLaps: 0,
        bestLapMs: null,
        bestLap: null,
        bestLapDetails: null,
        lastSeenTimestamp: null,
        lastSeenAt: null,
        cars: new Map(),
        tracks: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    else entry.invalidLaps += 1;

    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
      entry.bestLapDetails = {
        lapId: lap.lapId,
        car: lap.car,
        track: lap.track,
        timestampIso: lap.timestampIso
      };
    }

    if (lap.timestamp && (!entry.lastSeenTimestamp || lap.timestamp > entry.lastSeenTimestamp)) {
      entry.lastSeenTimestamp = lap.timestamp;
      entry.lastSeenAt = lap.timestampIso;
    }

    if (lap.car.id !== null) entry.cars.set(String(lap.car.id), lap.car);
    if (lap.track.id !== null) entry.tracks.set(String(lap.track.id), lap.track);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      cars: Array.from(entry.cars.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      tracks: Array.from(entry.tracks.values()).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      carsCount: entry.cars.size,
      tracksCount: entry.tracks.size
    }))
    .sort((a, b) => b.validLaps - a.validLaps || a.name.localeCompare(b.name));
}

function reduceCarStats(laps: ReturnType<typeof mapLapRow>[], carsRows: PlainObject[]) {
  const map = new Map<string, any>();

  for (const row of carsRows) {
    const id = String(row.CarId);
    map.set(id, {
      id: numberOrNull(row.CarId),
      code: compactNullableText(row.Car),
      name: compactNullableText(row.UiCarName) ?? compactNullableText(row.Car) ?? 'Coche desconocido',
      uiName: compactNullableText(row.UiCarName),
      brand: compactNullableText(row.Brand),
      totalLaps: 0,
      validLaps: 0,
      bestLapMs: null,
      bestLap: null,
      drivers: new Map(),
      tracks: new Map()
    });
  }

  for (const lap of laps) {
    const id = String(lap.car.id ?? lap.car.name);
    if (!map.has(id)) {
      map.set(id, {
        ...lap.car,
        totalLaps: 0,
        validLaps: 0,
        bestLapMs: null,
        bestLap: null,
        drivers: new Map(),
        tracks: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
    }
    if (lap.driver.id !== null) entry.drivers.set(String(lap.driver.id), lap.driver);
    if (lap.track.id !== null) entry.tracks.set(String(lap.track.id), lap.track);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      driversCount: entry.drivers.size,
      tracksCount: entry.tracks.size,
      drivers: undefined,
      tracks: undefined
    }))
    .sort((a, b) => b.validLaps - a.validLaps || String(a.name).localeCompare(String(b.name)));
}

function reduceTrackStats(laps: ReturnType<typeof mapLapRow>[], tracksRows: PlainObject[]) {
  const map = new Map<string, any>();

  for (const row of tracksRows) {
    const id = String(row.TrackId);
    map.set(id, {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: compactNullableText(row.UiTrackName) ?? compactNullableText(row.Track) ?? 'Circuito desconocido',
      uiName: compactNullableText(row.UiTrackName),
      length: numberOrNull(row.Length),
      totalLaps: 0,
      validLaps: 0,
      bestLapMs: null,
      bestLap: null,
      drivers: new Map(),
      cars: new Map()
    });
  }

  for (const lap of laps) {
    const id = String(lap.track.id ?? lap.track.name);
    if (!map.has(id)) {
      map.set(id, {
        ...lap.track,
        totalLaps: 0,
        validLaps: 0,
        bestLapMs: null,
        bestLap: null,
        drivers: new Map(),
        cars: new Map()
      });
    }

    const entry = map.get(id);
    entry.totalLaps += 1;
    if (lap.valid) entry.validLaps += 1;
    if (lap.valid && (entry.bestLapMs === null || Number(lap.lapTimeMs ?? Infinity) < entry.bestLapMs)) {
      entry.bestLapMs = lap.lapTimeMs;
      entry.bestLap = lap.lapTime;
    }
    if (lap.driver.id !== null) entry.drivers.set(String(lap.driver.id), lap.driver);
    if (lap.car.id !== null) entry.cars.set(String(lap.car.id), lap.car);
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      driversCount: entry.drivers.size,
      carsCount: entry.cars.size,
      drivers: undefined,
      cars: undefined
    }))
    .sort((a, b) => b.validLaps - a.validLaps || String(a.name).localeCompare(String(b.name)));
}

async function getCombos(dbPath: string) {
  const rows = await runStrackerQuery(
    dbPath,
    `
      SELECT
        Co.ComboId,
        Co.TrackId,
        T.Track,
        T.UiTrackName,
        T.Length AS TrackLength,
        C.CarId,
        C.Car,
        C.UiCarName,
        C.Brand
      FROM Combos Co
      LEFT JOIN Tracks T ON T.TrackId = Co.TrackId
      LEFT JOIN ComboCars CC ON CC.ComboId = Co.ComboId
      LEFT JOIN Cars C ON C.CarId = CC.CarId
      ORDER BY Co.ComboId ASC, C.UiCarName ASC
    `
  );

  const combos = new Map<string, any>();

  for (const row of rows) {
    const id = String(row.ComboId);
    if (!combos.has(id)) {
      combos.set(id, {
        id: numberOrNull(row.ComboId),
        track: {
          id: numberOrNull(row.TrackId),
          code: compactNullableText(row.Track),
          name: compactNullableText(row.UiTrackName) ?? compactNullableText(row.Track) ?? 'Circuito desconocido',
          length: numberOrNull(row.TrackLength)
        },
        cars: []
      });
    }

    if (row.CarId !== null && row.CarId !== undefined) {
      combos.get(id).cars.push({
        id: numberOrNull(row.CarId),
        code: compactNullableText(row.Car),
        name: compactNullableText(row.UiCarName) ?? compactNullableText(row.Car) ?? 'Coche desconocido',
        brand: compactNullableText(row.Brand)
      });
    }
  }

  return Array.from(combos.values());
}

async function getSessions(dbPath: string, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 250));
  const rows = await runStrackerQuery(
    dbPath,
    `
      SELECT
        S.SessionId,
        S.TrackId,
        S.SessionType,
        S.Multiplayer,
        S.NumberOfLaps,
        S.Duration,
        S.ServerIpPort,
        S.StartTimeDate,
        S.EndTimeDate,
        S.PenaltiesEnabled,
        S.AllowedTyresOut,
        S.TyreWearFactor,
        S.FuelRate,
        S.Damage,
        S.ComboId,
        T.Track,
        T.UiTrackName,
        T.Length AS TrackLength,
        COUNT(L.LapId) AS TotalLaps,
        SUM(CASE WHEN L.Valid = 1 THEN 1 ELSE 0 END) AS ValidLaps,
        COUNT(DISTINCT PIS.PlayerId) AS DriversCount
      FROM Session S
      LEFT JOIN Tracks T ON T.TrackId = S.TrackId
      LEFT JOIN PlayerInSession PIS ON PIS.SessionId = S.SessionId
      LEFT JOIN Lap L ON L.PlayerInSessionId = PIS.PlayerInSessionId
      GROUP BY S.SessionId
      ORDER BY S.StartTimeDate DESC
      LIMIT ${safeLimit}
    `
  );

  return rows.map((row) => ({
    id: numberOrNull(row.SessionId),
    type: compactNullableText(row.SessionType),
    multiplayer: numberOrNull(row.Multiplayer),
    numberOfLaps: numberOrNull(row.NumberOfLaps),
    duration: numberOrNull(row.Duration),
    server: compactNullableText(row.ServerIpPort),
    comboId: numberOrNull(row.ComboId),
    startTime: numberOrNull(row.StartTimeDate),
    startTimeIso: unixToIso(row.StartTimeDate),
    endTime: numberOrNull(row.EndTimeDate),
    endTimeIso: unixToIso(row.EndTimeDate),
    settings: {
      penaltiesEnabled: numberOrNull(row.PenaltiesEnabled),
      allowedTyresOut: numberOrNull(row.AllowedTyresOut),
      tyreWearFactor: numberOrNull(row.TyreWearFactor),
      fuelRate: numberOrNull(row.FuelRate),
      damage: numberOrNull(row.Damage)
    },
    track: {
      id: numberOrNull(row.TrackId),
      code: compactNullableText(row.Track),
      name: compactNullableText(row.UiTrackName) ?? compactNullableText(row.Track) ?? 'Circuito desconocido',
      length: numberOrNull(row.TrackLength)
    },
    stats: {
      totalLaps: numberOrNull(row.TotalLaps) ?? 0,
      validLaps: numberOrNull(row.ValidLaps) ?? 0,
      driversCount: numberOrNull(row.DriversCount) ?? 0
    }
  }));
}

const mockPilots = [
  {
    id: 'gc-demo-001',
    name: 'Piloto demo',
    role: 'driver',
    status: 'mock'
  }
];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'grasscutters-node',
    mode: 'hostinger-singlefile-stracker-auto-sync',
    startedAt
  });
});

app.get('/api/status', (_req, res) => {
  const modules = getModules();

  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    mode: 'hostinger-singlefile-stracker-auto-sync',
    modules: {
      web: modules.web.enabled,
      api: modules.api.enabled,
      discord: modules.discord.enabled,
      stracker: modules.stracker.enabled,
      users: modules.users.enabled
    },
    moduleStatus: modules,
    note: 'Paquete 10: lector real de stracker + auto-sync opcional cada 5 minutos.'
  });
});

app.get('/api/modules', (_req, res) => {
  res.json({
    ok: true,
    modules: getModules()
  });
});

app.get('/api/discord/status', (_req, res) => {
  res.json({
    ok: true,
    discord: getModules().discord
  });
});

app.get('/api/stracker/status', (_req, res) => {
  res.json({
    ok: true,
    stracker: getModules().stracker,
    lastSync: lastSyncResult,
    syncInProgress
  });
});

app.get('/api/stracker/remote-config', (_req, res) => {
  res.json({
    ok: true,
    remote: getRemoteStrackerConfig(),
    autoSync: getAutoSyncConfig(),
    lastSync: lastSyncResult,
    syncInProgress,
    message: 'No se muestran usuario, contraseña ni secret. Solo si están configurados.'
  });
});

app.get('/api/stracker/auto-sync/status', (_req, res) => {
  res.json({
    ok: true,
    autoSync: getAutoSyncConfig(),
    stracker: getStrackerConfig(),
    remote: getRemoteStrackerConfig(),
    lastSync: lastSyncResult,
    syncInProgress
  });
});

async function handleManualAutoSyncRun(req: express.Request, res: express.Response) {
  if (!assertSyncSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret inválido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  lastAutoSyncResult = {
    ok: Boolean(result.ok),
    reason: 'manual',
    startedAt: result.sync?.startedAt ?? new Date().toISOString(),
    finishedAt: result.sync?.finishedAt ?? new Date().toISOString(),
    message: result.message,
    statusCode: result.statusCode,
    sync: lastSyncResult,
    error: result.ok ? undefined : result.sync?.error
  };

  res.status(result.statusCode).json({
    ...result,
    autoSync: getAutoSyncConfig()
  });
}

app.get('/api/stracker/auto-sync/run', handleManualAutoSyncRun);
app.post('/api/stracker/auto-sync/run', handleManualAutoSyncRun);

async function handleStrackerSync(req: express.Request, res: express.Response) {
  if (!assertSyncSecret(req)) {
    res.status(401).json({
      ok: false,
      message: 'Secret inválido o no configurado. Usa header x-gc-secret, Bearer token, body.secret o query ?secret=...'
    });
    return;
  }

  const result = await syncStrackerFromGTX();
  res.status(result.statusCode).json(result);
}

app.get('/api/stracker/sync', handleStrackerSync);
app.post('/api/stracker/sync', handleStrackerSync);
app.get('/gc-data/sync-stracker', handleStrackerSync);
app.post('/gc-data/sync-stracker', handleStrackerSync);
app.get('/gc-data/sync-stracker.php', handleStrackerSync);
app.post('/gc-data/sync-stracker.php', handleStrackerSync);

app.get('/gc-data/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gc-data-node',
    stracker: getStrackerConfig(),
    remote: getRemoteStrackerConfig(),
    lastSync: lastSyncResult
  });
});

app.get('/api/stracker/tables', async (_req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists) {
    res.status(200).json({
      ok: false,
      tables: [],
      stracker,
      message: 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
    });
    return;
  }

  try {
    const tables = await readStrackerTables(stracker.resolvedPath);

    res.json({
      ok: true,
      stracker,
      totalTables: tables.length,
      tables,
      message: 'Tablas detectadas correctamente en stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo stracker tables:', error);
    res.status(200).json({
      ok: false,
      stracker,
      tables: [],
      message: 'El archivo existe, pero no se pudo leer como SQLite. Revisa que sea stracker.db3 válido.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/stracker/preview/:table', async (req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists) {
    res.status(200).json({
      ok: false,
      columns: [],
      rows: [],
      stracker,
      message: 'No se ha encontrado stracker.db3.'
    });
    return;
  }

  try {
    const preview = await previewStrackerTable(
      stracker.resolvedPath,
      req.params.table,
      Number(req.query.limit ?? 5)
    );

    res.json({
      ...preview,
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      }
    });
  } catch (error) {
    console.error('[GC] Error generando preview de stracker:', error);
    res.status(200).json({
      ok: false,
      columns: [],
      rows: [],
      message: 'No se pudo generar preview de la tabla.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/hotlaps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
    const groupMode = getQueryString(req, 'group', 'best').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: true });
    const items = makeBestHotlaps(filtered, groupMode).slice(0, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      group: groupMode,
      count: items.length,
      totalMatchedLaps: filtered.length,
      filters: summarizeFilters(req),
      options: getQueryBool(req, 'options', false) ? buildOptionsFromLaps(laps) : undefined,
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      },
      items,
      message: 'Hotlaps reales generadas desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo hotlaps reales:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer hotlaps reales desde stracker.db3.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/laps', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
    const sort = getQueryString(req, 'sort', 'fastest').toLowerCase();
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: false });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'recent') return Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0);
      if (sort === 'oldest') return Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0);
      return Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity);
    });

    res.json({
      ok: true,
      mode: 'real-stracker',
      sort,
      count: Math.min(sorted.length, limit),
      totalMatchedLaps: filtered.length,
      filters: summarizeFilters(req),
      items: sorted.slice(0, limit),
      message: 'Vueltas reales leídas desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo vueltas:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer vueltas reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/drivers', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 100, 1, 500);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, req, { validOnly: false });
    let items = reduceDriverStats(filtered);
    const q = getQueryString(req, 'q') || getQueryString(req, 'driver') || getQueryString(req, 'pilot');
    if (q) items = items.filter((driver) => includesFilter(driver.name, q));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: Math.min(items.length, limit),
      totalDrivers: items.length,
      items: items.slice(0, limit),
      message: 'Pilotos reales generados desde Players + Lap.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo drivers:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer pilotos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/pilots', async (req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    res.json({
      ok: true,
      mode: 'mock',
      items: mockPilots,
      message: 'Área de pilotos en maqueta. Sin stracker.db3 válido todavía.'
    });
    return;
  }

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const items = reduceDriverStats(filterLaps(laps, req, { validOnly: false }));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Pilotos reales generados desde stracker.db3. Login pendiente para área privada.'
    });
  } catch (error) {
    res.status(200).json({
      ok: false,
      mode: 'real-stracker',
      items: [],
      message: 'No se pudieron leer pilotos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/cars', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const q = getQueryString(req, 'q') || getQueryString(req, 'car');
    const brand = getQueryString(req, 'brand') || getQueryString(req, 'marca');
    const carsRows = await runStrackerQuery(
      stracker.resolvedPath,
      'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC'
    );
    const laps = await readJoinedLaps(stracker.resolvedPath);
    let items = reduceCarStats(laps, carsRows);

    if (q) items = items.filter((car) => includesFilter(`${car.name} ${car.code}`, q));
    if (brand) items = items.filter((car) => includesFilter(car.brand, brand));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Coches reales generados desde Cars.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo cars:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer coches reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/tracks', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const q = getQueryString(req, 'q') || getQueryString(req, 'track') || getQueryString(req, 'circuit');
    const tracksRows = await runStrackerQuery(
      stracker.resolvedPath,
      'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC'
    );
    const laps = await readJoinedLaps(stracker.resolvedPath);
    let items = reduceTrackStats(laps, tracksRows);

    if (q) items = items.filter((track) => includesFilter(`${track.name} ${track.code}`, q));

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Circuitos reales generados desde Tracks.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo tracks:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer circuitos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/combos', async (_req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const items = await getCombos(stracker.resolvedPath);

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Combos reales generados desde Combos + ComboCars.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo combos:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer combos reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/sessions', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 50, 1, 250);
    const items = await getSessions(stracker.resolvedPath, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      count: items.length,
      items,
      message: 'Sesiones reales generadas desde Session.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo sessions:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudieron leer sesiones reales.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/activity/recent', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const hours = getQueryNumber(req, 'hours', 48, 1, 24 * 30);
    const limit = getQueryNumber(req, 'limit', 100, 1, 500);
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const filtered = filterLaps(laps, { ...req, query: { ...req.query, sinceHours: String(hours), valid: 'all' } } as express.Request, { validOnly: false });
    const latestByDriverCombo = new Map<string, ReturnType<typeof mapLapRow>>();

    for (const lap of filtered) {
      const key = `${lap.driver.id ?? lap.driver.name}|${lap.car.id ?? lap.car.name}|${lap.track.id ?? lap.track.name}`;
      const current = latestByDriverCombo.get(key);
      if (!current || Number(lap.timestamp ?? 0) > Number(current.timestamp ?? 0)) {
        latestByDriverCombo.set(key, lap);
      }
    }

    const items = Array.from(latestByDriverCombo.values())
      .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
      .slice(0, limit);

    res.json({
      ok: true,
      mode: 'real-stracker',
      hours,
      count: items.length,
      items,
      message: `Actividad reciente de las últimas ${hours}h.`
    });
  } catch (error) {
    console.error('[GC] Error leyendo recent activity:', error);
    res.status(200).json({
      ok: false,
      items: [],
      message: 'No se pudo leer la actividad reciente.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/stats/overview', async (_req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const laps = await readJoinedLaps(stracker.resolvedPath);
    const validLaps = laps.filter((lap) => lap.valid);
    const bestLap = [...validLaps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] ?? null;
    const latestLap = [...laps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))[0] ?? null;

    res.json({
      ok: true,
      mode: 'real-stracker',
      overview: {
        totalLaps: laps.length,
        validLaps: validLaps.length,
        invalidLaps: laps.length - validLaps.length,
        driversCount: new Set(laps.map((lap) => lap.driver.id ?? lap.driver.name)).size,
        carsCount: new Set(laps.map((lap) => lap.car.id ?? lap.car.name)).size,
        tracksCount: new Set(laps.map((lap) => lap.track.id ?? lap.track.name)).size,
        bestLap,
        latestLap,
        stracker: {
          sizeBytes: stracker.sizeBytes,
          modifiedAt: stracker.modifiedAt
        }
      },
      message: 'Resumen general real generado desde stracker.db3.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo stats overview:', error);
    res.status(200).json({
      ok: false,
      overview: null,
      message: 'No se pudo generar el resumen real.',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/gc-data/hotlaps', (req, res) => {
  req.url = `/api/hotlaps${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/hotlaps.php', (req, res) => {
  req.url = `/api/hotlaps${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/drivers', (req, res) => {
  req.url = `/api/drivers${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/cars', (req, res) => {
  req.url = `/api/cars${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/gc-data/tracks', (req, res) => {
  req.url = `/api/tracks${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  app.handle(req, res);
});

app.get('/api/events/upcoming', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    message: 'Eventos pendientes de base de datos propia de la app.'
  });
});

app.get('/api/debug/runtime', (_req, res) => {
  const stracker = getStrackerConfig();

  res.json({
    ok: true,
    runtime: {
      mode: 'hostinger-singlefile-stracker-auto-sync',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      startedAt,
      port: PORT,
      host: HOST,
      rootDir,
      distDir,
      distExists: fs.existsSync(distDir),
      stracker,
      remote: getRemoteStrackerConfig(),
      autoSync: getAutoSyncConfig(),
      lastSync: lastSyncResult,
      syncInProgress
    }
  });
});

if (!fs.existsSync(distDir)) {
  console.warn(`[GC] No existe ${distDir}. Ejecuta npm run build antes de npm start.`);
}

app.use(
  express.static(distDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    index: 'index.html'
  })
);

app.use((req, res) => {
  const fallback = path.join(distDir, 'index.html');

  if (fs.existsSync(fallback)) {
    res.sendFile(fallback);
    return;
  }

  res.status(200).type('html').send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>GrassCutters Node</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: system-ui; background:#06110d; color:#eefdf5; padding:40px; line-height:1.5;">
    <h1>GrassCutters Node activo</h1>
    <p>El servidor ha arrancado, pero todavía no existe la carpeta <strong>dist</strong>.</p>
    <p>Ruta pedida: ${req.path}</p>
    <p><a style="color:#83ff9f" href="/api/status">Ver /api/status</a></p>
  </body>
</html>`);
});

process.on('uncaughtException', (error) => {
  console.error('[GC] uncaughtException:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[GC] unhandledRejection:', error);
});

app.listen(PORT, HOST, () => {
  console.log(`[GC] Servidor activo en ${HOST}:${PORT}`);
  console.log('[GC] Modo: hostinger-singlefile-stracker-auto-sync');
  startAutoSyncScheduler();
});
