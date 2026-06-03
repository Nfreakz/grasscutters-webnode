import { identifyRaceSession, matchOfficialToStracker, officialDriverName } from './acsmMatcher';
import { applyGsrUpdates, initialGsrState } from './gsrModel';
import { createRatingStore } from './ratingStore';
import { buildSrComputation } from './srModel';
import { findRaceSessions, openStrackerDb, readRaceDrivers, readRaceLaps, resolveStrackerDbPath, verifyStrackerTables } from './strackerReader';
import type { DriverRatingState, PlainObject, RatingEventResult, RatingsSnapshot, RecalculationLog } from './types';
import { driverKeyFromParts, ensureArray, formatLapMs, isoNow, parseDateMs, ratingClassFromGsr, ratingClassFromSr, roundTo, safeFiniteNumber, textValue, uniqueId } from './utils';

function normalizeOrigin(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
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
    recalculationLogs: []
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
  const lastResultByDriver = new Map<string, RatingEventResult>();

  snapshot.eventResults.forEach((result) => {
    const bucket = resultsByEvent.get(result.eventId) || [];
    bucket.push(result);
    resultsByEvent.set(result.eventId, bucket);

    const previous = lastResultByDriver.get(result.driverKey);
    if (!previous || parseDateMs(result.eventDate || result.processedAt) >= parseDateMs(previous.eventDate || previous.processedAt)) {
      lastResultByDriver.set(result.driverKey, result);
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
    const lastResult = rating ? lastResultByDriver.get(rating.driverKey) || null : null;
    return {
      ...row,
      driverKey: rating?.driverKey ?? row.driverKey ?? null,
      hasPersistentRating: Boolean(rating && rating.racesCount > 0),
      srScore: rating?.racesCount ? rating.srScore : null,
      srClass: rating?.racesCount ? rating.srClass : null,
      gsrRating: rating?.racesCount ? rating.gsrRating : null,
      gsrClass: rating?.racesCount ? rating.gsrClass : null,
      incidentPointsTotal: rating?.racesCount ? rating.incidentPointsTotal : null,
      wins: rating?.wins ?? row.wins ?? 0,
      podiums: rating?.podiums ?? row.podiums ?? 0,
      lastResult: lastResult ? {
        eventId: lastResult.eventId,
        eventName: lastResult.eventName,
        position: lastResult.position,
        points: lastResult.points
      } : null,
      safetyRating: rating?.racesCount ? { score: rating.srScore, class: rating.srClass } : null
    };
  });

  const events = ensureArray(championship.events).map((event: PlainObject) => {
    const eventResults = (resultsByEvent.get(String(event.id)) || []).sort((left, right) => left.position - right.position);
    const officialRaceResults = ensureArray(event.raceResults);
    return {
      ...event,
      raceResults: eventResults.length ? eventResults.map((result) => {
        const official = officialRaceResults.find((row: PlainObject) =>
          safeFiniteNumber(row.position, 0) === result.position ||
          textValue(row.guid) === textValue(result.steamGuid) ||
          textValue(row.name).toLowerCase() === textValue(result.displayName).toLowerCase()
        ) || {};
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
  });

  return { ...championship, standings, events };
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
        const session = context.strackerAvailable && context.db ? identifyRaceSession(event, context.sessions) : null;
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
            name: officialDriverName(result)
          });
          const current = states.get(driverKey) || stateFromRow({
            driverKey,
            displayName: officialDriverName(result),
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
            eventName: textValue(event.name, `Ronda ${event.index}`),
            eventDate: event.completedAt || event.scheduledAt || null,
            strackerSessionId: session ? Number(session.SessionId) : null,
            driverKey,
            steamGuid: stracker?.StrackerGuid ?? result.guid ?? null,
            strackerPlayerId: stracker?.PlayerId ?? null,
            displayName: officialDriverName(result),
            car: textValue(result.model || result.carModel || stracker?.UiCarName || stracker?.CarFolder),
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

  async processNewEvents() {
    const acsm = await fetchChampionship();
    const championship = acsm.championship;
    const baseSnapshot = (await this.loadSnapshot()) || createEmptySnapshot(championship, this.store.kind);
    const allCompleted = completedEvents(championship);
    const processedIds = new Set([...baseSnapshot.processedEventIds, ...baseSnapshot.eventResults.map((row) => row.eventId)]);
    const newEvents = allCompleted.filter((event: PlainObject) => !processedIds.has(String(event.id)));

    if (!newEvents.length) {
      const noopLog: RecalculationLog = {
        id: uniqueId('gc_recalc'),
        eventId: null,
        mode: 'incremental',
        status: 'ok',
        message: 'Sin eventos nuevos',
        createdAt: isoNow()
      };
      const snapshot = {
        ...baseSnapshot,
        championshipId: textValue(championship.id, baseSnapshot.championshipId),
        championshipName: textValue(championship.name, baseSnapshot.championshipName),
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
        message: 'Sin eventos nuevos'
      };
    }

    const computed = await this.computeEventUpdates(baseSnapshot, newEvents, 'incremental');
    const statusMessage = computed.context.srMode === 'stracker'
      ? `Procesados ${newEvents.length} evento(s) nuevos en modo incremental.`
      : `Procesados ${newEvents.length} evento(s) nuevos con SR parcial desde ACSM.`;
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
    const baseSnapshot = createEmptySnapshot(championship, this.store.kind);
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
    const strackerDbPath = resolveStrackerDbPath();
    const hasAcsmPartial = snapshot.eventResults.some((row) => row.match.method.includes('acsm'));
    const hasStracker = snapshot.eventResults.some((row) => !row.match.method.includes('acsm'));
    const srMode = hasStracker ? 'stracker' : hasAcsmPartial ? 'acsm-partial' : 'none';

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
      lastAutoProcessAt: lastAutoLog?.createdAt ?? null,
      lastAutoProcessStatus: lastAutoLog?.status ?? null,
      lastAutoProcessMessage: lastAutoLog?.message ?? null,
      canProcessNewEvents: pendingCompletedEvents.length > 0,
      reason: pendingCompletedEvents.length > 0
        ? 'hay eventos completed pendientes'
        : nextEvent
          ? 'sin eventos completed pendientes'
          : 'sin proxima carrera',
      unmatchedCount: unmatched.length,
      matchingErrors: unmatched.slice(0, 20)
    };
  }

  async getChampionshipPayload(_force = false) {
    const snapshot = await this.getSnapshot();
    const acsm = await fetchChampionship();
    const championship = enrichChampionship(acsm.championship, snapshot);
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

  async getEvent(eventId: string) {
    const payload = await this.getChampionshipPayload(false);
    const event = ensureArray(payload.championship.events).find((item: PlainObject) => String(item.id) === String(eventId));
    if (!event) return null;
    return {
      ok: true,
      source: 'gc-ratings-v1',
      generatedAt: payload.generatedAt,
      event,
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
