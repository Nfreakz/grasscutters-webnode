import crypto from 'node:crypto';

export function textValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}



export function fixMojibakeText(value: unknown) {
  let text = textValue(value);
  if (!text) return '';

  const replacements: Record<string, string> = {
    'ÃƒÂ¡': 'á', 'ÃƒÂ©': 'é', 'ÃƒÂ­': 'í', 'ÃƒÂ³': 'ó', 'ÃƒÂº': 'ú', 'ÃƒÂ±': 'ñ',
    'ÃƒÂ': 'Á', 'ÃƒÂ‰': 'É', 'ÃƒÂ': 'Í', 'ÃƒÂ“': 'Ó', 'ÃƒÂš': 'Ú', 'ÃƒÂ‘': 'Ñ',
    'Ã‚Â·': '·', 'Ã‚Â¿': '¿', 'Ã‚Â¡': '¡', 'Ã‚Âº': 'º', 'Ã‚Âª': 'ª',
    'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú', 'Ã±': 'ñ',
    'Ã': 'Á', 'Ã‰': 'É', 'Ã': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú', 'Ã‘': 'Ñ',
    'Â·': '·', 'Âº': 'º', 'Âª': 'ª', 'Â¿': '¿', 'Â¡': '¡',
    'â€“': '–', 'â€”': '—', 'â€¦': '…', 'â€œ': '“', 'â€': '”', 'â€˜': '‘', 'â€™': '’', 'â€¢': '•'
  };

  for (const [bad, good] of Object.entries(replacements)) text = text.split(bad).join(good);
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanDisplayText(value: unknown, fallback = '') {
  const fixed = fixMojibakeText(value);
  return fixed || fallback;
}

function humanizeCode(value: unknown, fallback = '') {
  const fixed = cleanDisplayText(value, fallback);
  if (!fixed) return fallback;
  return fixed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayTrackName(value: unknown, fallback = 'Circuito') {
  const raw = cleanDisplayText(value, fallback);
  if (!raw) return fallback;
  const key = slugify(raw);
  const known: Record<string, string> = {
    fn_jerez: 'Jerez',
    jerez: 'Jerez',
    circuito_de_jerez: 'Jerez',
    circuito_de_jerez_spain: 'Jerez',
    mugello: 'Mugello',
    spa: 'Spa',
    ks_spa: 'Spa',
    rt_spa: 'Spa',
    road_atlanta: 'Road Atlanta',
    sebring: 'Sebring',
    mx_sb_day_standing: 'Sebring',
    salzburgring: 'Salzburgring',
    zolder: 'Zolder',
    rt_zolder: 'Zolder',
    okayama_circuit_gp: 'Okayama',
    okayama_circuit: 'Okayama',
    okayama: 'Okayama',
    phillip_island_2013: 'Phillip Island',
    phillip_island: 'Phillip Island',
    brands_hatch: 'Brands Hatch',
    ks_brands_hatch: 'Brands Hatch',
    nordschleife: 'Nordschleife',
    nurburgring: 'Nürburgring',
    suzuka: 'Suzuka',
    imola: 'Imola',
    vallelunga: 'Vallelunga',
    estoril: 'Estoril',
    bathurst: 'Bathurst',
    hockenheim: 'Hockenheim'
  };
  if (known[key]) return known[key];

  return humanizeCode(raw, fallback)
    .replace(/^(fn|ks|rt|mx|acu|nrms)\s+/i, '')
    .replace(/\b(circuit|circuito|track|spain|italy|italia)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase()) || fallback;
}

export function displayCarName(value: unknown, fallback = 'Coche') {
  const raw = cleanDisplayText(value, fallback);
  if (!raw || raw === 'any_car_model') return fallback;
  const key = raw.trim().toLowerCase();
  const known: Record<string, string> = {
    rss_formula_rss_4_2024: 'RSS Formula RSS 4 2024',
    f1600_van_diemen: 'F1600 Van Diemen',
    ts_bmw_m3_gt2: 'BMW M3 GT2',
    ts_spyker_c8_laviolette_gt2r: 'Spyker C8 Laviolette GT2R',
    ts_ferrari_f430_gt2: 'Ferrari F430 GT2',
    doran_ford_gt40_gt2: 'Doran Ford GT40 GT2',
    ts_porsche_997r: 'Porsche 997R'
  };
  if (known[key]) return known[key];

  return humanizeCode(raw, fallback)
    .replace(/^(ks|ts|rss)\s+/i, (match) => match.toLowerCase().startsWith('rss') ? 'RSS ' : '')
    .replace(/\bbmw\b/gi, 'BMW')
    .replace(/\bgt2\b/gi, 'GT2')
    .replace(/\bgt3\b/gi, 'GT3')
    .replace(/\bf430\b/gi, 'F430')
    .replace(/\brss\b/gi, 'RSS')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

export function displayDriverName(value: unknown, fallback = 'Piloto') {
  const cleaned = cleanDisplayText(value, fallback);
  if (!cleaned) return fallback;
  return cleaned.replace(/\s+/g, ' ').trim() || fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function safeFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function safeFiniteInt(value: unknown, fallback = 0) {
  return Math.max(0, Math.round(safeFiniteNumber(value, fallback)));
}

export function boolValue(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function slugify(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeIdentity(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeTrack(value: unknown) {
  return slugify(value)
    .replace(/^(fn|ks|rt|mx|acu|nrms)_/, '')
    .replace(/_?(circuit|circuito|track|spain|italy|italia)$/g, '');
}

export function formatLapMs(value: unknown) {
  const ms = numberValue(value, 0);
  if (!ms || ms <= 0) return '--';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function ratingClassFromSr(score: number) {
  if (!Number.isFinite(score)) return 'B';
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

export function ratingClassFromGsr(score: number) {
  if (score >= 1750) return 'S';
  if (score >= 1650) return 'A';
  if (score >= 1550) return 'B';
  if (score >= 1475) return 'C';
  if (score >= 1400) return 'D';
  return 'Rookie';
}

export function visibleGsr(mu: number) {
  return Math.round(1500 + (mu - 25) * 32);
}

export function isoNow() {
  return new Date().toISOString();
}

export function parseDateMs(value: unknown) {
  const text = textValue(value);
  if (!text) return 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

export function sessionTimeMs(value: unknown) {
  const numeric = numberValue(value, NaN);
  if (Number.isFinite(numeric) && numeric > 1000000000) return numeric * 1000;
  return parseDateMs(value);
}

export function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function driverKeyFromParts(input: {
  strackerPlayerId?: number | null;
  steamGuid?: string | null;
  name?: string | null;
}) {
  const playerId = numberValue(input.strackerPlayerId, 0);
  if (playerId > 0) return `player:${playerId}`;
  const guid = textValue(input.steamGuid);
  if (guid) return `steam:${guid}`;
  return `name:${slugify(input.name || 'unknown') || 'unknown'}`;
}

export function ensureArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

