import { clamp, ratingClassFromGsr, roundTo, visibleGsr } from './utils';
import type { DriverRatingState, PlainObject } from './types';

const INITIAL_MU = 25;
const INITIAL_SIGMA = 25 / 3;
const MIN_SIGMA = 2.5;

function logisticExpected(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function initialGsrState() {
  return {
    mu: INITIAL_MU,
    sigma: INITIAL_SIGMA,
    rating: visibleGsr(INITIAL_MU),
    className: ratingClassFromGsr(visibleGsr(INITIAL_MU))
  };
}

export function applyGsrUpdates(rows: PlainObject[], states: Map<string, DriverRatingState>) {
  const total = rows.length;
  if (total <= 1) {
    return rows.map((row) => {
      const state = states.get(row.driverKey);
      const current = state ? {
        mu: state.gsrMu,
        sigma: state.gsrSigma,
        rating: state.gsrRating
      } : initialGsrState();
      return {
        driverKey: row.driverKey,
        oldMu: current.mu,
        oldSigma: current.sigma,
        oldRating: current.rating,
        newMu: current.mu,
        newSigma: current.sigma,
        newRating: current.rating,
        delta: 0,
        explanation: 'Sin suficientes rivales para actualizar GSR.'
      };
    });
  }

  return rows.map((row, index) => {
    const state = states.get(row.driverKey);
    const oldMu = state?.gsrMu ?? INITIAL_MU;
    const oldSigma = state?.gsrSigma ?? INITIAL_SIGMA;
    const oldRating = state?.gsrRating ?? visibleGsr(oldMu);

    let actual = 0;
    let expected = 0;

    rows.forEach((opponent, opponentIndex) => {
      if (row.driverKey === opponent.driverKey) return;
      const opponentState = states.get(opponent.driverKey);
      const opponentMu = opponentState?.gsrMu ?? INITIAL_MU;
      const opponentRating = opponentState?.gsrRating ?? visibleGsr(opponentMu);
      expected += logisticExpected(oldRating, opponentRating);
      actual += index < opponentIndex ? 1 : index === opponentIndex ? 0.5 : 0;
    });

    actual /= total - 1;
    expected /= total - 1;

    const raceCount = state?.racesCount ?? 0;
    const uncertaintyBoost = clamp(oldSigma / INITIAL_SIGMA, 0.45, 1.4);
    const participationBoost = clamp(1.15 - Math.min(raceCount, 30) * 0.015, 0.7, 1.15);
    const kFactor = 24 * uncertaintyBoost * participationBoost;
    const muDelta = (actual - expected) * (kFactor / 18);
    const newMu = roundTo(oldMu + muDelta, 4);
    const newSigma = roundTo(clamp(oldSigma * 0.965 - 0.08 + Math.abs(actual - expected) * 0.18, MIN_SIGMA, INITIAL_SIGMA), 4);
    const newRating = visibleGsr(newMu);
    const delta = newRating - oldRating;

    return {
      driverKey: row.driverKey,
      oldMu,
      oldSigma,
      oldRating,
      newMu,
      newSigma,
      newRating,
      delta,
      explanation: `GSR ${delta >= 0 ? '+' : ''}${delta} · terminó P${row.position} frente a rivales de nivel similar`
    };
  });
}

