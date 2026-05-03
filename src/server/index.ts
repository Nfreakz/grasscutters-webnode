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

function resolveProjectPath(value: string | undefined | null) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
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
    sizeBytes: stats?.size ?? 0,
    modifiedAt: stats?.mtime?.toISOString?.() ?? null
  };
}

function getModules() {
  const stracker = getStrackerConfig();

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
      status: stracker.exists ? 'file_detected' : 'waiting_file',
      message: stracker.exists
        ? 'stracker.db3 detectado. Ya puedes consultar /api/stracker/tables.'
        : 'stracker preparado, pero todavía no existe data/stracker/stracker.db3 en Hostinger.',
      db: stracker
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
    mode: 'hostinger-singlefile-stracker-detector',
    startedAt
  });
});

app.get('/api/status', (_req, res) => {
  const modules = getModules();

  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    mode: 'hostinger-singlefile-stracker-detector',
    modules: {
      web: modules.web.enabled,
      api: modules.api.enabled,
      discord: modules.discord.enabled,
      stracker: modules.stracker.enabled,
      users: modules.users.enabled
    },
    moduleStatus: modules,
    note: 'Paquete 06: detector seguro de stracker.db3. No lee la DB al arrancar, solo cuando se consulta la ruta.'
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
    stracker: getModules().stracker
  });
});

app.get('/api/stracker/tables', async (_req, res) => {
  const stracker = getStrackerConfig();

  if (!stracker.resolvedPath || !stracker.exists) {
    res.status(200).json({
      ok: false,
      tables: [],
      stracker,
      message: 'No se ha encontrado stracker.db3. Sube el archivo a data/stracker/stracker.db3 o define STRACKER_DB_PATH.'
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
      path: stracker.relativePath
    },
    message: stracker.exists
      ? 'stracker.db3 detectado. Falta mapear las tablas reales para construir hotlaps.'
      : 'Hotlaps pendiente de subir stracker.db3.'
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
      mode: 'hostinger-singlefile-stracker-detector',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      startedAt,
      port: PORT,
      host: HOST,
      rootDir,
      distDir,
      distExists: fs.existsSync(distDir),
      stracker
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
  console.log('[GC] Modo: hostinger-singlefile-stracker-detector');
});
