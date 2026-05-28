#!/usr/bin/env node
/* GC_IDENTITY_PROFILE_CORE_V1_1_FIX_APPLY
 * Replaces Identity/Profile Core v1 with v1.1.
 * Fix: readJoinedLaps() returns mapped camelCase laps, not raw Stracker SQL rows.
 * Therefore names must read driverName/carName/trackName and nested driver/car/track first.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_IDENTITY_PROFILE_CORE_V1_START */';
const END = '/* GC_IDENTITY_PROFILE_CORE_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC IDENTITY CORE v1.1] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes(START) || !source.includes(END)) {
  console.error('[GC IDENTITY CORE v1.1] Existing Identity/Profile Core block not found. Apply v1 first or check markers.');
  process.exit(1);
}

const routeBlock = `
${START}
/* GC_IDENTITY_PROFILE_CORE_V1_1_FIX
 * Identity/Profile Core reads mapped laps returned by readJoinedLaps().
 */
function gcIdentityNumberV1(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gcIdentityTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcIdentityValueAtV1(source: any, path: string) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return String(path).split('.').reduce((acc: any, part: string) => acc == null ? undefined : acc[part], source);
}

function gcIdentityPickV1(source: any, paths: string[]) {
  for (const path of paths) {
    const value = gcIdentityValueAtV1(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function gcIdentityPlayerIdV1(row: PlainObject) {
  return gcIdentityNumberV1(gcIdentityPickV1(row, ['playerId', 'driverId', 'driver.id', 'pilot.id', 'PlayerId']), NaN);
}

function gcIdentityDriverNameV1(row: PlainObject) {
  return gcIdentityTextV1(
    gcIdentityPickV1(row, [
      'driver.displayName',
      'driver.visibleName',
      'driver.name',
      'driverName',
      'playerName',
      'pilotName',
      'Name',
      'DriverName'
    ]),
    'Piloto ' + gcIdentityTextV1(gcIdentityPickV1(row, ['playerId', 'PlayerId']), 'desconocido')
  );
}

function gcIdentityCarNameV1(row: PlainObject) {
  return gcIdentityTextV1(
    gcIdentityPickV1(row, [
      'car.displayName',
      'car.visibleName',
      'car.name',
      'carName',
      'uiCarName',
      'UiCarName'
    ]),
    gcIdentityTextV1(gcIdentityPickV1(row, ['carCode', 'car.code', 'Car']), 'Coche desconocido')
  );
}

function gcIdentityTrackNameV1(row: PlainObject) {
  return gcIdentityTextV1(
    gcIdentityPickV1(row, [
      'track.displayName',
      'track.visibleName',
      'track.name',
      'trackName',
      'uiTrackName',
      'UiTrackName'
    ]),
    gcIdentityTextV1(gcIdentityPickV1(row, ['trackCode', 'track.code', 'Track']), 'Circuito desconocido')
  );
}

function gcIdentityLapMsV1(row: PlainObject) {
  return gcIdentityNumberV1(gcIdentityPickV1(row, ['lapTimeMs', 'LapTime', 'timeMs', 'bestLapMs']), 0);
}

function gcIdentityLapFormattedV1(row: PlainObject) {
  return gcIdentityTextV1(
    gcIdentityPickV1(row, ['lapTimeFormatted', 'lapTime', 'lapTimeText', 'bestLapTime']),
    lapTimeToText(gcIdentityLapMsV1(row)) || '--'
  );
}

function gcIdentityLapValidV1(row: PlainObject) {
  const value = gcIdentityPickV1(row, ['valid', 'isValid', 'Valid']);
  return !(value === 0 || value === false || value === '0' || value === 'false' || value === 'no');
}

function gcIdentityLapDateMsV1(row: PlainObject) {
  const iso = gcIdentityPickV1(row, ['timestampIso', 'dateIso', 'createdAt', 'updatedAt', 'lastSeenAt']);
  if (iso) {
    const parsed = Date.parse(String(iso));
    if (Number.isFinite(parsed)) return parsed;
  }

  const raw = gcIdentityPickV1(row, ['timestamp', 'Timestamp', 'Date', 'date']);
  if (typeof raw === 'number') return raw > 20000000000 ? raw : raw * 1000;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function gcIdentityCompactLapV1(row: PlainObject) {
  const lapMs = gcIdentityLapMsV1(row);
  const dateMs = gcIdentityLapDateMsV1(row);
  const playerId = gcIdentityPlayerIdV1(row);

  return {
    lapId: gcIdentityPickV1(row, ['lapId', 'LapId']) ?? null,
    playerId: Number.isFinite(playerId) ? playerId : null,
    driverName: gcIdentityDriverNameV1(row),
    carName: gcIdentityCarNameV1(row),
    trackName: gcIdentityTrackNameV1(row),
    lapTimeMs: lapMs || null,
    lapTimeFormatted: gcIdentityLapFormattedV1(row),
    valid: gcIdentityLapValidV1(row),
    timestampIso: dateMs ? new Date(dateMs).toISOString() : null,
    maxSpeedKmh: gcIdentityPickV1(row, ['maxSpeedKmh', 'MaxSpeed_KMH', 'maxSpeed']) ?? null,
    cuts: gcIdentityPickV1(row, ['cuts', 'Cuts']) ?? 0,
    comboId: gcIdentityPickV1(row, ['comboId', 'ComboId']) ?? null,
    car: (row as any).car ?? null,
    track: (row as any).track ?? null,
    driver: (row as any).driver ?? null
  };
}

function gcIdentityBuildPilotStatsV1(laps: PlainObject[], playerId: number) {
  const rows = laps.filter((row) => gcIdentityPlayerIdV1(row) === playerId);
  const validRows = rows.filter(gcIdentityLapValidV1);
  const invalidRows = rows.filter((row) => !gcIdentityLapValidV1(row));
  const timedValidRows = validRows.filter((row) => gcIdentityLapMsV1(row) > 0);
  const best = [...timedValidRows].sort((a, b) => gcIdentityLapMsV1(a) - gcIdentityLapMsV1(b))[0] || null;
  const latest = [...rows].sort((a, b) => gcIdentityLapDateMsV1(b) - gcIdentityLapDateMsV1(a))[0] || null;

  const tracks = new Map<string, { name: string; laps: number; validLaps: number; bestLapMs: number | null; bestLapFormatted: string | null }>();
  const cars = new Map<string, { name: string; laps: number; validLaps: number; bestLapMs: number | null; bestLapFormatted: string | null }>();

  for (const row of rows) {
    const trackName = gcIdentityTrackNameV1(row);
    const carName = gcIdentityCarNameV1(row);
    const lapMs = gcIdentityLapMsV1(row);
    const isValid = gcIdentityLapValidV1(row);

    const track = tracks.get(trackName) || { name: trackName, laps: 0, validLaps: 0, bestLapMs: null, bestLapFormatted: null };
    track.laps += 1;
    if (isValid) track.validLaps += 1;
    if (isValid && lapMs > 0 && (!track.bestLapMs || lapMs < track.bestLapMs)) {
      track.bestLapMs = lapMs;
      track.bestLapFormatted = lapTimeToText(lapMs);
    }
    tracks.set(trackName, track);

    const car = cars.get(carName) || { name: carName, laps: 0, validLaps: 0, bestLapMs: null, bestLapFormatted: null };
    car.laps += 1;
    if (isValid) car.validLaps += 1;
    if (isValid && lapMs > 0 && (!car.bestLapMs || lapMs < car.bestLapMs)) {
      car.bestLapMs = lapMs;
      car.bestLapFormatted = lapTimeToText(lapMs);
    }
    cars.set(carName, car);
  }

  const firstSeenValues = rows.map(gcIdentityLapDateMsV1).filter((value) => Number.isFinite(value) && value > 0);
  const driverName = rows.length ? gcIdentityDriverNameV1(rows[0]) : 'Piloto ' + playerId;

  return {
    playerId,
    driverName,
    avatarUrl: '/api/pilot-avatar/' + encodeURIComponent(String(playerId)),
    socialImageUrl: '/api/pilot-social-image/' + encodeURIComponent(String(playerId)) + '.png',
    stats: {
      totalLaps: rows.length,
      validLaps: validRows.length,
      invalidLaps: invalidRows.length,
      cleanRate: rows.length ? Math.round((validRows.length / rows.length) * 100) : 0,
      tracksCount: tracks.size,
      carsCount: cars.size,
      firstSeenAt: firstSeenValues.length ? new Date(Math.min(...firstSeenValues)).toISOString() : null,
      lastSeenAt: latest ? gcIdentityCompactLapV1(latest).timestampIso : null
    },
    bestLap: best ? gcIdentityCompactLapV1(best) : null,
    latestLap: latest ? gcIdentityCompactLapV1(latest) : null,
    tracks: [...tracks.values()].sort((a, b) => b.laps - a.laps || a.name.localeCompare(b.name)).slice(0, 24),
    cars: [...cars.values()].sort((a, b) => b.laps - a.laps || a.name.localeCompare(b.name)).slice(0, 24),
    recentLaps: [...rows].sort((a, b) => gcIdentityLapDateMsV1(b) - gcIdentityLapDateMsV1(a)).slice(0, 12).map(gcIdentityCompactLapV1)
  };
}

function gcIdentityPublicLinkedUserV1(user: AppUser | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    pilotLink: user.pilotLink ? {
      playerId: user.pilotLink.playerId,
      steamGuid: user.pilotLink.steamGuid ?? null,
      strackerName: user.pilotLink.strackerName ?? null,
      linkedAt: user.pilotLink.linkedAt ?? null
    } : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null
  };
}

async function gcIdentityFindLinkedUserByPlayerIdV1(playerId: number) {
  const store = await readUserStoreAsync();
  return store.users.find((user) => Number(user.pilotLink?.playerId) === playerId) || null;
}

async function gcIdentityReadPilotProfileV1(playerId: number) {
  await readDisplayNameStoreAsync();

  const stracker = getStrackerConfig();
  if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
    return {
      ok: false,
      reason: 'stracker-unavailable',
      stracker: {
        exists: Boolean(stracker.exists),
        validSQLite: Boolean(stracker.validSQLite),
        modifiedAt: stracker.modifiedAt ?? null
      },
      linkedUser: null,
      pilot: null
    };
  }

  const laps = await readJoinedLaps(stracker.resolvedPath);
  const pilot = gcIdentityBuildPilotStatsV1(laps, playerId);
  const linkedUser = await gcIdentityFindLinkedUserByPlayerIdV1(playerId);

  return {
    ok: true,
    reason: 'ok',
    stracker: {
      exists: true,
      validSQLite: true,
      modifiedAt: stracker.modifiedAt ?? null
    },
    linkedUser: gcIdentityPublicLinkedUserV1(linkedUser),
    pilot
  };
}

app.get('/api/gc/identity/me', async (req, res) => {
  try {
    const context = await getAuthContextAsync(req);

    if (!context) {
      return res.json({
        ok: true,
        source: 'gc-identity-core',
        version: 'v1.1',
        generatedAt: new Date().toISOString(),
        authenticated: false,
        user: null,
        linkedPilot: null,
        message: 'No authenticated user.'
      });
    }

    const user = publicUser(context.user);
    const playerId = Number(user.pilotLink?.playerId);
    let linkedPilot: any = null;

    if (Number.isFinite(playerId) && playerId > 0) {
      const profile = await gcIdentityReadPilotProfileV1(playerId);
      linkedPilot = profile.ok ? profile.pilot : null;
    }

    res.json({
      ok: true,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      authenticated: true,
      user,
      linkedPilot,
      endpoints: {
        me: '/api/gc/identity/me',
        publicProfile: Number.isFinite(playerId) && playerId > 0 ? '/api/gc/pilots/' + encodeURIComponent(String(playerId)) + '/profile' : null
      },
      message: 'Identity/Profile Core separado de Race Data Core.'
    });
  } catch (error) {
    console.error('[GC Identity Core] me error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      authenticated: false,
      user: null,
      linkedPilot: null,
      message: 'No se pudo generar Identity/Profile Core me.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/gc/pilots/:playerId/profile', async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({
        ok: false,
        source: 'gc-identity-core',
        version: 'v1.1',
        generatedAt: new Date().toISOString(),
        message: 'Invalid playerId.'
      });
    }

    const profile = await gcIdentityReadPilotProfileV1(playerId);

    res.json({
      ok: profile.ok,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      domain: 'identity-profile',
      playerId,
      linkedUser: profile.linkedUser ?? null,
      pilot: profile.pilot,
      stracker: profile.stracker,
      separatedFromRaceDataCore: true,
      message: profile.ok
        ? 'Perfil público de piloto generado desde Identity/Profile Core.'
        : 'No se pudo generar perfil de piloto porque Stracker no está disponible.'
    });
  } catch (error) {
    console.error('[GC Identity Core] public pilot profile error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      domain: 'identity-profile',
      pilot: null,
      message: 'No se pudo generar el perfil público de piloto.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/gc/identity/status', async (_req, res) => {
  try {
    const store = await readUserStoreAsync();
    const linked = store.users.filter((user) => Boolean(user.pilotLink));
    const activeSessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());

    res.json({
      ok: true,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      domain: 'identity-profile',
      users: {
        total: store.users.length,
        linked: linked.length,
        unlinked: store.users.length - linked.length,
        admins: store.users.filter((user) => user.role === 'admin').length,
        activeSessions: activeSessions.length
      },
      endpoints: {
        me: '/api/gc/identity/me',
        pilotProfile: '/api/gc/pilots/:playerId/profile'
      },
      message: 'Estado seguro de Identity/Profile Core.'
    });
  } catch (error) {
    console.error('[GC Identity Core] status error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-identity-core',
      version: 'v1.1',
      generatedAt: new Date().toISOString(),
      domain: 'identity-profile',
      message: 'No se pudo leer Identity/Profile Core status.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${END}
`;

const startIndex = source.indexOf(START);
const endIndex = source.indexOf(END);
if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  console.error('[GC IDENTITY CORE v1.1] Invalid markers.');
  process.exit(1);
}

source = source.slice(0, startIndex) + routeBlock.trimEnd() + '\n' + source.slice(endIndex + END.length);

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC IDENTITY CORE v1.1] Fixed Identity/Profile Core mapped lap names.');
console.log('[GC IDENTITY CORE v1.1] Run: npm run build');
