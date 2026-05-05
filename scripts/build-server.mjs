import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const entry = path.join(rootDir, 'src', 'server', 'index.ts');
const outFile = path.join(rootDir, 'dist', 'server-node', 'index.mjs');

if (!fs.existsSync(entry)) {
  console.error('[GC build-server] No existe src/server/index.ts');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  outfile: outFile,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  bundle: false,
  sourcemap: false,
  logLevel: 'info'
});

console.log('[GC build-server] Servidor compilado:', outFile);
