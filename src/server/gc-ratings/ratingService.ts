import { identifyRaceSession, matchOfficialToStracker, officialDriverName } from './acsmMatcher';
import { applyGsrUpdates, initialGsrState } from './gsrModel';
import { createRatingStore } from './ratingStore';
import { buildSrComputation } from './srModel';
import { findRaceSessions, findRatingCandidateRaceSessions, openStrackerDb, readRaceDrivers, readRaceLaps, readRaceSession, resolveStrackerDbPath, verifyStrackerTables } from './strackerReader';
import { getStrackerMirrorDriver, getStrackerSessionDetailFromMirror } from './strackerSqlMirror';
import type { DriverRatingState, PlainObject, RatingEventResult, RatingsSnapshot, RecalculationLog, RatingStrackerSessionReview } from './types';
import { cleanDisplayText, displayCarName, displayDriverName, displayTrackName, driverKeyFromParts, ensureArray, formatLapMs, isoNow, parseDateMs, ratingClassFromGsr, ratingClassFromSr, roundTo, safeFiniteNumber, textValue, uniqueId } from './utils';

function normalizeOrigin(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function parseBooleanish(value: unknown, fallback: boolean | undefined = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    return fallback;
  }
  return fallback;
}

function acsmUrlCandidates() {
  const explicit = [
    process.env.GC_CHAMPIONSHIP_SOURCE_URL,
    process.env.ACSR_CHAMPIONSHIP_LOCAL_URL
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = [
    process.env.GC_INTERNAL_BASE_URL,
    process.env.INTERNAL_BASE_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.SITE_URL,
    process.env.ASTRO_SITE,
    process.env.ORIGIN,
    'https://grasscuttersracing.com'
  ]
    .map((value) => normalizeOrigin(String(value || '')))
    .filter(Boolean)
    .map((origin) => `${origin}/api/community/acsr-championship?refresh=1`);

  const port = process.env.PORT || 3000;
  const local = [
    `http://127.0.0.1:${port}/api/community/acsr-championship?refresh=1`,
    `http://localhost:${port}/api/community/acsr-championship?refresh=1`
  ];

  return [...new Set([...explicit, ...origins, ...local])];
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'GrassCutters ratings backend' },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!payload?.ok || !payload?.championship) {
      throw new Error(payload?.message || 'Payload ACSM invalido.');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchChampionship() {
  const errors: string[] = [];
  for (const url of acsmUrlCandidates()) {
    try {
      return await fetchJsonWithTimeout(url);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No se pudo leer ACSM desde backend. ${errors.join(' | ')}`);
}

function completedEvents(championship: PlainObject) {
  const events = Array.isArray(championship.events) ? championship.events : [];
  return [...events]
    .filter((event) => String(event?.status || '').toLowerCase() === 'completed' && Array.isArray(event.raceResults) && event.raceResults.length)
    .sort((left, right) => {
      const leftMs = parseDateMs(left.completedAt || left.scheduledAt);
      const rightMs = parseDateMs(right.completedAt || right.scheduledAt);
      return leftMs - rightMs;
    });
}

function createEmptySnapshot(championship?: PlainObject | null, storage: 'json' | 'mysql' = 'json'): RatingsSnapshot {
  return {
    version: 1,
    championshipId: textValue(championship?.id, 'acsr'),
    championshipName: textValue(championship?.name, 'GrassCutters Ratings'),
    source: 'gc-ratings-v1',
    storage,
    strackerDbPath: null,
    generatedAt: isoNow(),
    processedEventIds: [],
    drivers: [],
    eventResults: [],
    recalculationLogs: [],
    ignoredStrackerSessions: [],
    reviewedStrackerSessions: []
  };
}

function stateFromRow(row: Partial<DriverRatingState> & { driverKey: string; displayName: string; steamGuid?: string | null; strackerPlayerId?: number | null; }) {
  const initial = initialGsrState();
  const now = isoNow();
  return {
    driverKey: row.driverKey,
    steamGuid: row.steamGuid ?? null,
    strackerPlayerId: row.strackerPlayerId ?? null,
    displayName: row.displayName,
    srScore: 80,
    srClass: 'B',
    gsrMu: initial.mu,
    gsrSigma: initial.sigma,
    gsrRating: initial.rating,
    gsrClass: initial.className,
    racesCount: 0,
    cleanRaces: 0,
    wins: 0,
    podiums: 0,
    incidentPointsTotal: 0,
    lastDeltaSr: 0,
    lastDeltaGsr: 0,
    lastEventId: null,
    lastRaceAt: null,
    createdAt: now,
    updatedAt: now
  } satisfies DriverRatingState;
}

function buildLeaderboard(drivers: DriverRatingState[]) {
  const sr = [...drivers]
    .filter((driver) => Number.isFinite(Number(driver.srScore)) && Number(driver.racesCount) > 0)
    .sort((left, right) => right.srScore - left.srScore || left.incidentPointsTotal - right.incidentPointsTotal || left.displayName.localeCompare(right.displayName))
    .map((driver, index) => ({
      position: index + 1,
      driverKey: driver.driverKey,
      driver: driver.displayName,
      sr: driver.srScore,
      srClass: driver.srClass,
      races: driver.racesCount,
      cleanRaces: driver.cleanRaces,
      incidentsPerRace: driver.racesCount ? roundTo(driver.incidentPointsTotal / driver.racesCount) : 0,
      lastDelta: driver.lastDeltaSr
    }));

  const gsr = [...drivers]
    .filter((driver) => Number.isFinite(Number(driver.gsrRating)) && Number(driver.racesCount) > 0)
    .sort((left, right) => right.gsrRating - left.gsrRating || right.wins - left.wins || left.displayName.localeCompare(right.displayName))
    .map((driver, index) => ({
      position: index + 1,
      driverKey: driver.driverKey,
      driver: driver.displayName,
      gsr: driver.gsrRating,
      gsrClass: driver.gsrClass,
      mu: roundTo(driver.gsrMu, 2),
      sigma: roundTo(driver.gsrSigma, 2),
      races: driver.racesCount,
      wins: driver.wins,
      podiums: driver.podiums,
      lastDelta: driver.lastDeltaGsr
    }));

  return { sr, gsr };
}

function nextEventFallbackIso(event: PlainObject) {
  const scheduledAt = textValue(event?.scheduledAt);
  if (scheduledAt) return scheduledAt;
  const rawDate = textValue(event?.date || event?.scheduledDate || event?.rawDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return `${rawDate}T22:00:00+02:00`;
  return '';
}

function raceSessionFromEvent(event: PlainObject) {
  return ensureArray(event.sessions).find((session: PlainObject) =>
    String(session?.type || session?.key || session?.name || '').toUpperCase().includes('RACE')
  ) || null;
}

function sameDriverLap(lap: PlainObject, result: PlainObject) {
  const lapGuid = textValue(lap.driverGuid || lap.guid);
  const resultGuid = textValue(result.guid || result.steamGuid);
  if (lapGuid && resultGuid && lapGuid === resultGuid) return true;

  const lapName = textValue(lap.driverName || lap.name).toLowerCase();
  const resultName = textValue(result.name || result.driverName).toLowerCase();
  return Boolean(lapName && resultName && lapName === resultName);
}

function buildAcsmRaceLapsForDriver(event: PlainObject, result: PlainObject) {
  const race = raceSessionFromEvent(event);
  const rawLaps = ensureArray(race?.laps).filter((lap: PlainObject) => sameDriverLap(lap, result));

  return rawLaps.map((lap: PlainObject, index: number) => ({
    lapNumber: index + 1,
    lapTimeMs: safeFiniteNumber(lap.lapTimeMs || lap.timeMs, 0),
    valid: safeFiniteNumber(lap.cuts, 0) <= 0,
    cuts: safeFiniteNumber(lap.cuts, 0),
    collisionsCar: safeFiniteNumber(lap.collisionsCar || lap.carContacts || lap.contactsCar, 0),
    collisionsEnv: safeFiniteNumber(lap.collisionsEnv || lap.envContacts || lap.contactsEnv, 0),
    notes: ['Fuente ACSM']
  }));
}

function acsmFallbackMatch(event: PlainObject, result: PlainObject) {
  const laps = buildAcsmRaceLapsForDriver(event, result);
  return {
    confidence: laps.length ? 0.55 : 0.35,
    method: laps.length ? 'acsm-session-laps-fallback' : 'acsm-official-result-fallback',
    bestLapDiffMs: null,
    lapDiff: laps.length ? Math.abs(laps.length - safeFiniteNumber(result.numLaps, 0)) : null,
    strackerPlayerInSessionId: null,
    strackerSessionId: null
  };
}


function unixSecondsToIso(value: unknown) {
  const seconds = safeFiniteNumber(value, 0);
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function strackerManualEventId(sessionId: number) {
  return `stracker:${sessionId}`;
}

function normalizeIgnoredStrackerSessions(snapshot: RatingsSnapshot | null | undefined) {
  return ensureArray(snapshot?.ignoredStrackerSessions)
    .map((item: PlainObject) => {
      const sessionId = safeFiniteNumber(item.sessionId, 0) || safeFiniteNumber(String(item.eventId || '').replace('stracker:', ''), 0);
      if (!sessionId) return null;
      const now = isoNow();
      return {
        eventId: textValue(item.eventId, strackerManualEventId(sessionId)),
        sessionId,
        status: 'ignored' as const,
        reason: textValue(item.reason) || null,
        createdAt: textValue(item.createdAt, now),
        updatedAt: textValue(item.updatedAt, textValue(item.createdAt, now))
      } satisfies RatingStrackerSessionReview;
    })
    .filter(Boolean) as RatingStrackerSessionReview[];
}

function normalizeReviewedStrackerSessions(snapshot: RatingsSnapshot | null | undefined) {
  return ensureArray(snapshot?.reviewedStrackerSessions)
    .map((item: PlainObject) => {
      const sessionId = safeFiniteNumber(item.sessionId, 0) || safeFiniteNumber(String(item.eventId || '').replace('stracker:', ''), 0);
      if (!sessionId) return null;
      const now = isoNow();
      return {
        eventId: textValue(item.eventId, strackerManualEventId(sessionId)),
        sessionId,
        status: 'reviewed-unrated' as const,
        ratingEligible: false,
        reason: textValue(item.reason) || null,
        name: cleanDisplayText(item.name) || null,
        track: displayTrackName(item.track || item.trackRaw, '') || null,
        trackRaw: cleanDisplayText(item.trackRaw || item.track) || null,
        comboId: safeFiniteNumber(item.comboId, 0) || null,
        startTime: textValue(item.startTime) || null,
        endTime: textValue(item.endTime) || null,
        playerCount: safeFiniteNumber(item.playerCount, 0) || null,
        lapCount: safeFiniteNumber(item.lapCount, 0) || null,
        maxLapCount: safeFiniteNumber(item.maxLapCount, 0) || null,
        bestLapMs: safeFiniteNumber(item.bestLapMs, 0) || null,
        bestLap: textValue(item.bestLap) || null,
        cuts: safeFiniteNumber(item.cuts, 0) || null,
        collisionsCar: safeFiniteNumber(item.collisionsCar, 0) || null,
        collisionsEnv: safeFiniteNumber(item.collisionsEnv, 0) || null,
        createdAt: textValue(item.createdAt, now),
        updatedAt: textValue(item.updatedAt, textValue(item.createdAt, now))
      };
    })
    .filter(Boolean) as RatingStrackerSessionReview[];
}

function isIgnoredStrackerSession(snapshot: RatingsSnapshot | null | undefined, sessionId: number) {
  return normalizeIgnoredStrackerSessions(snapshot).some((item) => item.sessionId === sessionId);
}

function isReviewedStrackerSession(snapshot: RatingsSnapshot | null | undefined, sessionId: number) {
  return normalizeReviewedStrackerSessions(snapshot).some((item) => item.sessionId === sessionId);
}

function strackerRacePosition(driver: PlainObject, index: number, maxLaps: number) {
  const finished = safeFiniteNumber(driver.RaceFinished, 0) > 0;
  const finishPosition = safeFiniteNumber(driver.FinishPositionOrig || driver.FinishPosition, 0);
  if (finished && finishPosition > 0 && finishPosition < 1000) return finishPosition;
  return index + 1;
}

function sortStrackerDriversForRace(drivers: PlainObject[]) {
  return [...drivers].sort((left, right) => {
    const leftFinished = safeFiniteNumber(left.RaceFinished, 0) > 0;
    const rightFinished = safeFiniteNumber(right.RaceFinished, 0) > 0;
    const leftFinishPosition = safeFiniteNumber(left.FinishPositionOrig || left.FinishPosition, 1000);
    const rightFinishPosition = safeFiniteNumber(right.FinishPositionOrig || right.FinishPosition, 1000);

    if (leftFinished && rightFinished && leftFinishPosition !== rightFinishPosition) {
      return leftFinishPosition - rightFinishPosition;
    }

    const lapDiff = safeFiniteNumber(right.MaxLapCount || right.LapRows, 0) - safeFiniteNumber(left.MaxLapCount || left.LapRows, 0);
    if (lapDiff) return lapDiff;

    const timeDiff = safeFiniteNumber(left.RaceTimeMs, 0) - safeFiniteNumber(right.RaceTimeMs, 0);
    if (timeDiff) return timeDiff;

    return safeFiniteNumber(left.BestLapMs, 0) - safeFiniteNumber(right.BestLapMs, 0);
  });
}

function buildManualStrackerEvent(session: PlainObject, drivers: PlainObject[], options: PlainObject = {}) {
  const sessionId = safeFiniteNumber(session.SessionId, 0);
  const rawTrack = cleanDisplayText(session.Track || session.UiTrackName, 'Circuito');
  const track = displayTrackName(session.UiTrackName || session.Track, 'Circuito');
  const maxLaps = Math.max(...drivers.map((driver) => safeFiniteNumber(driver.MaxLapCount || driver.LapRows, 0)), 0);
  const sorted = sortStrackerDriversForRace(drivers);
  const startIso = unixSecondsToIso(session.StartTimeDate) || isoNow();
  const endIso = unixSecondsToIso(session.EndTimeDate) || unixSecondsToIso(session.LastLapUnix) || startIso;

  const eventId = textValue(options.eventId, strackerManualEventId(sessionId));
  const eventName = textValue(
    options.name,
    `Carrera sTracker #${sessionId} · ${track}`
  );

  return {
    id: eventId,
    source: 'stracker-manual',
    status: 'completed',
    name: eventName,
    index: safeFiniteNumber(options.index, 0),
    scheduledAt: startIso,
    completedAt: endIso,
    startedAt: startIso,
    track,
    trackRaw: rawTrack,
    car: displayCarName(sorted[0]?.UiCarName || sorted[0]?.CarFolder, ''),
    strackerSessionId: sessionId,
    manualStrackerSessionId: sessionId,
    raceResults: sorted.map((driver, index) => {
      const laps = safeFiniteNumber(driver.MaxLapCount || driver.LapRows, 0);
      const position = strackerRacePosition(driver, index, maxLaps);
      return {
        position,
        name: displayDriverName(driver.StrackerName, `Piloto ${index + 1}`),
        guid: textValue(driver.StrackerGuid),
        playerId: safeFiniteNumber(driver.PlayerId, 0) || null,
        model: displayCarName(driver.UiCarName || driver.CarFolder, 'Coche'),
        carModel: displayCarName(driver.CarFolder || driver.UiCarName, 'Coche'),
        numLaps: laps,
        bestLapMs: safeFiniteNumber(driver.BestLapMs, 0),
        bestLap: formatLapMs(driver.BestLapMs),
        totalTimeMs: safeFiniteNumber(driver.RaceTimeMs, 0),
        status: maxLaps >= 3 && laps <= maxLaps - 2 ? 'DNF' : 'FINISHED',
        points: 0,
        source: 'stracker.db3',
        strackerPlayerId: safeFiniteNumber(driver.PlayerId, 0) || null,
        strackerPlayerInSessionId: safeFiniteNumber(driver.PlayerInSessionId, 0) || null
      };
    })
  };
}


function enrichRowsWithCurrentRatings(rows: PlainObject[], snapshot: RatingsSnapshot) {
  const byDriverKey = new Map(snapshot.drivers.map((driver) => [driver.driverKey, driver]));
  const bySteam = new Map(snapshot.drivers.filter((driver) => driver.steamGuid).map((driver) => [String(driver.steamGuid), driver]));
  const byPlayerId = new Map(snapshot.drivers.filter((driver) => driver.strackerPlayerId).map((driver) => [Number(driver.strackerPlayerId), driver]));
  const byName = new Map(snapshot.drivers.map((driver) => [driverKeyFromParts({ name: driver.displayName }).replace('name:', ''), driver]));

  return ensureArray(rows).map((row: PlainObject) => {
    const playerId = safeFiniteNumber(row.strackerPlayerId ?? row.playerId, 0) || null;
    const steamGuid = textValue(row.steamGuid ?? row.guid);
    const driverKey = driverKeyFromParts({
      strackerPlayerId: playerId,
      steamGuid,
      name: textValue(row.displayName ?? row.name)
    });
    const nameKey = driverKeyFromParts({ name: textValue(row.displayName ?? row.name) }).replace('name:', '');
    const current = byDriverKey.get(driverKey)
      || (steamGuid ? bySteam.get(steamGuid) : null)
      || (playerId ? byPlayerId.get(playerId) : null)
      || byName.get(nameKey)
      || null;

    if (!current) return row;

    return {
      ...row,
      driverKey: current.driverKey,
      steamGuid: current.steamGuid ?? row.steamGuid ?? row.guid ?? null,
      strackerPlayerId: current.strackerPlayerId ?? row.strackerPlayerId ?? row.playerId ?? null,
      srScore: current.srScore,
      srClass: current.srClass,
      srDelta: 0,
      deltaSr: 0,
      gsrRating: current.gsrRating,
      gsrClass: current.gsrClass,
      gsrDelta: 0,
      deltaGsr: 0,
      safetyRating: {
        ...(row.safetyRating || {}),
        score: current.srScore,
        class: current.srClass,
        delta: 0,
        source: row.safetyRating?.source || 'current-rating'
      }
    };
  });
}

function manualEventsFromSnapshot(snapshot: RatingsSnapshot, existingEvents: PlainObject[]) {
  const existingIds = new Set(existingEvents.map((event) => String(event.id)));
  const grouped = new Map<string, RatingEventResult[]>();

  snapshot.eventResults.forEach((result) => {
    if (!String(result.eventId).startsWith('stracker:')) return;
    if (existingIds.has(String(result.eventId))) return;
    const bucket = grouped.get(result.eventId) || [];
    bucket.push(result);
    grouped.set(result.eventId, bucket);
  });

  return Array.from(grouped.entries()).map(([eventId, rows], index) => {
    const sorted = [...rows].sort((left, right) => left.position - right.position);
    const first = sorted[0];
    const sessionId = (first?.strackerSessionId ?? Number(String(eventId).replace('stracker:', ''))) || null;
    return {
      id: eventId,
      source: 'stracker-manual',
      status: 'completed',
      name: cleanDisplayText(first?.eventName || `Carrera sTracker ${sessionId || ''}`.trim()),
      index: existingEvents.length + index + 1,
      scheduledAt: first?.eventDate || first?.processedAt || null,
      completedAt: first?.eventDate || first?.processedAt || null,
      startedAt: first?.eventDate || first?.processedAt || null,
      track: displayTrackName(first?.eventName?.split('·').pop()?.trim(), 'sTracker'),
      trackRaw: cleanDisplayText(first?.eventName?.split('·').pop()?.trim(), 'sTracker'),
      strackerSessionId: sessionId,
      manualStrackerSessionId: sessionId,
      raceResults: []
    };
  });
}

function reviewedEventsFromSnapshot(snapshot: RatingsSnapshot, existingEvents: PlainObject[]) {
  const existingIds = new Set(existingEvents.map((event) => String(event.id)));
  return normalizeReviewedStrackerSessions(snapshot)
    .filter((review) => !existingIds.has(String(review.eventId)))
    .map((review, index) => ({
      id: review.eventId,
      source: 'stracker-reviewed',
      status: 'reviewed',
      name: cleanDisplayText(review.name || `Carrera de comunidad ${review.sessionId}`),
      index: existingEvents.length + index + 1,
      scheduledAt: review.startTime || review.endTime || review.updatedAt || null,
      completedAt: review.endTime || review.startTime || review.updatedAt || null,
      startedAt: review.startTime || review.updatedAt || null,
      track: displayTrackName(review.track || review.trackRaw, 'Carrera no oficial'),
      trackRaw: cleanDisplayText(review.trackRaw || review.track, 'Carrera no oficial'),
      strackerSessionId: review.sessionId,
      manualStrackerSessionId: review.sessionId,
      playerCount: review.playerCount || 0,
      lapCount: review.lapCount || 0,
      maxLapCount: review.maxLapCount || 0,
      bestLapMs: review.bestLapMs || 0,
      bestLap: review.bestLap || formatLapMs(review.bestLapMs),
      cuts: review.cuts || 0,
      collisionsCar: review.collisionsCar || 0,
      collisionsEnv: review.collisionsEnv || 0,
      comboId: review.comboId || null,
      ratingEligible: false,
      reviewStatus: 'reviewed-unrated',
      reviewReason: review.reason || null,
      raceResults: []
    }));
}

function buildStrackerEventFromRatingResults(eventId: string, snapshot: RatingsSnapshot) {
  const rows = snapshot.eventResults
    .filter((row) => String(row.eventId) === String(eventId))
    .sort((left, right) => left.position - right.position);

  if (!rows.length) return null;

  const first = rows[0];
  const sessionId = safeFiniteNumber(first?.strackerSessionId, 0) || safeFiniteNumber(String(eventId).replace('stracker:', ''), 0) || null;
  const trackFromEvent = displayTrackName(textValue(first?.eventName || '').split('·').pop()?.trim(), 'Circuito');
  const raceResults = rows.map((result) => {
    const lapDetails = ensureArray(result.lapsDetail);
    const incidents = ensureArray(result.incidents);
    return {
      position: result.position,
      name: displayDriverName(result.displayName, 'Piloto'),
      guid: result.steamGuid,
      playerId: result.strackerPlayerId ?? null,
      model: displayCarName(result.car, 'Coche'),
      carModel: displayCarName(result.car, 'Coche'),
      car: displayCarName(result.car, 'Coche'),
      numLaps: result.laps,
      bestLapMs: result.bestLapMs,
      bestLap: formatLapMs(result.bestLapMs),
      totalTimeMs: null,
      totalTime: '--',
      points: result.points,
      srScore: result.newSr,
      srClass: ratingClassFromSr(result.newSr),
      srDelta: result.deltaSr,
      deltaSr: result.deltaSr,
      gsrRating: result.newGsr,
      gsrClass: ratingClassFromGsr(result.newGsr),
      gsrDelta: result.deltaGsr,
      deltaGsr: result.deltaGsr,
      cleanRace: result.cleanRace,
      incidentPoints: result.incidentPoints,
      incidents,
      lapsDetail: lapDetails,
      match: result.match,
      gsrExplanation: result.notes?.[0] || '',
      safetyRating: {
        score: result.newSr,
        class: ratingClassFromSr(result.newSr),
        delta: result.deltaSr,
        eventScore: result.newSr,
        severity: result.incidentPoints,
        offTracks: lapDetails.reduce((sum, lap) => sum + Number(lap.cuts || 0), 0),
        collisionsCar: lapDetails.reduce((sum, lap) => sum + Number(lap.collisionsCar || 0), 0),
        collisionsEnv: lapDetails.reduce((sum, lap) => sum + Number(lap.collisionsEnv || 0), 0),
        source: result.match?.method?.includes('acsm') ? 'acsm' : 'stracker.db3',
        model: 'stracker-db3',
        penalties: {
          summary: incidents.length
            ? incidents.map((incident) => incident.description || incident.type || 'Incidente STRacker')
            : []
        },
        incidents,
        laps: lapDetails.map((lap) => ({
          lap: lap.lapNumber,
          lapTime: formatLapMs(lap.lapTimeMs),
          valid: lap.valid,
          offTracks: lap.cuts,
          cuts: lap.cuts,
          collisionsCar: lap.collisionsCar,
          collisionsEnv: lap.collisionsEnv,
          srDelta: lap.srDelta,
          notes: textValue(lap.notes).split(' · ').filter(Boolean)
        }))
      }
    };
  });

  const topRow = raceResults[0] || null;
  const fastest = [...raceResults]
    .filter((row) => safeFiniteNumber(row.bestLapMs, 0) > 0)
    .sort((left, right) => safeFiniteNumber(left.bestLapMs, 0) - safeFiniteNumber(right.bestLapMs, 0))[0] || null;

  const trackSource = trackFromEvent || 'Circuito';
  const scheduledAt = first.eventDate || first.processedAt || null;

  return {
    id: eventId,
    source: 'stracker-manual',
    status: 'completed',
    name: cleanDisplayText(`Carrera sTracker #${sessionId || ''} · ${trackSource}`.trim(), `Carrera sTracker #${sessionId || ''}`),
    scheduledAt,
    completedAt: first.eventDate || first.processedAt || null,
    startedAt: first.eventDate || first.processedAt || null,
    track: displayTrackName(trackSource, 'Circuito'),
    trackRaw: cleanDisplayText(trackSource, 'Circuito'),
    carSummary: topRow?.model || topRow?.carModel || null,
    strackerSessionId: sessionId,
    manualStrackerSessionId: sessionId,
    playerCount: raceResults.length,
    lapCount: Math.max(...raceResults.map((row) => safeFiniteNumber(row.numLaps, 0)), 0),
    maxLapCount: Math.max(...raceResults.map((row) => safeFiniteNumber(row.numLaps, 0)), 0),
    bestLapMs: fastest ? safeFiniteNumber(fastest.bestLapMs, 0) : 0,
    bestLap: fastest ? fastest.bestLap : '--',
    cuts: raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.offTracks, 0), 0),
    collisionsCar: raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.collisionsCar, 0), 0),
    collisionsEnv: raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.collisionsEnv, 0), 0),
    ratingEligible: true,
    reviewStatus: null,
    qualifyingResults: [],
    raceResults,
    sessions: [
      {
        type: 'RACE',
        key: 'RACE',
        track: sessionTrack,
        resultCount: raceResults.length,
        lapCount: Math.max(...raceResults.map((row) => safeFiniteNumber(row.numLaps, 0)), 0),
        fastestLap: fastest ? {
          lapTime: fastest.bestLap,
          driverName: fastest.name,
          carModel: fastest.model
        } : null
      }
    ],
    winner: topRow || null,
    fastestLap: fastest ? {
      lapTime: fastest.bestLap,
      driverName: fastest.name,
      carModel: fastest.model
    } : null
  };
}

function buildStrackerMirrorEventFromDetail(detail: PlainObject, snapshot: RatingsSnapshot, options: PlainObject = {}) {
  const session = detail.session || {};
  const sessionId = safeFiniteNumber(session.sessionId, 0);
  const review = normalizeReviewedStrackerSessions(snapshot).find((item) => item.sessionId === sessionId) || null;
  const eventId = textValue(options.eventId, strackerManualEventId(sessionId));
  const mirrorDriver = textValue(options.mirrorDriver, getStrackerMirrorDriver());
  const driverRows = ensureArray(detail.drivers)
    .slice()
    .sort((left, right) => {
      const leftPosition = safeFiniteNumber(left.position, 0);
      const rightPosition = safeFiniteNumber(right.position, 0);
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      const leftBest = safeFiniteNumber(left.bestLapMs, 0);
      const rightBest = safeFiniteNumber(right.bestLapMs, 0);
      if (leftBest !== rightBest) return leftBest - rightBest;
      return safeFiniteNumber(left.playerInSessionId, 0) - safeFiniteNumber(right.playerInSessionId, 0);
    });
  const lapRows = ensureArray(detail.laps);
  const incidentRows = ensureArray(detail.incidents);

  const rawRows = driverRows.map((driver, index) => {
    const playerId = safeFiniteNumber(driver.playerId, 0) || null;
    const playerInSessionId = safeFiniteNumber(driver.playerInSessionId, 0) || null;
    const driverLaps = lapRows.filter((lap) => {
      const lapPlayerId = safeFiniteNumber(lap.playerId, 0) || null;
      const lapPlayerInSessionId = safeFiniteNumber(lap.playerInSessionId, 0) || null;
      return (playerInSessionId && lapPlayerInSessionId === playerInSessionId) || (playerId && lapPlayerId === playerId);
    });
    const driverIncidents = incidentRows.filter((incident) => {
      const incidentPlayerId = safeFiniteNumber(incident.playerId, 0) || null;
      return Boolean(playerId && incidentPlayerId === playerId);
    });
    const totalCuts = driverLaps.reduce((sum, lap) => sum + safeFiniteNumber(lap.cuts, 0), 0);
    const totalCollisionsCar = driverLaps.reduce((sum, lap) => sum + safeFiniteNumber(lap.collisionsCar, 0), 0);
    const totalCollisionsEnv = driverLaps.reduce((sum, lap) => sum + safeFiniteNumber(lap.collisionsEnv, 0), 0);
    const lapDetails = driverLaps.map((lap) => {
      const lapIncidents = driverIncidents.filter((incident) => safeFiniteNumber(incident.lapNumber, 0) === safeFiniteNumber(lap.lapNumber, 0));
      return {
        lapNumber: safeFiniteNumber(lap.lapNumber, 0),
        lapTimeMs: safeFiniteNumber(lap.lapTimeMs, 0),
        valid: Boolean(lap.valid),
        cuts: safeFiniteNumber(lap.cuts, 0),
        collisionsCar: safeFiniteNumber(lap.collisionsCar, 0),
        collisionsEnv: safeFiniteNumber(lap.collisionsEnv, 0),
        srDelta: 0,
        notes: lapIncidents.length
          ? lapIncidents.map((incident) => incident.type || 'Incidente STRacker')
          : []
      };
    });
    const bestLapMs = safeFiniteNumber(driver.bestLapMs, 0);
    const totalTimeMs = safeFiniteNumber(driver.raceTimeMs, 0);
    return {
      position: safeFiniteNumber(driver.position, 0) || index + 1,
      name: displayDriverName(driver.driverName, `Piloto ${index + 1}`),
      guid: textValue(driver.steamGuid),
      playerId,
      model: displayCarName(driver.carDisplay || driver.carRaw, 'Coche'),
      carModel: displayCarName(driver.carRaw || driver.carDisplay, 'Coche'),
      car: displayCarName(driver.carDisplay || driver.carRaw, 'Coche'),
      numLaps: safeFiniteNumber(driver.laps, 0),
      bestLapMs,
      bestLap: formatLapMs(bestLapMs),
      totalTimeMs,
      totalTime: formatLapMs(totalTimeMs),
      points: 0,
      srScore: null,
      srClass: null,
      srDelta: 0,
      deltaSr: 0,
      gsrRating: null,
      gsrClass: null,
      gsrDelta: 0,
      deltaGsr: 0,
      cleanRace: driverIncidents.length === 0,
      incidentPoints: 0,
      incidents: driverIncidents.map((incident) => ({
        ...incident,
        description: incident.type || 'Incidente STRacker'
      })),
      lapsDetail: lapDetails,
      match: { method: 'sql-mirror' },
      gsrExplanation: review?.reason || '',
      source: 'sql-mirror',
      mirrorDriver,
      strackerPlayerId: playerId,
      strackerPlayerInSessionId: playerInSessionId,
      safetyRating: {
        score: null,
        class: null,
        delta: 0,
        eventScore: 0,
        severity: driverIncidents.length,
        offTracks: totalCuts,
        collisionsCar: totalCollisionsCar,
        collisionsEnv: totalCollisionsEnv,
        source: 'sql-mirror',
        model: 'stracker-sql-mirror',
        penalties: {
          summary: driverIncidents.length
            ? driverIncidents.map((incident) => {
              const parts = [incident.type || 'Incidente STRacker'];
              if (incident.lapNumber !== null && incident.lapNumber !== undefined) parts.push(`vuelta ${incident.lapNumber}`);
              return parts.join(' · ');
            })
            : []
        },
        incidents: driverIncidents,
        laps: lapDetails.map((lap) => ({
          lap: lap.lapNumber,
          lapTime: formatLapMs(lap.lapTimeMs),
          valid: lap.valid,
          offTracks: lap.cuts,
          cuts: lap.cuts,
          collisionsCar: lap.collisionsCar,
          collisionsEnv: lap.collisionsEnv,
          srDelta: lap.srDelta,
          notes: lap.notes
        }))
      }
    };
  });

  const enrichedRows = enrichRowsWithCurrentRatings(rawRows, snapshot);
  const raceResults = enrichedRows.map((row) => ({
    ...row,
    totalTime: row.totalTime || formatLapMs(row.totalTimeMs || 0) || '--',
    totalTimeMs: row.totalTimeMs ?? null,
    points: 0,
    srDelta: 0,
    deltaSr: 0,
    gsrDelta: 0,
    deltaGsr: 0,
    incidents: ensureArray(row.incidents),
    lapsDetail: ensureArray(row.lapsDetail),
    safetyRating: {
      ...(row.safetyRating || {}),
      score: row.safetyRating?.score ?? row.srScore ?? null,
      class: row.safetyRating?.class ?? row.srClass ?? null,
      delta: 0,
      eventScore: 0,
      severity: row.safetyRating?.severity ?? ensureArray(row.incidents).length,
      source: row.safetyRating?.source || 'sql-mirror',
      model: row.safetyRating?.model || 'stracker-sql-mirror'
    }
  }));

  const topRow = raceResults[0] || null;
  const fastest = [...raceResults]
    .filter((row) => safeFiniteNumber(row.bestLapMs, 0) > 0)
    .sort((left, right) => safeFiniteNumber(left.bestLapMs, 0) - safeFiniteNumber(right.bestLapMs, 0))[0] || null;
  const sessionTrack = displayTrackName(session.track || session.trackRaw || review?.track || review?.trackRaw, 'Circuito');
  const sessionName = cleanDisplayText(`Carrera sTracker #${sessionId || ''} · ${sessionTrack}`.trim(), `Carrera no oficial ${sessionId}`);
  const sessionStart = session.startTime || review?.startTime || null;
  const sessionEnd = session.endTime || review?.endTime || null;
  const lapCount = safeFiniteNumber(session.lapCount, 0) || Math.max(...raceResults.map((row) => safeFiniteNumber(row.numLaps, 0)), 0);
  const maxLapCount = safeFiniteNumber(session.maxLapCount, 0) || lapCount;
  const bestLapMs = safeFiniteNumber(session.bestLapMs, 0) || safeFiniteNumber(fastest?.bestLapMs, 0);

  return {
    id: eventId,
    source: 'stracker-reviewed',
    status: 'reviewed',
    name: sessionName,
    scheduledAt: sessionStart || sessionEnd || review?.updatedAt || null,
    completedAt: sessionEnd || sessionStart || review?.updatedAt || null,
    startedAt: sessionStart || review?.updatedAt || null,
    track: sessionTrack,
    trackRaw: cleanDisplayText(review?.trackRaw || session.trackRaw || sessionTrack, 'Circuito'),
    comboId: safeFiniteNumber(session.comboId, 0) || review?.comboId || null,
    carSummary: topRow?.model || topRow?.carModel || null,
    strackerSessionId: sessionId,
    manualStrackerSessionId: sessionId,
    playerCount: safeFiniteNumber(session.playerCount, 0) || raceResults.length,
    lapCount,
    maxLapCount,
    bestLapMs,
    bestLap: formatLapMs(bestLapMs),
    cuts: safeFiniteNumber(session.cuts, 0) || raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.offTracks, 0), 0),
    collisionsCar: safeFiniteNumber(session.collisionsCar, 0) || raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.collisionsCar, 0), 0),
    collisionsEnv: safeFiniteNumber(session.collisionsEnv, 0) || raceResults.reduce((sum, row) => sum + safeFiniteNumber(row.safetyRating?.collisionsEnv, 0), 0),
    ratingEligible: false,
    reviewStatus: 'reviewed-unrated',
    reviewReason: review?.reason || null,
    qualifyingResults: [],
    raceResults,
    session: {
      ...session,
      type: String(session.type || 'RACE').toUpperCase(),
      source: 'sql-mirror',
      mirrorDriver
    },
    drivers: ensureArray(detail.drivers),
    laps: ensureArray(detail.laps),
    incidents: ensureArray(detail.incidents),
    sessions: [
      {
        type: 'RACE',
        key: 'RACE',
        track: sessionTrack,
        resultCount: raceResults.length,
        lapCount,
        fastestLap: fastest ? {
          lapTime: fastest.bestLap,
          driverName: fastest.name,
          carModel: fastest.model
        } : null
      }
    ],
    winner: topRow || null,
    fastestLap: fastest ? {
      lapTime: fastest.bestLap,
      driverName: fastest.name,
      carModel: fastest.model
    } : null
  };
}

type ProcessingContext = {
  srMode: 'stracker' | 'acsm-partial' | 'none';
  strackerAvailable: boolean;
  strackerDbPath: string | null;
  warningLogs: RecalculationLog[];
  sessions: PlainObject[];
  db: any;
};

async function createProcessingContext(eventsCount: number, mode: 'incremental' | 'rebuild') {
  const warningLogs: RecalculationLog[] = [];
  const strackerDbPath = resolveStrackerDbPath();
  if (!strackerDbPath) {
    warningLogs.push({
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode,
      status: 'error',
      message: 'STRacker no configurado, usando fallback ACSM con datos parciales para SR.',
      createdAt: isoNow()
    });
    return {
      srMode: eventsCount > 0 ? 'acsm-partial' : 'none',
      strackerAvailable: false,
      strackerDbPath: null,
      warningLogs,
      sessions: [],
      db: null
    } satisfies ProcessingContext;
  }

  try {
    const db = await openStrackerDb(strackerDbPath);
    const tableCheck = verifyStrackerTables(db);
    if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);
    const sessions = findRaceSessions(db, Math.max(200, eventsCount * 6));
    return {
      srMode: 'stracker',
      strackerAvailable: true,
      strackerDbPath,
      warningLogs,
      sessions,
      db
    } satisfies ProcessingContext;
  } catch (error) {
    warningLogs.push({
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode,
      status: 'error',
      message: `STRacker no disponible, usando fallback ACSM: ${error instanceof Error ? error.message : String(error)}`,
      createdAt: isoNow()
    });
    return {
      srMode: eventsCount > 0 ? 'acsm-partial' : 'none',
      strackerAvailable: false,
      strackerDbPath,
      warningLogs,
      sessions: [],
      db: null
    } satisfies ProcessingContext;
  }
}

function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {
  const driverMap = new Map(snapshot.drivers.map((driver) => [driver.driverKey, driver]));
  const byPlayerId = new Map(snapshot.drivers.filter((driver) => driver.strackerPlayerId).map((driver) => [`player:${driver.strackerPlayerId}`, driver]));
  const bySteam = new Map(snapshot.drivers.filter((driver) => driver.steamGuid).map((driver) => [`steam:${driver.steamGuid}`, driver]));
  const byName = new Map(snapshot.drivers.map((driver) => [`name:${driver.displayName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_')}`, driver]));
  const resultsByEvent = new Map<string, RatingEventResult[]>();
  const championshipEvents = ensureArray(championship.events);
  const championshipEventIds = new Set(championshipEvents.map((event: PlainObject) => String(event.id)).filter(Boolean));
  const lastOfficialResultByDriver = new Map<string, RatingEventResult>();
  const officialResultsByDriver = new Map<string, RatingEventResult[]>();

  snapshot.eventResults.forEach((result) => {
    const bucket = resultsByEvent.get(result.eventId) || [];
    bucket.push(result);
    resultsByEvent.set(result.eventId, bucket);

    // La clasificaciÃ³n de /campeonato es ACSM-only: las carreras manuales sTracker
    // pueden contar para SR/GSR global, pero nunca deben alterar puntos, victorias,
    // podios, incidentes ni Ãºltimo resultado del campeonato ACSM.
    if (!championshipEventIds.has(String(result.eventId))) return;

    const officialBucket = officialResultsByDriver.get(result.driverKey) || [];
    officialBucket.push(result);
    officialResultsByDriver.set(result.driverKey, officialBucket);

    const previous = lastOfficialResultByDriver.get(result.driverKey);
    if (!previous || parseDateMs(result.eventDate || result.processedAt) >= parseDateMs(previous.eventDate || previous.processedAt)) {
      lastOfficialResultByDriver.set(result.driverKey, result);
    }
  });

  function findDriverForStanding(row: PlainObject) {
    const keys = [
      row.driverKey,
      row.guid ? `steam:${row.guid}` : '',
      row.playerId ? `player:${row.playerId}` : '',
      `name:${String(row.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_')}`
    ].filter(Boolean);
    for (const key of keys) {
      const hit = driverMap.get(key) || byPlayerId.get(key) || bySteam.get(key) || byName.get(key);
      if (hit) return hit;
    }
    return null;
  }

  const standings = ensureArray(championship.standings).map((row: PlainObject) => {
    const rating = findDriverForStanding(row);
    const officialResults = rating ? officialResultsByDriver.get(rating.driverKey) || [] : [];
    const lastResult = rating ? lastOfficialResultByDriver.get(rating.driverKey) || null : null;
    const officialWins = officialResults.filter((result) => result.position === 1).length;
    const officialPodiums = officialResults.filter((result) => result.position >= 1 && result.position <= 3).length;
    const officialIncidentPoints = officialResults.length
      ? roundTo(officialResults.reduce((sum, result) => sum + Number(result.incidentPoints || 0), 0))
      : null;

    return {
      ...row,
      name: displayDriverName(row.name, 'Piloto'),
      model: displayCarName(row.model || row.carModel || row.car, ''),
      classificationSource: 'acsm',
      ratingDisplayScope: 'global-reference',
      driverKey: rating?.driverKey ?? row.driverKey ?? null,
      hasPersistentRating: Boolean(rating && rating.racesCount > 0),
      srScore: rating?.racesCount ? rating.srScore : null,
      srClass: rating?.racesCount ? rating.srClass : null,
      gsrRating: rating?.racesCount ? rating.gsrRating : null,
      gsrClass: rating?.racesCount ? rating.gsrClass : null,
      incidentPointsTotal: officialIncidentPoints ?? row.incidentPointsTotal ?? row.incidents ?? 0,
      wins: row.wins ?? officialWins ?? 0,
      podiums: row.podiums ?? officialPodiums ?? 0,
      lastResult: lastResult ? {
        eventId: lastResult.eventId,
        eventName: cleanDisplayText(lastResult.eventName),
        position: lastResult.position,
        points: lastResult.points
      } : null,
      safetyRating: rating?.racesCount ? { score: rating.srScore, class: rating.srClass } : null
    };
  });

  const enrichEvent = (event: PlainObject) => {
    const eventResults = (resultsByEvent.get(String(event.id)) || []).sort((left, right) => left.position - right.position);
    const officialRaceResults = ensureArray(event.raceResults);
    return {
      ...event,
      source: event.source || (String(event.id || '').startsWith('stracker:') ? 'stracker-manual' : 'acsm'),
      raceResults: eventResults.length ? eventResults.map((result) => {
        const official = officialRaceResults.find((row: PlainObject) =>
          safeFiniteNumber(row.position, 0) === result.position ||
          textValue(row.guid) === textValue(result.steamGuid) ||
          textValue(row.name).toLowerCase() === textValue(result.displayName).toLowerCase()
        ) || {};
        return {
          ...official,
          position: result.position,
          name: displayDriverName(result.displayName, 'Piloto'),
          guid: result.steamGuid,
          model: displayCarName(result.car, 'Coche'),
          bestLapMs: result.bestLapMs,
          bestLap: formatLapMs(result.bestLapMs),
          totalTime: official.totalTime || official.totalTimeMs || '--',
          numLaps: result.laps,
          points: result.points,
          srScore: result.newSr,
          srClass: ratingClassFromSr(result.newSr),
          srDelta: result.deltaSr,
          gsrRating: result.newGsr,
          gsrClass: ratingClassFromGsr(result.newGsr),
          gsrDelta: result.deltaGsr,
          cleanRace: result.cleanRace,
          incidentPoints: result.incidentPoints,
          incidents: result.incidents,
          lapsDetail: result.lapsDetail,
          match: result.match,
          gsrExplanation: result.notes[0] || '',
          safetyRating: {
            score: result.newSr,
            class: ratingClassFromSr(result.newSr),
            delta: result.deltaSr,
            eventScore: result.newSr,
            severity: result.incidentPoints,
            offTracks: result.lapsDetail.reduce((sum, lap) => sum + lap.cuts, 0),
            collisionsCar: result.lapsDetail.reduce((sum, lap) => sum + lap.collisionsCar, 0),
            collisionsEnv: result.lapsDetail.reduce((sum, lap) => sum + lap.collisionsEnv, 0),
            source: result.match.method.includes('acsm') ? 'acsm' : 'stracker.db3',
            model: 'gc-ratings-v1',
            penalties: {
              summary: result.incidents.map((incident) => incident.description)
            },
            incidents: result.incidents,
            laps: result.lapsDetail.map((lap) => ({
              lap: lap.lapNumber,
              lapTime: formatLapMs(lap.lapTimeMs),
              valid: lap.valid,
              offTracks: lap.cuts,
              cuts: lap.cuts,
              collisionsCar: lap.collisionsCar,
              collisionsEnv: lap.collisionsEnv,
              srDelta: lap.srDelta,
              notes: lap.notes ? lap.notes.split(' · ') : []
            }))
          }
        };
      }) : event.raceResults
    };
  };

  const events = championshipEvents
    .map(enrichEvent)
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(left.scheduledAt || left.completedAt) - parseDateMs(right.scheduledAt || right.completedAt));

  const processedStrackerEvents = manualEventsFromSnapshot(snapshot, championshipEvents)
    .map(enrichEvent)
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(right.completedAt || right.scheduledAt) - parseDateMs(left.completedAt || left.scheduledAt));

  const reviewedStrackerEvents = reviewedEventsFromSnapshot(snapshot, [...championshipEvents, ...processedStrackerEvents])
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(right.completedAt || right.scheduledAt) - parseDateMs(left.completedAt || left.scheduledAt));

  const strackerSeries = {
    id: 'gc-stracker-community',
    name: 'Carreras sTracker',
    type: 'stracker_series',
    description: 'Carreras detectadas desde sTracker fuera de ACSM. Pueden contar para SR/GSR global si se validan manualmente, pero nunca para la clasificaciÃ³n ACSM.',
    sharedRatings: true,
    processedEvents: processedStrackerEvents,
    reviewedEvents: reviewedStrackerEvents,
    detectedEvents: [],
    stats: {
      processed: processedStrackerEvents.length,
      reviewed: reviewedStrackerEvents.length,
      drivers: [...new Set(processedStrackerEvents.flatMap((event: PlainObject) => ensureArray(event.raceResults).map((row: PlainObject) => textValue(row.name))))].filter(Boolean).length
    }
  };

  return { ...championship, standings, events, strackerSeries };
}


function rebuildDriversFromEventResults(eventResults: RatingEventResult[], previousDrivers: DriverRatingState[] = []) {
  const states = new Map<string, DriverRatingState>();
  const previousByDriver = new Map(previousDrivers.map((driver) => [driver.driverKey, driver]));
  const ordered = [...eventResults].sort((left, right) =>
    parseDateMs(left.eventDate || left.processedAt) - parseDateMs(right.eventDate || right.processedAt) ||
    left.position - right.position ||
    left.displayName.localeCompare(right.displayName)
  );

  for (const result of ordered) {
    const previous = previousByDriver.get(result.driverKey);
    const current = states.get(result.driverKey) || stateFromRow({
      driverKey: result.driverKey,
      displayName: result.displayName,
      steamGuid: result.steamGuid,
      strackerPlayerId: result.strackerPlayerId
    });

    current.createdAt = previous?.createdAt || current.createdAt;
    current.displayName = displayDriverName(result.displayName || current.displayName, current.displayName);
    current.steamGuid = result.steamGuid ?? current.steamGuid ?? null;
    current.strackerPlayerId = result.strackerPlayerId ?? current.strackerPlayerId ?? null;

    current.srScore = roundTo(result.newSr, 2);
    current.srClass = ratingClassFromSr(result.newSr);
    current.gsrMu = roundTo(result.gsrMuAfter, 4);
    current.gsrSigma = roundTo(result.gsrSigmaAfter, 4);
    current.gsrRating = Math.round(result.newGsr);
    current.gsrClass = ratingClassFromGsr(result.newGsr);

    current.racesCount += 1;
    current.cleanRaces += result.cleanRace ? 1 : 0;
    current.wins += result.position === 1 ? 1 : 0;
    current.podiums += result.position <= 3 ? 1 : 0;
    current.incidentPointsTotal = roundTo(current.incidentPointsTotal + safeFiniteNumber(result.incidentPoints, 0), 2);

    current.lastDeltaSr = roundTo(result.deltaSr, 2);
    current.lastDeltaGsr = Math.round(result.deltaGsr);
    current.lastEventId = result.eventId;
    current.lastRaceAt = result.eventDate || result.processedAt || current.lastRaceAt;
    current.updatedAt = result.processedAt || isoNow();

    states.set(result.driverKey, current);
  }

  return Array.from(states.values()).sort((left, right) =>
    right.gsrRating - left.gsrRating ||
    right.srScore - left.srScore ||
    left.displayName.localeCompare(right.displayName)
  );
}


export class GcRatingsService {
  private readonly store = createRatingStore();
  private cachedSnapshot: RatingsSnapshot | null = null;

  private async loadSnapshot() {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    const loaded = await this.store.load();
    this.cachedSnapshot = loaded;
    return loaded;
  }

  async getSnapshot() {
    const loaded = await this.loadSnapshot();
    if (loaded) return loaded;
    return createEmptySnapshot(null, this.store.kind);
  }

  private async computeEventUpdates(baseSnapshot: RatingsSnapshot, events: PlainObject[], mode: 'incremental' | 'rebuild') {
    const states = new Map(baseSnapshot.drivers.map((driver) => [driver.driverKey, { ...driver }]));
    const newEventResults: RatingEventResult[] = [];
    const processedEventIds = new Set(baseSnapshot.processedEventIds);
    const context = await createProcessingContext(events.length, mode);

    try {
      for (const event of events) {
        const forcedSessionId = safeFiniteNumber(event.manualStrackerSessionId || event.strackerSessionId, 0);
        const session = context.strackerAvailable && context.db
          ? forcedSessionId
            ? context.sessions.find((candidate: PlainObject) => safeFiniteNumber(candidate.SessionId, 0) === forcedSessionId) || readRaceSession(context.db, forcedSessionId) || identifyRaceSession(event, context.sessions)
            : identifyRaceSession(event, context.sessions)
          : null;
        const strackerDrivers = session && context.db ? readRaceDrivers(context.db, Number(session.SessionId)) : [];
        const officialResults = ensureArray(event.raceResults);

        const matches = session && strackerDrivers.length
          ? matchOfficialToStracker(event, session, strackerDrivers)
          : officialResults.map((result: PlainObject) => ({
              result,
              stracker: null,
              match: acsmFallbackMatch(event, result)
            }));

        const maxRaceLaps = Math.max(...officialResults.map((row: PlainObject) => safeFiniteNumber(row.numLaps, 0)), 0);
        const processedAt = isoNow();

        const provisionalRows = matches.map(({ result, stracker, match }: any) => {
          const driverKey = driverKeyFromParts({
            strackerPlayerId: stracker?.PlayerId ?? null,
            steamGuid: stracker?.StrackerGuid ?? result.guid ?? null,
            name: displayDriverName(officialDriverName(result), 'Piloto')
          });
          const current = states.get(driverKey) || stateFromRow({
            driverKey,
            displayName: displayDriverName(officialDriverName(result), 'Piloto'),
            steamGuid: stracker?.StrackerGuid ?? result.guid ?? null,
            strackerPlayerId: stracker?.PlayerId ?? null
          });
          states.set(driverKey, current);

          const resultId = uniqueId('gc_evt');
          const laps = context.db && stracker?.PlayerInSessionId
            ? readRaceLaps(context.db, Number(stracker.PlayerInSessionId))
            : buildAcsmRaceLapsForDriver(event, result);

          const sr = buildSrComputation({
            eventId: String(event.id),
            eventResultId: resultId,
            driverKey,
            oldSr: current.srScore,
            laps,
            officialResult: {
              ...result,
              dnf: Boolean(result.status === 'DNF')
            },
            matchedRow: stracker,
            maxRaceLaps
          });

          return {
            resultId,
            eventId: String(event.id),
            eventName: cleanDisplayText(event.name, `Ronda ${event.index}`),
            eventDate: event.completedAt || event.scheduledAt || null,
            strackerSessionId: session ? Number(session.SessionId) : null,
            driverKey,
            steamGuid: stracker?.StrackerGuid ?? result.guid ?? null,
            strackerPlayerId: stracker?.PlayerId ?? null,
            displayName: displayDriverName(officialDriverName(result), 'Piloto'),
            car: displayCarName(result.model || result.carModel || stracker?.UiCarName || stracker?.CarFolder, 'Coche'),
            position: safeFiniteNumber(result.position, 0),
            points: safeFiniteNumber(result.points, 0),
            laps: safeFiniteNumber(result.numLaps, 0),
            bestLapMs: safeFiniteNumber(result.bestLapMs || stracker?.BestLapMs, 0),
            oldSr: current.srScore,
            newSr: sr.newSr,
            deltaSr: sr.deltaSr,
            incidentPoints: sr.incidentPoints,
            cleanRace: sr.cleanRace,
            dnf: Boolean(result.status === 'DNF') || sr.incidents.some((item) => item.type === 'DNF'),
            dsq: Boolean(result.disqualified || result.dsq),
            srIncidents: sr.incidents,
            srLaps: sr.lapDetails,
            match,
            processedAt
          };
        });

        const gsrUpdates = applyGsrUpdates(provisionalRows, states);
        const gsrByDriver = new Map(gsrUpdates.map((row) => [row.driverKey, row]));

        for (const row of provisionalRows.sort((left, right) => left.position - right.position)) {
          const current = states.get(row.driverKey)!;
          const gsr = gsrByDriver.get(row.driverKey)!;
          current.displayName = row.displayName;
          current.steamGuid = row.steamGuid ?? current.steamGuid;
          current.strackerPlayerId = row.strackerPlayerId ?? current.strackerPlayerId;
          current.srScore = row.newSr;
          current.srClass = ratingClassFromSr(row.newSr);
          current.gsrMu = gsr.newMu;
          current.gsrSigma = gsr.newSigma;
          current.gsrRating = gsr.newRating;
          current.gsrClass = ratingClassFromGsr(gsr.newRating);
          current.racesCount += 1;
          current.cleanRaces += row.cleanRace ? 1 : 0;
          current.wins += row.position === 1 ? 1 : 0;
          current.podiums += row.position <= 3 ? 1 : 0;
          current.incidentPointsTotal = roundTo(current.incidentPointsTotal + row.incidentPoints);
          current.lastDeltaSr = row.deltaSr;
          current.lastDeltaGsr = gsr.delta;
          current.lastEventId = row.eventId;
          current.lastRaceAt = row.eventDate;
          current.updatedAt = processedAt;

          newEventResults.push({
            id: row.resultId,
            eventId: row.eventId,
            eventName: row.eventName,
            eventDate: row.eventDate,
            strackerSessionId: row.strackerSessionId,
            driverKey: row.driverKey,
            steamGuid: row.steamGuid,
            strackerPlayerId: row.strackerPlayerId,
            displayName: row.displayName,
            car: row.car,
            position: row.position,
            points: row.points,
            laps: row.laps,
            bestLapMs: row.bestLapMs,
            bestLap: formatLapMs(row.bestLapMs),
            oldSr: row.oldSr,
            newSr: row.newSr,
            deltaSr: row.deltaSr,
            oldGsr: gsr.oldRating,
            newGsr: gsr.newRating,
            deltaGsr: gsr.delta,
            gsrMuBefore: gsr.oldMu,
            gsrMuAfter: gsr.newMu,
            gsrSigmaBefore: gsr.oldSigma,
            gsrSigmaAfter: gsr.newSigma,
            incidentPoints: row.incidentPoints,
            cleanRace: row.cleanRace,
            dnf: row.dnf,
            dsq: row.dsq,
            processedAt,
            incidents: row.srIncidents,
            lapsDetail: row.srLaps,
            match: row.match,
            notes: [gsr.explanation]
          });
        }

        processedEventIds.add(String(event.id));
      }

      return {
        context,
        processedEventIds: [...processedEventIds],
        drivers: [...states.values()].sort((left, right) => right.gsrRating - left.gsrRating || right.srScore - left.srScore),
        newEventResults
      };
    } finally {
      try { context.db?.close?.(); } catch {}
    }
  }

  async processNewEvents(options: PlainObject = {}) {
    const acsm = await fetchChampionship();
    const championship = acsm.championship;
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(championship, this.store.kind);
    const allCompleted = completedEvents(championship);
    const processedIds = new Set([...baseSnapshot.processedEventIds, ...baseSnapshot.eventResults.map((row) => row.eventId)]);
    const newEvents = allCompleted.filter((event: PlainObject) => !processedIds.has(String(event.id)));
    const saveNoopLog = options.saveNoopLog !== false;

    if (!newEvents.length) {
      if (!saveNoopLog) {
        const snapshot: RatingsSnapshot = {
          ...baseSnapshot,
          championshipId: textValue(championship.id, baseSnapshot.championshipId),
          championshipName: textValue(championship.name, baseSnapshot.championshipName),
          storage: this.store.kind
        };
        this.cachedSnapshot = snapshot;
        return {
          snapshot,
          mode: 'incremental' as const,
          processedEvents: 0,
          skippedEvents: [],
          newEvents: [],
          message: 'Sin eventos ACSM completados nuevos'
        };
      }

      const noopLog: RecalculationLog = {
        id: uniqueId('gc_recalc'),
        eventId: null,
        mode: 'incremental',
        status: 'ok',
        message: 'Sin eventos ACSM completados nuevos',
        createdAt: isoNow()
      };
      const snapshot = {
        ...baseSnapshot,
        championshipId: textValue(championship.id, baseSnapshot.championshipId),
        championshipName: textValue(championship.name, baseSnapshot.championshipName),
        storage: this.store.kind,
        generatedAt: noopLog.createdAt,
        recalculationLogs: [...baseSnapshot.recalculationLogs, noopLog]
      };
      if (this.store.append) {
        await this.store.append({ snapshot, drivers: [], eventResults: [], recalculationLogs: [noopLog] });
      } else {
        await this.store.save(snapshot);
      }
      this.cachedSnapshot = snapshot;
      return {
        snapshot,
        mode: 'incremental' as const,
        processedEvents: 0,
        skippedEvents: [],
        newEvents: [],
        message: 'Sin eventos ACSM completados nuevos'
      };
    }

    const computed = await this.computeEventUpdates(baseSnapshot, newEvents, 'incremental');
    const statusMessage = computed.context.srMode === 'stracker'
      ? `Procesados automÃ¡ticamente ${newEvents.length} evento(s) ACSM completado(s) con SR/GSR.`
      : `Procesados automÃ¡ticamente ${newEvents.length} evento(s) ACSM completado(s) con SR parcial desde ACSM.`;
    const okLog: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode: 'incremental',
      status: 'ok',
      message: statusMessage,
      createdAt: isoNow()
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      championshipId: textValue(championship.id, baseSnapshot.championshipId),
      championshipName: textValue(championship.name, baseSnapshot.championshipName),
      source: computed.context.srMode === 'stracker' ? 'gc-ratings-v1' : 'gc-ratings-v1-acsm-fallback',
      storage: this.store.kind,
      strackerDbPath: computed.context.strackerAvailable ? computed.context.strackerDbPath : null,
      generatedAt: okLog.createdAt,
      processedEventIds: computed.processedEventIds,
      drivers: computed.drivers,
      eventResults: [...baseSnapshot.eventResults, ...computed.newEventResults],
      recalculationLogs: [...baseSnapshot.recalculationLogs, ...computed.context.warningLogs, okLog]
    };

    if (this.store.append) {
      await this.store.append({
        snapshot,
        drivers: computed.drivers,
        eventResults: computed.newEventResults,
        recalculationLogs: [...computed.context.warningLogs, okLog]
      });
    } else {
      await this.store.save(snapshot);
    }
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      mode: 'incremental' as const,
      processedEvents: newEvents.length,
      skippedEvents: [],
      newEvents: newEvents.map((event: PlainObject) => ({ id: String(event.id), name: textValue(event.name, `Ronda ${event.index}`) })),
      message: statusMessage
    };
  }

  async rebuild() {
    const acsm = await fetchChampionship();
    const championship = acsm.championship;
    const allCompleted = completedEvents(championship);
    const previousSnapshot = await this.getSnapshot();
    const baseSnapshot: RatingsSnapshot = {
      ...createEmptySnapshot(championship, this.store.kind),
      ignoredStrackerSessions: normalizeIgnoredStrackerSessions(previousSnapshot)
    };
    const computed = await this.computeEventUpdates(baseSnapshot, allCompleted, 'rebuild');
    const okLog: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode: 'rebuild',
      status: 'ok',
      message: computed.context.srMode === 'stracker'
        ? 'Rebuild completo ejecutado.'
        : 'Rebuild completo ejecutado con SR parcial desde ACSM.',
      createdAt: isoNow()
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      source: computed.context.srMode === 'stracker' ? 'gc-ratings-v1' : 'gc-ratings-v1-acsm-fallback',
      strackerDbPath: computed.context.strackerAvailable ? computed.context.strackerDbPath : null,
      generatedAt: okLog.createdAt,
      processedEventIds: computed.processedEventIds,
      drivers: computed.drivers,
      eventResults: computed.newEventResults,
      recalculationLogs: [...computed.context.warningLogs, okLog]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      mode: 'rebuild' as const,
      processedEvents: allCompleted.length,
      skippedEvents: [],
      rebuiltEvents: allCompleted.map((event: PlainObject) => ({ id: String(event.id), name: textValue(event.name, `Ronda ${event.index}`) })),
      message: okLog.message
    };
  }


  private async buildManualStrackerEventFromSession(sessionId: number, options: PlainObject = {}) {
    const strackerDbPath = resolveStrackerDbPath();
    if (!strackerDbPath) throw new Error('STRacker no configurado. Falta STRACKER_DB_PATH o data/stracker/stracker.db3.');

    const db = await openStrackerDb(strackerDbPath);
    try {
      const tableCheck = verifyStrackerTables(db);
      if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);

      const session = readRaceSession(db, sessionId);
      if (!session) throw new Error(`No existe la sesiÃ³n sTracker ${sessionId}.`);
      if (String(session.SessionType || '').toLowerCase() !== 'race') {
        throw new Error(`La sesiÃ³n ${sessionId} no es Race.`);
      }

      const drivers = readRaceDrivers(db, sessionId).filter((driver: PlainObject) =>
        safeFiniteNumber(driver.MaxLapCount || driver.LapRows, 0) > 0
      );

      const minDrivers = safeFiniteNumber(options.minDrivers, 3);
      if (drivers.length < minDrivers) {
        throw new Error(`La sesiÃ³n ${sessionId} tiene ${drivers.length} piloto(s), mÃ­nimo ${minDrivers}.`);
      }

      return buildManualStrackerEvent(session, drivers, options);
    } finally {
      try { db.close(); } catch {}
    }
  }

  async getStrackerRaceCandidates(options: PlainObject = {}) {
    const snapshot = await this.getSnapshot();
    const processedIds = new Set([...snapshot.processedEventIds, ...snapshot.eventResults.map((row) => row.eventId)]);
    const ignoredSessions = normalizeIgnoredStrackerSessions(snapshot);
    const ignoredBySession = new Map(ignoredSessions.map((item) => [item.sessionId, item]));
    const reviewedSessions = normalizeReviewedStrackerSessions(snapshot);
    const reviewedBySession = new Map(reviewedSessions.map((item) => [item.sessionId, item]));
    const officialByStrackerSession = new Map<number, RatingEventResult>();
    snapshot.eventResults.forEach((row) => {
      const sessionId = safeFiniteNumber(row.strackerSessionId, 0);
      if (!sessionId || String(row.eventId || '').startsWith('stracker:')) return;
      if (!officialByStrackerSession.has(sessionId)) officialByStrackerSession.set(sessionId, row);
    });
    const strackerDbPath = resolveStrackerDbPath();

    if (!strackerDbPath) {
      return {
        ok: false,
        source: 'gc-ratings-v1',
        message: 'STRacker no configurado.',
        candidates: []
      };
    }

    const db = await openStrackerDb(strackerDbPath);
    try {
      const tableCheck = verifyStrackerTables(db);
      if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);

      const candidates = findRatingCandidateRaceSessions(db, {
        limit: safeFiniteNumber(options.limit, 80),
        minDrivers: safeFiniteNumber(options.minDrivers, 3),
        minTotalLaps: safeFiniteNumber(options.minTotalLaps, 1)
      }).map((session: PlainObject) => {
        const sessionId = safeFiniteNumber(session.SessionId, 0);
        const eventId = strackerManualEventId(sessionId);
        const startIso = unixSecondsToIso(session.StartTimeDate);
        const lastLapIso = unixSecondsToIso(session.LastLapUnix);
        const linkedOfficial = officialByStrackerSession.get(sessionId) || null;
        const ignoredReview = ignoredBySession.get(sessionId) || null;
        const reviewedReview = reviewedBySession.get(sessionId) || null;
        const alreadyProcessed = processedIds.has(eventId) || Boolean(linkedOfficial) || Boolean(reviewedReview);

        return {
          eventId,
          sessionId,
          type: session.SessionType,
          track: displayTrackName(session.UiTrackName || session.Track, 'Circuito'),
          trackRaw: cleanDisplayText(session.Track),
          comboId: session.ComboId ?? null,
          startTime: startIso,
          lastLapAt: lastLapIso,
          endTime: unixSecondsToIso(session.EndTimeDate),
          playerCount: safeFiniteNumber(session.PlayerCount, 0),
          lapCount: safeFiniteNumber(session.LapCount, 0),
          maxLapCount: safeFiniteNumber(session.MaxLapCount, 0),
          bestLapMs: safeFiniteNumber(session.BestLapMs, 0),
          bestLap: formatLapMs(session.BestLapMs),
          cuts: safeFiniteNumber(session.Cuts, 0),
          collisionsCar: safeFiniteNumber(session.CollisionsCar, 0),
          collisionsEnv: safeFiniteNumber(session.CollisionsEnv, 0),
          alreadyProcessed,
          ignored: Boolean(ignoredReview),
          reviewed: Boolean(reviewedReview),
          reviewStatus: reviewedReview?.status || null,
          ratingEligible: reviewedReview ? false : true,
          reviewedReason: reviewedReview?.reason || null,
          reviewedAt: reviewedReview?.updatedAt || reviewedReview?.createdAt || null,
          ignoredReason: ignoredReview?.reason || null,
          ignoredAt: ignoredReview?.updatedAt || ignoredReview?.createdAt || null,
          linkedToAcsm: Boolean(linkedOfficial),
          linkedAcsmEventId: linkedOfficial?.eventId || null,
          recommended: !alreadyProcessed && !ignoredReview && !reviewedReview && safeFiniteNumber(session.PlayerCount, 0) >= 3 && safeFiniteNumber(session.LapCount, 0) >= 1
        };
      });

      const candidatesBySession = new Map(candidates.map((candidate: PlainObject) => [safeFiniteNumber(candidate.sessionId, 0), candidate]));
      const ignored = ignoredSessions
        .map((review) => ({
          ...(candidatesBySession.get(review.sessionId) || {}),
          ...review,
          ignored: true,
          ignoredAt: review.updatedAt || review.createdAt,
          ignoredReason: review.reason || null,
          recommended: false,
          alreadyProcessed: candidatesBySession.get(review.sessionId)?.alreadyProcessed || false,
          linkedToAcsm: candidatesBySession.get(review.sessionId)?.linkedToAcsm || false
        }))
        .sort((left, right) => parseDateMs(right.ignoredAt || right.updatedAt || right.createdAt) - parseDateMs(left.ignoredAt || left.updatedAt || left.createdAt));

      return {
        ok: true,
        source: 'gc-ratings-v1',
        strackerDbPath,
        generatedAt: isoNow(),
        candidates,
        ignoredSessions: ignored,
        reviewedSessions
      };
    } finally {
      try { db.close(); } catch {}
    }
  }

  async processStrackerSession(sessionId: number, options: PlainObject = {}) {
    const countsForRatings = parseBooleanish(options.countsForRatings, true) ?? true;
    if (!countsForRatings) {
      return this.reviewStrackerSession(sessionId, options);
    }

    const event = await this.buildManualStrackerEventFromSession(sessionId, options);
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const processedIds = new Set([...baseSnapshot.processedEventIds, ...baseSnapshot.eventResults.map((row) => row.eventId)]);
    const reviewedSessions = normalizeReviewedStrackerSessions(baseSnapshot);

    if (isIgnoredStrackerSession(baseSnapshot, sessionId)) {
      throw new Error(`La sesiÃ³n ${sessionId} estÃ¡ ignorada. RecupÃ©rala antes de procesarla para SR/GSR.`);
    }

    if (processedIds.has(String(event.id))) {
      return {
        snapshot: baseSnapshot,
        mode: 'incremental' as const,
        processedEvents: 0,
        skippedEvents: [String(event.id)],
        newEvents: [],
        message: `La sesiÃ³n ${sessionId} ya estaba procesada.`
      };
    }

    const computed = await this.computeEventUpdates(baseSnapshot, [event], 'incremental');
    const okLog: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId: String(event.id),
      mode: 'incremental',
      status: 'ok',
      message: `Procesada carrera manual sTracker ${sessionId} para SR/GSR.`,
      createdAt: isoNow()
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      source: 'gc-ratings-v1-stracker-manual',
      storage: this.store.kind,
      strackerDbPath: computed.context.strackerAvailable ? computed.context.strackerDbPath : null,
      generatedAt: okLog.createdAt,
      processedEventIds: computed.processedEventIds,
      drivers: computed.drivers,
      eventResults: [...baseSnapshot.eventResults, ...computed.newEventResults],
      recalculationLogs: [...baseSnapshot.recalculationLogs, ...computed.context.warningLogs, okLog],
      reviewedStrackerSessions: reviewedSessions.filter((item) => item.sessionId !== sessionId)
    };

    if (this.store.append) {
      await this.store.append({
        snapshot,
        drivers: computed.drivers,
        eventResults: computed.newEventResults,
        recalculationLogs: [...computed.context.warningLogs, okLog]
      });
    } else {
      await this.store.save(snapshot);
    }

    this.cachedSnapshot = snapshot;
    return {
      snapshot,
      mode: 'incremental' as const,
      processedEvents: 1,
      skippedEvents: [],
      newEvents: [{ id: String(event.id), name: cleanDisplayText(event.name) }],
      message: `Procesada carrera sTracker ${sessionId}.`
    };
  }

  async reviewStrackerSession(sessionId: number, options: PlainObject = {}) {
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const eventId = strackerManualEventId(sessionId);
    const processedRows = baseSnapshot.eventResults.filter((row) => String(row.eventId) === eventId);

    if (processedRows.length) {
      throw new Error(`La sesiÃ³n ${sessionId} ya cuenta para SR/GSR. QuÃ­tala antes de marcarla como no puntuable.`);
    }
    if (isIgnoredStrackerSession(baseSnapshot, sessionId)) {
      throw new Error(`La sesiÃ³n ${sessionId} estÃ¡ ignorada. RecupÃ©rala antes de revisarla como no puntuable.`);
    }

    const event = await this.buildManualStrackerEventFromSession(sessionId, options);
    const now = isoNow();
    const currentReviewed = normalizeReviewedStrackerSessions(baseSnapshot);
    const previous = currentReviewed.find((item) => item.sessionId === sessionId) || null;
    const review: RatingStrackerSessionReview = {
      eventId,
      sessionId,
      status: 'reviewed-unrated',
      ratingEligible: false,
      reason: textValue(options.reason) || previous?.reason || null,
      name: cleanDisplayText(event.name, `Carrera no oficial ${sessionId}`),
      track: displayTrackName(event.track || event.trackRaw, 'Carrera no oficial'),
      trackRaw: cleanDisplayText(event.trackRaw || event.track, 'Carrera no oficial'),
      comboId: safeFiniteNumber(event.comboId, 0) || null,
      startTime: textValue(event.scheduledAt || event.startedAt || event.completedAt) || null,
      endTime: textValue(event.completedAt || event.scheduledAt || event.startedAt) || null,
      playerCount: safeFiniteNumber(event.playerCount, 0) || null,
      lapCount: safeFiniteNumber(event.lapCount, 0) || null,
      maxLapCount: safeFiniteNumber(event.maxLapCount, 0) || null,
      bestLapMs: safeFiniteNumber(event.bestLapMs, 0) || null,
      bestLap: textValue(event.bestLap) || null,
      cuts: safeFiniteNumber(event.cuts, 0) || null,
      collisionsCar: safeFiniteNumber(event.collisionsCar, 0) || null,
      collisionsEnv: safeFiniteNumber(event.collisionsEnv, 0) || null,
      createdAt: previous?.createdAt || now,
      updatedAt: now
    };

    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'event',
      status: 'ok',
      message: `Revisada carrera sTracker ${eventId} como no puntuable. Queda registrada y no modifica SR/GSR.${review.reason ? ` Motivo: ${review.reason}` : ''}`,
      createdAt: now
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      storage: this.store.kind,
      generatedAt: now,
      reviewedStrackerSessions: [...currentReviewed.filter((item) => item.sessionId !== sessionId), review],
      recalculationLogs: [...baseSnapshot.recalculationLogs, log]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      mode: 'event' as const,
      processedEvents: 0,
      skippedEvents: [],
      newEvents: [{ id: eventId, name: review.name || cleanDisplayText(event.name) }],
      reviewed: review,
      message: `Registrada carrera sTracker ${sessionId} como no puntuable.`
    };
  }


  async removeStrackerSession(input: { sessionId?: number; eventId?: string; reason?: string } = {}) {
    const rawEventId = textValue(input.eventId);
    const sessionId = safeFiniteNumber(input.sessionId, 0);
    const eventId = rawEventId || (sessionId ? strackerManualEventId(sessionId) : '');

    if (!eventId) throw new Error('eventId o sessionId requerido.');
    if (!String(eventId).startsWith('stracker:')) {
      throw new Error('Solo se pueden quitar carreras manuales de sTracker desde este endpoint.');
    }

    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const removedRows = baseSnapshot.eventResults.filter((row) => String(row.eventId) === String(eventId));

    if (!removedRows.length) {
      return {
        snapshot: baseSnapshot,
        removedEvents: 0,
        removedRows: 0,
        eventId,
        message: `No habÃ­a resultados guardados para ${eventId}.`
      };
    }

    const remainingEventResults = baseSnapshot.eventResults.filter((row) => String(row.eventId) !== String(eventId));
    const remainingIds = [...new Set(remainingEventResults.map((row) => String(row.eventId)).filter(Boolean))];
    const eventInfo = new Map<string, RatingEventResult>();

    remainingEventResults.forEach((row) => {
      const previous = eventInfo.get(row.eventId);
      if (!previous || parseDateMs(row.eventDate || row.processedAt) < parseDateMs(previous.eventDate || previous.processedAt)) {
        eventInfo.set(row.eventId, row);
      }
    });

    let championship: PlainObject | null = null;
    let acsmEvents: PlainObject[] = [];

    try {
      const acsm = await fetchChampionship();
      championship = acsm.championship;
      const completed = completedEvents(championship || {});
      acsmEvents = completed.filter((event: PlainObject) => remainingIds.includes(String(event.id)));
    } catch (error) {
      acsmEvents = [];
    }

    const manualIds = remainingIds.filter((id) => id.startsWith('stracker:'));
    const manualEvents: PlainObject[] = [];

    for (const manualId of manualIds) {
      const info = eventInfo.get(manualId);
      const manualSessionId =
        safeFiniteNumber(info?.strackerSessionId, 0) ||
        safeFiniteNumber(String(manualId).replace('stracker:', ''), 0);

      if (!manualSessionId) continue;

      const manualEvent = await this.buildManualStrackerEventFromSession(manualSessionId, {
        eventId: manualId,
        name: info?.eventName || `Carrera sTracker ${manualSessionId}`,
        minDrivers: 1
      });

      manualEvents.push(manualEvent);
    }

    const eventsToRebuild = [...acsmEvents, ...manualEvents]
      .sort((left: PlainObject, right: PlainObject) =>
        parseDateMs(left.scheduledAt || left.completedAt || left.startedAt) -
        parseDateMs(right.scheduledAt || right.completedAt || right.startedAt)
      );

    const rebuildBase: RatingsSnapshot = {
      ...createEmptySnapshot(championship, this.store.kind),
      ignoredStrackerSessions: normalizeIgnoredStrackerSessions(baseSnapshot),
      reviewedStrackerSessions: normalizeReviewedStrackerSessions(baseSnapshot)
    };
    const computed = await this.computeEventUpdates(rebuildBase, eventsToRebuild, 'rebuild');
    const now = isoNow();
    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'rebuild',
      status: 'ok',
      message: `Quitada carrera sTracker ${eventId} y recalculado completo SR/GSR con ${eventsToRebuild.length} carrera(s) restante(s).${input.reason ? ` Motivo: ${input.reason}` : ''}`,
      createdAt: now
    };

    const snapshot: RatingsSnapshot = {
      ...rebuildBase,
      source: 'gc-ratings-v1-stracker-remove-rebuild',
      storage: this.store.kind,
      strackerDbPath: computed.context.strackerAvailable ? computed.context.strackerDbPath : null,
      generatedAt: now,
      processedEventIds: computed.processedEventIds,
      drivers: computed.drivers,
      eventResults: computed.newEventResults,
      recalculationLogs: [...baseSnapshot.recalculationLogs, ...computed.context.warningLogs, log]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      removedEvents: 1,
      removedRows: removedRows.length,
      rebuiltEvents: eventsToRebuild.length,
      eventId,
      message: `Quitada carrera ${eventId} y recalculado completo SR/GSR global.`
    };
  }


  async ignoreStrackerSession(input: { sessionId?: number; eventId?: string; reason?: string } = {}) {
    const rawEventId = textValue(input.eventId);
    const sessionId = safeFiniteNumber(input.sessionId, 0) || safeFiniteNumber(rawEventId.replace('stracker:', ''), 0);
    if (!sessionId) throw new Error('sessionId requerido.');

    const eventId = strackerManualEventId(sessionId);
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const processedRows = baseSnapshot.eventResults.filter((row) => String(row.eventId) === eventId);
    const reviewedRows = normalizeReviewedStrackerSessions(baseSnapshot).filter((row) => row.sessionId === sessionId);

    if (processedRows.length) {
      throw new Error(`La sesiÃ³n ${sessionId} ya estÃ¡ procesada. Primero quÃ­tala del SR/GSR y despuÃ©s podrÃ¡s ignorarla.`);
    }
    if (reviewedRows.length) {
      throw new Error(`La sesiÃ³n ${sessionId} ya estÃ¡ revisada como no puntuable. Quita esa revisiÃ³n antes de ignorarla.`);
    }

    const strackerDbPath = resolveStrackerDbPath();
    if (!strackerDbPath) throw new Error('STRacker no configurado. Falta STRACKER_DB_PATH o data/stracker/stracker.db3.');

    const db = await openStrackerDb(strackerDbPath);
    try {
      const tableCheck = verifyStrackerTables(db);
      if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);
      const session = readRaceSession(db, sessionId);
      if (!session) throw new Error(`No existe la sesiÃ³n sTracker ${sessionId}.`);
      if (String(session.SessionType || '').toLowerCase() !== 'race') {
        throw new Error(`La sesiÃ³n ${sessionId} no es Race.`);
      }
    } finally {
      try { db.close(); } catch {}
    }

    const now = isoNow();
    const currentIgnored = normalizeIgnoredStrackerSessions(baseSnapshot);
    const previous = currentIgnored.find((item) => item.sessionId === sessionId) || null;
    const review: RatingStrackerSessionReview = {
      eventId,
      sessionId,
      status: 'ignored',
      reason: textValue(input.reason) || previous?.reason || null,
      createdAt: previous?.createdAt || now,
      updatedAt: now
    };

    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'event',
      status: 'ok',
      message: `Ignorada carrera sTracker ${eventId}. No cuenta para SR/GSR.${review.reason ? ` Motivo: ${review.reason}` : ''}`,
      createdAt: now
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      storage: this.store.kind,
      generatedAt: now,
      ignoredStrackerSessions: [...currentIgnored.filter((item) => item.sessionId !== sessionId), review],
      recalculationLogs: [...baseSnapshot.recalculationLogs, log]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      eventId,
      sessionId,
      ignored: review,
      message: `Ignorada sesiÃ³n sTracker ${sessionId}. No afecta al SR/GSR.`
    };
  }

  async unignoreStrackerSession(input: { sessionId?: number; eventId?: string } = {}) {
    const rawEventId = textValue(input.eventId);
    const sessionId = safeFiniteNumber(input.sessionId, 0) || safeFiniteNumber(rawEventId.replace('stracker:', ''), 0);
    if (!sessionId) throw new Error('sessionId requerido.');

    const eventId = strackerManualEventId(sessionId);
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const currentIgnored = normalizeIgnoredStrackerSessions(baseSnapshot);
    const previous = currentIgnored.find((item) => item.sessionId === sessionId) || null;

    if (!previous) {
      return {
        snapshot: baseSnapshot,
        eventId,
        sessionId,
        recovered: false,
        message: `La sesiÃ³n sTracker ${sessionId} no estaba ignorada.`
      };
    }

    const now = isoNow();
    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'event',
      status: 'ok',
      message: `Recuperada carrera sTracker ${eventId}. Puede volver a aparecer como pendiente si sigue en sTracker.`,
      createdAt: now
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      storage: this.store.kind,
      generatedAt: now,
      ignoredStrackerSessions: currentIgnored.filter((item) => item.sessionId !== sessionId),
      recalculationLogs: [...baseSnapshot.recalculationLogs, log]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      eventId,
      sessionId,
      recovered: true,
      message: `Recuperada sesiÃ³n sTracker ${sessionId}.`
    };
  }


  async unreviewStrackerSession(input: { sessionId?: number; eventId?: string } = {}) {
    const rawEventId = textValue(input.eventId);
    const sessionId = safeFiniteNumber(input.sessionId, 0) || safeFiniteNumber(rawEventId.replace('stracker:', ''), 0);
    if (!sessionId) throw new Error('sessionId requerido.');

    const eventId = strackerManualEventId(sessionId);
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const currentReviewed = normalizeReviewedStrackerSessions(baseSnapshot);
    const previous = currentReviewed.find((item) => item.sessionId === sessionId) || null;

    if (!previous) {
      return {
        snapshot: baseSnapshot,
        eventId,
        sessionId,
        recovered: false,
        message: `La sesiÃ³n sTracker ${sessionId} no estaba revisada como no puntuable.`
      };
    }

    const now = isoNow();
    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'event',
      status: 'ok',
      message: `Quitada revisiÃ³n no puntuable de ${eventId}. Puede volver a aparecer como pendiente si sigue en sTracker.`,
      createdAt: now
    };

    const snapshot: RatingsSnapshot = {
      ...baseSnapshot,
      storage: this.store.kind,
      generatedAt: now,
      reviewedStrackerSessions: currentReviewed.filter((item) => item.sessionId !== sessionId),
      recalculationLogs: [...baseSnapshot.recalculationLogs, log]
    };

    await this.store.save(snapshot);
    this.cachedSnapshot = snapshot;

    return {
      snapshot,
      eventId,
      sessionId,
      recovered: true,
      message: `Quitada revisiÃ³n no puntuable de la sesiÃ³n ${sessionId}.`
    };
  }

  async autoProcessStrackerSessions(_options: PlainObject = {}) {
    const snapshot = await this.getSnapshot();
    return {
      ok: false,
      source: 'gc-ratings-v1',
      generatedAt: snapshot.generatedAt,
      processed: [],
      skipped: [],
      disabled: true,
      policy: 'manual-only',
      message: 'Auto-proceso sTracker desactivado por diseÃ±o. Las carreras fuera de ACSM se revisan manualmente en /admin/ratings.'
    };
  }


  private async buildDiagnostics(snapshot: RatingsSnapshot, championship?: PlainObject | null) {
    const recentLogs = [...snapshot.recalculationLogs].slice(-20);
    const lastLog = recentLogs[recentLogs.length - 1] || null;
    const lastAutoLog = [...recentLogs].reverse().find((log) => log.mode === 'incremental') || null;
    const unmatched = snapshot.eventResults.filter((row) => row.match.confidence < 0.5).map((row) => ({
      eventId: row.eventId,
      driver: row.displayName,
      confidence: row.match.confidence,
      method: row.match.method,
      bestLapDiffMs: row.match.bestLapDiffMs,
      lapDiff: row.match.lapDiff
    }));

    const events = ensureArray(championship?.events);
    const completed = completedEvents(championship || {});
    const processedIds = [...new Set([...snapshot.processedEventIds, ...snapshot.eventResults.map((row) => row.eventId)])];
    const pendingCompletedEvents = completed
      .filter((event: PlainObject) => !processedIds.includes(String(event.id)))
      .map((event: PlainObject) => ({ id: String(event.id), name: textValue(event.name, `Ronda ${event.index}`) }));

    const nextEvent = (championship?.nextEvent as PlainObject | null) || events.find((event: PlainObject) => {
      const status = String(event?.status || '').toLowerCase();
      return status !== 'completed' && status !== 'cancelled';
    }) || null;
    const lastProcessedEvent = snapshot.eventResults[snapshot.eventResults.length - 1] || null;
    const storeDiagnostics = this.store.diagnostics ? await this.store.diagnostics() : {};
    const ignoredStrackerSessions = normalizeIgnoredStrackerSessions(snapshot);
    const reviewedStrackerSessions = normalizeReviewedStrackerSessions(snapshot);
    const strackerDbPath = resolveStrackerDbPath();
    const hasAcsmPartial = snapshot.eventResults.some((row) => row.match.method.includes('acsm'));
    const hasStracker = snapshot.eventResults.some((row) => !row.match.method.includes('acsm'));
    const srMode = hasStracker ? 'stracker' : hasAcsmPartial ? 'acsm-partial' : 'none';

    let strackerCandidateCount = 0;
    try {
      const candidatesPayload = await this.getStrackerRaceCandidates({ limit: 80, minDrivers: 3, minTotalLaps: 1 });
      strackerCandidateCount = ensureArray(candidatesPayload.candidates).filter((candidate: PlainObject) => !candidate.alreadyProcessed && !candidate.linkedToAcsm && !candidate.ignored && !candidate.reviewed).length;
    } catch {
      strackerCandidateCount = 0;
    }

    return {
      storage: snapshot.storage,
      ...storeDiagnostics,
      mysqlConfigured: Boolean((storeDiagnostics as any).mysqlConfigured),
      mysqlConnected: Boolean((storeDiagnostics as any).mysqlConnected),
      strackerDbPath: strackerDbPath || null,
      strackerAvailable: Boolean(strackerDbPath),
      srMode,
      processedEventIds: processedIds,
      eventsProcessed: processedIds.length,
      pendingEvents: pendingCompletedEvents.length,
      strackerCandidateCount,
      ignoredStrackerSessionCount: ignoredStrackerSessions.length,
      reviewedStrackerSessionCount: reviewedStrackerSessions.length,
      pendingCompletedEvents,
      nextEvent,
      nextEventName: nextEvent ? textValue(nextEvent.name, 'Proxima carrera') : null,
      nextEventTrack: nextEvent ? textValue(nextEvent.track, 'Circuito por confirmar') : null,
      nextEventScheduledAt: nextEvent ? nextEventFallbackIso(nextEvent) || null : null,
      lastProcessedEvent: lastProcessedEvent ? {
        eventId: lastProcessedEvent.eventId,
        eventName: lastProcessedEvent.eventName,
        processedAt: lastProcessedEvent.processedAt
      } : null,
      lastRecalculation: lastLog,
      autoProcessingEnabled: Boolean(process.env.GC_RATINGS_CRON_SECRET),
      acsmAutoProcessingEnabled: true,
      strackerAutoProcessingEnabled: false,
      automationPolicy: {
        acsm: 'automatic-when-completed-with-results',
        stracker: 'manual-only-outside-acsm',
        excluded: ['practice', 'qualy']
      },
      lastAutoProcessAt: lastAutoLog?.createdAt ?? null,
      lastAutoProcessStatus: lastAutoLog?.status ?? null,
      lastAutoProcessMessage: lastAutoLog?.message ?? null,
      canProcessNewEvents: pendingCompletedEvents.length > 0,
      reason: pendingCompletedEvents.length > 0
        ? 'hay eventos ACSM completed pendientes'
        : nextEvent
          ? 'sin eventos ACSM completed pendientes'
          : 'sin proxima carrera',
      unmatchedCount: unmatched.length,
      matchingErrors: unmatched.slice(0, 20)
    };
  }

  async getChampionshipPayload(_force = false) {
    const snapshot = await this.getSnapshot();
    const acsm = await fetchChampionship();
    const championship = enrichChampionship(acsm.championship, snapshot);

    try {
      const candidatesPayload = await this.getStrackerRaceCandidates({ limit: 200, minDrivers: 3, minTotalLaps: 1 });
      const detectedEvents = ensureArray(candidatesPayload.candidates)
        .filter((candidate: PlainObject) => !candidate.alreadyProcessed && !candidate.linkedToAcsm && !candidate.ignored && !candidate.reviewed)
        .map((candidate: PlainObject) => ({
          id: candidate.eventId,
          source: 'stracker-detected',
          status: 'detected',
          name: `Carrera detectada sTracker #${candidate.sessionId}`,
          sessionId: candidate.sessionId,
          strackerSessionId: candidate.sessionId,
          track: candidate.track,
          trackRaw: candidate.trackRaw,
          comboId: candidate.comboId,
          scheduledAt: candidate.startTime,
          completedAt: candidate.lastLapAt,
          startedAt: candidate.startTime,
          bestLap: candidate.bestLap,
          playerCount: candidate.playerCount,
          lapCount: candidate.lapCount,
          maxLapCount: candidate.maxLapCount,
          cuts: candidate.cuts,
          collisionsCar: candidate.collisionsCar,
          collisionsEnv: candidate.collisionsEnv,
          recommended: candidate.recommended,
          ratingEligible: true,
          href: null
        }));

      championship.strackerSeries = {
        ...(championship.strackerSeries || {}),
        detectedEvents,
        stats: {
          ...(championship.strackerSeries?.stats || {}),
          detected: detectedEvents.length
        }
      };
    } catch {
      championship.strackerSeries = {
        ...(championship.strackerSeries || {}),
        detectedEvents: [],
        stats: {
          ...(championship.strackerSeries?.stats || {}),
          detected: 0
        }
      };
    }

    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: snapshot.generatedAt,
      championship,
      leaderboard: buildLeaderboard(snapshot.drivers),
      diagnostics: await this.buildDiagnostics(snapshot, acsm.championship)
    };
  }

  async getDiagnostics() {
    const snapshot = await this.getSnapshot();
    let championship: PlainObject | null = null;
    try {
      const acsm = await fetchChampionship();
      championship = acsm.championship;
    } catch {
      championship = null;
    }
    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: snapshot.generatedAt,
      diagnostics: await this.buildDiagnostics(snapshot, championship)
    };
  }

  async getEvent(eventId: string, options: PlainObject = {}) {
    let normalizedEventId = String(eventId || '');
    try {
      normalizedEventId = decodeURIComponent(normalizedEventId);
    } catch {}

    if (normalizedEventId.startsWith('stracker:')) {
      const snapshot = await this.getSnapshot();
      const mirrorDriver = getStrackerMirrorDriver();
      const ratedEvent = buildStrackerEventFromRatingResults(normalizedEventId, snapshot);
      if (ratedEvent) {
        return {
          ok: true,
          source: 'gc-ratings-v1',
          generatedAt: snapshot.generatedAt,
          eventSource: 'rating-results',
          mirrorDriver,
          ratingEligible: true,
          reviewStatus: null,
          event: ratedEvent,
          diagnostics: { storage: snapshot.storage }
        };
      }

      const sessionId = safeFiniteNumber(normalizedEventId.replace('stracker:', ''), 0);
      const reviewedSessions = normalizeReviewedStrackerSessions(snapshot);
      const reviewedSession = reviewedSessions.find((item) => item.sessionId === sessionId) || null;

      if (sessionId && reviewedSession) {
        const mirrorDetail = await getStrackerSessionDetailFromMirror(sessionId);
        if (mirrorDetail) {
          const event = buildStrackerMirrorEventFromDetail(mirrorDetail, snapshot, {
            eventId: normalizedEventId,
            mirrorDriver: mirrorDetail.mirrorDriver || mirrorDriver
          });
          return {
            ok: true,
            source: 'gc-ratings-v1',
            generatedAt: snapshot.generatedAt,
            eventSource: 'sql-mirror',
            mirrorDriver: mirrorDetail.mirrorDriver || mirrorDriver,
            ratingEligible: false,
            reviewStatus: 'reviewed-unrated',
            event,
            diagnostics: { storage: snapshot.storage }
          };
        }
      }

      if (Boolean(options?.fallback)) {
        try {
          const hydrated = await this.buildManualStrackerEventFromSession(sessionId, {
            eventId: normalizedEventId,
            name: reviewedSession?.name || `Carrera no oficial ${sessionId}`,
            minDrivers: 1
          });
          const reviewEvent = {
            ...hydrated,
            source: 'stracker-reviewed',
            status: reviewedSession?.status || 'reviewed',
            ratingEligible: false,
            reviewStatus: 'reviewed-unrated',
            reviewReason: reviewedSession?.reason || null,
            raceResults: enrichRowsWithCurrentRatings(ensureArray(hydrated.raceResults), snapshot),
            qualifyingResults: [],
            sessions: [
              {
                type: 'RACE',
                key: 'RACE',
                resultCount: ensureArray(hydrated.raceResults).length,
                lapCount: safeFiniteNumber(hydrated.lapCount || hydrated.maxLapCount, 0),
                fastestLap: hydrated.bestLap ? { lapTime: hydrated.bestLap, driverName: '' } : null
              }
            ]
          };

          return {
            ok: true,
            source: 'gc-ratings-v1',
            generatedAt: snapshot.generatedAt,
            eventSource: 'stracker-db3-fallback',
            mirrorDriver,
            ratingEligible: false,
            reviewStatus: 'reviewed-unrated',
            event: reviewEvent,
            diagnostics: { storage: snapshot.storage }
          };
        } catch (error) {
          return {
            ok: false,
            source: 'gc-ratings-v1',
            generatedAt: snapshot.generatedAt,
            eventSource: 'stracker-db3-fallback',
            mirrorDriver,
            ratingEligible: false,
            reviewStatus: reviewedSession?.status || 'reviewed-unrated',
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }

      return {
        ok: false,
        source: 'gc-ratings-v1',
        generatedAt: snapshot.generatedAt,
        eventSource: 'none',
        mirrorDriver,
        ratingEligible: false,
        reviewStatus: reviewedSession?.status || null,
        message: 'Carrera no encontrada en SQL mirror. Ejecuta sync sTracker → SQL.'
      };
    }

    const payload = await this.getChampionshipPayload(false);
    const allEvents = [
      ...ensureArray(payload.championship.events),
      ...ensureArray(payload.championship.strackerSeries?.processedEvents),
      ...ensureArray(payload.championship.strackerSeries?.reviewedEvents)
    ];
    const foundEvent = allEvents.find((item: PlainObject) => String(item.id) === normalizedEventId);
    if (!foundEvent) return null;

    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: payload.generatedAt,
      eventSource: 'rating-results',
      mirrorDriver: getStrackerMirrorDriver(),
      ratingEligible: true,
      reviewStatus: String(foundEvent.source || '') === 'stracker-reviewed' || String(foundEvent.reviewStatus || '') === 'reviewed-unrated'
        ? 'reviewed-unrated'
        : null,
      event: foundEvent,
      diagnostics: payload.diagnostics
    };
  }

  async getDriver(driverKey: string) {
    const snapshot = await this.getSnapshot();
    const driver = snapshot.drivers.find((item) => item.driverKey === driverKey);
    if (!driver) return null;
    const history = snapshot.eventResults
      .filter((row) => row.driverKey === driverKey)
      .sort((left, right) => parseDateMs(right.eventDate || right.processedAt) - parseDateMs(left.eventDate || left.processedAt));
    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: snapshot.generatedAt,
      driver,
      recentRaces: history.slice(0, 5),
      history,
      recentIncidents: history.flatMap((race) => race.incidents.map((incident) => ({ ...incident, eventName: race.eventName }))).slice(0, 25),
      stats: {
        races: driver.racesCount,
        cleanRaces: driver.cleanRaces,
        wins: driver.wins,
        podiums: driver.podiums,
        incidentsPerRace: driver.racesCount ? roundTo(driver.incidentPointsTotal / driver.racesCount) : 0
      }
    };
  }

  async getLeaderboard() {
    const snapshot = await this.getSnapshot();
    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: snapshot.generatedAt,
      leaderboard: buildLeaderboard(snapshot.drivers)
    };
  }

  async resolveDriverProfileByPlayerId(playerId: number) {
    const direct = await this.getDriver(`player:${playerId}`);
    if (direct) return direct;
    const snapshot = await this.getSnapshot();
    const fallback = snapshot.drivers.find((driver) => driver.strackerPlayerId === playerId);
    return fallback ? this.getDriver(fallback.driverKey) : null;
  }
}

let singleton: GcRatingsService | null = null;

export function getGcRatingsService() {
  if (!singleton) singleton = new GcRatingsService();
  return singleton;
}
