import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server', 'index.ts');

const markerV3 = 'GC_ASTRO_RUNTIME_PATCH_V3';

if (!fs.existsSync(serverPath)) {
  console.error(`[GC patch] No existe ${serverPath}`);
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

function ensureImport() {
  if (source.includes('pathToFileURL')) return;

  if (source.includes("import { fileURLToPath } from 'node:url';")) {
    source = source.replace(
      "import { fileURLToPath } from 'node:url';",
      "import { fileURLToPath, pathToFileURL } from 'node:url';"
    );
    return;
  }

  if (source.includes('import { fileURLToPath } from "node:url";')) {
    source = source.replace(
      'import { fileURLToPath } from "node:url";',
      'import { fileURLToPath, pathToFileURL } from "node:url";'
    );
    return;
  }

  source = source.replace(
    "import path from 'node:path';",
    "import path from 'node:path';\nimport { pathToFileURL } from 'node:url';"
  );
}

function removeOldRuntimeBlocks() {
  source = source.replace(/\/\* GC_ASTRO_RUNTIME_PATCH_V[0-9][\s\S]*?await mountAstroRuntime\(\);\s*/g, '');
}

function findLastFallbackStart(beforeIndex) {
  const grassIndex = source.lastIndexOf('GrassCutters Node activo', beforeIndex);
  if (grassIndex === -1) return -1;

  const candidates = [
    source.lastIndexOf("app.get('*'", grassIndex),
    source.lastIndexOf('app.get("*"', grassIndex),
    source.lastIndexOf("app.get('/*'", grassIndex),
    source.lastIndexOf('app.get("/*"', grassIndex),
    source.lastIndexOf('app.use((req, res)', grassIndex),
    source.lastIndexOf('app.use((request, response)', grassIndex),
    source.lastIndexOf('app.use(function', grassIndex)
  ].filter((index) => index >= 0);

  return candidates.length ? Math.max(...candidates) : -1;
}

function removeOldGrasscuttersFallback() {
  let listenIndex = source.lastIndexOf('app.listen(');
  if (listenIndex === -1) return;

  let fallbackStart = findLastFallbackStart(listenIndex);
  while (fallbackStart >= 0) {
    listenIndex = source.lastIndexOf('app.listen(');
    source = source.slice(0, fallbackStart) + source.slice(listenIndex);
    listenIndex = source.lastIndexOf('app.listen(');
    fallbackStart = findLastFallbackStart(listenIndex);
  }
}

const runtimeBlock = `
/* ${markerV3}
 * Runtime Hostinger + Astro para Express.
 * V3: separa API, estáticos prerenderizados y SSR.
 * Objetivo: / funciona, /admin, /hotlaps, /perfil, /combos y /pilotos también.
 */
function gcFindExistingDirectory(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

function gcFindExistingFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function gcSafeDecodeUrlPath(value) {
  const raw = String(value || '/').split('?')[0].split('#')[0] || '/';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function gcIsApiRequest(requestUrl) {
  const decoded = gcSafeDecodeUrlPath(requestUrl);
  return decoded === '/api' || decoded.startsWith('/api/') || decoded === '/gc-data' || decoded.startsWith('/gc-data/');
}

function gcFindStaticHtmlForRequest(clientDir, requestUrl) {
  if (!clientDir) return null;
  const decoded = gcSafeDecodeUrlPath(requestUrl);
  if (gcIsApiRequest(decoded)) return null;

  const clean = decoded.replace(/^\\/+/, '').replace(/\\/+$/, '');
  if (!clean) return path.join(clientDir, 'index.html');

  return gcFindExistingFile([
    path.join(clientDir, clean, 'index.html'),
    path.join(clientDir, clean + '.html')
  ]);
}

function gcRuntimeSnapshot(clientDir, astroEntry) {
  function dirInfo(label, dirPath) {
    const exists = Boolean(dirPath && fs.existsSync(dirPath));
    return {
      label,
      path: dirPath,
      exists,
      isDirectory: exists ? fs.statSync(dirPath).isDirectory() : false
    };
  }

  function fileInfo(label, filePath) {
    const exists = Boolean(filePath && fs.existsSync(filePath));
    return {
      label,
      path: filePath,
      exists,
      isFile: exists ? fs.statSync(filePath).isFile() : false
    };
  }

  return {
    ok: true,
    mode: 'astro-runtime-v3',
    rootDir,
    distDir,
    clientDir,
    astroEntry,
    candidates: {
      client: [
        dirInfo('dist/client', path.join(distDir, 'client')),
        dirInfo('root/client', path.join(rootDir, 'client')),
        dirInfo('dist', distDir)
      ],
      server: [
        fileInfo('dist/server/entry.mjs', path.join(distDir, 'server', 'entry.mjs')),
        fileInfo('root/server/entry.mjs', path.join(rootDir, 'server', 'entry.mjs'))
      ]
    }
  };
}

async function mountAstroRuntime() {
  const clientDir = gcFindExistingDirectory([
    path.join(distDir, 'client'),
    path.join(rootDir, 'client'),
    distDir
  ]);

  const astroEntry = gcFindExistingFile([
    path.join(distDir, 'server', 'entry.mjs'),
    path.join(rootDir, 'server', 'entry.mjs')
  ]);

  const runtimeState = gcRuntimeSnapshot(clientDir, astroEntry);
  app.locals.gcAstroRuntime = runtimeState;

  app.get('/api/runtime/status', (_req, res) => {
    res.json(app.locals.gcAstroRuntime || runtimeState);
  });

  if (clientDir) {
    const astroAssetsDir = path.join(clientDir, '_astro');
    if (fs.existsSync(astroAssetsDir)) {
      app.use('/_astro', express.static(astroAssetsDir, {
        maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
        immutable: process.env.NODE_ENV === 'production'
      }));
    }

    app.use(express.static(clientDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      index: false,
      extensions: false
    }));

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (gcIsApiRequest(req.originalUrl || req.url)) return next();

      const htmlFile = gcFindStaticHtmlForRequest(clientDir, req.originalUrl || req.url);
      if (htmlFile) {
        res.sendFile(htmlFile);
        return;
      }

      next();
    });

    console.log('[GC] Astro client V3 montado:', clientDir);
  } else {
    console.warn('[GC] Astro client V3 no encontrado.');
  }

  if (astroEntry) {
    try {
      const astroServer = await import(pathToFileURL(astroEntry).href);
      const handler = astroServer.handler || astroServer.default;
      if (typeof handler === 'function') {
        app.use((req, res, next) => {
          if (gcIsApiRequest(req.originalUrl || req.url)) return next();
          Promise.resolve(handler(req, res, next)).catch((error) => {
            console.error('[GC] Error en Astro SSR V3:', error);
            if (!res.headersSent) {
              res.status(500).type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>GrassCutters SSR error</title></head><body style="background:#03140d;color:#f1fff6;font-family:Arial;padding:32px"><h1>Error renderizando Astro</h1><p>Revisa /api/runtime/status y los logs de Hostinger.</p></body></html>');
            }
          });
        });
        console.log('[GC] Astro SSR V3 montado:', astroEntry);
      } else {
        console.warn('[GC] Astro entry V3 encontrado, pero no exporta handler:', astroEntry);
      }
    } catch (error) {
      console.error('[GC] Error importando Astro SSR V3:', error);
    }
  } else {
    console.warn('[GC] Astro SSR V3 no encontrado. Las rutas dinámicas dependerán solo de HTML estático.');
  }

  app.use((req, res, next) => {
    if (gcIsApiRequest(req.originalUrl || req.url)) return next();

    res.status(404).type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GrassCutters · ruta no encontrada</title></head><body style="margin:0;background:#03140d;color:#f1fff6;font-family:Arial,sans-serif;padding:32px;line-height:1.55"><main style="max-width:760px"><h1>Ruta no encontrada</h1><p>No se encontró una página estática ni SSR para <strong>' + escapeHtml(req.originalUrl || req.url) + '</strong>.</p><p><a style="color:#85ff55" href="/api/runtime/status">Ver runtime</a> · <a style="color:#85ff55" href="/">Volver al inicio</a></p></main></body></html>');
  });
}

await mountAstroRuntime();

`;

ensureImport();
removeOldRuntimeBlocks();
removeOldGrasscuttersFallback();

const listenIndex = source.lastIndexOf('app.listen(');
if (listenIndex === -1) {
  console.error('[GC patch] No se ha encontrado app.listen(...) en src/server/index.ts');
  process.exit(1);
}

source = source.slice(0, listenIndex) + runtimeBlock + source.slice(listenIndex);
fs.writeFileSync(serverPath, source, 'utf8');

console.log('[GC patch] Runtime Hostinger/Astro V3 aplicado en src/server/index.ts');
