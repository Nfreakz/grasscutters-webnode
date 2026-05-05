import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC patch root] No existe src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const oldLine = "const rootDir = path.resolve(__dirname, '../..');";
const newLine = "const rootDir = process.env.GC_RUNTIME_ROOT ? path.resolve(process.env.GC_RUNTIME_ROOT) : path.resolve(__dirname, '../..');";

if (source.includes(newLine)) {
  console.log('[GC patch root] rootDir runtime ya estaba preparado.');
  process.exit(0);
}

if (!source.includes(oldLine)) {
  console.warn('[GC patch root] No se encontró la línea rootDir original. No se modifica nada.');
  process.exit(0);
}

source = source.replace(oldLine, newLine);
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC patch root] rootDir preparado para Hostinger/dist.');
