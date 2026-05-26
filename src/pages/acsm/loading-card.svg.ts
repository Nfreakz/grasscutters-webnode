import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

const WEB_URL = 'https://grasscuttersracing.com';
const DISCORD_URL = 'discord.gg/jA4yuuH5T';
const WHATSAPP_URL = 'chat.whatsapp.com/JMXKRF4XnG73D4xLzzrlHa';
const INSTAGRAM_URL = 'instagram.com/grasscutters_ac';
const NORMS_URL = `${WEB_URL}/normas`;
const HOTLAPS_URL = `${WEB_URL}/hotlaps`;

type GenericRecord = Record<string, any>;

type ActiveContext = {
  track: string;
  cars: string[];
  totalLaps: number;
  drivers: number;
  topRows: GenericRecord[];
  source: 'combo-api' | 'hotlaps-recent' | 'hotlaps-fallback';
};

function items(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const keys = ['items', 'rows', 'data', 'results', 'hotlaps', 'combos', 'stats'];
  for (const key of keys) {
    const value = (data as any)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstString(source: any, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function firstNumber(source: any, keys: string[], fallback = NaN): number {
  for (const key of keys) {
    const raw = source?.[key];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function trackName(source: any): string {
  return firstString(source, ['trackName', 'track', 'track_name', 'trackDisplay', 'circuit', 'comboTrack', 'trackLabel', 'track_title', 'layoutTrackName'], '');
}

function carName(source: any): string {
  return firstString(source, ['carName', 'car', 'carModel', 'car_name', 'vehicle', 'comboCar', 'carLabel', 'car_title', 'model'], '');
}

function carList(source: any): string[] {
  const directArrays = [source?.cars, source?.carNames, source?.carList, source?.comboCars];
  for (const value of directArrays) {
    if (Array.isArray(value)) {
      return value.map((car: any) => (typeof car === 'string' ? car : carName(car))).map((x) => String(x || '').trim()).filter(Boolean);
    }
  }
  const joined = firstString(source, ['carsText', 'cars', 'comboCarsText'], '');
  if (joined) {
    return joined.split(/\s*[+,|/]\s*/g).map((item) => item.trim()).filter(Boolean);
  }
  const single = carName(source);
  return single ? [single] : [];
}

function comboTotalLaps(source: any): number {
  return firstNumber(source, ['totalLaps', 'laps', 'lapCount', 'total', 'validLaps', 'entries'], 0);
}

function comboDrivers(source: any): number {
  return firstNumber(source, ['driverCount', 'drivers', 'pilots', 'pilotCount', 'entrants'], 0);
}

function lapMs(source: any): number {
  return firstNumber(source, ['lapTimeMs', 'timeMs', 'bestLapMs', 'bestLap', 'lap_ms', 'lapTime'], NaN);
}

function driverName(source: any): string {
  return firstString(source, ['driverName', 'pilotName', 'playerName', 'driver', 'pilot', 'name', 'userName', 'alias'], 'Piloto');
}

function dateMs(source: any): number {
  const keys = ['updatedAt', 'createdAt', 'lastLapAt', 'timestamp', 'date', 'datetime', 'sessionDate'];
  for (const key of keys) {
    const value = source?.[key];
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function truncate(text: string, max = 28): string {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function msToText(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--.---';
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function getHeaderValue(request: Request, names: string[]): string {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value && value.trim()) return value.split(',')[0].trim();
  }
  return '';
}

function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = getHeaderValue(request, ['x-forwarded-host', 'x-original-host']);
  const host = forwardedHost || getHeaderValue(request, ['host']);
  const forwardedProto = getHeaderValue(request, ['x-forwarded-proto', 'x-forwarded-scheme']) || url.protocol.replace(':', '') || 'https';

  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${forwardedProto}://${host}`;
  }

  const envOrigin =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_API_BASE_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.FRONTEND_URL) ||
    process.env.PUBLIC_API_BASE_URL ||
    process.env.FRONTEND_URL ||
    '';

  if (envOrigin && !String(envOrigin).includes('localhost')) {
    return String(envOrigin).replace(/\/$/, '');
  }

  return url.origin;
}

async function fetchJson(origin: string, route: string): Promise<any> {
  const url = new URL(route, origin).toString();
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`No se pudo leer ${route}: ${response.status}`);
  return response.json();
}

async function loadLogoDataUri(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'images', 'newlogo.png');
    const file = await fs.readFile(logoPath);
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch {
    return null;
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = String(value || '').trim();
    const key = normalize(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function chooseActiveComboFromApi(combos: GenericRecord[]): GenericRecord | null {
  const scored = combos
    .filter(Boolean)
    .map((combo) => {
      const activeFlag = ['active', 'isActive', 'current', 'isCurrent', 'latest'].some((key) => Boolean(combo?.[key])) || String(combo?.status || '').toLowerCase() === 'active';
      const track = trackName(combo);
      const cars = carList(combo);
      const ts = dateMs(combo);
      const laps = comboTotalLaps(combo);
      const score = (activeFlag ? 1_000_000 : 0) + ts + laps;
      return { combo, track, cars, score };
    })
    .filter((entry) => entry.track || entry.cars.length);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.combo || null;
}

function topRowsForTrack(hotlaps: GenericRecord[], trackNorm: string, allowedCarsNorm: Set<string>): GenericRecord[] {
  const filtered = hotlaps.filter((lap) => {
    const lapTrack = normalize(trackName(lap));
    if (!lapTrack || lapTrack !== trackNorm) return false;
    if (!allowedCarsNorm.size) return true;
    const lapCar = normalize(carName(lap));
    return allowedCarsNorm.has(lapCar);
  });
  return filtered.sort((a, b) => lapMs(a) - lapMs(b)).slice(0, 8);
}

function detectContextFromHotlaps(hotlaps: GenericRecord[]): ActiveContext | null {
  if (!hotlaps.length) return null;
  const sorted = [...hotlaps].sort((a, b) => dateMs(b) - dateMs(a) || lapMs(a) - lapMs(b));
  const newestTs = dateMs(sorted[0]);
  let recentScope = sorted.slice(0, 300);
  if (newestTs > 0) {
    const cutoff = newestTs - 14 * 24 * 60 * 60 * 1000;
    const recentByDate = sorted.filter((lap) => dateMs(lap) >= cutoff);
    if (recentByDate.length) recentScope = recentByDate.slice(0, 800);
  }

  const groups = new Map<string, { track: string; laps: GenericRecord[]; latest: number; cars: Map<string, number>; drivers: Set<string> }>();
  for (const lap of recentScope) {
    const track = trackName(lap);
    const trackNorm = normalize(track);
    if (!trackNorm) continue;
    if (!groups.has(trackNorm)) {
      groups.set(trackNorm, { track, laps: [], latest: 0, cars: new Map(), drivers: new Set() });
    }
    const group = groups.get(trackNorm)!;
    group.laps.push(lap);
    group.latest = Math.max(group.latest, dateMs(lap));
    const car = carName(lap);
    const carNorm = normalize(car);
    if (carNorm) group.cars.set(car, (group.cars.get(car) || 0) + 1);
    group.drivers.add(normalize(driverName(lap)) || driverName(lap));
  }
  const ranked = [...groups.values()].sort((a, b) => b.laps.length - a.laps.length || b.latest - a.latest);
  const best = ranked[0];
  if (!best) return null;

  const cars = [...best.cars.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car);
  const allowedCarsNorm = new Set(cars.map(normalize));
  const topRows = topRowsForTrack(sorted, normalize(best.track), allowedCarsNorm.size ? allowedCarsNorm : new Set());

  return {
    track: best.track || 'Track por detectar',
    cars: uniqueStrings(cars),
    totalLaps: best.laps.length,
    drivers: best.drivers.size,
    topRows,
    source: newestTs > 0 ? 'hotlaps-recent' : 'hotlaps-fallback',
  };
}

function resolveActiveContext(combos: GenericRecord[], hotlaps: GenericRecord[]): ActiveContext {
  const fromHotlaps = detectContextFromHotlaps(hotlaps);
  const combo = chooseActiveComboFromApi(combos);

  if (combo) {
    const comboTrack = trackName(combo);
    const comboCars = uniqueStrings(carList(combo));
    const comboTrackNorm = normalize(comboTrack);
    const allowedCarsNorm = new Set(comboCars.map(normalize));
    const comboTopRows = comboTrackNorm ? topRowsForTrack(hotlaps, comboTrackNorm, allowedCarsNorm) : [];

    // If combo API has a plausible track and matching hotlaps, prefer it.
    if (comboTrackNorm && comboTopRows.length) {
      return {
        track: comboTrack,
        cars: comboCars,
        totalLaps: comboTotalLaps(combo) || comboTopRows.length,
        drivers: comboDrivers(combo) || new Set(comboTopRows.map((lap) => normalize(driverName(lap)))).size,
        topRows: comboTopRows,
        source: 'combo-api',
      };
    }
  }

  if (fromHotlaps) return fromHotlaps;

  return {
    track: combo ? trackName(combo) || 'Track por detectar' : 'Track por detectar',
    cars: combo ? uniqueStrings(carList(combo)) : [],
    totalLaps: combo ? comboTotalLaps(combo) : 0,
    drivers: combo ? comboDrivers(combo) : 0,
    topRows: [],
    source: 'hotlaps-fallback',
  };
}

function buildSvg(params: { context: ActiveContext; totalHotlaps: number; logoDataUri: string | null; error?: string }) {
  const { context, totalHotlaps, logoDataUri, error } = params;
  const updated = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const trackText = truncate(context.track || 'Track por detectar', 26);
  const carsText = context.cars.length ? truncate(context.cars.join(' + '), 52) : 'Coche por detectar';
  const rows = context.topRows.length
    ? context.topRows.map((lap, index) => ({
        pos: String(index + 1).padStart(2, '0'),
        driver: truncate(driverName(lap), 14),
        car: truncate(carName(lap), 20),
        time: msToText(lapMs(lap)),
      }))
    : [{ pos: '--', driver: 'Sin vueltas', car: 'Esperando datos', time: '--:--.---' }];

  const cardWidth = 660;
  const cardHeight = 1320;
  const rowStartY = 530;
  const rowStep = 58;

  const rowSvgs = rows.slice(0, 8).map((row, index) => {
    const y = rowStartY + index * rowStep;
    const bg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
    const timeFill = index === 0 ? '#b8ff5f' : '#eaf4ea';
    return `
      <rect x="34" y="${y - 26}" width="592" height="44" rx="14" fill="${bg}" />
      <text x="52" y="${y}" fill="#9cff3f" font-size="17" font-weight="800" font-family="Inter, Arial, sans-serif">${esc(row.pos)}</text>
      <text x="106" y="${y}" fill="#ffffff" font-size="17" font-weight="700" font-family="Inter, Arial, sans-serif">${esc(row.driver)}</text>
      <text x="278" y="${y}" fill="#8fa598" font-size="16" font-family="Inter, Arial, sans-serif">${esc(row.car)}</text>
      <text x="604" y="${y}" text-anchor="end" fill="${timeFill}" font-size="17" font-weight="800" font-family="'JetBrains Mono', 'Courier New', monospace">${esc(row.time)}</text>`;
  }).join('');

  const logoMarkup = logoDataUri
    ? `<image href="${logoDataUri}" x="36" y="28" width="120" height="120" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="40" y="74" fill="#9cff3f" font-size="28" font-weight="900" font-family="Inter, Arial, sans-serif">GC</text>`;

  const footerInfo = error
    ? `API: ${error}`
    : `${totalHotlaps.toLocaleString('es-ES')} hotlaps leídas · fuente ${context.source === 'combo-api' ? 'combo + hotlaps' : 'hotlaps recientes'}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="700" height="1360" viewBox="0 0 700 1360" role="img" aria-labelledby="title desc">
    <title id="title">GrassCutters ACSM loading card</title>
    <desc id="desc">Tarjeta compacta para Content Manager con combo actual y hotlaps reales.</desc>
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#040806" />
        <stop offset="60%" stop-color="#07110c" />
        <stop offset="100%" stop-color="#020404" />
      </linearGradient>
      <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9cff3f" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#15b9c9" stop-opacity="0.82" />
      </linearGradient>
      <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="40" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <rect width="700" height="1360" fill="url(#bg)" />
    <circle cx="40" cy="60" r="170" fill="#76ff03" opacity="0.14" filter="url(#glowGreen)" />
    <circle cx="640" cy="160" r="120" fill="#00c6ff" opacity="0.08" filter="url(#glowGreen)" />

    <rect x="20" y="18" width="660" height="1320" rx="28" fill="rgba(8,14,10,0.90)" stroke="rgba(161,255,95,0.18)" />
    <rect x="20" y="18" width="660" height="6" rx="3" fill="url(#heroLine)" />

    ${logoMarkup}
    <text x="170" y="62" fill="#9cff3f" font-size="15" font-weight="800" letter-spacing="2.8" font-family="Inter, Arial, sans-serif">GRASSCUTTERS AC SERVER</text>
    <text x="170" y="98" fill="#ffffff" font-size="42" font-weight="900" letter-spacing="-1.2" font-family="Inter, Arial, sans-serif">Paddock live</text>
    <text x="170" y="126" fill="#c5d2c8" font-size="17" font-family="Inter, Arial, sans-serif">Combo actual y tiempos reales.</text>

    <rect x="34" y="168" width="612" height="176" rx="22" fill="rgba(255,255,255,0.03)" stroke="rgba(134,255,93,0.12)" />
    <text x="52" y="208" fill="#9cff3f" font-size="14" font-weight="800" letter-spacing="2.5" font-family="Inter, Arial, sans-serif">COMBO ACTUAL</text>
    <text x="52" y="258" fill="#ffffff" font-size="28" font-weight="900" letter-spacing="-0.9" font-family="Inter, Arial, sans-serif">${esc(trackText || 'Track por detectar')}</text>
    <text x="52" y="294" fill="#d4e1d6" font-size="15" font-family="Inter, Arial, sans-serif">${esc(carsText)}</text>

    <rect x="428" y="192" width="1" height="112" fill="rgba(255,255,255,0.08)" />
    <text x="452" y="216" fill="#86a193" font-size="11" font-weight="700" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">VUELTAS</text>
    <text x="452" y="256" fill="#ffffff" font-size="32" font-weight="900" font-family="Inter, Arial, sans-serif">${esc((context.totalLaps || 0).toLocaleString('es-ES') || '--')}</text>
    <text x="540" y="216" fill="#86a193" font-size="11" font-weight="700" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">PILOTOS</text>
    <text x="540" y="256" fill="#ffffff" font-size="32" font-weight="900" font-family="Inter, Arial, sans-serif">${esc((context.drivers || 0).toLocaleString('es-ES') || '--')}</text>
    <text x="452" y="294" fill="#9ab0a0" font-size="12" font-family="Inter, Arial, sans-serif">Actualizado: ${esc(updated)}</text>

    <rect x="34" y="376" width="612" height="628" rx="22" fill="rgba(5,11,8,0.88)" stroke="rgba(43,206,228,0.18)" />
    <text x="52" y="418" fill="#25d6e6" font-size="14" font-weight="800" letter-spacing="2.4" font-family="Inter, Arial, sans-serif">TOP HOTLAPS</text>
    <text x="52" y="458" fill="#ffffff" font-size="24" font-weight="900" letter-spacing="-0.7" font-family="Inter, Arial, sans-serif">Solo del combo actual</text>
    <text x="52" y="486" fill="#93a79a" font-size="13" font-family="Inter, Arial, sans-serif">${esc(HOTLAPS_URL)}</text>

    <text x="52" y="530" fill="#25d6e6" font-size="13" font-weight="800" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">POS</text>
    <text x="106" y="530" fill="#25d6e6" font-size="13" font-weight="800" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">PILOTO</text>
    <text x="278" y="530" fill="#25d6e6" font-size="13" font-weight="800" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">COCHE</text>
    <text x="604" y="530" text-anchor="end" fill="#25d6e6" font-size="13" font-weight="800" letter-spacing="1.8" font-family="Inter, Arial, sans-serif">TIEMPO</text>

    ${rowSvgs}

    <rect x="34" y="1032" width="612" height="268" rx="22" fill="rgba(255,255,255,0.03)" stroke="rgba(161,255,95,0.12)" />
    <text x="52" y="1072" fill="#9cff3f" font-size="14" font-weight="800" letter-spacing="2.2" font-family="Inter, Arial, sans-serif">COMUNIDAD</text>

    <text x="52" y="1112" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">WEB</text>
    <text x="130" y="1112" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(WEB_URL.replace('https://',''))}</text>
    <text x="52" y="1142" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">HOTLAPS</text>
    <text x="130" y="1142" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(HOTLAPS_URL.replace('https://',''))}</text>
    <text x="52" y="1172" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">DISCORD</text>
    <text x="130" y="1172" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(DISCORD_URL)}</text>
    <text x="52" y="1202" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">WHATSAPP</text>
    <text x="130" y="1202" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(WHATSAPP_URL)}</text>
    <text x="52" y="1232" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">INSTAGRAM</text>
    <text x="130" y="1232" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(INSTAGRAM_URL)}</text>
    <text x="52" y="1262" fill="#ffffff" font-size="14" font-weight="800" font-family="Inter, Arial, sans-serif">NORMAS</text>
    <text x="130" y="1262" fill="#d6e3d8" font-size="13" font-family="Inter, Arial, sans-serif">${esc(NORMS_URL.replace('https://',''))}</text>

    <text x="52" y="1294" fill="#97ae9f" font-size="11.5" font-family="Inter, Arial, sans-serif">${esc(footerInfo)}</text>
  </svg>`;
}

export async function GET({ request }: { request: Request }) {
  const origin = getRequestOrigin(request);
  let totalHotlaps = 0;
  let error = '';
  let context: ActiveContext = {
    track: 'Track por detectar',
    cars: [],
    totalLaps: 0,
    drivers: 0,
    topRows: [],
    source: 'hotlaps-fallback',
  };

  try {
    const [combosData, hotlapsData] = await Promise.all([
      fetchJson(origin, '/api/combos/stats?limit=300&sort=recent').catch(() => null),
      fetchJson(origin, '/api/hotlaps?limit=5000'),
    ]);

    const combos = items(combosData).filter(Boolean);
    const hotlaps = items(hotlapsData)
      .filter((lap) => Number.isFinite(lapMs(lap)))
      .filter((lap) => trackName(lap) || carName(lap));

    totalHotlaps = hotlaps.length;
    context = resolveActiveContext(combos, hotlaps);
  } catch (err: any) {
    error = err?.message || String(err);
  }

  const logoDataUri = await loadLogoDataUri();
  const svg = buildSvg({ context, totalHotlaps, logoDataUri, error });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
