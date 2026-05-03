import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import express from 'express';

export function serveAstroStatic(app: Express, distDir: string) {
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
}
