import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4H1_IDENTITY_AUDIT_V1';
const prerequisite = 'GC_PHASE4D_SOURCE_ISOLATION_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4h1-identity-audit-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4h1-identity-audit-payload');
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

const routesPath = 'src/server/gc-ratings/routes.ts';
const subnavPath = 'src/components/AdminSubnav.astro';
const identityModulePath = 'src/server/gc-ratings/identityAudit.ts';
const identityPagePath = 'src/pages/admin/integridad-ratings/identidades.astro';

if (!read('src/server/gc-ratings/types.ts').includes(prerequisite)) {
  throw new Error('Phase 4D no está aplicada. Se requiere el aislamiento de fuentes antes del auditor de identidades.');
}

const alreadyApplied = [routesPath, subnavPath, identityModulePath, identityPagePath].every((relativePath) =>
  fs.existsSync(target(relativePath)) && fs.readFileSync(target(relativePath), 'utf8').includes(marker)
);
if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4H.1] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

const identityModule = payload('identityAudit.ts.txt');
const identityPage = payload('identidades.astro.txt');

let routes = read(routesPath);
routes = insertAfter(
  routes,
  `import { getStrackerMirrorDiagnostics, getStrackerMirrorSqlitePath, getStrackerRaceCandidatesFromMirror, syncStrackerToSqlMirror } from './strackerSqlMirror';`,
  `\nimport { readMysqlIdentityAuditV1 } from './identityAudit';`,
  'el import de strackerSqlMirror'
);
const routeBlock = `

  // ${marker} — endpoint estrictamente de lectura.
  app.get('/api/gc/ratings/identity-audit', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1:identity-audit', message: 'Admin requerido.' });
      res.json(await readMysqlIdentityAuditV1());
    } catch (error) {
      res.status(200).json({
        ok: false,
        source: 'gc-ratings-v1:identity-audit',
        readOnly: true,
        destructiveChangesApplied: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });`;
routes = insertAfter(
  routes,
  `  app.get('/api/gc/ratings/diagnostics', async (_req, res) => {
    try {
      res.json(await service.getDiagnostics());
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });`,
  routeBlock,
  'la ruta de diagnósticos de ratings'
);
save(routesPath, routes);

let subnav = read(subnavPath);
subnav = insertAfter(
  subnav,
  `      { href: '/admin/integridad-ratings', label: 'Integridad ratings', desc: 'Duplicados y rebuild' },`,
  `\n      /* ${marker} */\n      { href: '/admin/integridad-ratings/identidades', label: 'Identidades', desc: 'Auditor de pilotos' },`,
  'el enlace de integridad de ratings'
);
save(subnavPath, subnav);
save(identityModulePath, identityModule);
save(identityPagePath, identityPage);

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4H.1] Auditor no destructivo de identidades instalado.');
console.log(`[GC Phase 4H.1] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4H.1] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('Endpoint: /api/gc/ratings/identity-audit');
console.log('Página: /admin/integridad-ratings/identidades');
console.log('No se modifica MySQL y no existe ninguna operación de fusión.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
