import { clamp, ratingClassFromSr, roundTo, safeFiniteInt, safeFiniteNumber, uniqueId } from './utils';
import type { PlainObject, RatingIncident, RatingLapDetail } from './types';

const SR_MODEL_VERSION = 'gc-sr-v2-clean-time-v121';

const SR_V2 = {
  minSafetyMinutes: 3,
  cleanMinuteBonus: 0.04,
  cleanMinuteBonusCap: 0.8,
  finishBonus: 0.12,
  noCarContactBonus: 0.2,
  noCutBonus: 0.15,
  cleanStreakBlock: 5,
  cleanStreakBonus: 0.1,
  cleanStreakBonusCap: 0.3,
  incidentPenaltyScale: 3,
  cutIncidentPoints: 1,
  envIncidentPoints: 1.5,
  carIncidentPoints: 3,
  firstCarContactPenalty: 0.25,
  extraCarContactPenalty: 0.15,
  carContactPenaltyCap: 1.5,
  lapDeficitPenalty: 0.15,
  lapDeficitPenaltyCap: 1.5,
  dnfLatePenalty: 0.7,
  dnfMediumPenalty: 1.2,
  dnfEarlyPenalty: 2,
  dsqPenalty: 8,
  officialPenaltyMild: 0.75,
  officialPenaltyMajor: 2,
  positiveCapNormal: 1.2,
  positiveCapLongClean: 1.5,
  positiveCapMinorIncident: 0.95,
  positiveCapOneCarContact: 0.9,
  positiveCapTwoCarContacts: 0.5,
  positiveCapThreeCarContacts: 0.2,
  positiveCapDirty: 0,
  negativeCapNormal: -5,
  negativeCapDirty: -8,
  negativeCapExtreme: -12
};

function safeSrNumber(value: unknown, fallback = 0) {
  return safeFiniteNumber(value, fallback);
}

function safeSrCount(value: unknown) {
  return safeFiniteInt(value, 0);
}

function safeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(text);
}

function lapPitMs(lap: PlainObject) {
  return Math.max(
    0,
    safeSrNumber(lap.timeInPitLaneMs ?? lap.TimeInPitLane, 0),
    safeSrNumber(lap.timeInPitMs ?? lap.TimeInPit, 0)
  );
}

function lapEffectiveMs(lap: PlainObject) {
  const lapTimeMs = safeSrNumber(lap.lapTimeMs ?? lap.LapTime, 0);
  if (!lapTimeMs || lapTimeMs <= 0) return 0;
  return Math.max(0, lapTimeMs - lapPitMs(lap));
}

function lapHasEsc(lap: PlainObject) {
  return safeBoolean(lap.escPressed ?? lap.ESCPressed);
}

function lapIsClean(lap: PlainObject) {
  return (
    safeSrCount(lap.cuts ?? lap.Cuts) <= 0 &&
    safeSrCount(lap.collisionsCar ?? lap.CollisionsCar) <= 0 &&
    safeSrCount(lap.collisionsEnv ?? lap.CollisionsEnv) <= 0 &&
    !lapHasEsc(lap) &&
    lapEffectiveMs(lap) > 0
  );
}

function clampDelta(value: number, negativeCap: number, positiveCap: number) {
  return clamp(value, negativeCap, positiveCap);
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

function completionPenalty(completionRatio: number, forcedDnf: boolean) {
  if (!forcedDnf && completionRatio >= 0.8) return 0;
  if (completionRatio >= 0.7) return SR_V2.dnfLatePenalty;
  if (completionRatio >= 0.4) return SR_V2.dnfMediumPenalty;
  return SR_V2.dnfEarlyPenalty;
}

function positiveCapFor(input: {
  safetyMinutes: number;
  cuts: number;
  collisionsCar: number;
  collisionsEnv: number;
  completionRatio: number;
  dnf: boolean;
  dsq: boolean;
}) {
  // v101: un roce aislado no debe convertir automáticamente una buena carrera en neutra.
  // Permitimos que 1-2 contactos leves sigan pudiendo acabar en positivo si hay muchos minutos limpios.
  if (input.dsq || input.dnf || input.completionRatio < 0.8) return SR_V2.positiveCapDirty;
  if (input.collisionsCar >= 4) return SR_V2.positiveCapDirty;
  if (input.collisionsCar === 3) return SR_V2.positiveCapThreeCarContacts;
  if (input.collisionsCar === 2) return SR_V2.positiveCapTwoCarContacts;
  if (input.collisionsCar === 1) return SR_V2.positiveCapOneCarContact;
  if (input.cuts > 0 || input.collisionsEnv > 0) return SR_V2.positiveCapMinorIncident;
  if (input.safetyMinutes >= 25) return SR_V2.positiveCapLongClean;
  return SR_V2.positiveCapNormal;
}

function negativeCapFor(input: {
  incidentRate: number;
  collisionsCar: number;
  dnf: boolean;
  dsq: boolean;
}) {
  if (input.dsq) return SR_V2.negativeCapExtreme;
  if (input.collisionsCar >= 4 || input.incidentRate >= 0.75 || input.dnf) return SR_V2.negativeCapDirty;
  return SR_V2.negativeCapNormal;
}

function buildFrozenSr(input: {
  eventId: string;
  eventResultId: string;
  driverKey: string;
  oldSr: number;
  laps: PlainObject[];
  reason: string;
}) {
  const lapDetails: RatingLapDetail[] = input.laps.map((lap: PlainObject, index: number) => {
    const cuts = safeSrCount(lap.cuts ?? lap.Cuts);
    const carContacts = safeSrCount(lap.collisionsCar ?? lap.CollisionsCar);
    const envContacts = safeSrCount(lap.collisionsEnv ?? lap.CollisionsEnv);
    const notes = [...(Array.isArray(lap.notes) ? lap.notes : []), input.reason];

    return {
      id: uniqueId('gc_lap'),
      eventResultId: input.eventResultId,
      lapNumber: safeSrCount(lap.lapNumber ?? lap.LapCount) || index + 1,
      lapTimeMs: safeSrCount(lap.lapTimeMs ?? lap.LapTime),
      valid: Boolean(lap.valid ?? lap.Valid),
      cuts,
      collisionsCar: carContacts,
      collisionsEnv: envContacts,
      srDelta: 0,
      notes: notes.join(' · ')
    };
  });

  return {
    oldSr: roundTo(input.oldSr),
    newSr: roundTo(input.oldSr),
    deltaSr: 0,
    srClass: ratingClassFromSr(input.oldSr),
    cleanRace: false,
    incidentPoints: 0,
    incidents: [] as RatingIncident[],
    lapDetails,
    modelVersion: SR_MODEL_VERSION,
    breakdown: {
      telemetryReliable: false,
      reason: input.reason
    },
    explanations: [
      `SR v2 congelado: ${input.reason}`
    ]
  };
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
  const laps = Array.isArray(input.laps) ? input.laps : [];

  const telemetryReliable =
    Boolean(input.officialResult.__srTelemetryReliable ?? input.officialResult.srTelemetryReliable) ||
    (Boolean(input.matchedRow) && laps.some((lap) => lapEffectiveMs(lap) > 0));

  if (!telemetryReliable) {
    return buildFrozenSr({
      eventId: input.eventId,
      eventResultId: input.eventResultId,
      driverKey: input.driverKey,
      oldSr,
      laps,
      reason: 'sin telemetría sTracker fiable'
    });
  }

  let totalEffectiveMs = 0;
  let cleanEffectiveMs = 0;
  let cleanLaps = 0;
  let dirtyLaps = 0;
  let currentCleanStreak = 0;
  let longestCleanStreak = 0;
  let totalCuts = 0;
  let totalCarContacts = 0;
  let totalEnvContacts = 0;
  let totalEsc = 0;

  for (const lap of laps) {
    const lapNumber = safeSrCount(lap.lapNumber ?? lap.LapCount) || null;
    const cuts = safeSrCount(lap.cuts ?? lap.Cuts);
    const carContacts = safeSrCount(lap.collisionsCar ?? lap.CollisionsCar);
    const envContacts = safeSrCount(lap.collisionsEnv ?? lap.CollisionsEnv);
    const escPressed = lapHasEsc(lap);
    const effectiveMs = lapEffectiveMs(lap);
    const clean = lapIsClean(lap);
    const notes = [...(Array.isArray(lap.notes) ? lap.notes : [])];

    totalEffectiveMs += effectiveMs;
    totalCuts += cuts;
    totalCarContacts += carContacts;
    totalEnvContacts += envContacts;
    totalEsc += escPressed ? 1 : 0;

    if (clean) {
      cleanLaps += 1;
      cleanEffectiveMs += effectiveMs;
      currentCleanStreak += 1;
      longestCleanStreak = Math.max(longestCleanStreak, currentCleanStreak);
      // No añadimos notas positivas por vuelta: la tabla solo debe mostrar incidentes/penalizaciones.
    } else {
      dirtyLaps += 1;
      currentCleanStreak = 0;
      if (escPressed) notes.push('ESC');
    }

    // No mostramos vueltas inválidas informativas en notas SR: solo incidentes/penalizaciones reales.

    lapDetails.push({
      id: uniqueId('gc_lap'),
      eventResultId: input.eventResultId,
      lapNumber: safeSrCount(lap.lapNumber ?? lap.LapCount),
      lapTimeMs: safeSrCount(lap.lapTimeMs ?? lap.LapTime),
      valid: Boolean(lap.valid ?? lap.Valid),
      cuts,
      collisionsCar: carContacts,
      collisionsEnv: envContacts,
      srDelta: 0,
      notes: notes.join(' · ')
    });
  }

  const officialLaps = Math.max(
    safeSrCount(input.officialResult.numLaps),
    laps.length
  );
  const lapsDeficit = Math.max(0, maxRaceLaps - officialLaps);
  const completionRatio = maxRaceLaps > 0 ? clamp(officialLaps / maxRaceLaps, 0, 1) : 1;
  const safetyMinutes = totalEffectiveMs > 0 ? totalEffectiveMs / 60000 : Math.max(0, officialLaps * 1.5);
  const cleanMinutes = cleanEffectiveMs > 0 ? cleanEffectiveMs / 60000 : 0;
  const safetyMinutesForRate = Math.max(SR_V2.minSafetyMinutes, safetyMinutes);

  const incidentPoints = roundTo(
    totalCuts * SR_V2.cutIncidentPoints +
    totalEnvContacts * SR_V2.envIncidentPoints +
    totalCarContacts * SR_V2.carIncidentPoints,
    3
  );
  const incidentRate = incidentPoints / safetyMinutesForRate;
  const incidentPenalty = roundTo(incidentRate * SR_V2.incidentPenaltyScale, 3);

  const cleanTimeBonus = roundTo(Math.min(SR_V2.cleanMinuteBonusCap, cleanMinutes * SR_V2.cleanMinuteBonus), 3);
  const finishBonus = completionRatio >= 0.8 ? SR_V2.finishBonus : 0;
  const noCarContactBonus = totalCarContacts === 0 ? SR_V2.noCarContactBonus : 0;
  const noCutBonus = totalCuts === 0 ? SR_V2.noCutBonus : 0;
  const streakBonus = roundTo(Math.min(
    SR_V2.cleanStreakBonusCap,
    Math.floor(longestCleanStreak / SR_V2.cleanStreakBlock) * SR_V2.cleanStreakBonus
  ), 3);

  const carContactFlatPenalty = totalCarContacts > 0
    ? roundTo(Math.min(
        SR_V2.carContactPenaltyCap,
        SR_V2.firstCarContactPenalty + Math.max(0, totalCarContacts - 1) * SR_V2.extraCarContactPenalty
      ), 3)
    : 0;

  const officialStatus = String(input.officialResult.status || '').toUpperCase();
  const forcedDnf = Boolean(input.officialResult.dnf) || officialStatus.includes('DNF') || officialStatus.includes('RETI');
  const dsq = Boolean(input.officialResult.disqualified || input.officialResult.dsq);
  const dnf = forcedDnf || (maxRaceLaps >= 3 && completionRatio < 0.8);
  const dnfPenalty = dnf && !dsq ? completionPenalty(completionRatio, forcedDnf) : 0;
  // v102: déficit de vueltas y DNF/completion no se suman.
  // El déficit se guarda como dato explicativo, pero la penalización de estado
  // se decide por completionRatio / DNF para evitar doble castigo.
  const lapDeficitPenalty = 0;
  const dsqPenalty = dsq ? SR_V2.dsqPenalty : 0;

  const penaltyTimeMs = safeSrNumber(input.officialResult.penaltyTimeMs, 0);
  const lapPenalty = safeSrNumber(input.officialResult.lapPenalty, 0);
  const officialPenalty = penaltyTimeMs > 0 || lapPenalty > 0
    ? (lapPenalty > 0 || penaltyTimeMs >= 15000 ? SR_V2.officialPenaltyMajor : SR_V2.officialPenaltyMild)
    : 0;

  if (totalCuts > 0) {
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'OFF_TRACK',
      null,
      totalCuts,
      -roundTo((totalCuts * SR_V2.cutIncidentPoints / Math.max(1, incidentPoints)) * incidentPenalty, 3),
      `SR v2 · Salidas/cuts x${totalCuts} dentro de ${safetyMinutes.toFixed(1)} min de pista`,
      'stracker'
    );
  }

  if (totalCarContacts > 0) {
    const contactSharePenalty = (totalCarContacts * SR_V2.carIncidentPoints / Math.max(1, incidentPoints)) * incidentPenalty;
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'CAR_CONTACT',
      null,
      totalCarContacts,
      -roundTo(contactSharePenalty + carContactFlatPenalty, 3),
      `SR v2 · Contactos con coche x${totalCarContacts} · ratio por tiempo + penalización de contacto`,
      'stracker'
    );
  }

  if (totalEnvContacts > 0) {
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'ENV_CONTACT',
      null,
      totalEnvContacts,
      -roundTo((totalEnvContacts * SR_V2.envIncidentPoints / Math.max(1, incidentPoints)) * incidentPenalty, 3),
      `SR v2 · Contactos con entorno x${totalEnvContacts} dentro de ${safetyMinutes.toFixed(1)} min de pista`,
      'stracker'
    );
  }
  if (dnfPenalty > 0) {
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'DNF',
      null,
      1,
      -dnfPenalty,
      `SR v2 · DNF/completion ${(completionRatio * 100).toFixed(0)}%`,
      'official'
    );
  }

  if (dsqPenalty > 0) {
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'DSQ',
      null,
      1,
      -dsqPenalty,
      `SR v2 · DSQ`,
      'official'
    );
  }

  if (officialPenalty > 0) {
    pushIncident(
      incidents,
      input.eventId,
      input.eventResultId,
      input.driverKey,
      'OFFICIAL_PENALTY',
      null,
      1,
      -officialPenalty,
      `SR v2 · Sanción oficial`,
      'official'
    );
  }

  const positive = cleanTimeBonus + finishBonus + noCarContactBonus + noCutBonus + streakBonus;
  const negative = incidentPenalty + carContactFlatPenalty + lapDeficitPenalty + dnfPenalty + dsqPenalty + officialPenalty;
  const rawDelta = roundTo(positive - negative, 3);
  const positiveCap = positiveCapFor({
    safetyMinutes,
    cuts: totalCuts,
    collisionsCar: totalCarContacts,
    collisionsEnv: totalEnvContacts,
    completionRatio,
    dnf,
    dsq
  });
  const negativeCap = negativeCapFor({
    incidentRate,
    collisionsCar: totalCarContacts,
    dnf,
    dsq
  });
  const delta = roundTo(safeSrNumber(clampDelta(rawDelta, negativeCap, positiveCap), 0), 2);
  const rawNewSr = safeSrNumber(oldSr + delta, oldSr);
  const newSr = roundTo(clamp(rawNewSr, 0, 100));
  const cleanRace = incidentPoints <= 0 && completionRatio >= 0.8 && !dnf && !dsq;

  const summaryLines = [
    `Tiempo en pista: ${safetyMinutes.toFixed(1)} min`,
    `Tiempo limpio: ${cleanMinutes.toFixed(1)} min`,
    `Vueltas limpias: ${cleanLaps}/${laps.length}`,
    `Racha limpia: ${longestCleanStreak}`,
    `Bonus por conducción limpia: +${roundTo(positive, 2).toFixed(2)} SR`,
    `Penalizaciones: -${roundTo(negative, 2).toFixed(2)} SR`
  ];

  if (totalCuts > 0) summaryLines.push(`Salidas/cuts: ${totalCuts}`);
  if (totalCarContacts > 0) summaryLines.push(`Golpes con coche: ${totalCarContacts}`);
  if (totalEnvContacts > 0) summaryLines.push(`Golpes con entorno: ${totalEnvContacts}`);
  if (dnfPenalty > 0) summaryLines.push(`Carrera no completada: -${dnfPenalty.toFixed(2)} SR`);
  if (dsqPenalty > 0) summaryLines.push(`Descalificación: -${dsqPenalty.toFixed(2)} SR`);
  if (officialPenalty > 0) summaryLines.push(`Sanción oficial: -${officialPenalty.toFixed(2)} SR`);

  summaryLines.push(`Resultado SR: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);

  const explanations = summaryLines;

  const perCleanLapBonus = cleanLaps > 0 ? cleanTimeBonus / cleanLaps : 0;
  const perDirtyLapPenalty = dirtyLaps > 0 ? Math.min(1.5, negative / dirtyLaps) : 0;

  for (const detail of lapDetails) {
    const clean = detail.cuts <= 0 && detail.collisionsCar <= 0 && detail.collisionsEnv <= 0 && detail.lapTimeMs > 0 && !detail.notes.includes('ESC');
    detail.srDelta = roundTo(clean ? perCleanLapBonus : -perDirtyLapPenalty, 3);
  }

  return {
    oldSr: roundTo(oldSr),
    newSr,
    deltaSr: delta,
    srClass: ratingClassFromSr(newSr),
    cleanRace,
    incidentPoints: roundTo(negative, 2),
    incidents,
    lapDetails,
    modelVersion: SR_MODEL_VERSION,
    breakdown: {
      telemetryReliable: true,
      safetyMinutes: roundTo(safetyMinutes, 3),
      cleanMinutes: roundTo(cleanMinutes, 3),
      cleanLaps,
      dirtyLaps,
      longestCleanStreak,
      cuts: totalCuts,
      collisionsCar: totalCarContacts,
      collisionsEnv: totalEnvContacts,
      escPressed: totalEsc,
      incidentPoints,
      incidentRate: roundTo(incidentRate, 4),
      cleanTimeBonus,
      finishBonus,
      noCarContactBonus,
      noCutBonus,
      streakBonus,
      incidentPenalty,
      carContactFlatPenalty,
      lapDeficitPenalty,
      dnfPenalty,
      dsqPenalty,
      officialPenalty,
      rawDelta,
      positiveCap,
      negativeCap,
      completionRatio: roundTo(completionRatio, 4),
      lapsDeficit
    },
    explanations
  };
}
