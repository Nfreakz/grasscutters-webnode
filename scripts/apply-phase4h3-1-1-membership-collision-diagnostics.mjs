#!/usr/bin/env node
// GC_PHASE4H3_1_1_IDENTITY_MEMBERSHIP_COLLISION_DIAGNOSTICS_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const servicePath = path.join(root, 'src', 'server', 'gc-ratings', 'identityConsolidationPreflight.ts');
const pagePath = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'preflight.astro');
const marker = 'GC_PHASE4H3_1_1_IDENTITY_MEMBERSHIP_COLLISION_DIAGNOSTICS_V1';

if (!fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Ejecuta este instalador desde la raíz de grasscutters-webnode.');
}
for (const file of [servicePath, pagePath]) {
  if (!fs.existsSync(file)) throw new Error(`Falta ${path.relative(root, file)}. Copia primero changed-files sobre la raíz.`);
  if (!fs.readFileSync(file, 'utf8').includes(marker)) {
    throw new Error(`${path.relative(root, file)} no corresponde a 4H.3.1.1.`);
  }
}

console.log('[GC Phase 4H.3.1.1] Diagnóstico de colisiones instalado y validado.');
console.log('Este instalador no ha conectado con MySQL ni ha modificado datos.');
console.log('Siguiente paso: npm run quality && npm run build');
