const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC SECURITY] No encuentro ' + serverPath);
  process.exit(1);
}

let content = fs.readFileSync(serverPath, 'utf8');
const original = content;

if (content.includes('GC_SECURITY_CORE_V15_32')) {
  console.log('[GC SECURITY] v15.32 ya parece aplicado. No hago cambios.');
  process.exit(0);
}

const marker = 'const app = express();';
const index = content.indexOf(marker);

if (index === -1) {
  console.error('[GC SECURITY] No encuentro const app = express();');
  process.exit(1);
}

const patch = "/* GC_SECURITY_CORE_V15_32 START */\ntype GcRateEntryV1532 = {\n  count: number;\n  resetAt: number;\n};\n\nconst gcRateStoreV1532 = new Map<string, GcRateEntryV1532>();\n\nfunction gcSecurityBoolEnvV1532(name: string, fallback: boolean) {\n  const raw = String(process.env[name] ?? '').trim().toLowerCase();\n  if (!raw) return fallback;\n  if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw)) return true;\n  if (['0', 'false', 'no', 'off'].includes(raw)) return false;\n  return fallback;\n}\n\nfunction gcSecurityNumberEnvV1532(name: string, fallback: number, min: number, max: number) {\n  const value = Number(process.env[name]);\n  if (!Number.isFinite(value)) return fallback;\n  return Math.max(min, Math.min(max, value));\n}\n\nfunction gcClientIpV1532(req: any) {\n  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();\n  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';\n}\n\nfunction gcCleanRouteV1532(req: any) {\n  return String(req.originalUrl || req.url || '').split('?')[0] || '/';\n}\n\nfunction gcRateGroupV1532(req: any) {\n  const method = String(req.method || 'GET').toUpperCase();\n  const route = gcCleanRouteV1532(req);\n\n  if (route.startsWith('/api/auth/login') || route.startsWith('/api/login')) {\n    return {\n      key: 'auth-login',\n      max: gcSecurityNumberEnvV1532('GC_RATE_AUTH_LOGIN_MAX', 8, 1, 100),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_AUTH_LOGIN_WINDOW_MS', 15 * 60 * 1000, 1000, 60 * 60 * 1000),\n    };\n  }\n\n  if (route.startsWith('/api/auth/register') || route.startsWith('/api/register')) {\n    return {\n      key: 'auth-register',\n      max: gcSecurityNumberEnvV1532('GC_RATE_AUTH_REGISTER_MAX', 5, 1, 100),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_AUTH_REGISTER_WINDOW_MS', 30 * 60 * 1000, 1000, 2 * 60 * 60 * 1000),\n    };\n  }\n\n  if (route.includes('/sync') || route.includes('/auto-sync')) {\n    return {\n      key: 'sync',\n      max: gcSecurityNumberEnvV1532('GC_RATE_SYNC_MAX', 8, 1, 120),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_SYNC_WINDOW_MS', 60 * 1000, 1000, 15 * 60 * 1000),\n    };\n  }\n\n  if (route.includes('/upload') || route.includes('/import')) {\n    return {\n      key: 'upload-import',\n      max: gcSecurityNumberEnvV1532('GC_RATE_UPLOAD_IMPORT_MAX', 12, 1, 120),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_UPLOAD_IMPORT_WINDOW_MS', 60 * 1000, 1000, 15 * 60 * 1000),\n    };\n  }\n\n  if (route.startsWith('/api/admin')) {\n    return {\n      key: 'admin-api',\n      max: gcSecurityNumberEnvV1532('GC_RATE_ADMIN_MAX', 80, 5, 1000),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_ADMIN_WINDOW_MS', 60 * 1000, 1000, 15 * 60 * 1000),\n    };\n  }\n\n  if (method !== 'GET' && method !== 'HEAD' && route.startsWith('/api/')) {\n    return {\n      key: 'api-write',\n      max: gcSecurityNumberEnvV1532('GC_RATE_API_WRITE_MAX', 60, 5, 1000),\n      windowMs: gcSecurityNumberEnvV1532('GC_RATE_API_WRITE_WINDOW_MS', 60 * 1000, 1000, 15 * 60 * 1000),\n    };\n  }\n\n  return null;\n}\n\nfunction gcRateCleanupV1532(now: number) {\n  if (gcRateStoreV1532.size < 2000) return;\n  for (const [key, entry] of gcRateStoreV1532.entries()) {\n    if (entry.resetAt <= now) gcRateStoreV1532.delete(key);\n  }\n}\n\nfunction gcApplySecurityHeadersV1532(_req: any, res: any) {\n  res.setHeader('X-Content-Type-Options', 'nosniff');\n  res.setHeader('X-Frame-Options', 'SAMEORIGIN');\n  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');\n  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()');\n  res.setHeader('X-DNS-Prefetch-Control', 'on');\n\n  if (process.env.NODE_ENV === 'production') {\n    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');\n  }\n\n  if (gcSecurityBoolEnvV1532('GC_SECURITY_POWERED_BY_OFF', true)) {\n    res.removeHeader('X-Powered-By');\n  }\n}\n\nfunction gcShouldBlockDiagnosticsV1532(req: any) {\n  const route = gcCleanRouteV1532(req);\n  if (process.env.NODE_ENV !== 'production') return false;\n  if (gcSecurityBoolEnvV1532('GC_EXPOSE_DIAGNOSTICS_IN_PRODUCTION', false)) return false;\n\n  return [\n    '/api/debug',\n    '/api/runtime',\n    '/api/stracker/tables',\n    '/api/stracker/preview',\n    '/api/stracker/remote-config',\n    '/gc-data/health',\n  ].some((prefix) => route === prefix || route.startsWith(prefix + '/'));\n}\n\nfunction gcSecurityMiddlewareV1532(req: any, res: any, next: any) {\n  gcApplySecurityHeadersV1532(req, res);\n\n  if (gcShouldBlockDiagnosticsV1532(req)) {\n    res.status(404).json({ ok: false, message: 'Not found' });\n    return;\n  }\n\n  if (gcSecurityBoolEnvV1532('GC_RATE_LIMIT_DISABLED', false)) {\n    next();\n    return;\n  }\n\n  const group = gcRateGroupV1532(req);\n  if (!group) {\n    next();\n    return;\n  }\n\n  const now = Date.now();\n  const ip = gcClientIpV1532(req);\n  const key = group.key + ':' + ip;\n  const current = gcRateStoreV1532.get(key);\n\n  gcRateCleanupV1532(now);\n\n  if (!current || current.resetAt <= now) {\n    gcRateStoreV1532.set(key, { count: 1, resetAt: now + group.windowMs });\n    next();\n    return;\n  }\n\n  current.count += 1;\n\n  if (current.count > group.max) {\n    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));\n    res.setHeader('Retry-After', String(retryAfter));\n    res.status(429).json({\n      ok: false,\n      message: 'Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.',\n      retryAfter,\n    });\n    return;\n  }\n\n  next();\n}\n\napp.disable('x-powered-by');\napp.use(gcSecurityMiddlewareV1532);\n/* GC_SECURITY_CORE_V15_32 END */";
const insertAt = index + marker.length;
content = content.slice(0, insertAt) + "\n\n" + patch + "\n" + content.slice(insertAt);

const backupPath = serverPath + '.bak-v15-32-security';
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');

fs.writeFileSync(serverPath, content, 'utf8');

console.log('[GC SECURITY] Security Core v15.32 aplicado.');
console.log('[GC SECURITY] Backup: ' + backupPath);
console.log('[GC SECURITY] Ejecuta: npm run build');
