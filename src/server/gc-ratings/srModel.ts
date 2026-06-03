import { clamp, ratingClassFromSr, roundTo, safeFiniteInt, safeFiniteNumber, uniqueId } from './utils';
import type { PlainObject, RatingIncident, RatingLapDetail } from './types';

const SR_WEIGHTS = {
  offTrack: -0.4,
  carContact: -1.5,
  envContact: -0.8,
  deficitLap: -0.4,
  dnf: -3,
  dsq: -10,
  officialPenaltyMild: -1,
  officialPenaltyMajor: -3,
  cleanFull: 0.8,
  cleanPartial: 0.3
};

function safeSrNumber(value: unknown, fallback = 0) {
  return safeFiniteNumber(value, fallback);
}

function safeSrCount(value: unknown) {
  return safeFiniteInt(value, 0);
}

function pushIncident(
  incidents: RatingIncident[],
  eventId: string,
  eventResultId: string,
  driverKey: string,
  type: RatingIncident['type'],
  lapNumber: number | null,
  count: number,
  srDelta: number,
  description: string,
  source: string
) {
  const safeCount = safeSrCount(count);
  const safeDelta = roundTo(safeSrNumber(srDelta, 0));
  if (!safeCount && safeDelta >= 0) return;
  incidents.push({
    id: uniqueId('gc_inc'),
    eventResultId,
    eventId,
    driverKey,
    lapNumber,
    type,
    count: safeCount,
    srDelta: safeDelta,
    description,
    source
  });
}

export function buildSrComputation(input: {
  eventId: string;
  eventResultId: string;
  driverKey: string;
  oldSr: number;
  laps: PlainObject[];
  officialResult: PlainObject;
  matchedRow: PlainObject | null;
  maxRaceLaps: number;
}) {
  const incidents: RatingIncident[] = [];
  const lapDetails: RatingLapDetail[] = [];
  const oldSr = safeSrNumber(input.oldSr, 80);
  const maxRaceLaps = Math.max(0, safeSrCount(input.maxRaceLaps));
  let delta = 0;

  for (const lap of input.laps) {
    let lapDelta = 0;
    const lapNumber = safeSrCount(lap.lapNumber) || null;
    const cuts = safeSrCount(lap.cuts);
    const carContacts = safeSrCount(lap.collisionsCar);
    const envContacts = safeSrCount(lap.collisionsEnv);
    const notes = [...(Array.isArray(lap.notes) ? lap.notes : [])];

    if (cuts > 0) {
      const amount = roundTo(cuts * SR_WEIGHTS.offTrack);
      lapDelta += amount;
      delta += amount;
      pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'OFF_TRACK', lapNumber, cuts, amount, `Vuelta ${lapNumber} · Salida de pista x${cuts} · ${amount.toFixed(2)} SR`, 'stracker');
    }

    if (carContacts > 0) {
      const amount = roundTo(carContacts * SR_WEIGHTS.carContact);
      lapDelta += amount;
      delta += amount;
      pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'CAR_CONTACT', lapNumber, carContacts, amount, `Vuelta ${lapNumber} · Contacto con coche x${carContacts} · ${amount.toFixed(2)} SR`, 'stracker');
    }

    if (envContacts > 0) {
      const amount = roundTo(envContacts * SR_WEIGHTS.envContact);
      lapDelta += amount;
      delta += amount;
      pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'ENV_CONTACT', lapNumber, envContacts, amount, `Vuelta ${lapNumber} · Muro x${envContacts} · ${amount.toFixed(2)} SR`, 'stracker');
    }

    if (lap.invalidNoCut) notes.push('Vuelta invalida informativa');

    lapDetails.push({
      id: uniqueId('gc_lap'),
      eventResultId: input.eventResultId,
      lapNumber: safeSrCount(lap.lapNumber),
      lapTimeMs: safeSrCount(lap.lapTimeMs),
      valid: Boolean(lap.valid),
      cuts,
      collisionsCar: carContacts,
      collisionsEnv: envContacts,
      srDelta: roundTo(lapDelta),
      notes: notes.join(' · ')
    });
  }

  const officialLaps = safeSrCount(input.officialResult.numLaps);
  const lapsDeficit = Math.max(0, maxRaceLaps - officialLaps);
  const officialStatus = String(input.officialResult.status || '').toUpperCase();
  const dnf = Boolean(input.officialResult.dnf) || officialStatus.includes('DNF') || officialStatus.includes('RETI') || (maxRaceLaps >= 3 && lapsDeficit >= 2);
  const dsq = Boolean(input.officialResult.disqualified || input.officialResult.dsq);
  const penaltyTimeMs = safeSrNumber(input.officialResult.penaltyTimeMs, 0);
  const lapPenalty = safeSrNumber(input.officialResult.lapPenalty, 0);

  if (lapsDeficit > 0) {
    const deficitPenalty = roundTo(Math.max(-3, lapsDeficit * SR_WEIGHTS.deficitLap));
    delta += deficitPenalty;
    pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'DNF', null, lapsDeficit, deficitPenalty, `Déficit de vueltas x${lapsDeficit} · ${deficitPenalty.toFixed(2)} SR`, 'official');
  }

  if (dnf) {
    delta += SR_WEIGHTS.dnf;
    pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'DNF', null, 1, SR_WEIGHTS.dnf, `DNF · ${SR_WEIGHTS.dnf.toFixed(2)} SR`, 'official');
  }

  if (dsq) {
    delta += SR_WEIGHTS.dsq;
    pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'DSQ', null, 1, SR_WEIGHTS.dsq, `DSQ · ${SR_WEIGHTS.dsq.toFixed(2)} SR`, 'official');
  }

  if (penaltyTimeMs > 0 || lapPenalty > 0) {
    const penaltyDelta = lapPenalty > 0 || penaltyTimeMs >= 15000 ? SR_WEIGHTS.officialPenaltyMajor : SR_WEIGHTS.officialPenaltyMild;
    delta += penaltyDelta;
    pushIncident(incidents, input.eventId, input.eventResultId, input.driverKey, 'OFFICIAL_PENALTY', null, 1, penaltyDelta, `Sanción oficial · ${penaltyDelta.toFixed(2)} SR`, 'official');
  }

  const hasNegativeIncidents = incidents.some((incident) => incident.srDelta < 0);
  let cleanRace = false;
  if (!hasNegativeIncidents) {
    const bonus = lapsDeficit === 0 && !dnf && !dsq ? SR_WEIGHTS.cleanFull : SR_WEIGHTS.cleanPartial;
    delta += bonus;
    cleanRace = bonus > 0;
  }

  delta = roundTo(safeSrNumber(delta, 0));
  const rawNewSr = safeSrNumber(oldSr + delta, oldSr);
  const newSr = roundTo(clamp(rawNewSr, 0, 100));
  return {
    oldSr: roundTo(oldSr),
    newSr,
    deltaSr: delta,
    srClass: ratingClassFromSr(newSr),
    cleanRace,
    incidentPoints: roundTo(Math.abs(incidents.filter((item) => item.srDelta < 0).reduce((sum, item) => sum + item.srDelta, 0))),
    incidents,
    lapDetails
  };
}
