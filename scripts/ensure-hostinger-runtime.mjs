import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server', 'index.ts');
const marker = 'GC_ASTRO_RUNTIME_PATCH_V1';

if (!fs.existsSync(serverPath)) {
  console.error(`[GC patch] No existe ${serverPath}`);
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (source.includes(marker)) {
  console.log('[GC patch] Runtime Hostinger/Astro ya aplicado.');
  process.exit(0);
}

source = source.replace(
  "import { fileURLToPath } from 'node:url';",
  "import { fileURLToPath, pathToFileURL } from 'node:url';"
);

if (!source.includes('pathToFileURL')) {
  source = source.replace(
    "import path from 'node:path';",
    "import path from 'node:path';\nimport { pathToFileURL } from 'node:url';"
  );
}

const listenIndex = source.lastIndexOf('app.listen(');
if (listenIndex === -1) {
  console.error('[GC patch] No se ha encontrado app.listen(...) en src/server/index.ts');
  process.exit(1);
}

const grassIndex = source.lastIndexOf('GrassCutters Node activo', listenIndex);
const fallbackCandidates = [
  grassIndex > -1 ? source.lastIndexOf("app.get('*'", grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf('app.get("*"', grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf("app.get('/*'", grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf('app.get("/*"', grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf('app.use((req, res)', grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf('app.use((request, response)', grassIndex) : -1,
  grassIndex > -1 ? source.lastIndexOf('app.use(function', grassIndex) : -1
].filter((index) => index >= 0);

const fallbackStart = fallbackCandidates.length ? Math.max(...fallbackCandidates) : listenIndex;

const runtimeBlock = `
/* ${marker}
 * Hostinger ejecuta el servidor Node, pero Astro puede dejar el build en varias formas:
 * - dist/client + dist/server/entry.mjs
 * - client + server/entry.mjs cuando Hostinger despliega el contenido de dist como raíz
 * - dist clásico con index.html para páginas estáticas
 * Este bloque monta primero assets, después SSR y por último un fallback limpio.
 */
function findExistingDirectory(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || null;
}

function findExistingFile(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

async function mountAstroRuntime() {
  const clientDir = findExistingDirectory([
    path.join(distDir, 'client'),
    path.join(rootDir, 'client'),
    distDir,
    rootDir
  ]);

  if (clientDir) {
    app.use(express.static(clientDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      index: false
    }));
    console.log('[GC] Astro client montado:', clientDir);
  }

  const astroEntry = findExistingFile([
    path.join(distDir, 'server', 'entry.mjs'),
    path.join(rootDir, 'server', 'entry.mjs')
  ]);

  if (astroEntry) {
    try {
      const astroServer = await import(pathToFileURL(astroEntry).href);
      const handler = astroServer.handler || astroServer.default;
      if (typeof handler === 'function') {
        app.use(handler);
        console.log('[GC] Astro SSR montado:', astroEntry);
        return;
      }
      console.warn('[GC] Astro entry encontrado, pero no exporta handler:', astroEntry);
    } catch (error) {
      console.error('[GC] Error montando Astro SSR:', error);
    }
  }

  const staticIndex = findExistingFile([
    clientDir ? path.join(clientDir, 'index.html') : '',
    path.join(distDir, 'index.html'),
    path.join(rootDir, 'index.html')
  ].filter(Boolean));

  app.use((req, res) => {
    if (staticIndex) {
      res.sendFile(staticIndex);
      return;
    }

    res.status(200).type('html').send(\`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GrassCutters Node activo</title>
    <style>
      body{margin:0;background:#03140d;color:#f1fff6;font-family:Arial,sans-serif;padding:32px;line-height:1.55}
      a{color:#85ff55}.muted{color:#9bb6a4}.box{max-width:760px}
    </style>
  </head>
  <body>
    <main class="box">
      <h1>GrassCutters Node activo</h1>
      <p>El servidor ha arrancado, pero no se ha encontrado el build público de Astro.</p>
      <p class="muted">Ruta pedida: <strong>\${escapeHtml(req.originalUrl || req.url)}</strong></p>
      <p class="muted">Buscando en: dist/client, client, dist o raíz.</p>
      <p><a href="/api/status">Ver /api/status</a></p>
    </main>
  </body>
</html>\`);
  });
}

await mountAstroRuntime();

`;

source = `${source.slice(0, fallbackStart)}${runtimeBlock}${source.slice(listenIndex)}`;

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC patch] Runtime Hostinger/Astro aplicado en src/server/index.ts');
