import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, '_gc_reports', 'dependencies');
fs.mkdirSync(reportsDir, { recursive: true });

function runJson(name, args, outputName) {
  const command = `npm ${args.join(' ')}`;
  const result = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const outputPath = path.join(reportsDir, outputName);

  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { raw: stdout };
    }
  }

  const payload = {
    command,
    generatedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    error: result.error ? {
      name: result.error.name,
      message: result.error.message,
      code: result.error.code ?? null
    } : null,
    stderr,
    data: parsed
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[GC Phase 5B.1.1] ${name}: ${path.relative(root, outputPath)} (exit=${String(result.status)})`);
  return payload;
}

const audit = runJson('npm audit', ['audit', '--json'], 'npm-audit.json');
const outdated = runJson('npm outdated', ['outdated', '--json'], 'npm-outdated.json');
const tree = runJson('npm ls', ['ls', '--all', '--json'], 'npm-ls-all.json');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

const summary = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  nodeEngine: packageJson.engines?.node ?? null,
  npmEngine: packageJson.engines?.npm ?? null,
  runtimeDependencies: Object.keys(packageJson.dependencies || {}).length,
  devDependencies: Object.keys(packageJson.devDependencies || {}).length,
  lockfileVersion: lockJson.lockfileVersion ?? null,
  lockPackages: Object.keys(lockJson.packages || {}).length,
  auditExitCode: audit.exitCode,
  outdatedExitCode: outdated.exitCode,
  npmLsExitCode: tree.exitCode,
  auditHasData: Boolean(audit.data),
  outdatedHasData: Boolean(outdated.data),
  npmLsHasData: Boolean(tree.data),
  reports: [
    '_gc_reports/dependencies/npm-audit.json',
    '_gc_reports/dependencies/npm-outdated.json',
    '_gc_reports/dependencies/npm-ls-all.json'
  ]
};

fs.writeFileSync(
  path.join(reportsDir, 'dependency-inventory-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

const failedToRun = [audit, outdated, tree].some((item) => item.exitCode === null && item.error);
if (failedToRun) {
  console.error('[GC Phase 5B.1.1] Una o más órdenes no pudieron iniciarse.');
  process.exit(1);
}

console.log('');
console.log('[GC Phase 5B.1.1] Inventario completado. No se ha modificado package.json, package-lock.json ni node_modules.');
