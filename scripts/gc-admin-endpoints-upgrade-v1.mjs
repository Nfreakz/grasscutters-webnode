#!/usr/bin/env node
/*
  GC_ADMIN_ENDPOINTS_UPGRADE_v1

  Local patcher. No toca GitHub.
  Amplía /admin/endpoints para cubrir las nuevas rutas admin y añade una capa visual
  extra sin reescribir todo el laboratorio.

  Ejecutar desde la raíz:

    node scripts/gc-admin-endpoints-upgrade-v1.mjs
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-endpoints-upgrade-v1', stamp);
const targetPath = 'src/pages/admin/endpoints.astro';
const fullTarget = path.join(rootDir, targetPath);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: []
};

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}`);
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function backup(pathName, content) {
  const dest = path.join(backupRoot, pathName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(pathName, before, after) {
  if (before === after) {
    report.unchanged.push(pathName);
    return;
  }

  backup(pathName, before);
  fs.writeFileSync(path.join(rootDir, pathName), after, 'utf8');
  report.changed.push(pathName);
}

function insertAfter(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(anchor)) {
    report.warnings.push(`No se encontró anchor para ${label}`);
    return content;
  }
  return content.replace(anchor, `${anchor}${insertion}`);
}

function insertBefore(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(anchor)) {
    report.warnings.push(`No se encontró anchor para ${label}`);
    return content;
  }
  return content.replace(anchor, `${insertion}${anchor}`);
}

function patch(content) {
  let next = content;

  next = insertAfter(
    next,
    "              <option value=\"admin\">Admin</option>\n",
    "              <option value=\"news\">Noticias</option>\n              <option value=\"admin-content\">Admin contenido</option>\n",
    'opciones de grupo nuevas'
  );

  next = insertAfter(
    next,
    "        { id:'admin-status', group:'admin', critical:true, title:'Admin status', url:'/api/admin/status', expect:'admin' },\n",
    "\n        { id:'admin-users', group:'admin', critical:true, title:'Admin users', url:'/api/admin/users', expect:'adminUsers' },\n        { id:'admin-unlinked-pilots', group:'admin', critical:false, title:'Admin unlinked pilots', url:'/api/admin/unlinked-pilots', expect:'adminUnlinkedPilots' },\n        { id:'admin-news', group:'news', critical:true, title:'Admin news list', url:'/api/admin/news', expect:'adminNews' },\n        { id:'admin-news-demo-safe', group:'news', critical:false, title:'Admin news API reachable', url:'/api/admin/news', expect:'adminNews' },\n        { id:'admin-archive-unified-items', group:'admin-content', critical:true, title:'Admin archive unified items', url:'/api/admin/archive/unified/items', expect:'adminArchiveItems' },\n",
    'endpoints admin nuevos'
  );

  next = insertBefore(
    next,
    "        if (endpoint.expect === 'pilotProfile') {\n",
    "        if (endpoint.expect === 'adminUsers') {\n          if (!Array.isArray(data?.users)) issues.push('Sin array users');\n          if (!data?.summary) warns.push('Sin summary de usuarios');\n          if (data?.source && !String(data.source).includes('admin-users')) warns.push(`source inesperado: ${data.source}`);\n        }\n\n        if (endpoint.expect === 'adminUnlinkedPilots') {\n          if (!Array.isArray(data?.pilots)) issues.push('Sin array pilots');\n        }\n\n        if (endpoint.expect === 'adminNews') {\n          if (!Array.isArray(data?.posts)) issues.push('Sin array posts');\n        }\n\n        if (endpoint.expect === 'adminArchiveItems') {\n          if (!Array.isArray(data?.items)) issues.push('Sin array items');\n        }\n\n",
    'validadores admin nuevos'
  );

  next = insertBefore(
    next,
    "    @media(max-width:760px){\n",
    "    .gc-endpoint-lab{max-width:1480px;margin-inline:auto;display:grid;gap:clamp(18px,2.2vw,28px)}\n    .gc-endpoint-lab .gc-section{border-radius:24px;background:radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 6%, transparent), transparent 14rem),linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.014));border:1px solid rgba(255,255,255,.08);box-shadow:0 18px 70px rgba(0,0,0,.14)}\n    .gc-endpoint-lab .gc-section-head{align-items:end}\n    .gc-endpoint-card{border-radius:18px;background:radial-gradient(circle at 100% 0%,color-mix(in srgb,var(--accent,#9dff00) 6%,transparent),transparent 10rem),rgba(0,0,0,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}\n    .gc-endpoint-card__head h3{text-transform:uppercase;letter-spacing:-.035em;font-size:1.08rem}\n    .gc-endpoint-result{border-radius:14px;background:rgba(0,0,0,.22)}\n    .gc-endpoint-lab .gc-endpoint-controls label span{color:var(--dim);font-size:.7rem;font-weight:950;letter-spacing:.1em;text-transform:uppercase}\n",
    'CSS endpoint lab upgrade'
  );

  return next;
}

function main() {
  console.log('');
  console.log('GC Admin Endpoints Upgrade v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);
    const after = patch(before);
    writeIfChanged(targetPath, before, after);
  } catch (error) {
    report.errors.push(error?.message || String(error));
  }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log('');
    console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }

  if (report.errors.length) {
    console.log('');
    console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }

  if (report.changed.length) {
    console.log('');
    console.log('Backups creados en:');
    console.log(backupRoot);
  }

  console.log('');
  console.log('Siguiente paso:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('  /admin/endpoints');
  console.log('');
}

main();
