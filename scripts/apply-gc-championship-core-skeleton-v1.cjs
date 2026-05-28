#!/usr/bin/env node
/* GC_CHAMPIONSHIP_CORE_SKELETON_V1_APPLY
 * Adds public, safe Championship Core endpoints.
 * Scope: ACSM/imported championship/calendar data only.
 * Does NOT touch Race Data Core, Stracker active combo, leaderboard or hotlaps.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_CHAMPIONSHIP_CORE_SKELETON_V1_START */';
const END = '/* GC_CHAMPIONSHIP_CORE_SKELETON_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC CHAMPIONSHIP CORE] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'gcCalendarReadEventsDbV8',
  'getQueryString',
  'getQueryNumber'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC CHAMPIONSHIP CORE] Required function not found: ${name}`);
    console.error('[GC CHAMPIONSHIP CORE] Apply after calendar DB/admin packs exist.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
type GcChampionshipCoreEventV1 = {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  trackName: string;
  carNames: string[];
  description: string;
  linkUrl: string;
  visible: boolean;
  featured: boolean;
  source: 'acsm' | 'manual' | 'calendar';
  tags: string[];
  startsAt: string | null;
  endsAt: string | null;
  isCurrent: boolean;
  isUpcoming: boolean;
};

function gcChampionshipCoreTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcChampionshipCoreBoolV1(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function gcChampionshipCoreCarListV1(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => gcChampionshipCoreTextV1(item)).filter(Boolean);
  return String(value ?? '')
    .split(/[,;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function gcChampionshipCoreDateTimeV1(date: unknown, time: unknown, endOfDay = false) {
  const dateText = String(date ?? '').slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateText)) return null;
  const timeText = String(time ?? '').trim();
  const safeTime = /^\\d{2}:\\d{2}/.test(timeText) ? timeText.slice(0, 5) : endOfDay ? '23:59' : '00:00';
  const parsed = new Date(dateText + 'T' + safeTime + ':00');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function gcChampionshipCoreEventSourceV1(event: any): 'acsm' | 'manual' | 'calendar' {
  const id = String(event?.id ?? '').toLowerCase();
  const description = String(event?.description ?? '').toLowerCase();
  const title = String(event?.title ?? '').toLowerCase();

  if (
    id.includes('acsm') ||
    description.includes('assetto corsa server manager') ||
    description.includes('importado automáticamente desde assetto') ||
    title.includes('acsm')
  ) {
    return 'acsm';
  }

  if (['race_lfm', 'race_gc'].includes(String(event?.type ?? '').toLowerCase())) return 'manual';
  return 'calendar';
}

function gcChampionshipCoreNormalizeEventV1(event: any, nowMs = Date.now()): GcChampionshipCoreEventV1 {
  const startDate = gcChampionshipCoreTextV1(event?.startDate);
  const endDate = gcChampionshipCoreTextV1(event?.endDate) || startDate;
  const startTime = gcChampionshipCoreTextV1(event?.startTime);
  const endTime = gcChampionshipCoreTextV1(event?.endTime);
  const startsAt = gcChampionshipCoreDateTimeV1(startDate, startTime, false);
  const endsAt = gcChampionshipCoreDateTimeV1(endDate, endTime, true);
  const startMs = startsAt ? Date.parse(startsAt) : 0;
  const endMs = endsAt ? Date.parse(endsAt) : startMs;
  const type = gcChampionshipCoreTextV1(event?.type, 'combo');
  const source = gcChampionshipCoreEventSourceV1(event);

  const tags = [
    type,
    source,
    gcChampionshipCoreBoolV1(event?.featured, false) ? 'featured' : '',
    startMs && startMs > nowMs ? 'upcoming' : '',
    startMs && endMs && startMs <= nowMs && endMs >= nowMs ? 'current' : ''
  ].filter(Boolean);

  return {
    id: gcChampionshipCoreTextV1(event?.id),
    type,
    title: gcChampionshipCoreTextV1(event?.title, 'Evento campeonato'),
    startDate,
    endDate,
    startTime,
    endTime,
    trackName: gcChampionshipCoreTextV1(event?.trackName),
    carNames: gcChampionshipCoreCarListV1(event?.carNames),
    description: gcChampionshipCoreTextV1(event?.description),
    linkUrl: gcChampionshipCoreTextV1(event?.linkUrl),
    visible: gcChampionshipCoreBoolV1(event?.visible, true),
    featured: gcChampionshipCoreBoolV1(event?.featured, false),
    source,
    tags,
    startsAt,
    endsAt,
    isCurrent: Boolean(startMs && endMs && startMs <= nowMs && endMs >= nowMs),
    isUpcoming: Boolean(startMs && startMs >= nowMs)
  };
}

function gcChampionshipCoreSortEventsV1(events: GcChampionshipCoreEventV1[]) {
  return [...events].sort((a, b) => {
    const aMs = a.startsAt ? Date.parse(a.startsAt) : 0;
    const bMs = b.startsAt ? Date.parse(b.startsAt) : 0;
    return aMs - bMs || a.title.localeCompare(b.title);
  });
}

async function gcChampionshipCoreReadEventsV1() {
  const nowMs = Date.now();
  const rawEvents = await gcCalendarReadEventsDbV8();
  return gcChampionshipCoreSortEventsV1(
    rawEvents
      .map((event: any) => gcChampionshipCoreNormalizeEventV1(event, nowMs))
      .filter((event: GcChampionshipCoreEventV1) => event.visible !== false)
  );
}

function gcChampionshipCoreSummaryV1(events: GcChampionshipCoreEventV1[]) {
  const now = Date.now();
  const current = events.find((event) => event.isCurrent) || null;
  const upcoming = events.filter((event) => {
    const ms = event.startsAt ? Date.parse(event.startsAt) : 0;
    return ms >= now;
  });
  const nextEvent = upcoming[0] || null;
  const featured = events.filter((event) => event.featured).slice(0, 6);
  const acsmEvents = events.filter((event) => event.source === 'acsm');

  return {
    currentEvent: current,
    nextEvent,
    featured,
    acsmImported: acsmEvents[0] || null,
    counts: {
      total: events.length,
      upcoming: upcoming.length,
      current: current ? 1 : 0,
      featured: featured.length,
      acsm: acsmEvents.length,
      raceGc: events.filter((event) => event.type === 'race_gc').length,
      raceLfm: events.filter((event) => event.type === 'race_lfm').length,
      combo: events.filter((event) => event.type === 'combo').length
    }
  };
}

app.get('/api/gc/championship/snapshot', async (_req, res) => {
  try {
    const events = await gcChampionshipCoreReadEventsV1();
    const summary = gcChampionshipCoreSummaryV1(events);

    res.json({
      ok: true,
      source: 'gc-championship-core',
      generatedAt: new Date().toISOString(),
      domain: 'championship',
      upstream: 'calendar/acsm-import',
      separatedFromRaceDataCore: true,
      summary,
      events: events.slice(0, 12),
      endpoints: {
        snapshot: '/api/gc/championship/snapshot',
        events: '/api/gc/championship/events'
      },
      message: 'Championship Core separado de Race Data Core. No modifica activeCombo ni leaderboard.'
    });
  } catch (error) {
    console.error('[GC Championship Core] snapshot error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-championship-core',
      generatedAt: new Date().toISOString(),
      domain: 'championship',
      message: 'No se pudo generar Championship Core snapshot.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/gc/championship/events', async (req, res) => {
  try {
    const limit = getQueryNumber(req, 'limit', 50, 1, 200);
    const type = getQueryString(req, 'type', 'all').toLowerCase();
    const source = getQueryString(req, 'source', 'all').toLowerCase();
    const scope = getQueryString(req, 'scope', 'all').toLowerCase();
    const q = getQueryString(req, 'q') || getQueryString(req, 'search');

    let events = await gcChampionshipCoreReadEventsV1();
    const now = Date.now();

    if (type !== 'all') events = events.filter((event) => event.type === type);
    if (source !== 'all') events = events.filter((event) => event.source === source);
    if (scope === 'upcoming') events = events.filter((event) => event.startsAt && Date.parse(event.startsAt) >= now);
    if (scope === 'current') events = events.filter((event) => event.isCurrent);
    if (scope === 'featured') events = events.filter((event) => event.featured);
    if (q) {
      events = events.filter((event) => includesFilter([
        event.title,
        event.trackName,
        event.carNames.join(' '),
        event.description,
        event.type,
        event.source
      ].join(' '), q));
    }

    res.json({
      ok: true,
      source: 'gc-championship-core',
      generatedAt: new Date().toISOString(),
      domain: 'championship',
      filters: { type, source, scope, q: q || null },
      count: Math.min(events.length, limit),
      totalMatched: events.length,
      items: events.slice(0, limit),
      message: 'Eventos de campeonato separados de Race Data Core.'
    });
  } catch (error) {
    console.error('[GC Championship Core] events error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-championship-core',
      generatedAt: new Date().toISOString(),
      domain: 'championship',
      items: [],
      message: 'No se pudieron leer los eventos Championship Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${END}
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC CHAMPIONSHIP CORE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

const replaced = replaceMarkedBlock(source, START, END, routeBlock);
if (replaced !== null) {
  source = replaced;
} else {
  const anchor =
    source.includes("app.get('/api/gc/diagnostics'")
      ? "app.get('/api/gc/diagnostics'"
      : source.includes("app.get('/api/gc/snapshot'")
        ? "app.get('/api/gc/snapshot'"
        : "app.get('/api/health'";
  source = insertBefore(source, anchor, routeBlock, 'Championship Core routes');
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC CHAMPIONSHIP CORE] Added/updated /api/gc/championship/* endpoints.');
console.log('[GC CHAMPIONSHIP CORE] Run: npm run build');
