import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { readMysqlIdentityAuditV1 } from './identityAudit';

// GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1
type ReviewAction = 'defer' | 'keep_separate' | 'merge';

type ReviewDecision = {
  groupRef?: unknown;
  action?: unknown;
  targetGroupRef?: unknown;
  canonicalDriverKey?: unknown;
  canonicalProfileId?: unknown;
  canonicalUserId?: unknown;
  displayName?: unknown;
  keepResultIdsByScope?: unknown;
};

type PreviewRequest = {
  snapshotId?: unknown;
  decisions?: unknown;
};

function cleanText(value: unknown, max = 255) {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
}

function unique(values: unknown[]) {
  return [...new Set(values.map((value) => cleanText(value, 500)).filter((value): value is string => Boolean(value)))].sort();
}

function scopedEventKey(row: any) {
  const sourceKey = cleanText(row?.source_key, 80) || 'unknown';
  const eventKey = cleanText(row?.event_scope_key, 255) || cleanText(row?.event_id, 255) || 'unknown';
  return `${sourceKey}::${eventKey}`;
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

function groupIdentity(group: any) {
  return {
    driverKeys: unique(group?.driverKeys || []),
    playerScopes: unique(group?.playerScopes || []),
    steamGuids: unique(group?.steamGuids || []),
    profileIds: unique(group?.profileIds || []),
    userIds: unique(group?.userIds || [])
  };
}

function groupRef(group: any) {
  const fingerprint = JSON.stringify(groupIdentity(group));
  return `igr_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`;
}

function snapshotId(groups: any[], rows?: Awaited<ReturnType<typeof readRows>>) {
  const state = {
    groups: groups.map((group) => ({
      ref: groupRef(group),
      recordCounts: group.recordCounts,
      duplicateEventScopes: group.statistics?.duplicateEventScopes || []
    })).sort((left, right) => left.ref.localeCompare(right.ref)),
    rows: rows ? {
      ratings: rows.ratings.map((row) => [String(row.id), row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name, row.races_count]),
      results: rows.results.map((row) => [String(row.id), row.event_scope_key, row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name, row.position]),
      profiles: rows.profiles.map((row) => [String(row.id), row.driver_key, row.player_id, row.steam_guid, row.display_name, row.linked_user_id, Number(row.active_memberships || 0)]),
      users: rows.users.map((row) => [String(row.id), row.pilot_player_id, row.pilot_steam_guid, row.pilot_stracker_name])
    } : null
  };
  return `ids_${createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 24)}`;
}

function decorateAudit(audit: any) {
  const groups = (audit.identityGroups || []).map((group: any) => ({ ...group, groupRef: groupRef(group) }));
  const refByLegacyId = new Map(groups.map((group: any) => [group.identityGroupId, group.groupRef]));
  const ambiguousGroups = (audit.ambiguousGroups || []).map((entry: any) => ({
    ...entry,
    groupRefs: (entry.identityGroupIds || []).map((id: string) => refByLegacyId.get(id)).filter(Boolean)
  }));
  return {
    ...audit,
    identityGroups: groups,
    ambiguousGroups,
    snapshotId: snapshotId(groups)
  };
}

function isOrphanProfileGroup(group: any) {
  return Boolean(
    group?.recordCounts?.profiles > 0 &&
    group?.recordCounts?.ratings === 0 &&
    group?.recordCounts?.results === 0 &&
    group?.recordCounts?.users === 0
  );
}

function buildReviewAssignments(groups: any[], ambiguousGroups: any[]) {
  const assignments = new Map<string, any>();
  for (const group of groups) {
    if (group?.conflicts?.length || group?.profileIds?.length > 1 || group?.userIds?.length > 1) {
      assignments.set(group.groupRef, { reviewKind: 'identity_conflict', candidateGroupRefs: [] });
    }
  }
  for (const ambiguity of ambiguousGroups) {
    const related = groups.filter((group) => (ambiguity.groupRefs || []).includes(group.groupRef));
    const orphans = related.filter(isOrphanProfileGroup);
    const candidates = related.filter((group) => !isOrphanProfileGroup(group));
    for (const orphan of orphans) {
      if (!candidates.length) continue;
      assignments.set(orphan.groupRef, {
        reviewKind: 'profile_link',
        normalizedName: ambiguity.normalizedName,
        candidateGroupRefs: candidates.map((group) => group.groupRef)
      });
    }
    if (!orphans.length && related.length > 1) {
      const [primary, ...alternatives] = related;
      if (!assignments.has(primary.groupRef)) {
        assignments.set(primary.groupRef, {
          reviewKind: 'identity_ambiguity',
          normalizedName: ambiguity.normalizedName,
          candidateGroupRefs: alternatives.map((group) => group.groupRef)
        });
      }
    }
  }
  return assignments;
}

function normalizeDecision(input: ReviewDecision) {
  const action = cleanText(input.action, 30) as ReviewAction | null;
  const keepMap: Record<string, string> = {};
  if (input.keepResultIdsByScope && typeof input.keepResultIdsByScope === 'object' && !Array.isArray(input.keepResultIdsByScope)) {
    for (const [scope, id] of Object.entries(input.keepResultIdsByScope as Record<string, unknown>)) {
      const safeScope = cleanText(scope, 255);
      const safeId = cleanText(id, 80);
      if (safeScope && safeId) keepMap[safeScope] = safeId;
    }
  }
  return {
    groupRef: cleanText(input.groupRef, 40),
    action,
    targetGroupRef: cleanText(input.targetGroupRef, 40),
    canonicalDriverKey: cleanText(input.canonicalDriverKey, 191),
    canonicalProfileId: cleanText(input.canonicalProfileId, 64),
    canonicalUserId: cleanText(input.canonicalUserId, 64),
    displayName: cleanText(input.displayName, 160),
    keepResultIdsByScope: keepMap
  };
}

async function readRows(pool: Pool) {
  const [ratings] = await pool.query<RowDataPacket[]>(
    'SELECT id, driver_key, steam_guid, stracker_player_id, display_name, races_count, wins, podiums FROM gc_driver_rating ORDER BY id'
  );
  const [results] = await pool.query<RowDataPacket[]>(
    'SELECT id, event_id, source_key, event_scope_key, driver_key, steam_guid, stracker_player_id, display_name, position FROM gc_rating_event_result ORDER BY source_key, event_id, position, id'
  );
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT d.id, d.driver_key, d.player_id, d.steam_guid, d.driver_name, d.display_name, d.linked_user_id,
            d.created_at, d.updated_at,
            (SELECT COUNT(*) FROM gc_team_memberships m WHERE m.driver_profile_id = d.id AND m.status = 'active') AS active_memberships
       FROM gc_driver_profiles d
      ORDER BY d.id`
  );
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT id, display_name, pilot_player_id, pilot_steam_guid, pilot_stracker_name
       FROM gc_users
      WHERE pilot_player_id IS NOT NULL OR pilot_steam_guid IS NOT NULL OR pilot_stracker_name IS NOT NULL
      ORDER BY id`
  );
  return { ratings: ratings as any[], results: results as any[], profiles: profiles as any[], users: users as any[] };
}

function sameNormalizedName(left: any, right: any) {
  const leftNames = new Set((left?.normalizedNames || []).map(String));
  return (right?.normalizedNames || []).some((name: unknown) => leftNames.has(String(name)));
}

function steamCompatible(left: any, right: any) {
  const leftSteam = unique(left?.steamGuids || []);
  const rightSteam = unique(right?.steamGuids || []);
  if (!leftSteam.length || !rightSteam.length) return true;
  return leftSteam.length === 1 && rightSteam.length === 1 && leftSteam[0] === rightSteam[0];
}

function chooseCanonicalProfile(group: any, groupRows: ReturnType<typeof rowsForGroups>, canonicalDriverKey: string | null) {
  if (!groupRows.profiles.length) return { id: null, reason: 'La identidad no tiene perfil.' };
  if (groupRows.profiles.length === 1) return { id: String(groupRows.profiles[0].id), reason: 'Es el único perfil disponible.' };
  const steam = unique(group?.steamGuids || [])[0] || null;
  const user = unique(group?.userIds || [])[0] || null;
  const scored = groupRows.profiles.map((row: any) => {
    let score = 0;
    const reasons: string[] = [];
    if (canonicalDriverKey && String(row.driver_key) === canonicalDriverKey) { score += 16; reasons.push('usa la clave canónica'); }
    if (steam && cleanText(row.steam_guid, 191)?.toLowerCase() === steam.toLowerCase()) { score += 8; reasons.push('coincide con Steam'); }
    if (user && String(row.linked_user_id || '') === user) { score += 4; reasons.push('está enlazado a la cuenta'); }
    const memberships = Number(row.active_memberships || 0);
    if (memberships === 1) { score += 2; reasons.push('conserva la membresía activa'); }
    return { id: String(row.id), score, reasons };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (!scored[0] || scored[0].score === 0 || scored[0].score === scored[1]?.score) {
    return { id: null, reason: 'Los perfiles son equivalentes; elegir uno sería arbitrario.' };
  }
  return { id: scored[0].id, reason: `Perfil objetivo único: ${scored[0].reasons.join(', ')}.` };
}

function buildAutomaticDecision(group: any, assignment: any, groupByRef: Map<string, any>, rows: Awaited<ReturnType<typeof readRows>>) {
  if (!assignment) return null;
  if (assignment.reviewKind === 'profile_link') {
    if (assignment.candidateGroupRefs.length !== 1) return { classification: 'manual', reason: 'Hay más de una identidad candidata.' };
    const target = groupByRef.get(assignment.candidateGroupRefs[0]);
    if (!target || !sameNormalizedName(group, target)) return { classification: 'blocked', reason: 'La coincidencia exacta de nombre ya no es válida.' };
    if (!steamCompatible(group, target)) return { classification: 'blocked', reason: 'El perfil y el candidato tienen Steam incompatibles.' };
    if ((target.conflicts || []).length || (target.steamGuids || []).length > 1 || (target.userIds || []).length > 1) {
      return { classification: 'manual', reason: 'La identidad candidata contiene un conflicto propio.' };
    }
    const targetRows = rowsForGroups(rows, [target]);
    const canonicalDriverKey = target.canonicalCandidate?.driverKey || target.driverKeys?.[0] || null;
    if (!canonicalDriverKey) return { classification: 'blocked', reason: 'El candidato no tiene una clave canónica.' };
    const profileChoice = chooseCanonicalProfile(target, targetRows, canonicalDriverKey);
    return {
      classification: 'safe',
      reason: 'Nombre exacto, candidato único y ninguna identidad fuerte contradictoria.',
      decision: {
        groupRef: group.groupRef,
        action: 'merge',
        targetGroupRef: target.groupRef,
        canonicalDriverKey,
        canonicalProfileId: profileChoice.id,
        canonicalUserId: target.userIds?.length === 1 ? String(target.userIds[0]) : null,
        displayName: target.names?.[0] || group.names?.[0] || null,
        keepResultIdsByScope: {}
      }
    };
  }
  if (assignment.reviewKind === 'identity_conflict') {
    const conflicts = unique(group.conflicts || []);
    const automaticConflict = conflicts.length > 0 && conflicts.every((item) => item === 'MULTIPLE_PROFILES');
    if (!automaticConflict || (group.steamGuids || []).length !== 1 || (group.userIds || []).length > 1 || (group.statistics?.duplicateEventScopes || []).length) {
      return { classification: 'manual', reason: 'El conflicto contiene señales que no permiten una consolidación automática.' };
    }
    const canonicalDriverKey = group.canonicalCandidate?.driverKey || group.driverKeys?.[0] || null;
    const groupRows = rowsForGroups(rows, [group]);
    const profileChoice = chooseCanonicalProfile(group, groupRows, canonicalDriverKey);
    if (!canonicalDriverKey || !profileChoice.id) return { classification: 'manual', reason: profileChoice.reason };
    return {
      classification: 'safe',
      reason: `Un solo Steam y una elección objetiva del perfil. ${profileChoice.reason}`,
      decision: {
        groupRef: group.groupRef,
        action: 'merge',
        targetGroupRef: null,
        canonicalDriverKey,
        canonicalProfileId: profileChoice.id,
        canonicalUserId: group.userIds?.length === 1 ? String(group.userIds[0]) : null,
        displayName: group.names?.[0] || null,
        keepResultIdsByScope: {}
      }
    };
  }
  return { classification: 'manual', reason: 'La coincidencia requiere revisión humana.' };
}

function rowsForGroups(rows: Awaited<ReturnType<typeof readRows>>, groups: any[]) {
  const driverKeys = new Set(groups.flatMap((group) => group.driverKeys || []));
  const profileIds = new Set(groups.flatMap((group) => group.profileIds || []));
  const userIds = new Set(groups.flatMap((group) => group.userIds || []));
  return {
    ratings: rows.ratings.filter((row) => driverKeys.has(String(row.driver_key))),
    results: rows.results.filter((row) => driverKeys.has(String(row.driver_key))),
    profiles: rows.profiles.filter((row) => profileIds.has(String(row.id))),
    users: rows.users.filter((row) => userIds.has(String(row.id)))
  };
}

function change(table: string, rowId: unknown, operation: string, before: Record<string, unknown>, after: Record<string, unknown>, note?: string) {
  return { table, rowId: String(rowId), operation, before, after, ...(note ? { note } : {}) };
}

function buildMergeChanges(selectedRows: ReturnType<typeof rowsForGroups>, decision: ReturnType<typeof normalizeDecision>) {
  const changes: any[] = [];
  const blockers: string[] = [];
  const canonicalDriverKey = decision.canonicalDriverKey;
  if (!canonicalDriverKey) blockers.push('Falta elegir la clave canónica.');

  for (const row of selectedRows.ratings) {
    if (String(row.driver_key) === canonicalDriverKey) continue;
    changes.push(change('gc_driver_rating', row.id, 'REBUILD_CANONICAL_RATING',
      { driverKey: row.driver_key, displayName: row.display_name, racesCount: row.races_count },
      { driverKey: canonicalDriverKey, displayName: decision.displayName || row.display_name },
      'No es un UPDATE directo: 4H.3 deberá recalcular cronológicamente el rating canónico.'));
  }

  const byScope = new Map<string, any[]>();
  for (const row of selectedRows.results) {
    const scope = scopedEventKey(row);
    const bucket = byScope.get(scope) || [];
    bucket.push(row);
    byScope.set(scope, bucket);
  }
  for (const [scope, scopeRows] of byScope) {
    const chosenKeep = decision.keepResultIdsByScope[scope];
    if (scopeRows.length > 1 && (!chosenKeep || !scopeRows.some((row) => String(row.id) === chosenKeep))) {
      blockers.push(`El evento duplicado ${scope} necesita una fila a conservar.`);
    }
    for (const row of scopeRows) {
      if (scopeRows.length > 1 && chosenKeep && String(row.id) !== chosenKeep) {
        changes.push(change('gc_rating_event_result', row.id, 'EXCLUDE_DUPLICATE_FROM_REBUILD',
          { driverKey: row.driver_key, eventScopeKey: scope, position: row.position },
          { excludedFromCanonicalRebuild: true },
          'El preview no borra la fila histórica.'));
      } else if (String(row.driver_key) !== canonicalDriverKey || decision.displayName && String(row.display_name) !== decision.displayName) {
        changes.push(change('gc_rating_event_result', row.id, 'REMAP_IDENTITY',
          { driverKey: row.driver_key, displayName: row.display_name, eventScopeKey: scope },
          { driverKey: canonicalDriverKey, displayName: decision.displayName || row.display_name }));
      }
    }
  }

  for (const row of selectedRows.profiles) {
    if (String(row.id) === decision.canonicalProfileId) {
      if (String(row.driver_key) !== canonicalDriverKey || decision.canonicalUserId && String(row.linked_user_id || '') !== decision.canonicalUserId) {
        changes.push(change('gc_driver_profiles', row.id, 'UPDATE_CANONICAL_PROFILE',
          { driverKey: row.driver_key, linkedUserId: row.linked_user_id },
          { driverKey: canonicalDriverKey, linkedUserId: decision.canonicalUserId || row.linked_user_id }));
      }
    } else {
      changes.push(change('gc_driver_profiles', row.id, 'CONSOLIDATE_PROFILE',
        { driverKey: row.driver_key, linkedUserId: row.linked_user_id },
        { canonicalProfileId: decision.canonicalProfileId },
        'Requiere trasladar membresías antes de retirar el perfil duplicado.'));
    }
  }
  if (selectedRows.profiles.length > 1 && !decision.canonicalProfileId) blockers.push('Falta elegir el perfil canónico.');

  for (const row of selectedRows.users) {
    if (String(row.id) === decision.canonicalUserId) {
      changes.push(change('gc_users', row.id, 'LINK_CANONICAL_IDENTITY',
        { playerId: row.pilot_player_id, steamGuid: row.pilot_steam_guid, name: row.pilot_stracker_name },
        { driverKey: canonicalDriverKey, displayName: decision.displayName || row.pilot_stracker_name }));
    } else if (selectedRows.users.length > 1) {
      changes.push(change('gc_users', row.id, 'UNLINK_DUPLICATE_PILOT_IDENTITY',
        { playerId: row.pilot_player_id, steamGuid: row.pilot_steam_guid, name: row.pilot_stracker_name },
        { preserveAccount: true, pilotIdentityLink: null },
        'La cuenta se conserva; solo se simula retirar el vínculo de piloto duplicado.'));
    }
  }
  if (selectedRows.users.length > 1 && !decision.canonicalUserId) blockers.push('Falta elegir la cuenta canónica.');
  return { changes, blockers };
}

function buildProfileLinkChanges(
  selectedRows: ReturnType<typeof rowsForGroups>,
  orphanProfileIds: Set<string>,
  decision: ReturnType<typeof normalizeDecision>
) {
  const changes: any[] = [];
  const blockers: string[] = [];
  if (!decision.canonicalDriverKey) blockers.push('Falta elegir la identidad canónica.');
  const orphanProfiles = selectedRows.profiles.filter((row) => orphanProfileIds.has(String(row.id)));
  const candidateProfiles = selectedRows.profiles.filter((row) => !orphanProfileIds.has(String(row.id)));
  if (!orphanProfiles.length) blockers.push('El perfil huérfano ya no existe en el snapshot.');
  if (candidateProfiles.length > 1 && !decision.canonicalProfileId) blockers.push('La identidad candidata tiene varios perfiles; elige el canónico.');
  const canonicalProfileId = decision.canonicalProfileId || (candidateProfiles.length === 1 ? String(candidateProfiles[0].id) : null);
  for (const row of orphanProfiles) {
    if (canonicalProfileId && String(row.id) !== canonicalProfileId) {
      changes.push(change('gc_driver_profiles', row.id, 'LINK_ORPHAN_PROFILE_TO_IDENTITY',
        { driverKey: row.driver_key, linkedUserId: row.linked_user_id },
        { canonicalDriverKey: decision.canonicalDriverKey, canonicalProfileId },
        '4H.3 deberá trasladar membresías y conservar el historial antes de retirar el perfil huérfano.'));
    } else if (String(row.driver_key) !== decision.canonicalDriverKey) {
      changes.push(change('gc_driver_profiles', row.id, 'ADOPT_ORPHAN_AS_CANONICAL_PROFILE',
        { driverKey: row.driver_key, linkedUserId: row.linked_user_id },
        { driverKey: decision.canonicalDriverKey, linkedUserId: decision.canonicalUserId || row.linked_user_id }));
    }
  }
  return { changes, blockers };
}

export async function readMysqlIdentityPreviewBootstrapV1() {
  const audit = decorateAudit(await readMysqlIdentityAuditV1());
  const reviewAssignments = buildReviewAssignments(audit.identityGroups, audit.ambiguousGroups);
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) throw new Error('Identity preview requiere MySQL configurado.');
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
  try {
    const rows = await readRows(pool);
    const currentSnapshotId = snapshotId(audit.identityGroups, rows);
    const groupByRef = new Map<string, any>(audit.identityGroups.map((group: any) => [group.groupRef, group]));
    const automaticByRef = new Map<string, any>();
    for (const group of audit.identityGroups) {
      const assignment = reviewAssignments.get(group.groupRef);
      if (assignment) automaticByRef.set(group.groupRef, buildAutomaticDecision(group, assignment, groupByRef, rows));
    }
    return {
      ok: true,
      source: 'gc-ratings-v1:identity-preview:mysql',
      version: 'GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      snapshotId: currentSnapshotId,
      groups: audit.identityGroups.map((group: any) => {
        const groupRows = rowsForGroups(rows, [group]);
        const assignment = reviewAssignments.get(group.groupRef);
        return {
          ...group,
          requiresDecision: Boolean(assignment),
          reviewKind: assignment?.reviewKind || null,
          reviewName: assignment?.normalizedName || null,
          ambiguousWith: assignment?.candidateGroupRefs || [],
          automatic: automaticByRef.get(group.groupRef) || null,
          rowOptions: {
            ratings: groupRows.ratings.map((row) => ({ id: String(row.id), driverKey: row.driver_key, displayName: row.display_name })),
            results: groupRows.results.map((row) => ({
              id: String(row.id),
              eventScopeKey: scopedEventKey(row),
              driverKey: row.driver_key,
              displayName: row.display_name,
              position: Number(row.position || 0)
            })),
            profiles: groupRows.profiles.map((row) => ({ id: String(row.id), driverKey: row.driver_key, displayName: row.display_name || row.driver_name, linkedUserId: row.linked_user_id, steamGuid: row.steam_guid, playerId: row.player_id, activeMemberships: Number(row.active_memberships || 0) })),
            users: groupRows.users.map((row) => ({ id: String(row.id), displayName: row.display_name, pilotName: row.pilot_stracker_name, steamGuid: row.pilot_steam_guid, playerId: row.pilot_player_id }))
          }
        };
      }),
      ambiguousGroups: audit.ambiguousGroups,
      reviewSummary: {
        cases: reviewAssignments.size,
        profileLinks: [...reviewAssignments.values()].filter((item) => item.reviewKind === 'profile_link').length,
        identityConflicts: [...reviewAssignments.values()].filter((item) => item.reviewKind === 'identity_conflict').length
        ,automaticSafe: [...automaticByRef.values()].filter((item) => item?.classification === 'safe').length
        ,manualRequired: [...automaticByRef.values()].filter((item) => item?.classification !== 'safe').length
      },
      instructions: {
        decisionsAreTemporary: true,
        noSqlIsExecuted: true,
        mergeRequiresCanonicalIdentity: true,
        duplicateEventsRequireManualKeepRow: true
        ,automaticDecisionsRequirePreview: true
      }
    };
  } finally {
    await pool.end();
  }
}

export async function buildMysqlIdentityPreviewV1(request: PreviewRequest) {
  const bootstrap = await readMysqlIdentityPreviewBootstrapV1();
  if (cleanText(request.snapshotId, 80) !== bootstrap.snapshotId) {
    return { ...bootstrap, ok: false, stale: true, safeToExecute: false, message: 'Los datos cambiaron desde que abriste la revisión. Recarga antes de continuar.' };
  }
  if (!Array.isArray(request.decisions) || request.decisions.length > 200) {
    return { ...bootstrap, ok: false, safeToExecute: false, message: 'Decisiones inválidas.' };
  }
  const decisions = request.decisions.map((item) => normalizeDecision(item || {}));
  const decisionByRef = new Map(decisions.filter((item) => item.groupRef).map((item) => [item.groupRef as string, item]));
  const groupByRef = new Map<string, any>(bootstrap.groups.map((group: any) => [group.groupRef, group]));
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) throw new Error('Identity preview requiere MySQL configurado.');
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
  try {
    const rows = await readRows(pool);
    const plans: any[] = [];
    const globalBlockers: string[] = [];
    for (const group of bootstrap.groups.filter((item: any) => item.requiresDecision)) {
      const decision = decisionByRef.get(group.groupRef);
      if (!decision || !['defer', 'keep_separate', 'merge'].includes(String(decision.action))) {
        globalBlockers.push(`${group.groupRef}: falta una decisión válida.`);
        plans.push({ groupRef: group.groupRef, action: 'missing', changes: [], blockers: ['Decisión pendiente.'] });
        continue;
      }
      if (decision.action === 'defer') {
        globalBlockers.push(`${group.groupRef}: revisión aplazada.`);
        plans.push({ groupRef: group.groupRef, action: 'defer', changes: [], blockers: ['Revisión aplazada.'] });
        continue;
      }
      if (decision.action === 'keep_separate') {
        plans.push({ groupRef: group.groupRef, action: 'keep_separate', changes: [], blockers: [] });
        continue;
      }
      const target = decision.targetGroupRef ? groupByRef.get(decision.targetGroupRef) : null;
      if (decision.targetGroupRef && !target) {
        globalBlockers.push(`${group.groupRef}: el grupo destino no existe.`);
        plans.push({ groupRef: group.groupRef, action: 'merge', changes: [], blockers: ['Grupo destino inválido.'] });
        continue;
      }
      if (target && !(group.ambiguousWith || []).includes(target.groupRef)) {
        globalBlockers.push(`${group.groupRef}: el destino no está autorizado por una ambigüedad detectada.`);
        plans.push({ groupRef: group.groupRef, action: 'merge', changes: [], blockers: ['Grupo destino no autorizado.'] });
        continue;
      }
      if (group.reviewKind === 'profile_link' && !target) {
        globalBlockers.push(`${group.groupRef}: falta elegir la identidad candidata.`);
        plans.push({ groupRef: group.groupRef, action: 'merge', changes: [], blockers: ['Identidad candidata obligatoria.'] });
        continue;
      }
      const mergedGroups = target && target.groupRef !== group.groupRef ? [group, target] : [group];
      const allowedDriverKeys = new Set(mergedGroups.flatMap((item: any) => item.driverKeys || []));
      const allowedProfileIds = new Set(mergedGroups.flatMap((item: any) => item.profileIds || []));
      const allowedUserIds = new Set(mergedGroups.flatMap((item: any) => item.userIds || []));
      const validationBlockers: string[] = [];
      if (!decision.canonicalDriverKey || !allowedDriverKeys.has(decision.canonicalDriverKey)) validationBlockers.push('La clave canónica no pertenece a los grupos seleccionados.');
      if (group.reviewKind === 'profile_link' && target && !(target.driverKeys || []).includes(decision.canonicalDriverKey)) validationBlockers.push('La identidad canónica debe pertenecer al candidato, no al perfil huérfano.');
      if (decision.canonicalProfileId && !allowedProfileIds.has(decision.canonicalProfileId)) validationBlockers.push('El perfil canónico no pertenece a los grupos seleccionados.');
      if (decision.canonicalUserId && !allowedUserIds.has(decision.canonicalUserId)) validationBlockers.push('La cuenta canónica no pertenece a los grupos seleccionados.');
      const selectedRows = rowsForGroups(rows, mergedGroups);
      const effectiveDecision = {
        ...decision,
        canonicalProfileId: decision.canonicalProfileId || (selectedRows.profiles.length === 1 ? String(selectedRows.profiles[0].id) : null),
        canonicalUserId: decision.canonicalUserId || (selectedRows.users.length === 1 ? String(selectedRows.users[0].id) : null)
      };
      const built = group.reviewKind === 'profile_link'
        ? buildProfileLinkChanges(selectedRows, new Set((group.profileIds || []).map(String)), effectiveDecision)
        : buildMergeChanges(selectedRows, effectiveDecision);
      const blockers = [...validationBlockers, ...built.blockers];
      blockers.forEach((message) => globalBlockers.push(`${group.groupRef}: ${message}`));
      plans.push({
        groupRef: group.groupRef,
        targetGroupRef: target?.groupRef || null,
        action: 'merge',
        canonical: {
          driverKey: effectiveDecision.canonicalDriverKey,
          profileId: effectiveDecision.canonicalProfileId,
          userId: effectiveDecision.canonicalUserId,
          displayName: effectiveDecision.displayName
        },
        selectedRows: {
          ratings: selectedRows.ratings.length,
          results: selectedRows.results.length,
          profiles: selectedRows.profiles.length,
          users: selectedRows.users.length
        },
        changes: built.changes,
        blockers
      });
    }
    const allChanges = plans.flatMap((plan) => plan.changes || []);
    const changedRows = new Map<string, number>();
    allChanges.forEach((item) => {
      const key = `${item.table}:${item.rowId}`;
      changedRows.set(key, (changedRows.get(key) || 0) + 1);
    });
    [...changedRows.entries()].filter(([, count]) => count > 1).forEach(([rowKey]) => {
      globalBlockers.push(`La fila ${rowKey} aparece en más de un plan; revisa las decisiones cruzadas.`);
    });
    return {
      ok: true,
      source: 'gc-ratings-v1:identity-preview:mysql',
      version: 'GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1',
      generatedAt: new Date().toISOString(),
      snapshotId: bootstrap.snapshotId,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      safeToExecute: false,
      readyForExecutorDesign: globalBlockers.length === 0,
      summary: {
        decisions: decisions.length,
        plans: plans.length,
        proposedChanges: allChanges.length,
        blockers: globalBlockers.length
      },
      blockers: globalBlockers,
      plans
    };
  } finally {
    await pool.end();
  }
}
