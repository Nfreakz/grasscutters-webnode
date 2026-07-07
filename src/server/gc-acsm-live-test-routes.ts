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
    positions: {}
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
  for (const res of set) {
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
  // ACSM usa ticks .NET: 10.000 ticks = 1 ms.
  return Math.round(n / 10000);
}

function formatLapMs(ms: number | null) {
  if (!Number.isFinite(Number(ms)) || !ms) return null;
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
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

function normalizeStoredTimes(driversObject: Record<string, any> | undefined) {
  const rows: any[] = [];
  for (const [guid, driver] of Object.entries(driversObject || {})) {
    const name = String(driver?.CarInfo?.DriverName || driver?.DriverName || guid);
    const cars = driver?.Cars || {};
    for (const [carModel, car] of Object.entries<any>(cars)) {
      const bestLapMs = ticksToMs(car?.BestLap);
      if (!bestLapMs) continue;
      rows.push({
        guid,
        driverName: name,
        carModel,
        carName: String(car?.CarName || carModel),
        raceNumber: numberOrNull(car?.RaceNumber),
        tyres: car?.TyreBestLap ? String(car.TyreBestLap) : null,
        bestLapMs,
        bestLapText: formatLapMs(bestLapMs),
        lastLapText: formatLapMs(ticksToMs(car?.LastLap)),
        laps: numberOrNull(car?.NumLaps),
        topSpeedKmh: numberOrNull(car?.TopSpeedBestLap),
        bestSplits: car?.BestSplits || car?.BestLapSplits || null
      });
    }
  }
  rows.sort((a, b) => (a.bestLapMs || Number.MAX_SAFE_INTEGER) - (b.bestLapMs || Number.MAX_SAFE_INTEGER));
  return rows;
}

function normalizeStatus(message: any) {
  if (!message) return null as any;
  const session = message.SessionInfo || {};
  const track = message.TrackInfo || {};
  const connected = message.ConnectedDrivers || {};
  const driversObject = connected.Drivers || {};
  const carIdToGuid = connected.CarIDToGUID || message.CarIDToGUID || {};
  const drivers = Object.entries(driversObject).map(([guid, driver]) => normalizeDriver(guid, driver));
  drivers.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

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
    positionalOrder: connected.GUIDsInPositionalOrder || [],
    drivers,
    storedTimes: normalizeStoredTimes(driversObject).slice(0, 200)
  };
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

function normalizePosition(message: any, state: LiveState): LivePosition | null {
  const carId = numberOrNull(message?.CarID);
  if (carId === null) return null;
  const carIdToGuid = state.normalized?.carIdToGuid || state.snapshot?.ConnectedDrivers?.CarIDToGUID || {};
  const guid = carIdToGuid[String(carId)] || carIdToGuid[carId] || null;
  const driver = guid ? state.normalized?.drivers.find((item: LiveDriver) => item.guid === guid) : null;
  const velocity = vector(message?.Velocity);
  const speedKmh = velocity ? Math.sqrt(velocity.x ** 2 + velocity.z ** 2) * 3.6 : null;

  return {
    carId,
    guid,
    driverName: driver?.name || null,
    pos: vector(message?.Pos),
    velocity,
    rotation: vector(message?.Rotation),
    gear: numberOrNull(message?.Gear),
    engineRpm: numberOrNull(message?.EngineRPM),
    steerAngle: numberOrNull(message?.SteerAngle),
    speedKmh: speedKmh === null ? null : Math.round(speedKmh),
    blueFlag: Boolean(message?.BlueFlag),
    receivedAt: new Date().toISOString()
  };
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

    state.lastEventAt = new Date().toISOString();

    if (event.EventType === 200) {
      state.snapshot = event.Message;
      state.normalized = normalizeStatus(event.Message);
      broadcast(sourceKey, 'snapshot', publicState(state));
      return;
    }

    if (event.EventType === 53) {
      const position = normalizePosition(event.Message, state);
      if (position) {
        state.positions[String(position.carId)] = position;
        broadcast(sourceKey, 'position', position);
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

function publicState(state: LiveState) {
  return {
    ok: state.ok,
    sourceKey: state.sourceKey,
    sourceLabel: state.sourceLabel,
    acsmBaseUrl: state.acsmBaseUrl,
    connected: state.connected,
    lastEventAt: state.lastEventAt,
    lastError: state.lastError,
    normalized: state.normalized,
    positions: state.positions
  };
}

export function registerGcAcsmLiveTestRoutes(app: express.Express) {
  app.get('/api/gc/live-test/snapshot', async (req, res) => {
    const sourceKey = getSourceKey(req.query.server || req.query.source);
    const state = getState(sourceKey);
    try {
      await ensureSocket(sourceKey);
      res.setHeader('Cache-Control', 'no-store');
      res.json(publicState(state));
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
