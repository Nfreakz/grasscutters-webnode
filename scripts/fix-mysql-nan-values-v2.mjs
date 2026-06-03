import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filePath = path.join(root, 'src/server/gc-ratings/mysqlRatingStore.ts');

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${path.relative(root, filePath)}`);
}

let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('function mysqlNumber(')) {
  content = content.replace(
`function mysqlToIso(value: unknown) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
`,
`function mysqlToIso(value: unknown) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function mysqlNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mysqlInt(value: unknown, fallback = 0) {
  return Math.round(mysqlNumber(value, fallback));
}
`
  );
}

const replacements = [
  ['driver.srScore,', 'mysqlNumber(driver.srScore),'],
  ['driver.gsrMu,', 'mysqlNumber(driver.gsrMu),'],
  ['driver.gsrSigma,', 'mysqlNumber(driver.gsrSigma),'],
  ['driver.gsrRating,', 'mysqlInt(driver.gsrRating),'],
  ['driver.racesCount,', 'mysqlInt(driver.racesCount),'],
  ['driver.cleanRaces,', 'mysqlInt(driver.cleanRaces),'],
  ['driver.wins,', 'mysqlInt(driver.wins),'],
  ['driver.podiums,', 'mysqlInt(driver.podiums),'],
  ['driver.incidentPointsTotal,', 'mysqlNumber(driver.incidentPointsTotal),'],
  ['driver.lastDeltaSr,', 'mysqlNumber(driver.lastDeltaSr),'],
  ['driver.lastDeltaGsr,', 'mysqlInt(driver.lastDeltaGsr),'],

  ['result.position,', 'mysqlInt(result.position),'],
  ['result.points,', 'mysqlNumber(result.points),'],
  ['result.laps,', 'mysqlInt(result.laps),'],
  ['result.bestLapMs,', 'mysqlInt(result.bestLapMs),'],
  ['result.oldSr,', 'mysqlNumber(result.oldSr),'],
  ['result.newSr,', 'mysqlNumber(result.newSr),'],
  ['result.deltaSr,', 'mysqlNumber(result.deltaSr),'],
  ['result.oldGsr,', 'mysqlInt(result.oldGsr),'],
  ['result.newGsr,', 'mysqlInt(result.newGsr),'],
  ['result.deltaGsr,', 'mysqlInt(result.deltaGsr),'],
  ['result.gsrMuBefore,', 'mysqlNumber(result.gsrMuBefore),'],
  ['result.gsrMuAfter,', 'mysqlNumber(result.gsrMuAfter),'],
  ['result.gsrSigmaBefore,', 'mysqlNumber(result.gsrSigmaBefore),'],
  ['result.gsrSigmaAfter,', 'mysqlNumber(result.gsrSigmaAfter),'],
  ['result.incidentPoints,', 'mysqlNumber(result.incidentPoints),'],
  ['result.match.confidence,', 'mysqlNumber(result.match?.confidence),'],
  ['result.match.bestLapDiffMs,', 'Number.isFinite(Number(result.match?.bestLapDiffMs)) ? Number(result.match.bestLapDiffMs) : null,'],
  ['result.match.lapDiff,', 'Number.isFinite(Number(result.match?.lapDiff)) ? Number(result.match.lapDiff) : null,'],
  ['result.match.strackerPlayerInSessionId,', 'Number.isFinite(Number(result.match?.strackerPlayerInSessionId)) ? Number(result.match.strackerPlayerInSessionId) : null,'],

  ['incident.count,', 'mysqlInt(incident.count),'],
  ['incident.srDelta,', 'mysqlNumber(incident.srDelta),'],

  ['lap.lapNumber,', 'mysqlInt(lap.lapNumber),'],
  ['lap.lapTimeMs,', 'mysqlInt(lap.lapTimeMs),'],
  ['lap.cuts,', 'mysqlInt(lap.cuts),'],
  ['lap.collisionsCar,', 'mysqlInt(lap.collisionsCar),'],
  ['lap.collisionsEnv,', 'mysqlInt(lap.collisionsEnv),'],
  ['lap.srDelta,', 'mysqlNumber(lap.srDelta),']
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

fs.writeFileSync(filePath, content.replace(/\r\n/g, '\n'), 'utf8');

console.log('[GC MySQL NaN Hotfix v2] OK');
console.log('[GC MySQL NaN Hotfix v2] mysqlRatingStore.ts sanea NaN e Infinity antes de insertar.');
console.log('');
console.log('Ahora ejecuta:');
console.log('npm run build');
