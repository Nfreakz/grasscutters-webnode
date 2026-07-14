import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

if (!fs.existsSync(packagePath) || !fs.existsSync(lockPath)) {
  throw new Error('Faltan package.json o package-lock.json.');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const rootLock = lock?.packages?.[''] || {};
const rows = [];

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, spec] of Object.entries(pkg[section] || {})) {
    const installed = String(lock?.packages?.[`node_modules/${name}`]?.version || '');
    rows.push({
      section,
      name,
      spec,
      installed: installed || null,
      exact: /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(String(spec)),
      rootLockSpec: rootLock?.[section]?.[name] || null,
      aligned: Boolean(installed && String(spec) === installed && rootLock?.[section]?.[name] === installed)
    });
  }
}

function resolvable(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

const optionalRuntime = [
  {
    name: 'better-sqlite3',
    installed: resolvable('better-sqlite3'),
    requiredWhen: 'Solo si se activa src/db/appDb.ts',
    policy: 'optional-dynamic'
  },
  {
    name: 'discord.js',
    installed: resolvable('discord.js'),
    requiredWhen: 'Solo si DISCORD_ENABLED=true',
    policy: 'optional-dynamic'
  }
];

const summary = {
  generatedAt: new Date().toISOString(),
  directDependencies: rows.length,
  exactSpecs: rows.filter((row) => row.exact).length,
  latestSpecs: rows.filter((row) => row.spec === 'latest').length,
  unaligned: rows.filter((row) => !row.aligned).length,
  missingInstalledNodes: rows.filter((row) => !row.installed).length,
  optionalRuntime
};

const report = { summary, dependencies: rows };
const reportDir = path.join(root, '_gc_reports');
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'dependency-baseline.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('');
console.log('[GC dependency baseline]');
console.log(`Directas: ${summary.directDependencies}`);
console.log(`Exactas: ${summary.exactSpecs}`);
console.log(`"latest": ${summary.latestSpecs}`);
console.log(`Desalineadas con lock: ${summary.unaligned}`);
console.log(`Sin nodo instalado: ${summary.missingInstalledNodes}`);
console.log(`Reporte: ${reportPath}`);

for (const item of optionalRuntime) {
  console.log(`Opcional ${item.name}: ${item.installed ? 'instalado' : 'no instalado'} · ${item.requiredWhen}`);
}

if (summary.latestSpecs || summary.unaligned || summary.missingInstalledNodes) {
  process.exitCode = 1;
} else {
  console.log('[GC dependency baseline] OK');
}
