import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'dependencies');
fs.mkdirSync(reportsDir, { recursive: true });

function fail(message) {
  console.error(`[GC Phase 5B.3.1] ERROR: ${message}`);
  process.exit(1);
}

const packageFile = path.join(root, 'package.json');
if (!fs.existsSync(packageFile)) fail('No existe package.json.');

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
  console.log(`[GC Phase 5B.3.1] OK: ${name}@${version}`);
}

function run(command) {
  console.log(`[GC Phase 5B.3.1] Ejecutando: ${command}`);
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
    path.join(reportsDir, 'npm-audit-phase5b3-final.json'),
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  );

  return { exitCode: result.status, data };
}

run('npm run check');
run('npm run build');
run('npm run test:phase4k');

const audit = captureAudit();
const meta = audit.data?.metadata?.vulnerabilities || {};

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5B.3.1',
  completed: true,
  versions: expected,
  auditExitCode: audit.exitCode,
  auditExitCodeExpectedWhileVulnerabilitiesRemain: audit.exitCode === 1,
  vulnerabilities: {
    info: Number(meta.info || 0),
    low: Number(meta.low || 0),
    moderate: Number(meta.moderate || 0),
    high: Number(meta.high || 0),
    critical: Number(meta.critical || 0),
    total: Number(meta.total || 0)
  },
  validation: {
    astroCheck: 'passed',
    build: 'passed',
    phase4k: 'passed'
  },
  report: '_gc_reports/dependencies/npm-audit-phase5b3-final.json'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5b3-final-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5B.3.1] Phase 5B.3 cerrada correctamente.');
console.log(`[GC Phase 5B.3.1] Vulnerabilidades restantes: ${summary.vulnerabilities.total}`);
console.log('[GC Phase 5B.3.1] No se han ejecutado cambios adicionales de dependencias.');
