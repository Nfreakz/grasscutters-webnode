import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4H2_IDENTITY_PREVIEW_V1';
const prerequisite = 'GC_PHASE4H1_IDENTITY_AUDIT_V1';
const hardeningMarker = 'GC_PHASE4H1_1_IDENTITY_AUDIT_SOURCE_SAFE_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4h2-identity-preview-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4h2-identity-preview-payload');
const changed = [];

const target = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
};
const payload = (name) => {
  const filePath = path.join(payloadDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Falta payload ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
};
const backup = (relativePath) => {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};
const save = (relativePath, content) => {
  const filePath = target(relativePath);
  const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (original === content) return;
  backup(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  changed.push(relativePath);
};
const insertAfter = (content, anchor, block, label) => {
  if (content.includes(block)) return content;
  const index = content.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  const position = index + anchor.length;
  return `${content.slice(0, position)}${block}${content.slice(position)}`;
};
const insertBefore = (content, anchor, block, label) => {
  if (content.includes(block)) return content;
  const index = content.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  return `${content.slice(0, index)}${block}${content.slice(index)}`;
};

const routesPath = 'src/server/gc-ratings/routes.ts';
const subnavPath = 'src/components/AdminSubnav.astro';
const auditPath = 'src/server/gc-ratings/identityAudit.ts';
const previewModulePath = 'src/server/gc-ratings/identityPreview.ts';
const previewPagePath = 'src/pages/admin/integridad-ratings/identidades/preview.astro';

if (!read(routesPath).includes(prerequisite) || !fs.existsSync(target(auditPath))) {
  throw new Error('Phase 4H.1 no está aplicada. Instala primero el auditor de identidades.');
}

const alreadyApplied = [routesPath, subnavPath, auditPath, previewModulePath, previewPagePath].every((relativePath) =>
  fs.existsSync(target(relativePath)) && fs.readFileSync(target(relativePath), 'utf8').includes(relativePath === auditPath ? hardeningMarker : marker)
);
if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4H.2] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

const hardenedAudit = payload('identityAudit.ts.txt');
const previewModule = payload('identityPreview.ts.txt');
const previewPage = payload('preview.astro.txt');

let routes = read(routesPath);
routes = insertAfter(
  routes,
  `import { readMysqlIdentityAuditV1 } from './identityAudit';`,
  `\nimport { buildMysqlIdentityPreviewV1, readMysqlIdentityPreviewBootstrapV1 } from './identityPreview';`,
  'el import del auditor de identidades'
);
const routeBlock = `

  // ${marker} — decisiones temporales y simulación; nunca escribe en MySQL.
  app.get('/api/gc/ratings/identity-preview', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1:identity-preview', message: 'Admin requerido.' });
      res.json(await readMysqlIdentityPreviewBootstrapV1());
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1:identity-preview', readOnly: true, writesAvailable: false, destructiveChangesApplied: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/identity-preview', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1:identity-preview', message: 'Admin requerido.' });
      res.json(await buildMysqlIdentityPreviewV1(req.body || {}));
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1:identity-preview', readOnly: true, writesAvailable: false, destructiveChangesApplied: false, message: error instanceof Error ? error.message : String(error) });
    }
  });
`;
routes = insertBefore(routes, `\n\n  // GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1`, routeBlock, 'el bloque posterior al auditor de identidades');
save(routesPath, routes);

let subnav = read(subnavPath);
subnav = insertAfter(
  subnav,
  `      { href: '/admin/integridad-ratings/identidades', label: 'Identidades', desc: 'Auditor de pilotos' },`,
  `\n      /* ${marker} */\n      { href: '/admin/integridad-ratings/identidades/preview', label: 'Preview identidades', desc: 'Revisión humana' },`,
  'el enlace del auditor de identidades'
);
save(subnavPath, subnav);
save(auditPath, hardenedAudit);
save(previewModulePath, previewModule);
save(previewPagePath, previewPage);

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4H.2] Preview no destructivo de identidades instalado.');
console.log(`[GC Phase 4H.2] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4H.2] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('GET/POST: /api/gc/ratings/identity-preview');
console.log('Página: /admin/integridad-ratings/identidades/preview');
console.log('No existe endpoint de aplicación y todas las consultas de 4H.2 son SELECT.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
