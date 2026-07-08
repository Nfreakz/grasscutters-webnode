import type express from 'express';

type AcsmSourceKey = 'main' | 'gt4';

type LiveDriver = {
  guid: string;
  carId: number | null;
  name: string;
  initials: string;
  carName: string;
  carModel: string;
  raceNumber: number | null;
  tyres: string | null;
  position: number | null;
  totalLaps: number | null;
  lastLapText: string | null;
  bestLapText: string | null;
  bestLapMs: number | null;
  qualifyingTimeText: string | null;
  deltaToBestMs: number | null;
  deltaToSelfMs: number | null;
  split: string | null;
  isInPits: boolean;
  ping: number | null;
  lastPos: { x: number; y: number; z: number } | null;
  normalisedSplinePos: number | null;
};

type LivePosition = {
  carId: number;
  guid: string | null;
  driverName: string | null;
  pos: { x: number; y: number; z: number } | null;
  velocity: { x: number; y: number; z: number } | null;
  rotation: { x: number; y: number; z: number } | null;
  gear: number | null;
  engineRpm: number | null;
  steerAngle: number | null;
  speedKmh: number | null;
  blueFlag: boolean;
  receivedAt: string;
};

type LiveState = {
  ok: boolean;
  sourceKey: AcsmSourceKey;
  sourceLabel: string;
  acsmBaseUrl: string;
  acsmWsUrl: string;
  connected: boolean;
  lastEventAt: string | null;
  lastError: string | null;
  snapshot: any | null;
  normalized: ReturnType<typeof normalizeStatus> | null;
  positions: Record<string, LivePosition>;
  carInfos: Record<string, any>;
  eventCounts: Record<string, number>;
  lastRawPosition: any | null;
  lastNormalizedPosition: LivePosition | null;
  lastPositionDropReason: string | null;
  startedAt: string;
};

const sources: Record<AcsmSourceKey, { label: string; baseUrl: string }> = {
  main: {
    label: 'Servidor 1 · Liga GrassCutters',
    baseUrl: process.env.GC_ACSM_MAIN_URL || 'http://145.239.131.153:8840'
  },
  gt4: {
    label: 'Servidor 2 · Supra GT4',
    baseUrl: process.env.GC_ACSM_GT4_URL || 'http://5.39.68.161:8840'
  }
};

const states = new Map<AcsmSourceKey, LiveState>();
const clients = new Map<AcsmSourceKey, Set<express.Response>>();
const sockets = new Map<AcsmSourceKey, any>();
const reconnectTimers = new Map<AcsmSourceKey, NodeJS.Timeout>();

function getSourceKey(value: unknown): AcsmSourceKey {
  const key = String(value || 'main').toLowerCase();
  return key === 'gt4' || key === 'server2' || key === '2' ? 'gt4' : 'main';
}

function acsmWsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/race-control';
  url.search = '';
  return url.toString();
}

function getInitialState(sourceKey: AcsmSourceKey): LiveState {
  const source = sources[sourceKey];
  return {
    ok: false,
    sourceKey,
    sourceLabel: source.label,
    acsmBaseUrl: source.baseUrl,
    acsmWsUrl: acsmWsUrl(source.baseUrl),
    connected: false,
    lastEventAt: null,
    lastError: null,
    snapshot: null,
    normalized: null,
    positions: {},
    carInfos: {},
    eventCounts: {},
    lastRawPosition: null,
    lastNormalizedPosition: null,
    lastPositionDropReason: null,
    startedAt: new Date().toISOString()
  };
}

function getState(sourceKey: AcsmSourceKey) {
  let state = states.get(sourceKey);
  if (!state) {
    state = getInitialState(sourceKey);
    states.set(sourceKey, state);
  }
  return state;
}

function broadcast(sourceKey: AcsmSourceKey, event: string, payload: unknown) {
  const set = clients.get(sourceKey);
  if (!set?.size) return;
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of Array.from(set)) {
    try {
      res.write(body);
    } catch {
      set.delete(res);
    }
  }
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vector(value: any) {
  if (!value) return null;
  return {
    x: Number(value.X ?? value.x ?? 0),
    y: Number(value.Y ?? value.y ?? 0),
    z: Number(value.Z ?? value.z ?? 0)
  };
}

function ticksToMs(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // ACSM expone tiempos de vuelta como nanosegundos en los eventos live.
  // Ejemplo real: 103768000000 => 1:43.768.
  // Algunas fuentes auxiliares pueden venir ya en ms; las respetamos.
  if (n >= 10_000_000) return Math.round(n / 1_000_000);
  return Math.round(n);
}

function formatLapMs(ms: number | null) {
  if (!Number.isFinite(Number(ms)) || !ms) return null;
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function sessionTypeLabel(value: unknown) {
  switch (Number(value)) {
    case 0: return 'Booking';
    case 1: return 'Practice';
    case 2: return 'Qualifying';
    case 3: return 'Race';
    default: return 'Unknown';
  }
}

function normalizeDriver(guid: string, driver: any): LiveDriver {
  const carInfo = driver?.CarInfo || {};
  const cars = driver?.Cars || {};
  const currentCar = carInfo.CarModel && cars[carInfo.CarModel] ? cars[carInfo.CarModel] : null;
  const bestLapMs = ticksToMs(currentCar?.BestLap ?? driver?.BestLap ?? driver?.QualifyingTime);
  const lastLapMs = ticksToMs(currentCar?.LastLap ?? driver?.LastLap);
  const qualifyingMs = ticksToMs(currentCar?.BestLap ?? driver?.QualifyingTime);

  return {
    guid,
    carId: numberOrNull(carInfo.CarID),
    name: String(carInfo.DriverName || driver?.DriverName || guid),
    initials: String(carInfo.DriverInitials || '').trim(),
    carName: String(carInfo.CarName || carInfo.CarModel || ''),
    carModel: String(carInfo.CarModel || ''),
    raceNumber: numberOrNull(carInfo.RaceNumber),
    tyres: carInfo.Tyres ? String(carInfo.Tyres) : null,
    position: numberOrNull(driver?.Position),
    totalLaps: numberOrNull(driver?.TotalNumLaps),
    lastLapText: formatLapMs(lastLapMs),
    bestLapText: formatLapMs(bestLapMs),
    bestLapMs,
    qualifyingTimeText: formatLapMs(qualifyingMs),
    deltaToBestMs: numberOrNull(driver?.DeltaToBest),
    deltaToSelfMs: numberOrNull(driver?.DeltaToSelf),
    split: driver?.Split ? String(driver.Split) : null,
    isInPits: Boolean(driver?.IsInPits),
    ping: numberOrNull(driver?.Ping),
    lastPos: vector(driver?.LastPos),
    normalisedSplinePos: numberOrNull(driver?.NormalisedSplinePos)
  };
}

function getObjectRecord(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasDriverCars(value: any) {
  return value && typeof value === 'object' && value.Cars && typeof value.Cars === 'object' && !Array.isArray(value.Cars);
}

function addDriverCandidate(map: Map<string, any>, fallbackKey: string, driver: any) {
  if (!hasDriverCars(driver)) return;
  const guid = String(driver?.CarInfo?.DriverGUID || driver?.DriverGUID || fallbackKey || '').trim();
  if (!guid) return;
  const existing = map.get(guid);
  if (!existing) {
    map.set(guid, driver);
    return;
  }
  const existingCars = Object.keys(existing?.Cars || {}).length;
  const nextCars = Object.keys(driver?.Cars || {}).length;
  if (nextCars > existingCars) map.set(guid, driver);
}

function collectStoredTimeDrivers(message: any) {
  const map = new Map<string, any>();
  const directContainers = [
    message?.ConnectedDrivers?.Drivers,
    message?.DisconnectedDrivers?.Drivers,
    message?.DisconnectedDrivers,
    message?.StoredTimes?.Drivers,
    message?.StoredTimes,
    message?.Leaderboard?.Drivers,
    message?.Leaderboards?.Drivers,
    message?.RaceResults?.Drivers,
    message?.Results?.Drivers
  ];

  for (const container of directContainers) {
    for (const [key, value] of Object.entries<any>(getObjectRecord(container))) {
      addDriverCandidate(map, key, value);
    }
  }

  const seen = new Set<any>();
  function scan(value: any, depth: number, keyHint = '') {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
    seen.add(value);
    if (hasDriverCars(value)) addDriverCandidate(map, keyHint, value);
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((item, index) => scan(item, depth + 1, String(index)));
      return;
    }
    for (const [key, child] of Object.entries<any>(value)) {
      if (['BestLapMiniSectors', 'MiniSectors', 'CurrentLapMiniSectors'].includes(key)) continue;
      scan(child, depth + 1, key);
    }
  }
  scan(message, 0);

  return Object.fromEntries(map.entries());
}


function splitRecordToArray(value: any) {
  if (!value || typeof value !== 'object') return [];
  const entries = Object.values(value as Record<string, any>);
  return entries
    .map((split: any, index) => ({
      index: numberOrNull(split?.SplitIndex) ?? index,
      ms: ticksToMs(split?.SplitTime ?? split?.Time ?? split?.splitTime),
      isBest: Boolean(split?.IsBest),
      isDriversBest: Boolean(split?.IsDriversBest),
      cuts: numberOrNull(split?.Cuts) ?? 0
    }))
    .filter((split) => split.ms)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function normalizeSplitSource(car: any) {
  // ACSM suele pintar los sectores desde BestLapSplits. Si no existe, usamos BestSplits.
  // En el snapshot real ambos objetos pueden existir, pero BestLapSplits es el que más se acerca
  // a las pastillas S1/S2/S3 que enseña ACSM junto al Best Lap.
  const bestLapSplits = splitRecordToArray(car?.BestLapSplits);
  const bestSplits = splitRecordToArray(car?.BestSplits);
  const splits = bestLapSplits.length ? bestLapSplits : bestSplits;
  return splits.map((split) => ({
    ...split,
    text: formatLapMs(split.ms),
    shortText: split.ms ? `${(split.ms / 1000).toFixed(3)}s` : null
  }));
}

function normalizeStoredTimes(driversObject: Record<string, any> | undefined) {
  const rows: any[] = [];
  const seenRows = new Set<string>();
  for (const [guid, driver] of Object.entries(driversObject || {})) {
    const name = String(driver?.CarInfo?.DriverName || driver?.DriverName || guid);
    const cars = driver?.Cars || {};
    for (const [carModel, car] of Object.entries<any>(cars)) {
      const bestLapMs = ticksToMs(car?.BestLap);
      if (!bestLapMs) continue;
      const key = `${guid}:${carModel}:${bestLapMs}`;
      if (seenRows.has(key)) continue;
      seenRows.add(key);
      rows.push({
        guid,
        driverName: name,
        carModel,
        carName: String(car?.CarName || carModel),
        raceNumber: numberOrNull(car?.RaceNumber ?? driver?.CarInfo?.RaceNumber),
        tyres: car?.TyreBestLap ? String(car.TyreBestLap) : (driver?.CarInfo?.Tyres ? String(driver.CarInfo.Tyres) : null),
        bestLapMs,
        bestLapText: formatLapMs(bestLapMs),
        lastLapText: formatLapMs(ticksToMs(car?.LastLap)),
        laps: numberOrNull(car?.NumLaps),
        topSpeedKmh: numberOrNull(car?.TopSpeedBestLap),
        sectors: normalizeSplitSource(car),
        bestSplits: car?.BestSplits || null,
        bestLapSplits: car?.BestLapSplits || null
      });
    }
  }
  rows.sort((a, b) => (a.bestLapMs || Number.MAX_SAFE_INTEGER) - (b.bestLapMs || Number.MAX_SAFE_INTEGER));
  return rows;
}


function normalizeCarInfo(guid: string, carInfo: any): LiveDriver {
  return {
    guid,
    carId: numberOrNull(carInfo?.CarID),
    name: String(carInfo?.DriverName || guid),
    initials: String(carInfo?.DriverInitials || '').trim(),
    carName: String(carInfo?.CarName || carInfo?.CarModel || ''),
    carModel: String(carInfo?.CarModel || ''),
    raceNumber: numberOrNull(carInfo?.RaceNumber),
    tyres: carInfo?.Tyres ? String(carInfo.Tyres) : null,
    position: null,
    totalLaps: null,
    lastLapText: null,
    bestLapText: null,
    bestLapMs: null,
    qualifyingTimeText: null,
    deltaToBestMs: null,
    deltaToSelfMs: null,
    split: null,
    isInPits: false,
    ping: null,
    lastPos: null,
    normalisedSplinePos: null
  };
}

function mergeDriversWithCarInfos(drivers: LiveDriver[], carIdToGuid: Record<string, any>, carInfos: Record<string, any>) {
  const byGuid = new Map(drivers.map((driver) => [driver.guid, driver]));
  for (const [carId, guidValue] of Object.entries(carIdToGuid || {})) {
    const guid = String(guidValue || '');
    if (!guid || byGuid.has(guid)) continue;
    const info = carInfos[String(carId)] || carInfos[guid];
    if (!info) continue;
    const driver = normalizeCarInfo(guid, { ...info, CarID: info.CarID ?? Number(carId) });
    byGuid.set(guid, driver);
  }
  return Array.from(byGuid.values()).sort((a, b) => (a.position ?? a.carId ?? 9999) - (b.position ?? b.carId ?? 9999));
}

function normalizeStatus(message: any, state?: LiveState) {
  if (!message) return null as any;
  const session = message.SessionInfo || {};
  const track = message.TrackInfo || {};
  const connected = message.ConnectedDrivers || {};
  const driversObject = connected.Drivers || {};
  const carIdToGuid = connected.CarIDToGUID || message.CarIDToGUID || {};
  const positionalOrder = connected.GUIDsInPositionalOrder || [];
  const storedDriversObject = collectStoredTimeDrivers(message);
  const baseDrivers = Object.entries(driversObject).map(([guid, driver]) => normalizeDriver(guid, driver));
  const drivers = mergeDriversWithCarInfos(baseDrivers, carIdToGuid, state?.carInfos || {});
  const storedTimes = normalizeStoredTimes(storedDriversObject);

  const carSlots = Object.entries(carIdToGuid).map(([carId, guid]) => {
    const driver = drivers.find((item) => item.guid === String(guid));
    const info = state?.carInfos?.[String(carId)] || state?.carInfos?.[String(guid)] || {};
    return {
      carId: numberOrNull(carId),
      guid: String(guid),
      driverName: driver?.name || info.DriverName || null,
      carName: driver?.carName || info.CarName || info.CarModel || null,
      raceNumber: driver?.raceNumber ?? numberOrNull(info.RaceNumber),
      tyres: driver?.tyres || info.Tyres || null,
      knownDriver: Boolean(driver || info.DriverName)
    };
  }).sort((a, b) => (a.carId ?? 9999) - (b.carId ?? 9999));

  return {
    receivedAt: new Date().toISOString(),
    currentRealtimePosInterval: numberOrNull(message.CurrentRealtimePosInterval),
    session: {
      serverName: String(session.ServerName || ''),
      name: String(session.Name || ''),
      type: numberOrNull(session.Type),
      typeLabel: sessionTypeLabel(session.Type),
      track: String(session.Track || ''),
      trackConfig: String(session.TrackConfig || ''),
      ambientTemp: numberOrNull(session.AmbientTemp),
      roadTemp: numberOrNull(session.RoadTemp),
      weatherGraphics: String(session.WeatherGraphics || ''),
      elapsedMilliseconds: numberOrNull(session.ElapsedMilliseconds),
      timeMinutes: numberOrNull(session.Time),
      laps: numberOrNull(session.Laps)
    },
    track: {
      name: String(track.name || session.Track || ''),
      city: String(track.city || ''),
      country: String(track.country || ''),
      length: String(track.length || ''),
      pitboxes: numberOrNull(track.pitboxes),
      run: String(track.run || ''),
      author: String(track.author || ''),
      version: String(track.version || '')
    },
    trackMapData: message.TrackMapData || null,
    mapPath: `/content/tracks/${encodeURIComponent(String(session.Track || ''))}${session.TrackConfig ? `/${encodeURIComponent(String(session.TrackConfig))}` : ''}/map.png`,
    previewPath: `/content/tracks/${encodeURIComponent(String(session.Track || ''))}/ui${session.TrackConfig ? `/${encodeURIComponent(String(session.TrackConfig))}` : ''}/preview.png`,
    carIdToGuid,
    positionalOrder,
    carSlots,
    drivers,
    storedTimes: storedTimes.slice(0, 200),
    debugCounts: {
      driversObject: Object.keys(driversObject).length,
      storedDrivers: Object.keys(storedDriversObject).length,
      carInfos: Object.keys(state?.carInfos || {}).length,
      carIdToGuid: Object.keys(carIdToGuid).length,
      positionalOrder: Array.isArray(positionalOrder) ? positionalOrder.length : 0,
      carSlots: carSlots.length,
      storedTimes: storedTimes.length
    }
  };
}

function normalizePosition(message: any, state: LiveState): LivePosition | null {
  const payload = typeof message === 'string' ? (() => { try { return JSON.parse(message); } catch { return null; } })() : message;
  if (!payload || typeof payload !== 'object') {
    state.lastPositionDropReason = 'EventType 53 sin Message objeto.';
    return null;
  }
  const carId = numberOrNull(payload.CarID ?? payload.carId);
  if (carId === null) {
    state.lastPositionDropReason = 'EventType 53 sin CarID numérico.';
    return null;
  }
  const carIdToGuid = state.normalized?.carIdToGuid || state.snapshot?.ConnectedDrivers?.CarIDToGUID || state.snapshot?.CarIDToGUID || {};
  const guid = carIdToGuid[String(carId)] || carIdToGuid[carId] || null;
  const driver = guid ? state.normalized?.drivers.find((item: LiveDriver) => item.guid === String(guid)) : null;
  const slot = guid ? state.normalized?.carSlots?.find((item: any) => item.guid === String(guid)) : null;
  const info = state.carInfos[String(carId)] || (guid ? state.carInfos[String(guid)] : null) || {};
  const velocity = vector(payload.Velocity ?? payload.velocity);
  const speedKmh = velocity ? Math.sqrt(velocity.x ** 2 + velocity.z ** 2) * 3.6 : null;

  const position = {
    carId,
    guid: guid ? String(guid) : null,
    driverName: driver?.name || slot?.driverName || info.DriverName || (guid ? `GUID ${String(guid).slice(-6)}` : `Car ${carId}`),
    pos: vector(payload.Pos ?? payload.pos),
    velocity,
    rotation: vector(payload.Rotation ?? payload.rotation),
    gear: numberOrNull(payload.Gear ?? payload.gear),
    engineRpm: numberOrNull(payload.EngineRPM ?? payload.engineRpm),
    steerAngle: numberOrNull(payload.SteerAngle ?? payload.steerAngle),
    speedKmh: speedKmh === null ? null : Math.round(speedKmh),
    blueFlag: Boolean(payload.BlueFlag ?? payload.blueFlag),
    receivedAt: new Date().toISOString()
  };
  state.lastPositionDropReason = null;
  return position;
}

function debugState(state: LiveState) {
  const snapshot = state.snapshot || {};
  const connected = snapshot.ConnectedDrivers || {};
  const driversObject = connected.Drivers || {};
  const carIdToGuid = connected.CarIDToGUID || snapshot.CarIDToGUID || {};
  return {
    socket: {
      wsUrl: state.acsmWsUrl,
      startedAt: state.startedAt,
      connected: state.connected,
      lastEventAt: state.lastEventAt,
      lastError: state.lastError,
      eventCounts: state.eventCounts
    },
    rawKeys: Object.keys(snapshot),
    connectedDriversKeys: Object.keys(connected),
    rawCounts: {
      driversObject: Object.keys(driversObject).length,
      carIdToGuid: Object.keys(carIdToGuid).length,
      positionalOrder: Array.isArray(connected.GUIDsInPositionalOrder) ? connected.GUIDsInPositionalOrder.length : 0,
      positions: Object.keys(state.positions || {}).length,
      carInfos: Object.keys(state.carInfos || {}).length,
      storedDrivers: Object.keys(collectStoredTimeDrivers(snapshot)).length
    },
    examples: {
      driverGuids: Object.keys(driversObject).slice(0, 5),
      carIdToGuid: Object.entries(carIdToGuid).slice(0, 10),
      carInfos: Object.entries(state.carInfos || {}).slice(0, 10),
      lastRawPosition: state.lastRawPosition,
      lastNormalizedPosition: state.lastNormalizedPosition,
      lastPositionDropReason: state.lastPositionDropReason
    }
  };
}

function publicState(state: LiveState, options: { debug?: boolean; raw?: boolean } = {}) {
  const payload: any = {
    ok: state.ok,
    sourceKey: state.sourceKey,
    sourceLabel: state.sourceLabel,
    acsmBaseUrl: state.acsmBaseUrl,
    acsmWsUrl: state.acsmWsUrl,
    connected: state.connected,
    lastEventAt: state.lastEventAt,
    lastError: state.lastError,
    eventCounts: state.eventCounts,
    normalized: state.normalized,
    positions: state.positions,
    lastRawPosition: state.lastRawPosition,
    lastNormalizedPosition: state.lastNormalizedPosition,
    lastPositionDropReason: state.lastPositionDropReason,
    debug: debugState(state)
  };
  if (options.raw) payload.raw = state.snapshot;
  return payload;
}

async function ensureSocket(sourceKey: AcsmSourceKey) {
  const existing = sockets.get(sourceKey);
  if (existing && (existing.readyState === 0 || existing.readyState === 1)) return existing;

  const state = getState(sourceKey);
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(state.acsmWsUrl);
  sockets.set(sourceKey, ws);

  ws.on('open', () => {
    state.connected = true;
    state.ok = true;
    state.lastError = null;
    broadcast(sourceKey, 'status', publicState(state));
  });

  ws.on('message', (raw: any) => {
    let event: any = null;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }

    const numericEventType = Number(event.EventType);
    const eventType = Number.isFinite(numericEventType) ? String(numericEventType) : String(event.EventType ?? 'unknown');
    state.eventCounts[eventType] = (state.eventCounts[eventType] || 0) + 1;
    state.lastEventAt = new Date().toISOString();

    if (numericEventType === 51) {
      const carInfo = typeof event.Message === 'string' ? JSON.parse(event.Message) : event.Message;
      const carId = numberOrNull(carInfo?.CarID);
      const guid = carInfo?.DriverGUID ? String(carInfo.DriverGUID) : null;
      if (carId !== null) state.carInfos[String(carId)] = carInfo;
      if (guid) state.carInfos[guid] = carInfo;
      if (state.snapshot) state.normalized = normalizeStatus(state.snapshot, state);
      broadcast(sourceKey, 'snapshot', publicState(state));
      return;
    }

    if (numericEventType === 52) {
      const carId = numberOrNull(event.Message?.CarID ?? event.Message);
      if (carId !== null) delete state.positions[String(carId)];
      broadcast(sourceKey, 'snapshot', publicState(state));
      return;
    }

    if (numericEventType === 200) {
      state.snapshot = event.Message;
      state.normalized = normalizeStatus(event.Message, state);
      broadcast(sourceKey, 'snapshot', publicState(state));
      return;
    }

    if (numericEventType === 53) {
      state.lastRawPosition = event.Message;
      const position = normalizePosition(event.Message, state);
      if (position) {
        state.positions[String(position.carId)] = position;
        state.lastNormalizedPosition = position;
        broadcast(sourceKey, 'position', position);
      } else {
        broadcast(sourceKey, 'status', publicState(state));
      }
    }
  });

  ws.on('close', () => {
    state.connected = false;
    sockets.delete(sourceKey);
    broadcast(sourceKey, 'status', publicState(state));
    scheduleReconnect(sourceKey);
  });

  ws.on('error', (error: any) => {
    state.lastError = error?.message || String(error);
    state.connected = false;
    broadcast(sourceKey, 'status', publicState(state));
  });

  return ws;
}

function scheduleReconnect(sourceKey: AcsmSourceKey) {
  if (reconnectTimers.has(sourceKey)) return;
  const timer = setTimeout(() => {
    reconnectTimers.delete(sourceKey);
    void ensureSocket(sourceKey).catch((error) => {
      const state = getState(sourceKey);
      state.lastError = error instanceof Error ? error.message : String(error);
    });
  }, 2500);
  if (typeof timer.unref === 'function') timer.unref();
  reconnectTimers.set(sourceKey, timer);
}

function queryBool(value: unknown) {
  return ['1', 'true', 'yes', 'on', 'debug'].includes(String(value || '').toLowerCase());
}

export function registerGcAcsmLiveTestRoutes(app: express.Express) {
  app.get('/api/gc/live-test/snapshot', async (req, res) => {
    const sourceKey = getSourceKey(req.query.server || req.query.source);
    const state = getState(sourceKey);
    try {
      await ensureSocket(sourceKey);
      res.setHeader('Cache-Control', 'no-store');
      res.json(publicState(state, { raw: queryBool(req.query.raw) }));
    } catch (error) {
      res.status(500).json({
        ok: false,
        sourceKey,
        message: 'No se pudo conectar al WebSocket ACSM.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/gc/live-test/stream', async (req, res) => {
    const sourceKey = getSourceKey(req.query.server || req.query.source);
    const set = clients.get(sourceKey) || new Set<express.Response>();
    clients.set(sourceKey, set);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    set.add(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, sourceKey, message: 'GC live-test stream conectado.' })}\n\n`);

    try {
      await ensureSocket(sourceKey);
      res.write(`event: snapshot\ndata: ${JSON.stringify(publicState(getState(sourceKey)))}\n\n`);
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) })}\n\n`);
    }

    req.on('close', () => {
      set.delete(res);
    });
  });

  app.get('/api/gc/live-test/map', async (req, res) => {
    const sourceKey = getSourceKey(req.query.server || req.query.source);
    const state = getState(sourceKey);
    const track = String(req.query.track || state.normalized?.session.track || '').trim();
    const layout = String(req.query.layout || state.normalized?.session.trackConfig || '').trim();

    if (!track) {
      res.status(400).json({ ok: false, message: 'Falta track.' });
      return;
    }

    const source = sources[sourceKey];
    const safeTrack = encodeURIComponent(track);
    const safeLayout = layout ? `/${encodeURIComponent(layout)}` : '';
    const url = `${source.baseUrl}/content/tracks/${safeTrack}${safeLayout}/map.png`;

    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        res.status(response.status || 502).json({ ok: false, message: 'No se pudo leer map.png de ACSM.', url });
        return;
      }
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=60');
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      res.status(502).json({ ok: false, message: 'Error proxy map.png ACSM.', error: error instanceof Error ? error.message : String(error) });
    }
  });
}
