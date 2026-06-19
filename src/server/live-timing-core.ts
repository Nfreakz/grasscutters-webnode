type CachedResponse = {
  expiresAt: number;
  status: number;
  body: string;
};

type LiveTimingErrorPayload = {
  ok: false;
  error: 'ACSM unavailable';
  detail: string;
};

type LiveTimingSuccessPayload = {
  ok: true;
  updatedAt: string;
  server: {
    name: string | null;
    sessionName: string | null;
    sessionIndex: number | null;
    currentSessionIndex: number | null;
    sessionCount: number | null;
    track: string | null;
    trackConfig: string | null;
    time: number | null;
    elapsedMilliseconds: number | null;
    ambientTemp: number | null;
    roadTemp: number | null;
    weatherGraphics: string | null;
    mapUrl: string | null;
  };
  connectedDrivers: NormalizedDriver[];
  storedTimes: NormalizedDriver[];
};

export type NormalizedDriver = {
  position: number | null;
  driverName: string | null;
  driverInitials: string | null;
  guid: string | null;
  carModel: string | null;
  carName: string | null;
  carSkin: string | null;
  raceNumber: number | null;
  tyres: string | null;
  bestLap: number | null;
  bestLapFormatted: string;
  lastLap: number | null;
  lastLapFormatted: string;
  laps: number | null;
  topSpeedBestLap: number | null;
  topSpeedThisLap: number | null;
  split: unknown;
  ping: number | null;
  numPits: number | null;
  isInPits: boolean;
  lastSeen: string | null;
  normalisedSplinePos: number | null;
  lastPos: unknown;
  bestSplits: Array<{
    splitIndex: number;
    splitTime: number | null;
    splitTimeFormatted: string;
    cuts: number | null;
    isBest: boolean;
    isDriversBest: boolean;
  }>;
  bestLapSplits: Array<{
    splitIndex: number;
    splitTime: number | null;
    splitTimeFormatted: string;
    cuts: number | null;
    isBest: boolean;
    isDriversBest: boolean;
  }>;
};

const CACHE_TTL_MS = 5000;
const FETCH_TIMEOUT_MS = 4500;
const cachedResponses = new Map<string, CachedResponse>();

function getBaseUrl() {
  return String(process.env.ACSM_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function formatLapTime(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return '-';

  const milliseconds = Math.round(value / 1_000_000);
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatSplitCollection(raw: unknown) {
  if (!raw || typeof raw !== 'object') return [];
  const source = Array.isArray(raw)
    ? raw.map((entry, index) => [String(index), entry] as const)
    : Object.entries(raw as Record<string, any>);

  return source
    .map(([key, value]) => {
      const splitTime = value?.SplitTime ?? value?.splitTime ?? null;
      return {
        splitIndex: Number(value?.SplitIndex ?? value?.splitIndex ?? key),
        splitTime: toPositiveNumber(splitTime),
        splitTimeFormatted: formatLapTime(splitTime),
        cuts: toNumber(value?.Cuts ?? value?.cuts),
        isBest: Boolean(value?.IsBest ?? value?.isBest),
        isDriversBest: Boolean(value?.IsDriversBest ?? value?.isDriversBest)
      };
    })
    .filter((item) => Number.isFinite(item.splitIndex))
    .sort((a, b) => a.splitIndex - b.splitIndex);
}

function firstDefined<T>(...values: T[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizeDriver(driver: any): NormalizedDriver {
  const carInfo = driver?.CarInfo ?? {};
  const carModel = carInfo?.CarModel ?? null;
  const cars = driver?.Cars ?? {};
  const carData = (carModel && cars?.[carModel]) || Object.values(cars)?.[0] || null;

  const bestLap = firstDefined(carData?.BestLap, driver?.BestLap);
  const lastLap = firstDefined(carData?.LastLap, driver?.LastLap);
  const bestSplits = formatSplitCollection(firstDefined(carData?.BestSplits, driver?.BestSplits));
  const bestLapSplits = formatSplitCollection(firstDefined(carData?.BestLapSplits, driver?.BestLapSplits));

  return {
    position: toNumber(driver?.Position),
    driverName: firstDefined(carInfo?.DriverName, driver?.DriverName, driver?.Name),
    driverInitials: firstDefined(carInfo?.DriverInitials, driver?.DriverInitials),
    guid: firstDefined(carInfo?.DriverGUID, driver?.DriverGUID, driver?.Guid, driver?.GUID),
    carModel,
    carName: firstDefined(carInfo?.CarName, carData?.CarName, driver?.CarName),
    carSkin: firstDefined(carInfo?.CarSkin, driver?.CarSkin),
    raceNumber: toNumber(firstDefined(carInfo?.RaceNumber, carData?.RaceNumber, driver?.RaceNumber)),
    tyres: firstDefined(carInfo?.Tyres, carData?.TyreBestLap, carData?.Tyres),
    bestLap: toPositiveNumber(bestLap),
    bestLapFormatted: formatLapTime(bestLap),
    lastLap: toPositiveNumber(lastLap),
    lastLapFormatted: formatLapTime(lastLap),
    laps: toNumber(firstDefined(driver?.TotalNumLaps, carData?.NumLaps, driver?.NumLaps)),
    topSpeedBestLap: toNumber(carData?.TopSpeedBestLap),
    topSpeedThisLap: toNumber(carData?.TopSpeedThisLap),
    split: firstDefined(driver?.Split, driver?.DeltaToBest, driver?.DeltaToSelf),
    ping: toNumber(driver?.Ping),
    numPits: toNumber(firstDefined(driver?.NumPits, driver?.NumLongPits)),
    isInPits: Boolean(driver?.IsInPits),
    lastSeen: firstDefined(driver?.LastSeen, driver?.LastSeenAt, driver?.ConnectedTime),
    normalisedSplinePos: toNumber(driver?.NormalisedSplinePos),
    lastPos: driver?.LastPos ?? null,
    bestSplits,
    bestLapSplits
  };
}

function buildMapUrl(baseUrl: string, data: any) {
  const track = String(data?.Track ?? '').trim();
  if (!track) return null;

  const trackConfig = String(data?.TrackConfig ?? '').trim();
  const encodedTrack = encodeURIComponent(track);
  if (trackConfig) {
    return `${baseUrl}/content/tracks/${encodedTrack}/${encodeURIComponent(trackConfig)}/map.png`;
  }

  return `${baseUrl}/content/tracks/${encodedTrack}/map.png`;
}

function normalizePayload(data: any, baseUrl: string): LiveTimingSuccessPayload {
  const connectedDrivers = toArray<any>(data?.ConnectedDrivers).map(normalizeDriver);
  const storedTimes = toArray<any>(data?.DisconnectedDrivers).map(normalizeDriver);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    server: {
      name: firstDefined(data?.ServerName),
      sessionName: firstDefined(data?.Name),
      sessionIndex: toNumber(data?.SessionIndex),
      currentSessionIndex: toNumber(data?.CurrentSessionIndex),
      sessionCount: toNumber(data?.SessionCount),
      track: firstDefined(data?.Track),
      trackConfig: firstDefined(data?.TrackConfig),
      time: toNumber(data?.Time),
      elapsedMilliseconds: toNumber(data?.ElapsedMilliseconds),
      ambientTemp: toNumber(data?.AmbientTemp),
      roadTemp: toNumber(data?.RoadTemp),
      weatherGraphics: firstDefined(data?.WeatherGraphics),
      mapUrl: buildMapUrl(baseUrl, data)
    },
    connectedDrivers,
    storedTimes
  };
}

function errorPayload(detail: string): LiveTimingErrorPayload {
  return {
    ok: false,
    error: 'ACSM unavailable',
    detail
  };
}

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLiveTimingPayload() {
  const cacheKey = 'live-timing';
  const cached = cachedResponses.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return JSON.parse(cached.body) as LiveTimingSuccessPayload | LiveTimingErrorPayload;
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    const payload = errorPayload('ACSM_BASE_URL is not configured');
    cachedResponses.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      status: 502,
      body: JSON.stringify(payload)
    });
    return payload;
  }

  try {
    const response = await fetchJsonWithTimeout(`${baseUrl}/api/live-timings/leaderboard.json`);
    if (!response.ok) {
      throw new Error(`ACSM returned ${response.status}`);
    }

    const data = await response.json();
    const payload = normalizePayload(data, baseUrl);
    cachedResponses.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      status: 200,
      body: JSON.stringify(payload)
    });
    return payload;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown ACSM fetch error';
    const payload = errorPayload(detail);
    cachedResponses.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      status: 502,
      body: JSON.stringify(payload)
    });
    return payload;
  }
}

export function getLiveTimingResponseStatus(payload: LiveTimingSuccessPayload | LiveTimingErrorPayload) {
  return payload.ok ? 200 : 502;
}
