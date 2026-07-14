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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (!fs.existsSync(distDir)) {
  console.error('[GC prepare-dist] No existe dist/. Primero debe ejecutarse astro build.');
  process.exit(1);
}

const rootPackagePath = path.join(rootDir, 'package.json');
if (!fs.existsSync(rootPackagePath)) {
  console.error('[GC prepare-dist] No existe package.json en la raíz.');
  process.exit(1);
}

const rootPackage = readJson(rootPackagePath);
const serverBootstrapCopied = copyIfExists(path.join(rootDir, 'server.cjs'), path.join(distDir, 'server.cjs'));

const packageForDist = {
  name: rootPackage.name || 'grasscutters-node-runtime',
  version: rootPackage.version || '0.0.0',
  type: 'module',
  private: true,
  engines: rootPackage.engines || { node: '>=22 <23' },
  scripts: { start: 'node server.cjs' },
  dependencies: rootPackage.dependencies || {}
};

fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(packageForDist, null, 2) + '\n', 'utf8');

const files = {
  serverBootstrap: fs.existsSync(path.join(distDir, 'server.cjs')),
  compiledServer: fs.existsSync(path.join(distDir, 'server-node', 'index.mjs')),
  astroClient: fs.existsSync(path.join(distDir, 'client')),
  astroServer: fs.existsSync(path.join(distDir, 'server', 'entry.mjs')),
  indexHtml: fs.existsSync(path.join(distDir, 'index.html'))
};

const requiredFailures = [];
if (!serverBootstrapCopied || !files.serverBootstrap) requiredFailures.push('dist/server.cjs');
if (!files.compiledServer) requiredFailures.push('dist/server-node/index.mjs');
if (!files.astroClient && !files.indexHtml) requiredFailures.push('dist/client o dist/index.html');

const report = {
  generatedAt: new Date().toISOString(),
  distDir,
  files,
  runtimeDependencies: Object.keys(packageForDist.dependencies).sort(),
  runtimeDependenciesCount: Object.keys(packageForDist.dependencies).length,
  hostinger: {
    recommendedOutputDirectory: 'dist',
    recommendedEntryFile: 'server.cjs',
    installCommand: 'npm install --omit=dev'
  },
  valid: requiredFailures.length === 0,
  requiredFailures
};

fs.writeFileSync(path.join(distDir, 'gc-runtime-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('[GC prepare-dist] Runtime Hostinger preparado dentro de dist/.');
console.log(JSON.stringify(report, null, 2));

if (requiredFailures.length) {
  console.error('[GC prepare-dist] Faltan artefactos obligatorios:', requiredFailures.join(', '));
  process.exit(1);
}
