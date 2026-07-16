import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type RequireAdmin = (req: Request, res: Response) => Promise<any | null> | any | null;
type GetAuthContext = (req: Request) => Promise<any | null> | any | null;
type GetUserStore = () => Promise<any> | any;

type AnalyticsOptions = {
  rootDir: string;
  requireAdmin?: RequireAdmin;
  getAuthContext?: GetAuthContext;
  getUserStore?: GetUserStore;
};

type AnalyticsRecord = {
  occurredAt: string;
  dayKey: string;
  monthKey: string;
  hourOfDay: number;
  visitorHash: string;
  visitorPeriodHash: string;
  registeredUserHash: string | null;
  registeredSessionHash: string | null;
  path: string;
  area: string;
  referrerHost: string | null;
  source: string;
  device: string;
  browser: string;
};

type AnalyticsSummaryRow = {
  key: string;
  views: number;
  visitors: number;
};

type RequestedRange = {
  all: boolean;
  days: number | null;
};

type PeriodBounds = {
  all: boolean;
  days: number | null;
  from: string;
  to: string;
  previousFrom: string | null;
  previousTo: string | null;
};

type AnalyticsSummary = {
  ok: true;
  enabled: boolean;
  ready: boolean;
  storage: 'mysql' | 'file' | 'disabled';
  generatedAt: string;
  timeZone: string;
  rawRetentionDays: number;
  historyMode: 'permanent-aggregates';
  activeMinutes: number;
  dedupSeconds: number;
  period: PeriodBounds;
  totals: {
    today: { views: number; visitors: number };
    last7Days: { views: number; visitors: number };
    last30Days: { views: number; visitors: number };
    selectedPeriod: {
      views: number;
      visitors: number;
      estimatedUniqueVisitors: number;
      registeredUsers: number;
      registeredViews: number;
      anonymousViews: number;
      registeredSessions: number;
    };
    activeNow: number;
  };
  comparison: {
    available: boolean;
    current: { views: number; visitors: number };
    previous: { views: number; visitors: number };
    changePercent: { views: number | null; visitors: number | null };
  };
  accounts: {
    total: number;
    activeToday: number;
    active7Days: number;
    active30Days: number;
    inactive30Days: number;
    measuredAllTime: number;
    trackingStartedAt: string | null;
  };
  daily: Array<{ day: string; views: number; visitors: number; registeredViews: number }>;
  hourly: Array<{ hour: number; views: number; registeredViews: number }>;
  topPages: AnalyticsSummaryRow[];
  referrers: AnalyticsSummaryRow[];
  devices: AnalyticsSummaryRow[];
  browsers: AnalyticsSummaryRow[];
  health: {
    startedAt: string;
    storage: 'mysql' | 'file' | 'disabled';
    secretConfigured: boolean;
    secretValid: boolean;
    secretLength: number;
    rawStoredRows: number;
    aggregateViews: number;
    historyStartedAt: string | null;
    latestRecordAt: string | null;
    accountTrackingStartedAt: string | null;
    lastAttemptAt: string | null;
    lastRecordedAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    lastPruneAt: string | null;
    recordedSinceStart: number;
    dedupedSinceStart: number;
  };
  privacy: {
    cookies: false;
    localStorage: false;
    storesIp: false;
    storesQueryString: false;
    visitorHashRotatesDaily: true;
    visitorPeriodHashRotatesMonthly: true;
    registeredUsersAreHashed: true;
    storesUserIdentityInAnalytics: false;
    reloadDeduplication: true;
    accountUsageIsAggregated: true;
  };
};

type AccountUsageRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  pilotName: string | null;
  teamName: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  disabled: boolean;
  deleted: boolean;
  views: number;
  sessions: number;
  activeDays: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  topArea: string | null;
  topAreaViews: number;
};

type AccountUsageResponse = {
  ok: true;
  generatedAt: string;
  period: PeriodBounds;
  totals: {
    accounts: number;
    activeToday: number;
    active7Days: number;
    active30Days: number;
    inactive30Days: number;
    measuredAccounts: number;
    registeredViews: number;
    registeredSessions: number;
  };
  trackingStartedAt: string | null;
  items: AccountUsageRow[];
};

/* GC_ANALYTICS_RELIABILITY_V2 */
/* GC_ANALYTICS_DISTINCT_USERS_V3 */
/* GC_ANALYTICS_ACCOUNT_USAGE_FOREVER_V4 */
const BOT_PATTERN = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|googlebot|lighthouse|pagespeed|uptimerobot|headlesschrome|playwright|puppeteer|curl|wget/i;
const STATIC_EXTENSION_PATTERN = /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|pdf|png|svg|txt|webm|webp|woff2?|xml|zip)$/i;
const INTERNAL_SOURCE = 'Interno';
const DIMENSION_TYPES = ['path', 'source', 'device', 'browser'] as const;

let mysqlPoolPromise: Promise<any> | null = null;
let mysqlSchemaPromise: Promise<void> | null = null;
let lastPruneAt = 0;
const recentPageViews = new Map<string, number>();
const analyticsRuntimeHealth = {
  startedAt: new Date().toISOString(),
  lastAttemptAt: null as string | null,
  lastRecordedAt: null as string | null,
  lastErrorAt: null as string | null,
  lastError: null as string | null,
  lastPruneAt: null as string | null,
  recordedSinceStart: 0,
  dedupedSinceStart: 0,
};

function analyticsEnabled(): boolean {
  return String(process.env.GC_ANALYTICS_ENABLED || '').trim().toLowerCase() === 'true';
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function rawRetentionDays(): number {
  const value = process.env.GC_ANALYTICS_RAW_RETENTION_DAYS
    ?? process.env.GC_ANALYTICS_RETENTION_DAYS
    ?? 90;
  const parsed = Number(value);
  if (parsed === 0) return 0;
  return clampInteger(parsed, 90, 7, 3650);
}

function activeMinutes(): number {
  return clampInteger(process.env.GC_ANALYTICS_ACTIVE_MINUTES, 5, 1, 60);
}

function dedupSeconds(): number {
  return clampInteger(process.env.GC_ANALYTICS_DEDUP_SECONDS, 15, 0, 300);
}

function analyticsTimeZone(): string {
  return String(process.env.GC_ANALYTICS_TIME_ZONE || 'Europe/Madrid').trim() || 'Europe/Madrid';
}

function analyticsHashSecretInfo(): { configured: boolean; valid: boolean; length: number; secret: string } {
  const secret = String(process.env.GC_ANALYTICS_HASH_SECRET || '').trim();
  return {
    configured: Boolean(secret),
    valid: secret.length >= 32,
    length: secret.length,
    secret,
  };
}

function analyticsReady(): boolean {
  return analyticsEnabled() && analyticsHashSecretInfo().valid;
}

function storageDriver(): 'mysql' | 'file' | 'disabled' {
  if (!analyticsEnabled()) return 'disabled';
  const appDriver = String(process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  if ((appDriver === 'mysql' || appDriver === 'mariadb')
    && process.env.MYSQL_HOST?.trim()
    && process.env.MYSQL_DATABASE?.trim()
    && process.env.MYSQL_USER?.trim()) {
    return 'mysql';
  }
  return 'file';
}

function analyticsFilePath(rootDir: string): string {
  const configured = process.env.GC_ANALYTICS_FILE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  const appDataDir = process.env.APP_DATA_DIR?.trim();
  const dataRoot = appDataDir
    ? (path.isAbsolute(appDataDir) ? appDataDir : path.resolve(rootDir, appDataDir))
    : path.join(rootDir, 'data');
  return path.join(dataRoot, 'app', 'analytics-pageviews.ndjson');
}

function analyticsHashSecret(): string {
  const info = analyticsHashSecretInfo();
  if (!info.valid) throw new Error('GC_ANALYTICS_HASH_SECRET debe tener al menos 32 caracteres.');
  return info.secret;
}

function hmac(value: string): string {
  return crypto.createHmac('sha256', analyticsHashSecret()).update(value).digest('hex');
}

function anonymizeIp(value: unknown): string {
  const raw = String(value || '').trim().replace(/^::ffff:/, '');
  if (!raw) return 'unknown';

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const parts = raw.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (raw.includes(':')) return raw.split(':').filter(Boolean).slice(0, 4).join(':') || 'ipv6';
  return 'unknown';
}

function dateParts(now = new Date()): { dayKey: string; monthKey: string; hourOfDay: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: analyticsTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dayKey,
    monthKey: dayKey.slice(0, 7),
    hourOfDay: clampInteger(parts.hour, 0, 0, 23),
  };
}

function shiftDayKey(dayKey: string, offsetDays: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function requestedRange(value: unknown): RequestedRange {
  const raw = String(value ?? '30').trim().toLowerCase();
  if (raw === 'all' || raw === '0' || raw === 'forever') return { all: true, days: null };
  return { all: false, days: clampInteger(raw, 30, 7, 3650) };
}

function resolveBounds(range: RequestedRange, earliestDay: string | null): PeriodBounds {
  const to = dateParts().dayKey;
  if (range.all) {
    return {
      all: true,
      days: null,
      from: earliestDay || to,
      to,
      previousFrom: null,
      previousTo: null,
    };
  }

  const days = range.days || 30;
  const from = shiftDayKey(to, -(days - 1));
  const previousTo = shiftDayKey(from, -1);
  const previousFrom = shiftDayKey(previousTo, -(days - 1));
  return { all: false, days, from, to, previousFrom, previousTo };
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round((((current - previous) / previous) * 100) * 10) / 10;
}

function normalizePathname(requestUrl: unknown): string {
  const raw = String(requestUrl || '/');
  let pathname = '/';

  try {
    pathname = new URL(raw, 'http://grasscutters.local').pathname || '/';
  } catch {
    pathname = raw.split('?')[0].split('#')[0] || '/';
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Conserva el path si la codificación es inválida.
  }

  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname.slice(0, 300) || '/';
}

function pageArea(pathName: string): string {
  const value = String(pathName || '/').toLowerCase();
  if (value === '/') return 'Inicio';
  if (value.startsWith('/campeonato')) return 'Campeonato';
  if (value.startsWith('/live-timing') || value.startsWith('/live-test')) return 'Live timing';
  if (value.startsWith('/ratings')) return 'Ratings';
  if (value.startsWith('/perfil') || value.startsWith('/pilotos')) return 'Perfiles';
  if (value.startsWith('/calendario') || value.startsWith('/historico')) return 'Calendario';
  if (value.startsWith('/combos')) return 'Combos';
  if (value.startsWith('/carreras-comunidad')) return 'Comunidad';
  if (value.startsWith('/app') || value.startsWith('/gc-tools')) return 'GC Tools';
  return 'Otros';
}

function shouldTrackPageView(req: Request): boolean {
  if (!analyticsReady() || req.method !== 'GET') return false;

  const pathName = normalizePathname(req.originalUrl || req.url);
  const lowerPath = pathName.toLowerCase();
  if (
    lowerPath === '/admin'
    || lowerPath.startsWith('/admin/')
    || lowerPath === '/api'
    || lowerPath.startsWith('/api/')
    || lowerPath === '/gc-data'
    || lowerPath.startsWith('/gc-data/')
    || lowerPath.startsWith('/_astro/')
    || lowerPath.startsWith('/assets/')
    || lowerPath.startsWith('/images/')
    || lowerPath.startsWith('/videos/')
    || lowerPath.startsWith('/fonts/')
    || lowerPath === '/login'
    || lowerPath.startsWith('/recuperar-password')
    || lowerPath.startsWith('/registro')
    || lowerPath === '/robots.txt'
    || lowerPath === '/sitemap.xml'
    || lowerPath === '/favicon.ico'
    || STATIC_EXTENSION_PATTERN.test(lowerPath)
  ) {
    return false;
  }

  const accept = String(req.headers.accept || '');
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return false;

  const purpose = String(req.headers.purpose || req.headers['sec-purpose'] || '');
  if (/prefetch|prerender/i.test(purpose)) return false;

  const userAgent = String(req.headers['user-agent'] || '');
  return Boolean(userAgent && !BOT_PATTERN.test(userAgent));
}

function browserFamily(userAgent: string): string {
  if (/SamsungBrowser/i.test(userAgent)) return 'Samsung Internet';
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(userAgent)) return 'Safari';
  return 'Otro';
}

function deviceFamily(userAgent: string): string {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(userAgent)) return 'Móvil';
  return 'Escritorio';
}

function referrerInfo(req: Request): { host: string | null; source: string } {
  const raw = String(req.headers.referer || req.headers.referrer || '').trim();
  if (!raw) return { host: null, source: 'Directo' };

  try {
    const referrer = new URL(raw);
    const host = referrer.hostname.toLowerCase().replace(/^www\./, '').slice(0, 191);
    const currentHost = String(req.headers.host || '').toLowerCase().split(':')[0].replace(/^www\./, '');
    if (!host) return { host: null, source: 'Directo' };
    if (host === currentHost) return { host, source: INTERNAL_SOURCE };
    if (host.includes('google.')) return { host, source: 'Google' };
    if (host.includes('bing.')) return { host, source: 'Bing' };
    if (host.includes('discord.')) return { host, source: 'Discord' };
    if (host.includes('whatsapp.') || host === 'wa.me') return { host, source: 'WhatsApp' };
    if (host.includes('youtube.') || host === 'youtu.be') return { host, source: 'YouTube' };
    if (host.includes('facebook.') || host.includes('instagram.')) return { host, source: 'Meta' };
    if (host === 'x.com' || host.includes('twitter.')) return { host, source: 'X / Twitter' };
    return { host, source: host };
  } catch {
    return { host: null, source: 'Directo' };
  }
}

function requestNetworkKey(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return anonymizeIp(forwarded || req.ip || req.socket.remoteAddress || '');
}

function visitorHash(req: Request, dayKey: string, browser: string): string {
  return hmac(`daily|${dayKey}|${requestNetworkKey(req)}|${browser}`);
}

function visitorPeriodHash(req: Request, monthKey: string, browser: string): string {
  return hmac(`monthly|${monthKey}|${requestNetworkKey(req)}|${browser}`);
}

function registeredUserHashFromId(userId: unknown): string | null {
  const value = String(userId || '').trim();
  return value ? hmac(`registered-user|${value}`) : null;
}

function registeredUserHash(context: any): string | null {
  return registeredUserHashFromId(context?.user?.id);
}

function registeredSessionHash(context: any): string | null {
  const sessionId = String(context?.session?.id || '').trim();
  return sessionId ? hmac(`registered-session|${sessionId}`) : null;
}

function hasSessionCookie(req: Request): boolean {
  return /(?:^|;\s*)gc_session=/.test(String(req.headers.cookie || ''));
}

function buildRecord(req: Request): AnalyticsRecord {
  const now = new Date();
  const { dayKey, monthKey, hourOfDay } = dateParts(now);
  const userAgent = String(req.headers['user-agent'] || '');
  const browser = browserFamily(userAgent);
  const referrer = referrerInfo(req);
  const pathName = normalizePathname(req.originalUrl || req.url);

  return {
    occurredAt: now.toISOString(),
    dayKey,
    monthKey,
    hourOfDay,
    visitorHash: visitorHash(req, dayKey, browser),
    visitorPeriodHash: visitorPeriodHash(req, monthKey, browser),
    registeredUserHash: null,
    registeredSessionHash: null,
    path: pathName,
    area: pageArea(pathName),
    referrerHost: referrer.host,
    source: referrer.source,
    device: deviceFamily(userAgent),
    browser,
  };
}

function isDuplicatePageView(record: AnalyticsRecord): boolean {
  const windowMs = dedupSeconds() * 1000;
  if (windowMs <= 0) return false;

  const now = Date.now();
  const key = `${record.visitorHash}|${record.path}`;
  const previous = recentPageViews.get(key);
  recentPageViews.set(key, now);

  if (recentPageViews.size > 5000) {
    const cutoff = now - Math.max(windowMs * 2, 60000);
    for (const [entryKey, timestamp] of recentPageViews) {
      if (timestamp < cutoff) recentPageViews.delete(entryKey);
    }
  }

  return typeof previous === 'number' && now - previous < windowMs;
}

function mysqlDate(value: string): string {
  return value.slice(0, 23).replace('T', ' ');
}

async function getMysqlPool(): Promise<any> {
  if (mysqlPoolPromise) return mysqlPoolPromise;

  mysqlPoolPromise = (async () => {
    const mod: any = await import('mysql2/promise');
    const mysql = mod.default ?? mod;
    return mysql.createPool({
      host: process.env.MYSQL_HOST?.trim(),
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE?.trim(),
      user: process.env.MYSQL_USER?.trim(),
      password: process.env.MYSQL_PASSWORD ?? '',
      waitForConnections: true,
      connectionLimit: clampInteger(process.env.MYSQL_CONNECTION_LIMIT, 5, 1, 20),
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: true,
    });
  })();

  return mysqlPoolPromise;
}

function safeIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Identificador SQL no válido: ${value}`);
  return value;
}

async function mysqlColumnExists(pool: any, tableName: string, columnName: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function mysqlIndexExists(pool: any, tableName: string, indexName: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName],
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function ensureMysqlColumn(pool: any, tableName: string, columnName: string, definition: string): Promise<void> {
  if (await mysqlColumnExists(pool, tableName, columnName)) return;
  await pool.execute(`ALTER TABLE ${safeIdentifier(tableName)} ADD COLUMN ${safeIdentifier(columnName)} ${definition}`);
}

async function ensureMysqlIndex(pool: any, tableName: string, indexName: string, definition: string): Promise<void> {
  if (await mysqlIndexExists(pool, tableName, indexName)) return;
  await pool.execute(`CREATE INDEX ${safeIdentifier(indexName)} ON ${safeIdentifier(tableName)} ${definition}`);
}

function sqlAreaExpression(column = 'path'): string {
  return `CASE
    WHEN ${column} = '/' THEN 'Inicio'
    WHEN ${column} LIKE '/campeonato%' THEN 'Campeonato'
    WHEN ${column} LIKE '/live-timing%' OR ${column} LIKE '/live-test%' THEN 'Live timing'
    WHEN ${column} LIKE '/ratings%' THEN 'Ratings'
    WHEN ${column} LIKE '/perfil%' OR ${column} LIKE '/pilotos%' THEN 'Perfiles'
    WHEN ${column} LIKE '/calendario%' OR ${column} LIKE '/historico%' THEN 'Calendario'
    WHEN ${column} LIKE '/combos%' THEN 'Combos'
    WHEN ${column} LIKE '/carreras-comunidad%' THEN 'Comunidad'
    WHEN ${column} LIKE '/app%' OR ${column} LIKE '/gc-tools%' THEN 'GC Tools'
    ELSE 'Otros'
  END`;
}

async function backfillPermanentAggregates(pool: any): Promise<void> {
  const [metaRows]: any = await pool.query(
    `SELECT meta_value FROM gc_analytics_meta WHERE meta_key = 'permanent_aggregates_v1' LIMIT 1`,
  );
  if (metaRows?.[0]?.meta_value) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO gc_analytics_daily
        (day_key, views, registered_views, anonymous_views, first_recorded_at, last_recorded_at, updated_at)
      SELECT
        day_key,
        COUNT(*) AS views,
        SUM(registered_user_hash IS NOT NULL) AS registered_views,
        SUM(registered_user_hash IS NULL) AS anonymous_views,
        MIN(occurred_at),
        MAX(occurred_at),
        UTC_TIMESTAMP(3)
      FROM gc_analytics_pageviews
      GROUP BY day_key
      ON DUPLICATE KEY UPDATE
        views = VALUES(views),
        registered_views = VALUES(registered_views),
        anonymous_views = VALUES(anonymous_views),
        first_recorded_at = VALUES(first_recorded_at),
        last_recorded_at = VALUES(last_recorded_at),
        updated_at = UTC_TIMESTAMP(3)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_hourly
        (day_key, hour_of_day, views, registered_views, anonymous_views, updated_at)
      SELECT
        day_key,
        hour_of_day,
        COUNT(*) AS views,
        SUM(registered_user_hash IS NOT NULL),
        SUM(registered_user_hash IS NULL),
        UTC_TIMESTAMP(3)
      FROM gc_analytics_pageviews
      GROUP BY day_key, hour_of_day
      ON DUPLICATE KEY UPDATE
        views = VALUES(views),
        registered_views = VALUES(registered_views),
        anonymous_views = VALUES(anonymous_views),
        updated_at = UTC_TIMESTAMP(3)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_daily_visitors
        (day_key, visitor_hash, first_seen_at, last_seen_at, views)
      SELECT day_key, visitor_hash, MIN(occurred_at), MAX(occurred_at), COUNT(*)
      FROM gc_analytics_pageviews
      GROUP BY day_key, visitor_hash
      ON DUPLICATE KEY UPDATE
        first_seen_at = LEAST(first_seen_at, VALUES(first_seen_at)),
        last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
        views = VALUES(views)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_period_visitors
        (day_key, month_key, visitor_period_hash, first_seen_at, last_seen_at, views)
      SELECT day_key, LEFT(day_key, 7), visitor_period_hash, MIN(occurred_at), MAX(occurred_at), COUNT(*)
      FROM gc_analytics_pageviews
      WHERE visitor_period_hash IS NOT NULL
      GROUP BY day_key, LEFT(day_key, 7), visitor_period_hash
      ON DUPLICATE KEY UPDATE
        first_seen_at = LEAST(first_seen_at, VALUES(first_seen_at)),
        last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
        views = VALUES(views)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_dimension_daily
        (day_key, dimension_type, dimension_key, views, updated_at)
      SELECT day_key, dimension_type, dimension_key, COUNT(*), UTC_TIMESTAMP(3)
      FROM (
        SELECT day_key, 'path' AS dimension_type, path AS dimension_key FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'source', source FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'device', device FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'browser', browser FROM gc_analytics_pageviews
      ) dimensions
      GROUP BY day_key, dimension_type, dimension_key
      ON DUPLICATE KEY UPDATE views = VALUES(views), updated_at = UTC_TIMESTAMP(3)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_dimension_visitors
        (day_key, dimension_type, dimension_key_hash, dimension_key, visitor_hash)
      SELECT DISTINCT
        day_key,
        dimension_type,
        SHA2(CONCAT(dimension_type, '|', dimension_key), 256),
        dimension_key,
        visitor_hash
      FROM (
        SELECT day_key, 'path' AS dimension_type, path AS dimension_key, visitor_hash FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'source', source, visitor_hash FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'device', device, visitor_hash FROM gc_analytics_pageviews
        UNION ALL
        SELECT day_key, 'browser', browser, visitor_hash FROM gc_analytics_pageviews
      ) dimensions
      ON DUPLICATE KEY UPDATE dimension_key = VALUES(dimension_key)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_user_daily
        (day_key, user_hash, views, first_seen_at, last_seen_at, updated_at)
      SELECT day_key, registered_user_hash, COUNT(*), MIN(occurred_at), MAX(occurred_at), UTC_TIMESTAMP(3)
      FROM gc_analytics_pageviews
      WHERE registered_user_hash IS NOT NULL
      GROUP BY day_key, registered_user_hash
      ON DUPLICATE KEY UPDATE
        views = VALUES(views),
        first_seen_at = VALUES(first_seen_at),
        last_seen_at = VALUES(last_seen_at),
        updated_at = UTC_TIMESTAMP(3)
    `);

    await connection.query(`
      INSERT INTO gc_analytics_user_area_daily
        (day_key, user_hash, area, views, updated_at)
      SELECT
        day_key,
        registered_user_hash,
        ${sqlAreaExpression('path')} AS area,
        COUNT(*),
        UTC_TIMESTAMP(3)
      FROM gc_analytics_pageviews
      WHERE registered_user_hash IS NOT NULL
      GROUP BY day_key, registered_user_hash, ${sqlAreaExpression('path')}
      ON DUPLICATE KEY UPDATE views = VALUES(views), updated_at = UTC_TIMESTAMP(3)
    `);

    await connection.query(
      `INSERT INTO gc_analytics_meta (meta_key, meta_value, updated_at)
       VALUES ('permanent_aggregates_v1', ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), updated_at = UTC_TIMESTAMP(3)`,
      [new Date().toISOString()],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureMysqlSchema(): Promise<void> {
  if (mysqlSchemaPromise) return mysqlSchemaPromise;

  mysqlSchemaPromise = (async () => {
    const pool = await getMysqlPool();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_pageviews (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        occurred_at DATETIME(3) NOT NULL,
        day_key DATE NOT NULL,
        hour_of_day TINYINT UNSIGNED NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        visitor_period_hash CHAR(64) NULL,
        registered_user_hash CHAR(64) NULL,
        registered_session_hash CHAR(64) NULL,
        path VARCHAR(300) NOT NULL,
        area VARCHAR(40) NOT NULL DEFAULT 'Otros',
        referrer_host VARCHAR(191) NULL,
        source VARCHAR(191) NOT NULL,
        device VARCHAR(24) NOT NULL,
        browser VARCHAR(40) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_gc_analytics_occurred_at (occurred_at),
        INDEX idx_gc_analytics_day_key (day_key),
        INDEX idx_gc_analytics_path (path),
        INDEX idx_gc_analytics_visitor_day (day_key, visitor_hash),
        INDEX idx_gc_analytics_period_visitor (day_key, visitor_period_hash),
        INDEX idx_gc_analytics_registered_user (day_key, registered_user_hash),
        INDEX idx_gc_analytics_registered_session (day_key, registered_session_hash),
        INDEX idx_gc_analytics_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureMysqlColumn(pool, 'gc_analytics_pageviews', 'visitor_period_hash', 'CHAR(64) NULL AFTER visitor_hash');
    await ensureMysqlColumn(pool, 'gc_analytics_pageviews', 'registered_user_hash', 'CHAR(64) NULL AFTER visitor_period_hash');
    await ensureMysqlColumn(pool, 'gc_analytics_pageviews', 'registered_session_hash', 'CHAR(64) NULL AFTER registered_user_hash');
    await ensureMysqlColumn(pool, 'gc_analytics_pageviews', 'area', "VARCHAR(40) NOT NULL DEFAULT 'Otros' AFTER path");
    await ensureMysqlIndex(pool, 'gc_analytics_pageviews', 'idx_gc_analytics_period_visitor', '(day_key, visitor_period_hash)');
    await ensureMysqlIndex(pool, 'gc_analytics_pageviews', 'idx_gc_analytics_registered_user', '(day_key, registered_user_hash)');
    await ensureMysqlIndex(pool, 'gc_analytics_pageviews', 'idx_gc_analytics_registered_session', '(day_key, registered_session_hash)');

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_meta (
        meta_key VARCHAR(80) NOT NULL PRIMARY KEY,
        meta_value TEXT NULL,
        updated_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_daily (
        day_key DATE NOT NULL PRIMARY KEY,
        views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        registered_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        anonymous_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        first_recorded_at DATETIME(3) NULL,
        last_recorded_at DATETIME(3) NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_gc_analytics_daily_last (last_recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_hourly (
        day_key DATE NOT NULL,
        hour_of_day TINYINT UNSIGNED NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        registered_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        anonymous_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (day_key, hour_of_day)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_daily_visitors (
        day_key DATE NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        first_seen_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 1,
        PRIMARY KEY (day_key, visitor_hash),
        INDEX idx_gc_analytics_daily_visitors_last (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_period_visitors (
        day_key DATE NOT NULL,
        month_key CHAR(7) NOT NULL,
        visitor_period_hash CHAR(64) NOT NULL,
        first_seen_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 1,
        PRIMARY KEY (day_key, visitor_period_hash),
        INDEX idx_gc_analytics_period_month (month_key, visitor_period_hash),
        INDEX idx_gc_analytics_period_last (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_dimension_daily (
        day_key DATE NOT NULL,
        dimension_type VARCHAR(20) NOT NULL,
        dimension_key VARCHAR(300) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (day_key, dimension_type, dimension_key),
        INDEX idx_gc_analytics_dimension_type (dimension_type, day_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_dimension_visitors (
        day_key DATE NOT NULL,
        dimension_type VARCHAR(20) NOT NULL,
        dimension_key_hash CHAR(64) NOT NULL,
        dimension_key VARCHAR(300) NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        PRIMARY KEY (day_key, dimension_type, dimension_key_hash, visitor_hash),
        INDEX idx_gc_analytics_dimension_visitors_lookup (dimension_type, day_key, dimension_key_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_user_daily (
        day_key DATE NOT NULL,
        user_hash CHAR(64) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        first_seen_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (day_key, user_hash),
        INDEX idx_gc_analytics_user_daily_user (user_hash, day_key),
        INDEX idx_gc_analytics_user_daily_last (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_user_area_daily (
        day_key DATE NOT NULL,
        user_hash CHAR(64) NOT NULL,
        area VARCHAR(40) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (day_key, user_hash, area),
        INDEX idx_gc_analytics_user_area_user (user_hash, day_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS gc_analytics_user_sessions (
        day_key DATE NOT NULL,
        user_hash CHAR(64) NOT NULL,
        session_hash CHAR(64) NOT NULL,
        first_seen_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        views BIGINT UNSIGNED NOT NULL DEFAULT 1,
        PRIMARY KEY (day_key, user_hash, session_hash),
        INDEX idx_gc_analytics_user_sessions_user (user_hash, day_key),
        INDEX idx_gc_analytics_user_sessions_last (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`UPDATE gc_analytics_pageviews SET area = ${sqlAreaExpression('path')} WHERE area IS NULL OR area = '' OR area = 'Otros'`);
    await backfillPermanentAggregates(pool);
  })();

  return mysqlSchemaPromise;
}

async function pruneMysqlIfNeeded(): Promise<void> {
  const days = rawRetentionDays();
  if (days === 0) return;

  const now = Date.now();
  if (now - lastPruneAt < 6 * 60 * 60 * 1000) return;
  lastPruneAt = now;
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  await pool.execute(
    'DELETE FROM gc_analytics_pageviews WHERE occurred_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)',
    [days],
  );
  analyticsRuntimeHealth.lastPruneAt = new Date().toISOString();
}

async function upsertDimension(connection: any, record: AnalyticsRecord, type: typeof DIMENSION_TYPES[number], key: string): Promise<void> {
  const normalizedKey = String(key || 'Sin dato').slice(0, 300);
  const keyHash = crypto.createHash('sha256').update(`${type}|${normalizedKey}`).digest('hex');

  await connection.execute(
    `INSERT INTO gc_analytics_dimension_daily
      (day_key, dimension_type, dimension_key, views, updated_at)
     VALUES (?, ?, ?, 1, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE views = views + 1, updated_at = UTC_TIMESTAMP(3)`,
    [record.dayKey, type, normalizedKey],
  );

  await connection.execute(
    `INSERT IGNORE INTO gc_analytics_dimension_visitors
      (day_key, dimension_type, dimension_key_hash, dimension_key, visitor_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [record.dayKey, type, keyHash, normalizedKey, record.visitorHash],
  );
}

async function recordMysql(record: AnalyticsRecord): Promise<void> {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO gc_analytics_pageviews
        (occurred_at, day_key, hour_of_day, visitor_hash, visitor_period_hash,
         registered_user_hash, registered_session_hash, path, area, referrer_host, source, device, browser)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mysqlDate(record.occurredAt),
        record.dayKey,
        record.hourOfDay,
        record.visitorHash,
        record.visitorPeriodHash,
        record.registeredUserHash,
        record.registeredSessionHash,
        record.path,
        record.area,
        record.referrerHost,
        record.source,
        record.device,
        record.browser,
      ],
    );

    await connection.execute(
      `INSERT INTO gc_analytics_daily
        (day_key, views, registered_views, anonymous_views, first_recorded_at, last_recorded_at, updated_at)
       VALUES (?, 1, ?, ?, ?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         views = views + 1,
         registered_views = registered_views + VALUES(registered_views),
         anonymous_views = anonymous_views + VALUES(anonymous_views),
         first_recorded_at = LEAST(first_recorded_at, VALUES(first_recorded_at)),
         last_recorded_at = GREATEST(last_recorded_at, VALUES(last_recorded_at)),
         updated_at = UTC_TIMESTAMP(3)`,
      [
        record.dayKey,
        record.registeredUserHash ? 1 : 0,
        record.registeredUserHash ? 0 : 1,
        mysqlDate(record.occurredAt),
        mysqlDate(record.occurredAt),
      ],
    );

    await connection.execute(
      `INSERT INTO gc_analytics_hourly
        (day_key, hour_of_day, views, registered_views, anonymous_views, updated_at)
       VALUES (?, ?, 1, ?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         views = views + 1,
         registered_views = registered_views + VALUES(registered_views),
         anonymous_views = anonymous_views + VALUES(anonymous_views),
         updated_at = UTC_TIMESTAMP(3)`,
      [
        record.dayKey,
        record.hourOfDay,
        record.registeredUserHash ? 1 : 0,
        record.registeredUserHash ? 0 : 1,
      ],
    );

    await connection.execute(
      `INSERT INTO gc_analytics_daily_visitors
        (day_key, visitor_hash, first_seen_at, last_seen_at, views)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), views = views + 1`,
      [record.dayKey, record.visitorHash, mysqlDate(record.occurredAt), mysqlDate(record.occurredAt)],
    );

    await connection.execute(
      `INSERT INTO gc_analytics_period_visitors
        (day_key, month_key, visitor_period_hash, first_seen_at, last_seen_at, views)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), views = views + 1`,
      [
        record.dayKey,
        record.monthKey,
        record.visitorPeriodHash,
        mysqlDate(record.occurredAt),
        mysqlDate(record.occurredAt),
      ],
    );

    await upsertDimension(connection, record, 'path', record.path);
    await upsertDimension(connection, record, 'source', record.source);
    await upsertDimension(connection, record, 'device', record.device);
    await upsertDimension(connection, record, 'browser', record.browser);

    if (record.registeredUserHash) {
      await connection.execute(
        `INSERT INTO gc_analytics_user_daily
          (day_key, user_hash, views, first_seen_at, last_seen_at, updated_at)
         VALUES (?, ?, 1, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           views = views + 1,
           last_seen_at = VALUES(last_seen_at),
           updated_at = UTC_TIMESTAMP(3)`,
        [
          record.dayKey,
          record.registeredUserHash,
          mysqlDate(record.occurredAt),
          mysqlDate(record.occurredAt),
        ],
      );

      await connection.execute(
        `INSERT INTO gc_analytics_user_area_daily
          (day_key, user_hash, area, views, updated_at)
         VALUES (?, ?, ?, 1, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE views = views + 1, updated_at = UTC_TIMESTAMP(3)`,
        [record.dayKey, record.registeredUserHash, record.area],
      );

      if (record.registeredSessionHash) {
        await connection.execute(
          `INSERT INTO gc_analytics_user_sessions
            (day_key, user_hash, session_hash, first_seen_at, last_seen_at, views)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), views = views + 1`,
          [
            record.dayKey,
            record.registeredUserHash,
            record.registeredSessionHash,
            mysqlDate(record.occurredAt),
            mysqlDate(record.occurredAt),
          ],
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await pruneMysqlIfNeeded();
}

function ensureFileParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function recordFile(rootDir: string, record: AnalyticsRecord): Promise<void> {
  const filePath = analyticsFilePath(rootDir);
  ensureFileParent(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

async function recordPageView(rootDir: string, record: AnalyticsRecord): Promise<void> {
  const driver = storageDriver();
  if (driver === 'mysql') return recordMysql(record);
  if (driver === 'file') return recordFile(rootDir, record);
}

function readFileRecords(rootDir: string): AnalyticsRecord[] {
  const filePath = analyticsFilePath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
  const records: AnalyticsRecord[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<AnalyticsRecord>;
      const occurredAt = String(parsed.occurredAt || '');
      const dayKey = String(parsed.dayKey || occurredAt.slice(0, 10));
      if (!Date.parse(occurredAt) || !dayKey) continue;
      records.push({
        occurredAt,
        dayKey,
        monthKey: String(parsed.monthKey || dayKey.slice(0, 7)),
        hourOfDay: clampInteger(parsed.hourOfDay, 0, 0, 23),
        visitorHash: String(parsed.visitorHash || ''),
        visitorPeriodHash: String(parsed.visitorPeriodHash || ''),
        registeredUserHash: parsed.registeredUserHash ? String(parsed.registeredUserHash) : null,
        registeredSessionHash: parsed.registeredSessionHash ? String(parsed.registeredSessionHash) : null,
        path: String(parsed.path || '/'),
        area: String(parsed.area || pageArea(String(parsed.path || '/'))),
        referrerHost: parsed.referrerHost ? String(parsed.referrerHost) : null,
        source: String(parsed.source || 'Directo'),
        device: String(parsed.device || 'Otro'),
        browser: String(parsed.browser || 'Otro'),
      });
    } catch {
      // Ignora líneas dañadas.
    }
  }

  return records;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function totalsFor(records: AnalyticsRecord[]): { views: number; visitors: number } {
  return {
    views: records.length,
    visitors: new Set(records.map((record) => `${record.dayKey}:${record.visitorHash}`)).size,
  };
}

function inBounds(dayKey: string, bounds: Pick<PeriodBounds, 'from' | 'to'>): boolean {
  return dayKey >= bounds.from && dayKey <= bounds.to;
}

function aggregateRows(records: AnalyticsRecord[], keyGetter: (record: AnalyticsRecord) => string): AnalyticsSummaryRow[] {
  const groups = new Map<string, { views: number; visitors: Set<string> }>();
  for (const record of records) {
    const key = keyGetter(record) || 'Sin dato';
    const current = groups.get(key) || { views: 0, visitors: new Set<string>() };
    current.views += 1;
    current.visitors.add(`${record.dayKey}:${record.visitorHash}`);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, views: value.views, visitors: value.visitors.size }))
    .sort((left, right) => right.views - left.views);
}

function publicAccount(user: any): {
  id: string;
  email: string;
  displayName: string;
  role: string;
  pilotName: string | null;
  teamName: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  disabled: boolean;
  deleted: boolean;
} {
  return {
    id: String(user?.id || ''),
    email: String(user?.email || ''),
    displayName: String(user?.displayName || user?.display_name || user?.email || 'Cuenta'),
    role: String(user?.role || 'pilot'),
    pilotName: user?.pilotLink?.strackerName || user?.pilot_stracker_name || null,
    teamName: user?.team?.name || user?.team_name || null,
    createdAt: user?.createdAt || user?.created_at || null,
    lastLoginAt: user?.lastLoginAt || user?.last_login_at || null,
    disabled: Boolean(user?.disabledAt || user?.disabled_at),
    deleted: Boolean(user?.deletedAt || user?.deleted_at),
  };
}

async function currentUsers(getUserStore?: GetUserStore): Promise<any[]> {
  if (!getUserStore) return [];
  const store = await getUserStore();
  return Array.isArray(store?.users) ? store.users : [];
}

function emptySummary(range: RequestedRange): AnalyticsSummary {
  const secret = analyticsHashSecretInfo();
  const bounds = resolveBounds(range, null);
  return {
    ok: true,
    enabled: analyticsEnabled(),
    ready: analyticsReady(),
    storage: storageDriver(),
    generatedAt: new Date().toISOString(),
    timeZone: analyticsTimeZone(),
    rawRetentionDays: rawRetentionDays(),
    historyMode: 'permanent-aggregates',
    activeMinutes: activeMinutes(),
    dedupSeconds: dedupSeconds(),
    period: bounds,
    totals: {
      today: { views: 0, visitors: 0 },
      last7Days: { views: 0, visitors: 0 },
      last30Days: { views: 0, visitors: 0 },
      selectedPeriod: {
        views: 0,
        visitors: 0,
        estimatedUniqueVisitors: 0,
        registeredUsers: 0,
        registeredViews: 0,
        anonymousViews: 0,
        registeredSessions: 0,
      },
      activeNow: 0,
    },
    comparison: {
      available: !bounds.all,
      current: { views: 0, visitors: 0 },
      previous: { views: 0, visitors: 0 },
      changePercent: { views: 0, visitors: 0 },
    },
    accounts: {
      total: 0,
      activeToday: 0,
      active7Days: 0,
      active30Days: 0,
      inactive30Days: 0,
      measuredAllTime: 0,
      trackingStartedAt: null,
    },
    daily: [],
    hourly: [],
    topPages: [],
    referrers: [],
    devices: [],
    browsers: [],
    health: {
      startedAt: analyticsRuntimeHealth.startedAt,
      storage: storageDriver(),
      secretConfigured: secret.configured,
      secretValid: secret.valid,
      secretLength: secret.length,
      rawStoredRows: 0,
      aggregateViews: 0,
      historyStartedAt: null,
      latestRecordAt: null,
      accountTrackingStartedAt: null,
      lastAttemptAt: analyticsRuntimeHealth.lastAttemptAt,
      lastRecordedAt: analyticsRuntimeHealth.lastRecordedAt,
      lastErrorAt: analyticsRuntimeHealth.lastErrorAt,
      lastError: analyticsRuntimeHealth.lastError,
      lastPruneAt: analyticsRuntimeHealth.lastPruneAt,
      recordedSinceStart: analyticsRuntimeHealth.recordedSinceStart,
      dedupedSinceStart: analyticsRuntimeHealth.dedupedSinceStart,
    },
    privacy: {
      cookies: false,
      localStorage: false,
      storesIp: false,
      storesQueryString: false,
      visitorHashRotatesDaily: true,
      visitorPeriodHashRotatesMonthly: true,
      registeredUsersAreHashed: true,
      storesUserIdentityInAnalytics: false,
      reloadDeduplication: true,
      accountUsageIsAggregated: true,
    },
  };
}

async function mysqlEarliestDay(): Promise<string | null> {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const [rows]: any = await pool.query(`SELECT DATE_FORMAT(MIN(day_key), '%Y-%m-%d') AS first_day FROM gc_analytics_daily`);
  return rows?.[0]?.first_day || null;
}

async function mysqlPeriodTotals(bounds: Pick<PeriodBounds, 'from' | 'to'>): Promise<{
  views: number;
  visitors: number;
  registeredViews: number;
  anonymousViews: number;
  estimatedUniqueVisitors: number;
  registeredUsers: number;
  registeredSessions: number;
}> {
  const pool = await getMysqlPool();

  const [dailyRows]: any = await pool.query(
    `SELECT
       COALESCE(SUM(views), 0) AS views,
       COALESCE(SUM(registered_views), 0) AS registered_views,
       COALESCE(SUM(anonymous_views), 0) AS anonymous_views
     FROM gc_analytics_daily
     WHERE day_key BETWEEN ? AND ?`,
    [bounds.from, bounds.to],
  );

  const [visitorRows]: any = await pool.query(
    `SELECT COUNT(*) AS visitors
     FROM gc_analytics_daily_visitors
     WHERE day_key BETWEEN ? AND ?`,
    [bounds.from, bounds.to],
  );

  const [uniqueRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT visitor_period_hash) AS estimated_unique_visitors
     FROM gc_analytics_period_visitors
     WHERE day_key BETWEEN ? AND ?`,
    [bounds.from, bounds.to],
  );

  const [userRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT user_hash) AS registered_users
     FROM gc_analytics_user_daily
     WHERE day_key BETWEEN ? AND ?`,
    [bounds.from, bounds.to],
  );

  const [sessionRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT session_hash) AS registered_sessions
     FROM gc_analytics_user_sessions
     WHERE day_key BETWEEN ? AND ?`,
    [bounds.from, bounds.to],
  );

  return {
    views: toCount(dailyRows?.[0]?.views),
    visitors: toCount(visitorRows?.[0]?.visitors),
    registeredViews: toCount(dailyRows?.[0]?.registered_views),
    anonymousViews: toCount(dailyRows?.[0]?.anonymous_views),
    estimatedUniqueVisitors: toCount(uniqueRows?.[0]?.estimated_unique_visitors),
    registeredUsers: toCount(userRows?.[0]?.registered_users),
    registeredSessions: toCount(sessionRows?.[0]?.registered_sessions),
  };
}

async function mysqlDimensionRows(
  type: typeof DIMENSION_TYPES[number],
  bounds: Pick<PeriodBounds, 'from' | 'to'>,
  limit = 20,
): Promise<AnalyticsSummaryRow[]> {
  const pool = await getMysqlPool();
  const [viewRows]: any = await pool.query(
    `SELECT dimension_key, SUM(views) AS views
     FROM gc_analytics_dimension_daily
     WHERE dimension_type = ? AND day_key BETWEEN ? AND ?
     GROUP BY dimension_key
     ORDER BY views DESC
     LIMIT ?`,
    [type, bounds.from, bounds.to, limit],
  );

  const keys = (viewRows || []).map((row: any) => String(row.dimension_key));
  if (!keys.length) return [];

  const placeholders = keys.map(() => '?').join(',');
  const [visitorRows]: any = await pool.query(
    `SELECT dimension_key, COUNT(*) AS visitors
     FROM gc_analytics_dimension_visitors
     WHERE dimension_type = ?
       AND day_key BETWEEN ? AND ?
       AND dimension_key IN (${placeholders})
     GROUP BY dimension_key`,
    [type, bounds.from, bounds.to, ...keys],
  );

  const visitorMap = new Map(
    (visitorRows || []).map((row: any) => [String(row.dimension_key), toCount(row.visitors)]),
  );

  return (viewRows || []).map((row: any) => ({
    key: String(row.dimension_key),
    views: toCount(row.views),
    visitors: visitorMap.get(String(row.dimension_key)) || 0,
  }));
}

async function accountStatusMysql(users: any[]): Promise<AnalyticsSummary['accounts']> {
  const pool = await getMysqlPool();
  const today = dateParts().dayKey;
  const from7 = shiftDayKey(today, -6);
  const from30 = shiftDayKey(today, -29);
  const currentHashes = new Set(
    users
      .filter((user) => !publicAccount(user).deleted)
      .map((user) => registeredUserHashFromId(user?.id))
      .filter(Boolean),
  );

  const [rows]: any = await pool.query(
    `SELECT
       user_hash,
       DATE_FORMAT(MAX(day_key), '%Y-%m-%d') AS last_day,
       DATE_FORMAT(MIN(first_seen_at), '%Y-%m-%dT%H:%i:%s.000Z') AS first_seen_at
     FROM gc_analytics_user_daily
     GROUP BY user_hash`,
  );

  const measured = (rows || []).filter((row: any) => currentHashes.has(String(row.user_hash)));
  const activeToday = measured.filter((row: any) => String(row.last_day) >= today).length;
  const active7Days = measured.filter((row: any) => String(row.last_day) >= from7).length;
  const active30Days = measured.filter((row: any) => String(row.last_day) >= from30).length;
  const trackingStartedAt = measured
    .map((row: any) => String(row.first_seen_at || ''))
    .filter(Boolean)
    .sort()[0] || null;

  return {
    total: currentHashes.size,
    activeToday,
    active7Days,
    active30Days,
    inactive30Days: Math.max(0, currentHashes.size - active30Days),
    measuredAllTime: measured.length,
    trackingStartedAt,
  };
}

async function mysqlSummary(range: RequestedRange, getUserStore?: GetUserStore): Promise<AnalyticsSummary> {
  await ensureMysqlSchema();
  const earliest = await mysqlEarliestDay();
  const bounds = resolveBounds(range, earliest);
  const summary = emptySummary(range);
  summary.period = bounds;

  const selected = await mysqlPeriodTotals(bounds);
  summary.totals.selectedPeriod = selected;

  const today = dateParts().dayKey;
  const todayTotals = await mysqlPeriodTotals({ from: today, to: today });
  const last7Totals = await mysqlPeriodTotals({ from: shiftDayKey(today, -6), to: today });
  const last30Totals = await mysqlPeriodTotals({ from: shiftDayKey(today, -29), to: today });
  summary.totals.today = { views: todayTotals.views, visitors: todayTotals.visitors };
  summary.totals.last7Days = { views: last7Totals.views, visitors: last7Totals.visitors };
  summary.totals.last30Days = { views: last30Totals.views, visitors: last30Totals.visitors };

  const pool = await getMysqlPool();
  const [activeRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT visitor_hash) AS active_now
     FROM gc_analytics_pageviews
     WHERE occurred_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)`,
    [activeMinutes()],
  );
  summary.totals.activeNow = toCount(activeRows?.[0]?.active_now);

  summary.comparison.current = { views: selected.views, visitors: selected.visitors };
  if (bounds.previousFrom && bounds.previousTo) {
    const previous = await mysqlPeriodTotals({ from: bounds.previousFrom, to: bounds.previousTo });
    summary.comparison.available = true;
    summary.comparison.previous = { views: previous.views, visitors: previous.visitors };
    summary.comparison.changePercent = {
      views: percentageChange(selected.views, previous.views),
      visitors: percentageChange(selected.visitors, previous.visitors),
    };
  } else {
    summary.comparison.available = false;
    summary.comparison.changePercent = { views: null, visitors: null };
  }

  const [dailyRows]: any = await pool.query(
    `SELECT
       DATE_FORMAT(d.day_key, '%Y-%m-%d') AS day,
       d.views,
       d.registered_views,
       COUNT(v.visitor_hash) AS visitors
     FROM gc_analytics_daily d
     LEFT JOIN gc_analytics_daily_visitors v ON v.day_key = d.day_key
     WHERE d.day_key BETWEEN ? AND ?
     GROUP BY d.day_key, d.views, d.registered_views
     ORDER BY d.day_key ASC`,
    [bounds.from, bounds.to],
  );
  summary.daily = (dailyRows || []).map((row: any) => ({
    day: String(row.day),
    views: toCount(row.views),
    visitors: toCount(row.visitors),
    registeredViews: toCount(row.registered_views),
  }));

  const [hourlyRows]: any = await pool.query(
    `SELECT
       hour_of_day AS hour,
       SUM(views) AS views,
       SUM(registered_views) AS registered_views
     FROM gc_analytics_hourly
     WHERE day_key BETWEEN ? AND ?
     GROUP BY hour_of_day
     ORDER BY hour_of_day ASC`,
    [bounds.from, bounds.to],
  );
  summary.hourly = (hourlyRows || []).map((row: any) => ({
    hour: toCount(row.hour),
    views: toCount(row.views),
    registeredViews: toCount(row.registered_views),
  }));

  summary.topPages = await mysqlDimensionRows('path', bounds, 20);
  summary.referrers = (await mysqlDimensionRows('source', bounds, 20))
    .filter((row) => row.key !== INTERNAL_SOURCE);
  summary.devices = await mysqlDimensionRows('device', bounds, 20);
  summary.browsers = await mysqlDimensionRows('browser', bounds, 20);

  const users = await currentUsers(getUserStore);
  summary.accounts = await accountStatusMysql(users);

  const [healthRows]: any = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM gc_analytics_pageviews) AS raw_rows,
      (SELECT COALESCE(SUM(views), 0) FROM gc_analytics_daily) AS aggregate_views,
      (SELECT DATE_FORMAT(MIN(day_key), '%Y-%m-%d') FROM gc_analytics_daily) AS history_started_at,
      (SELECT DATE_FORMAT(MAX(last_recorded_at), '%Y-%m-%dT%H:%i:%s.000Z') FROM gc_analytics_daily) AS latest_record_at,
      (SELECT DATE_FORMAT(MIN(first_seen_at), '%Y-%m-%dT%H:%i:%s.000Z') FROM gc_analytics_user_daily) AS account_tracking_started_at
  `);
  const health = healthRows?.[0] || {};
  summary.health.rawStoredRows = toCount(health.raw_rows);
  summary.health.aggregateViews = toCount(health.aggregate_views);
  summary.health.historyStartedAt = health.history_started_at || null;
  summary.health.latestRecordAt = health.latest_record_at || null;
  summary.health.accountTrackingStartedAt = health.account_tracking_started_at || null;

  return summary;
}

function fileBounds(records: AnalyticsRecord[], range: RequestedRange): PeriodBounds {
  const earliest = records.map((record) => record.dayKey).filter(Boolean).sort()[0] || null;
  return resolveBounds(range, earliest);
}

function fileAccountStatus(records: AnalyticsRecord[], users: any[]): AnalyticsSummary['accounts'] {
  const registered = records.filter((record) => Boolean(record.registeredUserHash));
  const today = dateParts().dayKey;
  const from7 = shiftDayKey(today, -6);
  const from30 = shiftDayKey(today, -29);
  const hashes = (from: string, to: string) => new Set(
    registered.filter((record) => record.dayKey >= from && record.dayKey <= to)
      .map((record) => record.registeredUserHash),
  ).size;
  const total = users.filter((user) => !publicAccount(user).deleted).length;
  const active30 = hashes(from30, today);

  return {
    total,
    activeToday: hashes(today, today),
    active7Days: hashes(from7, today),
    active30Days: active30,
    inactive30Days: Math.max(0, total - active30),
    measuredAllTime: new Set(registered.map((record) => record.registeredUserHash)).size,
    trackingStartedAt: registered.map((record) => record.occurredAt).sort()[0] || null,
  };
}

async function fileSummary(rootDir: string, range: RequestedRange, getUserStore?: GetUserStore): Promise<AnalyticsSummary> {
  const records = readFileRecords(rootDir);
  const bounds = fileBounds(records, range);
  const summary = emptySummary(range);
  summary.period = bounds;

  const selected = records.filter((record) => inBounds(record.dayKey, bounds));
  const selectedTotals = totalsFor(selected);
  summary.totals.selectedPeriod = {
    ...selectedTotals,
    estimatedUniqueVisitors: new Set(selected.map((record) => record.visitorPeriodHash).filter(Boolean)).size,
    registeredUsers: new Set(selected.map((record) => record.registeredUserHash).filter(Boolean)).size,
    registeredViews: selected.filter((record) => Boolean(record.registeredUserHash)).length,
    anonymousViews: selected.filter((record) => !record.registeredUserHash).length,
    registeredSessions: new Set(selected.map((record) => record.registeredSessionHash).filter(Boolean)).size,
  };

  const today = dateParts().dayKey;
  const periodTotal = (from: string, to: string) => totalsFor(
    records.filter((record) => record.dayKey >= from && record.dayKey <= to),
  );
  summary.totals.today = periodTotal(today, today);
  summary.totals.last7Days = periodTotal(shiftDayKey(today, -6), today);
  summary.totals.last30Days = periodTotal(shiftDayKey(today, -29), today);
  summary.totals.activeNow = new Set(
    records.filter((record) => Date.parse(record.occurredAt) >= Date.now() - activeMinutes() * 60000)
      .map((record) => record.visitorHash),
  ).size;

  summary.comparison.current = {
    views: summary.totals.selectedPeriod.views,
    visitors: summary.totals.selectedPeriod.visitors,
  };
  if (bounds.previousFrom && bounds.previousTo) {
    const previous = periodTotal(bounds.previousFrom, bounds.previousTo);
    summary.comparison.available = true;
    summary.comparison.previous = previous;
    summary.comparison.changePercent = {
      views: percentageChange(summary.comparison.current.views, previous.views),
      visitors: percentageChange(summary.comparison.current.visitors, previous.visitors),
    };
  } else {
    summary.comparison.available = false;
    summary.comparison.changePercent = { views: null, visitors: null };
  }

  const daily = new Map<string, AnalyticsRecord[]>();
  for (const record of selected) {
    const bucket = daily.get(record.dayKey) || [];
    bucket.push(record);
    daily.set(record.dayKey, bucket);
  }
  summary.daily = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => ({
    day,
    ...totalsFor(rows),
    registeredViews: rows.filter((row) => Boolean(row.registeredUserHash)).length,
  }));

  const hourly = new Map<number, AnalyticsRecord[]>();
  for (const record of selected) {
    const bucket = hourly.get(record.hourOfDay) || [];
    bucket.push(record);
    hourly.set(record.hourOfDay, bucket);
  }
  summary.hourly = [...hourly.entries()].sort(([a], [b]) => a - b).map(([hour, rows]) => ({
    hour,
    views: rows.length,
    registeredViews: rows.filter((row) => Boolean(row.registeredUserHash)).length,
  }));

  summary.topPages = aggregateRows(selected, (record) => record.path).slice(0, 20);
  summary.referrers = aggregateRows(selected.filter((record) => record.source !== INTERNAL_SOURCE), (record) => record.source).slice(0, 20);
  summary.devices = aggregateRows(selected, (record) => record.device);
  summary.browsers = aggregateRows(selected, (record) => record.browser);

  const users = await currentUsers(getUserStore);
  summary.accounts = fileAccountStatus(records, users);
  summary.health.rawStoredRows = records.length;
  summary.health.aggregateViews = records.length;
  summary.health.historyStartedAt = records.map((record) => record.dayKey).sort()[0] || null;
  summary.health.latestRecordAt = records.map((record) => record.occurredAt).sort().at(-1) || null;
  summary.health.accountTrackingStartedAt = records
    .filter((record) => record.registeredUserHash)
    .map((record) => record.occurredAt)
    .sort()[0] || null;

  return summary;
}

async function loadSummary(rootDir: string, range: RequestedRange, getUserStore?: GetUserStore): Promise<AnalyticsSummary> {
  if (!analyticsEnabled()) return emptySummary(range);
  if (!analyticsReady()) return emptySummary(range);
  if (storageDriver() === 'mysql') return mysqlSummary(range, getUserStore);
  return fileSummary(rootDir, range, getUserStore);
}

async function mysqlAccountUsage(range: RequestedRange, getUserStore?: GetUserStore): Promise<AccountUsageResponse> {
  await ensureMysqlSchema();
  const earliest = await mysqlEarliestDay();
  const bounds = resolveBounds(range, earliest);
  const pool = await getMysqlPool();
  const users = await currentUsers(getUserStore);
  const [usageRows]: any = await pool.query(
    `SELECT
       user_hash,
       SUM(views) AS views,
       COUNT(*) AS active_days,
       DATE_FORMAT(MIN(first_seen_at), '%Y-%m-%dT%H:%i:%s.000Z') AS first_activity_at,
       DATE_FORMAT(MAX(last_seen_at), '%Y-%m-%dT%H:%i:%s.000Z') AS last_activity_at
     FROM gc_analytics_user_daily
     WHERE day_key BETWEEN ? AND ?
     GROUP BY user_hash`,
    [bounds.from, bounds.to],
  );

  const [sessionRows]: any = await pool.query(
    `SELECT user_hash, COUNT(DISTINCT session_hash) AS sessions
     FROM gc_analytics_user_sessions
     WHERE day_key BETWEEN ? AND ?
     GROUP BY user_hash`,
    [bounds.from, bounds.to],
  );
  // GC_PHASE2F_ANALYTICS_SESSIONS_MAP_V1
  const sessions = new Map<string, number>(
    (sessionRows || []).map((row: any): [string, number] => [
      String(row.user_hash),
      toCount(row.sessions),
    ]),
  );

  const [areaRows]: any = await pool.query(
    `SELECT user_hash, area, SUM(views) AS views
     FROM gc_analytics_user_area_daily
     WHERE day_key BETWEEN ? AND ?
     GROUP BY user_hash, area
     ORDER BY user_hash, views DESC`,
    [bounds.from, bounds.to],
  );
  const topAreas = new Map<string, { area: string; views: number }>();
  for (const row of areaRows || []) {
    const hash = String(row.user_hash);
    if (!topAreas.has(hash)) topAreas.set(hash, { area: String(row.area), views: toCount(row.views) });
  }

  const usage = new Map<string, any>((usageRows || []).map((row: any) => [String(row.user_hash), row]));
  const items: AccountUsageRow[] = users.map((user) => {
    const account = publicAccount(user);
    const hash = registeredUserHashFromId(account.id) || '';
    const row = usage.get(hash) || {};
    const top = topAreas.get(hash);
    return {
      ...account,
      views: toCount(row.views),
      sessions: sessions.get(hash) || 0,
      activeDays: toCount(row.active_days),
      firstActivityAt: row.first_activity_at || null,
      lastActivityAt: row.last_activity_at || null,
      topArea: top?.area || null,
      topAreaViews: top?.views || 0,
    };
  }).sort((a, b) => {
    const byLast = String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || ''));
    return byLast || b.views - a.views || a.displayName.localeCompare(b.displayName);
  });

  const today = dateParts().dayKey;
  const from7 = shiftDayKey(today, -6);
  const from30 = shiftDayKey(today, -29);
  const activeCount = async (from: string, to: string): Promise<number> => {
    const [rows]: any = await pool.query(
      `SELECT COUNT(DISTINCT user_hash) AS total
       FROM gc_analytics_user_daily
       WHERE day_key BETWEEN ? AND ?`,
      [from, to],
    );
    return toCount(rows?.[0]?.total);
  };

  const [trackingRows]: any = await pool.query(
    `SELECT DATE_FORMAT(MIN(first_seen_at), '%Y-%m-%dT%H:%i:%s.000Z') AS started_at
     FROM gc_analytics_user_daily`,
  );

  const totalAccounts = items.filter((item) => !item.deleted).length;
  const active30 = await activeCount(from30, today);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    period: bounds,
    totals: {
      accounts: totalAccounts,
      activeToday: await activeCount(today, today),
      active7Days: await activeCount(from7, today),
      active30Days: active30,
      inactive30Days: Math.max(0, totalAccounts - active30),
      measuredAccounts: items.filter((item) => item.views > 0).length,
      registeredViews: items.reduce((sum, item) => sum + item.views, 0),
      registeredSessions: items.reduce((sum, item) => sum + item.sessions, 0),
    },
    trackingStartedAt: trackingRows?.[0]?.started_at || null,
    items,
  };
}

async function fileAccountUsage(rootDir: string, range: RequestedRange, getUserStore?: GetUserStore): Promise<AccountUsageResponse> {
  const records = readFileRecords(rootDir);
  const bounds = fileBounds(records, range);
  const selected = records.filter((record) => inBounds(record.dayKey, bounds) && record.registeredUserHash);
  const users = await currentUsers(getUserStore);
  const usage = new Map<string, AnalyticsRecord[]>();

  for (const record of selected) {
    const hash = String(record.registeredUserHash);
    const bucket = usage.get(hash) || [];
    bucket.push(record);
    usage.set(hash, bucket);
  }

  const items: AccountUsageRow[] = users.map((user) => {
    const account = publicAccount(user);
    const hash = registeredUserHashFromId(account.id) || '';
    const rows = usage.get(hash) || [];
    const areas = new Map<string, number>();
    for (const row of rows) areas.set(row.area, (areas.get(row.area) || 0) + 1);
    const topArea = [...areas.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      ...account,
      views: rows.length,
      sessions: new Set(rows.map((row) => row.registeredSessionHash).filter(Boolean)).size,
      activeDays: new Set(rows.map((row) => row.dayKey)).size,
      firstActivityAt: rows.map((row) => row.occurredAt).sort()[0] || null,
      lastActivityAt: rows.map((row) => row.occurredAt).sort().at(-1) || null,
      topArea: topArea?.[0] || null,
      topAreaViews: topArea?.[1] || 0,
    };
  }).sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')) || b.views - a.views);

  const today = dateParts().dayKey;
  const distinctUsers = (from: string, to: string) => new Set(
    records.filter((record) => record.registeredUserHash && record.dayKey >= from && record.dayKey <= to)
      .map((record) => record.registeredUserHash),
  ).size;
  const totalAccounts = items.filter((item) => !item.deleted).length;
  const active30 = distinctUsers(shiftDayKey(today, -29), today);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    period: bounds,
    totals: {
      accounts: totalAccounts,
      activeToday: distinctUsers(today, today),
      active7Days: distinctUsers(shiftDayKey(today, -6), today),
      active30Days: active30,
      inactive30Days: Math.max(0, totalAccounts - active30),
      measuredAccounts: items.filter((item) => item.views > 0).length,
      registeredViews: items.reduce((sum, item) => sum + item.views, 0),
      registeredSessions: items.reduce((sum, item) => sum + item.sessions, 0),
    },
    trackingStartedAt: records.filter((record) => record.registeredUserHash)
      .map((record) => record.occurredAt).sort()[0] || null,
    items,
  };
}

async function loadAccountUsage(rootDir: string, range: RequestedRange, getUserStore?: GetUserStore): Promise<AccountUsageResponse> {
  if (storageDriver() === 'mysql') return mysqlAccountUsage(range, getUserStore);
  return fileAccountUsage(rootDir, range, getUserStore);
}

async function mysqlAccountDetail(user: any, range: RequestedRange): Promise<any> {
  await ensureMysqlSchema();
  const earliest = await mysqlEarliestDay();
  const bounds = resolveBounds(range, earliest);
  const hash = registeredUserHashFromId(user?.id);
  if (!hash) throw new Error('Usuario no válido.');
  const pool = await getMysqlPool();

  const [dailyRows]: any = await pool.query(
    `SELECT
       DATE_FORMAT(day_key, '%Y-%m-%d') AS day,
       views,
       DATE_FORMAT(first_seen_at, '%Y-%m-%dT%H:%i:%s.000Z') AS first_seen_at,
       DATE_FORMAT(last_seen_at, '%Y-%m-%dT%H:%i:%s.000Z') AS last_seen_at
     FROM gc_analytics_user_daily
     WHERE user_hash = ? AND day_key BETWEEN ? AND ?
     ORDER BY day_key ASC`,
    [hash, bounds.from, bounds.to],
  );

  const [areaRows]: any = await pool.query(
    `SELECT area, SUM(views) AS views
     FROM gc_analytics_user_area_daily
     WHERE user_hash = ? AND day_key BETWEEN ? AND ?
     GROUP BY area ORDER BY views DESC`,
    [hash, bounds.from, bounds.to],
  );

  const [sessionRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT session_hash) AS sessions
     FROM gc_analytics_user_sessions
     WHERE user_hash = ? AND day_key BETWEEN ? AND ?`,
    [hash, bounds.from, bounds.to],
  );

  const daily = (dailyRows || []).map((row: any) => ({
    day: String(row.day),
    views: toCount(row.views),
    firstSeenAt: row.first_seen_at || null,
    lastSeenAt: row.last_seen_at || null,
  }));
  const account = publicAccount(user);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    period: bounds,
    account,
    totals: {
      views: daily.reduce((sum: number, row: any) => sum + row.views, 0),
      activeDays: daily.length,
      sessions: toCount(sessionRows?.[0]?.sessions),
      firstActivityAt: daily[0]?.firstSeenAt || null,
      lastActivityAt: daily.at(-1)?.lastSeenAt || null,
    },
    daily,
    areas: (areaRows || []).map((row: any) => ({ key: String(row.area), views: toCount(row.views) })),
  };
}

async function fileAccountDetail(rootDir: string, user: any, range: RequestedRange): Promise<any> {
  const records = readFileRecords(rootDir);
  const bounds = fileBounds(records, range);
  const hash = registeredUserHashFromId(user?.id);
  const selected = records.filter((record) => record.registeredUserHash === hash && inBounds(record.dayKey, bounds));
  const dailyMap = new Map<string, AnalyticsRecord[]>();
  for (const record of selected) {
    const bucket = dailyMap.get(record.dayKey) || [];
    bucket.push(record);
    dailyMap.set(record.dayKey, bucket);
  }
  const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => ({
    day,
    views: rows.length,
    firstSeenAt: rows.map((row) => row.occurredAt).sort()[0] || null,
    lastSeenAt: rows.map((row) => row.occurredAt).sort().at(-1) || null,
  }));
  const areas = [...selected.reduce((map, record) => {
    map.set(record.area, (map.get(record.area) || 0) + 1);
    return map;
  }, new Map<string, number>()).entries()]
    .map(([key, views]) => ({ key, views }))
    .sort((a, b) => b.views - a.views);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    period: bounds,
    account: publicAccount(user),
    totals: {
      views: selected.length,
      activeDays: daily.length,
      sessions: new Set(selected.map((record) => record.registeredSessionHash).filter(Boolean)).size,
      firstActivityAt: selected.map((record) => record.occurredAt).sort()[0] || null,
      lastActivityAt: selected.map((record) => record.occurredAt).sort().at(-1) || null,
    },
    daily,
    areas,
  };
}

function analyticsTracker(rootDir: string, getAuthContext?: GetAuthContext) {
  return (req: Request, res: Response, next: () => void) => {
    if (!shouldTrackPageView(req)) {
      next();
      return;
    }

    const record = buildRecord(req);
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400) return;

      if (isDuplicatePageView(record)) {
        analyticsRuntimeHealth.dedupedSinceStart += 1;
        return;
      }

      analyticsRuntimeHealth.lastAttemptAt = new Date().toISOString();
      setImmediate(async () => {
        try {
          let authContext: any = null;
          if (getAuthContext && hasSessionCookie(req)) {
            try {
              authContext = await getAuthContext(req);
            } catch (error) {
              console.warn('[GC analytics] No se pudo resolver el usuario autenticado:', error instanceof Error ? error.message : error);
            }
          }

          const finalRecord: AnalyticsRecord = {
            ...record,
            registeredUserHash: registeredUserHash(authContext),
            registeredSessionHash: registeredSessionHash(authContext),
          };

          await recordPageView(rootDir, finalRecord);
          analyticsRuntimeHealth.lastRecordedAt = new Date().toISOString();
          analyticsRuntimeHealth.recordedSinceStart += 1;
          analyticsRuntimeHealth.lastError = null;
          analyticsRuntimeHealth.lastErrorAt = null;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          analyticsRuntimeHealth.lastError = message;
          analyticsRuntimeHealth.lastErrorAt = new Date().toISOString();
          console.warn('[GC analytics] No se pudo registrar pageview:', message);
        }
      });
    });

    next();
  };
}

export function registerGcAnalyticsRoutes(
  app: Express,
  { rootDir, requireAdmin, getAuthContext, getUserStore }: AnalyticsOptions,
): void {
  const requireAnalyticsAdmin = async (req: Request, res: Response): Promise<boolean> => {
    if (!requireAdmin) {
      res.status(403).json({ ok: false, authenticated: false, authorized: false, message: 'Acceso admin requerido.' });
      return false;
    }
    const context = await requireAdmin(req, res);
    return Boolean(context);
  };

  app.get('/api/admin/analytics/summary', async (req: Request, res: Response) => {
    if (!(await requireAnalyticsAdmin(req, res))) return;
    try {
      const summary = await loadSummary(rootDir, requestedRange(req.query.days), getUserStore);
      res.setHeader('Cache-Control', 'no-store');
      res.json(summary);
    } catch (error) {
      console.error('[GC analytics] Error generando resumen:', error);
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo generar el resumen de visitas.' });
    }
  });

  app.get('/api/admin/analytics/accounts', async (req: Request, res: Response) => {
    if (!(await requireAnalyticsAdmin(req, res))) return;
    try {
      const data = await loadAccountUsage(rootDir, requestedRange(req.query.days), getUserStore);
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    } catch (error) {
      console.error('[GC analytics] Error generando uso de cuentas:', error);
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo generar el uso de cuentas.' });
    }
  });

  app.get('/api/admin/analytics/accounts/:userId', async (req: Request, res: Response) => {
    if (!(await requireAnalyticsAdmin(req, res))) return;
    try {
      const users = await currentUsers(getUserStore);
      const user = users.find((item) => String(item?.id || '') === String(req.params.userId || ''));
      if (!user) {
        res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' });
        return;
      }
      const range = requestedRange(req.query.days);
      const data = storageDriver() === 'mysql'
        ? await mysqlAccountDetail(user, range)
        : await fileAccountDetail(rootDir, user, range);
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    } catch (error) {
      console.error('[GC analytics] Error generando detalle de cuenta:', error);
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo generar el detalle de cuenta.' });
    }
  });

  app.use(analyticsTracker(rootDir, getAuthContext));

  console.log(
    `[GC analytics] ${analyticsReady() ? 'activo' : analyticsEnabled() ? 'configuración incompleta' : 'desactivado'}`
    + ` · storage=${storageDriver()} · histórico=permanente · raw=${rawRetentionDays() || 'forever'}d`
    + ` · sin cookies · dedupe=${dedupSeconds()}s`,
  );
}
