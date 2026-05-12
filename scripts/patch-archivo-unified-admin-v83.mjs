#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFile = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverFile)) {
  console.error('[Archivo v8.3] No existe src/server/index.ts');
  process.exit(1);
}

const backup = `${serverFile}.backup-archivo-unified-v83-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverFile, backup);

let code = fs.readFileSync(serverFile, 'utf8');

const importLine = "import { registerMotorsportArchiveUnifiedAdminRoutes } from './motorsport-archive-unified-admin-routes';";
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

const callLine = 'registerMotorsportArchiveUnifiedAdminRoutes(app, { rootDir });';
code = code
  .replace(/\n\/\/ GC Archivo Motorsport unified admin v8\.3 routes\.\nregisterMotorsportArchiveUnifiedAdminRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\nregisterMotorsportArchiveUnifiedAdminRoutes\(app, \{ rootDir \}\);\n/g, '\n');

let insertAt = -1;
const matches = [...code.matchAll(/app\.use\(express\.json\([^)]*\)\);/g)];
if (matches.length) {
  const last = matches[matches.length - 1];
  insertAt = last.index + last[0].length;
} else {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo v8.3] No se encontró const app = express();');
    process.exit(1);
  }
  insertAt = idx + appLine.length;
  const parsers = "\napp.use(express.json({ limit: '25mb' }));\napp.use(express.urlencoded({ extended: true, limit: '25mb' }));\n";
  code = code.slice(0, insertAt) + parsers + code.slice(insertAt);
  insertAt += parsers.length;
}

code = code.slice(0, insertAt) + `

// GC Archivo Motorsport unified admin v8.3 routes.
${callLine}
` + code.slice(insertAt);

fs.writeFileSync(serverFile, code, 'utf8');
console.log('[Archivo v8.3] API unificada registrada.');
console.log(`[Archivo v8.3] Backup: ${backup}`);
