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
const marker = 'GC_CALENDAR_EVENTS_PATCH_V4_SAFE_FILE_STORAGE';

// Limpia todos los parches anteriores. V1 no tenía marca END, así que se corta
// hasta el siguiente parche conocido o hasta el primer middleware estático.
source = source.replace(/\n?\/\/ GC_CALENDAR_EVENTS_PATCH_V4_SAFE_FILE_STORAGE[\s\S]*?\/\/ END GC_CALENDAR_EVENTS_PATCH_V4_SAFE_FILE_STORAGE\n?/g, '\n');
source = source.replace(/\n?\/\/ GC_CALENDAR_EVENTS_PATCH_V3[\s\S]*?\/\/ END GC_CALENDAR_EVENTS_PATCH_V3\n?/g, '\n');
source = source.replace(/\n?\/\/ GC_CALENDAR_EVENTS_PATCH_V2[\s\S]*?\/\/ END GC_CALENDAR_EVENTS_PATCH_V2\n?/g, '\n');
source = source.replace(/\n?\/\/ GC_CALENDAR_API_ROUTES_V1[\s\S]*?(?=\n\/\/ GC_CALENDAR_EVENTS_PATCH_V|\napp\.use\(express\.static|\napp\.get\(['"]\*|\napp\.get\([`'"]\/\*|\napp\.listen\()/g, '\n');

const block = `
// ${marker}
app.use(express.json({ limit: '1mb' }));

const gcCalendarV4AllowedTypes = ['combo', 'race_lfm', 'race_gc'] as const;
type GcCalendarV4Type = typeof gcCalendarV4AllowedTypes[number];
type GcCalendarV4Event = {
  id: string;
  type: GcCalendarV4Type;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  trackName: string;
  carNames: string;
  description: string;
  linkUrl: string;
  visible: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

type GcCalendarV4Store = {
  version: 1;
  updatedAt: string;
  events: GcCalendarV4Event[];
};

function gcCalendarV4Type(value: unknown): GcCalendarV4Type {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'race' || raw === 'race_gc' || raw === 'grasscutters' || raw === 'carrera_gc') return 'race_gc';
  if (raw === 'lfm' || raw === 'race_lfm' || raw === 'carrera_lfm') return 'race_lfm';
  return 'combo';
}

function gcCalendarV4Text(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcCalendarV4Date(value: unknown) {
  const text = gcCalendarV4Text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function gcCalendarV4Time(value: unknown) {
  const text = gcCalendarV4Text(value).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
}

function gcCalendarV4Cookie(req: any, name: string) {
  const raw = String(req.headers?.cookie || '');
  const item = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!item) return '';
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return item.slice(name.length + 1); }
}

async function gcCalendarV4AdminUser(req: any) {
  const token = gcCalendarV4Cookie(req, sessionCookieName);
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
    console.error('[GC Calendar V4] Error comprobando admin:', error);
    return null;
  }
}

async function gcCalendarV4RequireAdmin(req: any, res: any) {
  const user = await gcCalendarV4AdminUser(req);
  if (user) return user;
  res.status(403).json({ ok: false, message: 'Solo administradores.' });
  return null;
}

function gcCalendarV4Path() {
  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json');
}

function gcCalendarV4EmptyStore(): GcCalendarV4Store {
  return { version: 1, updatedAt: new Date().toISOString(), events: [] };
}

function gcCalendarV4NormalizeEvent(input: any, existing?: Partial<GcCalendarV4Event>): GcCalendarV4Event {
  const now = new Date().toISOString();
  const startDate = gcCalendarV4Date(input.startDate ?? input.date ?? input.startsAt ?? existing?.startDate);
  const title = gcCalendarV4Text(input.title ?? existing?.title).slice(0, 180);

  if (!title) throw new Error('El título es obligatorio.');
  if (!startDate) throw new Error('La fecha de inicio es obligatoria.');

  return {
    id: gcCalendarV4Text(existing?.id || input.id, crypto.randomUUID()),
    type: gcCalendarV4Type(input.type ?? existing?.type),
    title,
    startDate,
    startTime: gcCalendarV4Time(input.startTime ?? existing?.startTime),
    endDate: gcCalendarV4Date(input.endDate ?? existing?.endDate),
    endTime: gcCalendarV4Time(input.endTime ?? existing?.endTime),
    trackName: gcCalendarV4Text(input.trackName ?? input.track ?? existing?.trackName).slice(0, 180),
    carNames: gcCalendarV4Text(input.carNames ?? input.cars ?? existing?.carNames).slice(0, 600),
    description: gcCalendarV4Text(input.description ?? existing?.description).slice(0, 1600),
    linkUrl: gcCalendarV4Text(input.linkUrl ?? input.link ?? existing?.linkUrl).slice(0, 600),
    visible: input.visible === undefined ? existing?.visible !== false : input.visible !== false,
    featured: input.featured === undefined ? Boolean(existing?.featured) : Boolean(input.featured),
    createdAt: gcCalendarV4Text(existing?.createdAt, now),
    updatedAt: now
  };
}

function gcCalendarV4SafeEvents(value: any): GcCalendarV4Event[] {
  const raw = Array.isArray(value?.events) ? value.events : Array.isArray(value) ? value : [];
  return raw.map((event: any) => {
    try {
      // Compatibilidad con el primer formato del calendario.
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
      return gcCalendarV4NormalizeEvent(event, event);
    } catch {
      return null;
    }
  }).filter(Boolean) as GcCalendarV4Event[];
}

async function gcCalendarV4ReadStore(): Promise<GcCalendarV4Store> {
  const filePath = gcCalendarV4Path();
  if (!fs.existsSync(filePath)) return gcCalendarV4EmptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      updatedAt: gcCalendarV4Text(parsed.updatedAt, new Date().toISOString()),
      events: gcCalendarV4SafeEvents(parsed)
    };
  } catch (error) {
    console.error('[GC Calendar V4] Error leyendo calendar-events.json:', error);
    return gcCalendarV4EmptyStore();
  }
}

async function gcCalendarV4WriteStore(events: GcCalendarV4Event[]): Promise<GcCalendarV4Store> {
  const store: GcCalendarV4Store = {
    version: 1,
    updatedAt: new Date().toISOString(),
    events: gcCalendarV4SafeEvents({ events })
  };
  const filePath = gcCalendarV4Path();
  ensureDirForFile(filePath);
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
  return store;
}

function gcCalendarV4Sort(events: GcCalendarV4Event[]) {
  return [...events].sort((a, b) => {
    const left = `${a.startDate} ${a.startTime || '00:00'}`;
    const right = `${b.startDate} ${b.startTime || '00:00'}`;
    return left.localeCompare(right) || a.title.localeCompare(b.title, 'es');
  });
}

function gcCalendarV4PublicPayload(store: GcCalendarV4Store) {
  return { ok: true, updatedAt: store.updatedAt, events: gcCalendarV4Sort(store.events.filter((event) => event.visible !== false)) };
}

app.get(['/api/calendar-events', '/api/calendar/events'], async (_req: any, res: any) => {
  try {
    const store = await gcCalendarV4ReadStore();
    res.json(gcCalendarV4PublicPayload(store));
  } catch (error: any) {
    console.error('[GC Calendar V4] GET public:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.get(['/api/admin/calendar-events', '/api/admin/calendar/events'], async (req: any, res: any) => {
  const user = await gcCalendarV4RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV4ReadStore();
    res.json({ ok: true, updatedAt: store.updatedAt, storage: { source: 'json', path: gcCalendarV4Path() }, events: gcCalendarV4Sort(store.events) });
  } catch (error: any) {
    console.error('[GC Calendar V4] GET admin:', error);
    res.status(500).json({ ok: false, message: error?.message || 'No se pudo leer el calendario.' });
  }
});

app.post(['/api/admin/calendar-events', '/api/admin/calendar/events'], async (req: any, res: any) => {
  const user = await gcCalendarV4RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV4ReadStore();
    const event = gcCalendarV4NormalizeEvent(req.body || {});
    const existingIndex = store.events.findIndex((item) => item.id === event.id);
    const nextEvents = [...store.events];
    if (existingIndex >= 0) nextEvents[existingIndex] = gcCalendarV4NormalizeEvent(req.body || {}, store.events[existingIndex]);
    else nextEvents.push(event);
    const next = await gcCalendarV4WriteStore(nextEvents);
    res.json({ ok: true, event, events: gcCalendarV4Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo guardar el evento.' });
  }
});

app.put(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV4RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV4ReadStore();
    const index = store.events.findIndex((event) => event.id === req.params.id);
    if (index < 0) return res.status(404).json({ ok: false, message: 'Evento no encontrado.' });
    const event = gcCalendarV4NormalizeEvent(req.body || {}, store.events[index]);
    store.events[index] = event;
    const next = await gcCalendarV4WriteStore(store.events);
    res.json({ ok: true, event, events: gcCalendarV4Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo actualizar el evento.' });
  }
});

app.delete(['/api/admin/calendar-events/:id', '/api/admin/calendar/events/:id'], async (req: any, res: any) => {
  const user = await gcCalendarV4RequireAdmin(req, res);
  if (!user) return;
  try {
    const store = await gcCalendarV4ReadStore();
    const nextEvents = store.events.filter((event) => event.id !== req.params.id);
    const next = await gcCalendarV4WriteStore(nextEvents);
    res.json({ ok: true, deleted: store.events.length - nextEvents.length, events: gcCalendarV4Sort(next.events) });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error?.message || 'No se pudo borrar el evento.' });
  }
});
// END ${marker}
`;

const candidates = [
  'app.use(express.static(distDir',
  'app.use(express.static(',
  "app.get('*'",
  'app.get("*"',
  "app.get('/*'",
  'app.get("/*"',
  'app.listen('
];
let index = -1;
for (const candidate of candidates) {
  const found = source.indexOf(candidate);
  if (found >= 0 && (index < 0 || found < index)) index = found;
}

if (index < 0) source += '\n' + block + '\n';
else source = source.slice(0, index) + block + '\n' + source.slice(index);

const backupPath = serverPath + '.backup-calendar-v4';
fs.copyFileSync(serverPath, backupPath);
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC Calendar] Patch v4 aplicado. Backup:', backupPath);
console.log('[GC Calendar] Endpoints activos: /api/calendar-events y /api/admin/calendar-events');
