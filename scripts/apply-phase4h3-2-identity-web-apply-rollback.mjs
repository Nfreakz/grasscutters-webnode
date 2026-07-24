#!/usr/bin/env node
// GC_PHASE4H3_2_1_IDENTITY_TOKEN_STABILITY_FIX_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const payloadRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesPath = path.join(root, 'src', 'server', 'gc-ratings', 'routes.ts');
const preflightPage = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'preflight.astro');
const serviceTarget = path.join(root, 'src', 'server', 'gc-ratings', 'identityConsolidationApply.ts');
const preflightService = path.join(root, 'src', 'server', 'gc-ratings', 'identityConsolidationPreflight.ts');
const pageTarget = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'aplicar.astro');
const marker = 'GC_PHASE4H3_2_2_SHARED_APPLY_PREFLIGHT_V1';

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
for (const file of [routesPath, preflightPage, preflightService, serviceTarget, pageTarget]) if (!fs.existsSync(file)) throw new Error(`Falta ${path.relative(root,file)}.`);
if (!fs.readFileSync(serviceTarget,'utf8').includes(marker)) throw new Error(`Payload inválido: ${path.relative(root,serviceTarget)}.`);

let preflightServiceSource = fs.readFileSync(preflightService, 'utf8');
const volatileUserTimestamp = `      name: text(row.pilot_stracker_name) || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null`;
const stableUserIdentity = `      name: text(row.pilot_stracker_name) || null`;
if (preflightServiceSource.includes(volatileUserTimestamp)) {
  preflightServiceSource = preflightServiceSource.replace(volatileUserTimestamp, stableUserIdentity);
  fs.writeFileSync(preflightService, preflightServiceSource, 'utf8');
}
if (fs.readFileSync(preflightService, 'utf8').includes(volatileUserTimestamp)) throw new Error('No se pudo estabilizar el token del preflight.');

let routes = fs.readFileSync(routesPath,'utf8');
const importAnchor = "import { runMysqlIdentityConsolidationPreflightV1 } from './identityConsolidationPreflight';";
const oldImportLine = "import { applyIdentityConsolidationV1, listIdentityConsolidationBatchesV1, rollbackIdentityConsolidationV1 } from './identityConsolidationApply';";
const importLine = "import { applyIdentityConsolidationV1, listIdentityConsolidationBatchesV1, preflightIdentityConsolidationApplyV1, rollbackIdentityConsolidationV1 } from './identityConsolidationApply';";
if (routes.includes(oldImportLine)) {
  routes = routes.replace(oldImportLine, importLine);
} else if (!routes.includes(importLine)) {
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
const applyPreflightMarker = '// GC_PHASE4H3_2_2_SHARED_APPLY_PREFLIGHT_V1';
if (!routes.includes(applyPreflightMarker)) {
  const anchor = `  app.post('/api/gc/ratings/identity-consolidation/apply', async (req, res) => {`;
  if (!routes.includes(anchor)) throw new Error('No se encontró la ruta de aplicación 4H.3.2.');
  const block = `  ${applyPreflightMarker}
  app.post('/api/gc/ratings/identity-consolidation/apply-preflight', async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await preflightIdentityConsolidationApplyV1()); }
    catch (error) { res.status(500).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
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
console.log('[GC_PHASE4H3_2_2] Preflight y aplicación comparten el mismo cálculo de token.');
console.log('El instalador no ha conectado con MySQL ni ha modificado datos.');
console.log('Siguiente paso: npm run quality && npm run build');
