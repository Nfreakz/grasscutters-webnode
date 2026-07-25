import { clamp, normalizeIdentity, normalizeTrack, numberValue, sessionTimeMs, textValue } from './utils';
import type { MatchDebug, PlainObject } from './types';

function eventTrackKeys(event: PlainObject) {
  return [...new Set(
    [event.trackRaw, event.track, event.trackSlug, event.name]
      .map(normalizeTrack)
      .filter(Boolean)
  )];
}

function sessionTrackKeys(session: PlainObject) {
  return [...new Set(
    [session.Track, session.UiTrackName]
      .map(normalizeTrack)
      .filter(Boolean)
  )];
}

function trackMatchQuality(event: PlainObject, session: PlainObject) {
  const eventKeys = eventTrackKeys(event);
  const sessionKeys = sessionTrackKeys(session);
  if (!eventKeys.length || !sessionKeys.length) return 0;

  for (const eventKey of eventKeys) {
    for (const sessionKey of sessionKeys) {
      if (eventKey === sessionKey) return 3;
      if (eventKey.includes(sessionKey) || sessionKey.includes(eventKey)) return 2;
    }
  }

  return -1;
}

export function identifyRaceSession(event: PlainObject, sessions: PlainObject[]) {
  const targetMs = sessionTimeMs(event.completedAt || event.scheduledAt || event.startedAt || event.date);
  const officialRows = Array.isArray(event.raceResults) ? event.raceResults : [];
  const officialDriverCount = officialRows.length;
  const officialLapTotal = officialRows.reduce((sum, row) => sum + numberValue(row.numLaps, 0), 0);

  const ranked = sessions
    .map((session) => {
      const startMs = numberValue(session.StartTimeDate, 0) * 1000;
      const timeDiffSeconds = targetMs && startMs
        ? Math.round(Math.abs(startMs - targetMs) / 1000)
        : 0;
      const driverDiff = officialDriverCount
        ? Math.abs(numberValue(session.PlayerCount, 0) - officialDriverCount)
        : 0;
      const lapDiff = officialLapTotal
        ? Math.abs(numberValue(session.LapCount, 0) - officialLapTotal)
        : 0;
      const trackQuality = trackMatchQuality(event, session);

      const trackAdjustment = trackQuality === 3
        ? -7200
        : trackQuality === 2
          ? -3600
          : trackQuality === 0
            ? 0
            : 21600;

      const score =
        timeDiffSeconds +
        driverDiff * 180 +
        lapDiff * 2 +
        trackAdjustment;

      return {
        ...session,
        _timeDiffSeconds: timeDiffSeconds,
        _driverDiff: driverDiff,
        _lapDiff: lapDiff,
        _trackMatchQuality: trackQuality,
        _matchScore: score
      };
    })
    .filter((session) =>
      !targetMs ||
      !session._timeDiffSeconds ||
      session._timeDiffSeconds <= 72 * 60 * 60
    )
    .sort((left, right) =>
      numberValue(left._matchScore, 0) - numberValue(right._matchScore, 0)
    );

  return ranked[0] || null;
}

function carMatches(result: PlainObject, candidate: PlainObject) {
  const expected = normalizeIdentity(result.model || result.carModel || result.car || '');
  const folder = normalizeIdentity(candidate.CarFolder || '');
  const ui = normalizeIdentity(candidate.UiCarName || '');
  if (!expected) return true;
  return [folder, ui].some((value) => value && (value.includes(expected) || expected.includes(value)));
}

function resultGuid(result: PlainObject) {
  return normalizeIdentity(result.guid || result.steamGuid || result.SteamGuid || result.driverGuid || '');
}

function candidateGuid(candidate: PlainObject) {
  return normalizeIdentity(candidate.StrackerGuid || candidate.SteamGuid || candidate.Guid || '');
}

function guidMatches(result: PlainObject, candidate: PlainObject) {
  const official = resultGuid(result);
  const stracker = candidateGuid(candidate);
  return Boolean(official && stracker && official === stracker);
}

function candidateScore(result: PlainObject, candidate: PlainObject) {
  const resultLaps = numberValue(result.numLaps, 0);
  const candidateLaps = numberValue(candidate.MaxLapCount, 0) || numberValue(candidate.LapRows, 0);
  const lapDiff = Math.abs(resultLaps - candidateLaps);
  const resultBest = numberValue(result.bestLapMs, 0);
  const candidateBest = numberValue(candidate.BestLapMs, 0);
  const bestDiff = resultBest && candidateBest ? Math.abs(resultBest - candidateBest) : 30000;
  const carMatch = carMatches(result, candidate);
  const nameMatch = normalizeIdentity(result.name) === normalizeIdentity(candidate.StrackerName);
  const hasOfficialGuid = Boolean(resultGuid(result));
  const hasCandidateGuid = Boolean(candidateGuid(candidate));
  const guidMatch = guidMatches(result, candidate);

  let score = 0;

  // Mega Update v109:
  // SteamID/GUID manda. Si ACSM y sTracker tienen GUID y coinciden, el match es casi seguro.
  if (guidMatch) score -= 120000;
  if (hasOfficialGuid && hasCandidateGuid && !guidMatch) score += 120000;

  score += lapDiff * 4500;
  score += Math.min(bestDiff, 45000);
  if (carMatch) score -= 3000;
  if (!carMatch) score += 4000;
  if (nameMatch) score -= 12000;

  return score;
}

export function matchOfficialToStracker(event: PlainObject, session: PlainObject | null, strackerDrivers: PlainObject[]) {
  const used = new Set<number>();
  const officialRows = Array.isArray(event.raceResults) ? event.raceResults : [];

  return officialRows.map((result) => {
    const ranked = strackerDrivers
      .filter((candidate) => !used.has(numberValue(candidate.PlayerInSessionId, 0)))
      .map((candidate) => ({ candidate, score: candidateScore(result, candidate) }))
      .sort((left, right) => left.score - right.score);

    const best = ranked[0]?.candidate || null;
    if (best) used.add(numberValue(best.PlayerInSessionId, 0));

    const bestLapDiffMs = best ? Math.abs(numberValue(result.bestLapMs, 0) - numberValue(best.BestLapMs, 0)) : null;
    const lapDiff = best ? Math.abs(numberValue(result.numLaps, 0) - numberValue(best.MaxLapCount || best.LapRows, 0)) : null;
    const steamGuidMatch = best ? guidMatches(result, best) : false;
    const confidence = best
      ? steamGuidMatch
        ? 1
        : clamp(1 - (numberValue(bestLapDiffMs, 0) / 5000) - numberValue(lapDiff, 0) * 0.12, 0, 1)
      : 0;

    const match: MatchDebug = {
      confidence: Math.round(confidence * 100) / 100,
      method: best ? (steamGuidMatch ? 'steamGuid+bestLap+lapCount+car+name' : 'bestLap+lapCount+car+name') : 'unmatched',
      bestLapDiffMs,
      lapDiff,
      strackerPlayerInSessionId: best ? numberValue(best.PlayerInSessionId, 0) : null,
      strackerSessionId: session ? numberValue(session.SessionId, 0) : null,
      steamGuidMatch
    } as MatchDebug & { steamGuidMatch?: boolean };

    return { result, stracker: best, match };
  });
}

export function officialDriverName(result: PlainObject) {
  return textValue(result.name || result.driverName || result.DriverName, 'Piloto');
}

// GC_GT4_RICARDO_TORMO_SYNC_FIX_V1
