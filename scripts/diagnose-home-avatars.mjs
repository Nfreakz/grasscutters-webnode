import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const outputDir = path.join(projectRoot, '_gc_reports', 'home-avatar-diagnostic');
const outputFile = path.join(outputDir, 'home-avatar-diagnostic.json');

const baseUrl = process.env.GC_SITE_URL || 'https://grasscuttersracing.com';
const targets = ['neo', 'nandy', 'pdiaz', 'angel'];

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function first(obj, paths) {
  for (const candidate of paths) {
    const parts = candidate.split('.');
    let value = obj;
    for (const part of parts) value = value?.[part];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.pilots)) return payload.pilots;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
  if (Array.isArray(payload?.leaderboard)) return payload.leaderboard;
  return [];
}

function summarize(row) {
  return {
    name: first(row, [
      'displayName', 'publicName', 'name', 'driver', 'driverName',
      'driver.displayName', 'driver.name'
    ]),
    ids: {
      profilePlayerId: first(row, ['profilePlayerId']),
      playerId: first(row, ['playerId', 'player.id']),
      strackerPlayerId: first(row, ['strackerPlayerId']),
      pilotId: first(row, ['pilotId', 'pilot.id']),
      driverId: first(row, ['driverId', 'driver.id']),
      driverKey: first(row, ['driverKey', 'driver_key']),
      steamGuid: first(row, ['steamGuid', 'steamGUID', 'guid', 'GUID'])
    },
    avatarFields: {
      customAvatarUrl: first(row, ['customAvatarUrl', 'custom_avatar_url']),
      profileAvatarUrl: first(row, ['profileAvatarUrl', 'profile_avatar_url']),
      avatarUrl: first(row, ['avatarUrl', 'avatar_url']),
      avatarPath: first(row, ['avatarPath', 'avatar_path']),
      profileAvatar: first(row, ['profile.avatarUrl', 'profile.avatar_url', 'profile.avatar']),
      playerAvatar: first(row, ['player.avatarUrl', 'player.avatar_url', 'player.avatar']),
      driverAvatar: first(row, ['driver.avatarUrl', 'driver.avatar_url', 'driver.avatar']),
      pilotAvatar: first(row, ['pilot.avatarUrl', 'pilot.avatar_url', 'pilot.avatar'])
    },
    topLevelKeys: Object.keys(row || {}).sort()
  };
}

async function requestJson(pathname) {
  const url = new URL(pathname, baseUrl).toString();
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GC-Home-Avatar-Diagnostic/1.0'
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
    bodyPreview: json ? undefined : text.slice(0, 1000)
  };
}

const pilotsResponse = await requestJson('/api/gc/pilots2?source=all&limit=all');
const ratingsResponse = await requestJson('/api/gc/ratings/championship');

const pilotRows = extractRows(pilotsResponse.json);
const srRows = Array.isArray(ratingsResponse.json?.leaderboard?.sr)
  ? ratingsResponse.json.leaderboard.sr
  : [];
const gsrRows = Array.isArray(ratingsResponse.json?.leaderboard?.gsr)
  ? ratingsResponse.json.leaderboard.gsr
  : [];

const pilotMatches = pilotRows
  .filter((row) => targets.includes(normalize(first(row, [
    'displayName', 'publicName', 'name', 'driver', 'driverName',
    'driver.displayName', 'driver.name'
  ]))))
  .map(summarize);

const ratingMatches = [...srRows, ...gsrRows]
  .filter((row) => targets.includes(normalize(first(row, [
    'displayName', 'publicName', 'name', 'driver', 'driverName',
    'driver.displayName', 'driver.name'
  ]))))
  .map(summarize);

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  endpoints: {
    pilots2: {
      status: pilotsResponse.status,
      ok: pilotsResponse.ok,
      contentType: pilotsResponse.contentType,
      rows: pilotRows.length,
      topLevelKeys: pilotsResponse.json ? Object.keys(pilotsResponse.json) : [],
      bodyPreview: pilotsResponse.bodyPreview
    },
    ratings: {
      status: ratingsResponse.status,
      ok: ratingsResponse.ok,
      contentType: ratingsResponse.contentType,
      srRows: srRows.length,
      gsrRows: gsrRows.length,
      topLevelKeys: ratingsResponse.json ? Object.keys(ratingsResponse.json) : [],
      bodyPreview: ratingsResponse.bodyPreview
    }
  },
  targets,
  pilotMatches,
  ratingMatches,
  diagnosis: {
    pilotsEndpointHasRows: pilotRows.length > 0,
    pilotsEndpointHasTargetMatches: pilotMatches.length > 0,
    pilotsTargetsWithCustomAvatar: pilotMatches.filter((row) =>
      Object.values(row.avatarFields).some((value) =>
        value && value !== '/images/pilot-avatar-default.png'
      )
    ).length,
    ratingTargetsWithIds: ratingMatches.filter((row) =>
      Object.values(row.ids).some(Boolean)
    ).length,
    ratingTargetsWithAvatar: ratingMatches.filter((row) =>
      Object.values(row.avatarFields).some((value) =>
        value && value !== '/images/pilot-avatar-default.png'
      )
    ).length
  }
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('[GC HOME AVATAR DIAGNOSTIC] Completado.');
console.log(`Pilotos2: HTTP ${report.endpoints.pilots2.status}, filas ${pilotRows.length}`);
console.log(`Ratings: HTTP ${report.endpoints.ratings.status}, SR ${srRows.length}, GSR ${gsrRows.length}`);
console.log(`Coincidencias pilotos: ${pilotMatches.length}`);
console.log(`Coincidencias ratings: ${ratingMatches.length}`);
console.log(`Avatares personalizados encontrados: ${report.diagnosis.pilotsTargetsWithCustomAvatar}`);
console.log(`Informe: ${outputFile}`);
