import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { env } from '../config/env';
import { registerApiRoutes } from '../api/registerApiRoutes';
import { startDiscordBot } from '../bot/createDiscordBot';
import { getAppDb } from '../db/appDb';
import { logger } from '../shared/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const distClientDir = path.join(rootDir, 'dist/client');
const distServerEntry = path.join(rootDir, 'dist/server/entry.mjs');

async function loadAstroHandler() {
  if (!fs.existsSync(distServerEntry)) {
    logger.warn('server', 'No existe dist/server/entry.mjs. Ejecuta build antes de usar Astro en el servidor único.');
    return null;
  }

  const mod = await import(pathToFileURL(distServerEntry).href);

  if (typeof mod.handler !== 'function') {
    throw new Error('dist/server/entry.mjs no exporta handler. Revisa el modo middleware de @astrojs/node.');
  }

  return mod.handler as express.RequestHandler;
}

async function main() {
  const app = express();

  getAppDb();
  registerApiRoutes(app);

  if (fs.existsSync(distClientDir)) {
    app.use(express.static(distClientDir, { maxAge: env.NODE_ENV === 'production' ? '1y' : 0 }));
  }

  const astroHandler = await loadAstroHandler();

  if (astroHandler) {
    app.use(astroHandler);
  } else {
    app.get('/', (_req, res) => {
      res.type('html').send(`
        <!doctype html>
        <html lang="es">
          <head><meta charset="utf-8"><title>GrassCutters Node</title></head>
          <body style="font-family: system-ui; background:#06110d; color:#eefdf5; padding:40px;">
            <h1>GrassCutters Node activo</h1>
            <p>API lista. Para servir Astro desde este mismo Node primero hay que generar dist.</p>
            <p><a style="color:#83ff9f" href="/api/status">Ver /api/status</a></p>
          </body>
        </html>
      `);
    });
  }

  await startDiscordBot();

  app.listen(env.PORT, () => {
    logger.info('server', `Servidor único activo en puerto ${env.PORT}`);
  });
}

main().catch((error) => {
  logger.error('server', 'Error arrancando GrassCutters Node', error);
  process.exit(1);
});
