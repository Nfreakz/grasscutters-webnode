#!/usr/bin/env node
/*
  GC_ADMIN_USERS_BACKEND_ENDPOINTS_v1

  Local patcher. No toca GitHub.
  Ejecutar desde la raíz del proyecto grasscutters-webnode:

    node scripts/gc-admin-users-backend-endpoints-v1.mjs

  Crea backup automático:
    _gc_backups/admin-users-backend-endpoints-v1/<timestamp>/
*/

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, '_gc_backups', 'admin-users-backend-endpoints-v1', stamp);
const targetPath = 'src/server/index.ts';
const fullTarget = path.join(rootDir, targetPath);

const report = {
  changed: [],
  unchanged: [],
  warnings: [],
  errors: [],
};

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}`);
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function backup(pathName, content) {
  const dest = path.join(backupRoot, pathName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function writeIfChanged(pathName, before, after) {
  if (before === after) {
    report.unchanged.push(pathName);
    return false;
  }

  backup(pathName, before);
  fs.writeFileSync(path.join(rootDir, pathName), after, 'utf8');
  report.changed.push(pathName);
  return true;
}

const block = `
// GC_ADMIN_USERS_BACKEND_ENDPOINTS_V1 START
async function gcAdminUsersV1Require(req: express.Request, res: express.Response) {
  const context = await requireAdmin(req, res);
  return context || null;
}

function gcAdminUsersV1Public(user: AppUser, store: AppUserStore) {
  return publicAdminUser(user, store);
}

function gcAdminUsersV1NormalizeRole(value: unknown): 'admin' | 'pilot' | null {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin') return 'admin';
  if (role === 'pilot' || role === 'user') return 'pilot';
  return null;
}

function gcAdminUsersV1FindMutableUser(store: AppUserStore, userId: string) {
  const user = findUserById(store, userId);
  if (!user) return null;
  return user;
}

function gcAdminUsersV1UserIdFromReq(req: express.Request) {
  return String(req.params?.id || req.params?.userId || req.body?.userId || '').trim();
}

app.get('/api/admin/users', async (req, res) => {
  const context = await gcAdminUsersV1Require(req, res);
  if (!context) return;

  try {
    const store = await readUserStoreAsync();

    res.json({
      ok: true,
      users: store.users.map((user) => gcAdminUsersV1Public(user, store)),
      summary: getUserStoreAdminSummary(store),
      source: 'admin-users-backend-endpoints-v1'
    });
  } catch (error: any) {
    console.error('[GC] Error listando usuarios admin v1:', error);
    res.status(500).json({
      ok: false,
      source: 'admin-users-backend-endpoints-v1',
      message: error?.message || 'No se pudieron cargar usuarios.'
    });
  }
});

app.post('/api/admin/users/:id/role', async (req, res) => {
  const context = await gcAdminUsersV1Require(req, res);
  if (!context) return;

  try {
    const userId = gcAdminUsersV1UserIdFromReq(req);
    const role = gcAdminUsersV1NormalizeRole(req.body?.role);

    if (!userId) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Falta userId.' });
      return;
    }

    if (!role) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Rol no válido.' });
      return;
    }

    const store = await readUserStoreAsync();
    const user = gcAdminUsersV1FindMutableUser(store, userId);

    if (!user) {
      res.status(404).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Usuario no encontrado.' });
      return;
    }

    if (user.role === 'admin' && role !== 'admin' && isLastAdmin(store, user.id)) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'No puedes quitar el último administrador.' });
      return;
    }

    user.role = role;
    user.updatedAt = new Date().toISOString();

    await writeUserStoreAsync(store);

    res.json({
      ok: true,
      user: gcAdminUsersV1Public(user, store),
      users: store.users.map((entry) => gcAdminUsersV1Public(entry, store)),
      summary: getUserStoreAdminSummary(store),
      source: 'admin-users-backend-endpoints-v1',
      message: 'Rol actualizado.'
    });
  } catch (error: any) {
    console.error('[GC] Error cambiando rol usuario admin v1:', error);
    res.status(500).json({
      ok: false,
      source: 'admin-users-backend-endpoints-v1',
      message: error?.message || 'No se pudo cambiar el rol.'
    });
  }
});

app.post('/api/admin/users/:id/revoke-sessions', async (req, res) => {
  const context = await gcAdminUsersV1Require(req, res);
  if (!context) return;

  try {
    const userId = gcAdminUsersV1UserIdFromReq(req);

    if (!userId) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Falta userId.' });
      return;
    }

    const store = await readUserStoreAsync();
    const user = gcAdminUsersV1FindMutableUser(store, userId);

    if (!user) {
      res.status(404).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Usuario no encontrado.' });
      return;
    }

    const before = store.sessions.length;
    store.sessions = store.sessions.filter((session) => session.userId !== userId);
    const revoked = before - store.sessions.length;

    user.updatedAt = new Date().toISOString();

    await writeUserStoreAsync(store);

    res.json({
      ok: true,
      revokedSessions: revoked,
      user: gcAdminUsersV1Public(user, store),
      users: store.users.map((entry) => gcAdminUsersV1Public(entry, store)),
      summary: getUserStoreAdminSummary(store),
      source: 'admin-users-backend-endpoints-v1',
      message: 'Sesiones cerradas.'
    });
  } catch (error: any) {
    console.error('[GC] Error cerrando sesiones usuario admin v1:', error);
    res.status(500).json({
      ok: false,
      source: 'admin-users-backend-endpoints-v1',
      message: error?.message || 'No se pudieron cerrar las sesiones.'
    });
  }
});

app.post('/api/admin/users/:id/password', async (req, res) => {
  const context = await gcAdminUsersV1Require(req, res);
  if (!context) return;

  try {
    const userId = gcAdminUsersV1UserIdFromReq(req);
    const password = String(req.body?.password || '');

    if (!userId) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Falta userId.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const store = await readUserStoreAsync();
    const user = gcAdminUsersV1FindMutableUser(store, userId);

    if (!user) {
      res.status(404).json({ ok: false, source: 'admin-users-backend-endpoints-v1', message: 'Usuario no encontrado.' });
      return;
    }

    user.password = hashPassword(password);
    user.updatedAt = new Date().toISOString();

    const before = store.sessions.length;
    store.sessions = store.sessions.filter((session) => session.userId !== userId);
    const revoked = before - store.sessions.length;

    await writeUserStoreAsync(store);

    res.json({
      ok: true,
      revokedSessions: revoked,
      user: gcAdminUsersV1Public(user, store),
      users: store.users.map((entry) => gcAdminUsersV1Public(entry, store)),
      summary: getUserStoreAdminSummary(store),
      source: 'admin-users-backend-endpoints-v1',
      message: 'Contraseña actualizada.'
    });
  } catch (error: any) {
    console.error('[GC] Error reseteando contraseña usuario admin v1:', error);
    res.status(500).json({
      ok: false,
      source: 'admin-users-backend-endpoints-v1',
      message: error?.message || 'No se pudo cambiar la contraseña.'
    });
  }
});

app.get('/api/admin/unlinked-pilots', async (req, res) => {
  const context = await gcAdminUsersV1Require(req, res);
  if (!context) return;

  try {
    const store = await readUserStoreAsync();
    const linkedIds = new Set(
      store.users
        .map((user) => user.pilotLink?.playerId)
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value))
    );

    const stracker = getStrackerConfig();

    if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
      res.json({
        ok: true,
        pilots: [],
        source: 'admin-users-backend-endpoints-v1',
        stracker,
        message: 'No hay stracker.db3 válido para calcular pilotos sin cuenta.'
      });
      return;
    }

    const laps = await readJoinedLaps(stracker.resolvedPath);
    const drivers = reduceDriverStats(laps as any[])
      .filter((driver: any) => driver?.id !== null && driver?.id !== undefined)
      .filter((driver: any) => !linkedIds.has(String(driver.id)))
      .slice(0, 250);

    res.json({
      ok: true,
      pilots: drivers,
      count: drivers.length,
      source: 'admin-users-backend-endpoints-v1'
    });
  } catch (error: any) {
    console.error('[GC] Error calculando pilotos sin cuenta v1:', error);
    res.status(500).json({
      ok: false,
      source: 'admin-users-backend-endpoints-v1',
      message: error?.message || 'No se pudieron cargar pilotos sin cuenta.'
    });
  }
});
// GC_ADMIN_USERS_BACKEND_ENDPOINTS_V1 END
`;

function main() {
  console.log('');
  console.log('GC Admin Users Backend Endpoints v1');
  console.log('Root:', rootDir);
  console.log('');

  try {
    const before = readText(fullTarget);

    if (before.includes('GC_ADMIN_USERS_BACKEND_ENDPOINTS_V1 START')) {
      report.unchanged.push(targetPath);
    } else {
      const anchor = '// GC_PATCH_ADMIN_AUTH_UNIFIED_STATUS_END';
      if (!before.includes(anchor)) {
        report.errors.push(`No se encontró anchor ${anchor} en ${targetPath}.`);
      } else {
        const after = before.replace(anchor, `${anchor}\n${block}`);
        writeIfChanged(targetPath, before, after);
      }
    }
  } catch (error) {
    report.errors.push(error?.message || String(error));
  }

  console.log('Cambios:', report.changed.length ? report.changed.join(', ') : 'ninguno');
  console.log('Sin cambios:', report.unchanged.length ? report.unchanged.join(', ') : 'ninguno');

  if (report.warnings.length) {
    console.log('');
    console.log('Avisos:');
    for (const item of report.warnings) console.log('-', item);
  }

  if (report.errors.length) {
    console.log('');
    console.log('Errores:');
    for (const item of report.errors) console.log('-', item);
    process.exitCode = 1;
    return;
  }

  if (report.changed.length) {
    console.log('');
    console.log('Backups creados en:');
    console.log(backupRoot);
  }

  console.log('');
  console.log('Siguiente paso:');
  console.log('  npm run build');
  console.log('  npm run dev');
  console.log('');
  console.log('Prueba:');
  console.log('  /admin/usuarios');
  console.log('');
}

main();
