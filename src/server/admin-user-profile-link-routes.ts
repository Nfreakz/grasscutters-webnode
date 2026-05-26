import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import express from 'express';
import {
  DEFAULT_PILOT_AVATAR_URL,
  deleteAvatarForAuth,
  getAvatarMeta,
  readAvatarImage,
  saveAvatarForAuth,
  type AvatarAuthContext,
} from '../lib/pilot-avatars';

type PilotPayload = {
  playerId?: unknown;
  steamGuid?: unknown;
  strackerName?: unknown;
  name?: unknown;
};

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDirForFile(filePath);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function resolveProjectPath(rootDir: string, value: string) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function getUsersPath(rootDir: string) {
  const explicit = process.env.APP_USERS_PATH?.trim();
  if (explicit) return resolveProjectPath(rootDir, explicit) || path.join(rootDir, explicit);

  const appData = process.env.APP_DATA_DIR?.trim();
  if (appData) {
    const dataRoot = resolveProjectPath(rootDir, appData) || path.join(rootDir, appData);
    return path.join(dataRoot, 'app', 'users.json');
  }

  return path.join(rootDir, 'data', 'app', 'users.json');
}

function getDriver() {
  return String(process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getMysqlConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error('Faltan variables MySQL: MYSQL_HOST, MYSQL_DATABASE o MYSQL_USER.');
  }

  const mysql = await importMysql2();
  return mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

function normalizePilotPayload(body: PilotPayload) {
  const playerId = Number(body?.playerId);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    throw new Error('playerId no válido.');
  }

  const steamGuidRaw = String(body?.steamGuid || '').trim();
  const name = String(body?.strackerName || body?.name || '').trim();

  return {
    playerId,
    steamGuid: steamGuidRaw || null,
    strackerName: name || `Piloto ${playerId}`,
    linkedAt: new Date().toISOString(),
  };
}

function userMatches(user: any, id: string) {
  return String(user?.id || '') === id || String(user?.email || '') === id;
}

function publicUserSnapshot(user: any) {
  return {
    id: user?.id || null,
    email: user?.email || null,
    displayName: user?.displayName || user?.display_name || null,
    role: user?.role || null,
    pilotLink: user?.pilotLink || null,
  };
}

function ensureNotAlreadyLinkedByOther(users: any[], targetUserId: string, playerId: number) {
  const other = users.find((user) => !userMatches(user, targetUserId) && Number(user?.pilotLink?.playerId) === playerId);
  if (other) {
    throw new Error(`Ese piloto ya está vinculado a ${other.displayName || other.email || other.id}.`);
  }
}

function readUsersStore(rootDir: string) {
  const usersPath = getUsersPath(rootDir);
  const store = readJson<any>(usersPath, { version: 1, users: [], sessions: [] });
  if (!Array.isArray(store.users)) store.users = [];
  if (!Array.isArray(store.sessions)) store.sessions = [];
  return { usersPath, store };
}

async function linkJson(rootDir: string, userId: string, payload: ReturnType<typeof normalizePilotPayload>) {
  const { usersPath, store } = readUsersStore(rootDir);
  const user = store.users.find((entry: any) => userMatches(entry, userId));
  if (!user) throw new Error('Usuario no encontrado.');

  ensureNotAlreadyLinkedByOther(store.users, userId, payload.playerId);

  const backupPath = `${usersPath}.backup-link-pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(usersPath)) fs.copyFileSync(usersPath, backupPath);

  user.pilotLink = {
    playerId: payload.playerId,
    steamGuid: payload.steamGuid,
    strackerName: payload.strackerName,
    linkedAt: payload.linkedAt,
  };
  user.updatedAt = new Date().toISOString();

  writeJson(usersPath, store);

  return { user, backupPath, usersPath };
}

async function unlinkJson(rootDir: string, userId: string) {
  const { usersPath, store } = readUsersStore(rootDir);
  const user = store.users.find((entry: any) => userMatches(entry, userId));
  if (!user) throw new Error('Usuario no encontrado.');

  const backupPath = `${usersPath}.backup-unlink-pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(usersPath)) fs.copyFileSync(usersPath, backupPath);

  user.pilotLink = null;
  user.updatedAt = new Date().toISOString();

  writeJson(usersPath, store);

  return { user, backupPath, usersPath };
}

async function linkMysql(userId: string, payload: ReturnType<typeof normalizePilotPayload>) {
  const connection = await getMysqlConnection();
  try {
    const [existingRows]: any = await connection.execute(
      'SELECT id, email, display_name, role FROM gc_users WHERE id = ? OR email = ? LIMIT 1',
      [userId, userId],
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing) throw new Error('Usuario no encontrado.');

    const [linkedRows]: any = await connection.execute(
      'SELECT id, email, display_name FROM gc_users WHERE pilot_player_id = ? AND id <> ? LIMIT 1',
      [payload.playerId, existing.id],
    );
    const linked = Array.isArray(linkedRows) ? linkedRows[0] : null;
    if (linked) throw new Error(`Ese piloto ya está vinculado a ${linked.display_name || linked.email || linked.id}.`);

    await connection.execute(
      `UPDATE gc_users
       SET pilot_player_id = ?,
           pilot_steam_guid = ?,
           pilot_stracker_name = ?,
           pilot_linked_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        payload.playerId,
        payload.steamGuid,
        payload.strackerName,
        payload.linkedAt.slice(0, 23).replace('T', ' '),
        new Date().toISOString().slice(0, 23).replace('T', ' '),
        existing.id,
      ],
    );

    return { user: { ...existing, pilotLink: payload }, storage: 'mysql' };
  } finally {
    await connection.end();
  }
}

async function unlinkMysql(userId: string) {
  const connection = await getMysqlConnection();
  try {
    const [existingRows]: any = await connection.execute(
      'SELECT id, email, display_name, role FROM gc_users WHERE id = ? OR email = ? LIMIT 1',
      [userId, userId],
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing) throw new Error('Usuario no encontrado.');

    await connection.execute(
      `UPDATE gc_users
       SET pilot_player_id = NULL,
           pilot_steam_guid = NULL,
           pilot_stracker_name = NULL,
           pilot_linked_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [new Date().toISOString().slice(0, 23).replace('T', ' '), existing.id],
    );

    return { user: { ...existing, pilotLink: null }, storage: 'mysql' };
  } finally {
    await connection.end();
  }
}

const linkPilotJsonBody = express.json({ limit: '64kb' });
const avatarJsonBody = express.json({ limit: '4mb' });

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function readSessionToken(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.gc_session) return cookies.gc_session;

  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

  return '';
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function compactText(value: unknown) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function mysqlDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function avatarAuthUserFromRow(row: any) {
  return {
    id: String(row.id),
    email: String(row.email || ''),
    displayName: String(row.display_name || row.displayName || row.email || 'Piloto'),
    role: String(row.role || 'pilot'),
    pilotLink: row.pilot_player_id == null && row.pilotPlayerId == null && row.pilotLink?.playerId == null ? null : {
      playerId: Number(row.pilot_player_id ?? row.pilotPlayerId ?? row.pilotLink?.playerId),
      steamGuid: compactText(row.pilot_steam_guid ?? row.pilotSteamGuid ?? row.pilotLink?.steamGuid),
      strackerName: compactText(row.pilot_stracker_name ?? row.pilotStrackerName ?? row.pilotLink?.strackerName) || 'Piloto vinculado',
      linkedAt: mysqlDate(row.pilot_linked_at ?? row.pilotLinkedAt ?? row.pilotLink?.linkedAt ?? row.updated_at ?? row.updatedAt) || new Date().toISOString(),
    },
  };
}

async function getAvatarAuthMysql(req: Request): Promise<AvatarAuthContext | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  const connection = await getMysqlConnection();
  try {
    const [rows]: any = await connection.execute(
      `SELECT u.*
       FROM gc_sessions s
       INNER JOIN gc_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return { user: avatarAuthUserFromRow(row), source: 'mysql' };
  } finally {
    await connection.end();
  }
}

function getAvatarAuthJson(rootDir: string, req: Request): AvatarAuthContext | null {
  const token = readSessionToken(req);
  if (!token) return null;

  const { store } = readUsersStore(rootDir);
  const session = store.sessions.find((item: any) => item?.tokenHash === hashToken(token) && Date.parse(String(item?.expiresAt || '')) > Date.now());
  if (!session) return null;

  const user = store.users.find((item: any) => String(item?.id || '') === String(session.userId || ''));
  if (!user) return null;

  return { user: avatarAuthUserFromRow(user), source: 'json' };
}

async function getAvatarAuth(rootDir: string, req: Request): Promise<AvatarAuthContext | null> {
  const driver = getDriver();
  if (driver === 'mysql' || driver === 'mariadb') return getAvatarAuthMysql(req);
  return getAvatarAuthJson(rootDir, req);
}

function sendAvatarMeta(res: Response, auth: AvatarAuthContext) {
  const playerId = auth.user.pilotLink?.playerId ?? null;
  const avatar = playerId ? getAvatarMeta(playerId) : {
    playerId: null,
    avatarUrl: DEFAULT_PILOT_AVATAR_URL,
    isDefault: true,
    uploadedAt: null,
  };

  return res.json({
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL,
    ...avatar,
  });
}

function registerPilotAvatarRoutes(app: Express, rootDir: string) {
  app.get('/api/pilot-avatar/me', async (req: Request, res: Response) => {
    try {
      const auth = await getAvatarAuth(rootDir, req);
      if (!auth) return res.status(401).json({ ok: false, authenticated: false, message: 'Login requerido.' });
      return sendAvatarMeta(res, auth);
    } catch (error: any) {
      console.error('[GC] Error cargando avatar propio:', error);
      return res.status(500).json({ ok: false, message: error?.message || 'No se pudo cargar el avatar.' });
    }
  });

  app.post('/api/pilot-avatar/me', avatarJsonBody, async (req: Request, res: Response) => {
    try {
      const auth = await getAvatarAuth(rootDir, req);
      if (!auth) return res.status(401).json({ ok: false, authenticated: false, message: 'Login requerido.' });
      if (!auth.user.pilotLink?.playerId) {
        return res.status(400).json({ ok: false, authenticated: true, linked: false, message: 'Primero vincula tu cuenta con un piloto.' });
      }

      const result = await saveAvatarForAuth(auth, req.body?.imageData, req.body?.fileName);
      return res.json({ ok: true, authenticated: true, linked: true, ...result });
    } catch (error: any) {
      console.error('[GC] Error subiendo avatar:', error);
      return res.status(400).json({ ok: false, message: error?.message || 'No se pudo subir el avatar.' });
    }
  });

  app.delete('/api/pilot-avatar/me', async (req: Request, res: Response) => {
    try {
      const auth = await getAvatarAuth(rootDir, req);
      if (!auth) return res.status(401).json({ ok: false, authenticated: false, message: 'Login requerido.' });
      if (!auth.user.pilotLink?.playerId) {
        return res.status(400).json({ ok: false, authenticated: true, linked: false, message: 'Primero vincula tu cuenta con un piloto.' });
      }

      const result = await deleteAvatarForAuth(auth);
      return res.json({ ok: true, authenticated: true, linked: true, ...result });
    } catch (error: any) {
      console.error('[GC] Error restableciendo avatar:', error);
      return res.status(400).json({ ok: false, message: error?.message || 'No se pudo restablecer el avatar.' });
    }
  });

  app.get('/api/pilot-avatar/:playerId', (req: Request, res: Response) => {
    try {
      const image = readAvatarImage(req.params.playerId);
      if (!image) {
        res.redirect(302, DEFAULT_PILOT_AVATAR_URL);
        return;
      }

      res.setHeader('Content-Type', image.contentType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-GC-Avatar-Uploaded-At', image.uploadedAt);
      res.send(image.buffer);
    } catch (error) {
      console.error('[GC] Error sirviendo avatar:', error);
      res.redirect(302, DEFAULT_PILOT_AVATAR_URL);
    }
  });
}

export function registerAdminUserProfileLinkRoutes(app: Express, { rootDir }: { rootDir: string }) {
  registerPilotAvatarRoutes(app, rootDir);

  app.post('/api/admin/users/:id/link-pilot', linkPilotJsonBody, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) return res.status(400).json({ ok: false, message: 'Falta usuario.' });

      const payload = normalizePilotPayload(req.body || {});
      const driver = getDriver();

      if (driver === 'mysql' || driver === 'mariadb') {
        const result = await linkMysql(userId, payload);
        return res.json({ ok: true, linked: true, storage: result.storage, user: publicUserSnapshot(result.user) });
      }

      if (driver !== 'json') {
        return res.status(501).json({ ok: false, message: `Vinculación no implementada para APP_STORAGE_DRIVER=${driver}. Usa json en local o mysql en Hostinger.` });
      }

      const result = await linkJson(rootDir, userId, payload);
      return res.json({
        ok: true,
        linked: true,
        storage: 'json',
        user: publicUserSnapshot(result.user),
        usersPath: result.usersPath,
        backupPath: result.backupPath,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, linked: false, message: error?.message || 'Error vinculando piloto.' });
    }
  });

  app.delete('/api/admin/users/:id/link-pilot', async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) return res.status(400).json({ ok: false, message: 'Falta usuario.' });

      const driver = getDriver();

      if (driver === 'mysql' || driver === 'mariadb') {
        const result = await unlinkMysql(userId);
        return res.json({ ok: true, linked: false, storage: result.storage, user: publicUserSnapshot(result.user) });
      }

      if (driver !== 'json') {
        return res.status(501).json({ ok: false, message: `Desvinculación no implementada para APP_STORAGE_DRIVER=${driver}. Usa json en local o mysql en Hostinger.` });
      }

      const result = await unlinkJson(rootDir, userId);
      return res.json({
        ok: true,
        linked: false,
        storage: 'json',
        user: publicUserSnapshot(result.user),
        usersPath: result.usersPath,
        backupPath: result.backupPath,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, linked: true, message: error?.message || 'Error desvinculando piloto.' });
    }
  });
}
