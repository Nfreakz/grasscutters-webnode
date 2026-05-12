#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(file)) {
  console.error('[Archivo v8.2.1] No existe src/server/index.ts');
  process.exit(1);
}

const backup = `${file}.backup-archivo-admin-mysql-v821-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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

// Quitar llamadas previas, porque si estaban antes de express.json() req.body llegaba vacío.
code = code
  .replace(/\n\/\/ GC Archivo Motorsport admin MySQL\/create\/import routes\.\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\n\/\/ GC Archivo Motorsport admin MySQL\/import routes must run after JSON body parser\.\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n')
  .replace(/\nregisterMotorsportArchiveAdminMysqlRoutes\(app, \{ rootDir \}\);\n/g, '\n');

const jsonRegexes = [
  /app\.use\(express\.json\([^)]*\)\);/g,
  /app\.use\(express\.urlencoded\([^)]*\)\);/g,
];

let insertAt = -1;
for (const regex of jsonRegexes) {
  const matches = [...code.matchAll(regex)];
  if (matches.length) {
    const last = matches[matches.length - 1];
    insertAt = Math.max(insertAt, last.index + last[0].length);
  }
}

if (insertAt === -1) {
  const appLine = 'const app = express();';
  const appIndex = code.indexOf(appLine);
  if (appIndex === -1) {
    console.error('[Archivo v8.2.1] No se encontró const app = express();');
    process.exit(1);
  }
  insertAt = appIndex + appLine.length;
  code = code.slice(0, insertAt) + `
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
` + code.slice(insertAt);
  insertAt += `
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
`.length;
} else {
  // Si existe express.json pero con límite pequeño, lo subimos de forma conservadora.
  code = code.replace(/app\.use\(express\.json\(\{[^}]*\}\)\);/, "app.use(express.json({ limit: '25mb' }));");
  code = code.replace(/app\.use\(express\.urlencoded\(\{[^}]*\}\)\);/, "app.use(express.urlencoded({ extended: true, limit: '25mb' }));");

  // Recalcular insertAt por si el reemplazo cambió longitud.
  insertAt = -1;
  for (const regex of jsonRegexes) {
    const matches = [...code.matchAll(regex)];
    if (matches.length) {
      const last = matches[matches.length - 1];
      insertAt = Math.max(insertAt, last.index + last[0].length);
    }
  }
}

code = code.slice(0, insertAt) + `

// GC Archivo Motorsport admin MySQL/import routes must run after JSON body parser.
${callLine}
` + code.slice(insertAt);

fs.writeFileSync(file, code, 'utf8');

console.log('[Archivo v8.2.1] Rutas admin MySQL/import registradas después de express.json().');
console.log(`[Archivo v8.2.1] Backup: ${backup}`);
