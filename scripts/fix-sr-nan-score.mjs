import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filePath = path.join(root, 'src/server/gc-ratings/srModel.ts');

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${path.relative(root, filePath)}`);
}

let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('function safeSrNumber(')) {
  content = content.replace(
`const SR_WEIGHTS = {
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
`,
`const SR_WEIGHTS = {
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSrCount(value: unknown) {
  return Math.max(0, Math.round(safeSrNumber(value, 0)));
}
`
  );
}

content = content.replace(
`  if (!count && srDelta >= 0) return;
  incidents.push({
    id: uniqueId('gc_inc'),
    eventResultId,
    eventId,
    driverKey,
    lapNumber,
    type,
    count,
    srDelta: roundTo(srDelta),
    description,
    source
  });`,
`  const safeCount = safeSrCount(count);
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
  });`
);

content = content.replace(
`  let delta = 0;

  for (const lap of input.laps) {`,
`  const oldSr = safeSrNumber(input.oldSr, 80);
  const maxRaceLaps = Math.max(0, safeSrCount(input.maxRaceLaps));
  let delta = 0;

  for (const lap of input.laps) {`
);

content = content.replace(
`    const lapNumber = Number(lap.lapNumber || 0) || null;
    const cuts = Number(lap.cuts || 0);
    const carContacts = Number(lap.collisionsCar || 0);
    const envContacts = Number(lap.collisionsEnv || 0);`,
`    const lapNumber = safeSrCount(lap.lapNumber) || null;
    const cuts = safeSrCount(lap.cuts);
    const carContacts = safeSrCount(lap.collisionsCar);
    const envContacts = safeSrCount(lap.collisionsEnv);`
);

content = content.replace(
`      lapNumber: Number(lap.lapNumber || 0),
      lapTimeMs: Number(lap.lapTimeMs || 0),`,
`      lapNumber: safeSrCount(lap.lapNumber),
      lapTimeMs: safeSrCount(lap.lapTimeMs),`
);

content = content.replace(
`  const officialLaps = Number(input.officialResult.numLaps || 0);
  const lapsDeficit = Math.max(0, input.maxRaceLaps - officialLaps);`,
`  const officialLaps = safeSrCount(input.officialResult.numLaps);
  const lapsDeficit = Math.max(0, maxRaceLaps - officialLaps);`
);

content = content.replace(
`  const dnf = Boolean(input.officialResult.dnf) || officialStatus.includes('DNF') || officialStatus.includes('RETI') || (input.maxRaceLaps >= 3 && lapsDeficit >= 2);
  const dsq = Boolean(input.officialResult.disqualified || input.officialResult.dsq);
  const penaltyTimeMs = Number(input.officialResult.penaltyTimeMs || 0);
  const lapPenalty = Number(input.officialResult.lapPenalty || 0);`,
`  const dnf = Boolean(input.officialResult.dnf) || officialStatus.includes('DNF') || officialStatus.includes('RETI') || (maxRaceLaps >= 3 && lapsDeficit >= 2);
  const dsq = Boolean(input.officialResult.disqualified || input.officialResult.dsq);
  const penaltyTimeMs = safeSrNumber(input.officialResult.penaltyTimeMs, 0);
  const lapPenalty = safeSrNumber(input.officialResult.lapPenalty, 0);`
);

content = content.replace(
`  delta = roundTo(delta);
  const newSr = roundTo(clamp(input.oldSr + delta, 0, 100));
  return {
    oldSr: roundTo(input.oldSr),
    newSr,`,
`  delta = roundTo(safeSrNumber(delta, 0));
  const newSr = roundTo(clamp(oldSr + delta, 0, 100));
  return {
    oldSr: roundTo(oldSr),
    newSr,`
);

fs.writeFileSync(filePath, content.replace(/\r\n/g, '\n'), 'utf8');

console.log('[GC SR NaN Score Hotfix] OK');
console.log('- srModel.ts ahora protege oldSr, delta, vueltas, cuts y contactos contra NaN.');
console.log('- Tras desplegar, hay que ejecutar POST /api/gc/ratings/recalculate para regenerar MySQL.');
console.log('');
console.log('Ahora ejecuta:');
console.log('npm run build');
