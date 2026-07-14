import { spawnSync } from 'node:child_process';

const full = process.argv.includes('--full');
const tasks = [
  ['Auditoría estática', process.execPath, ['scripts/project-audit.mjs']],
  ['Astro check', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check']]
];

if (full) {
  tasks.push(
    ['Build producción', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']],
    ['Smoke Playwright', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', 'tests/smoke.spec.ts']]
  );
}

for (const [label, command, args] of tasks) {
  console.log(`\n[GC quality] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`[GC quality] FALLÓ: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log(`\n[GC quality] OK${full ? ' · full' : ''}`);
