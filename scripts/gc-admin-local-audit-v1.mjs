#!/usr/bin/env node
/*
  GC_ADMIN_LOCAL_AUDIT_TOOLS_v1

  Auditoría local de /admin.
  No modifica archivos. No toca GitHub.

  Ejecutar desde la raíz del proyecto:

    node scripts/gc-admin-local-audit-v1.mjs

  Opcional, con servidor en marcha:

    node scripts/gc-admin-local-audit-v1.mjs --live=http://localhost:4321

  Salida:
    _gc_reports/admin-local-audit-v1/<timestamp>/admin-audit-report.md
    _gc_reports/admin-local-audit-v1/<timestamp>/admin-audit-report.json
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const liveArg = args.find((arg) => arg.startsWith('--live='));
const liveBase = liveArg ? liveArg.replace('--live=', '').replace(/\/$/, '') : '';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.join(rootDir, '_gc_reports', 'admin-local-audit-v1', stamp);

const checks = [];

function exists(rel) {
  return fs.existsSync(path.join(rootDir, rel));
}

function read(rel) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
}

function addCheck(group, name, ok, detail = '', severity = 'info') {
  checks.push({
    group,
    name,
    ok: Boolean(ok),
    detail,
    severity,
  });
}

function includes(rel, needle) {
  return read(rel).includes(needle);
}

function countIncludes(rel, needle) {
  const content = read(rel);
  if (!content || !needle) return 0;
  return content.split(needle).length - 1;
}

function codeFence(text) {
  return '```txt\n' + String(text || '').trim() + '\n```';
}

async function liveCheck(pathname, label) {
  if (!liveBase) return;

  try {
    const res = await fetch(`${liveBase}${pathname}`, {
      headers: { accept: 'application/json,text/html,*/*' },
      redirect: 'manual',
    });

    addCheck(
      'Live HTTP',
      `${label} ${pathname}`,
      res.status < 500,
      `HTTP ${res.status}`,
      res.status >= 500 ? 'high' : res.status >= 400 ? 'medium' : 'info'
    );
  } catch (error) {
    addCheck('Live HTTP', `${label} ${pathname}`, false, error?.message || 'Error HTTP', 'medium');
  }
}

function auditFiles() {
  const required = [
    'src/pages/admin.astro',
    'src/components/AdminSubnav.astro',
    'src/pages/admin/usuarios.astro',
    'src/pages/admin/noticias.astro',
    'src/pages/admin/noticias/importar.astro',
    'src/pages/admin/noticias/imagenes.astro',
    'src/pages/admin/archivo.astro',
    'src/pages/admin/archivo/importar.astro',
    'src/pages/admin/archivo/imagen-url.astro',
    'src/server/index.ts',
    'src/server/news-routes.ts',
    'src/server/motorsport-archive-unified-admin-routes.ts',
  ];

  for (const rel of required) {
    addCheck('Archivos', rel, exists(rel), exists(rel) ? 'Existe' : 'No existe', exists(rel) ? 'info' : 'high');
  }
}

function auditAdminNavigation() {
  const rel = 'src/components/AdminSubnav.astro';
  const content = read(rel);

  addCheck('Navegación admin', 'AdminSubnav agrupado', content.includes('gc-admin-subnav-v2'), 'Busca clase gc-admin-subnav-v2', 'medium');
  addCheck('Navegación admin', 'Grupo Base', content.includes("label: 'Base'") || content.includes('label: "Base"'), 'Debe existir grupo Base', 'medium');
  addCheck('Navegación admin', 'Grupo Contenido', content.includes("label: 'Contenido'") || content.includes('label: "Contenido"'), 'Debe existir grupo Contenido', 'medium');
  addCheck('Navegación admin', 'Grupo Herramientas', content.includes("label: 'Herramientas'") || content.includes('label: "Herramientas"'), 'Debe existir grupo Herramientas', 'medium');

  for (const href of ['/admin/noticias', '/admin/noticias/importar', '/admin/noticias/imagenes', '/admin/archivo', '/admin/archivo/importar', '/admin/archivo/imagen-url']) {
    addCheck('Navegación admin', `Subnav enlace ${href}`, content.includes(href), href, 'medium');
  }
}

function auditAdminHub() {
  const rel = 'src/pages/admin.astro';
  const content = read(rel);

  addCheck('Home admin', 'Hub v1 aplicado', content.includes('gc-admin-hub-v1'), 'Busca clase del hub', 'medium');
  addCheck('Home admin', 'Enlace Noticias', content.includes('/admin/noticias'), '/admin/noticias', 'medium');
  addCheck('Home admin', 'Enlace Archivo', content.includes('/admin/archivo'), '/admin/archivo', 'medium');
  addCheck('Home admin', 'ACSM sync conservado', content.includes('/api/admin/acsm/sync-current-combo'), 'Sync combo', 'medium');
  addCheck('Home admin', 'Status admin conservado', content.includes('/api/admin/status'), '/api/admin/status', 'medium');
}

function auditArchiveBackend() {
  const rel = 'src/server/motorsport-archive-unified-admin-routes.ts';
  const content = read(rel);

  addCheck('Archivo backend', 'Router recibe requireAdmin', content.includes('requireAdmin') && content.includes('RequireAdmin'), 'Busca RequireAdmin', 'high');
  addCheck('Archivo backend', 'Middleware protege unified', content.includes("app.use('/api/admin/archive/unified'") && content.includes('await requireAdmin(req, res)'), 'Protección admin', 'high');
  addCheck('Archivo backend', 'PATCH media acepta url', content.includes("req.body?.url") && content.includes('target.url'), 'Edición real de URL', 'high');
  addCheck('Archivo backend', 'CSV aliases presentes', content.includes('CSV_TOP_LEVEL_ALIASES'), 'Alias importador Archivo', 'medium');
  addCheck('Archivo backend', 'seoTitle importable', content.includes('seoTitle') || content.includes('seotitle'), 'Campos SEO Archivo', 'medium');
  addCheck('Archivo backend', 'datos_sim_racing importable', content.includes('datos_sim_racing'), 'Campo datos_sim_racing', 'medium');

  const index = read('src/server/index.ts');
  addCheck('Archivo backend', 'index pasa requireAdmin al router Archivo', index.includes('registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir, requireAdmin })'), 'Registro router', 'high');
}

function auditNewsBackend() {
  const rel = 'src/server/news-routes.ts';
  const content = read(rel);

  for (const field of ['imageSource', 'imageAuthor', 'imageLicense', 'imageSourceUrl', 'tags', 'seoTitle', 'seoDescription']) {
    addCheck('Noticias backend', `Persiste ${field}`, content.includes(field), field, 'high');
  }

  addCheck('Noticias backend', 'Admin protegido con requireAdmin', content.includes('requireAdmin') && content.includes("app.get('/api/admin/news'"), 'Rutas admin news', 'high');
  addCheck('Noticias backend', 'Upload news existe', content.includes('/api/admin/news/image-upload'), 'Endpoint image-upload', 'medium');
}

function auditUsersBackend() {
  const content = read('src/server/index.ts');

  for (const endpoint of [
    "app.get('/api/admin/users'",
    "app.post('/api/admin/users/:id/role'",
    "app.post('/api/admin/users/:id/revoke-sessions'",
    "app.post('/api/admin/users/:id/password'",
    "app.get('/api/admin/unlinked-pilots'",
  ]) {
    addCheck('Usuarios backend', endpoint, content.includes(endpoint), endpoint, 'high');
  }

  addCheck('Usuarios backend', 'Bloque users endpoints v1', content.includes('GC_ADMIN_USERS_BACKEND_ENDPOINTS_V1 START'), 'Anchor patch usuarios backend', 'medium');
  addCheck('Usuarios backend', 'Protege último admin', content.includes('isLastAdmin'), 'No quitar último admin', 'high');
}

function auditUsersFrontend() {
  const rel = 'src/pages/admin/usuarios.astro';
  const content = read(rel);

  addCheck('Usuarios frontend', 'No usa tryUserAction', !content.includes('tryUserAction'), 'No debe haber llamadas alternativas', content.includes('tryUserAction') ? 'high' : 'info');
  addCheck('Usuarios frontend', 'Usa endpoint role directo', content.includes('/api/admin/users/${encodeURIComponent(id)}/role'), 'Role endpoint', 'high');
  addCheck('Usuarios frontend', 'Usa endpoint revoke directo', content.includes('/api/admin/users/${encodeURIComponent(id)}/revoke-sessions'), 'Revoke endpoint', 'high');
  addCheck('Usuarios frontend', 'Usa endpoint password directo', content.includes('/api/admin/users/${encodeURIComponent(id)}/password'), 'Password endpoint', 'high');
  addCheck('Usuarios frontend', 'Sin gc-admin-pagination.js', !content.includes('gc-admin-pagination.js'), 'Evitar doble paginación', content.includes('gc-admin-pagination.js') ? 'medium' : 'info');
}

function auditNewsFrontend() {
  const news = read('src/pages/admin/noticias.astro');
  const images = read('src/pages/admin/noticias/imagenes.astro');

  addCheck('Noticias frontend', 'Importador existe', exists('src/pages/admin/noticias/importar.astro'), 'Página importar noticias', 'medium');
  addCheck('Noticias frontend', 'Biblioteca imágenes existe', exists('src/pages/admin/noticias/imagenes.astro'), 'Página imágenes noticias', 'medium');
  addCheck('Noticias frontend', 'Categorías correctas', ['Update','Sim racing','Motorsport','Herramientas','GrassCutters'].every((cat) => news.includes(cat)), 'Categorías newsroom', 'medium');
  addCheck('Noticias frontend', 'No enlace público para drafts en gestor', news.includes('publicActionHtml') || news.includes('isPublicPost'), 'Draft public links fix', 'medium');
  addCheck('Noticias frontend', 'No enlace público para drafts en imágenes', images.includes('publicImageAction') || images.includes('isPublicPost'), 'Draft public links fix imágenes', 'medium');
}

function auditPagination() {
  const pagesWithOwnPagination = [
    'src/pages/admin/archivo.astro',
    'src/pages/admin/noticias.astro',
    'src/pages/admin/noticias/imagenes.astro',
    'src/pages/admin/archivo/imagen-url.astro',
    'src/pages/admin/usuarios.astro',
  ];

  for (const rel of pagesWithOwnPagination) {
    const content = read(rel);
    addCheck(
      'Paginación',
      `${rel} sin gc-admin-pagination.js`,
      !content.includes('gc-admin-pagination.js'),
      'Evitar doble paginación',
      content.includes('gc-admin-pagination.js') ? 'medium' : 'info'
    );
  }
}

function auditEndpointsPage() {
  const rel = 'src/pages/admin/endpoints.astro';
  if (!exists(rel)) {
    addCheck('Endpoints admin', rel, false, 'No existe página endpoints', 'low');
    return;
  }

  const content = read(rel);
  addCheck('Endpoints admin', 'Existe página endpoints', true, rel, 'info');
  addCheck('Endpoints admin', 'No usa lista demasiado antigua', content.includes('/api/admin/status') || content.includes('/api/profile'), 'Revisar manualmente si sale warning', 'low');
}

async function auditLive() {
  await liveCheck('/admin', 'Admin hub');
  await liveCheck('/admin/usuarios', 'Usuarios');
  await liveCheck('/admin/noticias', 'Noticias');
  await liveCheck('/admin/noticias/importar', 'Importar noticias');
  await liveCheck('/admin/noticias/imagenes', 'Imágenes noticias');
  await liveCheck('/admin/archivo', 'Archivo');
  await liveCheck('/admin/archivo/importar', 'Importar archivo');
  await liveCheck('/admin/archivo/imagen-url', 'Imágenes archivo');
  await liveCheck('/api/admin/status', 'API status');
}

function summary() {
  const failed = checks.filter((c) => !c.ok);
  const high = failed.filter((c) => c.severity === 'high');
  const medium = failed.filter((c) => c.severity === 'medium');
  const low = failed.filter((c) => !['high', 'medium'].includes(c.severity));

  return {
    total: checks.length,
    ok: checks.length - failed.length,
    failed: failed.length,
    high: high.length,
    medium: medium.length,
    low: low.length,
  };
}

function renderMarkdown() {
  const s = summary();
  const groups = [...new Set(checks.map((c) => c.group))];

  let md = `# GC Admin Local Audit v1\n\n`;
  md += `Fecha: ${new Date().toISOString()}\n\n`;
  md += `Root: ${rootDir}\n\n`;
  if (liveBase) md += `Live base: ${liveBase}\n\n`;

  md += `## Resumen\n\n`;
  md += `| Total | OK | Fallos | Alta | Media | Baja |\n`;
  md += `|---:|---:|---:|---:|---:|---:|\n`;
  md += `| ${s.total} | ${s.ok} | ${s.failed} | ${s.high} | ${s.medium} | ${s.low} |\n\n`;

  if (s.high > 0) {
    md += `## Prioridad alta\n\n`;
    for (const c of checks.filter((x) => !x.ok && x.severity === 'high')) {
      md += `- **${c.group} · ${c.name}**: ${c.detail}\n`;
    }
    md += `\n`;
  }

  if (s.medium > 0) {
    md += `## Prioridad media\n\n`;
    for (const c of checks.filter((x) => !x.ok && x.severity === 'medium')) {
      md += `- **${c.group} · ${c.name}**: ${c.detail}\n`;
    }
    md += `\n`;
  }

  md += `## Detalle por grupo\n\n`;

  for (const group of groups) {
    md += `### ${group}\n\n`;
    md += `| Estado | Severidad | Check | Detalle |\n`;
    md += `|---|---|---|---|\n`;

    for (const c of checks.filter((item) => item.group === group)) {
      md += `| ${c.ok ? 'OK' : 'FAIL'} | ${c.severity} | ${c.name.replaceAll('|','/')} | ${String(c.detail || '').replaceAll('|','/')} |\n`;
    }

    md += `\n`;
  }

  md += `## Siguiente acción recomendada\n\n`;

  if (s.high > 0) {
    md += `Resolver primero los checks de prioridad alta antes de seguir añadiendo UI.\n`;
  } else if (s.medium > 0) {
    md += `Resolver los checks medios o confirmar que son avisos aceptables.\n`;
  } else {
    md += `La base del admin está coherente. Siguiente bloque sugerido: revisar /admin/endpoints y /admin/sistema para que también sigan el nuevo patrón visual y de llamadas limpias.\n`;
  }

  md += `\n`;
  return md;
}

async function main() {
  console.log('');
  console.log('GC Admin Local Audit v1');
  console.log('Root:', rootDir);
  console.log('');

  auditFiles();
  auditAdminNavigation();
  auditAdminHub();
  auditArchiveBackend();
  auditNewsBackend();
  auditUsersBackend();
  auditUsersFrontend();
  auditNewsFrontend();
  auditPagination();
  auditEndpointsPage();
  await auditLive();

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'admin-audit-report.json'), JSON.stringify({ summary: summary(), checks }, null, 2), 'utf8');
  fs.writeFileSync(path.join(reportDir, 'admin-audit-report.md'), renderMarkdown(), 'utf8');

  const s = summary();
  console.log(`Checks: ${s.ok}/${s.total} OK · fallos ${s.failed} · alta ${s.high} · media ${s.medium}`);
  console.log('');
  console.log('Informe:');
  console.log(path.join(reportDir, 'admin-audit-report.md'));
  console.log('');

  if (s.high > 0) {
    process.exitCode = 2;
  } else if (s.medium > 0) {
    process.exitCode = 1;
  }
}

main();
