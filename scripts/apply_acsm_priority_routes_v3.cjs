#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts. Ejecuta el script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');
const start = '// GC_ACSM_PRIORITY_ROUTES_V3_START';
const end = '// GC_ACSM_PRIORITY_ROUTES_V3_END';

const block = String.raw`
${start}

function gcAcsmParseCookieHeader(header: unknown): Record<string, string> {
  return String(header || '').split(';').map((part) => part.trim()).filter(Boolean).reduce((acc: Record<string, string>, part) => {
    const eq = part.indexOf('=');
    if (eq < 0) return acc;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try { acc[key] = decodeURIComponent(value); } catch { acc[key] = value; }
    return acc;
  }, {});
}

function gcAcsmSafeIsoToMysql(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function gcAcsmTodayMadridDate() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function gcAcsmTitleCase(value: unknown) {
  return String(value || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || '-';
}

function gcAcsmParseIni(text: string) {
  const values: Record<string, string> = {};
  let section = '';
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toUpperCase();
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    const value = line.slice(eq + 1).trim();
    values[key] = value;
    if (section) values[`${section}.${key}`] = value;
  }
  return values;
}

async function gcAcsmImportSftpClient() {
  try {
    const mod: any = await import('ssh2-sftp-client');
    return mod.default || mod;
  } catch (error: any) {
    throw new Error('Falta dependencia ssh2-sftp-client. Ejecuta npm install ssh2-sftp-client o añade la dependencia al proyecto.');
  }
}

async function gcAcsmReadRemoteText(remotePath: string) {
  const host = process.env.ACSM_SFTP_HOST?.trim();
  const port = Number(process.env.ACSM_SFTP_PORT || 22);
  const username = process.env.ACSM_SFTP_USER?.trim();
  const password = process.env.ACSM_SFTP_PASSWORD ?? '';
  if (!host || !username || !password) {
    throw new Error('Faltan variables ACSM_SFTP_HOST, ACSM_SFTP_USER o ACSM_SFTP_PASSWORD.');
  }
  const Client = await gcAcsmImportSftpClient();
  const sftp = new Client();
  try {
    await sftp.connect({ host, port, username, password, readyTimeout: Number(process.env.ACSM_SFTP_TIMEOUT_MS || 30000) });
    const buffer = await sftp.get(remotePath);
    return Buffer.isBuffer(buffer) ? buffer.toString('utf8') : Buffer.from(buffer as any).toString('utf8');
  } finally {
    try { await sftp.end(); } catch {}
  }
}

async function gcAcsmGetAdminUser(req: any) {
  const cookies = gcAcsmParseCookieHeader(req.headers?.cookie);
  const token = cookies[sessionCookieName] || cookies.gc_session || '';
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const nowMysql = gcAcsmSafeIsoToMysql(new Date().toISOString());

  if (useMysqlStorage()) {
    await ensureMysqlSchema();
    const rows = await mysqlQuery(`
      SELECT u.id, u.email, u.display_name, u.role
      FROM gc_sessions s
      INNER JOIN gc_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1
    `, [tokenHash, nowMysql]);
    const row: any = rows?.[0];
    if (row && String(row.role || '').toLowerCase() === 'admin') {
      return { id: String(row.id), email: String(row.email || ''), displayName: String(row.display_name || ''), role: 'admin' };
    }
    return null;
  }

  if (useSqliteStorage()) {
    const rows = await withAppSqliteDb((db: any) => sqliteQuery(db, `
      SELECT u.id, u.email, u.display_name, u.role
      FROM gc_sessions s
      INNER JOIN gc_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1
    `, [tokenHash, new Date().toISOString()]));
    const row: any = rows?.[0];
    if (row && String(row.role || '').toLowerCase() === 'admin') {
      return { id: String(row.id), email: String(row.email || ''), displayName: String(row.display_name || ''), role: 'admin' };
    }
    return null;
  }

  const store = await readUserStoreAsync();
  const session = store.sessions.find((item: any) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
  const user = session ? store.users.find((item: any) => item.id === session.userId) : null;
  return user?.role === 'admin' ? user : null;
}

async function gcAcsmEnsureCalendarSchema() {
  if (useMysqlStorage()) {
    await ensureMysqlSchema();
    await mysqlExecute(`
      CREATE TABLE IF NOT EXISTS gc_calendar_events (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        type VARCHAR(40) NOT NULL DEFAULT 'combo',
        title VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        start_time VARCHAR(20) NULL,
        end_date DATE NULL,
        end_time VARCHAR(20) NULL,
        track_name VARCHAR(255) NULL,
        car_names TEXT NULL,
        link_url TEXT NULL,
        description TEXT NULL,
        repeat_enabled TINYINT(1) NOT NULL DEFAULT 0,
        repeat_frequency VARCHAR(30) NOT NULL DEFAULT 'none',
        repeat_until DATE NULL,
        visible TINYINT(1) NOT NULL DEFAULT 1,
        featured TINYINT(1) NOT NULL DEFAULT 0,
        source VARCHAR(80) NULL,
        source_key VARCHAR(191) NULL,
        raw_json LONGTEXT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_gc_calendar_events_start_date (start_date),
        INDEX idx_gc_calendar_events_type (type),
        INDEX idx_gc_calendar_events_source_key (source_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const alters = [
      `ALTER TABLE gc_calendar_events ADD COLUMN source VARCHAR(80) NULL`,
      `ALTER TABLE gc_calendar_events ADD COLUMN source_key VARCHAR(191) NULL`,
      `ALTER TABLE gc_calendar_events ADD COLUMN raw_json LONGTEXT NULL`,
      `ALTER TABLE gc_calendar_events ADD COLUMN repeat_enabled TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE gc_calendar_events ADD COLUMN repeat_frequency VARCHAR(30) NOT NULL DEFAULT 'none'`,
      `ALTER TABLE gc_calendar_events ADD COLUMN repeat_until DATE NULL`,
      `ALTER TABLE gc_calendar_events ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0`
    ];
    for (const sql of alters) {
      try { await mysqlExecute(sql); } catch {}
    }
  }
}

async function gcAcsmResolveNames(trackCode: string, carCodes: string[]) {
  let trackName = gcAcsmTitleCase(trackCode);
  let carNames = carCodes.map(gcAcsmTitleCase);

  try {
    const dbPath = process.env.STRACKER_DB_PATH?.trim() || process.env.GC_STRACKER_DB_PATH?.trim() || path.join(rootDir, 'data/stracker/stracker.db3');
    if (fs.existsSync(dbPath)) {
      const SQL = await getAppSqlJs();
      const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
      try {
        const trackRows = sqliteQuery(db, 'SELECT Track, UiTrackName FROM Tracks WHERE Track = ? COLLATE NOCASE LIMIT 1', [trackCode]);
        if (trackRows?.[0]?.UiTrackName) trackName = String(trackRows[0].UiTrackName);
        const nextCars: string[] = [];
        for (const code of carCodes) {
          const rows = sqliteQuery(db, 'SELECT Car, UiCarName FROM Cars WHERE Car = ? COLLATE NOCASE LIMIT 1', [code]);
          nextCars.push(String(rows?.[0]?.UiCarName || gcAcsmTitleCase(code)));
        }
        if (nextCars.length) carNames = nextCars;
      } finally {
        db.close();
      }
    }
  } catch {}

  try {
    const aliases = await readDisplayNameStoreAsync(true);
    const trackAlias = aliases.entries.find((entry: any) => entry.enabled !== false && entry.kind === 'track' && String(entry.sourceCode || '').toLowerCase() === String(trackCode).toLowerCase());
    if (trackAlias?.displayName) trackName = trackAlias.displayName;
    carNames = carCodes.map((code, index) => {
      const alias = aliases.entries.find((entry: any) => entry.enabled !== false && entry.kind === 'car' && String(entry.sourceCode || '').toLowerCase() === String(code).toLowerCase());
      return alias?.displayName || carNames[index] || gcAcsmTitleCase(code);
    });
  } catch {}

  return { trackName, carNames };
}

async function gcAcsmBuildCurrentComboEvent() {
  const cfgPath = process.env.ACSM_SERVER_CFG_PATH?.trim() || '/185.216.144.78_9800/cfg/server_cfg.ini';
  const raw = await gcAcsmReadRemoteText(cfgPath);
  const values = gcAcsmParseIni(raw);
  const trackCode = values.TRACK || values['SERVER.TRACK'] || '';
  const carCodes = String(values.CARS || values['SERVER.CARS'] || '').split(';').map((item) => item.trim()).filter(Boolean);
  const serverName = values.NAME || values['SERVER.NAME'] || 'Combo semanal';
  const resolved = await gcAcsmResolveNames(trackCode, carCodes);
  const today = gcAcsmTodayMadridDate();
  const title = `Combo semanal · ${resolved.trackName}`;
  return {
    id: 'acsm-current-combo',
    type: 'combo',
    title,
    startDate: today,
    startTime: '',
    endDate: '',
    endTime: '',
    trackName: resolved.trackName,
    carNames: resolved.carNames.join(', '),
    linkUrl: process.env.ACSM_PANEL_URL || '',
    description: `Importado desde Assetto Corsa Server Manager. Servidor: ${serverName}`,
    repeatEnabled: false,
    repeatFrequency: 'none',
    repeatUntil: '',
    visible: true,
    featured: true,
    source: 'acsm',
    sourceKey: 'current-combo',
    raw: { cfgPath, serverName, trackCode, carCodes }
  };
}

async function gcAcsmUpsertCalendarEvent(event: any) {
  await gcAcsmEnsureCalendarSchema();
  const now = new Date().toISOString();
  if (useMysqlStorage()) {
    await mysqlExecute(`
      INSERT INTO gc_calendar_events
        (id, type, title, start_date, start_time, end_date, end_time, track_name, car_names, link_url, description, repeat_enabled, repeat_frequency, repeat_until, visible, featured, source, source_key, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        type = VALUES(type), title = VALUES(title), start_date = VALUES(start_date), start_time = VALUES(start_time), end_date = VALUES(end_date), end_time = VALUES(end_time),
        track_name = VALUES(track_name), car_names = VALUES(car_names), link_url = VALUES(link_url), description = VALUES(description), repeat_enabled = VALUES(repeat_enabled),
        repeat_frequency = VALUES(repeat_frequency), repeat_until = VALUES(repeat_until), visible = VALUES(visible), featured = VALUES(featured), source = VALUES(source), source_key = VALUES(source_key),
        raw_json = VALUES(raw_json), updated_at = VALUES(updated_at)
    `, [
      event.id, event.type, event.title, event.startDate, event.startTime || null, event.endDate || null, event.endTime || null,
      event.trackName || null, event.carNames || null, event.linkUrl || null, event.description || null, event.repeatEnabled ? 1 : 0,
      event.repeatFrequency || 'none', event.repeatUntil || null, event.visible === false ? 0 : 1, event.featured ? 1 : 0, event.source || 'acsm', event.sourceKey || event.id,
      JSON.stringify(event.raw || {}), gcAcsmSafeIsoToMysql(now), gcAcsmSafeIsoToMysql(now)
    ]);
    return 'mysql';
  }

  if (useSqliteStorage()) {
    await withAppSqliteDb((db: any) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS gc_calendar_events (
          id TEXT NOT NULL PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'combo',
          title TEXT NOT NULL,
          start_date TEXT NOT NULL,
          start_time TEXT NULL,
          end_date TEXT NULL,
          end_time TEXT NULL,
          track_name TEXT NULL,
          car_names TEXT NULL,
          link_url TEXT NULL,
          description TEXT NULL,
          repeat_enabled INTEGER NOT NULL DEFAULT 0,
          repeat_frequency TEXT NOT NULL DEFAULT 'none',
          repeat_until TEXT NULL,
          visible INTEGER NOT NULL DEFAULT 1,
          featured INTEGER NOT NULL DEFAULT 0,
          source TEXT NULL,
          source_key TEXT NULL,
          raw_json TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        INSERT OR REPLACE INTO gc_calendar_events
          (id, type, title, start_date, start_time, end_date, end_time, track_name, car_names, link_url, description, repeat_enabled, repeat_frequency, repeat_until, visible, featured, source, source_key, raw_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM gc_calendar_events WHERE id = ?), ?), ?)
      `, [
        event.id, event.type, event.title, event.startDate, event.startTime || null, event.endDate || null, event.endTime || null,
        event.trackName || null, event.carNames || null, event.linkUrl || null, event.description || null, event.repeatEnabled ? 1 : 0,
        event.repeatFrequency || 'none', event.repeatUntil || null, event.visible === false ? 0 : 1, event.featured ? 1 : 0, event.source || 'acsm', event.sourceKey || event.id,
        JSON.stringify(event.raw || {}), event.id, now, now
      ]);
    }, true);
    return 'sqlite';
  }

  throw new Error('ACSM sync requiere APP_STORAGE_DRIVER=mysql o sqlite.');
}

app.get('/api/admin/acsm/status', async (req, res) => {
  try {
    const admin = await gcAcsmGetAdminUser(req);
    if (!admin) return res.status(403).json({ ok: false, message: 'Acceso admin requerido.', source: 'acsm-priority-v3' });
    const cfgPath = process.env.ACSM_SERVER_CFG_PATH?.trim() || '/185.216.144.78_9800/cfg/server_cfg.ini';
    const raw = await gcAcsmReadRemoteText(cfgPath);
    const values = gcAcsmParseIni(raw);
    const trackCode = values.TRACK || values['SERVER.TRACK'] || '';
    const carCodes = String(values.CARS || values['SERVER.CARS'] || '').split(';').map((item) => item.trim()).filter(Boolean);
    const resolved = await gcAcsmResolveNames(trackCode, carCodes);
    return res.json({
      ok: true,
      source: 'acsm-priority-v3',
      admin: { id: admin.id, displayName: admin.displayName, role: admin.role },
      config: {
        panelUrl: process.env.ACSM_PANEL_URL || null,
        hostConfigured: Boolean(process.env.ACSM_SFTP_HOST?.trim()),
        port: Number(process.env.ACSM_SFTP_PORT || 22),
        userConfigured: Boolean(process.env.ACSM_SFTP_USER?.trim()),
        passwordConfigured: Boolean(process.env.ACSM_SFTP_PASSWORD),
        cfgPath
      },
      combo: { serverName: values.NAME || values['SERVER.NAME'] || '', trackCode, trackName: resolved.trackName, carCodes, carNames: resolved.carNames },
      checkedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer ACSM.', source: 'acsm-priority-v3' });
  }
});

app.post('/api/admin/acsm/sync-current-combo', async (req, res) => {
  try {
    const admin = await gcAcsmGetAdminUser(req);
    if (!admin) return res.status(403).json({ ok: false, message: 'Acceso admin requerido.', source: 'acsm-priority-v3' });
    const event = await gcAcsmBuildCurrentComboEvent();
    const source = await gcAcsmUpsertCalendarEvent(event);
    return res.json({ ok: true, source, routeSource: 'acsm-priority-v3', event, syncedAt: new Date().toISOString() });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || 'No se pudo sincronizar el combo ACSM.', source: 'acsm-priority-v3' });
  }
});

${end}`;

const re = new RegExp(`${start}[\\s\\S]*?${end}`, 'm');
if (re.test(source)) {
  source = source.replace(re, block);
} else {
  const patterns = [
    /const\s+app\s*=\s*express\(\);?/, 
    /const\s+server\s*=\s*express\(\);?/
  ];
  let inserted = false;
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && typeof match.index === 'number') {
      const insertAt = match.index + match[0].length;
      source = source.slice(0, insertAt) + '\n' + block + '\n' + source.slice(insertAt);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    console.error('ERROR: No he encontrado const app = express(); para insertar rutas prioritarias ACSM.');
    process.exit(1);
  }
}

const backup = `${serverPath}.backup-acsm-priority-v3-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverPath, backup);
fs.writeFileSync(serverPath, source, 'utf8');
console.log('OK: rutas prioritarias ACSM v3 aplicadas.');
console.log(`Backup: ${path.relative(root, backup)}`);
