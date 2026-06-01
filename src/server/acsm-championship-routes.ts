import type express from 'express';

type PlainObject = Record<string, any>;

const defaultAcsmBaseUrl = 'http://185.216.144.78:8840';
const defaultChampionshipId = 'ad89ce26-0206-40f2-adec-451cf221d4e6';
const defaultChampionshipSignUpUrl = 'http://185.216.144.78:8840/championship/ad89ce26-0206-40f2-adec-451cf221d4e6/sign-up/steam';

type ChampionshipCache = {
  fetchedAt: number;
  payload: PlainObject;
};

let cachedChampionship: ChampionshipCache | null = null;

function textValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') {
    const obj = value as PlainObject;
    return textValue(
      obj.Name ?? obj.name ??
      obj.DisplayName ?? obj.displayName ??
      obj.DriverName ?? obj.driverName ??
      obj.PlayerName ?? obj.playerName ??
      obj.Username ?? obj.username ??
      obj.UserName ?? obj.userName ??
      obj.Guid ?? obj.GUID ?? obj.guid ??
      obj.ID ?? obj.Id ?? obj.id ??
      '',
      fallback
    );
  }

  const text = String(value).trim();
  if (!text || text === '[object Object]') return fallback;
  return text;
}

function numberValue(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boolValue(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function objectValue(value: unknown): PlainObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PlainObject : {};
}

function arrayValue(value: unknown): PlainObject[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as PlainObject[];
  return [];
}

function collectionValue(value: unknown): PlainObject[] {
  if (Array.isArray(value)) return arrayValue(value);
  if (value && typeof value === 'object') {
    return Object.values(value as PlainObject).filter((item) => item && typeof item === 'object') as PlainObject[];
  }
  return [];
}

function pick(source: PlainObject | null | undefined, paths: string[], fallback: any = '') {
  if (!source) return fallback;

  for (const path of paths) {
    const parts = path.split('.');
    let cursor: any = source;

    for (const part of parts) {
      if (cursor === undefined || cursor === null) break;
      cursor = cursor[part] ?? cursor[part.charAt(0).toUpperCase() + part.slice(1)] ?? cursor[part.toLowerCase()];
    }

    if (cursor !== undefined && cursor !== null && cursor !== '') return cursor;
  }

  return fallback;
}

function cleanAcsmBaseUrl() {
  const configured = textValue(process.env.ACSM_BASE_URL, defaultAcsmBaseUrl);
  return configured.replace(/\/+$/, '');
}

function getAcsmChampionshipId() {
  return textValue(process.env.ACSM_CHAMPIONSHIP_ID, defaultChampionshipId);
}

function getAcsmChampionshipConfig() {
  const baseUrl = cleanAcsmBaseUrl();
  const championshipId = getAcsmChampionshipId();

  return {
    enabled: String(process.env.ACSM_CHAMPIONSHIP_ENABLED ?? 'true').toLowerCase() !== 'false',
    baseUrl,
    championshipId,
    championshipUrl: `${baseUrl}/championship/${encodeURIComponent(championshipId)}`,
    signUpUrl: textValue(process.env.ACSM_CHAMPIONSHIP_SIGNUP_URL, defaultChampionshipSignUpUrl),
    exportUrl: `${baseUrl}/championship/${encodeURIComponent(championshipId)}/export`,
    exportResultsUrl: `${baseUrl}/championship/${encodeURIComponent(championshipId)}/export-results`,
    icsUrl: `${baseUrl}/championship/${encodeURIComponent(championshipId)}/ics`,
    cacheTtlMs: Math.max(10000, numberValue(process.env.ACSM_CHAMPIONSHIP_CACHE_SECONDS, 60) * 1000)
  };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json,text/plain,text/html,*/*',
      'user-agent': 'GrassCutters-WebNode/ACSM-Championship'
    }
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    text
  };
}

async function fetchJsonText(url: string) {
  const response = await fetchText(url);

  if (!response.ok) {
    throw new Error(`ACSM respondió ${response.status}: ${response.text.slice(0, 220)}`);
  }

  const trimmed = response.text.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`ACSM no devolvió JSON. Inicio de respuesta: ${trimmed.slice(0, 120)}`);
  }

  return JSON.parse(trimmed);
}

async function fetchJsonTextOptional(url: string) {
  try {
    return await fetchJsonText(url);
  } catch (error) {
    return {
      __gcError: error instanceof Error ? error.message : String(error)
    };
  }
}

function dateMs(value: unknown) {
  const text = textValue(value);
  if (!text || text.startsWith('0001-01-01')) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoOrNull(value: unknown) {
  const ms = dateMs(value);
  return ms ? new Date(ms).toISOString() : null;
}

function htmlDecode(value: string) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value: string) {
  return htmlDecode(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(td|th|div|span|p|a)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function extractAttr(value: string, attr: string) {
  const match = String(value || '').match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match ? htmlDecode(match[1]) : '';
}

function slugify(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTrackSlug(value: unknown) {
  const raw = slugify(value);
  return raw
    .replace(/^(fn|ks|rt|mx|acu|nrms)_/, '')
    .replace(/_?(circuit|circuito|track|spain|italy|italia)$/g, '')
    .replace(/^_+|_+$/g, '') || raw;
}

function trackBaseNames(trackName: unknown, trackRaw?: unknown, eventName?: unknown) {
  const names = [...new Set([
    normalizeTrackSlug(trackRaw),
    normalizeTrackSlug(trackName),
    normalizeTrackSlug(eventName),
    slugify(trackRaw),
    slugify(trackName),
    slugify(eventName)
  ].filter(Boolean))];

  const hasJerez = names.some((name) => /jerez|angel_nieto/.test(name));
  if (hasJerez) {
    names.push(
      'jerez',
      'fn_jerez',
      'circuito_de_jerez',
      'circuito_de_jerez_spain',
      'circuito_de_jerez_angel_nieto',
      'jerez_angel_nieto',
      'angel_nieto_jerez'
    );
  }

  return [...new Set(names.filter(Boolean))];
}

function trackMapCandidates(trackName: unknown, trackRaw?: unknown, eventName?: unknown) {
  const names = trackBaseNames(trackName, trackRaw, eventName);

  const bases = [...new Set([
    ...names.map((name) => `${name}_mapa`),
    ...names.map((name) => `${name}_map`)
  ])];

  const roots = ['/images/tracks', '/imagenes/tracks', '/images', '/imagenes', '/ui/home2'];
  const exts = ['webp', 'png', 'jpg', 'jpeg', 'svg', 'WEBP', 'PNG', 'JPG', 'JPEG', 'SVG'];

  const out: string[] = [];
  bases.forEach((base) => {
    roots.forEach((root) => {
      exts.forEach((ext) => out.push(`${root}/${base}.${ext}`));
    });
  });

  return [...new Set(out)];
}

function trackPhotoCandidates(trackName: unknown, trackRaw?: unknown, eventName?: unknown) {
  const names = trackBaseNames(trackName, trackRaw, eventName);

  const bases = [...new Set([
    ...names,
    ...names.map((name) => `${name}_foto`),
    ...names.map((name) => `${name}_photo`),
    ...names.map((name) => `${name}_imagen`)
  ])].filter((base) => !/_?(mapa|map|outline)$/i.test(base));

  const roots = ['/images/tracks', '/imagenes/tracks', '/images', '/imagenes', '/ui/home2'];
  const exts = ['webp', 'jpg', 'jpeg', 'png', 'avif', 'WEBP', 'JPG', 'JPEG', 'PNG', 'AVIF'];

  const out: string[] = [];
  bases.forEach((base) => {
    roots.forEach((root) => {
      exts.forEach((ext) => out.push(`${root}/${base}.${ext}`));
    });
  });

  return [...new Set(out.filter((url) => !/_mapa\.|_map\.|_outline\./i.test(url)))];
}

function prettifyName(value: unknown, fallback = '-') {
  const text = textValue(value, fallback);
  return text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function prettifyCarModel(value: unknown, fallback = '') {
  const raw = textValue(value, fallback);
  if (!raw) return fallback;

  const known: Record<string, string> = {
    rss_formula_rss_4_2024: 'RSS Formula RSS 4 2024',
    ts_bmw_m3_gt2: 'BMW M3 GT2',
    ts_spyker_c8_laviolette_gt2r: 'Spyker C8 Laviolette GT2R',
    ts_ferrari_f430_gt2: 'Ferrari F430 GT2',
    doran_ford_gt40_gt2: 'Doran Ford GT40 GT2',
    ts_porsche_997r: 'Porsche 997R'
  };

  const key = raw.trim().toLowerCase();
  if (known[key]) return known[key];

  return raw
    .replace(/^ks_/i, '')
    .replace(/^ts_/i, '')
    .replace(/^rss_/i, 'RSS ')
    .replace(/_/g, ' ')
    .replace(/\bgt2\b/gi, 'GT2')
    .replace(/\brss\b/gi, 'RSS')
    .replace(/\bbmw\b/gi, 'BMW')
    .replace(/\bf430\b/gi, 'F430')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatLapMs(value: unknown) {
  const ms = numberValue(value, 0);
  if (!ms || ms <= 0) return '';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function extractCarsFromRaceSetup(raceSetup: PlainObject) {
  const rawCars = pick(raceSetup, ['Cars', 'cars', 'Car', 'car', 'CarModel', 'carModel'], '');
  const names: string[] = [];

  if (typeof rawCars === 'string') {
    rawCars.split(/[;,]+/).map((item) => item.trim()).filter(Boolean).forEach((item) => names.push(prettifyCarModel(item, item)));
  } else {
    collectionValue(rawCars).forEach((car) => {
      const name = prettifyCarModel(pick(car, ['Model', 'model', 'Car', 'car', 'Name', 'name', 'ID', 'id'], ''), '');
      if (name) names.push(name);
    });
  }

  return [...new Set(names)].filter(Boolean);
}

function normalizeDriverIdentity(name: unknown) {
  return prettifyName(name, '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function driverMapKey(driver: PlainObject) {
  const guid = textValue(driver.guid ?? driver.DriverGuid ?? driver.DriverGUID ?? driver.Guid ?? driver.GUID);
  if (guid) return `guid:${guid}`;
  const nameKey = normalizeDriverIdentity(driver.name ?? driver.DriverName ?? driver.Name);
  return nameKey ? `name:${nameKey}` : '';
}

function mergeDriver(base: PlainObject, next: PlainObject) {
  const merged = {
    ...base,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  };

  merged.points = numberValue(base.points, 0) + numberValue(next.pointsDelta ?? next.points, 0);
  merged.events = Math.max(numberValue(base.events, 0), numberValue(next.events, 0));
  merged.wins = numberValue(base.wins, 0) + numberValue(next.wins, 0);
  merged.podiums = numberValue(base.podiums, 0) + numberValue(next.podiums, 0);

  const baseFinish = numberValue(base.bestFinish, 0);
  const nextFinish = numberValue(next.bestFinish, 0);
  merged.bestFinish = baseFinish && nextFinish ? Math.min(baseFinish, nextFinish) : (baseFinish || nextFinish || 0);

  return merged;
}

function upsertDriver(map: Map<string, PlainObject>, nameIndex: Map<string, string>, driver: PlainObject) {
  const nameKey = normalizeDriverIdentity(driver.name);
  const guidKey = driver.guid ? `guid:${driver.guid}` : '';
  const nameOnlyKey = nameKey ? `name:${nameKey}` : '';

  let key = guidKey && map.has(guidKey) ? guidKey : '';
  if (!key && nameKey && nameIndex.has(nameKey)) key = nameIndex.get(nameKey) || '';
  if (!key) key = guidKey || nameOnlyKey;
  if (!key) return;

  const existing = map.get(key);
  const merged = existing ? mergeDriver(existing, driver) : { ...driver, points: numberValue(driver.points ?? driver.pointsDelta, 0) };

  const finalKey = merged.guid ? `guid:${merged.guid}` : key;

  if (finalKey !== key) {
    map.delete(key);
  }

  map.set(finalKey, merged);
  if (nameKey) nameIndex.set(nameKey, finalKey);
}

function parsePublicEntrantsFromHtml(html: string) {
  const text = String(html || '');
  if (!text) return [];

  const start = text.search(/id=["']entrants["']/i);
  if (start < 0) return [];

  const rest = text.slice(start);
  const end = rest.search(/id=["']points["']/i);
  const block = end > 0 ? rest.slice(0, end) : rest;

  const rows = [...block.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const output: PlainObject[] = [];

  rows.forEach((row, index) => {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
    const rowText = stripHtml(row);

    if (!cells.length) return;
    if (/driver/i.test(rowText) && /attendance/i.test(rowText)) return;
    if (/open slots/i.test(rowText)) return;

    const numericIndex = cells.findIndex((cell) => /^\d+/.test(cell));
    if (numericIndex < 0) return;

    const position = Number.parseInt(cells[numericIndex], 10) || index + 1;
    const attendanceIndex = cells.findIndex((cell) => /\d+\s*\/\s*\d+/.test(cell));
    const carIndex = cells.findIndex((cell, cellIndex) => cellIndex > numericIndex && /\s\/\s/.test(cell) && cellIndex !== attendanceIndex);
    const driverIndex = numericIndex + 1;

    const name = prettifyName(cells[driverIndex] || '', '');
    if (!name || /^rating$/i.test(name) || /^car$/i.test(name)) return;

    const model = carIndex >= 0 ? prettifyCarModel(cells[carIndex].split('/')[0].trim(), '') : '';
    const teamCandidates = cells.slice(driverIndex + 1, carIndex >= 0 ? carIndex : Math.max(driverIndex + 1, cells.length - 1));
    const team = teamCandidates.find((cell) => cell && !/\d+\s*\/\s*\d+/.test(cell) && !/^[A-F0-9]{6,}$/i.test(cell)) || '';

    output.push({
      key: `public:${name}:${position}`,
      name,
      guid: extractAttr(row, 'data-guid') || extractAttr(row, 'data-driver-guid'),
      team: prettifyName(team, ''),
      model,
      position,
      points: 0,
      className: 'General',
      source: 'public-html-entrants'
    });
  });

  return output;
}

function collectRegisteredDrivers(raw: PlainObject, publicHtml = '') {
  const rows: PlainObject[] = [];

  collectionValue(raw.Classes).forEach((classItem, classIndex) => {
    const className = prettifyName(pick(classItem, ['Name', 'name'], ''), '') || 'General';

    collectionValue(pick(classItem, ['Entrants', 'entrants'], {})).forEach((entrant) => {
      const name = prettifyName(pick(entrant, ['Name', 'name', 'DriverName', 'driverName'], ''), '');
      const guid = textValue(pick(entrant, ['GUID', 'Guid', 'guid', 'DriverGuid', 'driverGuid', 'SteamID', 'SteamId', 'steamId'], ''));
      const modelRaw = textValue(pick(entrant, ['Model', 'model', 'CarModel', 'carModel'], ''));
      if (!name && !guid) return;
      if (modelRaw === 'any_car_model' && !name) return;

      rows.push({
        key: guid ? `guid:${guid}` : `class-${classIndex}:${name}`,
        name,
        guid,
        team: prettifyName(pick(entrant, ['Team', 'team'], ''), ''),
        model: modelRaw && modelRaw !== 'any_car_model' ? prettifyCarModel(modelRaw, '') : '',
        className,
        source: 'class-entrants',
        points: 0
      });
    });
  });

  rows.push(...parsePublicEntrantsFromHtml(publicHtml));

  const map = new Map<string, PlainObject>();
  const nameIndex = new Map<string, string>();

  rows.forEach((driver) => upsertDriver(map, nameIndex, driver));

  return [...map.values()]
    .filter((driver) => driver.name || driver.guid)
    .sort((a, b) => String(a.name || a.guid).localeCompare(String(b.name || b.guid)))
    .map((driver, index) => ({
      key: driverMapKey(driver) || `registered-${index + 1}`,
      name: driver.name || `Piloto ${index + 1}`,
      guid: driver.guid || '',
      team: driver.team || '',
      model: driver.model || '',
      className: driver.className || 'General',
      position: index + 1,
      points: 0,
      source: driver.source || 'registered'
    }));
}

function classPointsFor(raw: PlainObject, classId = '') {
  const classes = collectionValue(raw.Classes);
  const hit = classes.find((item) => textValue(pick(item, ['ID', 'Id', 'id'], '')) === classId) || classes[0] || {};
  const points = pick(hit, ['Points.Places', 'points.places'], []);
  return Array.isArray(points) ? points.map((item) => numberValue(item, 0)) : [];
}

function normalizeResultRow(row: PlainObject, position: number, sessionType: string, points = 0) {
  const driver = objectValue(pick(row, ['Driver', 'driver'], {}));
  const name = prettifyName(pick(row, ['DriverName', 'driverName', 'Name', 'name'], pick(driver, ['Name', 'name'], '')), '');
  const guid = textValue(pick(row, ['DriverGuid', 'driverGuid', 'DriverGUID', 'driverGUID', 'GUID', 'Guid', 'guid'], pick(driver, ['Guid', 'GUID', 'guid'], '')));
  const model = prettifyCarModel(pick(row, ['CarModel', 'carModel', 'Model', 'model'], ''), '');
  if (!name && !guid) return null;

  const bestLapMs = numberValue(pick(row, ['BestLap', 'bestLap'], 0), 0);
  const totalTimeMs = numberValue(pick(row, ['TotalTime', 'totalTime'], 0), 0);
  const numLaps = numberValue(pick(row, ['NumLaps', 'numLaps', 'Laps', 'laps'], 0), 0);
  const disqualified = boolValue(pick(row, ['Disqualified', 'disqualified'], false));

  return {
    position,
    name,
    guid,
    model,
    carModel: model,
    classId: textValue(pick(row, ['ClassID', 'classId', 'ClassId'], pick(driver, ['ClassID', 'classId', 'ClassId'], ''))),
    bestLapMs,
    bestLap: formatLapMs(bestLapMs),
    totalTimeMs,
    totalTime: formatLapMs(totalTimeMs),
    numLaps,
    gridPosition: numberValue(pick(row, ['GridPosition', 'gridPosition'], 0), 0),
    hasPenalty: boolValue(pick(row, ['HasPenalty', 'hasPenalty'], false)),
    penaltyTimeMs: numberValue(pick(row, ['PenaltyTime', 'penaltyTime'], 0), 0),
    lapPenalty: numberValue(pick(row, ['LapPenalty', 'lapPenalty'], 0), 0),
    disqualified,
    status: disqualified ? 'DSQ' : (sessionType === 'RACE' && numLaps <= 0 ? 'DNF' : 'Clasificado'),
    points: disqualified ? 0 : points,
    pointsDelta: disqualified ? 0 : points
  };
}

function normalizeSession(raw: PlainObject, key: string, event: PlainObject, championshipRaw: PlainObject) {
  const resultsRaw = objectValue(pick(raw, ['Results', 'results'], {}));
  const rows = arrayValue(pick(resultsRaw, ['Result', 'result'], []));
  const type = textValue(pick(resultsRaw, ['Type', 'type'], key)).toUpperCase() || key.toUpperCase();
  const pointsMultiplier = Math.max(0, numberValue(pick(event, ['PointsMultiplier', 'pointsMultiplier'], 1), 1));
  const firstClassId = textValue(pick(rows[0] || {}, ['ClassID', 'ClassId', 'classId'], ''));
  const classPoints = type === 'RACE' ? classPointsFor(championshipRaw, firstClassId) : [];

  const results = rows
    .map((row, index) => normalizeResultRow(row, index + 1, type, numberValue(classPoints[index], 0) * pointsMultiplier))
    .filter(Boolean) as PlainObject[];

  const laps = arrayValue(pick(resultsRaw, ['Laps', 'laps'], []))
    .filter((lap) => textValue(pick(lap, ['DriverName', 'driverName', 'DriverGuid', 'driverGuid'], '')))
    .map((lap) => ({
      driverName: prettifyName(pick(lap, ['DriverName', 'driverName'], ''), ''),
      driverGuid: textValue(pick(lap, ['DriverGuid', 'driverGuid'], '')),
      carModel: prettifyCarModel(pick(lap, ['CarModel', 'carModel'], ''), ''),
      lapTimeMs: numberValue(pick(lap, ['LapTime', 'lapTime'], 0), 0),
      lapTime: formatLapMs(pick(lap, ['LapTime', 'lapTime'], 0)),
      cuts: numberValue(pick(lap, ['Cuts', 'cuts'], 0), 0),
      tyre: textValue(pick(lap, ['Tyre', 'tyre'], '')),
      timestamp: numberValue(pick(lap, ['Timestamp', 'timestamp'], 0), 0),
      fastest: boolValue(pick(lap, ['ContributedToFastestLap', 'contributedToFastestLap'], false))
    }))
    .filter((lap) => lap.lapTimeMs > 0);

  const fastestLap = [...laps].sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] || null;

  return {
    key,
    type,
    name: prettifyName(pick(raw, ['Name', 'name'], pick(resultsRaw, ['Type', 'type'], key)), key),
    startedAt: isoOrNull(pick(raw, ['StartedTime', 'startedTime', 'Started', 'started'], '')),
    completedAt: isoOrNull(pick(raw, ['CompletedTime', 'completedTime', 'Completed', 'completed'], '')),
    trackName: prettifyName(pick(resultsRaw, ['TrackName', 'trackName'], pick(event, ['RaceSetup.Track', 'raceSetup.track'], '')), ''),
    resultCount: results.length,
    lapCount: laps.length,
    results,
    laps: laps.slice(0, 400),
    fastestLap
  };
}

function normalizeEvent(event: PlainObject, index: number, championshipRaw: PlainObject) {
  const raceSetup = objectValue(pick(event, ['RaceSetup', 'raceSetup'], {}));
  const sessionsRaw = objectValue(pick(event, ['Sessions', 'sessions'], {}));
  const trackRaw = pick(raceSetup, ['Track', 'track', 'TrackName', 'trackName'], pick(event, ['Track', 'track', 'TrackName', 'trackName'], 'Circuito por confirmar'));
  const track = prettifyName(trackRaw, 'Circuito por confirmar');
  const cars = extractCarsFromRaceSetup(raceSetup);
  const scheduled = isoOrNull(pick(event, ['Scheduled', 'scheduled', 'ScheduledTime', 'scheduledTime', 'ScheduledAt', 'scheduledAt', 'Date', 'date']));
  const started = isoOrNull(pick(event, ['StartedTime', 'startedTime', 'Started', 'started']));
  const completed = isoOrNull(pick(event, ['CompletedTime', 'completedTime', 'Completed', 'completed', 'Finished', 'finished']));
  const cancelled = boolValue(pick(event, ['Cancelled', 'cancelled'], false));

  let status = 'pending';
  if (cancelled) status = 'cancelled';
  else if (completed) status = 'completed';
  else if (started) status = 'in_progress';
  else if (scheduled && dateMs(scheduled) > Date.now()) status = 'scheduled';

  const sessions = Object.entries(sessionsRaw)
    .filter(([, session]) => session && typeof session === 'object')
    .map(([key, session]) => normalizeSession(session as PlainObject, key, event, championshipRaw));

  const sessionByType = new Map(sessions.map((session) => [String(session.type).toUpperCase(), session]));
  const raceSession = sessionByType.get('RACE') || null;
  const qualifySession = sessionByType.get('QUALIFY') || sessionByType.get('QUALIFICATION') || null;
  const practiceSession = sessionByType.get('PRACTICE') || null;
  const raceResults = raceSession?.results || [];
  const qualifyingResults = qualifySession?.results || [];
  const practiceResults = practiceSession?.results || [];
  const fastestLap = raceSession?.fastestLap || qualifySession?.fastestLap || practiceSession?.fastestLap || null;
  const winner = raceResults[0] || null;
  const podium = raceResults.slice(0, 3);

  const id = textValue(pick(event, ['ID', 'Id', 'id'], `event-${index + 1}`));

  return {
    index: index + 1,
    id,
    slug: id,
    href: `/campeonato/ronda/${encodeURIComponent(id)}`,
    name: textValue(pick(event, ['Name', 'name', 'Title', 'title'], `Ronda ${index + 1}`)),
    track,
    trackRaw: textValue(trackRaw, ''),
    trackSlug: normalizeTrackSlug(trackRaw),
    trackMapCandidates: trackMapCandidates(track, trackRaw, pick(event, ['Name', 'name', 'Title', 'title'], '')),
    trackPhotoCandidates: trackPhotoCandidates(track, trackRaw, pick(event, ['Name', 'name', 'Title', 'title'], '')),
    cars,
    carSummary: cars.length ? cars.slice(0, 4).join(' + ') + (cars.length > 4 ? ` +${cars.length - 4}` : '') : '',
    scheduledAt: scheduled,
    startedAt: started,
    completedAt: completed,
    status,
    laps: numberValue(pick(raceSetup, ['Laps', 'laps', 'RaceLaps', 'raceLaps'], 0)),
    durationMinutes: numberValue(pick(raceSetup, ['Time', 'time', 'RaceDuration', 'raceDuration'], 0), 0),
    sessions,
    rawHasResults: sessions.some((session) => session.resultCount > 0),
    raceResults,
    qualifyingResults,
    practiceResults,
    fastestLap,
    winner,
    podium,
    pointsAwarded: raceResults.map((driver: PlainObject) => ({
      name: driver.name,
      guid: driver.guid,
      points: driver.points,
      position: driver.position
    }))
  };
}

function buildStandings(registeredDrivers: PlainObject[], events: PlainObject[]) {
  const map = new Map<string, PlainObject>();
  const nameIndex = new Map<string, string>();

  registeredDrivers.forEach((driver) => {
    upsertDriver(map, nameIndex, {
      ...driver,
      points: 0,
      events: 0,
      wins: 0,
      podiums: 0,
      bestFinish: 0
    });
  });

  events
    .filter((event) => event.status === 'completed')
    .forEach((event) => {
      (event.raceResults || []).forEach((row: PlainObject) => {
        upsertDriver(map, nameIndex, {
          name: row.name,
          guid: row.guid,
          model: row.model,
          carModel: row.carModel,
          className: row.className || 'General',
          pointsDelta: numberValue(row.points, 0),
          events: 1,
          wins: row.position === 1 ? 1 : 0,
          podiums: row.position <= 3 ? 1 : 0,
          bestFinish: row.position,
          lastResult: {
            eventId: event.id,
            eventName: event.name,
            position: row.position,
            points: row.points,
            bestLap: row.bestLap,
            numLaps: row.numLaps
          }
        });
      });
    });

  return [...map.values()]
    .filter((driver) => driver.name || driver.guid)
    .sort((a, b) => {
      if (numberValue(b.points, 0) !== numberValue(a.points, 0)) return numberValue(b.points, 0) - numberValue(a.points, 0);
      const aFinish = numberValue(a.bestFinish, 999);
      const bFinish = numberValue(b.bestFinish, 999);
      if (aFinish !== bFinish) return aFinish - bFinish;
      return String(a.name || a.guid).localeCompare(String(b.name || b.guid));
    })
    .map((driver, index) => ({
      key: driverMapKey(driver) || `standing-${index + 1}`,
      position: index + 1,
      name: driver.name || `Piloto ${index + 1}`,
      guid: driver.guid || '',
      team: driver.team || '',
      model: driver.model || driver.carModel || '',
      className: driver.className || 'General',
      points: numberValue(driver.points, 0),
      events: numberValue(driver.events, 0),
      wins: numberValue(driver.wins, 0),
      podiums: numberValue(driver.podiums, 0),
      bestFinish: numberValue(driver.bestFinish, 0),
      lastResult: driver.lastResult || null
    }));
}

function createDiagnostics(raw: PlainObject, results: unknown, registeredDrivers: PlainObject[], events: PlainObject[], standings: PlainObject[]) {
  const topLevelKeys = Object.keys(raw || {}).sort();
  const resultKeys = results && typeof results === 'object' && !Array.isArray(results) ? Object.keys(results as PlainObject).sort() : [];

  return {
    topLevelKeys,
    resultKeys,
    registeredDriversCount: registeredDrivers.length,
    eventsCount: events.length,
    completedEventsCount: events.filter((event) => event.status === 'completed').length,
    sessionsWithResults: events.flatMap((event) => (event.sessions || []).filter((session: PlainObject) => session.resultCount > 0).map((session: PlainObject) => ({
      event: event.name,
      type: session.type,
      results: session.resultCount,
      laps: session.lapCount
    }))),
    standingsSample: standings.slice(0, 8).map((driver) => ({
      position: driver.position,
      name: driver.name,
      points: driver.points,
      events: driver.events,
      bestFinish: driver.bestFinish
    }))
  };
}

function normalizeChampionship(raw: PlainObject, results: unknown, config: ReturnType<typeof getAcsmChampionshipConfig>, publicHtml = '') {
  const events = collectionValue(raw.Events).map((event, index) => normalizeEvent(event, index, raw));
  const registeredDrivers = collectRegisteredDrivers(raw, publicHtml);
  const standings = buildStandings(registeredDrivers, events);

  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => event.status !== 'completed' && event.status !== 'cancelled')
    .sort((a, b) => {
      const left = dateMs(a.scheduledAt) || Number.MAX_SAFE_INTEGER;
      const right = dateMs(b.scheduledAt) || Number.MAX_SAFE_INTEGER;
      return left - right || a.index - b.index;
    });

  const completedEvents = events
    .filter((event) => event.status === 'completed')
    .sort((a, b) => (dateMs(b.completedAt) || 0) - (dateMs(a.completedAt) || 0));

  const nextEvent = upcomingEvents.find((event) => !event.scheduledAt || dateMs(event.scheduledAt) >= now) || upcomingEvents[0] || null;
  const lastCompletedEvent = completedEvents[0] || null;
  const completedCount = completedEvents.length;
  const progressPercent = events.length ? Math.round((completedCount / events.length) * 100) : 0;

  return {
    id: textValue(raw.ID || raw.Id || raw.id || config.championshipId),
    name: textValue(raw.Name || raw.name, 'Campeonato ACSR'),
    createdAt: isoOrNull(raw.Created || raw.created),
    updatedAt: isoOrNull(raw.Updated || raw.updated),
    acsrEnabled: boolValue(raw.ACSR),
    acsrSkillGate: textValue(raw.ACSRSkillGate, ''),
    acsrSafetyGate: numberValue(raw.ACSRSafetyGate, 0),
    progressPercent,
    stats: {
      events: events.length,
      completedEvents: completedCount,
      upcomingEvents: upcomingEvents.length,
      classes: collectionValue(raw.Classes).length,
      entrants: registeredDrivers.length,
      standings: standings.length
    },
    nextEvent,
    lastCompletedEvent,
    events,
    classes: collectionValue(raw.Classes).map((classItem, index) => ({
      id: textValue(pick(classItem, ['ID', 'Id', 'id'], `class-${index + 1}`)),
      name: prettifyName(pick(classItem, ['Name', 'name'], ''), '') || 'General',
      color: textValue(pick(classItem, ['Color', 'color', 'UIColor', 'uiColor'], '')),
      points: pick(classItem, ['Points.Places', 'points.places'], [])
    })),
    registeredDrivers,
    standings,
    diagnostics: createDiagnostics(raw, results, registeredDrivers, events, standings)
  };
}

export function registerAcsmChampionshipRoutes(app: express.Express) {
  app.get('/api/community/acsr-championship', async (req, res) => {
    const config = getAcsmChampionshipConfig();

    if (!config.enabled) {
      res.json({
        ok: true,
        enabled: false,
        source: 'acsm-championship-v16',
        message: 'Integración ACSM championship desactivada por ACSM_CHAMPIONSHIP_ENABLED=false.'
      });
      return;
    }

    try {
      const noCache = String(req.query.refresh || '') === '1';
      const now = Date.now();

      if (!noCache && cachedChampionship && now - cachedChampionship.fetchedAt < config.cacheTtlMs) {
        res.json({
          ...cachedChampionship.payload,
          cache: {
            hit: true,
            ageSeconds: Math.round((now - cachedChampionship.fetchedAt) / 1000),
            ttlSeconds: Math.round(config.cacheTtlMs / 1000)
          }
        });
        return;
      }

      const raw = await fetchJsonText(config.exportUrl);
      const results = await fetchJsonTextOptional(config.exportResultsUrl);
      const publicPage = await fetchText(config.championshipUrl).catch(() => null);
      const publicHtml = publicPage?.ok ? publicPage.text : '';
      const championship = normalizeChampionship(raw, results, config, publicHtml);

      const payload = {
        ok: true,
        enabled: true,
        source: 'acsm-championship-v16',
        fetchedAt: new Date().toISOString(),
        acsm: {
          baseUrl: config.baseUrl,
          championshipId: config.championshipId,
          championshipUrl: config.championshipUrl,
          signUpUrl: config.signUpUrl,
          exportUrl: config.exportUrl,
          exportResultsUrl: config.exportResultsUrl,
          icsUrl: config.icsUrl
        },
        championship,
        raw: String(req.query.raw || '') === '1' ? raw : undefined,
        resultsRaw: String(req.query.raw || '') === '1' ? results : undefined,
        message: 'Campeonato leído desde ACSM export. Clasificación calculada solo desde RACE.Results.Result y puntos de Classes.Points.Places.'
      };

      cachedChampionship = { fetchedAt: now, payload };
      res.json(payload);
    } catch (error) {
      console.error('[GC] Error leyendo campeonato ACSM:', error);
      res.status(200).json({
        ok: false,
        enabled: true,
        source: 'acsm-championship-v16',
        acsm: {
          baseUrl: config.baseUrl,
          championshipId: config.championshipId,
          championshipUrl: config.championshipUrl,
          signUpUrl: config.signUpUrl,
          exportUrl: config.exportUrl,
          exportResultsUrl: config.exportResultsUrl,
          icsUrl: config.icsUrl
        },
        championship: null,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/admin/acsm/championship/probe', async (_req, res) => {
    const config = getAcsmChampionshipConfig();
    const endpoints = [
      ['view', config.championshipUrl],
      ['export', config.exportUrl],
      ['export-results', config.exportResultsUrl],
      ['ics', config.icsUrl]
    ];

    const results = [];

    for (const [name, url] of endpoints) {
      try {
        const response = await fetchText(url);
        results.push({
          name,
          url,
          ok: response.ok,
          status: response.status,
          contentType: response.contentType,
          looksJson: response.text.trim().startsWith('{') || response.text.trim().startsWith('['),
          preview: response.text.slice(0, 220)
        });
      } catch (error) {
        results.push({
          name,
          url,
          ok: false,
          status: 0,
          contentType: '',
          looksJson: false,
          preview: error instanceof Error ? error.message : String(error)
        });
      }
    }

    res.json({
      ok: true,
      source: 'acsm-championship-probe-v16',
      config,
      results
    });
  });

  app.get('/api/admin/acsm/championship/inspect', async (_req, res) => {
    const config = getAcsmChampionshipConfig();

    try {
      const raw = await fetchJsonText(config.exportUrl);
      const results = await fetchJsonTextOptional(config.exportResultsUrl);
      const publicPage = await fetchText(config.championshipUrl).catch(() => null);
      const publicHtml = publicPage?.ok ? publicPage.text : '';
      const championship = normalizeChampionship(raw, results, config, publicHtml);

      res.json({
        ok: true,
        source: 'acsm-championship-inspect-v16',
        acsm: {
          championshipUrl: config.championshipUrl,
          signUpUrl: config.signUpUrl,
          exportUrl: config.exportUrl,
          exportResultsUrl: config.exportResultsUrl,
          icsUrl: config.icsUrl
        },
        stats: championship.stats,
        nextEvent: championship.nextEvent,
        lastCompletedEvent: championship.lastCompletedEvent,
        registeredDrivers: championship.registeredDrivers,
        standings: championship.standings,
        diagnostics: championship.diagnostics
      });
    } catch (error) {
      res.status(200).json({
        ok: false,
        source: 'acsm-championship-inspect-v16',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
