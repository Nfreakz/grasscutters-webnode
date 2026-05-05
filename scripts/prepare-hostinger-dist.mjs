import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

if (!fs.existsSync(distDir)) {
  console.error('[GC prepare-dist] No existe dist/. Primero debe ejecutarse astro build.');
  process.exit(1);
}

copyIfExists(path.join(rootDir, 'server.cjs'), path.join(distDir, 'server.cjs'));

const packageForDist = {
  type: 'module',
  private: true,
  scripts: { start: 'node server.cjs' }
};
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(packageForDist, null, 2) + '\n', 'utf8');

const report = {
  generatedAt: new Date().toISOString(),
  distDir,
  files: {
    serverBootstrap: fs.existsSync(path.join(distDir, 'server.cjs')),
    compiledServer: fs.existsSync(path.join(distDir, 'server-node', 'index.mjs')),
    astroClient: fs.existsSync(path.join(distDir, 'client')),
    astroServer: fs.existsSync(path.join(distDir, 'server', 'entry.mjs')),
    indexHtml: fs.existsSync(path.join(distDir, 'index.html'))
  },
  hostinger: {
    recommendedOutputDirectory: 'dist',
    recommendedEntryFile: 'server.cjs'
  }
};

fs.writeFileSync(path.join(distDir, 'gc-runtime-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('[GC prepare-dist] Runtime Hostinger preparado dentro de dist/.');
console.log(JSON.stringify(report, null, 2));
