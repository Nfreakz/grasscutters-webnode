'use strict';

/*
 * GrassCutters Hostinger bootstrap.
 * Hostinger sometimes starts the configured entry file directly with Node.
 * The real server is TypeScript (src/server/index.ts), so we start it through
 * the local tsx CLI installed in node_modules.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = __dirname;
const target = path.join(rootDir, 'src', 'server', 'index.ts');
const candidates = [
  path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.cjs'),
  path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')
];

function findExistingFile(items) {
  return items.find((item) => item && fs.existsSync(item));
}

const tsxCli = findExistingFile(candidates);

if (!fs.existsSync(target)) {
  console.error('[GC bootstrap] No existe el servidor TypeScript:', target);
  process.exit(1);
}

if (!tsxCli) {
  console.error('[GC bootstrap] No se encontró tsx en node_modules. Ejecuta npm install o revisa el deploy.');
  console.error('[GC bootstrap] Candidatos:', candidates.join(' | '));
  process.exit(1);
}

console.log('[GC bootstrap] Arrancando servidor TypeScript con tsx');
console.log('[GC bootstrap] Target:', target);
console.log('[GC bootstrap] TSX:', tsxCli);

const args = tsxCli.endsWith('.cmd')
  ? [target]
  : [tsxCli, target];

const command = tsxCli.endsWith('.cmd') ? tsxCli : process.execPath;

const child = spawn(command, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    GC_BOOTSTRAP_ENTRY: 'server.cjs'
  },
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[GC bootstrap] Servidor finalizado por señal ${signal}`);
    process.kill(process.pid, signal);
    return;
  }

  console.error(`[GC bootstrap] Servidor finalizado con código ${code ?? 0}`);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[GC bootstrap] Error arrancando servidor:', error);
  process.exit(1);
});
