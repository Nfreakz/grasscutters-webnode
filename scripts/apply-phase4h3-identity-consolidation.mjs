#!/usr/bin/env node
// GC_PHASE4H3_IDENTITY_CONSOLIDATION_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const executor = path.join(root, 'scripts', 'phase4h3-identity-consolidation.mjs');
const requiredMarker = 'GC_PHASE4H3_IDENTITY_CONSOLIDATION_V1';

if (!fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Ejecuta este instalador desde la raíz de grasscutters-webnode.');
}
if (!fs.existsSync(executor)) {
  throw new Error('Falta scripts/phase4h3-identity-consolidation.mjs. Copia primero changed-files sobre la raíz.');
}
const source = fs.readFileSync(executor, 'utf8');
if (!source.includes(requiredMarker) || !source.includes('gc_identity_consolidation_batches')) {
  throw new Error('El ejecutor 4H.3 está incompleto o no corresponde a esta versión.');
}

const syntax = spawnSync(process.execPath, ['--check', executor], { cwd: root, encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`El ejecutor no supera node --check:\n${syntax.stderr || syntax.stdout}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dependency of ['dotenv', 'mysql2']) {
  if (!pkg.dependencies?.[dependency] && !pkg.devDependencies?.[dependency]) {
    throw new Error(`Falta la dependencia requerida: ${dependency}`);
  }
}

console.log('[GC Phase 4H.3] Ejecutor instalado y validado.');
console.log('Este instalador no ha conectado con MySQL ni ha modificado datos.');
console.log('Siguiente paso seguro:');
console.log('  node .\\scripts\\phase4h3-identity-consolidation.mjs preflight');
