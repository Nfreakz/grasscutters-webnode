import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server', 'index.ts');
const marker = 'GC_AUTH_LOGOUT_PATCH_V1';

if (!fs.existsSync(serverPath)) {
  console.error(`[GC auth logout patch] No existe ${serverPath}`);
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (source.includes(marker)) {
  console.log('[GC auth logout patch] Ya aplicado.');
  process.exit(0);
}

const logoutBlock = `
/* ${marker}
 * Endpoint de cierre de sesión para headers público e interno.
 * Limpia cookie gc_session y elimina la sesión en MySQL, SQLite o JSON.
 */
function gcParseRequestCookies(rawCookieHeader) {
  return String(rawCookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex <= 0) return cookies;
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function gcLogoutCookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure
  };
}

function gcClearSessionCookie(response) {
  const options = gcLogoutCookieOptions();
  response.clearCookie(sessionCookieName, options);
  response.cookie(sessionCookieName, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0)
  });
}

function gcSessionTokenHashes(token) {
  const raw = String(token || '').trim();
  if (!raw) return ['', ''];
  return [
    crypto.createHash('sha256').update(raw).digest('hex'),
    raw
  ];
}

async function gcDeleteSessionByToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return 0;
  const hashes = gcSessionTokenHashes(raw);

  if (useMysqlStorage()) {
    const result = await mysqlExecute('DELETE FROM gc_sessions WHERE token_hash IN (?, ?)', hashes);
    return Number(result?.affectedRows || 0);
  }

  if (useSqliteStorage()) {
    return withAppSqliteDb((db) => {
      db.run('DELETE FROM gc_sessions WHERE token_hash IN (?, ?)', hashes);
      return Number(typeof db.getRowsModified === 'function' ? db.getRowsModified() : 0);
    }, true);
  }

  const filePath = getUsersPath();
  if (!fs.existsSync(filePath)) return 0;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return 0;
  }

  if (!Array.isArray(parsed.sessions)) return 0;
  const before = parsed.sessions.length;
  parsed.sessions = parsed.sessions.filter((session) => {
    const sessionHash = String(session?.tokenHash || session?.token_hash || session?.hash || '');
    const sessionToken = String(session?.token || '');
    return !hashes.includes(sessionHash) && sessionToken !== raw;
  });

  const removed = before - parsed.sessions.length;
  if (removed > 0) {
    ensureDirForFile(filePath);
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  return removed;
}

async function gcLogoutRequest(req, res, redirectToHome = false) {
  const cookies = gcParseRequestCookies(req.headers.cookie);
  const token = cookies[sessionCookieName];
  let removedSessions = 0;

  try {
    removedSessions = await gcDeleteSessionByToken(token);
  } catch (error) {
    console.error('[GC] Error cerrando sesión:', error);
  }

  gcClearSessionCookie(res);

  if (redirectToHome) {
    res.redirect('/');
    return;
  }

  res.json({
    ok: true,
    authenticated: false,
    removedSessions,
    message: 'Sesión cerrada correctamente.'
  });
}

app.post('/api/auth/logout', (req, res) => {
  void gcLogoutRequest(req, res, false);
});

app.get('/api/auth/logout', (req, res) => {
  void gcLogoutRequest(req, res, true);
});

app.get('/api/logout', (req, res) => {
  void gcLogoutRequest(req, res, true);
});

`;

const listenIndex = source.lastIndexOf('app.listen(');
if (listenIndex === -1) {
  console.error('[GC auth logout patch] No se ha encontrado app.listen(...) en src/server/index.ts');
  process.exit(1);
}

source = source.slice(0, listenIndex) + logoutBlock + source.slice(listenIndex);
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC auth logout patch] Logout aplicado en src/server/index.ts');
