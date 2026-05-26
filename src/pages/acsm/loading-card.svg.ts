import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

const WEB_URL = 'https://grasscuttersracing.com';
const HOTLAPS_URL = `${WEB_URL}/hotlaps`;
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

const FONT: Record<string, string[]> = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01111','10000','10000','10000','10000','10000','01111'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01111','10000','10000','10011','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['11111','00100','00100','00100','00100','00100','11111'],
  'J': ['00111','00010','00010','00010','10010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','10101','01010'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01111','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','11110'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
  "'": ['01100','01100','00100','01000','00000','00000','00000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '#': ['01010','01010','11111','01010','11111','01010','01010'],
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
  if (joined) return joined.split(/\s*[+,|/]\s*/g).map((item) => item.trim()).filter(Boolean);
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

function stripAccents(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
}

function normalize(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/ks_/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function prettyName(value: string, fallback = 'Por detectar'): string {
  const clean = stripAccents(String(value || '').trim());
  if (!clean) return fallback;
  return clean
    .replace(/^ks_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGp\b/g, 'GP')
    .replace(/\bGt\b/g, 'GT')
    .replace(/\bBmw\b/g, 'BMW');
}

function cleanForPixelText(value: string): string {
  return stripAccents(value)
    .replace(/[^a-zA-Z0-9 .:\/_+&'!?#()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function measureText(text: string, scale: number, letterSpacing = scale): number {
  const clean = cleanForPixelText(text).toUpperCase();
  let width = 0;
  for (const char of clean) {
    if (char === ' ') width += 3 * scale + letterSpacing;
    else width += 5 * scale + letterSpacing;
  }
  return Math.max(0, width - letterSpacing);
}

function fitText(text: string, maxWidth: number, scale: number, letterSpacing = scale): string {
  const clean = cleanForPixelText(text);
  if (measureText(clean, scale, letterSpacing) <= maxWidth) return clean;
  let result = clean;
  while (result.length > 1 && measureText(`${result}...`, scale, letterSpacing) > maxWidth) {
    result = result.slice(0, -1).trimEnd();
  }
  return `${result}...`;
}

function pixelText(text: string, x: number, y: number, scale: number, fill: string, options: { letterSpacing?: number; opacity?: number; maxWidth?: number } = {}): string {
  const letterSpacing = options.letterSpacing ?? scale;
  const opacity = options.opacity ?? 1;
  const value = options.maxWidth ? fitText(text, options.maxWidth, scale, letterSpacing) : cleanForPixelText(text);
  const clean = value.toUpperCase();
  let cursor = x;
  const rects: string[] = [];

  for (const char of clean) {
    if (char === ' ') {
      cursor += 3 * scale + letterSpacing;
      continue;
    }
    const glyph = FONT[char] || FONT['?'];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] !== '1') continue;
        rects.push(`<rect x="${(cursor + col * scale).toFixed(2)}" y="${(y + row * scale).toFixed(2)}" width="${scale.toFixed(2)}" height="${scale.toFixed(2)}" fill="${fill}" opacity="${opacity}" />`);
      }
    }
    cursor += 5 * scale + letterSpacing;
  }
  return `<g shape-rendering="crispEdges">${rects.join('')}</g>`;
}

function pixelTextRight(text: string, rightX: number, y: number, scale: number, fill: string, options: { letterSpacing?: number; opacity?: number; maxWidth?: number } = {}): string {
  const letterSpacing = options.letterSpacing ?? scale;
  const value = options.maxWidth ? fitText(text, options.maxWidth, scale, letterSpacing) : cleanForPixelText(text);
  const width = measureText(value, scale, letterSpacing);
  return pixelText(value, rightX - width, y, scale, fill, { ...options, maxWidth: undefined });
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
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) return `${forwardedProto}://${host}`;

  const envOrigin =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_API_BASE_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.FRONTEND_URL) ||
    process.env.PUBLIC_API_BASE_URL ||
    process.env.FRONTEND_URL ||
    '';
  if (envOrigin && !String(envOrigin).includes('localhost')) return String(envOrigin).replace(/\/$/, '');
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
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
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

function metricsFromCombos(combos: GenericRecord[], track: string, fallbackRows: GenericRecord[]) {
  const match = combos.find((combo) => trackMatches(trackName(combo), track));
  if (match) {
    return {
      totalLaps: comboTotalLaps(match) || fallbackRows.length,
      drivers: comboDrivers(match) || new Set(fallbackRows.map((lap) => normalize(driverName(lap)))).size,
    };
  }
  return {
    totalLaps: fallbackRows.length,
    drivers: new Set(fallbackRows.map((lap) => normalize(driverName(lap)))).size,
  };
}

function activeContextFromServer(serverContext: { track: string; cars: string[]; source: ActiveContext['source'] }, hotlaps: GenericRecord[], combos: GenericRecord[]): ActiveContext {
  const topRows = topRowsForTrack(hotlaps, serverContext.track, serverContext.cars);
  const trackRows = hotlaps.filter((lap) => trackMatches(trackName(lap), serverContext.track));
  const metrics = metricsFromCombos(combos, serverContext.track, trackRows);
  const carCounts = new Map<string, number>();

  for (const lap of trackRows) {
    const car = carName(lap);
    const carKey = normalize(car);
    if (carKey) carCounts.set(car, (carCounts.get(car) || 0) + 1);
  }

  const carsFromRows = [...carCounts.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car);
  const cars = serverContext.cars.length ? serverContext.cars : carsFromRows;

  return {
    track: prettyName(serverContext.track, 'Track por detectar'),
    rawTrack: serverContext.track,
    cars: uniqueStrings(cars.map((car) => prettyName(car, car))).slice(0, 5),
    totalLaps: metrics.totalLaps,
    drivers: metrics.drivers,
    topRows,
    source: serverContext.source,
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

function detectContextFromHotlaps(hotlaps: GenericRecord[], combos: GenericRecord[]): ActiveContext | null {
  if (!hotlaps.length) return null;
  const sorted = [...hotlaps].sort((a, b) => dateMs(b) - dateMs(a) || lapMs(a) - lapMs(b));
  const newestTs = dateMs(sorted[0]);
  let recentScope = sorted.slice(0, 250);
  if (newestTs > 0) {
    const cutoff = newestTs - 7 * 24 * 60 * 60 * 1000;
    const recentByDate = sorted.filter((lap) => dateMs(lap) >= cutoff);
    if (recentByDate.length) recentScope = recentByDate.slice(0, 600);
  }

  const groups = new Map<string, { track: string; laps: GenericRecord[]; latest: number; cars: Map<string, number> }>();
  for (const lap of recentScope) {
    const track = trackName(lap);
    const trackNorm = normalize(track);
    if (!trackNorm) continue;
    if (!groups.has(trackNorm)) groups.set(trackNorm, { track, laps: [], latest: 0, cars: new Map() });
    const group = groups.get(trackNorm)!;
    group.laps.push(lap);
    group.latest = Math.max(group.latest, dateMs(lap));
    const car = carName(lap);
    const carNorm = normalize(car);
    if (carNorm) group.cars.set(car, (group.cars.get(car) || 0) + 1);
  }

  const ranked = [...groups.values()].sort((a, b) => b.latest - a.latest || b.laps.length - a.laps.length);
  const best = ranked[0];
  if (!best) return null;

  const cars = [...best.cars.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car);
  const topRows = topRowsForTrack(sorted, best.track, cars);
  const metrics = metricsFromCombos(combos, best.track, best.laps);

  return {
    track: prettyName(best.track, 'Track por detectar'),
    rawTrack: best.track,
    cars: uniqueStrings(cars).slice(0, 5),
    totalLaps: metrics.totalLaps,
    drivers: metrics.drivers,
    topRows,
    source: newestTs > 0 ? 'hotlaps-recent' : 'hotlaps-fallback',
  };
}

function resolveActiveContext(combos: GenericRecord[], hotlaps: GenericRecord[], serverContext: { track: string; cars: string[]; source: ActiveContext['source'] } | null): ActiveContext {
  if (serverContext && (serverContext.track || serverContext.cars.length)) return activeContextFromServer(serverContext, hotlaps, combos);

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

  return detectContextFromHotlaps(hotlaps, combos) || {
    track: combo ? prettyName(trackName(combo), 'Track por detectar') : 'Track por detectar',
    rawTrack: combo ? trackName(combo) : '',
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
  const trackText = context.track || 'Track por detectar';
  const carsText = context.cars.length ? context.cars.join(' + ') : 'Coche por detectar';
  const rows = context.topRows.length
    ? context.topRows.map((lap, index) => ({
        pos: String(index + 1).padStart(2, '0'),
        driver: driverName(lap),
        car: prettyName(carName(lap), carName(lap)),
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
      ${pixelText(row.pos, 30, y - 10, 1.65, '#9cff3f', { maxWidth: 24 })}
      ${pixelText(row.driver, 68, y - 10, 1.65, '#ffffff', { maxWidth: 82 })}
      ${pixelText(row.car, 166, y - 10, 1.35, '#8fa598', { maxWidth: 130 })}
      ${pixelTextRight(row.time, 374, y - 10, 1.55, timeFill, { maxWidth: 84 })}`;
  }).join('');

  const logoMarkup = logoDataUri
    ? `<image href="${logoDataUri}" x="22" y="18" width="78" height="78" preserveAspectRatio="xMidYMid meet" />`
    : pixelText('GC', 26, 44, 3, '#9cff3f');

  const footerInfo = error
    ? `API: ${error}`
    : `${totalHotlaps.toLocaleString('es-ES')} hotlaps - ${context.source === 'acsm-wrapper' ? 'ACSM wrapper' : 'hotlaps'}`;

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

    <rect width="420" height="940" fill="url(#bg)" />
    <circle cx="20" cy="44" r="120" fill="#76ff03" opacity="0.12" filter="url(#glowGreen)" />
    <circle cx="390" cy="120" r="86" fill="#00c6ff" opacity="0.07" filter="url(#glowGreen)" />
    <rect x="10" y="10" width="400" height="918" rx="22" fill="rgba(8,14,10,0.91)" stroke="rgba(161,255,95,0.18)" />
    <rect x="10" y="10" width="400" height="4" rx="2" fill="url(#heroLine)" />

    ${logoMarkup}
    ${pixelText('GRASSCUTTERS AC SERVER', 110, 38, 1.55, '#9cff3f', { maxWidth: 282 })}
    ${pixelText('Paddock live', 110, 66, 3.0, '#ffffff', { maxWidth: 282 })}
    ${pixelText('Combo actual y tiempos reales', 110, 98, 1.45, '#c5d2c8', { maxWidth: 282 })}

    <rect x="18" y="122" width="384" height="128" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(134,255,93,0.12)" />
    ${pixelText('COMBO ACTUAL', 30, 150, 1.35, '#9cff3f', { maxWidth: 200 })}
    ${pixelText(trackText, 30, 182, 2.55, '#ffffff', { maxWidth: 215 })}
    ${pixelText(carsText, 30, 218, 1.25, '#d4e1d6', { maxWidth: 220 })}

    <rect x="264" y="144" width="1" height="76" fill="rgba(255,255,255,0.08)" />
    ${pixelText('VUELTAS', 282, 158, 1.0, '#86a193', { maxWidth: 55 })}
    ${pixelText(String(context.totalLaps || '--'), 282, 181, 3.0, '#ffffff', { maxWidth: 58 })}
    ${pixelText('PIL', 342, 158, 1.0, '#86a193', { maxWidth: 42 })}
    ${pixelText(String(context.drivers || '--'), 342, 181, 3.0, '#ffffff', { maxWidth: 42 })}
    ${pixelText(`ACT ${updated}`, 282, 218, 0.82, '#9ab0a0', { maxWidth: 108 })}

    <rect x="18" y="274" width="384" height="500" rx="16" fill="rgba(5,11,8,0.88)" stroke="rgba(43,206,228,0.18)" />
    ${pixelText('TOP HOTLAPS', 30, 304, 1.35, '#25d6e6', { maxWidth: 170 })}
    ${pixelText('Solo del combo actual', 30, 334, 2.0, '#ffffff', { maxWidth: 340 })}
    ${pixelText(HOTLAPS_URL.replace('https://',''), 30, 363, 1.05, '#93a79a', { maxWidth: 310 })}

    ${pixelText('#', 30, 384, 1.1, '#25d6e6', { maxWidth: 24 })}
    ${pixelText('PILOTO', 68, 384, 1.1, '#25d6e6', { maxWidth: 80 })}
    ${pixelText('COCHE', 166, 384, 1.1, '#25d6e6', { maxWidth: 80 })}
    ${pixelTextRight('TIEMPO', 374, 384, 1.1, '#25d6e6', { maxWidth: 80 })}

    ${rowSvgs}

    <rect x="18" y="796" width="384" height="116" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(161,255,95,0.12)" />
    ${pixelText('COMUNIDAD', 30, 826, 1.35, '#9cff3f', { maxWidth: 160 })}
    ${pixelText('grasscuttersracing.com', 30, 862, 2.15, '#ffffff', { maxWidth: 330 })}
    ${pixelText(footerInfo, 30, 904, 0.85, '#97ae9f', { maxWidth: 330 })}
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

  const logoDataUri = await loadLogoDataUri();
  const svg = buildSvg({ context, totalHotlaps, logoDataUri, error });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
