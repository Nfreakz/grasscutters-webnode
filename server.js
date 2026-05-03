import { spawn } from 'node:child_process';

// Hostinger espera un archivo de entrada JavaScript, no TypeScript.
// Este lanzador arranca el servidor real escrito en TS usando tsx.
const child = spawn(process.execPath, ['--import', 'tsx', './src/server/index.ts'], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
