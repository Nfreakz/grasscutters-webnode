#!/usr/bin/env node
// GC_PHASE4H3_1_IDENTITY_WEB_PREFLIGHT_INSTALLER_V1
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routesPath = path.join(root, 'src', 'server', 'gc-ratings', 'routes.ts');
const previewPath = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'preview.astro');
const servicePath = path.join(root, 'src', 'server', 'gc-ratings', 'identityConsolidationPreflight.ts');
const pagePath = path.join(root, 'src', 'pages', 'admin', 'integridad-ratings', 'identidades', 'preflight.astro');
const marker = 'GC_PHASE4H3_1_IDENTITY_WEB_PREFLIGHT_V1';

if (!fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Ejecuta este instalador desde la raíz de grasscutters-webnode.');
}
for (const file of [routesPath, previewPath, servicePath, pagePath]) {
  if (!fs.existsSync(file)) throw new Error(`Falta ${path.relative(root, file)}. Copia primero changed-files sobre la raíz.`);
}
for (const file of [servicePath, pagePath]) {
  if (!fs.readFileSync(file, 'utf8').includes(marker)) {
    throw new Error(`${path.relative(root, file)} no corresponde a 4H.3.1.`);
  }
}

let routes = fs.readFileSync(routesPath, 'utf8');
let preview = fs.readFileSync(previewPath, 'utf8');
let changed = false;

const importLine = "import { runMysqlIdentityConsolidationPreflightV1 } from './identityConsolidationPreflight';";
if (!routes.includes(importLine)) {
  const importAnchor = "import { buildMysqlIdentityPreviewV1, readMysqlIdentityPreviewBootstrapV1 } from './identityPreview';";
  if (!routes.includes(importAnchor)) throw new Error('No se encontró el import de identityPreview en routes.ts.');
  routes = routes.replace(importAnchor, `${importAnchor}\n${importLine}`);
  changed = true;
}

const routeMarker = '// GC_PHASE4H3_1_IDENTITY_WEB_PREFLIGHT_V1 — lectura exclusiva desde administración web.';
if (!routes.includes(routeMarker)) {
  const routeAnchor = '\n\n  // GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1';
  if (!routes.includes(routeAnchor)) throw new Error('No se encontró el ancla de rutas posterior al preview.');
  const routeBlock = `

  ${routeMarker}
  app.get('/api/gc/ratings/identity-consolidation/preflight', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({
        ok: false,
        source: 'gc-ratings-v1:identity-consolidation-preflight',
        message: 'Admin requerido.'
      });
      res.json(await runMysqlIdentityConsolidationPreflightV1());
    } catch (error) {
      res.status(200).json({
        ok: false,
        source: 'gc-ratings-v1:identity-consolidation-preflight',
        readOnly: true,
        writesAvailable: false,
        destructiveChangesApplied: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
`;
  routes = routes.replace(routeAnchor, `${routeBlock}${routeAnchor}`);
  changed = true;
}

const linkMarker = 'data-gc-phase4h3-1-preflight';
if (!preview.includes(linkMarker)) {
  const button = '<button class="gc-btn" id="previewReload" type="button">Recargar MySQL</button>';
  if (!preview.includes(button)) throw new Error('No se encontró el botón Recargar MySQL en preview.astro.');
  preview = preview.replace(
    button,
    `<div class="gc-actions" ${linkMarker}>\n        <a class="gc-btn gc-btn--primary" href="/admin/integridad-ratings/identidades/preflight">Preflight 4H.3</a>\n        ${button}\n      </div>`
  );
  changed = true;
}

if (changed) {
  fs.writeFileSync(routesPath, routes, 'utf8');
  fs.writeFileSync(previewPath, preview, 'utf8');
  console.log('[GC Phase 4H.3.1] Preflight web instalado.');
} else {
  console.log('[GC Phase 4H.3.1] Ya estaba instalado; no se ha modificado nada.');
}
console.log('Este instalador no ha conectado con MySQL ni ha modificado datos.');
console.log('Siguiente paso: npm run quality && npm run build');

