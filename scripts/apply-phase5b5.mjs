import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageFile = path.join(root, 'package.json');
const lockFile = path.join(root, 'package-lock.json');
const reportsDir = path.join(root, '_gc_reports', 'dependencies');
const backupRoot = path.join(root, '_gc_backups', `phase5b5-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function fail(message) {
  console.error(`[GC Phase 5B.5] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packageFile) || !fs.existsSync(lockFile)) {
  fail('Faltan package.json o package-lock.json.');
}

const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const expected = {
  astro: '6.4.8',
  '@astrojs/node': '10.0.6',
  esbuild: '0.28.1',
  sharp: '0.35.3',
  concurrently: '9.2.4',
  ws: '8.21.1'
};

for (const [name, version] of Object.entries(expected)) {
  if (pkg.dependencies?.[name] !== version) {
    fail(`${name}: se esperaba ${version}, encontrado ${pkg.dependencies?.[name] ?? 'ausente'}.`);
  }
  console.log(`[GC Phase 5B.5] OK inicial: ${name}@${version}`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });
fs.copyFileSync(packageFile, path.join(backupRoot, 'package.json'));
fs.copyFileSync(lockFile, path.join(backupRoot, 'package-lock.json'));

function run(command) {
  console.log(`[GC Phase 5B.5] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) {
    console.error(`[GC Phase 5B.5] Backup disponible en: ${path.relative(root, backupRoot)}`);
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

run('npm install --save-exact astro@7.1.3 @astrojs/node@11.0.2');
run('npm run check');
run('npm run build');
run('npm run test:phase4k');

const audit = captureJson('npm audit --json', 'npm-audit-phase5b5.json');
const tree = captureJson('npm ls astro @astrojs/node esbuild sharp --json', 'npm-ls-phase5b5-core.json');
const meta = audit.data?.metadata?.vulnerabilities || {};

const finalPkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5B.5',
  completed: true,
  migrated: {
    astro: finalPkg.dependencies?.astro ?? null,
    '@astrojs/node': finalPkg.dependencies?.['@astrojs/node'] ?? null
  },
  preserved: {
    esbuild: finalPkg.dependencies?.esbuild ?? null,
    sharp: finalPkg.dependencies?.sharp ?? null,
    concurrently: finalPkg.dependencies?.concurrently ?? null,
    ws: finalPkg.dependencies?.ws ?? null
  },
  validation: {
    astroCheck: 'passed',
    build: 'passed',
    phase4k: 'passed'
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
  reports: [
    '_gc_reports/dependencies/npm-audit-phase5b5.json',
    '_gc_reports/dependencies/npm-ls-phase5b5-core.json'
  ]
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5b5-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5B.5] Migración Astro 7 completada.');
console.log(`[GC Phase 5B.5] Vulnerabilidades restantes: ${summary.vulnerabilities.total}`);
console.log(`[GC Phase 5B.5] Backup: ${summary.backup}`);
