import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_PILOT_AVATAR_URL = '/images/pilot-avatar-default.png';
const sessionCookieName = 'gc_session';
const defaultAppDataDirRelativePath = './data';
const defaultUsersRelativePath = './data/app/users.json';
const avatarStoreRelativePath = 'app/pilot-avatars.json';
const avatarFilesRelativePath = 'app/pilot-avatar-files';

type PilotAvatarEntry = {
  playerId: number;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  userId: string | null;
  originalName?: string | null;
};

type PilotAvatarStore = {
  version: 1;
  updatedAt: string;
  avatars: Record<string, PilotAvatarEntry>;
};

type AvatarAuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  pilotLink: null | {
    playerId: number;
    steamGuid: string | null;
    strackerName: string;
    linkedAt: string;
  };
};

export type AvatarAuthContext = {
  user: AvatarAuthUser;
  source: 'json' | 'mysql';
};

function rootDir() {
  return process.env.GC_RUNTIME_ROOT ? path.resolve(process.env.GC_RUNTIME_ROOT) : process.cwd();
}

function resolveProjectPath(value: string | undefined | null) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(rootDir(), value);
}

function getAppDataRoot() {
  const configured = process.env.APP_DATA_DIR?.trim();
  return configured ? (resolveProjectPath(configured) ?? path.join(rootDir(), configured)) : path.join(rootDir(), defaultAppDataDirRelativePath);
}

function getUsersPath() {
  const configured = process.env.APP_USERS_PATH?.trim();
  return configured ? (resolveProjectPath(configured) ?? path.join(rootDir(), configured)) : path.join(rootDir(), defaultUsersRelativePath);
}

function getAvatarStorePath() {
  const configured = process.env.PILOT_AVATAR_STORE_PATH?.trim();
  return configured ? (resolveProjectPath(configured) ?? path.join(rootDir(), configured)) : path.join(getAppDataRoot(), avatarStoreRelativePath);
}

function getAvatarFilesDir() {
  const configured = process.env.PILOT_AVATAR_DIR?.trim();
  return configured ? (resolveProjectPath(configured) ?? path.join(rootDir(), configured)) : path.join(getAppDataRoot(), avatarFilesRelativePath);
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseCookies(header: string | null | undefined) {
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

function readAuthToken(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  if (cookies[sessionCookieName]) return cookies[sessionCookieName];
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}

function tokenHash(token: string) {
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

function publicUserFromRow(row: any): AvatarAuthUser {
  return {
    id: String(row.id),
    email: String(row.email || ''),
    displayName: String(row.display_name || row.displayName || row.email || 'Piloto'),
    role: String(row.role || 'pilot'),
    pilotLink: row.pilot_player_id == null && row.pilotPlayerId == null ? null : {
      playerId: Number(row.pilot_player_id ?? row.pilotPlayerId),
      steamGuid: compactText(row.pilot_steam_guid ?? row.pilotSteamGuid),
      strackerName: compactText(row.pilot_stracker_name ?? row.pilotStrackerName) || 'Piloto vinculado',
      linkedAt: mysqlDate(row.pilot_linked_at ?? row.pilotLinkedAt ?? row.updated_at ?? row.updatedAt) || new Date().toISOString()
    }
  };
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getMysqlAuthUser(request: Request): Promise<AvatarAuthContext | null> {
  const token = readAuthToken(request);
  if (!token) return null;

  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) return null;

  const mysql = await importMysql2();
  const connection = await mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
  try {
    const [rows] = await connection.execute(
      `SELECT u.*
       FROM gc_sessions s
       INNER JOIN gc_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
       LIMIT 1`,
      [tokenHash(token)]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return { user: publicUserFromRow(row), source: 'mysql' };
  } finally {
    await connection.end();
  }
}

function getJsonAuthUser(request: Request): AvatarAuthContext | null {
  const token = readAuthToken(request);
  if (!token) return null;
  const usersPath = getUsersPath();
  if (!fs.existsSync(usersPath)) return null;

  try {
    const store = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const users = Array.isArray(store.users) ? store.users : [];
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const hash = tokenHash(token);
    const session = sessions.find((item: any) => item.tokenHash === hash && Date.parse(String(item.expiresAt || '')) > Date.now());
    if (!session) return null;
    const user = users.find((item: any) => String(item.id) === String(session.userId));
    if (!user) return null;
    return { user: publicUserFromRow({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      pilot_player_id: user.pilotLink?.playerId ?? null,
      pilot_steam_guid: user.pilotLink?.steamGuid ?? null,
      pilot_stracker_name: user.pilotLink?.strackerName ?? null,
      pilot_linked_at: user.pilotLink?.linkedAt ?? null,
      updated_at: user.updatedAt
    }), source: 'json' };
  } catch {
    return null;
  }
}

export async function getCurrentAvatarAuth(request: Request): Promise<AvatarAuthContext | null> {
  const driver = String(process.env.APP_STORAGE_DRIVER ?? 'json').trim().toLowerCase();
  if (driver === 'mysql' || driver === 'mariadb') return getMysqlAuthUser(request);
  return getJsonAuthUser(request);
}

function createEmptyStore(): PilotAvatarStore {
  return { version: 1, updatedAt: new Date().toISOString(), avatars: {} };
}

export function readAvatarStore(): PilotAvatarStore {
  const filePath = getAvatarStorePath();
  if (!fs.existsSync(filePath)) return createEmptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      avatars: parsed.avatars && typeof parsed.avatars === 'object' ? parsed.avatars : {}
    };
  } catch {
    return createEmptyStore();
  }
}

function writeAvatarStore(store: PilotAvatarStore) {
  const next = { ...store, version: 1 as const, updatedAt: new Date().toISOString() };
  const filePath = getAvatarStorePath();
  ensureDirForFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function safeAvatarFileName(fileName: string) {
  const clean = String(fileName || '').trim();
  if (!/^pilot-[0-9]+-[0-9]+-[a-f0-9]{8}\.(png|jpg|jpeg|webp)$/i.test(clean)) return null;
  return clean;
}

function avatarFilePath(fileName: string) {
  const safe = safeAvatarFileName(fileName);
  if (!safe) return null;
  return path.join(getAvatarFilesDir(), safe);
}

export function getAvatarEntry(playerIdRaw: unknown): PilotAvatarEntry | null {
  const playerId = Number(playerIdRaw);
  if (!Number.isFinite(playerId) || playerId <= 0) return null;
  const store = readAvatarStore();
  const entry = store.avatars[String(playerId)];
  if (!entry) return null;
  const filePath = avatarFilePath(entry.fileName);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return entry;
}

export function getAvatarMeta(playerIdRaw: unknown) {
  const playerId = Number(playerIdRaw);
  const entry = getAvatarEntry(playerId);
  return {
    playerId: Number.isFinite(playerId) ? playerId : null,
    avatarUrl: entry ? `/api/pilot-avatar/${encodeURIComponent(String(playerId))}?v=${encodeURIComponent(entry.uploadedAt)}` : DEFAULT_PILOT_AVATAR_URL,
    isDefault: !entry,
    uploadedAt: entry?.uploadedAt ?? null
  };
}

export function readAvatarImage(playerIdRaw: unknown) {
  const entry = getAvatarEntry(playerIdRaw);
  if (!entry) return null;
  const filePath = avatarFilePath(entry.fileName);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return {
    buffer: fs.readFileSync(filePath),
    contentType: entry.contentType || 'image/png',
    uploadedAt: entry.uploadedAt
  };
}

function parseImageDataUrl(imageData: unknown) {
  const text = String(imageData || '').trim();
  const match = text.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Formato de imagen no válido. Usa PNG, JPG o WEBP.');
  const rawType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  const maxBytes = Number(process.env.PILOT_AVATAR_MAX_BYTES || 2_500_000);
  if (!buffer.length) throw new Error('La imagen está vacía.');
  if (buffer.length > maxBytes) throw new Error(`La imagen es demasiado grande. Máximo ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const ext = rawType === 'image/jpeg' ? 'jpg' : rawType.split('/')[1];
  return { buffer, contentType: rawType, ext };
}

export async function saveAvatarForAuth(auth: AvatarAuthContext, imageData: unknown, originalName?: unknown) {
  const playerId = Number(auth.user.pilotLink?.playerId);
  if (!Number.isFinite(playerId) || playerId <= 0) throw new Error('Tu cuenta no tiene un piloto vinculado.');

  const parsed = parseImageDataUrl(imageData);
  ensureDir(getAvatarFilesDir());

  const store = readAvatarStore();
  const previous = store.avatars[String(playerId)];
  const now = new Date().toISOString();
  const fileName = `pilot-${playerId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${parsed.ext}`;
  const filePath = path.join(getAvatarFilesDir(), fileName);
  fs.writeFileSync(filePath, parsed.buffer);

  if (previous?.fileName && previous.fileName !== fileName) {
    const previousPath = avatarFilePath(previous.fileName);
    if (previousPath && fs.existsSync(previousPath)) {
      try { fs.unlinkSync(previousPath); } catch {}
    }
  }

  store.avatars[String(playerId)] = {
    playerId,
    fileName,
    contentType: parsed.contentType,
    uploadedAt: now,
    userId: auth.user.id,
    originalName: compactText(originalName)
  };
  writeAvatarStore(store);

  return getAvatarMeta(playerId);
}

export async function deleteAvatarForAuth(auth: AvatarAuthContext) {
  const playerId = Number(auth.user.pilotLink?.playerId);
  if (!Number.isFinite(playerId) || playerId <= 0) throw new Error('Tu cuenta no tiene un piloto vinculado.');
  const store = readAvatarStore();
  const previous = store.avatars[String(playerId)];
  if (previous?.fileName) {
    const previousPath = avatarFilePath(previous.fileName);
    if (previousPath && fs.existsSync(previousPath)) {
      try { fs.unlinkSync(previousPath); } catch {}
    }
  }
  delete store.avatars[String(playerId)];
  writeAvatarStore(store);
  return getAvatarMeta(playerId);
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
