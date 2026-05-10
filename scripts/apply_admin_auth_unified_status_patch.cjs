const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC] No encuentro src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const START = '// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_START';
const END = '// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_END';

const patch = String.raw`

${START}
function gcCompatReadCookie(req, name) {
  const header = String(req?.headers?.cookie || '');
  if (!header) return '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    const value = part.slice(index + 1).trim();
    try { return decodeURIComponent(value); } catch (_) { return value; }
  }
  return '';
}

function gcCompatSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.display_name || user.name || user.email || 'Usuario',
    role: user.role || 'pilot',
    pilotLink: user.pilotLink || null,
    createdAt: user.createdAt || user.created_at || null,
    updatedAt: user.updatedAt || user.updated_at || null,
    lastLoginAt: user.lastLoginAt || user.last_login_at || null
  };
}

async function gcCompatResolveCurrentUser(req) {
  const token = gcCompatReadCookie(req, sessionCookieName);
  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const store = await readUserStoreAsync();
  const now = Date.now();
  const sessions = Array.isArray(store?.sessions) ? store.sessions : [];
  const users = Array.isArray(store?.users) ? store.users : [];
  const session = sessions.find((item) => {
    if (!item || item.tokenHash !== tokenHash) return false;
    const expiresAt = Date.parse(String(item.expiresAt || item.expires_at || ''));
    return Number.isFinite(expiresAt) && expiresAt > now;
  });

  if (!session) return null;
  return users.find((user) => user && user.id === session.userId) || null;
}

async function gcCompatAdminSnapshot(req) {
  const store = await readUserStoreAsync();
  const users = Array.isArray(store?.users) ? store.users : [];
  const sessions = Array.isArray(store?.sessions) ? store.sessions : [];
  const now = Date.now();
  const activeSessions = sessions.filter((session) => {
    const expiresAt = Date.parse(String(session?.expiresAt || session?.expires_at || ''));
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  const currentUser = await gcCompatResolveCurrentUser(req);
  const adminUsers = users.filter((user) => String(user?.role || '').toLowerCase() === 'admin');
  const authorized = String(currentUser?.role || '').toLowerCase() === 'admin';

  return {
    ok: true,
    authenticated: Boolean(currentUser),
    authorized,
    setupRequired: adminUsers.length === 0,
    setupSecretConfigured: Boolean(process.env.ADMIN_SETUP_SECRET || process.env.STRACKER_SYNC_SECRET),
    currentUser: gcCompatSafeUser(currentUser),
    summary: {
      usersCount: users.length,
      adminsCount: adminUsers.length,
      linkedUsersCount: users.filter((user) => Boolean(user?.pilotLink || user?.pilot_player_id)).length,
      activeSessionsCount: activeSessions.length
    },
    admin: {
      stracker: typeof getStrackerConfig === 'function' ? getStrackerConfig() : null,
      storage: typeof getAppStorageStatus === 'function' ? getAppStorageStatus() : null
    },
    source: 'unified-admin-session'
  };
}

function gcCompatCalendarStorageInfo() {
  const source = getAppStorageDriverLabel();
  const base = {
    source,
    persistent: source === 'mysql' || source === 'sqlite' || !isPathInside(getCalendarEventsPath(), rootDir),
    checkedAt: new Date().toISOString()
  };

  if (source === 'mysql') {
    return {
      ...base,
      table: 'gc_calendar_events',
      mysql: getMysqlStorageSafeConfig()
    };
  }

  if (source === 'sqlite') {
    return {
      ...base,
      table: 'gc_calendar_events',
      sqlite: getSqliteStorageSafeConfig()
    };
  }

  const calendarPath = getCalendarEventsPath();
  const exists = fs.existsSync(calendarPath);
  const stats = exists ? fs.statSync(calendarPath) : null;
  return {
    ...base,
    path: calendarPath,
    insideProject: isPathInside(calendarPath, rootDir),
    exists,
    sizeBytes: stats?.size || 0,
    modifiedAt: stats?.mtime?.toISOString?.() || null,
    warning: isPathInside(calendarPath, rootDir)
      ? 'El calendario está en JSON dentro del proyecto. Usa APP_STORAGE_DRIVER=mysql o APP_CALENDAR_EVENTS_PATH fuera del deploy.'
      : null
  };
}

app.get('/api/admin/status', async (req, res, next) => {
  try {
    const snapshot = await gcCompatAdminSnapshot(req);
    res.json(snapshot);
  } catch (error) {
    console.error('[GC] Error en status admin unificado:', error);
    next();
  }
});

app.get('/api/admin/calendar-events/storage', async (req, res, next) => {
  try {
    const snapshot = await gcCompatAdminSnapshot(req);
    if (!snapshot.authorized) {
      res.status(403).json({ ok: false, message: 'Acceso admin requerido.', authenticated: snapshot.authenticated, source: 'unified-admin-session' });
      return;
    }

    const storage = gcCompatCalendarStorageInfo();
    res.json({ ok: true, ...storage, storage });
  } catch (error) {
    console.error('[GC] Error en storage calendario unificado:', error);
    next();
  }
});
${END}
`;

if (source.includes(START)) {
  source = source.replace(new RegExp(`${START}[\\s\\S]*?${END}`), patch.trim());
} else {
  const candidates = [
    /const\s+app\s*=\s*express\s*\(\s*\)\s*;?/, 
    /let\s+app\s*=\s*express\s*\(\s*\)\s*;?/
  ];
  let inserted = false;
  for (const pattern of candidates) {
    const match = source.match(pattern);
    if (match) {
      const index = match.index + match[0].length;
      source = source.slice(0, index) + patch + source.slice(index);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    console.error('[GC] No he encontrado const app = express(); en src/server/index.ts. No aplico cambios.');
    process.exit(1);
  }
}

const backupPath = `${serverPath}.backup-admin-auth-unified-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverPath, backupPath);
fs.writeFileSync(serverPath, source, 'utf8');

console.log('[GC] Patch admin auth unificado aplicado.');
console.log(`[GC] Backup creado: ${path.relative(root, backupPath)}`);
console.log('[GC] Ejecuta: npm run build');
