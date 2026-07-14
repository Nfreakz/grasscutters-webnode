import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `dev-local-proxy-${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function backup(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, 'utf8');
}

const changed = [];

// astro.config.mjs: avoid localhost -> ::1 on Windows and keep target configurable.
{
  const relativePath = 'astro.config.mjs';
  let source = read(relativePath);
  const original = source;

  if (!source.includes('GC_DEV_API_TARGET')) {
    const importMatch = source.match(/^(?:\uFEFF)?import[^\n]+\n/);
    if (!importMatch) {
      throw new Error('No se encontró el import inicial en astro.config.mjs');
    }

    const declaration = "\nconst gcDevApiTarget = process.env.GC_DEV_API_TARGET || 'http://127.0.0.1:3000';\n";
    source = source.slice(0, importMatch[0].length) + declaration + source.slice(importMatch[0].length);
  }

  source = source
    .replace(/'\/api'\s*:\s*'http:\/\/localhost:3000'/g, "'/api': gcDevApiTarget")
    .replace(/'\/gc-data'\s*:\s*'http:\/\/localhost:3000'/g, "'/gc-data': gcDevApiTarget")
    .replace(/'\/api'\s*:\s*'http:\/\/127\.0\.0\.1:3000'/g, "'/api': gcDevApiTarget")
    .replace(/'\/gc-data'\s*:\s*'http:\/\/127\.0\.0\.1:3000'/g, "'/gc-data': gcDevApiTarget");

  if (!source.includes("'/api': gcDevApiTarget") || !source.includes("'/gc-data': gcDevApiTarget")) {
    throw new Error('No se pudieron actualizar ambos proxies de Astro.');
  }

  if (source !== original) {
    backup(relativePath);
    write(relativePath, source);
    changed.push(relativePath);
  }
}

// package.json: start API first and only launch Vite after health responds.
{
  const relativePath = 'package.json';
  const source = read(relativePath);
  const pkg = JSON.parse(source);
  pkg.scripts ||= {};
  pkg.scripts.dev = 'concurrently --kill-others-on-fail "npm run dev:server" "npm run dev:web:wait"';
  pkg.scripts['dev:web:wait'] = 'node scripts/wait-for-api-and-start-web.mjs';

  const output = JSON.stringify(pkg, null, 2) + '\n';
  if (output !== source) {
    backup(relativePath);
    write(relativePath, output);
    changed.push(relativePath);
  }
}

console.log('');
console.log('[GC dev fix] Aplicado correctamente.');
console.log(`[GC dev fix] Backup: ${backupDir}`);
console.log(`[GC dev fix] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC dev fix] Siguiente: npm run dev');
