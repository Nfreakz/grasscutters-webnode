#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src/server/index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('[GC Calendar] No encuentro src/server/index.ts. Ejecuta este patch desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');
const marker = 'GC_CALENDAR_EVENTS_PATCH_V7_REPEAT_WEEKLY';

function removeOldCalendarBlocks(input) {
  let next = input;
  [
    'GC_CALENDAR_EVENTS_PATCH_V7_REPEAT_WEEKLY',
    'GC_CALENDAR_EVENTS_PATCH_V6_ROUTE_FIRST',
    'GC_CALENDAR_EVENTS_PATCH_V5_ROUTE_FIRST',
    'GC_CALENDAR_EVENTS_PATCH_V4_SAFE_FILE_STORAGE',
    'GC_CALENDAR_EVENTS_PATCH_V3',
    'GC_CALENDAR_EVENTS_PATCH_V2'
  ].forEach((name) => {
    next = next.replace(new RegExp('\\n?// ' + name + '[\\s\\S]*?// END ' + name + '\\n?', 'g'), '\n');
  });
  next = next.replace(/\n?\/\/ GC_CALENDAR_API_ROUTES_V1[\s\S]*?(?=\n\/\/ GC_CALENDAR_EVENTS_PATCH_V|\napp\.use\(express\.static|\napp\.get\(['"]\*|\napp\.get\([`'"]\/\*|\napp\.listen\()/g, '\n');
  return next;
}

const block = `
// ${marker}
app.use(express.json({ limit: '1mb' }));

const gcCalendarV7AllowedTypes = ['combo', 'race_lfm', 'race_gc'] as const;
type GcCalendarV7Type = typeof gcCalendarV7AllowedTypes[number];
type GcCalendarV7RepeatFrequency = 'none' | 'weekly';
type GcCalendarV7Event = {
  id: string;
  type: GcCalendarV7Type;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  trackName: string;
  carNames: string;
  description: string;
  linkUrl: string;
  repeatEnabled: boolean;
  repeatFrequency: GcCalendarV7RepeatFrequency;
  repeatUntil: string;
  visible: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

type GcCalendarV7Store = {
  version: 1;
  updatedAt: string;
  events: GcCalendarV7Event[];
};

function gcCalendarV7Type(value: unknown): GcCalendarV7Type {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'race' || raw === 'race_gc' || raw === 'grasscutters' || raw === 'carrera_gc') return 'race_gc';
  if (raw === 'lfm' || raw === 'race_lfm' || raw === 'carrera_lfm') return 'race_lfm';
  return 'combo';
}

function gcCalendarV7Bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  const raw = String(value).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on' || raw === 'si' || raw === 'sí';
}

function gcCalendarV7Text(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcCalendarV7Date(value: unknown) {
  const text = gcCalendarV7Text(value).slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(text) ? text : '';
}

function gcCalendarV7Time(value: unknown) {
  const text = gcCalendarV7Text(value).slice(0, 5);
  return /^\\d{2}:\\d{2}$/.test(text) ? text : '';
}

function gcCalendarV7Cookie(req: any, name: string) {
  const raw = String(req.headers?.cookie || '');
  const item = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!item) return '';
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return item.slice(name.length + 1); }
}

async function gcCalendarV7AdminUser(req: any) {
  const token = gcCalendarV7Cookie(req, sessionCookieName);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date().toISOString();

  try {
    if (useMysqlStorage()) {
      await ensureMysqlSchema();
      const rows = await mysqlQuery(
        'SELECT u.id, u.email, u.display_name AS displayName, u.role FROM gc_sessions s JOIN gc_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) LIMIT 1',
        [tokenHash]
      );
      return rows[0]?.role === 'admin' ? rows[0] : null;
    }

    if (useSqliteStorage()) {
      const rows = await withAppSqliteDb((db) => sqliteQuery(
        db,
        'SELECT u.id, u.email, u.display_name AS displayName, u.role FROM gc_sessions s JOIN gc_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1',
        [tokenHash, now]
      ));
      return rows[0]?.role === 'admin' ? rows[0] : null;
    }

    const usersPath = getUsersPath();
    if (!fs.existsSync(usersPath)) return null;
    const store = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const session = (store.sessions || []).find((item: any) => item.tokenHash === tokenHash && String(item.expiresAt || '') > now);
    if (!session) return null;
    const user = (store.users || []).find((item: any) => item.id === session.userId);
    return user?.role === 'admin' ? user : null;
  } catch (error) {
    console.error('[GC Calendar V7] Error comprobando admin:', error);
    return null;
  }
}

async function gcCalendarV7RequireAdmin(req: any, res: any) {
  const user = await gcCalendarV7AdminUser(req);
  if (user) return user;
  res.status(403).json({ ok: false, message: 'Solo administradores.' });
  return null;
}

function gcCalendarV7Path() {
  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json');
}

function gcCalendarV7EmptyStore(): GcCalendarV7Store {
  return { version: 1, updatedAt: new Date().toISOString(), events: [] };
}

function gcCalendarV7NormalizeEvent(input: any, existing?: Partial<GcCalendarV7Event>): GcCalendarV7Event {
  const now = new Date().toISOString();
  const startDate = gcCalendarV7Date(input.startDate ?? input.date ?? input.startsAt ?? existing?.startDate);
  const title = gcCalendarV7Text(input.title ?? existing?.title).slice(0, 180);

  if (!title) throw new Error('El título es obligatorio.');
  if (!startDate) throw new Error('La fecha de inicio es obligatoria.');

  const repeatEnabled = gcCalendarV7Bool(input.repeatEnabled, Boolean(existing?.repeatEnabled));
  const repeatFrequency: GcCalendarV7RepeatFrequency = repeatEnabled ? 'weekly' : 'none';

  return {
    id: gcCalendarV7Text(existing?.id || input.id, crypto.randomUUID()),
    type: gcCalendarV7Type(input.type ?? existing?.type),
    title,
    startDate,
    startTime: gcCalendarV7Time(input.startTime ?? existing?.startTime),
    endDate: gcCalendarV7Date(input.endDate ?? existing?.endDate),
    endTime: gcCalendarV7Time(input.endTime ?? existing?.endTime),
    trackName: gcCalendarV7Text(input.trackName ?? input.track ?? existing?.trackName).slice(0, 180),
    carNames: gcCalendarV7Text(input.carNames ?? input.cars ?? existing?.carNames).slice(0, 600),
    description: gcCalendarV7Text(input.description ?? existing?.description).slice(0, 1600),
    linkUrl: gcCalendarV7Text(input.linkUrl ?? input.link ?? existing?.linkUrl).slice(0, 600),
    repeatEnabled,
    repeatFrequency,
    repeatUntil: repeatEnabled ? gcCalendarV7Date(input.repeatUntil ?? existing?.repeatUntil) : '',
    visible: input.visible === undefined ? existing?.visible !== false : input.visible !== false,
    featured: input.featured === undefined ? Boolean(existing?.featured) : Boolean(input.featured),
    createdAt: gcCalendarV7Text(existing?.createdAt, now),
    updatedAt: now
  };
}

function gcCalendarV7SafeEvents(value: any): GcCalendarV7Event[] {
  const raw = Array.isArray(value?.events) ? value.events : Array.isArray(value) ? value : [];
  return raw.map((event: any) => {
    try {
      if (event.startsAt && !event.startDate) {
        const starts = new Date(event.startsAt);
        event.startDate = Number.isNaN(starts.getTime()) ? '' : starts.toISOString().slice(0, 10);
        event.startTime = Number.isNaN(starts.getTime()) ? '' : starts.toISOString().slice(11, 16);
      }
      if (event.endsAt && !event.endDate) {
        const ends = new Date(event.endsAt);
        event.endDate = Number.isNaN(ends.getTime()) ? '' : ends.toISOString().slice(0, 10);
        event.endTime = Number.isNaN(ends.getTime()) ? '' : ends.toISOString().slice(11, 16);
      }
      if (event.combo && !event.title) event.title = event.combo;
      if (event.track && !event.trackName) event.trackName = event.track;
      if (Array.isArray(event.cars) && !event.carNames) event.carNames = event.cars.join(', ');
      if (event.enabled !== undefined && event.visible === undefined) event.visible = event.enabled;
      if (event.repeatFrequency === 'weekly' && event.repeatEnabled === undefined) event.repeatEnabled = true;
      return gcCalendarV7NormalizeEvent(event, event);
    } catch {
      return null;
    }
  }).filter(Boolean) as GcCalendarV7Event[];
}

async function gcCalendarV7ReadStore(): Promise<GcCalendarV7Store> {
  const filePath = gcCalendarV7Path();
  if (!fs.existsSync(filePath)) return gcCalendarV7EmptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      updatedAt: gcCalendarV7Text(parsed.updatedAt, new Date().toISOString()),
      events: gcCalendarV7SafeEvents(parsed)
    };
  } catch (error) {
    console.error('[GC Calendar V7] Error leyendo calendar-events.json:', error);
    return gcCalendarV7EmptyStore();
  }
}

async function gcCalendarV7WriteStore(events: GcCalendarV7Event[]): Promise<GcCalendarV7Store> {
  const store: GcCalendarV7Store = {
    version: 1,
    updatedAt: new Date().toISOString(),
    events: gcCalendarV7SafeEvents({ events })
  };
  const filePath = gcCalendarV7Path();
  ensureDirForFile(filePath);
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2) + '\\n', 'utf8');
  fs.renameSync(tempPath, filePath);
  return store;
}

function gcCalendarV7Sort(events: GcCalendarV7Event[]) {
  return [...events].sort((a, b) => {
    const left = String(a.startDate || '') + ' ' + String(a.startTime || '00:00');
    const right = String(b.startDate || '') + ' ' + String(b.startTime || '00:00');
    return left.localeCompare(right) || a.title.localeCompare(b.title, 'es');
  });
}

function gcCalendarV7PublicPayload(store: GcCalendarV7Store) {
  return { ok: true, updatedAt: store.updatedAt, events: gcCalendarV7Sort(store.events.filter((event) => event.visible !== false)) };
}

app.get(['/api/calendar-events', '/api/calendar/events', '/api/calendar'], async (_req: any, res: any) => {
  try {
    const store = await gcCalendarV7ReadStore();
    res.json(gcCalendarV7PublicPayload(store));
  } catch (error: any) {
    console.error('[GC Calendar V7] GET public:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.get(['/api/admin/calendar-events', '/api/admin/calendar/events', '/api/admin/calendar'], async (req: any, res: any) => {
  const user = await gcCalendarV7RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV7ReadStore();
    res.json({ ok: true, updatedAt: store.updatedAt, storage: { source: 'json', path: gcCalendarV7Path() }, events: gcCalendarV7Sort(store.events) });
  } catch (error: any) {
    console.error('[GC Calendar V7] GET admin:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.post(['/api/admin/calendar-events', '/api/admin/calendar/events', '/api/admin/calendar'], async (req: any, res: any) => {
  const user = await gcCalendarV7RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV7ReadStore();
    const event = gcCalendarV7NormalizeEvent(req.body || {});
    const existingIndex = store.events.findIndex((item) => item.id === event.id);
    const nextEvents = [...store.events];
    if (existingIndex >= 0) nextEvents[existingIndex] = gcCalendarV7NormalizeEvent(req.body || {}, store.events[existingIndex]);
    else nextEvents.push(event);
    const next = await gcCalendarV7WriteStore(nextEvents);
    res.json({ ok: true, event, events: gcCalendarV7Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo guardar el evento.' });
  }
});

app.put(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id', '/api/admin/calendar/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV7RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV7ReadStore();
    const index = store.events.findIndex((event) => event.id === req.params.id);
    if (index < 0) return res.status(404).json({ ok: false, message: 'Evento no encontrado.' });
    const event = gcCalendarV7NormalizeEvent(req.body || {}, store.events[index]);
    store.events[index] = event;
    const next = await gcCalendarV7WriteStore(store.events);
    res.json({ ok: true, event, events: gcCalendarV7Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo actualizar el evento.' });
  }
});

app.delete(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id', '/api/admin/calendar/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV7RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV7ReadStore();
    const nextEvents = store.events.filter((event) => event.id !== req.params.id);
    const next = await gcCalendarV7WriteStore(nextEvents);
    res.json({ ok: true, deleted: store.events.length - nextEvents.length, events: gcCalendarV7Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo borrar el evento.' });
  }
});
// END ${marker}
`;

source = removeOldCalendarBlocks(source);

const expressAppRegex = /(^|\n)(\s*(?:const|let|var)\s+app\s*=\s*express\s*\(\s*\)\s*;)/m;
const match = source.match(expressAppRegex);

let inserted = false;
if (match && match.index !== undefined) {
  const start = match.index + match[1].length;
  const end = start + match[2].length;
  source = source.slice(0, end) + '\n' + block + '\n' + source.slice(end);
  inserted = true;
}

if (!inserted) {
  const candidates = ['app.get(', 'app.post(', 'app.use(', 'app.listen('];
  let index = -1;
  for (const candidate of candidates) {
    const found = source.indexOf(candidate);
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) {
    console.error('[GC Calendar] No he encontrado dónde insertar las rutas. Busca manualmente const app = express();');
    process.exit(1);
  }
  source = source.slice(0, index) + block + '\n' + source.slice(index);
}

const backupPath = serverPath + '.backup-calendar-v7';
fs.copyFileSync(serverPath, backupPath);
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC Calendar] Patch v7 aplicado. Backup:', backupPath);
console.log('[GC Calendar] Repetición semanal activada en API.');
console.log('[GC Calendar] Endpoints activos esperados:');
console.log('  GET  /api/calendar-events');
console.log('  GET  /api/admin/calendar-events');
console.log('  POST /api/admin/calendar-events');
