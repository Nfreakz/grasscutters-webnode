import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'gc_steam_session';
const NONCE_COOKIE = 'gc_steam_nonce';
const SESSION_VERSION = 2;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const NONCE_MAX_AGE_SECONDS = 10 * 60;

interface CookieOptions {
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  maxAge?: number;
}

export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: CookieOptions): void;
}

export interface SteamSession {
  version: 2;
  steamUserId: string;
  steamId64: string;
  issuedAt: number;
  expiresAt: number;
}

function readRaw(...names: string[]): string {
  for (const name of names) {
    const viteValue = import.meta.env[name];
    const processValue = process.env[name];
    const value = String(viteValue ?? processValue ?? '').trim();

    if (value) return value;
  }

  return '';
}

export function getPublicSiteUrl(requestUrl?: URL): string {
  const configured = readRaw('PUBLIC_SITE_URL');

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (requestUrl) {
    return requestUrl.origin;
  }

  return 'http://localhost:4321';
}

export function isSteamAuthConfigured(): boolean {
  return readRaw('AUTH_SESSION_SECRET').length >= 32;
}

function sessionSecret(): string {
  const secret = readRaw('AUTH_SESSION_SECRET');

  if (secret.length < 32) {
    throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters.');
  }

  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieSecurity(requestUrl?: URL): boolean {
  if (requestUrl?.protocol === 'https:') return true;

  return readRaw('APP_ENV') === 'production';
}

function cookieOptions(
  requestUrl: URL | undefined,
  maxAge: number
): CookieOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: cookieSecurity(requestUrl),
    sameSite: 'lax',
    maxAge
  };
}

export function createSteamNonce(
  cookies: CookieJar,
  requestUrl?: URL
): string {
  const nonce = randomBytes(24).toString('base64url');

  cookies.set(
    NONCE_COOKIE,
    nonce,
    cookieOptions(requestUrl, NONCE_MAX_AGE_SECONDS)
  );

  return nonce;
}

export function consumeSteamNonce(
  cookies: CookieJar,
  suppliedNonce: string,
  requestUrl?: URL
): boolean {
  const stored = cookies.get(NONCE_COOKIE)?.value ?? '';

  cookies.delete(NONCE_COOKIE, {
    path: '/',
    secure: cookieSecurity(requestUrl),
    sameSite: 'lax'
  });

  return Boolean(stored && suppliedNonce && safeEqual(stored, suppliedNonce));
}

export function writeSteamSession(
  cookies: CookieJar,
  account: {
    id: string;
    steamId64: string;
  },
  requestUrl?: URL
): SteamSession {
  const now = Math.floor(Date.now() / 1000);

  const session: SteamSession = {
    version: SESSION_VERSION,
    steamUserId: account.id,
    steamId64: account.steamId64,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS
  };

  const payload = base64UrlEncode(JSON.stringify(session));
  const token = `${payload}.${sign(payload)}`;

  cookies.set(
    SESSION_COOKIE,
    token,
    cookieOptions(requestUrl, SESSION_MAX_AGE_SECONDS)
  );

  return session;
}

export function readSteamSession(
  cookies: CookieJar
): SteamSession | null {
  if (!isSteamAuthConfigured()) return null;

  const token = cookies.get(SESSION_COOKIE)?.value ?? '';
  const separator = token.lastIndexOf('.');

  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!safeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as SteamSession;
    const now = Math.floor(Date.now() / 1000);

    if (
      parsed.version !== SESSION_VERSION ||
      !/^\d+$/.test(parsed.steamUserId) ||
      !/^\d{17}$/.test(parsed.steamId64) ||
      parsed.expiresAt <= now ||
      parsed.issuedAt > now + 60
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSteamSession(
  cookies: CookieJar,
  requestUrl?: URL
): void {
  cookies.delete(SESSION_COOKIE, {
    path: '/',
    secure: cookieSecurity(requestUrl),
    sameSite: 'lax'
  });
}

export function maskSteamId(steamId64: string): string {
  return `${steamId64.slice(0, 5)}••••${steamId64.slice(-4)}`;
}
