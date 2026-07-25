import fs from 'node:fs';
import path from 'node:path';
import { identifyRaceSession, matchOfficialToStracker, officialDriverName } from './acsmMatcher';
import { applyGsrUpdates, initialGsrState } from './gsrModel';
import { createRatingStore } from './ratingStore';
import { buildSrComputation } from './srModel';
import { findRaceSessions, findRatingCandidateRaceSessions, openStrackerDb, readRaceDrivers, readRaceLaps, readRaceSession, resolveStrackerDbPath, verifyStrackerTables } from './strackerReader';
import type { DriverRatingState, PlainObject, RatingEventResult, RatingsSnapshot, RecalculationLog, RatingStrackerSessionReview } from './types';
import { formatLapMs, isoNow, parseDateMs, ratingClassFromGsr, ratingClassFromSr, roundTo, safeFiniteNumber, textValue, uniqueId } from './utils';

/* GC_PHASE2H_RATINGS_ARRAY_TYPES_V1 */
function ratingArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

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


function manualStrackerRatingsEnabled() {
  const raw = String(process.env.GC_ENABLE_MANUAL_STRACKER_RATINGS || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(raw);
}

const MIN_SR_STRACKER_MATCH_CONFIDENCE = safeFiniteNumber(process.env.GC_SR_MIN_STRACKER_MATCH_CONFIDENCE, 0.55);

function protectLowConfidenceStrackerMatch(entry: any) {
  const confidence = safeFiniteNumber(entry?.match?.confidence, 0);
  if (!entry?.stracker || confidence >= MIN_SR_STRACKER_MATCH_CONFIDENCE) return entry;

  return {
    ...entry,
    stracker: null,
    match: {
      ...(entry.match || {}),
      confidence,
      srTelemetryReliable: false,
      rejectedForSr: true,
      rejectedReason: 'low-confidence-stracker-match',
      requiredConfidence: MIN_SR_STRACKER_MATCH_CONFIDENCE,
      note: `Telemetría sTracker no usada para SR: confianza ${Math.round(confidence * 100)}%, mínimo ${Math.round(MIN_SR_STRACKER_MATCH_CONFIDENCE * 100)}%.`
    }
  };
}

function normalizeDriverNameKey(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stableDriverKeyFromParts(input: {
  steamGuid?: string | null;
  strackerPlayerId?: number | null;
  name?: string | null;
}) {
  // Mega Update v109:
  // SteamID/GUID es la identidad primaria. PlayerId es local a sTracker y puede variar.
  const guid = textValue(input.steamGuid);
  if (guid) return `steam:${guid}`;

  const playerId = safeFiniteNumber(input.strackerPlayerId, 0);
  if (playerId > 0) return `player:${playerId}`;

  return `name:${normalizeDriverNameKey(input.name || 'unknown') || 'unknown'}`;
}

function findExistingStateForIdentity(
  states: Map<string, DriverRatingState>,
  input: {
    driverKey: string;
    steamGuid?: string | null;
    strackerPlayerId?: number | null;
    name?: string | null;
  }
) {
  const candidates = [
    input.driverKey,
    textValue(input.steamGuid) ? `steam:${textValue(input.steamGuid)}` : '',
    safeFiniteNumber(input.strackerPlayerId, 0) > 0 ? `player:${safeFiniteNumber(input.strackerPlayerId, 0)}` : '',
    `name:${normalizeDriverNameKey(input.name)}`
  ].filter(Boolean);

  for (const key of candidates) {
    const state = states.get(key);
    if (state) return { key, state };
  }

  return null;
}

function normalizeChampionshipSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return source === 'gt4' ? 'gt4' : 'weekly';
}

/* GC_PHASE4F_STRICT_EVENT_SOURCE_V1 */
type StrictChampionshipSourceV1 = 'weekly' | 'gt4';

function explicitChampionshipSourceV1(value: unknown): StrictChampionshipSourceV1 | null {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return null;
  if (['weekly', 'main', 'liga', 'league', 'grasscutters'].includes(source)) return 'weekly';
  if (['gt4', 'gt-4', 'gt', 'supra', 'supra-gt4'].includes(source)) return 'gt4';
  return null;
}

function withChampionshipSource(url: string, source: string) {
  const clean = String(url || '').trim();
  if (!clean) return clean;
  if (/([?&])source=/i.test(clean)) return clean;
  return `${clean}${clean.includes('?') ? '&' : '?'}source=${encodeURIComponent(source)}`;
}

function acsmUrlCandidates(sourceInput: unknown = 'weekly') {
  const source = normalizeChampionshipSource(sourceInput);
  const explicit = [
    process.env.GC_CHAMPIONSHIP_SOURCE_URL,
    process.env.ACSR_CHAMPIONSHIP_LOCAL_URL
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((url) => withChampionshipSource(url, source));

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
    .map((origin) => `${origin}/api/community/acsr-championship?refresh=1&source=${encodeURIComponent(source)}`);

  const port = process.env.PORT || 3000;
  const local = [
    `http://127.0.0.1:${port}/api/community/acsr-championship?refresh=1&source=${encodeURIComponent(source)}`,
    `http://localhost:${port}/api/community/acsr-championship?refresh=1&source=${encodeURIComponent(source)}`
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

async function fetchChampionship(sourceInput: unknown = 'weekly') {
  const source = normalizeChampionshipSource(sourceInput);
  const errors: string[] = [];
  for (const url of acsmUrlCandidates(source)) {
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
    processedEventKeys: [],
    sourceIsolationVersion: null,
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


type LeaderboardDriverState = DriverRatingState & {
  profilePlayerId?: number | null;
  mergedDriverKeys?: string[];
};

function driverNameIdentityKey(value: unknown) {
  return normalizeDriverNameKey(value) || 'unknown';
}

function driverUpdatedMs(driver: Partial<DriverRatingState>) {
  return Math.max(parseDateMs(driver.updatedAt), parseDateMs(driver.lastRaceAt), parseDateMs(driver.createdAt));
}

function preferredDriverKeyForMergedDrivers(drivers: LeaderboardDriverState[]) {
  const steam = drivers.find((driver) => textValue(driver.driverKey).startsWith('steam:'));
  if (steam) return steam.driverKey;
  const player = drivers.find((driver) => textValue(driver.driverKey).startsWith('player:'));
  if (player) return player.driverKey;
  return drivers[0]?.driverKey || 'name:unknown';
}

function bestDisplayNameForMergedDrivers(drivers: LeaderboardDriverState[]) {
  const sorted = [...drivers].sort((left, right) =>
    driverUpdatedMs(right) - driverUpdatedMs(left) ||
    textValue(right.displayName).length - textValue(left.displayName).length
  );
  return sorted.find((driver) => textValue(driver.displayName))?.displayName || 'Piloto';
}

function latestRatingDriverForMergedDrivers(drivers: LeaderboardDriverState[], rating: 'sr' | 'gsr') {
  return [...drivers]
    .filter((driver) => safeFiniteNumber(rating === 'sr' ? driver.srScore : driver.gsrRating, 0) > 0)
    .sort((left, right) =>
      driverUpdatedMs(right) - driverUpdatedMs(left) ||
      safeFiniteNumber(right.racesCount, 0) - safeFiniteNumber(left.racesCount, 0)
    )[0] || drivers[0];
}

function mergeDriverIdentityGroup(drivers: DriverRatingState[]): LeaderboardDriverState {
  const group = drivers.map((driver) => ({ ...driver })) as LeaderboardDriverState[];
  const newest = [...group].sort((left, right) => driverUpdatedMs(right) - driverUpdatedMs(left))[0] || group[0];
  const srSource = latestRatingDriverForMergedDrivers(group, 'sr');
  const gsrSource = latestRatingDriverForMergedDrivers(group, 'gsr');
  const profilePlayerId = group.find((driver) => safeFiniteNumber(driver.strackerPlayerId, 0) > 0)?.strackerPlayerId ?? null;
  const steamGuid = group.find((driver) => textValue(driver.steamGuid))?.steamGuid ?? null;
  const createdAt = [...group].sort((left, right) => parseDateMs(left.createdAt) - parseDateMs(right.createdAt))[0]?.createdAt || newest.createdAt;

  return {
    ...newest,
    driverKey: preferredDriverKeyForMergedDrivers(group),
    steamGuid,
    strackerPlayerId: profilePlayerId,
    profilePlayerId,
    displayName: bestDisplayNameForMergedDrivers(group),
    srScore: srSource.srScore,
    srClass: srSource.srClass,
    gsrMu: gsrSource.gsrMu,
    gsrSigma: gsrSource.gsrSigma,
    gsrRating: gsrSource.gsrRating,
    gsrClass: gsrSource.gsrClass,
    racesCount: group.reduce((sum, driver) => sum + safeFiniteNumber(driver.racesCount, 0), 0),
    cleanRaces: group.reduce((sum, driver) => sum + safeFiniteNumber(driver.cleanRaces, 0), 0),
    wins: group.reduce((sum, driver) => sum + safeFiniteNumber(driver.wins, 0), 0),
    podiums: group.reduce((sum, driver) => sum + safeFiniteNumber(driver.podiums, 0), 0),
    incidentPointsTotal: roundTo(group.reduce((sum, driver) => sum + safeFiniteNumber(driver.incidentPointsTotal, 0), 0), 2),
    lastDeltaSr: srSource.lastDeltaSr,
    lastDeltaGsr: gsrSource.lastDeltaGsr,
    lastEventId: newest.lastEventId,
    lastRaceAt: newest.lastRaceAt,
    createdAt,
    updatedAt: newest.updatedAt,
    mergedDriverKeys: [...new Set(group.map((driver) => driver.driverKey).filter(Boolean))]
  };
}

function mergeDriversForPublicLeaderboard(drivers: DriverRatingState[]) {
  const buckets = new Map<string, DriverRatingState[]>();
  for (const driver of drivers) {
    const key = `name:${driverNameIdentityKey(driver.displayName)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(driver);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((group) => group.length > 1 ? mergeDriverIdentityGroup(group) : { ...group[0], profilePlayerId: group[0].strackerPlayerId, mergedDriverKeys: [group[0].driverKey] } as LeaderboardDriverState);
}

function buildLeaderboard(drivers: DriverRatingState[]) {
  const publicDrivers = mergeDriversForPublicLeaderboard(drivers);

  const sr = [...publicDrivers]
    .filter((driver) => Number.isFinite(Number(driver.srScore)) && Number(driver.racesCount) > 0)
    .sort((left, right) => right.srScore - left.srScore || left.incidentPointsTotal - right.incidentPointsTotal || left.displayName.localeCompare(right.displayName))
    .map((driver, index) => ({
      position: index + 1,
      driverKey: driver.driverKey,
      profilePlayerId: driver.profilePlayerId ?? driver.strackerPlayerId ?? null,
      mergedDriverKeys: driver.mergedDriverKeys || [driver.driverKey],
      driver: driver.displayName,
      sr: driver.srScore,
      srClass: driver.srClass,
      races: driver.racesCount,
      cleanRaces: driver.cleanRaces,
      incidentsPerRace: driver.racesCount ? roundTo(driver.incidentPointsTotal / driver.racesCount) : 0,
      lastDelta: driver.lastDeltaSr
    }));

  const gsr = [...publicDrivers]
    .filter((driver) => Number.isFinite(Number(driver.gsrRating)) && Number(driver.racesCount) > 0)
    .sort((left, right) => right.gsrRating - left.gsrRating || right.wins - left.wins || left.displayName.localeCompare(right.displayName))
    .map((driver, index) => ({
      position: index + 1,
      driverKey: driver.driverKey,
      profilePlayerId: driver.profilePlayerId ?? driver.strackerPlayerId ?? null,
      mergedDriverKeys: driver.mergedDriverKeys || [driver.driverKey],
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
  return ratingArray(event.sessions).find((session: PlainObject) =>
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
  const rawLaps = ratingArray(race?.laps).filter((lap: PlainObject) => sameDriverLap(lap, result));

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
  return ratingArray(snapshot?.ignoredStrackerSessions)
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
  return ratingArray(snapshot?.reviewedStrackerSessions)
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
        name: textValue(item.name) || null,
        track: textValue(item.track) || null,
        trackRaw: textValue(item.trackRaw) || null,
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
  const track = textValue(session.UiTrackName || session.Track, 'Circuito');
  const rawTrack = textValue(session.Track || session.UiTrackName, track);
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
    car: textValue(sorted[0]?.UiCarName || sorted[0]?.CarFolder, ''),
    strackerSessionId: sessionId,
    manualStrackerSessionId: sessionId,
    raceResults: sorted.map((driver, index) => {
      const laps = safeFiniteNumber(driver.MaxLapCount || driver.LapRows, 0);
      const position = strackerRacePosition(driver, index, maxLaps);
      return {
        position,
        name: textValue(driver.StrackerName, `Piloto ${index + 1}`),
        guid: textValue(driver.StrackerGuid),
        playerId: safeFiniteNumber(driver.PlayerId, 0) || null,
        model: textValue(driver.UiCarName || driver.CarFolder, 'Coche'),
        carModel: textValue(driver.CarFolder || driver.UiCarName, 'Coche'),
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
      name: first?.eventName || `Carrera sTracker ${sessionId || ''}`.trim(),
      index: existingEvents.length + index + 1,
      scheduledAt: first?.eventDate || first?.processedAt || null,
      completedAt: first?.eventDate || first?.processedAt || null,
      startedAt: first?.eventDate || first?.processedAt || null,
      track: first?.eventName?.split('·').pop()?.trim() || 'sTracker',
      trackRaw: first?.eventName?.split('·').pop()?.trim() || 'sTracker',
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
      name: review.name || `Carrera de comunidad ${review.sessionId}`,
      index: existingEvents.length + index + 1,
      scheduledAt: review.startTime || review.endTime || review.updatedAt || null,
      completedAt: review.endTime || review.startTime || review.updatedAt || null,
      startedAt: review.startTime || review.updatedAt || null,
      track: review.track || review.trackRaw || 'Carrera no oficial',
      trackRaw: review.trackRaw || review.track || 'Carrera no oficial',
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

type ProcessingContext = {
  srMode: 'stracker' | 'acsm-partial' | 'none';
  strackerAvailable: boolean;
  strackerDbPath: string | null;
  warningLogs: RecalculationLog[];
  sessions: PlainObject[];
  db: any;
};

async function createProcessingContext(eventsCount: number, mode: 'incremental' | 'rebuild', sourceInput: unknown = 'weekly') {
  const warningLogs: RecalculationLog[] = [];
  const source = normalizeChampionshipSource(sourceInput);
  const strackerDbPath = resolveStrackerDbPath(source === 'gt4' ? 'gt4' : 'main');
  if (!strackerDbPath) {
    warningLogs.push({
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode,
      status: 'error',
      message: `STRacker ${source === 'gt4' ? 'GT4' : 'main'} no configurado, usando fallback ACSM con datos parciales para SR.`,
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
      message: `STRacker ${source === 'gt4' ? 'GT4' : 'main'} no disponible, usando fallback ACSM: ${error instanceof Error ? error.message : String(error)}`,
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

/* GC_PHASE4A_RATINGS_INTEGRITY_GUARD_V1 */
function ratingResultFingerprintV1(row: RatingEventResult) {
  const explicitIdentity = textValue(row.resultIdentityKey);
  if (explicitIdentity) return `${ratingEventScopeKeyV1(row.sourceKey, row.eventId)}:${explicitIdentity}`;

  const eventId = ratingEventScopeKeyV1(row.sourceKey, textValue(row.eventId, 'unknown-event'));
  const position = safeFiniteNumber(row.position, 0);
  const name = normalizeDriverNameKey(row.displayName || row.driverKey || 'unknown');

  // Dentro de una misma carrera no puede existir dos veces la misma combinación
  // posición + nombre. Esta firma permite unir identidades antiguas name:/player:
  // con la identidad Steam más reciente sin mezclar pilotos de posiciones distintas.
  if (position > 0 && name) return `${eventId}|position:${position}|name:${name}`;

  const steamGuid = textValue(row.steamGuid);
  if (steamGuid) return `${eventId}|steam:${steamGuid}`;

  const playerId = safeFiniteNumber(row.strackerPlayerId, 0);
  if (playerId > 0) return `${eventId}|player:${playerId}`;

  return `${eventId}|driver:${textValue(row.driverKey, `name:${name || 'unknown'}`)}`;
}

function ratingResultIdentityStrengthV1(row: RatingEventResult) {
  if (textValue(row.steamGuid) || textValue(row.driverKey).startsWith('steam:')) return 3;
  if (safeFiniteNumber(row.strackerPlayerId, 0) > 0 || textValue(row.driverKey).startsWith('player:')) return 2;
  return 1;
}

function ratingResultQualityCompareV1(left: RatingEventResult, right: RatingEventResult) {
  // Phase 4B: primero calidad de identidad/telemetría. Si las dos filas son
  // equivalentes, conservamos la primera aplicación cronológica, no el reprocesado.
  const identityDiff = ratingResultIdentityStrengthV1(right) - ratingResultIdentityStrengthV1(left);
  if (identityDiff) return identityDiff;

  const confidenceDiff = safeFiniteNumber(right.match?.confidence, 0) - safeFiniteNumber(left.match?.confidence, 0);
  if (confidenceDiff) return confidenceDiff;

  const telemetryDiff =
    Number(Boolean(right.strackerSessionId && right.strackerPlayerId)) -
    Number(Boolean(left.strackerSessionId && left.strackerPlayerId));
  if (telemetryDiff) return telemetryDiff;

  const rightFallback = textValue(right.match?.method).includes('fallback') ? 1 : 0;
  const leftFallback = textValue(left.match?.method).includes('fallback') ? 1 : 0;
  if (rightFallback !== leftFallback) return leftFallback - rightFallback;

  const detailDiff = ratingArray(right.lapsDetail).length - ratingArray(left.lapsDetail).length;
  if (detailDiff) return detailDiff;

  const dateDiff = parseDateMs(left.processedAt || left.eventDate) - parseDateMs(right.processedAt || right.eventDate);
  if (dateDiff) return dateDiff;

  return textValue(left.id).localeCompare(textValue(right.id));
}

function dedupeRatingEventResultsV1(rows: RatingEventResult[]) {
  const buckets = new Map<string, RatingEventResult[]>();
  for (const row of ratingArray<RatingEventResult>(rows)) {
    const key = ratingResultFingerprintV1(row);
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => [...bucket].sort(ratingResultQualityCompareV1)[0])
    .filter(Boolean)
    .sort((left, right) =>
      parseDateMs(left.eventDate || left.processedAt) - parseDateMs(right.eventDate || right.processedAt) ||
      safeFiniteNumber(left.position, 9999) - safeFiniteNumber(right.position, 9999) ||
      textValue(left.displayName).localeCompare(textValue(right.displayName))
    );
}

function buildRatingDuplicateAuditV1(rows: RatingEventResult[]) {
  const buckets = new Map<string, RatingEventResult[]>();
  for (const row of ratingArray<RatingEventResult>(rows)) {
    const key = ratingResultFingerprintV1(row);
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const duplicates = [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([fingerprint, bucket]) => ({
      fingerprint,
      eventId: textValue(bucket[0]?.eventId),
      eventName: textValue(bucket[0]?.eventName, 'Carrera'),
      displayName: textValue(bucket[0]?.displayName, 'Piloto'),
      position: safeFiniteNumber(bucket[0]?.position, 0) || null,
      rows: bucket.length,
      keptId: [...bucket].sort(ratingResultQualityCompareV1)[0]?.id || null,
      records: [...bucket]
        .sort(ratingResultQualityCompareV1)
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          driverKey: row.driverKey,
          steamGuid: row.steamGuid || null,
          strackerPlayerId: row.strackerPlayerId || null,
          processedAt: row.processedAt || null,
          sr: row.newSr,
          gsr: row.newGsr,
          matchConfidence: safeFiniteNumber(row.match?.confidence, 0),
          matchMethod: textValue(row.match?.method) || null
        }))
    }))
    .sort((left, right) => right.rows - left.rows || left.eventName.localeCompare(right.eventName));

  const uniqueRows = dedupeRatingEventResultsV1(rows);
  return {
    version: 'gc-phase4a-ratings-integrity-v1',
    runtimeGuardActive: true,
    destructiveCleanupApplied: false,
    totalStoredRows: ratingArray(rows).length,
    uniqueRuntimeRows: uniqueRows.length,
    suppressedRuntimeRows: Math.max(0, ratingArray(rows).length - uniqueRows.length),
    duplicateGroups: duplicates.length,
    affectedEvents: [...new Set(duplicates.map((item) => item.eventId).filter(Boolean))],
    affectedDrivers: [...new Set(duplicates.map((item) => item.displayName).filter(Boolean))],
    examples: duplicates.slice(0, 20)
  };
}

function buildRuntimeIntegritySnapshotV1(snapshot: RatingsSnapshot) {
  const eventResults = dedupeRatingEventResultsV1(snapshot.eventResults);
  if (eventResults.length === snapshot.eventResults.length) return snapshot;

  return {
    ...snapshot,
    eventResults,
    // Recalcula solo la vista en memoria. No borra ni reescribe filas de MySQL/JSON.
    drivers: rebuildDriversFromEventResults(eventResults, snapshot.drivers)
  };
}

/* GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1 */
const GC_PHASE4B_CLEANUP_LOG_MARKER_V1 = 'GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1';

function phase4bIntegrityConfirmationV1(duplicateGroups: number) {
  return `RECONSTRUIR_${Math.max(0, Math.round(duplicateGroups))}_DUPLICADOS`;
}

function phase4bOfficialEventDateV1(event: PlainObject) {
  return parseDateMs(event?.completedAt || event?.scheduledAt || event?.date || event?.rawDate);
}

function phase4bBackupFileV1(snapshot: RatingsSnapshot, plan: PlainObject) {
  const directory = path.join(process.cwd(), 'data', 'gc-ratings', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `phase4b-before-canonical-rebuild-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    version: GC_PHASE4B_CLEANUP_LOG_MARKER_V1,
    createdAt: isoNow(),
    plan,
    snapshot
  }, null, 2) + '\n', 'utf8');
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

/* GC_PHASE4D_SOURCE_ISOLATION_V1 */
const GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1 = 'GC_PHASE4D_SOURCE_ISOLATION_V1';

type RatingSourceKeyV1 = 'weekly' | 'gt4' | 'stracker-manual' | 'unknown';

function normalizeRatingSourceKeyV1(value: unknown): RatingSourceKeyV1 {
  const source = String(value || '').trim().toLowerCase();
  if (['gt4', 'supra', 'server2', '2'].includes(source)) return 'gt4';
  if (['weekly', 'main', 'liga', 'server1', '1'].includes(source)) return 'weekly';
  if (['stracker-manual', 'stracker', 'manual'].includes(source)) return 'stracker-manual';
  return 'unknown';
}

function ratingResultIdentityKeyV1(row: Partial<RatingEventResult> & PlainObject) {
  const explicit = textValue(row.resultIdentityKey);
  if (explicit) return explicit;

  const steamGuid = textValue(row.steamGuid);
  if (steamGuid) return `steam:${steamGuid}`;

  const playerId = safeFiniteNumber(row.strackerPlayerId, 0);
  if (playerId > 0) return `player:${playerId}`;

  const driverKey = textValue(row.driverKey);
  if (driverKey) return driverKey;

  return `name:${normalizeDriverNameKey(row.displayName || 'unknown') || 'unknown'}`;
}

function ratingEventScopeKeyV1(sourceKey: unknown, eventId: unknown) {
  return `${normalizeRatingSourceKeyV1(sourceKey)}:${textValue(eventId, 'unknown-event')}`;
}

function ratingResultScopeIdentityV1(row: Partial<RatingEventResult> & PlainObject) {
  return `${ratingEventScopeKeyV1(row.sourceKey, row.eventId)}:${ratingResultIdentityKeyV1(row)}`;
}

function applyRatingResultSourceV1(
  row: RatingEventResult,
  input: {
    sourceKey: RatingSourceKeyV1;
    championshipId?: string | null;
    championshipName?: string | null;
  }
): RatingEventResult {
  const sourceKey = normalizeRatingSourceKeyV1(input.sourceKey);
  const eventId = textValue(row.eventId, 'unknown-event');
  return {
    ...row,
    sourceKey,
    championshipId: sourceKey === 'stracker-manual' ? null : textValue(input.championshipId) || null,
    championshipName: sourceKey === 'stracker-manual' ? null : textValue(input.championshipName) || null,
    resultIdentityKey: ratingResultIdentityKeyV1(row),
    eventScopeKey: ratingEventScopeKeyV1(sourceKey, eventId)
  };
}

function buildRatingSourceIsolationAuditV1(snapshot: RatingsSnapshot) {
  const rows = ratingArray<RatingEventResult>(snapshot.eventResults);
  const sourceCounts: Record<string, number> = {
    weekly: 0,
    gt4: 0,
    'stracker-manual': 0,
    unknown: 0
  };
  const unknownOfficialRows: PlainObject[] = [];
  const missingIdentityRows: PlainObject[] = [];
  const groups = new Map<string, RatingEventResult[]>();

  for (const row of rows) {
    const sourceKey = normalizeRatingSourceKeyV1(row.sourceKey);
    sourceCounts[sourceKey] = (sourceCounts[sourceKey] || 0) + 1;
    const manual = String(row.eventId || '').startsWith('stracker:');
    const identityKey = textValue(row.resultIdentityKey) || ratingResultIdentityKeyV1(row);

    if (!manual && (
      sourceKey === 'unknown' ||
      !textValue(row.championshipId) ||
      !textValue(row.championshipName)
    )) {
      unknownOfficialRows.push({
        id: row.id,
        eventId: row.eventId,
        eventName: row.eventName,
        displayName: row.displayName,
        sourceKey,
        championshipId: row.championshipId || null
      });
    }

    if (!identityKey) {
      missingIdentityRows.push({
        id: row.id,
        eventId: row.eventId,
        displayName: row.displayName
      });
      continue;
    }

    const key = `${ratingEventScopeKeyV1(sourceKey, row.eventId)}:${identityKey}`;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const duplicateIdentityGroups = [...groups.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({
      key,
      rows: bucket.length,
      eventId: bucket[0]?.eventId || null,
      eventName: bucket[0]?.eventName || null,
      displayName: bucket[0]?.displayName || null,
      ids: bucket.map((row) => row.id)
    }));

  const migrationLog = ratingArray<RecalculationLog>(snapshot.recalculationLogs)
    .find((log) => textValue(log.message).includes(GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1)) || null;

  const ready =
    rows.length === 0 ||
    (
      unknownOfficialRows.length === 0 &&
      missingIdentityRows.length === 0 &&
      duplicateIdentityGroups.length === 0
    );

  return {
    version: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
    ready,
    applied: Boolean(migrationLog),
    totalRows: rows.length,
    sourceCounts,
    unknownOfficialRows: unknownOfficialRows.length,
    missingIdentityRows: missingIdentityRows.length,
    duplicateIdentityGroups: duplicateIdentityGroups.length,
    processedEventKeys: [...new Set(rows.map((row) =>
      ratingEventScopeKeyV1(row.sourceKey, row.eventId)
    ))].length,
    constraintsExpected: ready && rows.length > 0,
    examples: {
      unknownOfficialRows: unknownOfficialRows.slice(0, 20),
      missingIdentityRows: missingIdentityRows.slice(0, 20),
      duplicateIdentityGroups: duplicateIdentityGroups.slice(0, 20)
    },
    migratedAt: migrationLog?.createdAt || null
  };
}

async function buildRatingSourceCatalogV1() {
  const sources = ['weekly', 'gt4'] as const;
  const eventMap = new Map<string, {
    sourceKey: 'weekly' | 'gt4';
    championshipId: string;
    championshipName: string;
    eventId: string;
    eventName: string;
  }>();
  const sourceSummaries: PlainObject[] = [];
  const collisions: PlainObject[] = [];

  for (const sourceKey of sources) {
    const acsm = await fetchChampionship(sourceKey);
    const championship = acsm.championship || {};
    const championshipId = textValue(championship.id, 'unknown');
    const championshipName = textValue(
      championship.name,
      sourceKey === 'gt4' ? 'GC Toyota Supra GT4' : 'Liga GrassCutters'
    );
    const events = ratingArray<PlainObject>(championship.events);

    sourceSummaries.push({
      sourceKey,
      championshipId,
      championshipName,
      events: events.length,
      completedEvents: completedEvents(championship).length
    });

    for (const event of events) {
      const eventId = textValue(event.id);
      if (!eventId) continue;
      const previous = eventMap.get(eventId);
      if (previous && previous.sourceKey !== sourceKey) {
        collisions.push({
          eventId,
          sources: [previous.sourceKey, sourceKey],
          championshipIds: [previous.championshipId, championshipId]
        });
        continue;
      }
      eventMap.set(eventId, {
        sourceKey,
        championshipId,
        championshipName,
        eventId,
        eventName: textValue(event.name, `Evento ${eventId}`)
      });
    }
  }

  return { eventMap, sourceSummaries, collisions };
}

async function buildRatingSourceIsolationPlanV1(snapshot: RatingsSnapshot) {
  const catalog = await buildRatingSourceCatalogV1();
  const missingEventIds = new Set<string>();
  const candidateResults = ratingArray<RatingEventResult>(snapshot.eventResults).map((row) => {
    const eventId = textValue(row.eventId);
    if (eventId.startsWith('stracker:')) {
      return applyRatingResultSourceV1(row, {
        sourceKey: 'stracker-manual',
        championshipId: null,
        championshipName: null
      });
    }

    const sourceMeta = catalog.eventMap.get(eventId);
    if (!sourceMeta) {
      missingEventIds.add(eventId);
      return applyRatingResultSourceV1(row, {
        sourceKey: normalizeRatingSourceKeyV1(row.sourceKey),
        championshipId: row.championshipId || null,
        championshipName: row.championshipName || null
      });
    }

    return applyRatingResultSourceV1(row, sourceMeta);
  });

  const candidate: RatingsSnapshot = {
    ...snapshot,
    championshipId: 'gc-multi-source',
    championshipName: 'GrassCutters Ratings · Liga + GT4',
    processedEventIds: [...new Set(candidateResults.map((row) => row.eventId).filter(Boolean))],
    processedEventKeys: [...new Set(candidateResults.map((row) =>
      ratingEventScopeKeyV1(row.sourceKey, row.eventId)
    ))],
    eventResults: candidateResults,
    sourceIsolationVersion: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1
  };

  const before = buildRatingSourceIsolationAuditV1(snapshot);
  const after = buildRatingSourceIsolationAuditV1(candidate);
  const safeToApply =
    candidateResults.length > 0 &&
    catalog.collisions.length === 0 &&
    missingEventIds.size === 0 &&
    after.unknownOfficialRows === 0 &&
    after.missingIdentityRows === 0 &&
    after.duplicateIdentityGroups === 0;

  return {
    snapshot,
    candidate,
    before,
    after,
    sourceSummaries: catalog.sourceSummaries,
    sourceCollisions: catalog.collisions,
    missingEventIds: [...missingEventIds],
    safeToApply,
    confirmationRequired: `AISLAR_${candidateResults.length}_RESULTADOS`
  };
}

function phase4dBackupFileV1(snapshot: RatingsSnapshot, plan: PlainObject) {
  const directory = path.join(process.cwd(), 'data', 'gc-ratings', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `phase4d-before-source-isolation-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    version: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
    createdAt: isoNow(),
    plan,
    snapshot
  }, null, 2) + '\n', 'utf8');
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

/* GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1 */
const GC_PHASE4D2_GLOBAL_PROCESSING_MARKER_V1 = 'GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1';

type Phase4d2SourceKey = 'weekly' | 'gt4';

type Phase4d2PendingEvent = {
  sourceKey: Phase4d2SourceKey;
  championshipId: string;
  championshipName: string;
  event: PlainObject;
  eventId: string;
  eventName: string;
  eventDate: number;
  eventDateIso: string | null;
  eventScopeKey: string;
};

function phase4d2EventDateV1(event: PlainObject) {
  return parseDateMs(event?.completedAt || event?.scheduledAt || event?.date || event?.rawDate);
}

function phase4d2PlanTokenV1(items: Phase4d2PendingEvent[]) {
  const input = items
    .map((item) => `${item.eventScopeKey}@${item.eventDate || 0}`)
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function phase4d2BackupFileV1(snapshot: RatingsSnapshot, plan: PlainObject) {
  const directory = path.join(process.cwd(), 'data', 'gc-ratings', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `phase4d2-before-global-processing-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    version: GC_PHASE4D2_GLOBAL_PROCESSING_MARKER_V1,
    createdAt: isoNow(),
    plan,
    snapshot
  }, null, 2) + '\n', 'utf8');
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {
  // GC_CHAMPIONSHIP_RATING_MERGE_V20
  // /ratings muestra SR/GSR con identidades fusionadas por nombre público.
  // /campeonato no debe leer un driver raw antiguo si existe una identidad fusionada
  // más reciente: eso hacía que puntos ACSM se actualizaran pero SR/GSR quedaran viejos.
  const runtimeSnapshot = buildRuntimeIntegritySnapshotV1(snapshot);
  const publicRatingDrivers = mergeDriversForPublicLeaderboard(runtimeSnapshot.drivers);
  const driverMap = new Map<string, LeaderboardDriverState>();

  function rememberDriverAlias(key: unknown, driver: LeaderboardDriverState) {
    const alias = textValue(key);
    if (!alias) return;
    const previous = driverMap.get(alias);
    if (!previous || driverUpdatedMs(driver) > driverUpdatedMs(previous) || safeFiniteNumber(driver.racesCount, 0) > safeFiniteNumber(previous.racesCount, 0)) {
      driverMap.set(alias, driver);
    }
  }

  for (const driver of publicRatingDrivers) {
    rememberDriverAlias(driver.driverKey, driver);
    for (const mergedKey of driver.mergedDriverKeys || []) rememberDriverAlias(mergedKey, driver);
    if (driver.strackerPlayerId) rememberDriverAlias(`player:${driver.strackerPlayerId}`, driver);
    if (driver.profilePlayerId) rememberDriverAlias(`player:${driver.profilePlayerId}`, driver);
    if (driver.steamGuid) rememberDriverAlias(`steam:${driver.steamGuid}`, driver);
    rememberDriverAlias(`name:${driverNameIdentityKey(driver.displayName)}`, driver);
  }

  const resultsByEvent = new Map<string, RatingEventResult[]>();
  const championshipEvents = ratingArray(championship.events);
  const championshipEventIds = new Set(championshipEvents.map((event: PlainObject) => String(event.id)).filter(Boolean));
  const lastOfficialResultByDriver = new Map<string, RatingEventResult>();
  const officialResultsByDriver = new Map<string, RatingEventResult[]>();

  runtimeSnapshot.eventResults.forEach((result) => {
    const bucket = resultsByEvent.get(result.eventId) || [];
    bucket.push(result);
    resultsByEvent.set(result.eventId, bucket);

    // La clasificación de /campeonato es ACSM-only: las carreras manuales sTracker
    // quedan fuera del campeonato oficial. En v125 no deben alterar SR/GSR salvo
    // activación explícita para pruebas controladas.
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
      const hit = driverMap.get(key);
      if (hit) return hit;
    }
    return null;
  }

  function ratingIdentityKeys(driver: LeaderboardDriverState | null) {
    if (!driver) return [];
    return [...new Set([driver.driverKey, ...(driver.mergedDriverKeys || [])].filter(Boolean).map(String))];
  }

  function officialResultsForRating(driver: LeaderboardDriverState | null) {
    const out: RatingEventResult[] = [];
    for (const key of ratingIdentityKeys(driver)) out.push(...(officialResultsByDriver.get(key) || []));
    return out.sort((left, right) => (parseDateMs(right.eventDate || right.processedAt) - parseDateMs(left.eventDate || left.processedAt)) || left.position - right.position);
  }

  function lastOfficialResultForRating(driver: LeaderboardDriverState | null) {
    return officialResultsForRating(driver)[0] || null;
  }

  const standings = ratingArray(championship.standings).map((row: PlainObject) => {
    const rating = findDriverForStanding(row);
    const officialResults = officialResultsForRating(rating);
    const ratingLastResult = lastOfficialResultForRating(rating);
    const acsmLastResult = row.lastResult || null;
    const ratingLastMs = parseDateMs(ratingLastResult?.eventDate || ratingLastResult?.processedAt);
    const acsmLastMs = parseDateMs(acsmLastResult?.eventDate || acsmLastResult?.completedAt);
    const lastResult = acsmLastResult && (!ratingLastResult || acsmLastMs >= ratingLastMs)
      ? acsmLastResult
      : ratingLastResult || acsmLastResult || null;

    // La clasificación del campeonato es ACSM-only. No sobrescribimos victorias
    // o podios actuales con un snapshot de ratings que todavía no ha procesado
    // la última carrera.
    const officialWins = row.wins ?? null;
    const officialPodiums = row.podiums ?? null;
    const officialIncidentPoints = officialResults.length
      ? roundTo(officialResults.reduce((sum, result) => sum + Number(result.incidentPoints || 0), 0))
      : null;

    return {
      ...row,
      classificationSource: 'acsm',
      ratingDisplayScope: 'global-reference',
      driverKey: rating?.driverKey ?? row.driverKey ?? null,
      hasPersistentRating: Boolean(rating && rating.racesCount > 0),
      srScore: rating?.racesCount ? rating.srScore : null,
      srClass: rating?.racesCount ? rating.srClass : null,
      gsrRating: rating?.racesCount ? rating.gsrRating : null,
      gsrClass: rating?.racesCount ? rating.gsrClass : null,
      incidentPointsTotal: officialIncidentPoints ?? row.incidentPointsTotal ?? row.incidents ?? 0,
      wins: officialWins ?? row.wins ?? 0,
      podiums: officialPodiums ?? row.podiums ?? 0,
      lastResult: lastResult ? {
        eventId: lastResult.eventId,
        eventName: lastResult.eventName || acsmLastResult?.eventName || acsmLastResult?.eventId || 'Última carrera ACSM',
        position: lastResult.position,
        points: lastResult.points
      } : null,
      safetyRating: rating?.racesCount ? { score: rating.srScore, class: rating.srClass } : null
    };
  });

  // GC_GT4_ROUND_PERSISTENT_RATING_MERGE_V17
  // Algunas rondas GT4 llegan correctamente desde ACSM con raceResults, pero todavía no
  // tienen filas eventResults propias en el snapshot de ratings. En ese caso no debemos
  // enseñar B 80 / Rookie 1500 ni dejar SR/GSR vacíos si el piloto ya tiene rating
  // persistente global. Fusionamos por Steam GUID / PlayerId / nombre usando el mismo
  // driverMap que standings. El delta queda vacío porque no corresponde necesariamente
  // a esta carrera concreta.
  function enrichOfficialRaceResultsWithPersistentRatings(rows: PlainObject[]) {
    return rows.map((row: PlainObject) => {
      const rating = findDriverForStanding(row);
      if (!rating || safeFiniteNumber(rating.racesCount, 0) <= 0) return row;

      return {
        ...row,
        driverKey: rating.driverKey ?? row.driverKey ?? null,
        guid: row.guid || row.steamGuid || rating.steamGuid || null,
        steamGuid: row.steamGuid || row.guid || rating.steamGuid || null,
        playerId: row.playerId ?? row.strackerPlayerId ?? rating.strackerPlayerId ?? rating.profilePlayerId ?? null,
        strackerPlayerId: row.strackerPlayerId ?? row.playerId ?? rating.strackerPlayerId ?? rating.profilePlayerId ?? null,
        srScore: rating.srScore,
        srClass: rating.srClass,
        gsrRating: rating.gsrRating,
        gsrClass: rating.gsrClass,
        srDelta: row.srDelta ?? row.deltaSr ?? null,
        gsrDelta: row.gsrDelta ?? row.deltaGsr ?? null,
        ratingDisplayScope: 'global-reference',
        ratingMergeSource: 'persistent-driver-v17',
        hasPersistentRating: true,
        safetyRating: {
          ...(row.safetyRating || {}),
          score: rating.srScore,
          class: rating.srClass,
          delta: row.srDelta ?? row.deltaSr ?? null,
          source: 'persistent-driver-v17'
        }
      };
    });
  }

  const enrichEvent = (event: PlainObject) => {
    const eventResults = (resultsByEvent.get(String(event.id)) || []).sort((left, right) => left.position - right.position);
    const officialRaceResults = ratingArray(event.raceResults);
    const fallbackRaceResults = enrichOfficialRaceResultsWithPersistentRatings(officialRaceResults);
    return {
      ...event,
      source: event.source || (String(event.id || '').startsWith('stracker:') ? 'stracker-manual' : 'acsm'),
      raceResults: eventResults.length ? eventResults.map((result) => {
        const official = officialRaceResults.find((row: PlainObject) =>
          safeFiniteNumber(row.position, 0) === result.position ||
          textValue(row.guid) === textValue(result.steamGuid) ||
          textValue(row.name).toLowerCase() === textValue(result.displayName).toLowerCase()
        ) || {};
        const ratingNotes = ratingArray(result.notes).map((item) => String(item));
        const srExplanationNotes = ratingNotes
          .filter((item) =>
            item.startsWith('Tiempo en pista') ||
            item.startsWith('Tiempo limpio') ||
            item.startsWith('Vueltas limpias') ||
            item.startsWith('Racha limpia') ||
            item.startsWith('Bonus por conducción limpia') ||
            item.startsWith('Penalizaciones') ||
            item.startsWith('Salidas/cuts') ||
            item.startsWith('Golpes con coche') ||
            item.startsWith('Golpes con entorno') ||
            item.startsWith('Carrera no completada') ||
            item.startsWith('Descalificación') ||
            item.startsWith('Sanción oficial') ||
            item.startsWith('Resultado SR')
          )
          .filter((item) =>
            !item.includes('gc-sr-v2') &&
            !item.includes('gc-ratings-v1') &&
            !item.startsWith('Cap ') &&
            !item.startsWith('Estado:')
          );
        const srModelNote = '';
        return {
          ...official,
          position: result.position,
          name: result.displayName,
          guid: result.steamGuid,
          model: result.car,
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
          gsrExplanation: ratingNotes[0] || '',
          safetyRating: {
            score: result.newSr,
            class: ratingClassFromSr(result.newSr),
            delta: result.deltaSr,
            eventScore: result.newSr,
            severity: result.incidentPoints,
            offTracks: result.lapsDetail.reduce((sum, lap) => sum + lap.cuts, 0),
            collisionsCar: result.lapsDetail.reduce((sum, lap) => sum + lap.collisionsCar, 0),
            collisionsEnv: result.lapsDetail.reduce((sum, lap) => sum + lap.collisionsEnv, 0),
            collisionDiagnostics: Number.isFinite(Number(result.rawCollisionCount)) && Number.isFinite(Number(result.collisionClusterCount))
              ? {
                  rawCollisionCount: Number(result.rawCollisionCount),
                  collisionClusterCount: Number(result.collisionClusterCount),
                  suppressedCollisionCount: Number.isFinite(Number(result.suppressedCollisionCount)) ? Number(result.suppressedCollisionCount) : null,
                  clusterWindowSeconds: Number.isFinite(Number(result.clusterWindowSeconds)) ? Number(result.clusterWindowSeconds) : null
                }
              : null,
            source: result.match.method.includes('acsm') ? 'acsm' : 'stracker.db3',
            model: srModelNote,
            penalties: {
              summary: srExplanationNotes.length ? srExplanationNotes : result.incidents.map((incident) => incident.description)
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
      }) : fallbackRaceResults
    };
  };

  const events = championshipEvents
    .map(enrichEvent)
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(left.scheduledAt || left.completedAt) - parseDateMs(right.scheduledAt || right.completedAt));

  const processedStrackerEvents = manualEventsFromSnapshot(runtimeSnapshot, championshipEvents)
    .map(enrichEvent)
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(right.completedAt || right.scheduledAt) - parseDateMs(left.completedAt || left.scheduledAt));

  const reviewedStrackerEvents = reviewedEventsFromSnapshot(runtimeSnapshot, [...championshipEvents, ...processedStrackerEvents])
    .sort((left: PlainObject, right: PlainObject) => parseDateMs(right.completedAt || right.scheduledAt) - parseDateMs(left.completedAt || left.scheduledAt));

  const strackerSeries: PlainObject = {
    id: 'gc-stracker-community',
    name: 'Carreras sTracker',
    type: 'stracker_series',
    description: 'Carreras detectadas desde sTracker fuera de ACSM. En v125 se revisan como no puntuables por defecto y nunca alteran la clasificación ACSM.',
    sharedRatings: true,
    processedEvents: processedStrackerEvents,
    reviewedEvents: reviewedStrackerEvents,
    detectedEvents: [],
    stats: {
      processed: processedStrackerEvents.length,
      reviewed: reviewedStrackerEvents.length,
      drivers: [...new Set(processedStrackerEvents.flatMap((event: PlainObject) => ratingArray(event.raceResults).map((row: PlainObject) => textValue(row.name))))].filter(Boolean).length
    }
  };

  return { ...championship, standings, events, strackerSeries };
}



function orderRowsForGsr(rows: any[]) {
  return [...rows].sort((left, right) => {
    const leftPosition = safeFiniteNumber(left.position, 9999);
    const rightPosition = safeFiniteNumber(right.position, 9999);
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;

    const lapDiff = safeFiniteNumber(right.laps, 0) - safeFiniteNumber(left.laps, 0);
    if (lapDiff) return lapDiff;

    const timeDiff = safeFiniteNumber(left.totalTimeMs, 0) - safeFiniteNumber(right.totalTimeMs, 0);
    if (timeDiff) return timeDiff;

    const bestLapDiff = safeFiniteNumber(left.bestLapMs, 0) - safeFiniteNumber(right.bestLapMs, 0);
    if (bestLapDiff) return bestLapDiff;

    return String(left.displayName || '').localeCompare(String(right.displayName || ''));
  });
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
    current.displayName = result.displayName || current.displayName;
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

type OfficialAcsmRecalculationTarget = {
  event: PlainObject;
  eventId: string;
  eventName: string;
  track: string;
  eventDate: string | null;
  order: number;
  hasRatingApplied: boolean;
  hasStrackerSource: boolean;
  strackerSessionId: number | null;
  existingRows: RatingEventResult[];
};

function buildOfficialAcsmRecalculationTargets(snapshot: RatingsSnapshot, championship: PlainObject) {
  const completed = completedEvents(championship || {});
  const resultsByEvent = new Map<string, RatingEventResult[]>();

  snapshot.eventResults.forEach((result) => {
    const eventId = String(result.eventId || '');
    if (!eventId) return;
    const bucket = resultsByEvent.get(eventId) || [];
    bucket.push(result);
    resultsByEvent.set(eventId, bucket);
  });

  return completed
    .map((event, index): OfficialAcsmRecalculationTarget => {
      const eventId = String(event?.id || '');
      const existingRows = resultsByEvent.get(eventId) || [];
      const strackerSessionId = existingRows.reduce((max, row) => Math.max(max, safeFiniteNumber(row.strackerSessionId, 0)), 0) || null;
      return {
        event,
        eventId,
        eventName: textValue(event?.name, `Ronda ${event?.index ?? index + 1}`),
        track: textValue(event?.track || event?.trackRaw || event?.name, 'Circuito'),
        eventDate: textValue(event?.completedAt || event?.scheduledAt || event?.date) || null,
        order: index + 1,
        hasRatingApplied: existingRows.length > 0,
        hasStrackerSource: Boolean(resolveStrackerDbPath()) && Boolean(strackerSessionId),
        strackerSessionId,
        existingRows
      };
    })
    .filter((target) => target.hasRatingApplied)
    .sort((left, right) =>
      parseDateMs(left.eventDate || left.event?.completedAt || left.event?.scheduledAt) -
      parseDateMs(right.eventDate || right.event?.completedAt || right.event?.scheduledAt) ||
      left.order - right.order ||
      left.eventId.localeCompare(right.eventId)
    );
}


// GC_SR_VILAREAL_ATTENDANCE_BONUS_V1
// Excepción auditada solicitada por dirección de carrera:
// Vila Real tuvo baja asistencia. Para NO penalizar a quienes sí participaron,
// el resultado SR de esa carrera se neutraliza y se aplica un bonus fijo +1 SR.
// IMPORTANTE:
// - Se aplica solo al eventId exacto; no por nombre de circuito.
// - No toca GSR.
// - No toca puntos ACSM.
// - No convierte automáticamente la carrera en "clean race".
// - Propaga el SR resultante a eventos posteriores usando sus deltas originales.
const GC_SR_VILAREAL_ATTENDANCE_BONUS_EVENT_ID_V1 = 'b266fbac-4b3a-400a-a9c2-a06f9f6a957c';
const GC_SR_VILAREAL_ATTENDANCE_BONUS_AMOUNT_V1 = 1;

function gcSrVilaRealBonusClampV1(value: number) {
  return Math.max(0, Math.min(100, roundTo(value, 2)));
}

function gcSrVilaRealBonusResultNoteV1(row: RatingEventResult) {
  const notes = ratingArray((row as PlainObject).notes).map((item) => String(item));
  const note = 'GC_SR_VILAREAL_ATTENDANCE_BONUS_V1: SR del evento neutralizado por baja asistencia; bonus asistencia +1 SR aplicado. GSR y puntos ACSM intactos.';
  return notes.includes(note) ? notes : [...notes, note];
}

function applySpecialSrExceptionsToSnapshotV1(snapshot: RatingsSnapshot | null | undefined): RatingsSnapshot | null {
  if (!snapshot) return snapshot || null;
  const sourceResults = ratingArray(snapshot.eventResults) as RatingEventResult[];
  if (!sourceResults.some((row) => String(row.eventId || '') === GC_SR_VILAREAL_ATTENDANCE_BONUS_EVENT_ID_V1)) return snapshot;

  const ordered = [...sourceResults].sort((left, right) =>
    parseDateMs(left.eventDate || left.processedAt) - parseDateMs(right.eventDate || right.processedAt) ||
    String(left.eventId || '').localeCompare(String(right.eventId || '')) ||
    safeFiniteNumber(left.position, 9999) - safeFiniteNumber(right.position, 9999) ||
    textValue(left.displayName).localeCompare(textValue(right.displayName))
  );

  const srState = new Map<string, number>();
  const adjustedById = new Map<string, RatingEventResult>();

  for (const row of ordered) {
    const key = textValue(row.driverKey) || `name:${normalizeDriverNameKey(row.displayName)}`;
    const previousSr = srState.has(key)
      ? srState.get(key)!
      : safeFiniteNumber(row.oldSr, safeFiniteNumber(row.newSr, 80) - safeFiniteNumber(row.deltaSr, 0));
    const isBonusEvent = String(row.eventId || '') === GC_SR_VILAREAL_ATTENDANCE_BONUS_EVENT_ID_V1;
    const nextSr = isBonusEvent
      ? gcSrVilaRealBonusClampV1(previousSr + GC_SR_VILAREAL_ATTENDANCE_BONUS_AMOUNT_V1)
      : gcSrVilaRealBonusClampV1(previousSr + safeFiniteNumber(row.deltaSr, 0));

    const adjusted: RatingEventResult = {
      ...row,
      oldSr: roundTo(previousSr, 2),
      newSr: nextSr,
      deltaSr: roundTo(nextSr - previousSr, 2),
      incidentPoints: isBonusEvent ? 0 : row.incidentPoints,
      incidents: isBonusEvent ? [] : row.incidents,
      notes: isBonusEvent ? gcSrVilaRealBonusResultNoteV1(row) : row.notes
    };

    adjustedById.set(String(row.id || `${row.eventId}:${row.driverKey}:${row.position}`), adjusted);
    srState.set(key, nextSr);
  }

  const adjustedEventResults = sourceResults.map((row) =>
    adjustedById.get(String(row.id || `${row.eventId}:${row.driverKey}:${row.position}`)) || row
  );

  return {
    ...snapshot,
    eventResults: adjustedEventResults,
    drivers: rebuildDriversFromEventResults(adjustedEventResults, snapshot.drivers),
    recalculationLogs: ratingArray(snapshot.recalculationLogs) as RecalculationLog[]
  };
}


export class GcRatingsService {
  private readonly store = createRatingStore();
  private cachedSnapshot: RatingsSnapshot | null = null;
  private ratingMutationQueueV1: Promise<unknown> = Promise.resolve();

  private queueRatingMutationV1<T>(task: () => Promise<T>): Promise<T> {
    const run = this.ratingMutationQueueV1.then(task, task);
    this.ratingMutationQueueV1 = run.then(() => undefined, () => undefined);
    return run;
  }

  private async loadSnapshot() {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    const loaded = await this.store.load();
    const adjusted = applySpecialSrExceptionsToSnapshotV1(loaded);
    this.cachedSnapshot = adjusted;
    return adjusted;
  }

  async getSnapshot() {
    const loaded = await this.loadSnapshot();
    if (loaded) return loaded;
    return createEmptySnapshot(null, this.store.kind);
  }

  private async computeEventUpdates(baseSnapshot: RatingsSnapshot, events: PlainObject[], mode: 'incremental' | 'rebuild', options: PlainObject = {}) {
    const states = new Map(baseSnapshot.drivers.map((driver) => [driver.driverKey, { ...driver }]));
    const newEventResults: RatingEventResult[] = [];
    const processedEventIds = new Set(baseSnapshot.processedEventIds);
    const processedEventKeys = new Set(
      ratingArray<string>(baseSnapshot.processedEventKeys).length
        ? ratingArray<string>(baseSnapshot.processedEventKeys)
        : ratingArray<RatingEventResult>(baseSnapshot.eventResults).map((row) =>
            ratingEventScopeKeyV1(row.sourceKey, row.eventId)
          )
    );
    const defaultSourceKey = normalizeRatingSourceKeyV1(options.source || 'weekly');
    const defaultChampionshipId = textValue(options.championshipId) || null;
    const defaultChampionshipName = textValue(options.championshipName) || null;
    const context = await createProcessingContext(events.length, mode, options.source || 'weekly');

    try {
      for (const event of events) {
        const eventSourceKey: RatingSourceKeyV1 = String(event?.id || '').startsWith('stracker:')
          ? 'stracker-manual'
          : defaultSourceKey;
        const eventChampionshipId = eventSourceKey === 'stracker-manual' ? null : defaultChampionshipId;
        const eventChampionshipName = eventSourceKey === 'stracker-manual' ? null : defaultChampionshipName;
        const forcedSessionId = safeFiniteNumber(event.manualStrackerSessionId || event.strackerSessionId, 0);
        const session = (context.strackerAvailable && context.db
          ? forcedSessionId
            ? context.sessions.find((candidate: PlainObject) => safeFiniteNumber(candidate.SessionId, 0) === forcedSessionId) || readRaceSession(context.db, forcedSessionId) || identifyRaceSession(event, context.sessions)
            : identifyRaceSession(event, context.sessions)
          : null) as PlainObject | null;
        const strackerDrivers = session && context.db ? readRaceDrivers(context.db, Number(session.SessionId)) : [];
        const officialResults = ratingArray(event.raceResults);

        const rawMatches = session && strackerDrivers.length
          ? matchOfficialToStracker(event, session, strackerDrivers)
          : officialResults.map((result: PlainObject) => ({
              result,
              stracker: null,
              match: acsmFallbackMatch(event, result)
            }));

        // Mega Update v108:
        // Si el matching ACSM ↔ sTracker es dudoso, no usamos esa telemetría para SR.
        // El GSR puede seguir usando el resultado oficial ACSM, pero el SR queda congelado
        // para evitar penalizar o bonificar a un piloto con vueltas del piloto equivocado.
        const matches = rawMatches.map(protectLowConfidenceStrackerMatch);

        const maxRaceLaps = Math.max(...officialResults.map((row: PlainObject) => safeFiniteNumber(row.numLaps, 0)), 0);
        const processedAt = isoNow();

        const provisionalRows = matches.map(({ result, stracker, match }: any) => {
          const steamGuid = textValue(stracker?.StrackerGuid ?? result.guid ?? result.steamGuid ?? result.SteamGuid);
          const strackerPlayerId = safeFiniteNumber(stracker?.PlayerId ?? result.playerId ?? result.strackerPlayerId, 0) || null;
          const displayName = officialDriverName(result);
          const driverKey = stableDriverKeyFromParts({
            steamGuid,
            strackerPlayerId,
            name: displayName
          });
          const existingState = findExistingStateForIdentity(states, {
            driverKey,
            steamGuid,
            strackerPlayerId,
            name: displayName
          });
          const current = existingState?.state || stateFromRow({
            driverKey,
            displayName,
            steamGuid,
            strackerPlayerId
          });

          // Si venía de una clave antigua player:/name:, migramos el estado vivo a steam:
          // para que el rebuild/incremental mantenga una sola identidad.
          if (existingState?.key && existingState.key !== driverKey) {
            states.delete(existingState.key);
            current.driverKey = driverKey;
          }

          current.steamGuid = steamGuid || current.steamGuid || null;
          current.strackerPlayerId = strackerPlayerId ?? current.strackerPlayerId ?? null;
          current.displayName = displayName || current.displayName;
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
              dnf: Boolean(result.status === 'DNF'),
              __srTelemetryReliable: Boolean(stracker?.PlayerInSessionId && context.db)
            },
            matchedRow: stracker,
            maxRaceLaps
          });

          const isVilaRealAttendanceBonusEvent = String(event.id || '') === GC_SR_VILAREAL_ATTENDANCE_BONUS_EVENT_ID_V1;
          const neutralizedNewSr = isVilaRealAttendanceBonusEvent
            ? gcSrVilaRealBonusClampV1(current.srScore + GC_SR_VILAREAL_ATTENDANCE_BONUS_AMOUNT_V1)
            : sr.newSr;
          const neutralizedDeltaSr = isVilaRealAttendanceBonusEvent
            ? roundTo(neutralizedNewSr - current.srScore, 2)
            : sr.deltaSr;

          return {
            resultId,
            eventId: String(event.id),
            eventName: textValue(event.name, `Ronda ${event.index}`),
            eventDate: event.completedAt || event.scheduledAt || null,
            sourceKey: eventSourceKey,
            championshipId: eventChampionshipId,
            championshipName: eventChampionshipName,
            resultIdentityKey: ratingResultIdentityKeyV1({
              driverKey,
              steamGuid,
              strackerPlayerId,
              displayName
            } as RatingEventResult),
            eventScopeKey: ratingEventScopeKeyV1(eventSourceKey, event.id),
            strackerSessionId: session ? Number(session.SessionId) : null,
            driverKey,
            steamGuid,
            strackerPlayerId,
            displayName,
            car: textValue(result.model || result.carModel || stracker?.UiCarName || stracker?.CarFolder),
            position: safeFiniteNumber(result.position, 0),
            points: safeFiniteNumber(result.points, 0),
            laps: safeFiniteNumber(result.numLaps, 0),
            bestLapMs: safeFiniteNumber(result.bestLapMs || stracker?.BestLapMs, 0),
            oldSr: current.srScore,
            newSr: neutralizedNewSr,
            deltaSr: neutralizedDeltaSr,
            incidentPoints: isVilaRealAttendanceBonusEvent ? 0 : sr.incidentPoints,
            rawCollisionCount: Number.isFinite(Number((sr as PlainObject).breakdown?.rawCollisionCount)) ? Number((sr as PlainObject).breakdown?.rawCollisionCount) : null,
            collisionClusterCount: Number.isFinite(Number((sr as PlainObject).breakdown?.collisionClusterCount)) ? Number((sr as PlainObject).breakdown?.collisionClusterCount) : null,
            suppressedCollisionCount: Number.isFinite(Number((sr as PlainObject).breakdown?.suppressedCollisionCount)) ? Number((sr as PlainObject).breakdown?.suppressedCollisionCount) : null,
            clusterWindowSeconds: Number.isFinite(Number((sr as PlainObject).breakdown?.clusterWindowSeconds)) ? Number((sr as PlainObject).breakdown?.clusterWindowSeconds) : null,
            cleanRace: sr.cleanRace,
            dnf: Boolean(result.status === 'DNF') || sr.incidents.some((item) => item.type === 'DNF'),
            dsq: Boolean(result.disqualified || result.dsq),
            srIncidents: isVilaRealAttendanceBonusEvent ? [] : sr.incidents,
            srLaps: sr.lapDetails,
            srExplanations: isVilaRealAttendanceBonusEvent
              ? ['GC_SR_VILAREAL_ATTENDANCE_BONUS_V1: SR del evento neutralizado por baja asistencia; bonus asistencia +1 SR aplicado. GSR y puntos ACSM intactos.']
              : ratingArray((sr as PlainObject).explanations).map((item) => String(item)),
            srModelVersion: String((sr as PlainObject).modelVersion || 'gc-sr-v2-clean-time'),
            match,
            processedAt
          };
        });

        // Mega Update v110:
        // GSR debe calcularse con el orden real de llegada. Antes se usaba el orden
        // de matching, que normalmente coincide, pero puede fallar con emparejamientos
        // ACSM/sTracker raros. No cambiamos el modelo GSR, solo el orden de entrada.
        const orderedRowsForGsr = orderRowsForGsr(provisionalRows);
        const gsrUpdates = applyGsrUpdates(orderedRowsForGsr, states);
        const gsrByDriver = new Map(gsrUpdates.map((row) => [row.driverKey, row]));

        for (const row of orderedRowsForGsr) {
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
            sourceKey: row.sourceKey,
            championshipId: row.championshipId,
            championshipName: row.championshipName,
            resultIdentityKey: row.resultIdentityKey,
            eventScopeKey: row.eventScopeKey,
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
            rawCollisionCount: Number.isFinite(Number(row.rawCollisionCount)) ? Number(row.rawCollisionCount) : null,
            collisionClusterCount: Number.isFinite(Number(row.collisionClusterCount)) ? Number(row.collisionClusterCount) : null,
            suppressedCollisionCount: Number.isFinite(Number(row.suppressedCollisionCount)) ? Number(row.suppressedCollisionCount) : null,
            clusterWindowSeconds: Number.isFinite(Number(row.clusterWindowSeconds)) ? Number(row.clusterWindowSeconds) : null,
            cleanRace: row.cleanRace,
            dnf: row.dnf,
            dsq: row.dsq,
            processedAt,
            incidents: row.srIncidents,
            lapsDetail: row.srLaps,
            match: row.match,
            notes: [
              gsr.explanation,
              ...ratingArray(row.srExplanations).map((item) => String(item))
            ]
          });
        }

        processedEventIds.add(String(event.id));
        processedEventKeys.add(ratingEventScopeKeyV1(eventSourceKey, event.id));
      }

      return {
        context,
        processedEventIds: [...processedEventIds],
        processedEventKeys: [...processedEventKeys],
        drivers: [...states.values()].sort((left, right) => right.gsrRating - left.gsrRating || right.srScore - left.srScore),
        newEventResults
      };
    } finally {
      try { context.db?.close?.(); } catch {}
    }
  }

private async buildCanonicalRebuildPlanV1(storedSnapshot: RatingsSnapshot) {
    const sources = ['weekly', 'gt4'] as const;
    const completedBySource: Array<{
      source: 'weekly' | 'gt4';
      championshipId: string;
      championshipName: string;
      event: PlainObject;
      eventId: string;
      eventName: string;
      eventDate: number;
    }> = [];
    const sourceSummaries: PlainObject[] = [];

    for (const source of sources) {
      const acsm = await fetchChampionship(source);
      const championship = acsm.championship || {};
      const completed = completedEvents(championship);
      sourceSummaries.push({
        source,
        championshipId: textValue(championship.id) || null,
        championshipName: textValue(championship.name) || null,
        completedEvents: completed.length
      });
      for (const event of completed) {
        const eventId = textValue(event?.id);
        if (!eventId) continue;
        completedBySource.push({
          source,
          championshipId: textValue(championship.id) || 'unknown',
          championshipName: textValue(championship.name) || (source === 'gt4' ? 'Supra GT4' : 'Liga GrassCutters'),
          event,
          eventId,
          eventName: textValue(event?.name, `Ronda ${event?.index ?? ''}`),
          eventDate: phase4bOfficialEventDateV1(event)
        });
      }
    }

    const sourceByEventId = new Map<string, Set<string>>();
    for (const item of completedBySource) {
      const set = sourceByEventId.get(item.eventId) || new Set<string>();
      set.add(item.source);
      sourceByEventId.set(item.eventId, set);
    }

    const sourceCollisions = [...sourceByEventId.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([eventId, values]) => ({ eventId, sources: [...values] }));

    const storedOfficialEventIds = [...new Set([
      ...ratingArray(storedSnapshot.processedEventIds).map((value) => String(value || '')),
      ...ratingArray<RatingEventResult>(storedSnapshot.eventResults).map((row) => String(row.eventId || ''))
    ].filter((eventId) => eventId && !eventId.startsWith('stracker:')))];

    const availableById = new Map<string, typeof completedBySource[number]>();
    for (const item of completedBySource) {
      if (!availableById.has(item.eventId)) availableById.set(item.eventId, item);
    }

    const missingStoredEventIds = storedOfficialEventIds.filter((eventId) => !availableById.has(eventId));
    const selectedEvents = storedOfficialEventIds
      .map((eventId) => availableById.get(eventId))
      .filter(Boolean)
      .sort((left, right) =>
        (left!.eventDate || 0) - (right!.eventDate || 0) ||
        left!.eventId.localeCompare(right!.eventId)
      ) as typeof completedBySource;

    const availableUnprocessedEventIds = completedBySource
      .map((item) => item.eventId)
      .filter((eventId) => !storedOfficialEventIds.includes(eventId));

    const baseSnapshot: RatingsSnapshot = {
      ...createEmptySnapshot(null, this.store.kind),
      championshipId: 'gc-multi-source',
      championshipName: 'GrassCutters Ratings · Liga + GT4',
      ignoredStrackerSessions: normalizeIgnoredStrackerSessions(storedSnapshot),
      reviewedStrackerSessions: normalizeReviewedStrackerSessions(storedSnapshot),
      recalculationLogs: [...ratingArray<RecalculationLog>(storedSnapshot.recalculationLogs)]
    };

    let candidate = baseSnapshot;
    const rebuiltEvents: PlainObject[] = [];
    const warnings: string[] = [];

    if (!missingStoredEventIds.length && !sourceCollisions.length) {
      for (const item of selectedEvents) {
        const computed = await this.computeEventUpdates(candidate, [item.event], 'rebuild', {
          source: item.source,
          championshipId: item.championshipId,
          championshipName: item.championshipName
        });
        candidate = {
          ...candidate,
          source: computed.context.srMode === 'stracker' ? 'gc-ratings-v1' : 'gc-ratings-v1-acsm-fallback',
          storage: this.store.kind,
          strackerDbPath: computed.context.strackerAvailable
            ? computed.context.strackerDbPath
            : candidate.strackerDbPath,
          generatedAt: isoNow(),
          processedEventIds: computed.processedEventIds,
          processedEventKeys: computed.processedEventKeys,
          drivers: computed.drivers,
          eventResults: [...candidate.eventResults, ...computed.newEventResults],
          recalculationLogs: [
            ...candidate.recalculationLogs,
            ...computed.context.warningLogs
          ]
        };
        warnings.push(...computed.context.warningLogs.map((row) => row.message));
        rebuiltEvents.push({
          eventId: item.eventId,
          eventName: item.eventName,
          source: item.source,
          eventDate: item.event?.completedAt || item.event?.scheduledAt || item.event?.date || null,
          results: computed.newEventResults.length,
          srMode: computed.context.srMode,
          strackerAvailable: computed.context.strackerAvailable
        });
      }
    }

    const beforeAudit = buildRatingDuplicateAuditV1(storedSnapshot.eventResults);
    const afterAudit = buildRatingDuplicateAuditV1(candidate.eventResults);
    const safeToApply =
      beforeAudit.duplicateGroups > 0 &&
      missingStoredEventIds.length === 0 &&
      sourceCollisions.length === 0 &&
      selectedEvents.length === storedOfficialEventIds.length &&
      candidate.eventResults.length > 0 &&
      afterAudit.duplicateGroups === 0;

    return {
      storedSnapshot,
      candidate,
      beforeAudit,
      afterAudit,
      sourceSummaries,
      storedOfficialEventIds,
      selectedEvents,
      rebuiltEvents,
      missingStoredEventIds,
      sourceCollisions,
      availableUnprocessedEventIds: [...new Set(availableUnprocessedEventIds)],
      warnings: [...new Set(warnings.filter(Boolean))],
      safeToApply,
      confirmationRequired: phase4bIntegrityConfirmationV1(beforeAudit.duplicateGroups)
    };
  }

  async rebuildCanonicalRatingsIntegrityV1(options: PlainObject = {}) {
    return this.queueRatingMutationV1(async () => {
      const dryRun = parseBooleanish(options.dryRun, true) !== false;
      const confirmation = textValue(options.confirmation);
      const storedSnapshot = await this.getSnapshot();
      const plan = await this.buildCanonicalRebuildPlanV1(storedSnapshot);

      const summary = {
        version: GC_PHASE4B_CLEANUP_LOG_MARKER_V1,
        dryRun,
        safeToApply: plan.safeToApply,
        confirmationRequired: plan.confirmationRequired,
        storage: this.store.kind,
        before: {
          storedRows: plan.beforeAudit.totalStoredRows,
          uniqueRows: plan.beforeAudit.uniqueRuntimeRows,
          duplicateGroups: plan.beforeAudit.duplicateGroups,
          suppressedRows: plan.beforeAudit.suppressedRuntimeRows,
          drivers: storedSnapshot.drivers.length,
          officialEvents: plan.storedOfficialEventIds.length
        },
        predicted: {
          storedRows: plan.candidate.eventResults.length,
          uniqueRows: plan.afterAudit.uniqueRuntimeRows,
          duplicateGroups: plan.afterAudit.duplicateGroups,
          drivers: plan.candidate.drivers.length,
          rebuiltEvents: plan.rebuiltEvents.length
        },
        sourceSummaries: plan.sourceSummaries,
        rebuiltEvents: plan.rebuiltEvents,
        missingStoredEventIds: plan.missingStoredEventIds,
        sourceCollisions: plan.sourceCollisions,
        availableUnprocessedEventIds: plan.availableUnprocessedEventIds,
        warnings: plan.warnings
      };

      if (dryRun) {
        return {
          ok: true,
          ...summary,
          applied: false,
          backupFile: null,
          message: plan.safeToApply
            ? `Simulación segura. Se reconstruirán ${plan.rebuiltEvents.length} eventos y se eliminarán ${plan.beforeAudit.suppressedRuntimeRows} filas duplicadas.`
            : 'Simulación bloqueada. Revisa eventos ausentes, colisiones de fuente o resultados previstos.'
        };
      }

      if (!plan.safeToApply) {
        throw new Error('Reconstrucción bloqueada: el plan no supera las comprobaciones de integridad.');
      }

      if (confirmation !== plan.confirmationRequired) {
        throw new Error(`Confirmación incorrecta. Escribe exactamente ${plan.confirmationRequired}.`);
      }

      const backupFile = phase4bBackupFileV1(storedSnapshot, summary);
      const cleanupLog: RecalculationLog = {
        id: uniqueId('gc_recalc'),
        eventId: null,
        mode: 'rebuild',
        status: 'ok',
        message: `${GC_PHASE4B_CLEANUP_LOG_MARKER_V1}: backup ${backupFile}; reconstruidos ${plan.rebuiltEvents.length} eventos; eliminadas ${plan.beforeAudit.suppressedRuntimeRows} filas duplicadas.`,
        createdAt: isoNow()
      };

      const snapshotToSave: RatingsSnapshot = {
        ...plan.candidate,
        championshipId: 'gc-multi-source',
        championshipName: 'GrassCutters Ratings · Liga + GT4',
        generatedAt: cleanupLog.createdAt,
        recalculationLogs: [...plan.candidate.recalculationLogs, cleanupLog]
      };

      await this.store.save(snapshotToSave);
      this.cachedSnapshot = snapshotToSave;

      const finalAudit = buildRatingDuplicateAuditV1(snapshotToSave.eventResults);
      return {
        ok: true,
        ...summary,
        dryRun: false,
        applied: true,
        backupFile,
        after: {
          storedRows: snapshotToSave.eventResults.length,
          uniqueRows: finalAudit.uniqueRuntimeRows,
          duplicateGroups: finalAudit.duplicateGroups,
          drivers: snapshotToSave.drivers.length,
          processedEvents: snapshotToSave.processedEventIds.length
        },
        message: `Reconstrucción completada. ${plan.beforeAudit.suppressedRuntimeRows} filas duplicadas eliminadas y ratings recalculados cronológicamente.`
      };
    });
  }

async migrateRatingSourceIsolationV1(options: PlainObject = {}) {
    return this.queueRatingMutationV1(async () => {
      const dryRun = parseBooleanish(options.dryRun, true) !== false;
      const confirmation = textValue(options.confirmation);
      const snapshot = await this.getSnapshot();
      const plan = await buildRatingSourceIsolationPlanV1(snapshot);

      const summary = {
        version: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
        dryRun,
        safeToApply: plan.safeToApply,
        confirmationRequired: plan.confirmationRequired,
        storage: this.store.kind,
        before: plan.before,
        predicted: plan.after,
        sourceSummaries: plan.sourceSummaries,
        sourceCollisions: plan.sourceCollisions,
        missingEventIds: plan.missingEventIds
      };

      if (dryRun) {
        return {
          ok: true,
          ...summary,
          applied: false,
          backupFile: null,
          message: plan.safeToApply
            ? `Simulación segura. Se aislarán ${plan.candidate.eventResults.length} resultados por Liga/GT4.`
            : 'Simulación bloqueada. Revisa eventos ausentes, colisiones o identidades duplicadas.'
        };
      }

      if (!plan.safeToApply) {
        throw new Error('Aislamiento bloqueado: el plan no supera las comprobaciones de integridad.');
      }

      if (confirmation !== plan.confirmationRequired) {
        throw new Error(`Confirmación incorrecta. Escribe exactamente ${plan.confirmationRequired}.`);
      }

      const backupFile = phase4dBackupFileV1(snapshot, summary);
      const log: RecalculationLog = {
        id: uniqueId('gc_recalc'),
        eventId: null,
        mode: 'rebuild',
        status: 'ok',
        message: `${GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1}: backup ${backupFile}; ${plan.candidate.eventResults.length} resultados aislados por fuente.`,
        createdAt: isoNow()
      };

      const snapshotToSave: RatingsSnapshot = {
        ...plan.candidate,
        generatedAt: log.createdAt,
        sourceIsolationVersion: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
        recalculationLogs: [...plan.candidate.recalculationLogs, log]
      };

      await this.store.save(snapshotToSave);
      if (this.store.ensureSourceIsolationConstraints) {
        await this.store.ensureSourceIsolationConstraints();
      }
      this.cachedSnapshot = snapshotToSave;

      return {
        ok: true,
        ...summary,
        dryRun: false,
        applied: true,
        backupFile,
        after: buildRatingSourceIsolationAuditV1(snapshotToSave),
        message: `Aislamiento completado. ${snapshotToSave.eventResults.length} resultados etiquetados y protegidos por fuente.`
      };
    });
  }

private async buildAllSourcesIncrementalPlanV1(baseSnapshot: RatingsSnapshot) {
    const sourceIsolation = buildRatingSourceIsolationAuditV1(baseSnapshot);
    const duplicateAudit = buildRatingDuplicateAuditV1(baseSnapshot.eventResults);
    const sources: Phase4d2SourceKey[] = ['weekly', 'gt4'];
    const sourceSummaries: PlainObject[] = [];
    const fetchErrors: PlainObject[] = [];
    const completed: Phase4d2PendingEvent[] = [];

    for (const sourceKey of sources) {
      try {
        const acsm = await fetchChampionship(sourceKey);
        const championship = acsm.championship || {};
        const championshipId = textValue(championship.id, 'unknown');
        const championshipName = textValue(
          championship.name,
          sourceKey === 'gt4' ? 'GC Toyota Supra GT4' : 'Liga GrassCutters'
        );
        const sourceEvents = completedEvents(championship);

        sourceSummaries.push({
          sourceKey,
          championshipId,
          championshipName,
          completedEvents: sourceEvents.length
        });

        for (const event of sourceEvents) {
          const eventId = textValue(event?.id);
          if (!eventId) continue;
          completed.push({
            sourceKey,
            championshipId,
            championshipName,
            event,
            eventId,
            eventName: textValue(event?.name, `Evento ${eventId}`),
            eventDate: phase4d2EventDateV1(event),
            eventDateIso: textValue(
              event?.completedAt || event?.scheduledAt || event?.date || event?.rawDate
            ) || null,
            eventScopeKey: ratingEventScopeKeyV1(sourceKey, eventId)
          });
        }
      } catch (error) {
        fetchErrors.push({
          sourceKey,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const processedKeys = new Set(
      ratingArray<string>(baseSnapshot.processedEventKeys).length
        ? ratingArray<string>(baseSnapshot.processedEventKeys)
        : ratingArray<RatingEventResult>(baseSnapshot.eventResults).map((row) =>
            ratingEventScopeKeyV1(row.sourceKey, row.eventId)
          )
    );

    const pending = completed
      .filter((item) => !processedKeys.has(item.eventScopeKey))
      .sort((left, right) =>
        (left.eventDate || 0) - (right.eventDate || 0) ||
        left.sourceKey.localeCompare(right.sourceKey) ||
        left.eventId.localeCompare(right.eventId)
      );

    const duplicateScopeGroups = [...pending.reduce((map, item) => {
      const bucket = map.get(item.eventScopeKey) || [];
      bucket.push(item);
      map.set(item.eventScopeKey, bucket);
      return map;
    }, new Map<string, Phase4d2PendingEvent[]>()).entries()]
      .filter(([, bucket]) => bucket.length > 1)
      .map(([eventScopeKey, bucket]) => ({
        eventScopeKey,
        rows: bucket.length,
        events: bucket.map((item) => ({
          sourceKey: item.sourceKey,
          eventId: item.eventId,
          eventName: item.eventName
        }))
      }));

    const blockingReasons: string[] = [];
    if (!sourceIsolation.ready) blockingReasons.push('El aislamiento por fuente no está listo.');
    if (duplicateAudit.duplicateGroups > 0) blockingReasons.push(`Hay ${duplicateAudit.duplicateGroups} grupo(s) duplicado(s).`);
    if (fetchErrors.length) blockingReasons.push('No se pudieron leer todos los campeonatos ACSM.');
    if (duplicateScopeGroups.length) blockingReasons.push('Hay eventos pendientes repetidos dentro de la misma fuente.');

    let candidate: RatingsSnapshot = {
      ...baseSnapshot,
      championshipId: 'gc-multi-source',
      championshipName: 'GrassCutters Ratings · Liga + GT4',
      sourceIsolationVersion: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
      processedEventKeys: [...processedKeys]
    };
    const newEventResults: RatingEventResult[] = [];
    const warningLogs: RecalculationLog[] = [];
    const processedEvents: PlainObject[] = [];

    if (!blockingReasons.length) {
      for (const item of pending) {
        const computed = await this.computeEventUpdates(candidate, [item.event], 'incremental', {
          source: item.sourceKey,
          championshipId: item.championshipId,
          championshipName: item.championshipName
        });

        const sourceRowsValid = computed.newEventResults.every((row) =>
          normalizeRatingSourceKeyV1(row.sourceKey) === item.sourceKey &&
          textValue(row.championshipId) === item.championshipId &&
          textValue(row.eventScopeKey) === item.eventScopeKey
        );

        if (!sourceRowsValid) {
          blockingReasons.push(`El evento ${item.eventScopeKey} generó resultados con una fuente o campeonato incorrectos.`);
          break;
        }

        if (computed.context.srMode !== 'stracker' || !computed.context.strackerAvailable) {
          blockingReasons.push(`El evento ${item.eventScopeKey} no dispone de su sTracker correcto.`);
        }

        if (!computed.newEventResults.length) {
          blockingReasons.push(`El evento ${item.eventScopeKey} no generó resultados.`);
        }

        newEventResults.push(...computed.newEventResults);
        warningLogs.push(...computed.context.warningLogs);

        candidate = {
          ...candidate,
          source: computed.context.srMode === 'stracker'
            ? 'gc-ratings-v1-multi-source'
            : 'gc-ratings-v1-multi-source-acsm-fallback',
          storage: this.store.kind,
          strackerDbPath: computed.context.strackerAvailable
            ? computed.context.strackerDbPath
            : candidate.strackerDbPath,
          generatedAt: isoNow(),
          processedEventIds: computed.processedEventIds,
          processedEventKeys: computed.processedEventKeys,
          drivers: computed.drivers,
          eventResults: [...candidate.eventResults, ...computed.newEventResults]
        };

        processedEvents.push({
          sourceKey: item.sourceKey,
          championshipId: item.championshipId,
          championshipName: item.championshipName,
          eventId: item.eventId,
          eventScopeKey: item.eventScopeKey,
          eventName: item.eventName,
          eventDate: item.eventDateIso,
          results: computed.newEventResults.length,
          srMode: computed.context.srMode,
          strackerAvailable: computed.context.strackerAvailable,
          strackerSessionIds: [...new Set(
            computed.newEventResults
              .map((row) => safeFiniteNumber(row.strackerSessionId, 0))
              .filter((value) => value > 0)
          )]
        });
      }
    }

    const predictedSourceIsolation = buildRatingSourceIsolationAuditV1(candidate);
    const predictedDuplicates = buildRatingDuplicateAuditV1(candidate.eventResults);
    const hasPending = pending.length > 0;
    const safeToApply =
      hasPending &&
      blockingReasons.length === 0 &&
      newEventResults.length > 0 &&
      processedEvents.length === pending.length &&
      predictedSourceIsolation.ready &&
      predictedDuplicates.duplicateGroups === 0;

    const confirmationRequired = hasPending
      ? `PROCESAR_${pending.length}_EVENTOS_${phase4d2PlanTokenV1(pending)}`
      : '';

    return {
      baseSnapshot,
      candidate,
      newEventResults,
      warningLogs,
      sourceIsolation,
      duplicateAudit,
      predictedSourceIsolation,
      predictedDuplicates,
      sourceSummaries,
      fetchErrors,
      duplicateScopeGroups,
      pending,
      processedEvents,
      blockingReasons: [...new Set(blockingReasons)],
      hasPending,
      safeToApply,
      confirmationRequired
    };
  }

  async processNewEventsAllSourcesV1(options: PlainObject = {}) {
    return this.queueRatingMutationV1(async () => {
      const trustedAutomation = options.trustedAutomation === true;
      const dryRun = trustedAutomation
        ? false
        : parseBooleanish(options.dryRun, true) !== false;
      const confirmation = textValue(options.confirmation);
      const baseSnapshot = await this.getSnapshot();
      const plan = await this.buildAllSourcesIncrementalPlanV1(baseSnapshot);

      const pendingBySource = plan.pending.reduce((acc: Record<string, number>, item) => {
        acc[item.sourceKey] = (acc[item.sourceKey] || 0) + 1;
        return acc;
      }, { weekly: 0, gt4: 0 });

      const summary = {
        version: GC_PHASE4D2_GLOBAL_PROCESSING_MARKER_V1,
        dryRun,
        trustedAutomation,
        safeToApply: plan.safeToApply,
        hasPending: plan.hasPending,
        confirmationRequired: plan.confirmationRequired,
        storage: this.store.kind,
        before: {
          eventResults: baseSnapshot.eventResults.length,
          drivers: baseSnapshot.drivers.length,
          processedEventKeys: ratingArray(baseSnapshot.processedEventKeys).length,
          sourceIsolationReady: plan.sourceIsolation.ready,
          duplicateGroups: plan.duplicateAudit.duplicateGroups
        },
        pending: {
          total: plan.pending.length,
          weekly: pendingBySource.weekly || 0,
          gt4: pendingBySource.gt4 || 0,
          events: plan.pending.map((item) => ({
            sourceKey: item.sourceKey,
            championshipId: item.championshipId,
            championshipName: item.championshipName,
            eventId: item.eventId,
            eventScopeKey: item.eventScopeKey,
            eventName: item.eventName,
            eventDate: item.eventDateIso
          }))
        },
        predicted: {
          newRows: plan.newEventResults.length,
          totalRows: plan.candidate.eventResults.length,
          drivers: plan.candidate.drivers.length,
          processedEventKeys: ratingArray(plan.candidate.processedEventKeys).length,
          duplicateGroups: plan.predictedDuplicates.duplicateGroups,
          sourceIsolationReady: plan.predictedSourceIsolation.ready
        },
        sourceSummaries: plan.sourceSummaries,
        processedEvents: plan.processedEvents,
        fetchErrors: plan.fetchErrors,
        duplicateScopeGroups: plan.duplicateScopeGroups,
        blockingReasons: plan.blockingReasons,
        warnings: [...new Set(plan.warningLogs.map((log) => log.message).filter(Boolean))]
      };

      if (dryRun) {
        return {
          ok: true,
          ...summary,
          applied: false,
          backupFile: null,
          message: plan.hasPending
            ? plan.safeToApply
              ? `Simulación segura. Se procesarán ${plan.pending.length} evento(s) de Liga y GT4 en orden cronológico.`
              : 'Simulación bloqueada. No se modificará MySQL.'
            : 'No hay eventos completados pendientes en Liga ni GT4.'
        };
      }

      if (!plan.hasPending) {
        return {
          ok: true,
          ...summary,
          dryRun: false,
          applied: false,
          backupFile: null,
          snapshot: baseSnapshot,
          mode: 'incremental' as const,
          processedEvents: 0,
          skippedEvents: [],
          newEvents: [],
          message: 'No hay eventos completados pendientes en Liga ni GT4.'
        };
      }

      if (!plan.safeToApply) {
        throw new Error(`Procesamiento global bloqueado: ${plan.blockingReasons.join(' | ') || 'el plan no es seguro.'}`);
      }

      if (!trustedAutomation && confirmation !== plan.confirmationRequired) {
        throw new Error(`Confirmación incorrecta. Escribe exactamente ${plan.confirmationRequired}.`);
      }

      const backupFile = phase4d2BackupFileV1(baseSnapshot, summary);
      const generatedAt = isoNow();
      const finalLog: RecalculationLog = {
        id: uniqueId('gc_recalc'),
        eventId: null,
        mode: 'incremental',
        status: 'ok',
        message: `${GC_PHASE4D2_GLOBAL_PROCESSING_MARKER_V1}: procesados ${plan.pending.length} evento(s) globales en orden cronológico; backup ${backupFile}.`,
        createdAt: generatedAt
      };

      const snapshotToSave: RatingsSnapshot = {
        ...plan.candidate,
        championshipId: 'gc-multi-source',
        championshipName: 'GrassCutters Ratings · Liga + GT4',
        source: 'gc-ratings-v1-multi-source',
        storage: this.store.kind,
        generatedAt,
        sourceIsolationVersion: GC_PHASE4D_SOURCE_ISOLATION_MARKER_V1,
        recalculationLogs: [
          ...baseSnapshot.recalculationLogs,
          ...plan.warningLogs,
          finalLog
        ]
      };

      if (this.store.append) {
        await this.store.append({
          snapshot: snapshotToSave,
          drivers: snapshotToSave.drivers,
          eventResults: plan.newEventResults,
          recalculationLogs: [...plan.warningLogs, finalLog]
        });
      } else {
        await this.store.save(snapshotToSave);
      }

      this.cachedSnapshot = snapshotToSave;

      const afterSourceIsolation = buildRatingSourceIsolationAuditV1(snapshotToSave);
      const afterDuplicates = buildRatingDuplicateAuditV1(snapshotToSave.eventResults);

      return {
        ok: true,
        ...summary,
        dryRun: false,
        applied: true,
        backupFile,
        snapshot: snapshotToSave,
        mode: 'incremental' as const,
        processedEvents: plan.pending.length,
        skippedEvents: [],
        newEvents: plan.processedEvents.map((item) => ({
          id: item.eventId,
          sourceKey: item.sourceKey,
          name: item.eventName
        })),
        after: {
          eventResults: snapshotToSave.eventResults.length,
          drivers: snapshotToSave.drivers.length,
          processedEventKeys: ratingArray(snapshotToSave.processedEventKeys).length,
          sourceIsolationReady: afterSourceIsolation.ready,
          duplicateGroups: afterDuplicates.duplicateGroups
        },
        message: `Procesamiento global completado. ${plan.pending.length} evento(s) de Liga y GT4 aplicados en orden cronológico.`
      };
    });
  }

  async processNewEvents(options: PlainObject = {}) {
    return this.queueRatingMutationV1(() => this.processNewEventsUnlockedV1(options));
  }

  private async processNewEventsUnlockedV1(options: PlainObject = {}) {
    const source = normalizeChampionshipSource(options.source || 'weekly');
    const acsm = await fetchChampionship(source);
    const championship = acsm.championship;
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(championship, this.store.kind);
    const sourceIsolationAudit = buildRatingSourceIsolationAuditV1(baseSnapshot);
    if (baseSnapshot.eventResults.length > 0 && !sourceIsolationAudit.ready) {
      throw new Error('Procesamiento bloqueado: ejecuta primero /admin/integridad-ratings/fuentes.');
    }
    const integrityAudit = buildRatingDuplicateAuditV1(baseSnapshot.eventResults);
    if (integrityAudit.duplicateGroups > 0) {
      throw new Error(`Procesamiento bloqueado: hay ${integrityAudit.duplicateGroups} grupo(s) de resultados duplicados. Ejecuta primero /admin/integridad-ratings.`);
    }
    const allCompleted = completedEvents(championship);
    const processedKeys = new Set(
      ratingArray<string>(baseSnapshot.processedEventKeys).length
        ? ratingArray<string>(baseSnapshot.processedEventKeys)
        : baseSnapshot.eventResults.map((row) => ratingEventScopeKeyV1(row.sourceKey, row.eventId))
    );
    const newEvents = allCompleted.filter((event: PlainObject) =>
      !processedKeys.has(ratingEventScopeKeyV1(source, event.id))
    );
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
      this.cachedSnapshot = applySpecialSrExceptionsToSnapshotV1(snapshot);
      return {
        snapshot,
        mode: 'incremental' as const,
        processedEvents: 0,
        skippedEvents: [],
        newEvents: [],
        message: 'Sin eventos ACSM completados nuevos'
      };
    }

    const computed = await this.computeEventUpdates(baseSnapshot, newEvents, 'incremental', {
      source,
      championshipId: textValue(championship.id) || null,
      championshipName: textValue(championship.name) || null
    });
    const statusMessage = computed.context.srMode === 'stracker'
      ? `Procesados automáticamente ${newEvents.length} evento(s) ACSM completado(s) con SR/GSR.`
      : `Procesados automáticamente ${newEvents.length} evento(s) ACSM completado(s) con SR parcial desde ACSM.`;
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
      processedEventKeys: computed.processedEventKeys,
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

  async rebuild(options: PlainObject = {}) {
    const source = normalizeChampionshipSource(options.source || 'weekly');
    const acsm = await fetchChampionship(source);
    const championship = acsm.championship;
    const allCompleted = completedEvents(championship);
    const previousSnapshot = await this.getSnapshot();
    const baseSnapshot: RatingsSnapshot = {
      ...createEmptySnapshot(championship, this.store.kind),
      ignoredStrackerSessions: normalizeIgnoredStrackerSessions(previousSnapshot),
      reviewedStrackerSessions: normalizeReviewedStrackerSessions(previousSnapshot)
    };
    if (options.allSources !== true) {
      throw new Error('Rebuild de una sola fuente bloqueado por Phase 4D. Usa el flujo global de integridad para no borrar la otra liga.');
    }
    const computed = await this.computeEventUpdates(baseSnapshot, allCompleted, 'rebuild', {
      source,
      championshipId: textValue(championship.id) || null,
      championshipName: textValue(championship.name) || null
    });
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
      processedEventKeys: computed.processedEventKeys,
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

  async recalculateOfficialAcsmRaceRatings(options: PlainObject = {}) {
    const dryRun = parseBooleanish(options.dryRun, false) === true;
    const recalcSource = normalizeChampionshipSource(options.source || 'weekly');
    const acsm = await fetchChampionship(recalcSource);
    const championship = acsm.championship;
    const snapshot = await this.getSnapshot();
    const targets = buildOfficialAcsmRecalculationTargets(snapshot, championship);
    const generatedAt = isoNow();
    const strackerDbPath = resolveStrackerDbPath(recalcSource === 'gt4' ? 'gt4' : 'main') || null;

    if (dryRun) {
      return {
        ok: true,
        source: 'gc-ratings-v1',
        dryRun: true,
        generatedAt,
        totalDetected: targets.length,
        targets: targets.map((target) => ({
          eventId: target.eventId,
          eventName: target.eventName,
          track: target.track,
          date: target.eventDate,
          order: target.order,
          hasRatingApplied: target.hasRatingApplied,
          hasStrackerSource: target.hasStrackerSource,
          strackerSessionId: target.strackerSessionId,
          existingRows: target.existingRows.length
        })),
        message: targets.length
          ? `Dry-run listo: ${targets.length} carrera(s) oficial(es) ACSM se recalcularían en orden cronológico.`
          : 'Dry-run listo: no hay carreras oficiales ACSM con rating aplicado para recalcular.'
      };
    }

    if (!targets.length) {
      return {
        ok: true,
        source: 'gc-ratings-v1',
        dryRun: false,
        generatedAt,
        totalDetected: 0,
        recalculatedEvents: 0,
        recalculatedDrivers: 0,
        ratingsDeleted: 0,
        ratingsCreated: 0,
        errors: [] as Array<{ eventId: string; eventName: string; message: string }>,
        targets: [],
        message: 'No hay carreras oficiales ACSM con rating aplicado para recalcular.'
      };
    }

    const targetIds = new Set(targets.map((target) => target.eventId));
    const remainingEventResults = snapshot.eventResults.filter((row) => !targetIds.has(String(row.eventId || '')));
    const remainingProcessedEventIds = snapshot.processedEventIds.filter((eventId) => !targetIds.has(String(eventId || '')));
    const remainingDrivers = rebuildDriversFromEventResults(remainingEventResults, snapshot.drivers);

    let currentSnapshot: RatingsSnapshot = {
      ...snapshot,
      source: snapshot.source || 'gc-ratings-v1',
      storage: this.store.kind,
      strackerDbPath: snapshot.strackerDbPath,
      generatedAt,
      processedEventIds: remainingProcessedEventIds,
      drivers: remainingDrivers,
      eventResults: remainingEventResults,
      recalculationLogs: [...snapshot.recalculationLogs]
    };

    const recalculatedRows: RatingEventResult[] = [];
    const errors: Array<{ eventId: string; eventName: string; message: string }> = [];
    const warningLogs: RecalculationLog[] = [];

    for (const target of targets) {
      try {
        const computed = await this.computeEventUpdates(currentSnapshot, [target.event], 'rebuild', {
        source: recalcSource,
        championshipId: textValue(championship.id) || null,
        championshipName: textValue(championship.name) || null
      });
        recalculatedRows.push(...computed.newEventResults);
        warningLogs.push(...computed.context.warningLogs);
        currentSnapshot = {
          ...currentSnapshot,
          source: computed.context.srMode === 'stracker' ? 'gc-ratings-v1' : 'gc-ratings-v1-acsm-fallback',
          strackerDbPath: computed.context.strackerAvailable ? computed.context.strackerDbPath : strackerDbPath,
          generatedAt,
          processedEventIds: computed.processedEventIds,
          processedEventKeys: computed.processedEventKeys,
          drivers: computed.drivers,
          eventResults: [...currentSnapshot.eventResults, ...computed.newEventResults],
          recalculationLogs: [...currentSnapshot.recalculationLogs, ...computed.context.warningLogs]
        };
      } catch (error) {
        errors.push({
          eventId: target.eventId,
          eventName: target.eventName,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const finalLog: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId: null,
      mode: 'rebuild',
      status: errors.length ? 'error' : 'ok',
      message: errors.length
        ? `Recalculadas ${targets.length - errors.length} carrera(s) oficial(es) ACSM con ${errors.length} error(es).`
        : `Recalculadas ${targets.length} carrera(s) oficial(es) ACSM en orden cronológico.`,
      createdAt: generatedAt
    };

    const snapshotToSave: RatingsSnapshot = {
      ...currentSnapshot,
      source: currentSnapshot.source || 'gc-ratings-v1',
      storage: this.store.kind,
      strackerDbPath: currentSnapshot.strackerDbPath ?? strackerDbPath,
      generatedAt,
      recalculationLogs: [...currentSnapshot.recalculationLogs, ...warningLogs, finalLog]
    };

    await this.store.save(snapshotToSave);
    this.cachedSnapshot = snapshotToSave;

    return {
      ok: true,
      source: 'gc-ratings-v1',
      dryRun: false,
      generatedAt,
      totalDetected: targets.length,
      recalculatedEvents: targets.length - errors.length,
      recalculatedDrivers: new Set(recalculatedRows.map((row) => row.driverKey)).size,
      ratingsDeleted: targets.reduce((sum, target) => sum + target.existingRows.length, 0),
      ratingsCreated: recalculatedRows.length,
      errors,
      targets: targets.map((target) => ({
        eventId: target.eventId,
        eventName: target.eventName,
        track: target.track,
        date: target.eventDate,
        order: target.order,
        hasRatingApplied: target.hasRatingApplied,
        hasStrackerSource: target.hasStrackerSource,
        strackerSessionId: target.strackerSessionId,
        existingRows: target.existingRows.length
      })),
      message: errors.length
        ? `Recalculo oficial ACSM completado con ${errors.length} error(es).`
        : `Recalculadas ${targets.length} carrera(s) oficial(es) ACSM.`
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
      if (!session) throw new Error(`No existe la sesión sTracker ${sessionId}.`);
      if (String(session.SessionType || '').toLowerCase() !== 'race') {
        throw new Error(`La sesión ${sessionId} no es Race.`);
      }

      const drivers = readRaceDrivers(db, sessionId).filter((driver: PlainObject) =>
        safeFiniteNumber(driver.MaxLapCount || driver.LapRows, 0) > 0
      );

      const minDrivers = safeFiniteNumber(options.minDrivers, 2);
      if (drivers.length < minDrivers) {
        throw new Error(`La sesión ${sessionId} tiene ${drivers.length} piloto(s), mínimo ${minDrivers}.`);
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
        minDrivers: safeFiniteNumber(options.minDrivers, 2),
        minTotalLaps: safeFiniteNumber(options.minTotalLaps, 10)
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
          track: textValue(session.UiTrackName || session.Track, 'Circuito'),
          trackRaw: textValue(session.Track),
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
          recommended: !alreadyProcessed && !ignoredReview && !reviewedReview && safeFiniteNumber(session.PlayerCount, 0) >= 2 && safeFiniteNumber(session.LapCount, 0) >= 10
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

    // Mega Update v107:
    // El rating activo queda limitado a carreras oficiales ACSM completadas.
    // Las carreras sTracker no oficiales se mantienen para revisión/detalle/futuro,
    // pero no deben tocar SR/GSR salvo que se active explícitamente por variable.
    if (!manualStrackerRatingsEnabled()) {
      throw new Error(
        'Las carreras sTracker no oficiales no cuentan para SR/GSR en esta fase. Marca la sesión como revisada no puntuable o activa GC_ENABLE_MANUAL_STRACKER_RATINGS=true solo para pruebas controladas.'
      );
    }

    const event = await this.buildManualStrackerEventFromSession(sessionId, options) as PlainObject;
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const processedIds = new Set([...baseSnapshot.processedEventIds, ...baseSnapshot.eventResults.map((row) => row.eventId)]);
    const reviewedSessions = normalizeReviewedStrackerSessions(baseSnapshot);

    if (isIgnoredStrackerSession(baseSnapshot, sessionId)) {
      throw new Error(`La sesión ${sessionId} está ignorada. Recupérala antes de procesarla para SR/GSR.`);
    }

    if (processedIds.has(String(event.id))) {
      return {
        snapshot: baseSnapshot,
        mode: 'incremental' as const,
        processedEvents: 0,
        skippedEvents: [String(event.id)],
        newEvents: [],
        message: `La sesión ${sessionId} ya estaba procesada.`
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
      processedEventKeys: computed.processedEventKeys,
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
      newEvents: [{ id: String(event.id), name: textValue(event.name) }],
      message: `Procesada carrera sTracker ${sessionId}.`
    };
  }

  async reviewStrackerSession(sessionId: number, options: PlainObject = {}) {
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(null, this.store.kind);
    const eventId = strackerManualEventId(sessionId);
    const processedRows = baseSnapshot.eventResults.filter((row) => String(row.eventId) === eventId);

    if (processedRows.length) {
      throw new Error(`La sesión ${sessionId} ya cuenta para SR/GSR. Quítala antes de marcarla como no puntuable.`);
    }
    if (isIgnoredStrackerSession(baseSnapshot, sessionId)) {
      throw new Error(`La sesión ${sessionId} está ignorada. Recupérala antes de revisarla como no puntuable.`);
    }

    const event = await this.buildManualStrackerEventFromSession(sessionId, options) as PlainObject;
    const now = isoNow();
    const currentReviewed = normalizeReviewedStrackerSessions(baseSnapshot);
    const previous = currentReviewed.find((item) => item.sessionId === sessionId) || null;
    const review: RatingStrackerSessionReview = {
      eventId,
      sessionId,
      status: 'reviewed-unrated',
      ratingEligible: false,
      reason: textValue(options.reason) || previous?.reason || null,
      name: textValue(event.name, `Carrera no oficial ${sessionId}`),
      track: textValue(event.track, 'Carrera no oficial'),
      trackRaw: textValue(event.trackRaw || event.track, 'Carrera no oficial'),
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
      newEvents: [{ id: eventId, name: review.name || textValue(event.name) }],
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
        message: `No había resultados guardados para ${eventId}.`
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
      processedEventKeys: computed.processedEventKeys,
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
      throw new Error(`La sesión ${sessionId} ya está procesada. Primero quítala del SR/GSR y después podrás ignorarla.`);
    }
    if (reviewedRows.length) {
      throw new Error(`La sesión ${sessionId} ya está revisada como no puntuable. Quita esa revisión antes de ignorarla.`);
    }

    const strackerDbPath = resolveStrackerDbPath();
    if (!strackerDbPath) throw new Error('STRacker no configurado. Falta STRACKER_DB_PATH o data/stracker/stracker.db3.');

    const db = await openStrackerDb(strackerDbPath);
    try {
      const tableCheck = verifyStrackerTables(db);
      if (!tableCheck.ok) throw new Error(`Faltan tablas en stracker: ${tableCheck.missing.join(', ')}`);
      const session = readRaceSession(db, sessionId);
      if (!session) throw new Error(`No existe la sesión sTracker ${sessionId}.`);
      if (String(session.SessionType || '').toLowerCase() !== 'race') {
        throw new Error(`La sesión ${sessionId} no es Race.`);
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
      message: `Ignorada sesión sTracker ${sessionId}. No afecta al SR/GSR.`
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
        message: `La sesión sTracker ${sessionId} no estaba ignorada.`
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
      message: `Recuperada sesión sTracker ${sessionId}.`
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
        message: `La sesión sTracker ${sessionId} no estaba revisada como no puntuable.`
      };
    }

    const now = isoNow();
    const log: RecalculationLog = {
      id: uniqueId('gc_recalc'),
      eventId,
      mode: 'event',
      status: 'ok',
      message: `Quitada revisión no puntuable de ${eventId}. Puede volver a aparecer como pendiente si sigue en sTracker.`,
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
      message: `Quitada revisión no puntuable de la sesión ${sessionId}.`
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
      message: 'Auto-proceso sTracker desactivado por diseño. Las carreras fuera de ACSM se revisan manualmente en /admin/ratings.'
    };
  }




  private compactDiagnosticsEvent(event: PlainObject | null | undefined) {
    if (!event) return null;
    return {
      id: textValue(event.id || event.slug) || null,
      name: textValue(event.name, 'Carrera') || 'Carrera',
      track: textValue(event.track || event.trackRaw || event.name, 'Circuito'),
      trackRaw: textValue(event.trackRaw || event.track) || null,
      status: textValue(event.status) || null,
      href: textValue(event.href) || (event.id ? `/campeonato/ronda/${encodeURIComponent(String(event.id))}` : null),
      scheduledAt: nextEventFallbackIso(event) || textValue(event.scheduledAt || event.date) || null,
      completedAt: textValue(event.completedAt) || null,
      hasResults: Boolean(event.rawHasResults || ratingArray(event.raceResults).length),
      raceResults: ratingArray(event.raceResults).length,
      qualifyingResults: ratingArray(event.qualifyingResults).length,
      practiceResults: ratingArray(event.practiceResults).length,
      carSummary: textValue(event.carSummary || ratingArray(event.cars).join(', ')) || null
    };
  }

  private buildSrEconomyAudit(snapshot: RatingsSnapshot) {
    const rows = Array.isArray(snapshot.eventResults) ? snapshot.eventResults : [];
    const deltas = rows.map((row) => {
      const newSr = safeFiniteNumber(row.newSr, 0);
      return {
        eventId: String(row.eventId || ''),
        eventName: textValue(row.eventName, 'Carrera'),
        driverKey: String(row.driverKey || ''),
        displayName: textValue(row.displayName, 'Piloto'),
        oldSr: safeFiniteNumber(row.oldSr, 0),
        newSr,
        deltaSr: safeFiniteNumber(row.deltaSr, 0),
        srClass: textValue((row as any).srClass || (row as any).safetyClass || ratingClassFromSr(newSr), ''),
        strackerSessionId: safeFiniteNumber(row.strackerSessionId, 0) || null
      };
    });

    const count = deltas.length;
    const positiveRows = deltas.filter((row) => row.deltaSr > 0.005);
    const negativeRows = deltas.filter((row) => row.deltaSr < -0.005);
    const neutralRows = deltas.filter((row) => Math.abs(row.deltaSr) <= 0.005);
    const sum = deltas.reduce((total, row) => total + row.deltaSr, 0);
    const averageDeltaSr = count ? Math.round((sum / count) * 1000) / 1000 : 0;
    const positiveSum = positiveRows.reduce((total, row) => total + row.deltaSr, 0);
    const negativeSum = negativeRows.reduce((total, row) => total + row.deltaSr, 0);

    const sortedGains = [...positiveRows].sort((left, right) => right.deltaSr - left.deltaSr);
    const sortedLosses = [...negativeRows].sort((left, right) => left.deltaSr - right.deltaSr);

    const compact = (row: any) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      displayName: row.displayName,
      driverKey: row.driverKey,
      oldSr: Math.round(row.oldSr * 100) / 100,
      newSr: Math.round(row.newSr * 100) / 100,
      deltaSr: Math.round(row.deltaSr * 100) / 100,
      srClass: row.srClass || null,
      strackerSessionId: row.strackerSessionId
    });

    const warnings: string[] = [];
    const notes: string[] = [];

    if (sortedLosses[0] && sortedLosses[0].deltaSr < -8) {
      warnings.push('Hay pérdidas SR inferiores a -8. Revisar si corresponde a DSQ/carrera extremadamente sucia.');
    }
    if (sortedGains[0] && sortedGains[0].deltaSr > 1.5) {
      warnings.push('Hay ganancias SR superiores a +1.5. Revisar caps positivos.');
    }
    if (count >= 6 && Math.abs(averageDeltaSr) > 0.65) {
      warnings.push('La media de ΔSR es alta. Revisar equilibrio general del modelo.');
    }
    if (count >= 6 && negativeRows.length > positiveRows.length * 2) {
      warnings.push('Hay muchas más bajadas que subidas. Revisar si el modelo sigue siendo demasiado castigador.');
    }
    if (count >= 6 && positiveRows.length > negativeRows.length * 3 && negativeRows.length > 0) {
      warnings.push('Hay muchas más subidas que bajadas. Revisar si el modelo es demasiado generoso.');
    }

    const nearPositiveCap = sortedGains.filter((row) => row.deltaSr >= 1.45 && row.deltaSr <= 1.5);
    if (nearPositiveCap.length) {
      notes.push('Hay pilotos cerca del máximo positivo SR. Es normal en carreras muy limpias/largas, pero conviene observarlo con más carreras.');
    }

    return {
      count,
      positive: positiveRows.length,
      neutral: neutralRows.length,
      negative: negativeRows.length,
      averageDeltaSr,
      totalDeltaSr: Math.round(sum * 100) / 100,
      positiveDeltaTotal: Math.round(positiveSum * 100) / 100,
      negativeDeltaTotal: Math.round(negativeSum * 100) / 100,
      biggestGains: sortedGains.slice(0, 5).map(compact),
      biggestLosses: sortedLosses.slice(0, 5).map(compact),
      outliers: {
        gainsOverOnePoint: positiveRows.filter((row) => row.deltaSr > 1).sort((left, right) => right.deltaSr - left.deltaSr).map(compact),
        lossesUnderMinusFive: negativeRows.filter((row) => row.deltaSr < -5).sort((left, right) => left.deltaSr - right.deltaSr).map(compact)
      },
      notes,
      warnings
    };
  }

  private buildPreDeployStatus(input: {
    megaAuditWarnings: string[];
    srEconomyWarnings: string[];
    manualStrackerEventIds: string[];
    steamKeyDrivers: number;
    playerKeyDrivers: number;
    nameKeyDrivers: number;
    strackerLinkedResults: number;
    frozenSrResults: number;
    lowConfidenceResults: number;
    eventResults: number;
    pendingCompletedEvents: number;
  }) {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const checks = {
      acsmOnly: input.manualStrackerEventIds.length === 0,
      steamIdentity: input.nameKeyDrivers === 0,
      noFrozenSr: input.frozenSrResults === 0,
      noLowConfidence: input.lowConfidenceResults === 0,
      strackerLinked: input.eventResults === 0 || input.strackerLinkedResults > 0,
      srEconomyClean: input.srEconomyWarnings.length === 0,
      megaAuditClean: input.megaAuditWarnings.length === 0
    };

    if (!checks.acsmOnly) blockers.push('Hay carreras sTracker manuales dentro del rating activo.');
    if (!checks.strackerLinked) blockers.push('Hay resultados procesados pero ninguno enlazado a sTracker.');
    if (!checks.steamIdentity) warnings.push('Hay pilotos identificados solo por nombre. Revisar SteamID/GUID.');
    if (input.playerKeyDrivers > 0) warnings.push('Hay pilotos identificados por PlayerId. Es aceptable solo si falta SteamID/GUID.');
    if (!checks.noFrozenSr) warnings.push('Hay SR congelado por falta de telemetría o confianza.');
    if (!checks.noLowConfidence) warnings.push('Hay matches de baja confianza.');
    if (!checks.srEconomyClean) warnings.push(...input.srEconomyWarnings);
    if (!checks.megaAuditClean) warnings.push(...input.megaAuditWarnings);

    const ready = blockers.length === 0 && warnings.length === 0;

    return {
      ready,
      status: blockers.length ? 'blocked' : warnings.length ? 'review' : 'ready',
      label: blockers.length ? 'Bloqueado' : warnings.length ? 'Revisar' : 'Listo para Git/deploy',
      checks,
      blockers,
      warnings,
      summary: {
        driversByIdentity: {
          steam: input.steamKeyDrivers,
          player: input.playerKeyDrivers,
          name: input.nameKeyDrivers
        },
        eventResults: input.eventResults,
        strackerLinkedResults: input.strackerLinkedResults,
        frozenSrResults: input.frozenSrResults,
        lowConfidenceResults: input.lowConfidenceResults,
        pendingCompletedEvents: input.pendingCompletedEvents
      }
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

    const events = ratingArray(championship?.events);
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

    const manualStrackerEventIds = [...new Set(snapshot.eventResults
      .map((row) => String(row.eventId || ''))
      .filter((eventId) => eventId.startsWith('stracker:')))];
    const acsmEventIdsWithResults = [...new Set(snapshot.eventResults
      .map((row) => String(row.eventId || ''))
      .filter((eventId) => eventId && !eventId.startsWith('stracker:')))];
    const strackerLinkedResults = snapshot.eventResults.filter((row) => safeFiniteNumber(row.strackerSessionId, 0) > 0);
    const frozenSrResults = snapshot.eventResults.filter((row) => {
      const notes = Array.isArray(row.notes) ? row.notes.join(' ') : String(row.notes || '');
      const lapNotes = ratingArray(row.lapsDetail).map((lap: PlainObject) => String(lap.notes || '')).join(' ');
      return notes.includes('SR v2 congelado') ||
        notes.includes('Telemetría sTracker no usada') ||
        lapNotes.includes('SR v2 congelado') ||
        lapNotes.includes('sin telemetría sTracker fiable');
    });
    const lowConfidenceResults = snapshot.eventResults.filter((row) => {
      const notes = Array.isArray(row.notes) ? row.notes.join(' ') : String(row.notes || '');
      return notes.includes('baja confianza') ||
        notes.includes('low-confidence') ||
        notes.includes('Telemetría sTracker no usada');
    });
    const steamKeyDrivers = snapshot.drivers.filter((driver) => String(driver.driverKey || '').startsWith('steam:'));
    const playerKeyDrivers = snapshot.drivers.filter((driver) => String(driver.driverKey || '').startsWith('player:'));
    const nameKeyDrivers = snapshot.drivers.filter((driver) => String(driver.driverKey || '').startsWith('name:'));
    const manualStrackerRatingsEnabled = ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(process.env.GC_ENABLE_MANUAL_STRACKER_RATINGS || '').trim().toLowerCase());
    const megaAuditWarnings: string[] = [];
    if (manualStrackerEventIds.length) megaAuditWarnings.push('Hay carreras sTracker manuales dentro del rating activo. En esta fase debería ser ACSM-only.');
    if (nameKeyDrivers.length) megaAuditWarnings.push('Hay pilotos identificados solo por nombre. Conviene revisar SteamID/GUID.');
    if (playerKeyDrivers.length) megaAuditWarnings.push('Hay pilotos identificados por PlayerId porque no se encontró SteamID/GUID.');
    if (snapshot.eventResults.length && !strackerLinkedResults.length) megaAuditWarnings.push('No hay resultados enlazados a sTracker. El SR podría estar congelado o usando fallback.');
    const sourceIsolation = buildRatingSourceIsolationAuditV1(snapshot);
    if (!sourceIsolation.ready) {
      megaAuditWarnings.push('Los resultados aún no están aislados por Liga/GT4. Ejecuta /admin/integridad-ratings/fuentes.');
    }
    const duplicateAudit = {
      ...buildRatingDuplicateAuditV1(snapshot.eventResults),
      destructiveCleanupApplied: ratingArray<RecalculationLog>(snapshot.recalculationLogs)
        .some((log) => textValue(log.message).includes(GC_PHASE4B_CLEANUP_LOG_MARKER_V1))
    };
    if (duplicateAudit.duplicateGroups > 0) megaAuditWarnings.push(`Hay ${duplicateAudit.duplicateGroups} grupo(s) de resultados duplicados. La vista pública los está suprimiendo sin borrar datos.`);

    let strackerCandidateCount = 0;
    try {
      const candidatesPayload = await this.getStrackerRaceCandidates({ limit: 30, minDrivers: 2, minTotalLaps: 10 });
      strackerCandidateCount = ratingArray(candidatesPayload.candidates).filter((candidate: PlainObject) => candidate.recommended && !candidate.alreadyProcessed).length;
    } catch {
      strackerCandidateCount = 0;
    }

    const srEconomyAudit = this.buildSrEconomyAudit(snapshot);
    const preDeployStatus = this.buildPreDeployStatus({
      megaAuditWarnings,
      srEconomyWarnings: ratingArray(srEconomyAudit.warnings).map((item) => String(item)),
      manualStrackerEventIds,
      steamKeyDrivers: steamKeyDrivers.length,
      playerKeyDrivers: playerKeyDrivers.length,
      nameKeyDrivers: nameKeyDrivers.length,
      strackerLinkedResults: strackerLinkedResults.length,
      frozenSrResults: frozenSrResults.length,
      lowConfidenceResults: lowConfidenceResults.length,
      eventResults: snapshot.eventResults.length,
      pendingCompletedEvents: pendingCompletedEvents.length
    });

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
      megaAudit: {
        ok: megaAuditWarnings.length === 0,
        auditVersion: 'gc-mega-update-v121',
        acsmOnlyGuard: {
          active: true,
          manualStrackerRatingsEnabled,
          manualStrackerEventsInRating: manualStrackerEventIds
        },
        counts: {
          drivers: snapshot.drivers.length,
          processedEventIds: processedIds.length,
          acsmEventsWithResults: acsmEventIdsWithResults.length,
          eventResults: snapshot.eventResults.length,
          strackerLinkedResults: strackerLinkedResults.length,
          frozenSrResults: frozenSrResults.length,
          lowConfidenceResults: lowConfidenceResults.length,
          ignoredStrackerSessions: ignoredStrackerSessions.length,
          reviewedStrackerSessions: reviewedStrackerSessions.length
        },
        srEconomy: srEconomyAudit,
        identity: {
          steamKeyDrivers: steamKeyDrivers.length,
          playerKeyDrivers: playerKeyDrivers.length,
          nameKeyDrivers: nameKeyDrivers.length,
          fallbackDrivers: [...playerKeyDrivers, ...nameKeyDrivers].slice(0, 20).map((driver) => ({
            driverKey: driver.driverKey,
            displayName: driver.displayName,
            steamGuid: driver.steamGuid || null,
            strackerPlayerId: driver.strackerPlayerId || null
          }))
        },
        telemetry: {
          minMatchConfidence: safeFiniteNumber(process.env.GC_SR_MIN_STRACKER_MATCH_CONFIDENCE, 0.55),
          frozenExamples: frozenSrResults.slice(0, 10).map((row) => ({
            eventId: row.eventId,
            displayName: row.displayName,
            driverKey: row.driverKey,
            strackerSessionId: row.strackerSessionId || null,
            deltaSr: row.deltaSr,
            notes: Array.isArray(row.notes) ? row.notes : []
          })),
          lowConfidenceExamples: lowConfidenceResults.slice(0, 10).map((row) => ({
            eventId: row.eventId,
            displayName: row.displayName,
            driverKey: row.driverKey,
            strackerSessionId: row.strackerSessionId || null,
            notes: Array.isArray(row.notes) ? row.notes : []
          }))
        },
        warnings: megaAuditWarnings
      },
      dataIntegrity: duplicateAudit,
      sourceIsolation,
      preDeployStatus,
      pendingCompletedEvents,
      nextEvent: this.compactDiagnosticsEvent(nextEvent),
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

  async getChampionshipPayload(_force = false, sourceInput: unknown = 'weekly') {
    const source = normalizeChampionshipSource(sourceInput);
    if (_force) this.cachedSnapshot = null;
    const snapshot = await this.getSnapshot();
    const runtimeSnapshot = buildRuntimeIntegritySnapshotV1(snapshot);
    const acsm = await fetchChampionship(source);
    const championship = enrichChampionship(acsm.championship, runtimeSnapshot);

    try {
      const candidatesPayload = await this.getStrackerRaceCandidates({ limit: 80, minDrivers: 2, minTotalLaps: 10 });
      const detectedEvents = ratingArray(candidatesPayload.candidates)
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
      leaderboard: buildLeaderboard(runtimeSnapshot.drivers),
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

    const requestedSourceRaw = String(
      options.source || options.server || options.championship || ''
    ).trim();
    const explicitSource = requestedSourceRaw
      ? explicitChampionshipSourceV1(requestedSourceRaw)
      : null;

    if (requestedSourceRaw && !explicitSource) {
      return {
        ok: false,
        code: 'INVALID_EVENT_SOURCE',
        source: 'gc-ratings-v1:strict-source',
        requestedSource: requestedSourceRaw,
        allowedSources: ['weekly', 'gt4'],
        message: `Fuente no válida: ${requestedSourceRaw}. Usa weekly o gt4.`
      };
    }

    // Fuente explícita: solo se consulta esa competición.
    // URL antigua sin source: se consultan ambas y solo se acepta una coincidencia única.
    const sourceCandidates: StrictChampionshipSourceV1[] = explicitSource
      ? [explicitSource]
      : ['weekly', 'gt4'];

    const matches: Array<{
      sourceCandidate: StrictChampionshipSourceV1;
      payload: PlainObject;
      event: PlainObject;
    }> = [];

    for (const sourceCandidate of sourceCandidates) {
      const payload = await this.getChampionshipPayload(false, sourceCandidate);
      const allEvents = [
        ...ratingArray(payload.championship.events),
        ...ratingArray(payload.championship.strackerSeries?.processedEvents),
        ...ratingArray(payload.championship.strackerSeries?.reviewedEvents)
      ];
      const event = allEvents.find((item: PlainObject) => String(item.id) === normalizedEventId);
      if (event) matches.push({ sourceCandidate, payload, event });
    }

    if (!matches.length) return null;

    if (!explicitSource && matches.length > 1) {
      return {
        ok: false,
        code: 'AMBIGUOUS_EVENT_SOURCE',
        source: 'gc-ratings-v1:strict-source',
        eventId: normalizedEventId,
        matchingSources: matches.map((match) => match.sourceCandidate),
        message: 'El UUID existe en más de una competición. Añade ?source=weekly o ?source=gt4.'
      };
    }

    const match = matches[0];
    return {
      ok: true,
      source: `gc-ratings-v1:${match.sourceCandidate}`,
      eventSource: match.sourceCandidate,
      sourceResolution: explicitSource ? 'explicit' : 'auto-unique',
      requestedSource: explicitSource || null,
      generatedAt: match.payload.generatedAt,
      event: {
        ...match.event,
        sourceKey: match.event.sourceKey || match.sourceCandidate,
        championshipSource: match.event.championshipSource || match.sourceCandidate
      },
      diagnostics: match.payload.diagnostics
    };
  }

  async getDriver(driverKey: string) {
    const storedSnapshot = await this.getSnapshot();
    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);
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
    const storedSnapshot = await this.getSnapshot();
    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);
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
    const storedSnapshot = await this.getSnapshot();
    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);
    const fallback = snapshot.drivers.find((driver) => driver.strackerPlayerId === playerId);
    return fallback ? this.getDriver(fallback.driverKey) : null;
  }
}

let singleton: GcRatingsService | null = null;

export function getGcRatingsService() {
  if (!singleton) singleton = new GcRatingsService();
  return singleton;
}

// GC_GT4_RICARDO_TORMO_SYNC_FIX_V1
