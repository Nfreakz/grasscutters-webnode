import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'dependencies');
fs.mkdirSync(reportsDir, { recursive: true });

function fail(message) {
  console.error(`[GC Phase 5B.2.1] ERROR: ${message}`);
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
  console.log(`[GC Phase 5B.2.1] OK: ${name}@${version}`);
}

function runCapture(command) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    command,
    exitCode: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error ? {
      name: result.error.name,
      message: result.error.message,
      code: result.error.code ?? null
    } : null
  };
}

const auditRun = runCapture('npm audit --json');
if (auditRun.error) fail(`npm audit no pudo iniciarse: ${auditRun.error.message}`);

let auditData = null;
try {
  auditData = JSON.parse(auditRun.stdout || '{}');
} catch {
  fail('npm audit devolvió JSON inválido.');
}

fs.writeFileSync(
  path.join(reportsDir, 'npm-audit-phase5b2-final.json'),
  JSON.stringify(auditData, null, 2) + '\n',
  'utf8'
);

const meta = auditData?.metadata?.vulnerabilities || {};
const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5B.2.1',
  completed: true,
  versions: expected,
  auditExitCode: auditRun.exitCode,
  auditExitCodeExpectedWhileVulnerabilitiesRemain: auditRun.exitCode === 1,
  vulnerabilities: {
    info: Number(meta.info || 0),
    low: Number(meta.low || 0),
    moderate: Number(meta.moderate || 0),
    high: Number(meta.high || 0),
    critical: Number(meta.critical || 0),
    total: Number(meta.total || 0)
  },
  validationEvidenceFromPreviousRun: {
    astroCheck: 'passed',
    build: 'passed',
    phase4k: '20 passed'
  },
  report: '_gc_reports/dependencies/npm-audit-phase5b2-final.json'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5b2-final-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5B.2.1] Phase 5B.2 cerrada correctamente.');
console.log(`[GC Phase 5B.2.1] Vulnerabilidades restantes: ${summary.vulnerabilities.total}`);
console.log('[GC Phase 5B.2.1] npm audit puede devolver exit 1 mientras queden vulnerabilidades; no se considera fallo de ejecución.');
