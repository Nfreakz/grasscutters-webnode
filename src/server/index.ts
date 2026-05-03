import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const distDir = path.join(rootDir, 'dist');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const startedAt = new Date().toISOString();
const discordEnabled = process.env.DISCORD_ENABLED === 'true';
const strackerPath = process.env.STRACKER_DB_PATH;
const resolvedStrackerPath = strackerPath
  ? path.isAbsolute(strackerPath)
    ? strackerPath
    : path.join(rootDir, strackerPath)
  : null;
const strackerExists = resolvedStrackerPath ? fs.existsSync(resolvedStrackerPath) : false;

const modules = {
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
    enabled: Boolean(strackerPath && strackerExists),
    status: strackerPath ? (strackerExists ? 'file_detected' : 'missing_file') : 'disabled',
    message: strackerPath
      ? strackerExists
        ? 'stracker.db3 detectado, pero todavía no se lee en este paquete.'
        : 'STRACKER_DB_PATH existe, pero el archivo no está en Hostinger.'
      : 'stracker apagado. No hay STRACKER_DB_PATH definido.',
    dbPath: resolvedStrackerPath
  },
  users: {
    enabled: false,
    status: 'mock',
    message: 'Área de pilotos en modo maqueta. Login y base de datos pendientes.'
  }
};

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
    mode: 'hostinger-singlefile-safe',
    startedAt
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    mode: 'hostinger-singlefile-safe',
    modules: {
      web: modules.web.enabled,
      api: modules.api.enabled,
      discord: modules.discord.enabled,
      stracker: modules.stracker.enabled,
      users: modules.users.enabled
    },
    moduleStatus: modules,
    note: 'Hotfix 05A: servidor en un solo archivo para evitar 503 por imports/modularización en Hostinger.'
  });
});

app.get('/api/modules', (_req, res) => {
  res.json({
    ok: true,
    modules
  });
});

app.get('/api/discord/status', (_req, res) => {
  res.json({
    ok: true,
    discord: modules.discord
  });
});

app.get('/api/stracker/status', (_req, res) => {
  res.json({
    ok: true,
    stracker: modules.stracker
  });
});

app.get('/api/stracker/tables', (_req, res) => {
  res.json({
    ok: false,
    tables: [],
    message: 'Detector de tablas pendiente. Primero estabilizamos Hostinger.'
  });
});

app.get('/api/hotlaps', (_req, res) => {
  res.json({
    ok: false,
    items: [],
    message: 'Hotlaps pendiente de lectura real de stracker.db3.'
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
  res.json({
    ok: true,
    runtime: {
      mode: 'hostinger-singlefile-safe',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      startedAt,
      port: PORT,
      host: HOST,
      rootDir,
      distDir,
      distExists: fs.existsSync(distDir)
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
  console.log('[GC] Modo: hostinger-singlefile-safe');
});
