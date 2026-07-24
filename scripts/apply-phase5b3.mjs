import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageFile = path.join(root, 'package.json');
const lockFile = path.join(root, 'package-lock.json');
const backupRoot = path.join(root, '_gc_backups', `phase5b3-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const reportsDir = path.join(root, '_gc_reports', 'dependencies');

function fail(message) {
  console.error(`[GC Phase 5B.3] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packageFile) || !fs.existsSync(lockFile)) {
  fail('Faltan package.json o package-lock.json.');
}

const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const expected = {
  astro: '6.4.8',
  concurrently: '9.2.4',
  ws: '8.21.1'
};

for (const [name, version] of Object.entries(expected)) {
  if (pkg.dependencies?.[name] !== version) {
    fail(`${name}: se esperaba ${version}, encontrado ${pkg.dependencies?.[name] ?? 'ausente'}.`);
  }
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });
fs.copyFileSync(packageFile, path.join(backupRoot, 'package.json'));
fs.copyFileSync(lockFile, path.join(backupRoot, 'package-lock.json'));

function run(command, allowAuditExitOne = false) {
  console.log(`[GC Phase 5B.3] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0 && !(allowAuditExitOne && result.status === 1)) {
    fail(`Falló: ${command}`);
  }
}

function captureJson(command, outputName) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.error) fail(`${command}: ${result.error.message}`);

  let data;
  try {
    data = JSON.parse(String(result.stdout || '{}'));
  } catch {
    fail(`${command}: salida JSON inválida.`);
  }

  fs.writeFileSync(
    path.join(reportsDir, outputName),
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  );

  return { exitCode: result.status, data };
}

// Sin --force: npm solo puede aplicar cambios compatibles.
run('npm audit fix');

run('npm run check');
run('npm run build');
run('npm run test:phase4k');

const audit = captureJson('npm audit --json', 'npm-audit-phase5b3.json');
const meta = audit.data?.metadata?.vulnerabilities || {};

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5B.3',
  completed: true,
  strategy: 'npm audit fix without --force',
  directVersionsPreserved: expected,
  auditExitCode: audit.exitCode,
  vulnerabilities: {
    info: Number(meta.info || 0),
    low: Number(meta.low || 0),
    moderate: Number(meta.moderate || 0),
    high: Number(meta.high || 0),
    critical: Number(meta.critical || 0),
    total: Number(meta.total || 0)
  },
  backup: path.relative(root, backupRoot),
  report: '_gc_reports/dependencies/npm-audit-phase5b3.json'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5b3-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5B.3] Correcciones transitivas completadas.');
console.log(`[GC Phase 5B.3] Vulnerabilidades restantes: ${summary.vulnerabilities.total}`);
console.log(`[GC Phase 5B.3] Backup: ${summary.backup}`);
