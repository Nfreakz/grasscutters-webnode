import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const baseUrl = process.env.GC_SITE_URL || 'https://grasscuttersracing.com';
const outputDir = path.join(projectRoot, '_gc_reports', 'identity');
const outputFile = path.join(outputDir, 'don-bixi-identity-diagnostic.json');

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '');

const targetNames = new Set(['donbixi', 'jesussue', 'jesussue']);

function first(row, paths) {
  for (const candidate of paths) {
    const parts = candidate.split('.');
    let value = row;
    for (const part of parts) value = value?.[part];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function rowsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.pilots)) return payload.pilots;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
  return [];
}

function ratingRows(payload) {
  return [
    ...(Array.isArray(payload?.leaderboard?.sr) ? payload.leaderboard.sr : []),
    ...(Array.isArray(payload?.leaderboard?.gsr) ? payload.leaderboard.gsr : [])
  ];
}

function summarize(row) {
  return {
    name: first(row, ['displayName', 'publicName', 'name', 'driver', 'driverName', 'playerName']),
    ids: {
      id: first(row, ['id']),
      playerId: first(row, ['playerId', 'player.id']),
      profilePlayerId: first(row, ['profilePlayerId']),
      strackerPlayerId: first(row, ['strackerPlayerId']),
      driverId: first(row, ['driverId', 'driver.id']),
      pilotId: first(row, ['pilotId', 'pilot.id'])
    },
    identity: {
      steamGuid: first(row, ['steamGuid', 'steamGUID', 'guid', 'GUID']),
      driverKey: first(row, ['driverKey', 'driver_key']),
      mergedDriverKeys: first(row, ['mergedDriverKeys'])
    },
    activity: {
      totalLaps: first(row, ['totalLaps', 'laps', 'lapCount']),
      active30dLaps: first(row, ['active30dLaps']),
      sessionsCount: first(row, ['sessionsCount', 'races']),
      lastLap: first(row, ['lastLap']),
      bestLap: first(row, ['bestLap']),
      generatedAt: first(row, ['generatedAt', 'updatedAt'])
    },
    ratings: {
      sr: first(row, ['sr', 'srScore']),
      srClass: first(row, ['srClass']),
      gsr: first(row, ['gsr', 'gsrRating', 'gsrScore']),
      gsrClass: first(row, ['gsrClass'])
    },
    avatarUrl: first(row, ['avatarUrl', 'avatar_url']),
    topLevelKeys: Object.keys(row || {}).sort()
  };
}

async function requestJson(pathname) {
  const url = new URL(pathname, baseUrl).toString();
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GC-Don-Bixi-Identity-Diagnostic/1.0'
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return {
    url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    json,
    preview: json ? undefined : text.slice(0, 1000)
  };
}

const pilotsResponse = await requestJson('/api/gc/pilots2?source=all&limit=all');
const ratingsResponse = await requestJson('/api/gc/ratings/championship');

const pilots = rowsFrom(pilotsResponse.json);
const ratings = ratingRows(ratingsResponse.json);

const pilotMatches = pilots
  .filter((row) => targetNames.has(normalize(first(row, [
    'displayName', 'publicName', 'name', 'driver', 'driverName', 'playerName'
  ]))))
  .map(summarize);

const ratingMatches = ratings
  .filter((row) => targetNames.has(normalize(first(row, [
    'displayName', 'publicName', 'name', 'driver', 'driverName', 'playerName'
  ]))))
  .map(summarize);

const candidateIds = [...new Set([
  ...pilotMatches.flatMap((row) => Object.values(row.ids)),
  ...ratingMatches.flatMap((row) => Object.values(row.ids))
].map(String).filter((value) => /^\d+$/.test(value)))];

const profiles = [];
for (const id of candidateIds) {
  const response = await requestJson(`/api/pilots/${encodeURIComponent(id)}/profile`);
  profiles.push({
    id,
    status: response.status,
    ok: response.ok,
    apiOk: response.json?.ok ?? null,
    message: response.json?.message || null,
    pilot: response.json?.pilot ? summarize(response.json.pilot) : null,
    pilotLink: response.json?.pilotLink || null,
    summary: response.json?.summary || null,
    ratings: response.json?.ratings || null,
    latestLapsCount: Array.isArray(response.json?.latestLaps)
      ? response.json.latestLaps.length
      : Array.isArray(response.json?.recentLaps)
        ? response.json.recentLaps.length
        : null
  });
}

const duplicateNames = {};
for (const row of pilots) {
  const name = normalize(first(row, ['displayName', 'publicName', 'name']));
  if (!name) continue;
  duplicateNames[name] ||= [];
  duplicateNames[name].push(summarize(row));
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  endpoints: {
    pilots2: {
      status: pilotsResponse.status,
      rows: pilots.length
    },
    ratings: {
      status: ratingsResponse.status,
      rows: ratings.length
    }
  },
  targetNames: [...targetNames],
  pilotMatches,
  ratingMatches,
  candidateIds,
  profiles,
  duplicateGroups: {
    donbixi: duplicateNames.donbixi || [],
    jesussue: duplicateNames.jesussue || [],
    jesussue: duplicateNames.jesussue || []
  },
  preliminaryDiagnosis: {
    ratingsMapsDonBixiToProfile9: ratingMatches.some(
      (row) => normalize(row.name) === 'donbixi' && String(row.ids.profilePlayerId) === '9'
    ),
    profile9Identity: profiles.find((row) => row.id === '9')?.pilot?.name || null,
    candidateProfilesWithActivity: profiles
      .filter((row) => row.apiOk && (
        Number(row.summary?.totalLaps || 0) > 0 ||
        Number(row.latestLapsCount || 0) > 0
      ))
      .map((row) => ({
        id: row.id,
        name: row.pilot?.name || row.pilotLink?.strackerName || null,
        totalLaps: row.summary?.totalLaps || null,
        latestLapsCount: row.latestLapsCount
      }))
  }
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('[GC DON BIXI IDENTITY] Diagnóstico completado.');
console.log(`Pilots2 matches: ${pilotMatches.length}`);
console.log(`Ratings matches: ${ratingMatches.length}`);
console.log(`Candidate IDs: ${candidateIds.join(', ') || 'none'}`);
console.log(`Profiles checked: ${profiles.length}`);
console.log(`Report: ${outputFile}`);
