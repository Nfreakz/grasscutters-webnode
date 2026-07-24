import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageFile = path.join(root, 'package.json');
const lockFile = path.join(root, 'package-lock.json');
const reportsDir = path.join(root, '_gc_reports', 'dependencies');
const backupRoot = path.join(root, '_gc_backups', `phase5b4-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function fail(message) {
  console.error(`[GC Phase 5B.4] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packageFile) || !fs.existsSync(lockFile)) {
  fail('Faltan package.json o package-lock.json.');
}

const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const expected = {
  astro: '6.4.8',
  concurrently: '9.2.4',
  ws: '8.21.1',
  esbuild: '0.27.7',
  sharp: '0.34.5'
};

for (const [name, version] of Object.entries(expected)) {
  if (pkg.dependencies?.[name] !== version) {
    fail(`${name}: se esperaba ${version}, encontrado ${pkg.dependencies?.[name] ?? 'ausente'}.`);
  }
  console.log(`[GC Phase 5B.4] OK inicial: ${name}@${version}`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });
fs.copyFileSync(packageFile, path.join(backupRoot, 'package.json'));
fs.copyFileSync(lockFile, path.join(backupRoot, 'package-lock.json'));

function run(command) {
  console.log(`[GC Phase 5B.4] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) fail(`Falló: ${command}`);
}

function captureAudit() {
  const result = spawnSync('npm audit --json', {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.error) fail(`npm audit no pudo iniciarse: ${result.error.message}`);

  let data;
  try {
    data = JSON.parse(String(result.stdout || '{}'));
  } catch {
    fail('npm audit devolvió JSON inválido.');
  }

  fs.writeFileSync(
    path.join(reportsDir, 'npm-audit-phase5b4.json'),
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  );

  return { exitCode: result.status, data };
}

run('npm install --save-exact esbuild@0.28.1 sharp@0.35.3');
run('npm run check');
run('npm run build');
run('npm run test:phase4k');

const audit = captureAudit();
const meta = audit.data?.metadata?.vulnerabilities || {};

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5B.4',
  completed: true,
  updated: {
    esbuild: '0.28.1',
    sharp: '0.35.3'
  },
  preserved: {
    astro: '6.4.8',
    '@astrojs/node': pkg.dependencies?.['@astrojs/node'] ?? null,
    concurrently: '9.2.4',
    ws: '8.21.1'
  },
  vulnerabilities: {
    info: Number(meta.info || 0),
    low: Number(meta.low || 0),
    moderate: Number(meta.moderate || 0),
    high: Number(meta.high || 0),
    critical: Number(meta.critical || 0),
    total: Number(meta.total || 0)
  },
  auditExitCode: audit.exitCode,
  backup: path.relative(root, backupRoot),
  report: '_gc_reports/dependencies/npm-audit-phase5b4.json'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5b4-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5B.4] Actualización completada.');
console.log(`[GC Phase 5B.4] Vulnerabilidades restantes: ${summary.vulnerabilities.total}`);
console.log(`[GC Phase 5B.4] Backup: ${summary.backup}`);
