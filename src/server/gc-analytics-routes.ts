import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type RequireAdmin = (req: Request, res: Response) => Promise<any | null> | any | null;

type AnalyticsOptions = {
  rootDir: string;
  requireAdmin?: RequireAdmin;
};

type AnalyticsRecord = {
  occurredAt: string;
  dayKey: string;
  hourOfDay: number;
  visitorHash: string;
  path: string;
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

type AnalyticsSummary = {
  ok: true;
  enabled: boolean;
  storage: 'mysql' | 'file' | 'disabled';
  generatedAt: string;
  timeZone: string;
  retentionDays: number;
  activeMinutes: number;
  period: {
    days: number;
    from: string;
    to: string;
  };
  totals: {
    today: { views: number; visitors: number };
    last7Days: { views: number; visitors: number };
    last30Days: { views: number; visitors: number };
    selectedPeriod: { views: number; visitors: number };
    activeNow: number;
  };
  daily: Array<{ day: string; views: number; visitors: number }>;
  hourly: Array<{ hour: number; views: number; visitors: number }>;
  topPages: AnalyticsSummaryRow[];
  referrers: AnalyticsSummaryRow[];
  devices: AnalyticsSummaryRow[];
  browsers: AnalyticsSummaryRow[];
  privacy: {
    cookies: false;
    localStorage: false;
    storesIp: false;
    storesQueryString: false;
    visitorHashRotatesDaily: true;
  };
};

const BOT_PATTERN = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|googlebot|lighthouse|pagespeed|uptimerobot|headlesschrome|playwright|puppeteer|curl|wget/i;
const STATIC_EXTENSION_PATTERN = /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|pdf|png|svg|txt|webm|webp|woff2?|xml|zip)$/i;
const INTERNAL_SOURCE = 'Interno';

let mysqlPoolPromise: Promise<any> | null = null;
let mysqlSchemaPromise: Promise<void> | null = null;
let lastPruneAt = 0;

function analyticsEnabled(): boolean {
  return String(process.env.GC_ANALYTICS_ENABLED || '').trim().toLowerCase() === 'true';
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function retentionDays(): number {
  return clampInteger(process.env.GC_ANALYTICS_RETENTION_DAYS, 90, 7, 730);
}

function activeMinutes(): number {
  return clampInteger(process.env.GC_ANALYTICS_ACTIVE_MINUTES, 5, 1, 60);
}

function analyticsTimeZone(): string {
  return String(process.env.GC_ANALYTICS_TIME_ZONE || 'Europe/Madrid').trim() || 'Europe/Madrid';
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
  return String(
    process.env.GC_ANALYTICS_HASH_SECRET
    || process.env.ADMIN_SETUP_SECRET
    || process.env.STRACKER_SYNC_SECRET
    || 'grasscutters-local-analytics-v1'
  );
}

function anonymizeIp(value: unknown): string {
  const raw = String(value || '').trim().replace(/^::ffff:/, '');
  if (!raw) return 'unknown';

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const parts = raw.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (raw.includes(':')) {
    return raw.split(':').filter(Boolean).slice(0, 4).join(':') || 'ipv6';
  }

  return 'unknown';
}

function dateParts(now = new Date()): { dayKey: string; hourOfDay: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: analyticsTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    hourOfDay: clampInteger(parts.hour, 0, 0, 23),
  };
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
    // Conserva el path original si contiene una codificación inválida.
  }

  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname.slice(0, 300) || '/';
}

function shouldTrackPageView(req: Request): boolean {
  if (!analyticsEnabled()) return false;
  if (req.method !== 'GET') return false;

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
  if (!userAgent || BOT_PATTERN.test(userAgent)) return false;

  return true;
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

function visitorHash(req: Request, dayKey: string, browser: string): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = anonymizeIp(forwarded || req.ip || req.socket.remoteAddress || '');
  const message = `${dayKey}|${ip}|${browser}`;
  return crypto.createHmac('sha256', analyticsHashSecret()).update(message).digest('hex');
}

function buildRecord(req: Request): AnalyticsRecord {
  const now = new Date();
  const { dayKey, hourOfDay } = dateParts(now);
  const userAgent = String(req.headers['user-agent'] || '');
  const browser = browserFamily(userAgent);
  const referrer = referrerInfo(req);

  return {
    occurredAt: now.toISOString(),
    dayKey,
    hourOfDay,
    visitorHash: visitorHash(req, dayKey, browser),
    path: normalizePathname(req.originalUrl || req.url),
    referrerHost: referrer.host,
    source: referrer.source,
    device: deviceFamily(userAgent),
    browser,
  };
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
    });
  })();

  return mysqlPoolPromise;
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
        path VARCHAR(300) NOT NULL,
        referrer_host VARCHAR(191) NULL,
        source VARCHAR(191) NOT NULL,
        device VARCHAR(24) NOT NULL,
        browser VARCHAR(40) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_gc_analytics_occurred_at (occurred_at),
        INDEX idx_gc_analytics_day_key (day_key),
        INDEX idx_gc_analytics_path (path),
        INDEX idx_gc_analytics_visitor_day (day_key, visitor_hash),
        INDEX idx_gc_analytics_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })();

  return mysqlSchemaPromise;
}

async function pruneMysqlIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < 6 * 60 * 60 * 1000) return;
  lastPruneAt = now;
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  await pool.execute(
    'DELETE FROM gc_analytics_pageviews WHERE occurred_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)',
    [retentionDays()],
  );
}

async function recordMysql(record: AnalyticsRecord): Promise<void> {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  await pool.execute(
    `INSERT INTO gc_analytics_pageviews
      (occurred_at, day_key, hour_of_day, visitor_hash, path, referrer_host, source, device, browser)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.occurredAt.slice(0, 23).replace('T', ' '),
      record.dayKey,
      record.hourOfDay,
      record.visitorHash,
      record.path,
      record.referrerHost,
      record.source,
      record.device,
      record.browser,
    ],
  );
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
  if (driver === 'mysql') {
    await recordMysql(record);
    return;
  }
  if (driver === 'file') {
    await recordFile(rootDir, record);
  }
}

function emptySummary(days: number): AnalyticsSummary {
  const now = new Date();
  const from = new Date(now.getTime() - Math.max(0, days - 1) * 86400000);
  return {
    ok: true,
    enabled: analyticsEnabled(),
    storage: storageDriver(),
    generatedAt: now.toISOString(),
    timeZone: analyticsTimeZone(),
    retentionDays: retentionDays(),
    activeMinutes: activeMinutes(),
    period: {
      days,
      from: dateParts(from).dayKey,
      to: dateParts(now).dayKey,
    },
    totals: {
      today: { views: 0, visitors: 0 },
      last7Days: { views: 0, visitors: 0 },
      last30Days: { views: 0, visitors: 0 },
      selectedPeriod: { views: 0, visitors: 0 },
      activeNow: 0,
    },
    daily: [],
    hourly: [],
    topPages: [],
    referrers: [],
    devices: [],
    browsers: [],
    privacy: {
      cookies: false,
      localStorage: false,
      storesIp: false,
      storesQueryString: false,
      visitorHashRotatesDaily: true,
    },
  };
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mysqlGroupRows(rows: any[], keyName: string): AnalyticsSummaryRow[] {
  return rows.map((row) => ({
    key: String(row?.[keyName] || 'Sin dato'),
    views: toCount(row?.views),
    visitors: toCount(row?.visitors),
  }));
}

async function mysqlSummary(days: number): Promise<AnalyticsSummary> {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const summary = emptySummary(days);

  const [totalsRows]: any = await pool.query(`
    SELECT
      SUM(day_key = CURRENT_DATE()) AS today_views,
      COUNT(DISTINCT CASE WHEN day_key = CURRENT_DATE() THEN visitor_hash END) AS today_visitors,
      SUM(day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)) AS views_7,
      COUNT(DISTINCT CASE WHEN day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY) THEN CONCAT(day_key, ':', visitor_hash) END) AS visitors_7,
      SUM(day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY)) AS views_30,
      COUNT(DISTINCT CASE WHEN day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) THEN CONCAT(day_key, ':', visitor_hash) END) AS visitors_30,
      SUM(day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)) AS period_views,
      COUNT(DISTINCT CASE WHEN day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY) THEN CONCAT(day_key, ':', visitor_hash) END) AS period_visitors
    FROM gc_analytics_pageviews
  `, [days - 1, days - 1]);

  const totals = totalsRows?.[0] || {};
  summary.totals.today = { views: toCount(totals.today_views), visitors: toCount(totals.today_visitors) };
  summary.totals.last7Days = { views: toCount(totals.views_7), visitors: toCount(totals.visitors_7) };
  summary.totals.last30Days = { views: toCount(totals.views_30), visitors: toCount(totals.visitors_30) };
  summary.totals.selectedPeriod = { views: toCount(totals.period_views), visitors: toCount(totals.period_visitors) };

  const [activeRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT visitor_hash) AS active_now
     FROM gc_analytics_pageviews
     WHERE occurred_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)`,
    [activeMinutes()],
  );
  summary.totals.activeNow = toCount(activeRows?.[0]?.active_now);

  const [dailyRows]: any = await pool.query(
    `SELECT day_key AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
     FROM gc_analytics_pageviews
     WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
     GROUP BY day_key
     ORDER BY day_key ASC`,
    [days - 1],
  );
  summary.daily = (dailyRows || []).map((row: any) => ({
    day: String(row.day).slice(0, 10),
    views: toCount(row.views),
    visitors: toCount(row.visitors),
  }));

  const [hourlyRows]: any = await pool.query(
    `SELECT hour_of_day AS hour, COUNT(*) AS views, COUNT(DISTINCT CONCAT(day_key, ':', visitor_hash)) AS visitors
     FROM gc_analytics_pageviews
     WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
     GROUP BY hour_of_day
     ORDER BY hour_of_day ASC`,
    [days - 1],
  );
  summary.hourly = (hourlyRows || []).map((row: any) => ({
    hour: toCount(row.hour),
    views: toCount(row.views),
    visitors: toCount(row.visitors),
  }));

  const groupedQueries: Array<{
    target: 'topPages' | 'referrers' | 'devices' | 'browsers';
    sql: string;
    keyName: string;
  }> = [
    {
      target: 'topPages',
      keyName: 'path',
      sql: `SELECT path, COUNT(*) AS views, COUNT(DISTINCT CONCAT(day_key, ':', visitor_hash)) AS visitors
            FROM gc_analytics_pageviews
            WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
            GROUP BY path ORDER BY views DESC LIMIT 20`,
    },
    {
      target: 'referrers',
      keyName: 'source',
      sql: `SELECT source, COUNT(*) AS views, COUNT(DISTINCT CONCAT(day_key, ':', visitor_hash)) AS visitors
            FROM gc_analytics_pageviews
            WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
              AND source <> ?
            GROUP BY source ORDER BY views DESC LIMIT 20`,
    },
    {
      target: 'devices',
      keyName: 'device',
      sql: `SELECT device, COUNT(*) AS views, COUNT(DISTINCT CONCAT(day_key, ':', visitor_hash)) AS visitors
            FROM gc_analytics_pageviews
            WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
            GROUP BY device ORDER BY views DESC`,
    },
    {
      target: 'browsers',
      keyName: 'browser',
      sql: `SELECT browser, COUNT(*) AS views, COUNT(DISTINCT CONCAT(day_key, ':', visitor_hash)) AS visitors
            FROM gc_analytics_pageviews
            WHERE day_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
            GROUP BY browser ORDER BY views DESC`,
    },
  ];

  for (const query of groupedQueries) {
    const params = query.target === 'referrers' ? [days - 1, INTERNAL_SOURCE] : [days - 1];
    const [rows]: any = await pool.query(query.sql, params);
    summary[query.target] = mysqlGroupRows(rows || [], query.keyName);
  }

  return summary;
}

function readFileRecords(rootDir: string): AnalyticsRecord[] {
  const filePath = analyticsFilePath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  const cutoff = Date.now() - retentionDays() * 86400000;
  const raw = fs.readFileSync(filePath, 'utf8');
  const records: AnalyticsRecord[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as AnalyticsRecord;
      const occurredMs = Date.parse(record.occurredAt);
      if (Number.isFinite(occurredMs) && occurredMs >= cutoff) records.push(record);
    } catch {
      // Ignora líneas dañadas sin inutilizar el informe.
    }
  }

  return records;
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

function totalsFor(records: AnalyticsRecord[]): { views: number; visitors: number } {
  return {
    views: records.length,
    visitors: new Set(records.map((record) => `${record.dayKey}:${record.visitorHash}`)).size,
  };
}

function fileSummary(rootDir: string, days: number): AnalyticsSummary {
  const summary = emptySummary(days);
  const records = readFileRecords(rootDir);
  const now = new Date();
  const todayKey = dateParts(now).dayKey;
  const cutoffFor = (amount: number) => Date.now() - Math.max(0, amount - 1) * 86400000;
  const selectSince = (amount: number) => records.filter((record) => Date.parse(record.occurredAt) >= cutoffFor(amount));

  const today = records.filter((record) => record.dayKey === todayKey);
  const last7 = selectSince(7);
  const last30 = selectSince(30);
  const selected = selectSince(days);
  const activeCutoff = Date.now() - activeMinutes() * 60000;

  summary.totals.today = totalsFor(today);
  summary.totals.last7Days = totalsFor(last7);
  summary.totals.last30Days = totalsFor(last30);
  summary.totals.selectedPeriod = totalsFor(selected);
  summary.totals.activeNow = new Set(
    records
      .filter((record) => Date.parse(record.occurredAt) >= activeCutoff)
      .map((record) => record.visitorHash),
  ).size;

  const daily = new Map<string, AnalyticsRecord[]>();
  for (const record of selected) {
    const bucket = daily.get(record.dayKey) || [];
    bucket.push(record);
    daily.set(record.dayKey, bucket);
  }
  summary.daily = [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, rows]) => ({ day, ...totalsFor(rows) }));

  const hourly = new Map<number, AnalyticsRecord[]>();
  for (const record of selected) {
    const bucket = hourly.get(record.hourOfDay) || [];
    bucket.push(record);
    hourly.set(record.hourOfDay, bucket);
  }
  summary.hourly = [...hourly.entries()]
    .sort(([left], [right]) => left - right)
    .map(([hour, rows]) => ({ hour, ...totalsFor(rows) }));

  summary.topPages = aggregateRows(selected, (record) => record.path).slice(0, 20);
  summary.referrers = aggregateRows(
    selected.filter((record) => record.source !== INTERNAL_SOURCE),
    (record) => record.source,
  ).slice(0, 20);
  summary.devices = aggregateRows(selected, (record) => record.device);
  summary.browsers = aggregateRows(selected, (record) => record.browser);

  return summary;
}

async function loadSummary(rootDir: string, days: number): Promise<AnalyticsSummary> {
  if (!analyticsEnabled()) return emptySummary(days);
  if (storageDriver() === 'mysql') return mysqlSummary(days);
  return fileSummary(rootDir, days);
}

function analyticsTracker(rootDir: string) {
  return (req: Request, res: Response, next: () => void) => {
    if (!shouldTrackPageView(req)) {
      next();
      return;
    }

    const record = buildRecord(req);
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400) return;
      setImmediate(() => {
        recordPageView(rootDir, record).catch((error) => {
          console.warn('[GC analytics] No se pudo registrar pageview:', error instanceof Error ? error.message : error);
        });
      });
    });

    next();
  };
}

export function registerGcAnalyticsRoutes(app: Express, { rootDir, requireAdmin }: AnalyticsOptions): void {
  app.get('/api/admin/analytics/summary', async (req: Request, res: Response) => {
    if (!requireAdmin) {
      res.status(403).json({ ok: false, authenticated: false, authorized: false, message: 'Acceso admin requerido.' });
      return;
    }

    const context = await requireAdmin(req, res);
    if (!context) return;

    try {
      const days = clampInteger(req.query.days, 30, 7, Math.min(90, retentionDays()));
      const summary = await loadSummary(rootDir, days);
      res.setHeader('Cache-Control', 'no-store');
      res.json(summary);
    } catch (error) {
      console.error('[GC analytics] Error generando resumen:', error);
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo generar el resumen de visitas.',
      });
    }
  });

  app.use(analyticsTracker(rootDir));

  console.log(`[GC analytics] ${analyticsEnabled() ? 'activo' : 'desactivado'} · storage=${storageDriver()} · sin cookies`);
}
