import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { env } from '../config/env';
import { registerApiRoutes } from '../api/registerApiRoutes';
import { startDiscordBot } from '../bot/createDiscordBot';
import { logger } from '../shared/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const distClientDir = path.join(rootDir, 'dist/client');
const distServerEntry = path.join(rootDir, 'dist/server/entry.mjs');

async function loadAstroHandler() {
  if (!fs.existsSync(distServerEntry)) {
    logger.warn('server', 'No existe dist/server/entry.mjs. Ejecuta npm run build antes de arrancar en producción.');
    return null;
  }

  const mod = await import(pathToFileURL(distServerEntry).href);

  if (typeof mod.handler !== 'function') {
    throw new Error('dist/server/entry.mjs no exporta handler. Revisa @astrojs/node en modo middleware.');
  }

  return mod.handler as express.RequestHandler;
}

async function main() {
  const app = express();

  app.disable('x-powered-by');

  // IMPORTANTE HOSTINGER:
  // No inicializamos SQLite/stracker al arrancar. En hosting compartido, los módulos nativos
  // pueden fallar y tirar todo el proceso. Las rutas lo cargarán bajo demanda y con fallback.
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
            <p>API lista. Falta generar dist con npm run build.</p>
            <p><a style="color:#83ff9f" href="/api/status">Ver /api/status</a></p>
          </body>
        </html>
      `);
    });
  }

  try {
    await startDiscordBot();
  } catch (error) {
    logger.error('discord', 'El bot no ha arrancado, pero la web seguirá activa.', error);
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info('server', `Servidor único activo en puerto ${env.PORT}`);
  });
}

main().catch((error) => {
  logger.error('server', 'Error arrancando GrassCutters Node', error);
  process.exit(1);
});
