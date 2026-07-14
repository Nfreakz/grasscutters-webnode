import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

if (!fs.existsSync(packagePath) || !fs.existsSync(lockPath)) {
  throw new Error('Ejecuta este script desde la raíz del repositorio: faltan package.json o package-lock.json.');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const rootLock = lock?.packages?.[''];

if (!rootLock || typeof rootLock !== 'object') {
  throw new Error('package-lock.json no tiene formato npm lockfile v2/v3 compatible.');
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2a-dependencies-${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(packagePath, path.join(backupDir, 'package.json'));
fs.copyFileSync(lockPath, path.join(backupDir, 'package-lock.json'));

const pinned = [];
const unresolved = [];

function installedVersion(name) {
  const node = lock?.packages?.[`node_modules/${name}`];
  const version = String(node?.version || '').trim();
  return version || null;
}

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (!pkg[section] || typeof pkg[section] !== 'object') continue;
  rootLock[section] ||= {};

  for (const name of Object.keys(pkg[section])) {
    const version = installedVersion(name);
    if (!version) {
      unresolved.push({ section, name, current: pkg[section][name] });
      continue;
    }

    const previous = pkg[section][name];
    pkg[section][name] = version;
    rootLock[section][name] = version;

    if (lock.dependencies?.[name] && typeof lock.dependencies[name] === 'object') {
      lock.dependencies[name].version = version;
    }

    pinned.push({ section, name, previous, version });
  }
}

pkg.scripts ||= {};
pkg.scripts['deps:baseline'] = 'node scripts/dependency-baseline.mjs';

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

console.log('');
console.log('[GC Phase 2A] Baseline de dependencias aplicado.');
console.log(`[GC Phase 2A] Backup: ${backupDir}`);
console.log(`[GC Phase 2A] Dependencias fijadas: ${pinned.length}`);

for (const item of pinned) {
  if (item.previous !== item.version) {
    console.log(`  ${item.name}: ${item.previous} -> ${item.version}`);
  }
}

if (unresolved.length) {
  console.warn(`[GC Phase 2A] Aviso: ${unresolved.length} dependencias no tenían nodo instalado en package-lock.`);
  for (const item of unresolved) {
    console.warn(`  ${item.section}.${item.name}: ${item.current}`);
  }
}

console.log('[GC Phase 2A] No se ha ejecutado npm install ni se ha descargado ningún paquete.');
console.log('[GC Phase 2A] Siguiente: npm run deps:baseline && npm run quality');
