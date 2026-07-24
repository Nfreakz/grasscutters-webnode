import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const marker = 'GC_ADMIN_TEAM_MANAGEMENT_V1';
const payloadRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const backups = path.join(root, '_gc_backups', `${marker}_${new Date().toISOString().replace(/[:.]/g, '-')}`);

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const backup = path.join(backups, file);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }
  fs.writeFileSync(target, content);
}
function payload(file) { return fs.readFileSync(path.join(payloadRoot, file), 'utf8'); }
function insertOnce(source, anchor, addition, label) {
  if (source.includes(marker) || source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`No se encontró el ancla de ${label}. No se modificó ese archivo.`);
  return source.replace(anchor, `${addition}${anchor}`);
}

const serverFile = 'src/server/index.ts';
let server = read(serverFile);
if (!server.includes(`./admin-team-management-routes.js`)) {
  const importAnchor = `import express from 'express';`;
  if (!server.includes(importAnchor)) throw new Error('No se encontró el import de Express en src/server/index.ts.');
  server = server.replace(importAnchor, `${importAnchor}\nimport { registerAdminTeamManagementRoutes } from './admin-team-management-routes.js'; // ${marker}`);
}
if (!server.includes(`registerAdminTeamManagementRoutes(app`)) {
  const routeAnchor = `app.get('/api/gc/teams', async (req, res) => {`;
  const registration = `// ${marker}\nregisterAdminTeamManagementRoutes(app, { requireAdmin, useMysqlStorage, useSqliteStorage, ensureMysqlSchema, mysqlQuery, mysqlExecute, withAppSqliteDb, sqliteQuery });\n\n`;
  if (!server.includes(routeAnchor)) throw new Error('No se encontró el bloque de rutas de equipos.');
  server = server.replace(routeAnchor, `${registration}${routeAnchor}`);
}
write(serverFile, server);

write('src/server/admin-team-management-routes.ts', payload('src/server/admin-team-management-routes.ts'));
write('src/pages/admin/equipos.astro', payload('src/pages/admin/equipos.astro'));

const navFile = 'src/components/AdminSubnav.astro';
let nav = read(navFile);
if (!nav.includes(`href: '/admin/equipos'`)) {
  const anchor = `{ href: '/admin/usuarios', label: 'Usuarios', desc: 'Cuentas y permisos' },`;
  nav = insertOnce(nav, anchor, `/* ${marker} */\n      { href: '/admin/equipos', label: 'Equipos', desc: 'Escuderías y pilotos' },\n      `, 'AdminSubnav');
  write(navFile, nav);
}

const hubFile = 'src/pages/admin.astro';
let hub = read(hubFile);
if (!hub.includes(`href: '/admin/equipos'`)) {
  const anchor = `{ href: '/admin/usuarios', title: 'Usuarios', desc: 'Cuentas, roles, sesiones y pilotos vinculados.', tag: 'Core' },`;
  hub = insertOnce(hub, anchor, `/* ${marker} */\n      { href: '/admin/equipos', title: 'Equipos', desc: 'Acceso global a escuderías y pilotos.', tag: 'Core' },\n      `, 'hub admin');
  write(hubFile, hub);
}

console.log(`[${marker}] Instalado y validado.`);
console.log('Siguiente paso: npm run quality && npm run build');
