import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';

type HardeningOptions = {
  rootDir?: string;
};

type RateEntry = {
  count: number;
  resetAt: number;
  touchedAt: number;
};

function boolEnv(name: string, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function cleanRequestId(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(raw) ? raw : '';
}

function normalizedOrigin(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return '';
  }
}

function requestOwnOrigin(req: Request) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  return host ? normalizedOrigin(`${proto}://${host}`) : '';
}

function allowedOrigins(req: Request) {
  const configured = String(process.env.GC_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizedOrigin)
    .filter(Boolean);
  const publicSite = normalizedOrigin(process.env.PUBLIC_SITE_URL);
  return new Set([requestOwnOrigin(req), publicSite, ...configured].filter(Boolean));
}

function hasSessionCookie(req: Request) {
  return /(?:^|;\s*)gc_session=/.test(String(req.headers.cookie || ''));
}

function isUnsafeMethod(req: Request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
}

function isApiPath(req: Request) {
  const route = String(req.path || req.originalUrl || '');
  return route === '/api' || route.startsWith('/api/') || route === '/gc-data' || route.startsWith('/gc-data/');
}

function sameOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (!isUnsafeMethod(req) || !isApiPath(req) || !hasSessionCookie(req)) return next();

  const originHeader = req.headers.origin;
  if (!originHeader) return next();

  const origin = normalizedOrigin(originHeader);
  if (origin && allowedOrigins(req).has(origin)) return next();

  res.status(403).json({
    ok: false,
    message: 'Origen no autorizado.',
    requestId: res.locals.gcRequestId
  });
}

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const incoming = cleanRequestId(req.headers['x-request-id']);
  const requestId = incoming || crypto.randomUUID();
  res.locals.gcRequestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');

  if (boolEnv('GC_COOP_ENABLED', false)) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }

  const cspReportOnly = String(process.env.GC_CSP_REPORT_ONLY || '').trim();
  if (cspReportOnly) {
    res.setHeader('Content-Security-Policy-Report-Only', cspReportOnly);
  }

  if (
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/admin') ||
    req.path.startsWith('/api/profile') ||
    req.path.startsWith('/api/perfil')
  ) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
  }

  next();
}

function createPublicApiLimiter() {
  const store = new Map<string, RateEntry>();
  let lastCleanup = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    if (boolEnv('GC_PUBLIC_API_RATE_DISABLED', false)) return next();
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) return next();
    if (!isApiPath(req) || req.path === '/api/healthz') return next();

    const windowMs = numberEnv('GC_PUBLIC_API_RATE_WINDOW_MS', 60_000, 1_000, 3_600_000);
    const max = numberEnv('GC_PUBLIC_API_RATE_MAX', 600, 30, 20_000);
    const now = Date.now();

    if (now - lastCleanup > windowMs || store.size > 10_000) {
      for (const [key, entry] of store.entries()) {
        if (entry.resetAt <= now) store.delete(key);
      }
      if (store.size > 10_000) {
        const oldest = [...store.entries()]
          .sort((a, b) => a[1].touchedAt - b[1].touchedAt)
          .slice(0, store.size - 8_000);
        oldest.forEach(([key]) => store.delete(key));
      }
      lastCleanup = now;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `public:${ip}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs, touchedAt: now });
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - 1)));
      return next();
    }

    current.count += 1;
    current.touchedAt = now;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - current.count)));

    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        message: 'Demasiadas solicitudes públicas. Espera un momento.',
        retryAfter,
        requestId: res.locals.gcRequestId
      });
    }

    next();
  };
}

function optionalHttpLog(req: Request, res: Response, next: NextFunction) {
  if (!boolEnv('GC_HTTP_LOG_ENABLED', false)) return next();

  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const slowMs = numberEnv('GC_HTTP_LOG_SLOW_MS', 500, 0, 60_000);
    if (durationMs < slowMs && res.statusCode < 500) return;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : 'info',
      scope: 'http',
      requestId: res.locals.gcRequestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs
    }));
  });
  next();
}

export function registerGcPlatformHardening(app: Express, _options: HardeningOptions = {}) {
  const trustProxyHops = numberEnv('GC_TRUST_PROXY_HOPS', 0, 0, 10);
  app.set('trust proxy', trustProxyHops > 0 ? trustProxyHops : false);

  app.use(securityHeaders);
  app.use(sameOriginGuard);
  app.use(createPublicApiLimiter());
  app.use(optionalHttpLog);

  app.get('/api/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'grasscutters-webnode',
      status: 'live',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      node: process.version,
      requestId: res.locals.gcRequestId
    });
  });
}
