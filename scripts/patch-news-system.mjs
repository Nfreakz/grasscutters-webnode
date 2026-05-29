import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.warn('[patch-news-system] src/server/index.ts no existe. Se omite.');
  process.exit(0);
}

let source = fs.readFileSync(serverPath, 'utf8');
let changed = false;

const importLine = "import { registerNewsRoutes } from './news-routes';";
if (!source.includes(importLine)) {
  const anchor = "import { registerMotorsportArchiveMediaManagerRoutes } from './motorsport-archive-media-manager-routes';";
  if (source.includes(anchor)) {
    source = source.replace(anchor, `${anchor}\n${importLine}`);
    changed = true;
  } else {
    console.warn('[patch-news-system] No se encontró anchor de imports. No se añade import.');
  }
}

const routeLine = 'registerNewsRoutes(app, { rootDir, requireAdmin });';
if (!source.includes(routeLine)) {
  const anchor = "app.use(express.json({ limit: '25mb' }));";
  if (source.includes(anchor)) {
    source = source.replace(anchor, `${anchor}\n${routeLine}`);
    changed = true;
  } else {
    console.warn('[patch-news-system] No se encontró anchor express.json. No se añade ruta.');
  }
}

if (changed) {
  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('[patch-news-system] Rutas noticias verificadas/aplicadas.');
} else {
  console.log('[patch-news-system] OK, noticias ya estaba aplicado.');
}
