#!/usr/bin/env node
// GC_PHASE4H3_3_ADRI_POLICE1370_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=process.cwd();
const payload=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routesPath=path.join(root,'src','server','gc-ratings','routes.ts');
const serviceRel=path.join('src','server','gc-ratings','adriPoliceReconciliation.ts');
const pageRel=path.join('src','pages','admin','integridad-ratings','identidades','adri-police1370.astro');
if(!fs.existsSync(path.join(root,'package.json')))throw new Error('Ejecuta desde la raíz de grasscutters-webnode.');
for(const rel of [routesPath,path.join(payload,serviceRel),path.join(payload,pageRel)])if(!fs.existsSync(rel))throw new Error(`Falta ${rel}.`);
let routes=fs.readFileSync(routesPath,'utf8');
const importLine="import { applyAdriPoliceReconciliationV1, preflightAdriPoliceReconciliationV1, rollbackAdriPoliceReconciliationV1 } from './adriPoliceReconciliation';";
if(!routes.includes(importLine)){
  const imports=[...routes.matchAll(/^import[^\r\n]+;?\s*$/gm)];
  if(!imports.length)throw new Error('No se encontraron imports en routes.ts.');
  const last=imports[imports.length-1];
  routes=routes.slice(0,(last.index||0)+last[0].length)+`\n${importLine}`+routes.slice((last.index||0)+last[0].length);
}
const parser=/const identityConsolidationJsonBodyV1 = expressJson\(\{ limit: '32kb' \}\);/;
if(!parser.test(routes))throw new Error('Falta el parser JSON validado de 4H.3.2.3.');
const marker='// GC_PHASE4H3_3_ADRI_POLICE1370_RECONCILIATION_V1';
if(!routes.includes(marker)){
  const anchor="  // GC_PHASE4H3_2_2_SHARED_APPLY_PREFLIGHT_V1";
  if(!routes.includes(anchor))throw new Error('Falta la ruta base 4H.3.2.2.');
  const block=`  ${marker}
  app.post('/api/gc/ratings/identity-consolidation/adri-police1370/preflight', identityConsolidationJsonBodyV1, async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await preflightAdriPoliceReconciliationV1()); }
    catch (error) { res.status(500).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });
  app.post('/api/gc/ratings/identity-consolidation/adri-police1370/apply', identityConsolidationJsonBodyV1, async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await applyAdriPoliceReconciliationV1(req.body || {})); }
    catch (error) { res.status(409).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });
  app.post('/api/gc/ratings/identity-consolidation/adri-police1370/rollback', identityConsolidationJsonBodyV1, async (req, res) => {
    if (!await requireAdmin(req)) return res.status(403).json({ok:false,message:'Admin requerido.'});
    try { res.setHeader('Cache-Control','no-store'); res.json(await rollbackAdriPoliceReconciliationV1(req.body || {})); }
    catch (error) { res.status(409).json({ok:false,message:error instanceof Error ? error.message : String(error)}); }
  });

`;
  routes=routes.replace(anchor,block+anchor);
}
for(const rel of [serviceRel,pageRel]){const source=path.join(payload,rel);const target=path.join(root,rel);fs.mkdirSync(path.dirname(target),{recursive:true});if(path.resolve(source)!==path.resolve(target))fs.copyFileSync(source,target);}
fs.writeFileSync(routesPath,routes,'utf8');
console.log('[GC_PHASE4H3_3] Adri → Police1370 instalado. El perfil 36 queda fuera del plan.');
console.log('El instalador no conecta ni escribe en MySQL.');
