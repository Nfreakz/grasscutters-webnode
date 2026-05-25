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

function arrayValue(value: unknown): PlainObject[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as PlainObject[] : [];
}

function objectValue(value: unknown): PlainObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PlainObject : {};
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

function prettifyName(value: unknown, fallback = '-') {
  const text = textValue(value, fallback);
  return text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function pick(source: PlainObject | null | undefined, paths: string[], fallback: any = '') {
  if (!source) return fallback;

  for (const path of paths) {
    const parts = path.split('.');
    let cursor: any = source;
    for (const part of parts) {
      if (cursor === undefined || cursor === null) break;
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== '') return cursor;
  }

  return fallback;
}

function pathGet(source: PlainObject, key: string) {
  return source?.[key] ?? source?.[key.charAt(0).toUpperCase() + key.slice(1)] ?? source?.[key.toLowerCase()];
}

function extractCarsFromRaceSetup(raceSetup: PlainObject) {
  const cars = [
    ...arrayValue(pick(raceSetup, ['Cars', 'cars', 'EntryList', 'entryList'], [])),
    ...arrayValue(pick(raceSetup, ['CarModels', 'carModels', 'Models', 'models'], []))
  ];

  const names = cars
    .map((car) => prettifyName(pick(car, ['Model', 'model', 'Car', 'car', 'Name', 'name', 'ID', 'id'], '')))
    .filter(Boolean)
    .filter((item) => item !== '-');

  const single = prettifyName(pick(raceSetup, ['Car', 'car', 'CarModel', 'carModel'], ''), '');
  if (single && single !== '-') names.push(single);

  return [...new Set(names)].filter(Boolean);
}

function normalizeEvent(event: PlainObject, index: number) {
  const raceSetup = objectValue(pick(event, ['RaceSetup', 'raceSetup'], {}));
  const sessions = objectValue(pick(event, ['Sessions', 'sessions'], {}));
  const trackRaw = pick(raceSetup, ['Track', 'track', 'TrackName', 'trackName'], pick(event, ['Track', 'track', 'TrackName', 'trackName'], 'Circuito por confirmar'));
  const track = prettifyName(trackRaw, 'Circuito por confirmar');
  const cars = extractCarsFromRaceSetup(raceSetup);
  const scheduled = isoOrNull(pick(event, ['Scheduled', 'scheduled', 'ScheduledTime', 'scheduledTime', 'ScheduledAt', 'scheduledAt', 'Date', 'date']));
  const started = isoOrNull(pick(event, ['StartedTime', 'startedTime', 'Started', 'started']));
  const completed = isoOrNull(pick(event, ['CompletedTime', 'completedTime', 'Completed', 'completed', 'Finished', 'finished']));
  const cancelled = boolValue(pick(event, ['Cancelled', 'cancelled'], false));
  const sessionKeys = sessions && typeof sessions === 'object' ? Object.keys(sessions) : [];

  let status = 'pending';
  if (cancelled) status = 'cancelled';
  else if (completed) status = 'completed';
  else if (started) status = 'in_progress';
  else if (scheduled && dateMs(scheduled) > Date.now()) status = 'scheduled';

  return {
    index: index + 1,
    id: textValue(pick(event, ['ID', 'Id', 'id'], `event-${index + 1}`)),
    name: textValue(pick(event, ['Name', 'name', 'Title', 'title'], `Ronda ${index + 1}`)),
    track,
    trackRaw: textValue(trackRaw, ''),
    cars,
    carSummary: cars.length ? cars.slice(0, 4).join(' + ') + (cars.length > 4 ? ` +${cars.length - 4}` : '') : '',
    scheduledAt: scheduled,
    startedAt: started,
    completedAt: completed,
    status,
    laps: numberValue(pick(raceSetup, ['Laps', 'laps', 'RaceLaps', 'raceLaps'], 0)),
    durationMinutes: numberValue(pick(raceSetup, ['Time', 'time', 'RaceDuration', 'raceDuration'], 0)),
    sessions: sessionKeys,
    rawHasResults: sessionKeys.some((key) => Boolean(sessions?.[key]?.Results || sessions?.[key]?.results))
  };
}

function entrantSourceArrays(source: PlainObject, sourcePath: string) {
  const keys = [
    'Entrants',
    'entrants',
    'EntryList',
    'entryList',
    'Entries',
    'entries',
    'Drivers',
    'drivers',
    'Participants',
    'participants',
    'RegisteredDrivers',
    'registeredDrivers',
    'SignUps',
    'signUps',
    'Signups',
    'signups',
    'ACSRSignups',
    'acsrSignups',
    'ChampionshipEntrants',
    'championshipEntrants',
    'Leaderboard',
    'leaderboard',
    'Standings',
    'standings',
    'Results',
    'results'
  ];

  const rows: { path: string; items: PlainObject[] }[] = [];
  for (const key of keys) {
    const value = pathGet(source, key);
    const items = arrayValue(value);
    if (items.length) rows.push({ path: `${sourcePath}.${key}`, items });
  }
  return rows;
}

function firstObject(...values: unknown[]) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as PlainObject;
  }
  return {};
}

function normalizeEntrant(item: PlainObject, source: string, className = '') {
  const driver = firstObject(
    pick(item, ['Driver', 'driver'], null),
    pick(item, ['Player', 'player'], null),
    pick(item, ['User', 'user'], null),
    pick(item, ['Entrant', 'entrant'], null),
    pick(item, ['Registration', 'registration'], null)
  );

  const car = firstObject(
    pick(item, ['Car', 'car'], null),
    pick(item, ['Model', 'model'], null),
    pick(item, ['Vehicle', 'vehicle'], null),
    pick(item, ['Entry.Car', 'entry.car'], null)
  );

  const name = prettifyName(pick(item, [
    'Name',
    'name',
    'DisplayName',
    'displayName',
    'DriverName',
    'driverName',
    'PlayerName',
    'playerName',
    'SteamName',
    'steamName',
    'Username',
    'username',
    'UserName',
    'userName',
    'Driver.Name',
    'driver.Name',
    'Driver.DisplayName',
    'driver.displayName',
    'Player.Name',
    'player.name',
    'User.Name',
    'user.name'
  ], pick(driver, [
    'Name',
    'name',
    'DisplayName',
    'displayName',
    'DriverName',
    'driverName',
    'PlayerName',
    'playerName',
    'SteamName',
    'steamName',
    'Username',
    'username'
  ], '')), '');

  const guid = textValue(pick(item, [
    'GUID',
    'Guid',
    'guid',
    'DriverGUID',
    'driverGuid',
    'SteamID',
    'SteamId',
    'steamId',
    'SteamGUID',
    'steamGuid',
    'Driver.GUID',
    'driver.GUID',
    'Driver.Guid',
    'driver.Guid',
    'Driver.SteamID',
    'driver.steamId',
    'Player.GUID',
    'player.GUID',
    'User.GUID',
    'user.GUID'
  ], pick(driver, ['GUID', 'Guid', 'guid', 'SteamID', 'SteamId', 'steamId'], '')));

  const team = prettifyName(pick(item, [
    'Team',
    'team',
    'TeamName',
    'teamName',
    'Driver.Team',
    'driver.Team',
    'Player.Team',
    'player.Team'
  ], pick(driver, ['Team', 'team', 'TeamName', 'teamName'], '')), '');

  const model = prettifyName(pick(item, [
    'Model',
    'model',
    'Car',
    'car',
    'CarModel',
    'carModel',
    'Vehicle',
    'vehicle',
    'Entry.Car.Model',
    'entry.car.model'
  ], pick(car, ['Model', 'model', 'Name', 'name', 'ID', 'id'], '')), '');

  const points = numberValue(pick(item, [
    'Points',
    'points',
    'TotalPoints',
    'totalPoints',
    'Score',
    'score',
    'ChampionshipPoints',
    'championshipPoints'
  ], 0), 0);

  const position = numberValue(pick(item, [
    'Position',
    'position',
    'Rank',
    'rank',
    'Place',
    'place'
  ], 0), 0);

  const registeredAt = isoOrNull(pick(item, [
    'Created',
    'created',
    'CreatedAt',
    'createdAt',
    'Registered',
    'registered',
    'RegisteredAt',
    'registeredAt',
    'SignedUpAt',
    'signedUpAt'
  ], ''));

  const key = guid || `${name}|${team}|${model}` || `${source}|${Math.random()}`;

  return {
    name,
    guid,
    team,
    model,
    points,
    position,
    className,
    source,
    registeredAt,
    key
  };
}

function isProbablyDriver(row: ReturnType<typeof normalizeEntrant>) {
  if (!row.name && !row.guid && !row.model) return false;
  if (row.name && row.name.length > 80) return false;
  if (['-', 'true', 'false', '0'].includes(String(row.name).toLowerCase())) return false;
  return true;
}

function collectEntrantsFromKnownSources(raw: PlainObject, results: unknown) {
  const rows: ReturnType<typeof normalizeEntrant>[] = [];

  arrayValue(raw.Classes).forEach((classItem, classIndex) => {
    const className = prettifyName(pick(classItem, ['Name', 'name'], `Clase ${classIndex + 1}`), `Clase ${classIndex + 1}`);
    entrantSourceArrays(classItem, `Classes[${classIndex}]`).forEach((source) => {
      source.items.forEach((item) => rows.push(normalizeEntrant(item, source.path, className)));
    });
  });

  entrantSourceArrays(raw, 'root').forEach((source) => {
    source.items.forEach((item) => rows.push(normalizeEntrant(item, source.path, 'General')));
  });

  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const obj = results as PlainObject;
    entrantSourceArrays(obj, 'export-results').forEach((source) => {
      source.items.forEach((item) => rows.push(normalizeEntrant(item, source.path, 'Resultados')));
    });
  }

  return rows.filter(isProbablyDriver);
}

function deepScanEntrants(source: unknown, path = 'root', depth = 0, output: ReturnType<typeof normalizeEntrant>[] = [], diagnostics: PlainObject[] = []) {
  if (!source || depth > 6) return output;

  if (Array.isArray(source)) {
    const lowerPath = path.toLowerCase();
    const looksRelevant = /(entrant|entry|entries|driver|drivers|participant|signup|signups|standing|leaderboard|result|classification)/.test(lowerPath);
    if (looksRelevant) {
      const normalized = source
        .filter((item) => item && typeof item === 'object')
        .map((item) => normalizeEntrant(item as PlainObject, path, 'Detectado'))
        .filter(isProbablyDriver);

      if (normalized.length) {
        diagnostics.push({ path, count: normalized.length, sample: normalized.slice(0, 3).map((row) => ({ name: row.name, guid: row.guid, model: row.model, points: row.points })) });
        output.push(...normalized);
      }
    }

    source.forEach((item, index) => deepScanEntrants(item, `${path}[${index}]`, depth + 1, output, diagnostics));
    return output;
  }

  if (typeof source === 'object') {
    Object.entries(source as PlainObject).forEach(([key, value]) => deepScanEntrants(value, `${path}.${key}`, depth + 1, output, diagnostics));
  }

  return output;
}

function uniqueDrivers(rows: ReturnType<typeof normalizeEntrant>[]) {
  const seen = new Map<string, ReturnType<typeof normalizeEntrant>>();

  rows.forEach((row) => {
    const key = row.guid || row.name.toLowerCase() || row.key;
    if (!key) return;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      return;
    }

    seen.set(key, {
      ...existing,
      name: existing.name || row.name,
      guid: existing.guid || row.guid,
      team: existing.team || row.team,
      model: existing.model || row.model,
      points: Math.max(existing.points || 0, row.points || 0),
      position: existing.position || row.position,
      className: existing.className && existing.className !== 'Detectado' ? existing.className : row.className,
      source: [...new Set([existing.source, row.source].filter(Boolean))].join(' | '),
      registeredAt: existing.registeredAt || row.registeredAt
    });
  });

  return [...seen.values()]
    .sort((a, b) => {
      if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      if ((a.position || 0) && (b.position || 0)) return (a.position || 0) - (b.position || 0);
      return String(a.name).localeCompare(String(b.name));
    })
    .map((row, index) => ({
      ...row,
      position: row.position || index + 1
    }));
}

function normalizeClass(classItem: PlainObject, index: number, allDrivers: ReturnType<typeof uniqueDrivers>) {
  const className = prettifyName(pick(classItem, ['Name', 'name'], `Clase ${index + 1}`), `Clase ${index + 1}`);

  const classDrivers = collectEntrantsFromKnownSources({ Classes: [classItem] }, null)
    .map((driver) => ({ ...driver, className }));

  const drivers = uniqueDrivers(classDrivers);

  return {
    id: textValue(pick(classItem, ['ID', 'Id', 'id'], `class-${index + 1}`)),
    name: className,
    color: textValue(pick(classItem, ['Color', 'color'], '')),
    entrantsCount: drivers.length,
    drivers: drivers.slice(0, 100)
  };
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

function parsePublicEntrantsFromHtml(html: string) {
  const text = String(html || '');
  if (!text) return [];

  const start = text.search(/id=["']entrants["']/i);
  if (start < 0) return [];

  const rest = text.slice(start);
  const end = rest.search(/id=["']points["']/i);
  const block = end > 0 ? rest.slice(0, end) : rest;

  const rows = [...block.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const output: ReturnType<typeof normalizeEntrant>[] = [];

  rows.forEach((row, index) => {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
    const rowText = stripHtml(row);

    if (!cells.length) return;
    if (/driver/i.test(rowText) && /attendance/i.test(rowText)) return;
    if (/open slots/i.test(rowText)) return;

    const numericIndex = cells.findIndex((cell) => /^\d+/.test(cell));
    if (numericIndex < 0) return;

    const className = numericIndex > 0 ? cells[numericIndex - 1] : 'General';
    const position = Number.parseInt(cells[numericIndex], 10) || index + 1;

    const attendanceIndex = cells.findIndex((cell) => /\d+\s*\/\s*\d+/.test(cell));
    const carIndex = cells.findIndex((cell, cellIndex) => cellIndex > numericIndex && /\s\/\s/.test(cell) && cellIndex !== attendanceIndex);
    const driverIndex = numericIndex + 1;

    const name = cells[driverIndex] || '';
    if (!name || /^rating$/i.test(name) || /^car$/i.test(name)) return;

    const model = carIndex >= 0 ? cells[carIndex].split('/')[0].trim() : '';
    const teamCandidates = cells.slice(driverIndex + 1, carIndex >= 0 ? carIndex : Math.max(driverIndex + 1, cells.length - 1));
    const team = teamCandidates.find((cell) => cell && !/\d+\s*\/\s*\d+/.test(cell) && !/^[A-F0-9]{6,}$/i.test(cell)) || '';

    const guid = extractAttr(row, 'data-guid') || extractAttr(row, 'data-driver-guid');

    output.push({
      key: guid || `${name}-${position}`,
      name: prettifyName(name, name),
      guid,
      team: prettifyName(team, ''),
      model: prettifyName(model, ''),
      position,
      points: 0,
      className: prettifyName(className, className || 'General'),
      source: 'public-html-entrants'
    });
  });

  return output.filter(isProbablyDriver);
}


function createDiagnostics(raw: PlainObject, results: unknown, knownRows: ReturnType<typeof normalizeEntrant>[], deepDiagnostics: PlainObject[], publicRows: ReturnType<typeof normalizeEntrant>[]) {
  const topLevelKeys = Object.keys(raw || {}).sort();
  const resultKeys = results && typeof results === 'object' && !Array.isArray(results) ? Object.keys(results as PlainObject).sort() : [];

  const likelyArrays: PlainObject[] = [];
  function walkArrays(source: unknown, path = 'root', depth = 0) {
    if (!source || depth > 4) return;
    if (Array.isArray(source)) {
      likelyArrays.push({ path, count: source.length, firstKeys: source[0] && typeof source[0] === 'object' ? Object.keys(source[0] as PlainObject).slice(0, 15) : [] });
      source.slice(0, 2).forEach((item, index) => walkArrays(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof source === 'object') {
      Object.entries(source as PlainObject).forEach(([key, value]) => walkArrays(value, `${path}.${key}`, depth + 1));
    }
  }

  walkArrays(raw);
  if (results && typeof results === 'object') walkArrays(results, 'export-results');

  return {
    topLevelKeys,
    resultKeys,
    likelyArrays: likelyArrays
      .filter((item) => item.count > 0)
      .slice(0, 60),
    detectedEntrantSources: deepDiagnostics.slice(0, 40),
    knownRowsCount: knownRows.length,
    publicHtmlEntrantsCount: publicRows.length,
    publicHtmlEntrantsSample: publicRows.slice(0, 5).map((row) => ({
      name: row.name,
      className: row.className,
      model: row.model,
      source: row.source
    }))
  };
}

function normalizeChampionship(raw: PlainObject, results: unknown, config: ReturnType<typeof getAcsmChampionshipConfig>, publicHtml = '') {
  const events = arrayValue(raw.Events).map(normalizeEvent);

  const publicRows = parsePublicEntrantsFromHtml(publicHtml);
  const knownRows = [...collectEntrantsFromKnownSources(raw, results), ...publicRows];
  const deepDiagnostics: PlainObject[] = [];
  const deepRows = deepScanEntrants(raw, 'root', 0, [], deepDiagnostics);
  if (results && typeof results === 'object') deepScanEntrants(results, 'export-results', 0, deepRows, deepDiagnostics);

  const registeredDrivers = uniqueDrivers([...knownRows, ...deepRows]);
  const classes = arrayValue(raw.Classes).map((classItem, index) => normalizeClass(classItem, index, registeredDrivers));

  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => event.status !== 'completed' && event.status !== 'cancelled')
    .sort((a, b) => {
      const left = dateMs(a.scheduledAt) || Number.MAX_SAFE_INTEGER;
      const right = dateMs(b.scheduledAt) || Number.MAX_SAFE_INTEGER;
      return left - right || a.index - b.index;
    });

  const completedEvents = events.filter((event) => event.status === 'completed');
  const nextEvent = upcomingEvents.find((event) => !event.scheduledAt || dateMs(event.scheduledAt) >= now) || upcomingEvents[0] || null;
  const completedCount = completedEvents.length;
  const progressPercent = events.length ? Math.round((completedCount / events.length) * 100) : 0;

  const standings = registeredDrivers
    .filter((driver) => driver.name || driver.guid)
    .sort((a, b) => {
      if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      return String(a.name).localeCompare(String(b.name));
    })
    .map((driver, index) => ({
      ...driver,
      position: driver.position || index + 1
    }));

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
      classes: classes.length,
      entrants: registeredDrivers.length,
      standings: standings.length
    },
    nextEvent,
    events,
    classes,
    registeredDrivers,
    standings,
    diagnostics: createDiagnostics(raw, results, knownRows, deepDiagnostics, publicRows)
  };
}

export function registerAcsmChampionshipRoutes(app: express.Express) {
  app.get('/api/community/acsr-championship', async (req, res) => {
    const config = getAcsmChampionshipConfig();

    if (!config.enabled) {
      res.json({
        ok: true,
        enabled: false,
        source: 'acsm-championship-v4.6',
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
        source: 'acsm-championship-v4.6',
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
        message: 'Campeonato leído desde ACSM export + export-results + HTML público de entrants.'
      };

      cachedChampionship = { fetchedAt: now, payload };
      res.json(payload);
    } catch (error) {
      console.error('[GC] Error leyendo campeonato ACSM:', error);
      res.status(200).json({
        ok: false,
        enabled: true,
        source: 'acsm-championship-v4.6',
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
      source: 'acsm-championship-probe-v4.4',
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
        source: 'acsm-championship-inspect-v4.6',
        acsm: {
          championshipUrl: config.championshipUrl,
          signUpUrl: config.signUpUrl,
          exportUrl: config.exportUrl,
          exportResultsUrl: config.exportResultsUrl,
          icsUrl: config.icsUrl
        },
        stats: championship.stats,
        registeredDrivers: championship.registeredDrivers,
        standings: championship.standings,
        diagnostics: championship.diagnostics
      });
    } catch (error) {
      res.status(200).json({
        ok: false,
        source: 'acsm-championship-inspect-v4.6',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
