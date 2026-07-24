#!/usr/bin/env node
// GC_PHASE4H3_2_IDENTITY_WEB_APPLY_ROLLBACK_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const payloadRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesPath = path.join(root, 'src', 'server', 'gc-ratings', 'routes.ts');
const preflightPage = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'preflight.astro');
const serviceTarget = path.join(root, 'src', 'server', 'gc-ratings', 'identityConsolidationApply.ts');
const pageTarget = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'aplicar.astro');
const marker = 'GC_PHASE4H3_2_IDENTITY_WEB_APPLY_ROLLBACK_V1';

if (!fs.existsSync(path.join(root, 'package.json'))) throw new Error('Ejecuta el instalador desde la raíz de grasscutters-webnode.');
for (const relative of [
  ['src','server','gc-ratings','identityConsolidationApply.ts'],
  ['src','pages','admin','integridad-ratings','identidades','aplicar.astro']
]) {
  const source = path.join(payloadRoot, ...relative);
  if (!fs.existsSync(source)) throw new Error(`Falta payload: ${source}`);
  const target = path.join(root, ...relative);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  if (path.resolve(source) !== path.resolve(target)) fs.copyFileSync(source, target);
}
for (const file of [routesPath, preflightPage, serviceTarget, pageTarget]) if (!fs.existsSync(file)) throw new Error(`Falta ${path.relative(root,file)}.`);
for (const file of [serviceTarget,pageTarget]) if (!fs.readFileSync(file,'utf8').includes(marker)) throw new Error(`Payload inválido: ${path.relative(root,file)}.`);

let routes = fs.readFileSync(routesPath,'utf8');
const importAnchor = "import { runMysqlIdentityConsolidationPreflightV1 } from './identityConsolidationPreflight';";
const importLine = "import { applyIdentityConsolidationV1, listIdentityConsolidationBatchesV1, rollbackIdentityConsolidationV1 } from './identityConsolidationApply';";
if (!routes.includes(importLine)) {
  if (!routes.includes(importAnchor)) throw new Error('No está instalado el preflight 4H.3.1.');
  routes = routes.replace(importAnchor, `${importAnchor}\n${importLine}`);
}
const routeMarker = '// GC_PHASE4H3_2_IDENTITY_WEB_APPLY_ROLLBACK_V1';
if (!routes.includes(routeMarker)) {
  const anchor = '\n\n  // GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1';
  if (!routes.includes(anchor)) throw new Error('No se encontró el ancla de rutas.');
  const block = `

  ${routeMarker}
  app.get('/api/gc/ratings/identity-consolidation/batches', async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await listIdentityConsolidationBatchesV1()); }
    catch (error) { res.status(500).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });
  app.post('/api/gc/ratings/identity-consolidation/apply', async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await applyIdentityConsolidationV1(req.body || {})); }
    catch (error) { res.status(409).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });
  app.post('/api/gc/ratings/identity-consolidation/rollback', async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await rollbackIdentityConsolidationV1(req.body || {})); }
    catch (error) { res.status(409).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });
`;
  routes = routes.replace(anchor, `${block}${anchor}`);
}
fs.writeFileSync(routesPath,routes,'utf8');

let preflight = fs.readFileSync(preflightPage,'utf8');
const linkMarker = 'data-gc-phase4h3-2-apply';
if (!preflight.includes(linkMarker)) {
  const anchor = '<a class="gc-btn" href="/admin/integridad-ratings/identidades/preview">Volver al preview</a>';
  if (!preflight.includes(anchor)) throw new Error('No se encontró el enlace del preflight.');
  preflight = preflight.replace(anchor, `<div class="gc-actions" ${linkMarker}><a class="gc-btn gc-btn--primary" href="/admin/integridad-ratings/identidades/aplicar">Aplicar 4H.3</a>${anchor}</div>`);
  fs.writeFileSync(preflightPage,preflight,'utf8');
}
console.log('[GC_PHASE4H3_2] Instalado y validado.');
console.log('El instalador no ha conectado con MySQL ni ha modificado datos.');
console.log('Siguiente paso: npm run quality && npm run build');
