import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'src/server/index.ts');
const BACKUP_DIR = path.join(ROOT, '_gc_backups', `phase5a2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const BACKUP = path.join(BACKUP_DIR, 'src/server/index.ts');

function fail(message) {
  console.error(`[GC Phase 5A.2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail('No existe src/server/index.ts.');
const before = fs.readFileSync(FILE, 'utf8');
let after = before;

function replaceExact(search, replacement, expected, label) {
  const count = after.split(search).length - 1;
  if (count === 0 && after.includes(replacement)) {
    console.log(`[GC Phase 5A.2] Ya aplicado: ${label}`);
    return;
  }
  if (count !== expected) fail(`${label}: esperadas ${expected} coincidencias, encontradas ${count}.`);
  after = after.split(search).join(replacement);
  console.log(`[GC Phase 5A.2] Preparado: ${label} (${expected})`);
}

replaceExact(
  'app.handle(req, res);',
  '(app as any).handle(req, res);',
  5,
  'aliases legacy Express app.handle'
);

replaceExact(
  'function gcParseRequestCookies(rawCookieHeader) {',
  'function gcParseRequestCookies(rawCookieHeader: unknown): Record<string, string> {',
  1,
  'tipo cabecera cookies'
);

replaceExact(
  '    }, {});',
  '    }, {} as Record<string, string>);',
  1,
  'acumulador cookies'
);

replaceExact(
  'function gcLogoutCookieOptions() {',
  'function gcLogoutCookieOptions(): express.CookieOptions {',
  1,
  'opciones cookie'
);

replaceExact(
  'function gcClearSessionCookie(response) {',
  'function gcClearSessionCookie(response: express.Response) {',
  1,
  'response logout'
);

replaceExact(
  'function gcSessionTokenHashes(token) {',
  'function gcSessionTokenHashes(token: unknown): string[] {',
  1,
  'hash token sesión'
);

replaceExact(
  'async function gcDeleteSessionByToken(token) {',
  'async function gcDeleteSessionByToken(token: unknown): Promise<number> {',
  1,
  'borrado token sesión'
);

replaceExact(
  '  let parsed;',
  '  let parsed: { sessions?: any[] };',
  1,
  'JSON de sesiones'
);

replaceExact(
  'parsed.sessions = parsed.sessions.filter((session) => {',
  'parsed.sessions = parsed.sessions.filter((session: any) => {',
  1,
  'tipo sesión JSON'
);

replaceExact(
  'async function gcLogoutRequest(req, res, redirectToHome = false) {',
  'async function gcLogoutRequest(req: express.Request, res: express.Response, redirectToHome = false) {',
  1,
  'request/response logout'
);

replaceExact(
  '      isDirectory: exists ? fs.statSync(dirPath).isDirectory() : false',
  '      isDirectory: exists && dirPath ? fs.statSync(dirPath).isDirectory() : false',
  1,
  'runtime directory nullable'
);

replaceExact(
  '      isFile: exists ? fs.statSync(filePath).isFile() : false',
  '      isFile: exists && filePath ? fs.statSync(filePath).isFile() : false',
  1,
  'runtime file nullable'
);

if (after === before) {
  console.log('[GC Phase 5A.2] No había cambios pendientes.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, before, 'utf8');
fs.writeFileSync(FILE, after, 'utf8');

console.log('');
console.log('[GC Phase 5A.2] Aplicación completada.');
console.log(`[GC Phase 5A.2] Backup: ${path.relative(ROOT, BACKUP)}`);
console.log('[GC Phase 5A.2] Ejecuta ahora npm run check.');
