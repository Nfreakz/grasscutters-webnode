import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const target = String(process.env.GC_DEV_API_TARGET || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const healthUrl = new URL(`${target}/api/healthz`);
const timeoutMs = Math.max(5_000, Number(process.env.GC_DEV_API_WAIT_MS || 60_000));
const pollMs = Math.max(150, Number(process.env.GC_DEV_API_POLL_MS || 400));
const startedAt = Date.now();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkHealth() {
  return new Promise((resolve) => {
    const client = healthUrl.protocol === 'https:' ? https : http;
    const req = client.get(healthUrl, { timeout: 2_000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

while (Date.now() - startedAt < timeoutMs) {
  if (await checkHealth()) {
    console.log(`[GC dev] API disponible: ${healthUrl.href}`);
    break;
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write(`\r[GC dev] Esperando API en ${target} · ${elapsed}s`);
  await delay(pollMs);
}

if (Date.now() - startedAt >= timeoutMs) {
  console.error(`\n[GC dev] La API no respondió en ${timeoutMs} ms: ${healthUrl.href}`);
  process.exit(1);
}

process.stdout.write('\n');

const npmCli = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;

const command = npmCli
  ? process.execPath
  : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmCli
  ? [npmCli, 'run', 'dev:web']
  : ['run', 'dev:web'];

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  env: process.env,
  cwd: process.cwd()
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error('[GC dev] No se pudo iniciar Astro:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
