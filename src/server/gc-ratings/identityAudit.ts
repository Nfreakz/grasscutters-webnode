import type { Pool, RowDataPacket } from 'mysql2/promise';

// GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1

type IdentityRecord = {
  recordId: string;
  kind: 'rating' | 'result' | 'profile' | 'user';
  driverKey: string | null;
  playerId: number | null;
  steamGuid: string | null;
  name: string | null;
  userId: string | null;
  profileId: string | null;
  sourceKey: string | null;
  eventScopeKey: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  teamId: string | null;
  teamName: string | null;
  racesCount: number;
  wins: number;
  podiums: number;
};

type IdentityAuditInput = {
  ratings?: any[];
  results?: any[];
  profiles?: any[];
  users?: any[];
};

function text(value: unknown) {
  const output = String(value ?? '').trim();
  return output || null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeName(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSteam(value: unknown) {
  return String(value ?? '').trim().replace(/^steam:/i, '').toLowerCase();
}

function normalizeCountry(value: unknown) {
  const output = String(value ?? '').trim().toUpperCase();
  return output || null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function recordFromRating(row: any, index: number): IdentityRecord {
  return {
    recordId: `rating:${text(row.driver_key ?? row.driverKey) || index}`,
    kind: 'rating',
    driverKey: text(row.driver_key ?? row.driverKey),
    playerId: integer(row.stracker_player_id ?? row.strackerPlayerId),
    steamGuid: text(row.steam_guid ?? row.steamGuid),
    name: text(row.display_name ?? row.displayName),
    userId: null,
    profileId: null,
    sourceKey: null,
    eventScopeKey: null,
    avatarUrl: null,
    countryCode: null,
    teamId: null,
    teamName: null,
    racesCount: Number(row.races_count ?? row.racesCount ?? 0) || 0,
    wins: Number(row.wins ?? 0) || 0,
    podiums: Number(row.podiums ?? 0) || 0
  };
}

function recordFromResult(row: any, index: number): IdentityRecord {
  const sourceKey = text(row.source_key ?? row.sourceKey) || 'unknown';
  const eventId = text(row.event_id ?? row.eventId) || `unknown-${index}`;
  const rawEventScopeKey = text(row.event_scope_key ?? row.eventScopeKey) || eventId;
  return {
    recordId: `result:${text(row.id) || index}`,
    kind: 'result',
    driverKey: text(row.driver_key ?? row.driverKey),
    playerId: integer(row.stracker_player_id ?? row.strackerPlayerId),
    steamGuid: text(row.steam_guid ?? row.steamGuid),
    name: text(row.display_name ?? row.displayName),
    userId: null,
    profileId: null,
    sourceKey,
    // La clave de evento solo es comparable dentro de la misma fuente.
    eventScopeKey: `${sourceKey}::${rawEventScopeKey}`,
    avatarUrl: null,
    countryCode: null,
    teamId: null,
    teamName: null,
    racesCount: 0,
    wins: Number(row.position) === 1 ? 1 : 0,
    podiums: Number(row.position) > 0 && Number(row.position) <= 3 ? 1 : 0
  };
}

function recordFromProfile(row: any, index: number): IdentityRecord {
  return {
    recordId: `profile:${text(row.id) || index}`,
    kind: 'profile',
    driverKey: text(row.driver_key ?? row.driverKey),
    playerId: integer(row.player_id ?? row.playerId),
    steamGuid: text(row.steam_guid ?? row.steamGuid),
    name: text(row.display_name ?? row.displayName ?? row.driver_name ?? row.driverName),
    userId: text(row.linked_user_id ?? row.linkedUserId),
    profileId: text(row.id),
    sourceKey: null,
    eventScopeKey: null,
    avatarUrl: text(row.avatar_url ?? row.avatarUrl),
    countryCode: normalizeCountry(row.country_code ?? row.countryCode),
    teamId: text(row.team_id ?? row.teamId),
    teamName: text(row.team_name ?? row.teamName),
    racesCount: 0,
    wins: 0,
    podiums: 0
  };
}

function recordFromUser(row: any, index: number): IdentityRecord {
  const userId = text(row.id);
  return {
    recordId: `user:${userId || index}`,
    kind: 'user',
    driverKey: null,
    playerId: integer(row.pilot_player_id ?? row.pilotPlayerId),
    steamGuid: text(row.pilot_steam_guid ?? row.pilotSteamGuid),
    name: text(row.pilot_stracker_name ?? row.pilotStrackerName ?? row.display_name ?? row.displayName),
    userId,
    profileId: null,
    sourceKey: null,
    eventScopeKey: null,
    avatarUrl: null,
    countryCode: normalizeCountry(row.pilot_country_code ?? row.pilotCountryCode),
    teamId: null,
    teamName: text(row.team_name ?? row.teamName),
    racesCount: 0,
    wins: 0,
    podiums: 0
  };
}

class DisjointSet {
  private readonly parent: number[];
  private readonly steamIds: Array<Set<string>>;
  constructor(records: IdentityRecord[]) {
    this.parent = Array.from({ length: records.length }, (_, index) => index);
    this.steamIds = records.map((record) => {
      const values = new Set<string>();
      const steamGuid = normalizeSteam(record.steamGuid);
      if (steamGuid) values.add(steamGuid);
      if (record.driverKey?.toLowerCase().startsWith('steam:')) {
        const driverSteam = normalizeSteam(record.driverKey);
        if (driverSteam) values.add(driverSteam);
      }
      return values;
    });
  }
  find(value: number): number {
    if (this.parent[value] !== value) this.parent[value] = this.find(this.parent[value]);
    return this.parent[value];
  }
  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return true;
    const leftSteam = this.steamIds[leftRoot];
    const rightSteam = this.steamIds[rightRoot];
    if (leftSteam.size && rightSteam.size && [...leftSteam].some((value) => !rightSteam.has(value))) return false;
    this.parent[rightRoot] = leftRoot;
    rightSteam.forEach((value) => leftSteam.add(value));
    return true;
  }
}

function strongAnchors(record: IdentityRecord) {
  const anchors: string[] = [];
  const steamGuid = normalizeSteam(record.steamGuid);
  if (steamGuid) anchors.push(`steam:${steamGuid}`);

  const driverKey = record.driverKey?.trim().toLowerCase() || '';
  if (driverKey.startsWith('steam:')) anchors.push(`steam:${normalizeSteam(driverKey)}`);
  else if (driverKey && !driverKey.startsWith('player:') && !driverKey.startsWith('name:')) anchors.push(`driver:${driverKey}`);
  else if (driverKey.startsWith('player:') && record.kind === 'result' && record.sourceKey && record.sourceKey !== 'unknown') {
    anchors.push(`driver-player:${record.sourceKey}:${driverKey.slice('player:'.length)}`);
  }

  // Los player_id de sTracker solo son unicos dentro de su fuente/base.
  if (record.kind === 'result' && record.playerId && record.sourceKey && record.sourceKey !== 'unknown') {
    anchors.push(`source-player:${record.sourceKey}:${record.playerId}`);
  }
  if (record.userId) anchors.push(`user:${record.userId}`);
  return unique(anchors);
}

function canonicalScore(driverKey: string, records: IdentityRecord[]) {
  const lower = driverKey.toLowerCase();
  let score = lower.startsWith('steam:') ? 700 : lower.startsWith('player:') ? 300 : lower.startsWith('name:') ? 100 : 400;
  if (/^steam:\d{15,20}$/i.test(driverKey)) score += 100;
  if (records.some((record) => record.kind === 'profile' && record.driverKey === driverKey)) score += 80;
  if (records.some((record) => record.kind === 'rating' && record.driverKey === driverKey)) score += 60;
  if (records.some((record) => record.userId)) score += 40;
  return score;
}

export function buildIdentityAuditV1(input: IdentityAuditInput, source = 'memory') {
  const records: IdentityRecord[] = [
    ...(input.ratings || []).map(recordFromRating),
    ...(input.results || []).map(recordFromResult),
    ...(input.profiles || []).map(recordFromProfile),
    ...(input.users || []).map(recordFromUser)
  ];
  const sets = new DisjointSet(records);
  const anchors = new Map<string, number>();
  const rejectedStrongLinks: Array<{ anchor: string; leftRecordId: string; rightRecordId: string; reason: string }> = [];

  records.forEach((record, index) => {
    strongAnchors(record).forEach((anchor) => {
      const previous = anchors.get(anchor);
      if (previous === undefined) anchors.set(anchor, index);
      else if (!sets.union(previous, index)) rejectedStrongLinks.push({
        anchor,
        leftRecordId: records[previous].recordId,
        rightRecordId: record.recordId,
        reason: 'DIFFERENT_STEAM_IDS'
      });
    });
  });

  const componentRecords = new Map<number, IdentityRecord[]>();
  records.forEach((record, index) => {
    const root = sets.find(index);
    const bucket = componentRecords.get(root) || [];
    bucket.push(record);
    componentRecords.set(root, bucket);
  });

  const groups = [...componentRecords.values()].map((bucket, index) => {
    const driverKeys = unique(bucket.map((record) => record.driverKey));
    const playerIds = [...new Set(bucket.map((record) => record.playerId).filter((value): value is number => value !== null))].sort((a, b) => a - b);
    const playerScopes = unique(bucket.map((record) => record.kind === 'result' && record.playerId && record.sourceKey && record.sourceKey !== 'unknown'
      ? `${record.sourceKey}:${record.playerId}`
      : null));
    const sourcePlayerMap = new Map<string, Set<number>>();
    bucket.forEach((record) => {
      if (record.kind !== 'result' || !record.playerId || !record.sourceKey || record.sourceKey === 'unknown') return;
      const ids = sourcePlayerMap.get(record.sourceKey) || new Set<number>();
      ids.add(record.playerId);
      sourcePlayerMap.set(record.sourceKey, ids);
    });
    const playerIdsBySource = [...sourcePlayerMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceKey, ids]) => ({ sourceKey, playerIds: [...ids].sort((a, b) => a - b) }));
    const sameSourcePlayerConflicts = playerIdsBySource.filter((entry) => entry.playerIds.length > 1);
    const unscopedPlayerIds = [...new Set(bucket
      .filter((record) => record.kind !== 'result' || !record.sourceKey || record.sourceKey === 'unknown')
      .map((record) => record.playerId)
      .filter((value): value is number => value !== null))].sort((a, b) => a - b);
    const steamGuids = unique(bucket.map((record) => record.steamGuid ? normalizeSteam(record.steamGuid) : null));
    const names = unique(bucket.map((record) => record.name));
    const normalizedNames = unique(names.map(normalizeName));
    const userIds = unique(bucket.map((record) => record.userId));
    const profileIds = unique(bucket.map((record) => record.profileId));
    const countries = unique(bucket.map((record) => record.countryCode));
    const teamIds = unique(bucket.map((record) => record.teamId));
    const teamNames = unique(bucket.map((record) => record.teamName));
    const avatarUrls = unique(bucket.map((record) => record.avatarUrl));
    const eventScopes = bucket.map((record) => record.eventScopeKey).filter((value): value is string => Boolean(value));
    const eventScopeCounts = new Map<string, number>();
    eventScopes.forEach((key) => eventScopeCounts.set(key, (eventScopeCounts.get(key) || 0) + 1));
    const duplicateEventScopes = [...eventScopeCounts.entries()].filter(([, count]) => count > 1).map(([eventScopeKey, count]) => ({ eventScopeKey, count }));
    const candidateKeys = driverKeys
      .map((driverKey) => ({ driverKey, score: canonicalScore(driverKey, bucket) }))
      .sort((left, right) => right.score - left.score || left.driverKey.localeCompare(right.driverKey));
    const conflicts: string[] = [];
    if (sameSourcePlayerConflicts.length) conflicts.push('MULTIPLE_PLAYER_IDS_SAME_SOURCE');
    if (unscopedPlayerIds.length > 1) conflicts.push('MULTIPLE_UNSCOPED_PLAYER_IDS');
    if (steamGuids.length > 1) conflicts.push('MULTIPLE_STEAM_GUIDS');
    if (userIds.length > 1) conflicts.push('MULTIPLE_USER_LINKS');
    if (profileIds.length > 1) conflicts.push('MULTIPLE_PROFILES');
    if (countries.length > 1) conflicts.push('COUNTRY_MISMATCH');
    if (teamIds.length > 1 || teamNames.length > 1) conflicts.push('TEAM_MISMATCH');
    if (avatarUrls.length > 1) conflicts.push('AVATAR_MISMATCH');
    if (duplicateEventScopes.length) conflicts.push('DUPLICATE_EVENT_STATISTICS');
    const confirmedMultiserver = steamGuids.length === 1
      && playerIdsBySource.length > 1
      && sameSourcePlayerConflicts.length === 0;
    return {
      identityGroupId: `identity-${String(index + 1).padStart(3, '0')}`,
      driverKeys,
      playerIds,
      playerScopes,
      playerIdsBySource,
      unscopedPlayerIds,
      identityStatus: confirmedMultiserver ? 'CONFIRMED_MULTISERVER_IDENTITY' : conflicts.length ? 'REVIEW_REQUIRED' : 'CONFIRMED_IDENTITY',
      confirmedMultiserver,
      steamGuids,
      names,
      normalizedNames,
      userIds,
      profileIds,
      countries,
      teams: { ids: teamIds, names: teamNames },
      avatarUrls,
      sources: unique(bucket.map((record) => record.sourceKey)),
      recordCounts: {
        total: bucket.length,
        ratings: bucket.filter((record) => record.kind === 'rating').length,
        results: bucket.filter((record) => record.kind === 'result').length,
        profiles: bucket.filter((record) => record.kind === 'profile').length,
        users: bucket.filter((record) => record.kind === 'user').length
      },
      canonicalCandidate: candidateKeys[0] || null,
      canonicalAlternatives: candidateKeys.slice(1),
      conflicts,
      statistics: {
        storedResultRows: eventScopes.length,
        uniqueEvents: eventScopeCounts.size,
        duplicateEventScopes,
        ratingRacesCount: bucket.reduce((sum, record) => sum + record.racesCount, 0),
        resultWins: bucket.filter((record) => record.kind === 'result').reduce((sum, record) => sum + record.wins, 0),
        resultPodiums: bucket.filter((record) => record.kind === 'result').reduce((sum, record) => sum + record.podiums, 0)
      }
    };
  });

  const groupByNormalizedName = new Map<string, string[]>();
  groups.forEach((group) => group.normalizedNames.forEach((name) => {
    if (!name) return;
    const ids = groupByNormalizedName.get(name) || [];
    ids.push(group.identityGroupId);
    groupByNormalizedName.set(name, ids);
  }));
  const ambiguousGroups = [...groupByNormalizedName.entries()]
    .filter(([, identityGroupIds]) => new Set(identityGroupIds).size > 1)
    .map(([normalizedName, identityGroupIds]) => ({ normalizedName, identityGroupIds: unique(identityGroupIds), reason: 'SAME_NAME_DIFFERENT_STRONG_IDENTITY' }));

  const duplicateUserLinks = groups
    .filter((group) => group.userIds.length > 1 || group.profileIds.length > 1 && group.userIds.length > 0)
    .map((group) => ({ identityGroupId: group.identityGroupId, userIds: group.userIds, profileIds: group.profileIds }));
  const orphanProfiles = groups
    .filter((group) => group.recordCounts.profiles > 0 && group.recordCounts.ratings === 0 && group.recordCounts.results === 0 && group.recordCounts.users === 0)
    .map((group) => ({ identityGroupId: group.identityGroupId, profileIds: group.profileIds, driverKeys: group.driverKeys, names: group.names }));
  const conflicts = groups
    .filter((group) => group.conflicts.length)
    .map((group) => ({ identityGroupId: group.identityGroupId, conflicts: group.conflicts }));
  const confirmedMultiserverIdentities = groups
    .filter((group) => group.confirmedMultiserver)
    .map((group) => ({ identityGroupId: group.identityGroupId, steamGuid: group.steamGuids[0], playerIdsBySource: group.playerIdsBySource }));
  const statisticsAtRisk = groups
    .filter((group) => group.driverKeys.length > 1 || group.statistics.duplicateEventScopes.length > 0)
    .map((group) => ({ identityGroupId: group.identityGroupId, driverKeys: group.driverKeys, statistics: group.statistics }));
  const canonicalCandidates = groups
    .filter((group) => group.driverKeys.length > 1 || group.profileIds.length > 1)
    .map((group) => ({ identityGroupId: group.identityGroupId, candidate: group.canonicalCandidate, alternatives: group.canonicalAlternatives }));
  const blockers = conflicts.filter((item) => item.conflicts.some((conflict) => [
    'MULTIPLE_STEAM_GUIDS', 'MULTIPLE_USER_LINKS', 'MULTIPLE_PROFILES', 'DUPLICATE_EVENT_STATISTICS'
  ].includes(conflict)));

  return {
    ok: true,
    source: `gc-ratings-v1:identity-audit:${source}`,
    version: 'GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    destructiveChangesApplied: false,
    safeToApply: blockers.length === 0 && ambiguousGroups.length === 0 && rejectedStrongLinks.length === 0,
    summary: {
      records: records.length,
      identityGroups: groups.length,
      mergeCandidates: canonicalCandidates.length,
      conflicts: conflicts.length,
      confirmedMultiserverIdentities: confirmedMultiserverIdentities.length,
      ambiguousGroups: ambiguousGroups.length,
      orphanProfiles: orphanProfiles.length,
      duplicateUserLinks: duplicateUserLinks.length,
      statisticsAtRisk: statisticsAtRisk.length
    },
    identityRules: {
      playerIdScope: 'source_key + stracker_player_id',
      crossSourcePlayerIdsAreConflict: false,
      sameSourceMultiplePlayerIdsAreConflict: true,
      eventDuplicateScope: 'source_key + event_scope_key',
      unscopedPlayerIdCanMerge: false,
      differentSteamIdsCanMerge: false,
      canonicalPriority: ['steam', 'opaque-driver-key', 'player', 'name']
    },
    rejectedStrongLinks,
    identityGroups: groups,
    canonicalCandidates,
    conflicts,
    confirmedMultiserverIdentities,
    ambiguousGroups,
    orphanProfiles,
    duplicateUserLinks,
    statisticsAtRisk
  };
}

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4',
    timezone: 'Z'
  };
}

async function existingTables(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
  return new Set(rows.map((row) => String(row.table_name)));
}

export async function readMysqlIdentityAuditV1() {
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) {
    throw new Error('Identity audit requiere el storage MySQL configurado; no se ha ejecutado ninguna escritura.');
  }
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
  try {
    const tables = await existingTables(pool);
    const missingTables = ['gc_driver_rating', 'gc_rating_event_result', 'gc_driver_profiles', 'gc_users'].filter((table) => !tables.has(table));
    const ratings = tables.has('gc_driver_rating') ? (await pool.query('SELECT driver_key, steam_guid, stracker_player_id, display_name, races_count, wins, podiums FROM gc_driver_rating'))[0] as any[] : [];
    const results = tables.has('gc_rating_event_result') ? (await pool.query('SELECT id, event_id, source_key, event_scope_key, driver_key, steam_guid, stracker_player_id, display_name, position FROM gc_rating_event_result'))[0] as any[] : [];
    const hasTeamTables = tables.has('gc_team_memberships') && tables.has('gc_teams');
    const profiles = tables.has('gc_driver_profiles')
      ? (await pool.query(hasTeamTables
        ? `SELECT d.id, d.driver_key, d.player_id, d.steam_guid, d.driver_name, d.display_name, d.avatar_url, d.country_code, d.linked_user_id,
            m.team_id, t.name AS team_name
          FROM gc_driver_profiles d
          LEFT JOIN gc_team_memberships m ON m.driver_profile_id = d.id AND m.status = 'active'
          LEFT JOIN gc_teams t ON t.id = m.team_id AND t.status = 'active'`
        : `SELECT d.id, d.driver_key, d.player_id, d.steam_guid, d.driver_name, d.display_name, d.avatar_url, d.country_code, d.linked_user_id,
            NULL AS team_id, NULL AS team_name
          FROM gc_driver_profiles d`))[0] as any[]
      : [];
    const users = tables.has('gc_users')
      ? (await pool.query(`SELECT id, display_name, pilot_player_id, pilot_steam_guid, pilot_stracker_name, team_name, pilot_country_code
          FROM gc_users
          WHERE pilot_player_id IS NOT NULL OR pilot_steam_guid IS NOT NULL OR pilot_stracker_name IS NOT NULL`))[0] as any[]
      : [];
    const payload = buildIdentityAuditV1({ ratings, results, profiles, users }, 'mysql');
    return {
      ...payload,
      safeToApply: missingTables.length === 0 && payload.safeToApply,
      storage: 'mysql',
      tables: {
        required: ['gc_driver_rating', 'gc_rating_event_result', 'gc_driver_profiles', 'gc_users'],
        missing: missingTables,
        rows: { ratings: ratings.length, results: results.length, profiles: profiles.length, users: users.length }
      }
    };
  } finally {
    await pool.end();
  }
}
