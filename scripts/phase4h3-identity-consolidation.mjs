#!/usr/bin/env node
// GC_PHASE4H3_IDENTITY_CONSOLIDATION_V1
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

const VERSION = 'GC_PHASE4H3_IDENTITY_CONSOLIDATION_V1';
const APPLY_WORDS = 'APLICAR 4H.3';
const ROLLBACK_WORDS = 'REVERTIR 4H.3';

const mappings = [
  {
    sourceProfileId: 'drv_4b9e4286-bfaa-4fc9-8ab9-74192cbb3bb2',
    sourceDriverKey: 'name:police1370',
    canonicalProfileId: 'drv_24c9311c-5041-4d4e-8c42-e9727a1e5eac',
    canonicalDriverKey: 'steam:sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c',
    canonicalUserId: '9e5e76c6-8497-4d93-9e6c-83006ffcdb46'
  },
  {
    sourceProfileId: 'drv_0b21fc11-1a65-4130-92e2-1a4f7dfef343',
    sourceDriverKey: 'name:pedro diaz',
    canonicalProfileId: 'drv_56d82b6c-84f7-4b02-b759-7d58cff205f9',
    canonicalDriverKey: 'steam:sha256#e1561220de2cf9b7247134c9b78ecfd59dad86638e993d4f8ed77a3135ff78ad'
  },
  {
    sourceProfileId: 'drv_121b0c86-06d8-4f75-bea2-20a0ac0857d5',
    sourceDriverKey: 'name:neo',
    canonicalProfileId: 'drv_fce29813-f6ea-4d5d-90ae-09040ba34423',
    canonicalDriverKey: 'steam:sha256#882f3749605f88db5da6a53844ad0a6cb3366cc4427a137874abd800cf9e73cb'
  },
  {
    sourceProfileId: 'drv_3c4185e5-f2cd-476d-83b3-7f48181c9eef',
    sourceDriverKey: 'name:xan',
    canonicalProfileId: 'drv_71c4969f-e500-4863-8367-b75f21983016',
    canonicalDriverKey: 'steam:sha256#550e210571f1207127361a6ee59afb8928fbbd70c9f8374f50a50548e0e723d7'
  },
  {
    sourceProfileId: 'drv_7c72a2e6-9b71-4623-8e6c-b72a040b2eed',
    sourceDriverKey: 'player:27',
    canonicalProfileId: 'drv_eb8b2f76-b42b-4b34-9f20-a3936757ea3e',
    canonicalDriverKey: 'steam:sha256#395fed6144d462abb6504fc8173d6b9da33e1fcfb1a0b2302511caebf1bea70c'
  },
  {
    sourceProfileId: 'drv_8dc2956f-34f3-42e0-8eeb-6e58d12c9d9e',
    sourceDriverKey: 'name:angel',
    canonicalProfileId: 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2',
    canonicalDriverKey: 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26'
  },
  {
    sourceProfileId: 'drv_9de16504-359c-4866-a378-46658f043f81',
    sourceDriverKey: 'name:fran',
    canonicalProfileId: 'drv_cd255453-501c-4f13-b94f-334800a6fce0',
    canonicalDriverKey: 'steam:sha256#a6beaebae5a051c8329951606671893cee8e2a27207f28f0f3b283b0f567f487'
  },
  {
    sourceProfileId: 'drv_e846c750-ef0f-437b-8fd4-4a810513f2a2',
    sourceDriverKey: 'player:4',
    canonicalProfileId: 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2',
    canonicalDriverKey: 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26'
  }
];

const planHash = createHash('sha256').update(JSON.stringify(mappings)).digest('hex');
const sourceIds = mappings.map((item) => item.sourceProfileId);
const canonicalIds = [...new Set(mappings.map((item) => item.canonicalProfileId))];
const profileIds = [...new Set([...sourceIds, ...canonicalIds])];
const placeholders = (items) => items.map(() => '?').join(',');
const text = (value) => String(value ?? '').trim();

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: false
  };
}

function assertConfig(config) {
  if (!config.host || !config.database || !config.user) {
    throw new Error('MySQL no está configurado. Revisa MYSQL_HOST, MYSQL_DATABASE y MYSQL_USER.');
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function confirmationToken(snapshot) {
  return createHash('sha256')
    .update(`${planHash}:${stableJson(snapshot)}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

async function ensureAuditTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS gc_identity_consolidation_batches (
      batch_id VARCHAR(64) NOT NULL PRIMARY KEY,
      version VARCHAR(80) NOT NULL,
      plan_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      backup_json LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      applied_at DATETIME(3) NULL,
      rolled_back_at DATETIME(3) NULL,
      INDEX idx_gc_identity_batches_status (status),
      INDEX idx_gc_identity_batches_plan (plan_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function readState(connection, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [profiles] = await connection.query(
    `SELECT * FROM gc_driver_profiles WHERE id IN (${placeholders(profileIds)}) ORDER BY id${suffix}`,
    profileIds
  );
  const [memberships] = await connection.query(
    `SELECT * FROM gc_team_memberships WHERE driver_profile_id IN (${placeholders(profileIds)}) ORDER BY id${suffix}`,
    profileIds
  );
  const [users] = await connection.query(
    `SELECT * FROM gc_users WHERE id = ?${suffix}`,
    ['9e5e76c6-8497-4d93-9e6c-83006ffcdb46']
  );
  return { profiles, memberships, users };
}

function validateState(state, { applied = false } = {}) {
  const blockers = [];
  const profileById = new Map(state.profiles.map((row) => [text(row.id), row]));

  for (const item of mappings) {
    const source = profileById.get(item.sourceProfileId);
    const canonical = profileById.get(item.canonicalProfileId);
    if (applied) {
      if (source) blockers.push(`El perfil retirado ${item.sourceProfileId} ha reaparecido.`);
    } else if (!source) {
      blockers.push(`Falta el perfil origen ${item.sourceProfileId}.`);
    } else if (text(source.driver_key) !== item.sourceDriverKey) {
      blockers.push(`${item.sourceProfileId}: driver_key cambió (${text(source.driver_key)}).`);
    }
    if (!canonical) {
      blockers.push(`Falta el perfil canónico ${item.canonicalProfileId}.`);
    } else if (text(canonical.driver_key) !== item.canonicalDriverKey) {
      blockers.push(`${item.canonicalProfileId}: driver_key canónico cambió (${text(canonical.driver_key)}).`);
    }
    if (item.canonicalUserId && canonical && text(canonical.linked_user_id) !== item.canonicalUserId) {
      blockers.push(`${item.canonicalProfileId}: no está enlazado a la cuenta canónica esperada.`);
    }
  }

  const police = state.users.find((row) => text(row.id) === '9e5e76c6-8497-4d93-9e6c-83006ffcdb46');
  if (!police) {
    blockers.push('Falta la cuenta canónica de Police1370.');
  } else {
    if (Number(police.pilot_player_id) !== 29) blockers.push('Police1370: pilot_player_id ya no es 29.');
    if (text(police.pilot_steam_guid) !== 'sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c') {
      blockers.push('Police1370: Steam ya no coincide con el preview.');
    }
  }

  if (!applied) {
    const canonicalStatus = new Map();
    for (const row of state.memberships) {
      if (!canonicalIds.includes(text(row.driver_profile_id))) continue;
      canonicalStatus.set(`${text(row.driver_profile_id)}::${text(row.status)}`, row);
    }
    for (const row of state.memberships) {
      const item = mappings.find((entry) => entry.sourceProfileId === text(row.driver_profile_id));
      if (!item) continue;
      const collision = canonicalStatus.get(`${item.canonicalProfileId}::${text(row.status)}`);
      if (collision) {
        blockers.push(
          `Colisión de membresía: ${row.id} y ${collision.id} quedarían en ${item.canonicalProfileId} con estado ${text(row.status)}.`
        );
      }
    }
  }
  return blockers;
}

function snapshotForToken(state) {
  return {
    profiles: state.profiles.map((row) => ({
      id: text(row.id),
      driverKey: text(row.driver_key),
      linkedUserId: text(row.linked_user_id) || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    memberships: state.memberships.map((row) => ({
      id: text(row.id),
      profileId: text(row.driver_profile_id),
      teamId: text(row.team_id),
      status: text(row.status),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    users: state.users.map((row) => ({
      id: text(row.id),
      playerId: row.pilot_player_id == null ? null : Number(row.pilot_player_id),
      steamGuid: text(row.pilot_steam_guid) || null,
      name: text(row.pilot_stracker_name) || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }))
  };
}

function printPreflight(state, blockers) {
  const sourceMemberships = state.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id)));
  console.log(`[${VERSION}] Preflight de solo lectura`);
  console.log(`Plan: ${planHash}`);
  console.log(`Perfiles a consolidar: ${sourceIds.length}`);
  console.log(`Perfiles canónicos: ${canonicalIds.length}`);
  console.log(`Membresías a trasladar: ${sourceMemberships.length}`);
  console.log(`Cuentas verificadas: ${state.users.length}`);
  console.log(`Bloqueos: ${blockers.length}`);
  blockers.forEach((item) => console.log(`  - ${item}`));
  if (!blockers.length) {
    const token = confirmationToken(snapshotForToken(state));
    console.log(`Token de confirmación: ${token}`);
    console.log('No se ha modificado MySQL.');
    console.log(`Aplicación (no ejecutar aún): node .\\scripts\\phase4h3-identity-consolidation.mjs apply --token ${token} --confirm "${APPLY_WORDS}"`);
  }
}

async function applyPlan(connection, token, confirmation) {
  if (confirmation !== APPLY_WORDS) throw new Error(`Confirmación literal requerida: ${APPLY_WORDS}`);
  await ensureAuditTable(connection);
  await connection.beginTransaction();
  try {
    const state = await readState(connection, true);
    const blockers = validateState(state);
    if (blockers.length) throw new Error(`Aplicación bloqueada:\n- ${blockers.join('\n- ')}`);
    const expected = confirmationToken(snapshotForToken(state));
    if (!token || token !== expected) {
      throw new Error('Token obsoleto o incorrecto. Ejecuta preflight de nuevo; no se ha aplicado nada.');
    }

    const batchId = `idc_${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}_${randomUUID().slice(0, 8)}`;
    const backup = {
      version: VERSION,
      planHash,
      mappings,
      capturedAt: new Date().toISOString(),
      profiles: state.profiles,
      memberships: state.memberships,
      users: state.users
    };
    const now = new Date();
    await connection.execute(
      `INSERT INTO gc_identity_consolidation_batches
        (batch_id, version, plan_hash, status, backup_json, created_at, applied_at)
       VALUES (?, ?, ?, 'applying', ?, ?, NULL)`,
      [batchId, VERSION, planHash, JSON.stringify(backup), now]
    );

    for (const item of mappings) {
      await connection.execute(
        'UPDATE gc_team_memberships SET driver_profile_id = ?, updated_at = ? WHERE driver_profile_id = ?',
        [item.canonicalProfileId, now, item.sourceProfileId]
      );
    }
    const [deleted] = await connection.query(
      `DELETE FROM gc_driver_profiles WHERE id IN (${placeholders(sourceIds)})`,
      sourceIds
    );
    if (Number(deleted.affectedRows) !== sourceIds.length) {
      throw new Error(`Se esperaban ${sourceIds.length} perfiles retirados y MySQL informó ${deleted.affectedRows}.`);
    }

    const after = await readState(connection, true);
    const afterBlockers = validateState(after, { applied: true });
    if (afterBlockers.length) throw new Error(`Verificación posterior fallida:\n- ${afterBlockers.join('\n- ')}`);
    const remainingMemberships = after.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id)));
    if (remainingMemberships.length) throw new Error('Quedaron membresías enlazadas a perfiles retirados.');

    await connection.execute(
      `UPDATE gc_identity_consolidation_batches
          SET status = 'applied', applied_at = ?
        WHERE batch_id = ? AND status = 'applying'`,
      [now, batchId]
    );
    await connection.commit();
    console.log(`[${VERSION}] Aplicación completada.`);
    console.log(`Batch de backup/rollback: ${batchId}`);
    console.log(`Perfiles consolidados: ${sourceIds.length}`);
    console.log(`Membresías trasladadas: ${backup.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id))).length}`);
    console.log('No se han modificado gc_driver_rating ni gc_rating_event_result.');
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

const profileColumns = [
  'id', 'driver_key', 'player_id', 'steam_guid', 'driver_name', 'display_name',
  'avatar_url', 'country_code', 'linked_user_id', 'created_at', 'updated_at'
];

async function rollbackBatch(connection, batchId, confirmation) {
  if (confirmation !== ROLLBACK_WORDS) throw new Error(`Confirmación literal requerida: ${ROLLBACK_WORDS}`);
  await ensureAuditTable(connection);
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(
      `SELECT * FROM gc_identity_consolidation_batches
        WHERE batch_id = ? AND plan_hash = ? FOR UPDATE`,
      [batchId, planHash]
    );
    const batch = rows[0];
    if (!batch) throw new Error('Batch de 4H.3 no encontrado.');
    if (text(batch.status) !== 'applied') throw new Error(`El batch no está aplicado; estado actual: ${text(batch.status)}.`);
    const backup = JSON.parse(String(batch.backup_json || '{}'));
    if (backup.version !== VERSION || backup.planHash !== planHash) throw new Error('Backup incompatible con este ejecutor.');

    const current = await readState(connection, true);
    const blockers = validateState(current, { applied: true });
    if (blockers.length) throw new Error(`Rollback bloqueado por cambios posteriores:\n- ${blockers.join('\n- ')}`);

    for (const row of backup.profiles.filter((item) => sourceIds.includes(text(item.id)))) {
      const values = profileColumns.map((column) => row[column] ?? null);
      await connection.execute(
        `INSERT INTO gc_driver_profiles (${profileColumns.join(',')})
         VALUES (${placeholders(profileColumns)})`,
        values
      );
    }
    for (const membership of backup.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id)))) {
      const [updated] = await connection.execute(
        `UPDATE gc_team_memberships
            SET driver_profile_id = ?, updated_at = ?
          WHERE id = ? AND driver_profile_id = ?`,
        [membership.driver_profile_id, membership.updated_at, membership.id,
          mappings.find((item) => item.sourceProfileId === text(membership.driver_profile_id))?.canonicalProfileId]
      );
      if (Number(updated.affectedRows) !== 1) {
        throw new Error(`No se pudo restaurar la membresía ${membership.id}; puede haber cambios posteriores.`);
      }
    }
    await connection.execute(
      `UPDATE gc_identity_consolidation_batches
          SET status = 'rolled_back', rolled_back_at = ?
        WHERE batch_id = ? AND status = 'applied'`,
      [new Date(), batchId]
    );
    await connection.commit();
    console.log(`[${VERSION}] Rollback completado: ${batchId}`);
    console.log(`Perfiles restaurados: ${sourceIds.length}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function usage() {
  console.log(`Uso:
  node .\\scripts\\phase4h3-identity-consolidation.mjs preflight
  node .\\scripts\\phase4h3-identity-consolidation.mjs apply --token TOKEN --confirm "${APPLY_WORDS}"
  node .\\scripts\\phase4h3-identity-consolidation.mjs rollback --batch BATCH_ID --confirm "${ROLLBACK_WORDS}"`);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? text(process.argv[index + 1]) : '';
}

export { mappings, planHash, validateState, snapshotForToken, confirmationToken };

async function main() {
  const mode = text(process.argv[2] || 'preflight').toLowerCase();
  if (!['preflight', 'apply', 'rollback'].includes(mode)) {
    usage();
    process.exitCode = 2;
    return;
  }
  const config = mysqlConfig();
  assertConfig(config);
  const connection = await mysql.createConnection(config);
  try {
    if (mode === 'preflight') {
      const state = await readState(connection);
      printPreflight(state, validateState(state));
    } else if (mode === 'apply') {
      await applyPlan(connection, arg('--token'), arg('--confirm'));
    } else {
      await rollbackBatch(connection, arg('--batch'), arg('--confirm'));
    }
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
