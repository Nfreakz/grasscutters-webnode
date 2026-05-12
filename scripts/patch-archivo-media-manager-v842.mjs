#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFile = path.join(root, 'src', 'server', 'index.ts');
const editorFile = path.join(root, 'src', 'pages', 'admin', 'archivo', 'editar', '[id].astro');
const subnavFile = path.join(root, 'src', 'components', 'AdminSubnav.astro');

if (!fs.existsSync(serverFile)) {
  console.error('[Archivo media v8.4.2] No existe src/server/index.ts');
  process.exit(1);
}

const backupServer = `${serverFile}.backup-media-manager-v842-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverFile, backupServer);

let code = fs.readFileSync(serverFile, 'utf8');

const importLine = "import { registerMotorsportArchiveMediaManagerRoutes } from './motorsport-archive-media-manager-routes';";
if (!code.includes(importLine)) {
  const imports = [...code.matchAll(/^import .+;$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    code = code.slice(0, last.index + last[0].length) + `\n${importLine}` + code.slice(last.index + last[0].length);
  } else {
    code = `${importLine}\n${code}`;
  }
}

const callLine = 'registerMotorsportArchiveMediaManagerRoutes(app, { rootDir });';
code = code
  .replace(/\n\/\/ GC Archivo Motorsport media manager v8\.4\.2 routes\.\nregisterMotorsportArchiveMediaManagerRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\nregisterMotorsportArchiveMediaManagerRoutes\(app, \{ rootDir \}\);\n/g, '\n');

let insertAt = -1;
const matches = [...code.matchAll(/app\.use\(express\.json\([^)]*\)\);/g)];
if (matches.length) {
  const last = matches[matches.length - 1];
  insertAt = last.index + last[0].length;
} else {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo media v8.4.2] No se encontró const app = express();');
    process.exit(1);
  }
  insertAt = idx + appLine.length;
  const parsers = "\napp.use(express.json({ limit: '25mb' }));\napp.use(express.urlencoded({ extended: true, limit: '25mb' }));\n";
  code = code.slice(0, insertAt) + parsers + code.slice(insertAt);
  insertAt += parsers.length;
}

code = code.slice(0, insertAt) + `

// GC Archivo Motorsport media manager v8.4.2 routes.
${callLine}
` + code.slice(insertAt);

fs.writeFileSync(serverFile, code, 'utf8');

if (fs.existsSync(editorFile)) {
  const backupEditor = `${editorFile}.backup-media-manager-v842-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(editorFile, backupEditor);

  let editor = fs.readFileSync(editorFile, 'utf8');
  const cssTag = '<link rel="stylesheet" href="/gc-archivo-media-manager-v842.css" />';
  const jsTag = '<script src="/gc-archivo-media-manager-v842.js" is:inline></script>';

  if (!editor.includes('/gc-archivo-media-manager-v842.css')) {
    editor = editor.replace(/<AppLayout([^>]*)>/, `<AppLayout$1>\n  ${cssTag}`);
  }

  if (!editor.includes('/gc-archivo-media-manager-v842.js')) {
    if (editor.includes('</AppLayout>')) {
      editor = editor.replace('</AppLayout>', `\n  ${jsTag}\n</AppLayout>`);
    } else {
      editor += `\n${jsTag}\n`;
    }
  }

  // Elimina restos del bloque de subida local en editor.
  editor = editor
    .replace(/\n?\s*<link rel="stylesheet" href="\/gc-archivo-local-upload-v84\.css" \/>\n?/g, '\n')
    .replace(/\n?\s*<script src="\/gc-archivo-local-upload-v84\.js" is:inline><\/script>\n?/g, '\n');

  fs.writeFileSync(editorFile, editor, 'utf8');
  console.log('[Archivo media v8.4.2] Gestor de imágenes instalado en editor.');
  console.log(`[Archivo media v8.4.2] Backup editor: ${backupEditor}`);
}

if (fs.existsSync(subnavFile)) {
  const backupSubnav = `${subnavFile}.backup-media-label-v842-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(subnavFile, backupSubnav);

  let subnav = fs.readFileSync(subnavFile, 'utf8');
  subnav = subnav
    .replace(/Imagen URL/g, 'Imágenes')
    .replace(/Imagen por URL/g, 'Imágenes')
    .replace(/imagen-url/g, 'imagen-url');

  fs.writeFileSync(subnavFile, subnav, 'utf8');
  console.log('[Archivo media v8.4.2] Etiqueta de menú actualizada a Imágenes.');
}

console.log('[Archivo media v8.4.2] API de edición/borrado de imágenes registrada.');
console.log('[Archivo media v8.4.2] Página de Imágenes simplificada a dos bloques.');
console.log('[Archivo media v8.4.2] Public data reforzado para media/cover.');
console.log(`[Archivo media v8.4.2] Backup servidor: ${backupServer}`);
