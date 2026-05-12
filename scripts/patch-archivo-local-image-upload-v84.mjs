#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFile = path.join(root, 'src', 'server', 'index.ts');
const editorFile = path.join(root, 'src', 'pages', 'admin', 'archivo', 'editar', '[id].astro');

if (!fs.existsSync(serverFile)) {
  console.error('[Archivo upload v8.4] No existe src/server/index.ts');
  process.exit(1);
}

if (!fs.existsSync(editorFile)) {
  console.error('[Archivo upload v8.4] No existe src/pages/admin/archivo/editar/[id].astro');
  process.exit(1);
}

const backupServer = `${serverFile}.backup-archive-upload-v84-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverFile, backupServer);

let code = fs.readFileSync(serverFile, 'utf8');

const importLine = "import { registerMotorsportArchiveLocalImageUploadRoutes } from './motorsport-archive-local-image-upload-routes';";
if (!code.includes(importLine)) {
  const imports = [...code.matchAll(/^import .+;$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    code = code.slice(0, last.index + last[0].length) + `\n${importLine}` + code.slice(last.index + last[0].length);
  } else {
    code = `${importLine}\n${code}`;
  }
}

code = code.replace(/app\.use\(express\.json\(\{[^}]*\}\)\);/, "app.use(express.json({ limit: '25mb' }));");
code = code.replace(/app\.use\(express\.urlencoded\(\{[^}]*\}\)\);/, "app.use(express.urlencoded({ extended: true, limit: '25mb' }));");

const callLine = 'registerMotorsportArchiveLocalImageUploadRoutes(app, { rootDir });';
code = code
  .replace(/\n\/\/ GC Archivo Motorsport local image upload v8\.4 routes\.\nregisterMotorsportArchiveLocalImageUploadRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\nregisterMotorsportArchiveLocalImageUploadRoutes\(app, \{ rootDir \}\);\n/g, '\n');

let insertAt = -1;
const matches = [...code.matchAll(/app\.use\(express\.json\([^)]*\)\);/g)];
if (matches.length) {
  const last = matches[matches.length - 1];
  insertAt = last.index + last[0].length;
} else {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo upload v8.4] No se encontró const app = express();');
    process.exit(1);
  }
  insertAt = idx + appLine.length;
  const parsers = "\napp.use(express.json({ limit: '25mb' }));\napp.use(express.urlencoded({ extended: true, limit: '25mb' }));\n";
  code = code.slice(0, insertAt) + parsers + code.slice(insertAt);
  insertAt += parsers.length;
}

code = code.slice(0, insertAt) + `

// GC Archivo Motorsport local image upload v8.4 routes.
${callLine}
` + code.slice(insertAt);

fs.writeFileSync(serverFile, code, 'utf8');

const backupEditor = `${editorFile}.backup-archive-upload-v84-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(editorFile, backupEditor);

let editor = fs.readFileSync(editorFile, 'utf8');

const cssTag = '<link rel="stylesheet" href="/gc-archivo-local-upload-v84.css" />';
const jsTag = '<script src="/gc-archivo-local-upload-v84.js" is:inline></script>';

if (!editor.includes('/gc-archivo-local-upload-v84.css')) {
  if (editor.includes('<AppLayout')) {
    editor = editor.replace(/<AppLayout([^>]*)>/, `<AppLayout$1>\n  ${cssTag}`);
  } else {
    editor = `${cssTag}\n${editor}`;
  }
}

if (!editor.includes('/gc-archivo-local-upload-v84.js')) {
  if (editor.includes('</AppLayout>')) {
    editor = editor.replace('</AppLayout>', `\n  ${jsTag}\n</AppLayout>`);
  } else {
    editor += `\n${jsTag}\n`;
  }
}

fs.writeFileSync(editorFile, editor, 'utf8');

console.log('[Archivo upload v8.4] Ruta de subida registrada.');
console.log('[Archivo upload v8.4] UI de subida instalada en editor.');
console.log(`[Archivo upload v8.4] Backup servidor: ${backupServer}`);
console.log(`[Archivo upload v8.4] Backup editor: ${backupEditor}`);
