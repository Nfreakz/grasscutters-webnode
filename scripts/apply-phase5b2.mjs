import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageFile = path.join(root, 'package.json');
const lockFile = path.join(root, 'package-lock.json');
const backupRoot = path.join(root, '_gc_backups', `phase5b2-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function fail(message) {
  console.error(`[GC Phase 5B.2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packageFile) || !fs.existsSync(lockFile)) {
  fail('Faltan package.json o package-lock.json.');
}

const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const expected = {
  astro: '6.2.1',
  concurrently: '9.2.1',
  ws: '8.18.3'
};

for (const [name, version] of Object.entries(expected)) {
  if (packageJson.dependencies?.[name] !== version) {
    fail(`${name}: se esperaba ${version}, encontrado ${packageJson.dependencies?.[name] ?? 'ausente'}.`);
  }
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.copyFileSync(packageFile, path.join(backupRoot, 'package.json'));
fs.copyFileSync(lockFile, path.join(backupRoot, 'package-lock.json'));

function run(command) {
  console.log(`[GC Phase 5B.2] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) {
    fail(`Falló: ${command}`);
  }
}

run('npm install --save-exact astro@6.4.8 concurrently@9.2.4 ws@8.21.1');
run('npm run check');
run('npm run build');
run('npm run test:phase4k');
run('npm audit --json > _gc_reports\\dependencies\\npm-audit-phase5b2.json');

console.log('');
console.log('[GC Phase 5B.2] Actualización completada.');
console.log(`[GC Phase 5B.2] Backup: ${path.relative(root, backupRoot)}`);
console.log('[GC Phase 5B.2] Informe: _gc_reports\\dependencies\\npm-audit-phase5b2.json');
