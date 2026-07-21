import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { readMysqlIdentityAuditV1 } from './identityAudit';

// GC_PHASE4H2_4_IDENTITY_PREVIEW_RESIDUAL_CONFLICT_FIX_V1
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
      profiles: rows.profiles.map((row) => [String(row.id), row.driver_key, row.player_id, row.steam_guid, row.display_name, row.linked_user_id]),
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

function isAttentionGroup(group: any, ambiguousRefs: Set<string>) {
  return Boolean(
    group?.conflicts?.length ||
    group?.profileIds?.length > 1 ||
    group?.userIds?.length > 1 ||
    ambiguousRefs.has(group?.groupRef)
  );
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
    'SELECT id, driver_key, player_id, steam_guid, driver_name, display_name, linked_user_id FROM gc_driver_profiles ORDER BY id'
  );
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT id, display_name, pilot_player_id, pilot_steam_guid, pilot_stracker_name
       FROM gc_users
      WHERE pilot_player_id IS NOT NULL OR pilot_steam_guid IS NOT NULL OR pilot_stracker_name IS NOT NULL
      ORDER BY id`
  );
  return { ratings: ratings as any[], results: results as any[], profiles: profiles as any[], users: users as any[] };
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

export async function readMysqlIdentityPreviewBootstrapV1() {
  const audit = decorateAudit(await readMysqlIdentityAuditV1());
  const ambiguousRefs = new Set<string>(audit.ambiguousGroups.flatMap((entry: any) => entry.groupRefs || []));
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) throw new Error('Identity preview requiere MySQL configurado.');
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
  try {
    const rows = await readRows(pool);
    const currentSnapshotId = snapshotId(audit.identityGroups, rows);
    return {
      ok: true,
      source: 'gc-ratings-v1:identity-preview:mysql',
      version: 'GC_PHASE4H2_4_IDENTITY_PREVIEW_RESIDUAL_CONFLICT_FIX_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      snapshotId: currentSnapshotId,
      groups: audit.identityGroups.map((group: any) => {
        const groupRows = rowsForGroups(rows, [group]);
        return {
          ...group,
          requiresDecision: isAttentionGroup(group, ambiguousRefs),
          ambiguousWith: audit.ambiguousGroups
            .filter((entry: any) => entry.groupRefs?.includes(group.groupRef))
            .flatMap((entry: any) => entry.groupRefs.filter((ref: string) => ref !== group.groupRef)),
          rowOptions: {
            ratings: groupRows.ratings.map((row) => ({ id: String(row.id), driverKey: row.driver_key, displayName: row.display_name })),
            results: groupRows.results.map((row) => ({
              id: String(row.id),
              eventScopeKey: scopedEventKey(row),
              driverKey: row.driver_key,
              displayName: row.display_name,
              position: Number(row.position || 0)
            })),
            profiles: groupRows.profiles.map((row) => ({ id: String(row.id), driverKey: row.driver_key, displayName: row.display_name || row.driver_name, linkedUserId: row.linked_user_id })),
            users: groupRows.users.map((row) => ({ id: String(row.id), displayName: row.display_name, pilotName: row.pilot_stracker_name, steamGuid: row.pilot_steam_guid, playerId: row.pilot_player_id }))
          }
        };
      }),
      ambiguousGroups: audit.ambiguousGroups,
      instructions: {
        decisionsAreTemporary: true,
        noSqlIsExecuted: true,
        mergeRequiresCanonicalIdentity: true,
        duplicateEventsRequireManualKeepRow: true
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
    if (snapshotId(bootstrap.groups, rows) !== bootstrap.snapshotId) {
      return {
        ok: false,
        source: 'gc-ratings-v1:identity-preview:mysql',
        version: 'GC_PHASE4H2_IDENTITY_PREVIEW_V1',
        generatedAt: new Date().toISOString(),
        readOnly: true,
        writesAvailable: false,
        destructiveChangesApplied: false,
        stale: true,
        safeToExecute: false,
        message: 'MySQL cambió durante la simulación. Recarga el snapshot.'
      };
    }
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
      const mergedGroups = target && target.groupRef !== group.groupRef ? [group, target] : [group];
      const allowedDriverKeys = new Set(mergedGroups.flatMap((item: any) => item.driverKeys || []));
      const allowedProfileIds = new Set(mergedGroups.flatMap((item: any) => item.profileIds || []));
      const allowedUserIds = new Set(mergedGroups.flatMap((item: any) => item.userIds || []));
      const validationBlockers: string[] = [];
      if (!decision.canonicalDriverKey || !allowedDriverKeys.has(decision.canonicalDriverKey)) validationBlockers.push('La clave canónica no pertenece a los grupos seleccionados.');
      if (decision.canonicalProfileId && !allowedProfileIds.has(decision.canonicalProfileId)) validationBlockers.push('El perfil canónico no pertenece a los grupos seleccionados.');
      if (decision.canonicalUserId && !allowedUserIds.has(decision.canonicalUserId)) validationBlockers.push('La cuenta canónica no pertenece a los grupos seleccionados.');
      const selectedRows = rowsForGroups(rows, mergedGroups);
      const effectiveDecision = {
        ...decision,
        canonicalProfileId: decision.canonicalProfileId || (selectedRows.profiles.length === 1 ? String(selectedRows.profiles[0].id) : null),
        canonicalUserId: decision.canonicalUserId || (selectedRows.users.length === 1 ? String(selectedRows.users[0].id) : null)
      };
      const built = buildMergeChanges(selectedRows, effectiveDecision);
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
      version: 'GC_PHASE4H2_IDENTITY_PREVIEW_V1',
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
