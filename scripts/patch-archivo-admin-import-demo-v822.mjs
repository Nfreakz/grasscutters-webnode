#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFile = path.join(root, 'src', 'server', 'index.ts');
const pages = [
  path.join(root, 'src', 'pages', 'admin', 'archivo.astro'),
  path.join(root, 'src', 'pages', 'admin', 'archivo', 'nuevo.astro'),
  path.join(root, 'src', 'pages', 'admin', 'archivo', 'importar.astro'),
];

if (!fs.existsSync(serverFile)) {
  console.error('[Archivo v8.2.2] No existe src/server/index.ts');
  process.exit(1);
}

const backup = `${serverFile}.backup-archivo-v822-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverFile, backup);

let code = fs.readFileSync(serverFile, 'utf8');
const importLine = "import { registerMotorsportArchiveAdminMysqlRoutes } from './motorsport-archive-admin-mysql-routes';";
if (!code.includes(importLine)) {
  const imports = [...code.matchAll(/^import .+;$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    code = code.slice(0, last.index + last[0].length) + `\n${importLine}` + code.slice(last.index + last[0].length);
  } else {
    code = `${importLine}\n${code}`;
  }
}

const callLine = 'registerMotorsportArchiveAdminMysqlRoutes(app, { rootDir });';
code = code
  .replace(/\n\/\/ GC Archivo Motorsport admin MySQL\/create\/import routes\.\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\n\/\/ GC Archivo Motorsport admin MySQL\/import routes must run after JSON body parser\.\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\n\/\/ GC Archivo Motorsport admin MySQL\/import safe v8\.2\.2 routes\.\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n');

code = code.replace(/app\.use\(express\.json\(\{[^}]*\}\)\);/, "app.use(express.json({ limit: '25mb' }));");
code = code.replace(/app\.use\(express\.urlencoded\(\{[^}]*\}\)\);/, "app.use(express.urlencoded({ extended: true, limit: '25mb' }));");

const jsonMatches = [...code.matchAll(/app\.use\(express\.json\([^)]*\)\);/g)];
let insertAt = -1;

if (jsonMatches.length) {
  const last = jsonMatches[jsonMatches.length - 1];
  insertAt = last.index + last[0].length;
} else {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo v8.2.2] No se encontró const app = express();');
    process.exit(1);
  }
  insertAt = idx + appLine.length;
  const parsers = "\napp.use(express.json({ limit: '25mb' }));\napp.use(express.urlencoded({ extended: true, limit: '25mb' }));\n";
  code = code.slice(0, insertAt) + parsers + code.slice(insertAt);
  insertAt += parsers.length;
}

code = code.slice(0, insertAt) + `

// GC Archivo Motorsport admin MySQL/import safe v8.2.2 routes.
${callLine}
` + code.slice(insertAt);

fs.writeFileSync(serverFile, code, 'utf8');
console.log('[Archivo v8.2.2] Servidor parcheado.');
console.log(`[Archivo v8.2.2] Backup: ${backup}`);

const tag = '<script src="/gc-archivo-admin-v822.js" is:inline></script>';
for (const page of pages) {
  if (!fs.existsSync(page)) continue;
  let pageCode = fs.readFileSync(page, 'utf8');
  if (pageCode.includes('/gc-archivo-admin-v822.js')) {
    console.log(`[Archivo v8.2.2] UI ya instalada: ${path.relative(root, page)}`);
    continue;
  }
  const pageBackup = `${page}.backup-archivo-v822-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(page, pageBackup);

  if (pageCode.includes('</AppLayout>')) {
    pageCode = pageCode.replace('</AppLayout>', `\n  ${tag}\n</AppLayout>`);
  } else {
    pageCode += `\n${tag}\n`;
  }

  fs.writeFileSync(page, pageCode, 'utf8');
  console.log(`[Archivo v8.2.2] UI instalada: ${path.relative(root, page)}`);
}
