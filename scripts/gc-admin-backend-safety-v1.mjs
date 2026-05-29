#!/usr/bin/env node
/*
  GC_ADMIN_BACKEND_SAFETY_PERSISTENCE_v1

  Local patcher. No toca GitHub.
  Ejecutar desde la raíz del proyecto grasscutters-webnode:

    node scripts/gc-admin-backend-safety-v1.mjs

  Hace backup automático antes de escribir:
    _gc_backups/admin-backend-safety-v1/<timestamp>/
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-backend-safety-v1', stamp);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function rel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function file(pathName) {
  return path.join(rootDir, pathName);
}

function readText(pathName) {
  const full = file(pathName);
  if (!fs.existsSync(full)) {
    throw new Error(`No existe ${pathName}`);
  }
  return fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
}

function backup(pathName, content) {
  const dest = path.join(backupRoot, pathName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(pathName, before, after) {
  if (before === after) {
    report.unchanged.push(pathName);
    return false;
  }

  backup(pathName, before);
  fs.writeFileSync(file(pathName), after, 'utf8');
  report.changed.push(pathName);
  return true;
}

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    report.warnings.push(`No encontrado: ${label}`);
    return content;
  }

  return content.replace(search, replacement);
}

function ensureContains(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;

  if (!content.includes(anchor)) {
    report.warnings.push(`No se pudo insertar ${label}. No se encontró anchor.`);
    return content;
  }

  return content.replace(anchor, `${anchor}${insertion}`);
}

function patchArchiveUnifiedRoutes() {
  const pathName = 'src/server/motorsport-archive-unified-admin-routes.ts';
  let content = readText(pathName);
  const before = content;

  content = ensureContains(
    content,
    'type ArchiveItem = Record<string, any>;\n',
    '\ntype RequireAdmin = (req: Request, res: Response) => Promise<any | null>;\n',
    'RequireAdmin type',
  );

  content = replaceOnce(
    content,
    'export function registerMotorsportArchiveUnifiedAdminRoutes(app: Express, { rootDir }: { rootDir: string }) {',
    'export function registerMotorsportArchiveUnifiedAdminRoutes(app: Express, { rootDir, requireAdmin }: { rootDir: string; requireAdmin: RequireAdmin }) {',
    'registerMotorsportArchiveUnifiedAdminRoutes signature',
  );

  content = ensureContains(
    content,
    'export function registerMotorsportArchiveUnifiedAdminRoutes(app: Express, { rootDir, requireAdmin }: { rootDir: string; requireAdmin: RequireAdmin }) {\n',
    `  app.use('/api/admin/archive/unified', async (req: Request, res: Response, next: () => void) => {
    if (!(await requireAdmin(req, res))) return;
    next();
  });

`,
    'admin middleware for /api/admin/archive/unified',
  );

  content = replaceOnce(
    content,
    "      for (const key of ['alt', 'source', 'sourceUrl', 'author', 'license']) {",
    `      if (req.body?.url !== undefined || req.body?.localUrl !== undefined || req.body?.originalUrl !== undefined) {
        const nextUrl = String(req.body?.url ?? target.url ?? '').trim();
        const nextLocalUrl = String(req.body?.localUrl ?? req.body?.url ?? target.localUrl ?? target.url ?? '').trim();
        const nextOriginalUrl = String(req.body?.originalUrl ?? target.originalUrl ?? nextUrl ?? nextLocalUrl ?? '').trim();

        target.url = nextUrl || nextLocalUrl;
        target.localUrl = nextLocalUrl || nextUrl;
        target.originalUrl = nextOriginalUrl || target.url || target.localUrl;
        target.local = Boolean(String(target.localUrl || target.url || '').startsWith('/uploads/archive/'));
      }

      for (const key of ['alt', 'source', 'sourceUrl', 'author', 'license']) {`,
    'archive media PATCH editable URL block',
  );

  writeIfChanged(pathName, before, content);
}

function patchServerIndexRegistration() {
  const pathName = 'src/server/index.ts';
  let content = readText(pathName);
  const before = content;

  const variants = [
    [
      'registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir });',
      'registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir, requireAdmin });',
    ],
    [
      'registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir })',
      'registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir, requireAdmin })',
    ],
  ];

  let replaced = false;
  for (const [search, replacement] of variants) {
    if (content.includes(search)) {
      content = content.replace(search, replacement);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    report.warnings.push('No se encontró llamada a registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir }). Revisa src/server/index.ts manualmente.');
  }

  writeIfChanged(pathName, before, content);
}

function patchNewsRoutesPersistence() {
  const pathName = 'src/server/news-routes.ts';
  let content = readText(pathName);
  const before = content;

  content = ensureContains(
    content,
    '  imageAlt: string;\n',
    `  imageSource: string;
  imageAuthor: string;
  imageLicense: string;
  imageSourceUrl: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
`,
    'NewsPost extended fields',
  );

  content = ensureContains(
    content,
    "    imageAlt: text(input.imageAlt ?? input.alt ?? existing?.imageAlt ?? title).slice(0, 180),\n",
    `    imageSource: text(input.imageSource ?? input.source ?? input.fuente ?? existing?.imageSource).slice(0, 180),
    imageAuthor: text(input.imageAuthor ?? input.author ?? input.autor ?? existing?.imageAuthor).slice(0, 180),
    imageLicense: text(input.imageLicense ?? input.license ?? input.licencia ?? existing?.imageLicense).slice(0, 180),
    imageSourceUrl: text(input.imageSourceUrl ?? input.sourceUrl ?? input.fuenteUrl ?? input.fuente_url ?? existing?.imageSourceUrl).slice(0, 800),
    tags: text(input.tags ?? input.etiquetas ?? existing?.tags).slice(0, 500),
    seoTitle: text(input.seoTitle ?? input.metaTitle ?? existing?.seoTitle).slice(0, 180),
    seoDescription: text(input.seoDescription ?? input.metaDescription ?? existing?.seoDescription).slice(0, 320),
`,
    'normalizePost extended fields',
  );

  content = ensureContains(
    content,
    '    imageAlt: post.imageAlt,\n',
    `    imageSource: post.imageSource,
    imageAuthor: post.imageAuthor,
    imageLicense: post.imageLicense,
    imageSourceUrl: post.imageSourceUrl,
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
`,
    'publicPost extended fields',
  );

  writeIfChanged(pathName, before, content);
}

function patchArchiveAdminPagePagination() {
  const pathName = 'src/pages/admin/archivo.astro';
  let content = readText(pathName);
  const before = content;

  const line = '<script src="/gc-admin-pagination.js" is:inline></script>';
  if (content.includes(line)) {
    content = content.replace(line, '<!-- gc-admin-pagination.js retirado: /admin/archivo ya tiene paginación propia -->');
  } else {
    report.unchanged.push(`${pathName} pagination script already absent`);
  }

  writeIfChanged(pathName, before, content);
}

function main() {
  console.log('');
  console.log('GC Admin Backend Safety + Persistence v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    patchArchiveUnifiedRoutes();
    patchServerIndexRegistration();
    patchNewsRoutesPersistence();
    patchArchiveAdminPagePagination();
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
  console.log('Siguiente paso recomendado:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('');
  console.log('Pruebas manuales:');
  console.log('  /admin/archivo');
  console.log('  /admin/archivo/imagen-url');
  console.log('  /admin/noticias');
  console.log('  /admin/noticias/imagenes');
  console.log('');
}

main();
