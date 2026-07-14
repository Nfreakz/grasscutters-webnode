import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(root, '_gc_backups', `hardening-phase1-${stamp}`);
fs.mkdirSync(backupRoot, { recursive: true });

const touched = [];

function filePath(relative) {
  return path.join(root, relative);
}

function backup(relative) {
  const source = filePath(relative);
  if (!fs.existsSync(source)) throw new Error(`No existe ${relative}`);
  const target = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function writeChanged(relative, content) {
  const target = filePath(relative);
  const current = fs.readFileSync(target, 'utf8');
  if (current === content) return false;
  backup(relative);
  fs.writeFileSync(target, content, 'utf8');
  touched.push(relative);
  return true;
}

function findFunctionRange(source, name) {
  const regex = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = regex.exec(source);
  if (!match) throw new Error(`No se encontró la función ${name}`);
  const start = match.index;
  const open = source.indexOf('{', match.index);
  if (open < 0) throw new Error(`No se encontró apertura de ${name}`);

  let depth = 0;
  let state = 'normal';
  let escaped = false;

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'line') {
      if (ch === '\n') state = 'normal';
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'normal'; i += 1; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if ((state === 'single' && ch === "'") || (state === 'double' && ch === '"') || (state === 'template' && ch === '`')) {
        state = 'normal';
      }
      continue;
    }

    if (ch === '/' && next === '/') { state = 'line'; i += 1; continue; }
    if (ch === '/' && next === '*') { state = 'block'; i += 1; continue; }
    if (ch === "'") { state = 'single'; continue; }
    if (ch === '"') { state = 'double'; continue; }
    if (ch === '`') { state = 'template'; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`No se encontró cierre de ${name}`);
}

function replaceFunction(source, name, replacement) {
  const range = findFunctionRange(source, name);
  return source.slice(0, range.start) + replacement.trim() + source.slice(range.end);
}

function patchServer() {
  const relative = 'src/server/index.ts';
  let source = fs.readFileSync(filePath(relative), 'utf8');

  const importLine = "import { registerGcPlatformHardening } from './gc-platform-hardening';";
  if (!source.includes(importLine)) {
    const anchor = "import { registerGcAcsmLiveTestRoutes } from './gc-acsm-live-test-routes';";
    if (!source.includes(anchor)) throw new Error('No se encontró el ancla de imports del servidor.');
    source = source.replace(anchor, `${anchor}\n${importLine}`);
  }

  const call = 'registerGcPlatformHardening(app, { rootDir });';
  if (!source.includes(call)) {
    const anchor = 'const app = express();';
    if (!source.includes(anchor)) throw new Error('No se encontró const app = express().');
    source = source.replace(anchor, `${anchor}\n${call}`);
  }

  const ipReplacement = `
function gcClientIpV1532(req: any) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}`;
  source = replaceFunction(source, 'gcClientIpV1532', ipReplacement);

  const authSyncReplacement = `
function getAuthContext(req: express.Request) {
  const token = readAuthToken(req);
  if (!token) return null;

  const store = readUserStore();
  const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;

  const user = store.users.find((item) => item.id === session.userId);
  if (!user || isUserBlocked(user)) {
    store.sessions = store.sessions.filter((item) => item.id !== session.id);
    try {
      writeUserStore(store);
    } catch (error) {
      console.warn('[GC auth] No se pudo eliminar la sesión JSON bloqueada:', error);
    }
    return null;
  }

  if (gcSessionNeedsTouch(session.lastSeenAt)) {
    session.lastSeenAt = new Date().toISOString();
    try {
      writeUserStore(store);
    } catch (error) {
      console.warn('[GC auth] No se pudo actualizar lastSeenAt JSON:', error);
    }
  }

  return { store, user, session, token };
}`;
  source = replaceFunction(source, 'getAuthContext', authSyncReplacement);

  const helperMarker = '/* GC_TARGETED_SESSION_PERSISTENCE_V1 */';
  if (!source.includes(helperMarker)) {
    const anchor = 'async function getAuthContextAsync(req: express.Request) {';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('No se encontró getAuthContextAsync.');

    const helpers = `
${helperMarker}
function gcSessionTouchIntervalMs() {
  const raw = Number(process.env.AUTH_SESSION_TOUCH_SECONDS || 300);
  const seconds = Number.isFinite(raw) ? Math.max(30, Math.min(3600, raw)) : 300;
  return seconds * 1000;
}

function gcSessionNeedsTouch(lastSeenAt: string) {
  const last = Date.parse(lastSeenAt || '');
  return !Number.isFinite(last) || Date.now() - last >= gcSessionTouchIntervalMs();
}

async function gcTouchSessionAsync(store: AppUserStore, session: AppSession) {
  const lastSeenAt = new Date().toISOString();
  session.lastSeenAt = lastSeenAt;

  if (useMysqlStorage()) {
    await ensureMysqlSchema();
    await mysqlExecute('UPDATE gc_sessions SET last_seen_at = ? WHERE id = ?', [isoToMysql(lastSeenAt), session.id]);
    return;
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db) => {
      db.run('UPDATE gc_sessions SET last_seen_at = ? WHERE id = ?', [lastSeenAt, session.id]);
    }, true);
    return;
  }

  writeUserStore(store);
}

async function gcDeleteSessionByIdAsync(store: AppUserStore, sessionId: string) {
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);

  if (useMysqlStorage()) {
    await ensureMysqlSchema();
    await mysqlExecute('DELETE FROM gc_sessions WHERE id = ?', [sessionId]);
    return;
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db) => {
      db.run('DELETE FROM gc_sessions WHERE id = ?', [sessionId]);
    }, true);
    return;
  }

  writeUserStore(store);
}

`;
    source = source.slice(0, index) + helpers + source.slice(index);
  }

  const authReplacement = `
async function getAuthContextAsync(req: express.Request) {
  const token = readAuthToken(req);
  if (!token) return null;

  const store = await readUserStoreAsync();
  const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;

  const user = store.users.find((item) => item.id === session.userId);
  if (!user || isUserBlocked(user)) {
    try {
      await gcDeleteSessionByIdAsync(store, session.id);
    } catch (error) {
      console.warn('[GC auth] No se pudo eliminar la sesión bloqueada:', error);
    }
    return null;
  }

  if (gcSessionNeedsTouch(session.lastSeenAt)) {
    try {
      await gcTouchSessionAsync(store, session);
    } catch (error) {
      console.warn('[GC auth] No se pudo actualizar lastSeenAt:', error);
    }
  }

  return { store, user, session, token };
}`;
  source = replaceFunction(source, 'getAuthContextAsync', authReplacement);
  writeChanged(relative, source);
}

function patchAvatar() {
  const relative = 'src/lib/pilot-avatars.ts';
  let source = fs.readFileSync(filePath(relative), 'utf8');
  const marker = 'function assertImageSignature';

  if (!source.includes(marker)) {
    const anchor = 'function parseImageDataUrl(imageData: unknown) {';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('No se encontró parseImageDataUrl.');

    const helper = `
function assertImageSignature(buffer: Buffer, contentType: string) {
  const png = buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  const valid = contentType === 'image/png'
    ? png
    : contentType === 'image/jpeg'
      ? jpeg
      : contentType === 'image/webp'
        ? webp
        : false;

  if (!valid) throw new Error('El contenido real de la imagen no coincide con su formato declarado.');
}

`;
    source = source.slice(0, index) + helper + source.slice(index);
  }

  const range = findFunctionRange(source, 'parseImageDataUrl');
  let fn = source.slice(range.start, range.end);
  if (!fn.includes('assertImageSignature(buffer, rawType);')) {
    const anchor = "if (buffer.length > maxBytes) throw new Error(`La imagen es demasiado grande. Máximo ${Math.round(maxBytes / 1024 / 1024)} MB.`);";
    if (!fn.includes(anchor)) throw new Error('No se encontró el control de tamaño de avatar.');
    fn = fn.replace(anchor, `${anchor}\n  assertImageSignature(buffer, rawType);`);
    source = source.slice(0, range.start) + fn + source.slice(range.end);
  }

  writeChanged(relative, source);
}

function patchLayout(relative) {
  let source = fs.readFileSync(filePath(relative), 'utf8');
  const importLine = "import '../styles/public/gc-accessibility-hardening.css';";
  if (source.includes(importLine)) return;

  const firstDelimiter = source.indexOf('---');
  const secondDelimiter = source.indexOf('---', firstDelimiter + 3);
  if (firstDelimiter !== 0 || secondDelimiter < 0) throw new Error(`Frontmatter no reconocido en ${relative}`);

  const frontmatter = source.slice(0, secondDelimiter);
  const importMatches = [...frontmatter.matchAll(/^import .*;$/gm)];
  if (!importMatches.length) throw new Error(`No se encontraron imports en ${relative}`);
  const last = importMatches[importMatches.length - 1];
  const insertAt = last.index + last[0].length;
  source = source.slice(0, insertAt) + `\n${importLine}` + source.slice(insertAt);
  writeChanged(relative, source);
}

function patchPackage() {
  const relative = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(filePath(relative), 'utf8'));
  pkg.scripts = {
    ...(pkg.scripts || {}),
    'audit:project': 'node scripts/project-audit.mjs',
    quality: 'node scripts/quality-gate.mjs',
    'quality:full': 'node scripts/quality-gate.mjs --full',
    'test:e2e': 'playwright test',
    'test:smoke': 'playwright test tests/smoke.spec.ts'
  };
  pkg.engines = { ...(pkg.engines || {}), node: '>=22 <23', npm: '>=10' };
  writeChanged(relative, JSON.stringify(pkg, null, 2) + '\n');
}

try {
  patchServer();
  patchAvatar();
  patchLayout('src/layouts/MarketingLayout.astro');
  patchLayout('src/layouts/AppLayout.astro');
  patchPackage();

  const manifest = {
    appliedAt: new Date().toISOString(),
    root,
    backupRoot,
    touched
  };
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log('\n[GC hardening] Fase 1 aplicada.');
  console.log('[GC hardening] Backup:', backupRoot);
  console.log('[GC hardening] Modificados:', touched.length ? touched.join(', ') : 'ninguno; ya estaba aplicado');
  console.log('[GC hardening] Siguiente: npm run quality && npm run build');
} catch (error) {
  console.error('\n[GC hardening] ERROR:', error instanceof Error ? error.message : error);
  console.error('[GC hardening] Revisa el backup parcial:', backupRoot);
  process.exit(1);
}
