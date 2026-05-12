#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(file)) {
  console.error('[Archivo v8.2] No existe src/server/index.ts');
  process.exit(1);
}

const backup = `${file}.backup-archivo-admin-mysql-v82-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, 'utf8');

const importLine = "import { registerMotorsportArchiveAdminMysqlRoutes } from './motorsport-archive-admin-mysql-routes';";
if (!code.includes(importLine)) {
  const imports = [...code.matchAll(/^import .+;$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    const insertAt = last.index + last[0].length;
    code = code.slice(0, insertAt) + `\n${importLine}` + code.slice(insertAt);
  } else {
    code = `${importLine}\n${code}`;
  }
}

const callLine = 'registerMotorsportArchiveAdminMysqlRoutes(app, { rootDir });';
if (!code.includes(callLine)) {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo v8.2] No se encontró const app = express();');
    process.exit(1);
  }
  const insertAt = idx + appLine.length;
  code = code.slice(0, insertAt) + `\n\n// GC Archivo Motorsport admin MySQL/create/import routes.\n${callLine}\n` + code.slice(insertAt);
}

fs.writeFileSync(file, code, 'utf8');

console.log('[Archivo v8.2] Rutas admin MySQL/import registradas.');
console.log(`[Archivo v8.2] Backup: ${backup}`);
