import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

const WEB_URL = 'https://grasscuttersracing.com';
const HOTLAPS_URL = `${WEB_URL}/hotlaps`;

// ACSM Content Manager Wrapper actual del servidor. Es la fuente buena para saber el combo activo.
const ACSM_DETAILS_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.ACSM_DETAILS_URL) ||
  process.env.ACSM_DETAILS_URL ||
  'http://185.216.144.78:8381/api/details';

type GenericRecord = Record<string, any>;

type ActiveContext = {
  track: string;
  rawTrack: string;
  cars: string[];
  totalLaps: number;
  drivers: number;
  topRows: GenericRecord[];
  source: 'acsm-wrapper' | 'query-param' | 'combo-api' | 'hotlaps-recent' | 'hotlaps-fallback';
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
  return firstString(source, ['carName', 'car', 'carModel', 'car_name', 'vehicle', 'comboCar', 'carLabel', 'car_title', 'model', 'Model'], '');
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
    .replace(/ks_/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function prettyName(value: string, fallback = 'Por detectar'): string {
  const clean = String(value || '').trim();
  if (!clean) return fallback;
  return clean
    .replace(/^ks_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGp\b/g, 'GP')
    .replace(/\bGt\b/g, 'GT');
}

function truncate(text: string, max = 28): string {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function esc(value: string | number): string {
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

async function fetchExternalJson(url: string, timeoutMs = 1800): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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


async function loadFontCss(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '@fontsource', 'rajdhani', 'files', 'rajdhani-latin-700-normal.woff2'),
    path.join(process.cwd(), 'node_modules', '@fontsource', 'rajdhani', 'files', 'rajdhani-latin-600-normal.woff2'),
    path.join(process.cwd(), 'node_modules', '@fontsource', 'rajdhani', 'files', 'rajdhani-latin-500-normal.woff2'),
  ];

  const fonts: string[] = [];
  for (const fontPath of candidates) {
    try {
      const file = await fs.readFile(fontPath);
      const weightMatch = fontPath.match(/-(\d+)-normal\.woff2$/);
      const weight = weightMatch?.[1] || '700';
      fonts.push(`@font-face{font-family:GCRajdhani;src:url(data:font/woff2;base64,${file.toString('base64')}) format('woff2');font-weight:${weight};font-style:normal;font-display:block;}`);
    } catch {
      // optional fallback
    }
  }

  return fonts.join('\n');
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

function extractServerContext(details: any): { track: string; cars: string[]; source: ActiveContext['source'] } | null {
  if (!details || typeof details !== 'object') return null;
  const track = firstString(details, ['track', 'trackName', 'Track'], '');
  const detailCars = Array.isArray(details.cars) ? details.cars.map(String) : [];
  const playerCars = Array.isArray(details?.players?.Cars)
    ? details.players.Cars.map((car: any) => firstString(car, ['Model', 'model'], '')).filter(Boolean)
    : [];
  const cars = uniqueStrings([...detailCars, ...playerCars]);

  if (!track && !cars.length) return null;
  return { track, cars, source: 'acsm-wrapper' };
}

function trackMatches(lapTrack: string, wantedTrack: string): boolean {
  const lap = normalize(lapTrack);
  const wanted = normalize(wantedTrack);
  if (!lap || !wanted) return false;
  return lap === wanted || lap.includes(wanted) || wanted.includes(lap);
}

function carMatches(lapCar: string, allowedCars: string[]): boolean {
  if (!allowedCars.length) return true;
  const lap = normalize(lapCar);
  if (!lap) return true;
  return allowedCars.map(normalize).some((car) => car && (car === lap || car.includes(lap) || lap.includes(car)));
}

function topRowsForTrack(hotlaps: GenericRecord[], track: string, allowedCars: string[] = []): GenericRecord[] {
  const byTrack = hotlaps.filter((lap) => trackMatches(trackName(lap), track));
  const byCar = byTrack.filter((lap) => carMatches(carName(lap), allowedCars));
  const base = byCar.length >= 2 ? byCar : byTrack;
  return base.sort((a, b) => lapMs(a) - lapMs(b)).slice(0, 8);
}

function carOverlapScore(comboCars: string[], serverCars: string[]): number {
  if (!comboCars.length || !serverCars.length) return 0;
  const comboNorms = comboCars.map(normalize).filter(Boolean);
  const serverNorms = serverCars.map(normalize).filter(Boolean);
  let score = 0;

  for (const comboCar of comboNorms) {
    if (serverNorms.some((serverCar) => comboCar === serverCar || comboCar.includes(serverCar) || serverCar.includes(comboCar))) {
      score += 1;
    }
  }

  return score;
}

function findComboStatsForServer(combos: GenericRecord[], track: string, cars: string[]): GenericRecord | null {
  const matches = combos
    .filter(Boolean)
    .filter((combo) => trackMatches(trackName(combo), track))
    .map((combo) => {
      const comboCars = uniqueStrings(carList(combo));
      const overlap = carOverlapScore(comboCars, cars);
      const laps = comboTotalLaps(combo);
      const drivers = comboDrivers(combo);
      const ts = dateMs(combo);
      return {
        combo,
        score: overlap * 1_000_000 + laps * 1_000 + drivers * 10 + ts / 1_000_000_000,
      };
    });

  matches.sort((a, b) => b.score - a.score);
  return matches[0]?.combo || null;
}

function activeContextFromServer(serverContext: { track: string; cars: string[]; source: ActiveContext['source'] }, hotlaps: GenericRecord[], combos: GenericRecord[] = []): ActiveContext {
  const topRows = topRowsForTrack(hotlaps, serverContext.track, serverContext.cars);
  const trackRows = hotlaps.filter((lap) => trackMatches(trackName(lap), serverContext.track));
  const carCounts = new Map<string, number>();
  const drivers = new Set<string>();

  for (const lap of trackRows) {
    const car = carName(lap);
    const carKey = normalize(car);
    if (carKey) carCounts.set(car, (carCounts.get(car) || 0) + 1);
    drivers.add(normalize(driverName(lap)) || driverName(lap));
  }

  const comboStats = findComboStatsForServer(combos, serverContext.track, serverContext.cars);
  const carsFromRows = [...carCounts.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car);
  const carsFromStats = comboStats ? uniqueStrings(carList(comboStats)) : [];
  const cars = serverContext.cars.length ? serverContext.cars : (carsFromStats.length ? carsFromStats : carsFromRows);
  const statsLaps = comboStats ? comboTotalLaps(comboStats) : 0;
  const statsDrivers = comboStats ? comboDrivers(comboStats) : 0;

  return {
    track: prettyName(serverContext.track, 'Track por detectar'),
    rawTrack: serverContext.track,
    cars: uniqueStrings(cars.map((car) => prettyName(car, car))).slice(0, 5),
    totalLaps: statsLaps || trackRows.length,
    drivers: statsDrivers || drivers.size,
    topRows,
    source: comboStats ? 'combo-api' : serverContext.source,
  };
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
      const score = (activeFlag ? 1_000_000_000_000 : 0) + ts + laps;
      return { combo, track, cars, score };
    })
    .filter((entry) => entry.track || entry.cars.length);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.combo || null;
}

function detectContextFromHotlaps(hotlaps: GenericRecord[]): ActiveContext | null {
  if (!hotlaps.length) return null;
  const sorted = [...hotlaps].sort((a, b) => dateMs(b) - dateMs(a) || lapMs(a) - lapMs(b));
  const newestTs = dateMs(sorted[0]);
  let recentScope = sorted.slice(0, 250);
  if (newestTs > 0) {
    const cutoff = newestTs - 7 * 24 * 60 * 60 * 1000;
    const recentByDate = sorted.filter((lap) => dateMs(lap) >= cutoff);
    if (recentByDate.length) recentScope = recentByDate.slice(0, 600);
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

  const ranked = [...groups.values()].sort((a, b) => b.latest - a.latest || b.laps.length - a.laps.length);
  const best = ranked[0];
  if (!best) return null;

  const cars = [...best.cars.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car);
  const topRows = topRowsForTrack(sorted, best.track, cars);

  return {
    track: prettyName(best.track, 'Track por detectar'),
    rawTrack: best.track,
    cars: uniqueStrings(cars).slice(0, 5),
    totalLaps: best.laps.length,
    drivers: best.drivers.size,
    topRows,
    source: newestTs > 0 ? 'hotlaps-recent' : 'hotlaps-fallback',
  };
}

function resolveActiveContext(combos: GenericRecord[], hotlaps: GenericRecord[], serverContext: { track: string; cars: string[]; source: ActiveContext['source'] } | null): ActiveContext {
  if (serverContext && (serverContext.track || serverContext.cars.length)) {
    return activeContextFromServer(serverContext, hotlaps, combos);
  }

  const combo = chooseActiveComboFromApi(combos);
  if (combo) {
    const comboTrack = trackName(combo);
    const comboCars = uniqueStrings(carList(combo));
    const comboTopRows = comboTrack ? topRowsForTrack(hotlaps, comboTrack, comboCars) : [];
    if (comboTrack && comboTopRows.length) {
      const trackRows = hotlaps.filter((lap) => trackMatches(trackName(lap), comboTrack));
      return {
        track: prettyName(comboTrack, 'Track por detectar'),
        rawTrack: comboTrack,
        cars: comboCars,
        totalLaps: comboTotalLaps(combo) || trackRows.length,
        drivers: comboDrivers(combo) || new Set(trackRows.map((lap) => normalize(driverName(lap)))).size,
        topRows: comboTopRows,
        source: 'combo-api',
      };
    }
  }

  return detectContextFromHotlaps(hotlaps) || {
    track: combo ? prettyName(trackName(combo), 'Track por detectar') : 'Track por detectar',
    rawTrack: combo ? trackName(combo) : '',
    cars: combo ? uniqueStrings(carList(combo)) : [],
    totalLaps: combo ? comboTotalLaps(combo) : 0,
    drivers: combo ? comboDrivers(combo) : 0,
    topRows: [],
    source: 'hotlaps-fallback',
  };
}

function buildSvg(params: { context: ActiveContext; totalHotlaps: number; logoDataUri: string | null; fontCss: string; error?: string }) {
  const { context, totalHotlaps, logoDataUri, fontCss, error } = params;
  const updated = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const trackText = truncate(context.track || 'Track por detectar', 22);
  const carsText = context.cars.length ? truncate(context.cars.join(' + '), 36) : 'Coche por detectar';
  const rows = context.topRows.length
    ? context.topRows.map((lap, index) => ({
        pos: String(index + 1).padStart(2, '0'),
        driver: truncate(driverName(lap), 10),
        car: truncate(prettyName(carName(lap), carName(lap)), 15),
        time: msToText(lapMs(lap)),
      }))
    : [{ pos: '--', driver: 'Sin datos', car: 'Sin vueltas', time: '--:--.---' }];

  const rowStartY = 410;
  const rowStep = 45;

  const rowSvgs = rows.slice(0, 8).map((row, index) => {
    const y = rowStartY + index * rowStep;
    const bg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
    const timeFill = index === 0 ? '#b8ff5f' : '#eaf4ea';
    return `
      <rect x="18" y="${y - 23}" width="374" height="36" rx="10" fill="${bg}" />
      <text x="30" y="${y}" fill="#9cff3f" font-size="13" font-weight="800" font-family="GCRajdhani, Arial, sans-serif">${esc(row.pos)}</text>
      <text x="68" y="${y}" fill="#ffffff" font-size="13" font-weight="700" font-family="GCRajdhani, Arial, sans-serif">${esc(row.driver)}</text>
      <text x="166" y="${y}" fill="#8fa598" font-size="12" font-family="GCRajdhani, Arial, sans-serif">${esc(row.car)}</text>
      <text x="374" y="${y}" text-anchor="end" fill="${timeFill}" font-size="13" font-weight="800" font-family="GCRajdhani, Arial, sans-serif">${esc(row.time)}</text>`;
  }).join('');

  const logoMarkup = logoDataUri
    ? `<image href="${logoDataUri}" x="22" y="18" width="78" height="78" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="26" y="56" fill="#9cff3f" font-size="22" font-weight="900" font-family="GCRajdhani, Arial, sans-serif">GC</text>`;

  const footerInfo = error
    ? `API: ${error}`
    : `${totalHotlaps.toLocaleString('es-ES')} hotlaps · ${context.source === 'acsm-wrapper' ? 'ACSM wrapper' : 'hotlaps'}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="420" height="940" viewBox="0 0 420 940" role="img" aria-labelledby="title desc">
    <title id="title">GrassCutters ACSM loading card</title>
    <desc id="desc">Tarjeta estrecha para Content Manager con combo actual y hotlaps reales.</desc>
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#040806" />
        <stop offset="63%" stop-color="#07110c" />
        <stop offset="100%" stop-color="#020404" />
      </linearGradient>
      <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9cff3f" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#15b9c9" stop-opacity="0.82" />
      </linearGradient>
      <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="30" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <style>
      ${fontCss}
      text{font-family:GCRajdhani,Arial,sans-serif;paint-order:stroke fill;stroke:transparent;stroke-width:0;}
    </style>

    <rect width="420" height="940" fill="url(#bg)" />
    <circle cx="20" cy="44" r="120" fill="#76ff03" opacity="0.12" filter="url(#glowGreen)" />
    <circle cx="390" cy="120" r="86" fill="#00c6ff" opacity="0.07" filter="url(#glowGreen)" />
    <rect x="10" y="10" width="400" height="918" rx="22" fill="rgba(8,14,10,0.91)" stroke="rgba(161,255,95,0.18)" />
    <rect x="10" y="10" width="400" height="4" rx="2" fill="url(#heroLine)" />

    ${logoMarkup}
    <text x="110" y="42" fill="#9cff3f" font-size="10" font-weight="800" letter-spacing="2" font-family="GCRajdhani, Arial, sans-serif">GRASSCUTTERS AC SERVER</text>
    <text x="110" y="72" fill="#ffffff" font-size="27" font-weight="900" letter-spacing="-0.8" font-family="GCRajdhani, Arial, sans-serif">Paddock live</text>
    <text x="110" y="94" fill="#c5d2c8" font-size="12.5" font-family="GCRajdhani, Arial, sans-serif">Combo actual y tiempos reales.</text>

    <rect x="18" y="122" width="384" height="128" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(134,255,93,0.12)" />
    <text x="30" y="152" fill="#9cff3f" font-size="10" font-weight="800" letter-spacing="2" font-family="GCRajdhani, Arial, sans-serif">COMBO ACTUAL</text>
    <text x="30" y="189" fill="#ffffff" font-size="20" font-weight="900" letter-spacing="-0.6" font-family="GCRajdhani, Arial, sans-serif">${esc(trackText || 'Track por detectar')}</text>
    <text x="30" y="217" fill="#d4e1d6" font-size="10.5" font-family="GCRajdhani, Arial, sans-serif">${esc(carsText)}</text>

    <rect x="264" y="144" width="1" height="76" fill="rgba(255,255,255,0.08)" />
    <text x="282" y="164" fill="#86a193" font-size="8.5" font-weight="700" letter-spacing="1.5" font-family="GCRajdhani, Arial, sans-serif">VUELTAS</text>
    <text x="282" y="194" fill="#ffffff" font-size="24" font-weight="900" font-family="GCRajdhani, Arial, sans-serif">${esc(context.totalLaps || '--')}</text>
    <text x="342" y="164" fill="#86a193" font-size="8.5" font-weight="700" letter-spacing="1.5" font-family="GCRajdhani, Arial, sans-serif">PIL.</text>
    <text x="342" y="194" fill="#ffffff" font-size="24" font-weight="900" font-family="GCRajdhani, Arial, sans-serif">${esc(context.drivers || '--')}</text>
    <text x="282" y="216" fill="#9ab0a0" font-size="8.5" font-family="GCRajdhani, Arial, sans-serif">Act.: ${esc(updated)}</text>

    <rect x="18" y="274" width="384" height="500" rx="16" fill="rgba(5,11,8,0.88)" stroke="rgba(43,206,228,0.18)" />
    <text x="30" y="306" fill="#25d6e6" font-size="10" font-weight="800" letter-spacing="2" font-family="GCRajdhani, Arial, sans-serif">TOP HOTLAPS</text>
    <text x="30" y="336" fill="#ffffff" font-size="18" font-weight="900" letter-spacing="-0.5" font-family="GCRajdhani, Arial, sans-serif">Solo del combo actual</text>
    <text x="30" y="360" fill="#93a79a" font-size="9.5" font-family="GCRajdhani, Arial, sans-serif">${esc(HOTLAPS_URL.replace('https://',''))}</text>

    <text x="30" y="386" fill="#25d6e6" font-size="9.2" font-weight="800" letter-spacing="1.4" font-family="GCRajdhani, Arial, sans-serif">#</text>
    <text x="68" y="386" fill="#25d6e6" font-size="9.2" font-weight="800" letter-spacing="1.4" font-family="GCRajdhani, Arial, sans-serif">PILOTO</text>
    <text x="166" y="386" fill="#25d6e6" font-size="9.2" font-weight="800" letter-spacing="1.4" font-family="GCRajdhani, Arial, sans-serif">COCHE</text>
    <text x="374" y="386" text-anchor="end" fill="#25d6e6" font-size="9.2" font-weight="800" letter-spacing="1.4" font-family="GCRajdhani, Arial, sans-serif">TIEMPO</text>

    ${rowSvgs}

    <rect x="18" y="796" width="384" height="116" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(161,255,95,0.12)" />
    <text x="30" y="825" fill="#9cff3f" font-size="10" font-weight="800" letter-spacing="1.8" font-family="GCRajdhani, Arial, sans-serif">COMUNIDAD</text>
    <text x="30" y="860" fill="#ffffff" font-size="12" font-weight="800" font-family="GCRajdhani, Arial, sans-serif">grasscuttersracing.com</text>
    <text x="30" y="914" fill="#97ae9f" font-size="8.2" font-family="GCRajdhani, Arial, sans-serif">${esc(truncate(footerInfo, 72))}</text>
  </svg>`;
}

export async function GET({ request }: { request: Request }) {
  const origin = getRequestOrigin(request);
  const requestUrl = new URL(request.url);
  let totalHotlaps = 0;
  let error = '';
  let context: ActiveContext = {
    track: 'Track por detectar',
    rawTrack: '',
    cars: [],
    totalLaps: 0,
    drivers: 0,
    topRows: [],
    source: 'hotlaps-fallback',
  };

  try {
    const [combosData, hotlapsData, acsmDetails] = await Promise.all([
      fetchJson(origin, '/api/combos/stats?limit=300&sort=recent').catch(() => null),
      fetchJson(origin, '/api/hotlaps?limit=5000'),
      fetchExternalJson(ACSM_DETAILS_URL).catch(() => null),
    ]);

    const combos = items(combosData).filter(Boolean);
    const hotlaps = items(hotlapsData)
      .filter((lap) => Number.isFinite(lapMs(lap)))
      .filter((lap) => trackName(lap) || carName(lap));

    const trackOverride = requestUrl.searchParams.get('track') || '';
    const carsOverride = requestUrl.searchParams.get('cars') || '';
    const serverContext =
      trackOverride || carsOverride
        ? { track: trackOverride, cars: carsOverride.split(',').map((car) => car.trim()).filter(Boolean), source: 'query-param' as const }
        : extractServerContext(acsmDetails);

    totalHotlaps = hotlaps.length;
    context = resolveActiveContext(combos, hotlaps, serverContext);
  } catch (err: any) {
    error = err?.message || String(err);
  }

  const [logoDataUri, fontCss] = await Promise.all([loadLogoDataUri(), loadFontCss()]);
  const svg = buildSvg({ context, totalHotlaps, logoDataUri, fontCss, error });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
