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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'grasscutters-node',
    mode: 'hostinger-minimal'
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    message: 'GC API funcionando en Hostinger',
    modules: {
      web: true,
      api: true,
      discord: false,
      stracker: false,
      users: false
    },
    note: 'Deploy base sin SQLite, Discord ni stracker. Primero estabilizamos la web.'
  });
});

app.get('/api/stracker/tables', (_req, res) => {
  res.json({
    ok: false,
    tables: [],
    message: 'stracker.db3 todavía no está conectado en este deploy base.'
  });
});

app.get('/api/hotlaps', (_req, res) => {
  res.json({
    ok: false,
    items: [],
    message: 'Hotlaps pendiente de conexión real con stracker.db3.'
  });
});

app.get('/api/pilots', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    message: 'Área de pilotos pendiente de base de datos.'
  });
});

app.get('/api/events/upcoming', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    message: 'Eventos pendientes de base de datos.'
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
  <body style="font-family: system-ui; background:#06110d; color:#eefdf5; padding:40px;">
    <h1>GrassCutters Node activo</h1>
    <p>El servidor ha arrancado, pero todavía no existe la carpeta dist.</p>
    <p>Ruta pedida: ${req.path}</p>
    <p><a style="color:#83ff9f" href="/api/status">Ver /api/status</a></p>
  </body>
</html>`);
});

app.listen(PORT, HOST, () => {
  console.log(`[GC] Servidor activo en ${HOST}:${PORT}`);
});
