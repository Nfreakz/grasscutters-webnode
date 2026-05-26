import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

const WEB_URL = 'https://grasscuttersracing.com';
const DISCORD_URL = 'discord.gg/jA4yuuH5T';
const WHATSAPP_URL = 'chat.whatsapp.com/JMXKRF4XnG73D4xLzzrlHa';
const INSTAGRAM_URL = 'instagram.com/grasscutters_ac';

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
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function trackName(source: any): string {
  return firstString(source, ['trackName', 'track', 'track_name', 'trackDisplay', 'circuit', 'comboTrack', 'name'], 'Track por detectar');
}

function carName(source: any): string {
  return firstString(source, ['carName', 'car', 'carModel', 'car_name', 'vehicle', 'comboCar', 'name'], 'Coche por detectar');
}

function carList(source: any): string[] {
  const cars = source?.cars;
  if (Array.isArray(cars)) {
    return cars.map((car: any) => (typeof car === 'string' ? car : carName(car))).filter(Boolean);
  }
  const joined = firstString(source, ['carsText', 'carList', 'cars', 'comboCars'], '');
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
  return firstString(source, ['driverName', 'pilotName', 'playerName', 'driver', 'pilot', 'name', 'userName'], 'Piloto');
}

function dateMs(source: any): number {
  const keys = ['updatedAt', 'createdAt', 'lastLapAt', 'timestamp', 'date', 'datetime'];
  for (const key of keys) {
    const value = source?.[key];
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
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

function chooseCombo(combos: any[]): any | null {
  return [...combos].filter(Boolean).sort((a, b) => dateMs(b) - dateMs(a) || comboTotalLaps(b) - comboTotalLaps(a))[0] || null;
}

function matchesCombo(lap: any, combo: any): boolean {
  if (!combo) return true;
  const cTrack = normalize(trackName(combo));
  const lTrack = normalize(trackName(lap));
  const cars = carList(combo).map(normalize).filter(Boolean);
  const lCar = normalize(carName(lap));
  const trackOk = !cTrack || !lTrack || cTrack === lTrack || cTrack.includes(lTrack) || lTrack.includes(cTrack);
  const carOk = !cars.length || cars.some((car) => car === lCar || car.includes(lCar) || lCar.includes(car));
  return trackOk && carOk;
}

function msToText(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--.---';
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function truncate(text: string, max = 28): string {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function padRight(text: string, len: number): string {
  return String(text).padEnd(len, ' ');
}

function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function buildSvg(params: {
  origin: string;
  combo: any | null;
  hotlaps: any[];
  totalHotlaps: number;
  logoDataUri: string | null;
  error?: string;
}) {
  const { combo, hotlaps, totalHotlaps, logoDataUri, error } = params;
  const topRows = hotlaps.slice(0, 8);
  const updated = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const comboTrack = combo ? trackName(combo) : 'Track por detectar';
  const comboCars = combo ? carList(combo) : [];
  const comboCarsText = comboCars.length ? comboCars.join(' + ') : 'Coche por detectar';
  const laps = combo ? comboTotalLaps(combo) : 0;
  const drivers = combo ? comboDrivers(combo) : 0;
  const rows = topRows.length
    ? topRows.map((lap, index) => ({
        pos: String(index + 1).padStart(2, '0'),
        driver: truncate(driverName(lap), 20),
        car: truncate(carName(lap), 28),
        time: msToText(lapMs(lap)),
      }))
    : [{ pos: '--', driver: 'Sin tiempos todavía', car: 'Esperando vueltas válidas', time: '--:--.---' }];

  const rowSvgs = rows.map((row, index) => {
    const y = 794 + index * 68;
    const fill = index === 0 ? '#b6ff5f' : '#eaf4ea';
    const bg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
    return `
      <rect x="74" y="${y - 34}" width="1052" height="54" rx="16" fill="${bg}" />
      <text x="102" y="${y}" fill="#9cff3f" font-size="24" font-weight="800" font-family="Inter, Arial, sans-serif">${esc(row.pos)}</text>
      <text x="170" y="${y}" fill="#ffffff" font-size="24" font-weight="700" font-family="Inter, Arial, sans-serif">${esc(row.driver)}</text>
      <text x="488" y="${y}" fill="#90a89b" font-size="22" font-family="Inter, Arial, sans-serif">${esc(row.car)}</text>
      <text x="1078" y="${y}" text-anchor="end" fill="${fill}" font-size="24" font-weight="800" font-family="'JetBrains Mono', 'Courier New', monospace">${esc(row.time)}</text>`;
  }).join('');

  const logoMarkup = logoDataUri
    ? `<image href="${logoDataUri}" x="72" y="56" width="250" height="250" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="82" y="160" fill="#9cff3f" font-size="48" font-weight="900" font-family="Inter, Arial, sans-serif">GRASSCUTTERS</text>
       <text x="82" y="210" fill="#ffffff" font-size="38" font-weight="800" font-family="Inter, Arial, sans-serif">SIM RACING</text>`;

  const warningText = error ? `Error leyendo API: ${error}` : (totalHotlaps ? `${totalHotlaps.toLocaleString('es-ES')} registros leídos desde la API de hotlaps.` : 'Sin registros detectados en la API de hotlaps.');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-labelledby="title desc">
    <title id="title">GrassCutters Racing loading card</title>
    <desc id="desc">Tarjeta dinámica para ACSM Content Manager con combo actual, hotlaps y enlaces de comunidad.</desc>
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#040806" />
        <stop offset="58%" stop-color="#07110c" />
        <stop offset="100%" stop-color="#020404" />
      </linearGradient>
      <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9cff3f" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#15b9c9" stop-opacity="0.82" />
      </linearGradient>
      <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="60" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.35" />
      </filter>
    </defs>

    <rect width="1200" height="1800" fill="url(#bg)" />
    <circle cx="90" cy="130" r="260" fill="#76ff03" opacity="0.14" filter="url(#glowGreen)" />
    <circle cx="1110" cy="250" r="200" fill="#00c6ff" opacity="0.09" filter="url(#glowGreen)" />
    <circle cx="1030" cy="1680" r="240" fill="#7dff75" opacity="0.06" filter="url(#glowGreen)" />

    <rect x="42" y="34" width="1116" height="1732" rx="38" fill="rgba(8,14,10,0.88)" stroke="rgba(161,255,95,0.22)" />
    <rect x="42" y="34" width="1116" height="8" rx="4" fill="url(#heroLine)" />

    ${logoMarkup}

    <text x="346" y="124" fill="#9cff3f" font-size="22" font-weight="800" letter-spacing="4" font-family="Inter, Arial, sans-serif">GRASSCUTTERS AC SERVER</text>
    <text x="346" y="196" fill="#ffffff" font-size="68" font-weight="900" letter-spacing="-2" font-family="Inter, Arial, sans-serif">Paddock live en Content Manager.</text>
    <text x="346" y="246" fill="#c5d2c8" font-size="24" font-family="Inter, Arial, sans-serif">Combo actual, tiempos reales y enlaces clave de la comunidad.</text>

    <rect x="72" y="314" width="1056" height="228" rx="28" fill="rgba(255,255,255,0.03)" stroke="rgba(134,255,93,0.12)" filter="url(#softShadow)" />
    <text x="104" y="372" fill="#9cff3f" font-size="22" font-weight="800" letter-spacing="3" font-family="Inter, Arial, sans-serif">COMBO ACTUAL</text>
    <text x="104" y="436" fill="#ffffff" font-size="56" font-weight="900" letter-spacing="-1.5" font-family="Inter, Arial, sans-serif">${esc(comboTrack)}</text>
    <text x="104" y="482" fill="#d4e1d6" font-size="24" font-family="Inter, Arial, sans-serif">${esc(comboCarsText)}</text>

    <rect x="808" y="354" width="1" height="148" fill="rgba(255,255,255,0.09)" />
    <text x="842" y="394" fill="#86a193" font-size="18" font-weight="700" letter-spacing="2" font-family="Inter, Arial, sans-serif">VUELTAS TOTALES</text>
    <text x="842" y="446" fill="#ffffff" font-size="56" font-weight="900" font-family="Inter, Arial, sans-serif">${esc(laps ? laps.toLocaleString('es-ES') : '--')}</text>
    <text x="1004" y="394" fill="#86a193" font-size="18" font-weight="700" letter-spacing="2" font-family="Inter, Arial, sans-serif">PILOTOS</text>
    <text x="1004" y="446" fill="#ffffff" font-size="56" font-weight="900" font-family="Inter, Arial, sans-serif">${esc(drivers ? drivers.toLocaleString('es-ES') : '--')}</text>
    <text x="842" y="492" fill="#9ab0a0" font-size="18" font-family="Inter, Arial, sans-serif">Actualizado: ${esc(updated)}</text>

    <rect x="72" y="596" width="1056" height="828" rx="28" fill="rgba(5,11,8,0.86)" stroke="rgba(43,206,228,0.22)" filter="url(#softShadow)" />
    <text x="104" y="654" fill="#25d6e6" font-size="22" font-weight="800" letter-spacing="3" font-family="Inter, Arial, sans-serif">TOP HOTLAPS</text>
    <text x="104" y="714" fill="#ffffff" font-size="44" font-weight="900" letter-spacing="-1" font-family="Inter, Arial, sans-serif">Tiempos reales del combo</text>
    <text x="104" y="758" fill="#93a79a" font-size="22" font-family="Inter, Arial, sans-serif">Fuente: ${esc(WEB_URL)}/api/hotlaps</text>

    <text x="102" y="846" fill="#25d6e6" font-size="19" font-weight="800" letter-spacing="2" font-family="Inter, Arial, sans-serif">POS</text>
    <text x="170" y="846" fill="#25d6e6" font-size="19" font-weight="800" letter-spacing="2" font-family="Inter, Arial, sans-serif">PILOTO</text>
    <text x="488" y="846" fill="#25d6e6" font-size="19" font-weight="800" letter-spacing="2" font-family="Inter, Arial, sans-serif">COCHE</text>
    <text x="1078" y="846" text-anchor="end" fill="#25d6e6" font-size="19" font-weight="800" letter-spacing="2" font-family="Inter, Arial, sans-serif">TIEMPO</text>

    ${rowSvgs}

    <rect x="72" y="1458" width="1056" height="258" rx="28" fill="rgba(255,255,255,0.03)" stroke="rgba(161,255,95,0.12)" filter="url(#softShadow)" />
    <text x="104" y="1518" fill="#9cff3f" font-size="22" font-weight="800" letter-spacing="3" font-family="Inter, Arial, sans-serif">COMUNIDAD / ENLACES</text>

    <text x="104" y="1582" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">WEB</text>
    <text x="220" y="1582" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(WEB_URL)}</text>

    <text x="104" y="1634" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">HOTLAPS</text>
    <text x="220" y="1634" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(WEB_URL)}/hotlaps</text>

    <text x="104" y="1686" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">DISCORD</text>
    <text x="220" y="1686" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(DISCORD_URL)}</text>

    <text x="626" y="1582" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">WHATSAPP</text>
    <text x="818" y="1582" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(WHATSAPP_URL)}</text>

    <text x="626" y="1634" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">INSTAGRAM</text>
    <text x="818" y="1634" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(INSTAGRAM_URL)}</text>

    <text x="626" y="1686" fill="#ffffff" font-size="26" font-weight="800" font-family="Inter, Arial, sans-serif">NORMAS</text>
    <text x="818" y="1686" fill="#d6e3d8" font-size="24" font-family="Inter, Arial, sans-serif">${esc(WEB_URL)}/normas</text>

    <text x="104" y="1738" fill="#97ae9f" font-size="18" font-family="Inter, Arial, sans-serif">${esc(warningText)}</text>
  </svg>`;
}

export async function GET({ request }: { request: Request }) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  let combo: any | null = null;
  let topRows: any[] = [];
  let totalHotlaps = 0;
  let error = '';

  try {
    const [combosData, hotlapsData] = await Promise.all([
      fetchJson(origin, '/api/combos/stats?limit=300&sort=recent').catch(() => null),
      fetchJson(origin, '/api/hotlaps?limit=5000'),
    ]);

    const combos = items(combosData);
    const hotlaps = items(hotlapsData).filter((lap) => Number.isFinite(lapMs(lap)));
    combo = chooseCombo(combos);
    totalHotlaps = hotlaps.length;

    const comboHotlaps = combo ? hotlaps.filter((lap) => matchesCombo(lap, combo)) : [];
    const base = comboHotlaps.length ? comboHotlaps : hotlaps;
    topRows = [...base].sort((a, b) => lapMs(a) - lapMs(b)).slice(0, 8);
  } catch (err: any) {
    error = err?.message || String(err);
  }

  const logoDataUri = await loadLogoDataUri();
  const svg = buildSvg({ origin, combo, hotlaps: topRows, totalHotlaps, logoDataUri, error });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
