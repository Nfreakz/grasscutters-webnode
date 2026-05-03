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
        ? 'stracker.db3 detectado. Ya puedes consultar /api/stracker/tables.'
        : 'stracker preparado. Sincroniza desde GTX con /api/stracker/sync.',
      db: stracker,
      remote
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

async function readStrackerTables(dbPath: string) {
  const initSqlJsModule = await import('sql.js');
  const initSqlJs = initSqlJsModule.default;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  try {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const names = tableResult[0]?.values?.map((row) => String(row[0])) ?? [];

    const tables = names.map((name) => {
      let columns: Array<{ name: string; type: string | null; notNull: boolean; primaryKey: boolean }> = [];
      let rowCount: number | null = null;

      try {
        const escapedName = name.replaceAll('"', '""');
        const pragma = db.exec(`PRAGMA table_info("${escapedName}")`);
        columns =
          pragma[0]?.values?.map((row) => ({
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
  } finally {
    db.close();
  }
}

async function previewStrackerTable(dbPath: string, tableName: string, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 25));
  const initSqlJsModule = await import('sql.js');
  const initSqlJs = initSqlJsModule.default;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  try {
    const tableResult = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const allowedTables = tableResult[0]?.values?.map((row) => String(row[0])) ?? [];

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
      result[0]?.values?.map((row) =>
        Object.fromEntries(columns.map((column, index) => [column, safeSqlValue(row[index])]))
      ) ?? [];

    return {
      ok: true,
      columns,
      rows,
      limit: safeLimit,
      message: `Preview de ${tableName} generado correctamente.`
    };
  } finally {
    db.close();
  }
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
    mode: 'hostinger-singlefile-stracker-sftp-pull',
    startedAt
  });
});

app.get('/api/status', (_req, res) => {
  const modules = getModules();

  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    mode: 'hostinger-singlefile-stracker-sftp-pull',
    modules: {
      web: modules.web.enabled,
      api: modules.api.enabled,
      discord: modules.discord.enabled,
      stracker: modules.stracker.enabled,
      users: modules.users.enabled
    },
    moduleStatus: modules,
    note: 'Paquete 07A: sincronización SFTP pull desde GTX preparada. No conecta al arrancar, solo bajo petición protegida.'
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
    lastSync: lastSyncResult,
    syncInProgress,
    message: 'No se muestran usuario, contraseña ni secret. Solo si están configurados.'
  });
});

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

app.get('/api/hotlaps', (_req, res) => {
  const stracker = getStrackerConfig();

  res.json({
    ok: false,
    items: [],
    stracker: {
      exists: stracker.exists,
      path: stracker.relativePath,
      modifiedAt: stracker.modifiedAt,
      sizeBytes: stracker.sizeBytes
    },
    message: stracker.exists
      ? 'stracker.db3 detectado. Falta mapear las tablas reales para construir hotlaps.'
      : 'Hotlaps pendiente de sincronizar stracker.db3 desde GTX.'
  });
});

app.get('/api/pilots', (_req, res) => {
  res.json({
    ok: true,
    mode: 'mock',
    items: mockPilots,
    message: 'Área de pilotos en maqueta. La base real se activará más adelante.'
  });
});

app.get('/api/events/upcoming', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    message: 'Eventos pendientes de base de datos.'
  });
});

app.get('/api/debug/runtime', (_req, res) => {
  const stracker = getStrackerConfig();

  res.json({
    ok: true,
    runtime: {
      mode: 'hostinger-singlefile-stracker-sftp-pull',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      startedAt,
      port: PORT,
      host: HOST,
      rootDir,
      distDir,
      distExists: fs.existsSync(distDir),
      stracker,
      remote: getRemoteStrackerConfig(),
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
  console.log('[GC] Modo: hostinger-singlefile-stracker-sftp-pull');
});
