#!/usr/bin/env node
/*
  GC_NOTICIAS_DRAFT_PUBLIC_LINKS_FIX_v1

  Local patcher. No toca GitHub.
  Ejecutar desde la raíz del proyecto grasscutters-webnode:

    node scripts/gc-noticias-draft-public-links-fix-v1.mjs

  Crea backup automático:
    _gc_backups/noticias-draft-public-links-fix-v1/<timestamp>/
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'noticias-draft-public-links-fix-v1', stamp);

const targets = [
  'src/pages/admin/noticias.astro',
  'src/pages/admin/noticias/imagenes.astro',
];

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function read(pathName) {
  const full = path.join(rootDir, pathName);
  if (!fs.existsSync(full)) throw new Error(`No existe ${pathName}`);
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
    return;
  }
  backup(pathName, before);
  fs.writeFileSync(path.join(rootDir, pathName), after, 'utf8');
  report.changed.push(pathName);
}

function insertAfter(content, needle, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(needle)) {
    report.warnings.push(`No se pudo insertar ${label}`);
    return content;
  }
  return content.replace(needle, `${needle}${insertion}`);
}

function replaceAll(content, search, replacement, label) {
  if (!content.includes(search)) {
    report.warnings.push(`No encontrado: ${label}`);
    return content;
  }
  return content.split(search).join(replacement);
}

function patchNoticiasAdmin(content) {
  let next = content;

  next = insertAfter(
    next,
    "      function publicHref(post) { return post.href || `/noticias/${post.slug}`; }\n",
    "      function isPublicPost(post) { return post?.status === 'published'; }\n      function publicActionHtml(post) { return isPublicPost(post) ? `<a href=\"${esc(publicHref(post))}\" target=\"_blank\" rel=\"noreferrer\">Ver</a>` : `<span class=\"gc-news-row-disabled-v1\">${post.status === 'hidden' ? 'Oculta' : 'Borrador'}</span>`; }\n",
    "helpers de enlace público noticias"
  );

  next = insertAfter(
    next,
    "    .gc-news-row-actions-v1 button:first-child{color:#071006;background:var(--accent,#9cff3f);border-color:transparent}\n",
    "    .gc-news-row-disabled-v1{min-height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0 10px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.025);color:var(--dim);font-size:.72rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}\n",
    "CSS para acción pública desactivada en noticias"
  );

  next = replaceAll(
    next,
    '<a href="${esc(publicHref(post))}" target="_blank" rel="noreferrer">Ver</a>',
    '${publicActionHtml(post)}',
    "enlace Ver listado noticias"
  );

  next = replaceAll(
    next,
    "          els.message.innerHTML = `Noticia guardada. <a href=\"/noticias/${data.post.slug}\" target=\"_blank\" rel=\"noreferrer\">Ver noticia</a>`;",
    "          els.message.innerHTML = data.post.status === 'published'\n            ? `Noticia publicada. <a href=\"/noticias/${data.post.slug}\" target=\"_blank\" rel=\"noreferrer\">Ver noticia</a>`\n            : `Noticia guardada como ${data.post.status === 'hidden' ? 'oculta' : 'borrador'}. Para verla en público, cambia el estado a Publicado.`;",
    "mensaje guardar noticia"
  );

  return next;
}

function patchNoticiasImagenes(content) {
  let next = content;

  next = insertAfter(
    next,
    "      const publicHref = (post) => post.href || `/noticias/${post.slug}`;\n",
    "      const isPublicPost = (post) => post?.status === 'published';\n      const publicImageAction = (post) => isPublicPost(post) ? `<a href=\"${esc(publicHref(post))}\" target=\"_blank\" rel=\"noreferrer\">Ver</a>` : `<span class=\"gc-news-image-disabled-v1\">${post.status === 'hidden' ? 'Oculta' : 'Borrador'}</span>`;\n",
    "helpers de enlace público imágenes noticias"
  );

  next = insertAfter(
    next,
    "    .gc-news-image-actions-v1 .danger{border-color:rgba(255,90,90,.45);background:rgba(255,90,90,.1);color:#ffd7d7}\n",
    "    .gc-news-image-disabled-v1{border-radius:999px;padding:10px 13px;font-weight:900;min-height:38px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.025);color:var(--dim);display:inline-flex;align-items:center;justify-content:center}\n",
    "CSS para acción pública desactivada en imágenes noticias"
  );

  next = replaceAll(
    next,
    '<a href="${esc(publicHref(post))}" target="_blank" rel="noreferrer">Ver</a>',
    '${publicImageAction(post)}',
    "enlace Ver imágenes noticias"
  );

  return next;
}

function main() {
  console.log('');
  console.log('GC Noticias Draft Public Links Fix v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    for (const target of targets) {
      const before = read(target);
      let after = before;

      if (target.endsWith('admin/noticias.astro')) {
        after = patchNoticiasAdmin(after);
      }

      if (target.endsWith('admin/noticias/imagenes.astro')) {
        after = patchNoticiasImagenes(after);
      }

      writeIfChanged(target, before, after);
    }
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
  console.log('');
  console.log('Prueba:');
  console.log('  /admin/noticias');
  console.log('  /admin/noticias/imagenes');
  console.log('');
}

main();
