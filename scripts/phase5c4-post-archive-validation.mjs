import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const configuredRoot = process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode';
const root = path.resolve(configuredRoot);
const reportsDir = path.join(root, '_gc_reports', 'cleanup');
const archiveRoot = path.join(root, '_gc_archive', 'phase-scripts');
const manifestFile = path.join(archiveRoot, 'phase5c3-manifest.json');

function fail(message) {
  console.error(`[GC Phase 5C.4] ERROR: ${message}`);
  process.exit(1);
}

function run(command) {
  console.log(`[GC Phase 5C.4] Ejecutando: ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) fail(`Falló: ${command}`);
}

if (!fs.existsSync(path.join(root, 'package.json'))) {
  fail(`No existe package.json en ${root}`);
}
if (!fs.existsSync(manifestFile)) {
  fail('No existe el manifiesto de Phase 5C.3.');
}

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const archivedItems = Array.isArray(manifest.moved) ? manifest.moved : [];

if (archivedItems.length !== 50) {
  fail(`El manifiesto no contiene 50 scripts archivados; contiene ${archivedItems.length}.`);
}

const missingArchived = [];
const stillInSource = [];

for (const item of archivedItems) {
  const archived = path.join(root, item.archivedPath);
  const source = path.join(root, item.originalPath);

  if (!fs.existsSync(archived)) missingArchived.push(item.archivedPath);
  if (fs.existsSync(source)) stillInSource.push(item.originalPath);
}

if (missingArchived.length > 0) {
  fail(`Faltan ${missingArchived.length} scripts en el archivo.`);
}
if (stillInSource.length > 0) {
  fail(`${stillInSource.length} scripts siguen presentes en scripts/.`);
}

run('npm run check');
run('npm run build');
run('npm run test:phase4k');

fs.mkdirSync(reportsDir, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  phase: '5C.4',
  completed: true,
  archiveValidation: {
    expected: 50,
    archivedPresent: 50,
    stillInSource: 0,
    missingArchived: 0
  },
  validation: {
    astroCheck: 'passed',
    build: 'passed',
    phase4k: 'passed'
  },
  sourceCodeModified: false,
  packageFilesModified: false,
  nextStep: 'Remove only obsolete Phase 5C launcher/fix scripts after a final reference audit.'
};

fs.writeFileSync(
  path.join(reportsDir, 'phase5c4-post-archive-validation.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('[GC Phase 5C.4] Validación post-archivo completada.');
console.log('[GC Phase 5C.4] 50/50 scripts archivados.');
console.log('[GC Phase 5C.4] check, build y Phase 4K superados.');
