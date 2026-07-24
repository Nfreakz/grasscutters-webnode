import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

// GC_PHASE4H3_2_3_ROUTE_JSON_BODY_FIX_V1
const VERSION = 'GC_PHASE4H3_2_3_ROUTE_JSON_BODY_FIX_V1';
const PLAN_HASH = '2745c700cd7ab624c7f4cc6e5cc208e3b2264805f37f7f552d6d08fade9f003b';

const mappings = [
  ['drv_4b9e4286-bfaa-4fc9-8ab9-74192cbb3bb2', 'name:police1370', 'drv_24c9311c-5041-4d4e-8c42-e9727a1e5eac', 'steam:sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c'],
  ['drv_0b21fc11-1a65-4130-92e2-1a4f7dfef343', 'name:pedro diaz', 'drv_56d82b6c-84f7-4b02-b759-7d58cff205f9', 'steam:sha256#e1561220de2cf9b7247134c9b78ecfd59dad86638e993d4f8ed77a3135ff78ad'],
  ['drv_121b0c86-06d8-4f75-bea2-20a0ac0857d5', 'name:neo', 'drv_fce29813-f6ea-4d5d-90ae-09040ba34423', 'steam:sha256#882f3749605f88db5da6a53844ad0a6cb3366cc4427a137874abd800cf9e73cb'],
  ['drv_3c4185e5-f2cd-476d-83b3-7f48181c9eef', 'name:xan', 'drv_71c4969f-e500-4863-8367-b75f21983016', 'steam:sha256#550e210571f1207127361a6ee59afb8928fbbd70c9f8374f50a50548e0e723d7'],
  ['drv_7c72a2e6-9b71-4623-8e6c-b72a040b2eed', 'player:27', 'drv_eb8b2f76-b42b-4b34-9f20-a3936757ea3e', 'steam:sha256#395fed6144d462abb6504fc8173d6b9da33e1fcfb1a0b2302511caebf1bea70c'],
  ['drv_8dc2956f-34f3-42e0-8eeb-6e58d12c9d9e', 'name:angel', 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2', 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26'],
  ['drv_9de16504-359c-4866-a378-46658f043f81', 'name:fran', 'drv_cd255453-501c-4f13-b94f-334800a6fce0', 'steam:sha256#a6beaebae5a051c8329951606671893cee8e2a27207f28f0f3b283b0f567f487'],
  ['drv_e846c750-ef0f-437b-8fd4-4a810513f2a2', 'player:4', 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2', 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26']
].map(([sourceProfileId, sourceDriverKey, canonicalProfileId, canonicalDriverKey]) => ({
  sourceProfileId, sourceDriverKey, canonicalProfileId, canonicalDriverKey
}));

const sourceIds = mappings.map((row) => row.sourceProfileId);
const canonicalIds = [...new Set(mappings.map((row) => row.canonicalProfileId))];
const profileIds = [...new Set([...sourceIds, ...canonicalIds])];
const text = (value: unknown) => String(value ?? '').trim();
const marks = (items: readonly unknown[]) => items.map(() => '?').join(',');

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 2
  };
}

async function withPool<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) throw new Error('MySQL no está configurado.');
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool(config);
  try { return await callback(pool); } finally { await pool.end(); }
}

async function ensureAuditTable(pool: Pool) {
  await pool.execute(`
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

async function readState(db: Pool | PoolConnection, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [profiles] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_driver_profiles WHERE id IN (${marks(profileIds)}) ORDER BY id${suffix}`, profileIds
  );
  const [memberships] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_team_memberships WHERE driver_profile_id IN (${marks(profileIds)}) ORDER BY id${suffix}`, profileIds
  );
  const [users] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_users WHERE id = ?${suffix}`, ['9e5e76c6-8497-4d93-9e6c-83006ffcdb46']
  );
  return { profiles: profiles as any[], memberships: memberships as any[], users: users as any[] };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function tokenState(state: Awaited<ReturnType<typeof readState>>) {
  return {
    profiles: state.profiles.map((r) => ({ id: text(r.id), driverKey: text(r.driver_key), linkedUserId: text(r.linked_user_id) || null, updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null })),
    memberships: state.memberships.map((r) => ({ id: text(r.id), profileId: text(r.driver_profile_id), teamId: text(r.team_id), status: text(r.status), updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null })),
    // gc_users.updated_at can be touched by authentication/session activity between
    // preflight and apply. The identity-bearing fields remain part of the token and
    // are also validated again while the transaction holds row locks.
    users: state.users.map((r) => ({ id: text(r.id), playerId: r.pilot_player_id == null ? null : Number(r.pilot_player_id), steamGuid: text(r.pilot_steam_guid) || null, name: text(r.pilot_stracker_name) || null }))
  };
}

function stateToken(state: Awaited<ReturnType<typeof readState>>) {
  return createHash('sha256').update(`${PLAN_HASH}:${stableJson(tokenState(state))}`).digest('hex').slice(0, 16).toUpperCase();
}

function validateBefore(state: Awaited<ReturnType<typeof readState>>) {
  const blockers: string[] = [];
  const byId = new Map(state.profiles.map((row) => [text(row.id), row]));
  for (const item of mappings) {
    const source = byId.get(item.sourceProfileId);
    const canonical = byId.get(item.canonicalProfileId);
    if (!source) blockers.push(`Falta el perfil origen ${item.sourceProfileId}.`);
    else if (text(source.driver_key) !== item.sourceDriverKey) blockers.push(`Cambió ${item.sourceProfileId}.`);
    if (!canonical) blockers.push(`Falta el perfil canónico ${item.canonicalProfileId}.`);
    else if (text(canonical.driver_key) !== item.canonicalDriverKey) blockers.push(`Cambió ${item.canonicalProfileId}.`);
  }
  const police = state.users[0];
  if (!police || Number(police.pilot_player_id) !== 29 || text(police.pilot_steam_guid) !== 'sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c') {
    blockers.push('La cuenta canónica de Police1370 cambió.');
  }
  const canonicalStatus = new Map<string, any>();
  for (const row of state.memberships) if (canonicalIds.includes(text(row.driver_profile_id))) canonicalStatus.set(`${text(row.driver_profile_id)}::${text(row.status)}`, row);
  for (const row of state.memberships) {
    const item = mappings.find((entry) => entry.sourceProfileId === text(row.driver_profile_id));
    if (item && canonicalStatus.has(`${item.canonicalProfileId}::${text(row.status)}`)) blockers.push(`Colisión de membresía en ${item.canonicalProfileId}.`);
  }
  return blockers;
}

const profileColumns = ['id','driver_key','player_id','steam_guid','driver_name','display_name','avatar_url','country_code','linked_user_id','created_at','updated_at'];

export async function preflightIdentityConsolidationApplyV1() {
  return withPool(async (pool) => {
    const state = await readState(pool);
    const blockers = validateBefore(state);
    const token = blockers.length ? null : stateToken(state);
    return {
      ok: blockers.length === 0,
      source: 'gc-ratings-v1:identity-consolidation-apply-preflight:mysql',
      version: VERSION,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesAvailable: blockers.length === 0,
      destructiveChangesApplied: false,
      readyForApply: blockers.length === 0,
      planHash: PLAN_HASH,
      confirmationToken: token,
      confirmation: token ? `APLICAR 4H.3 ${token}` : null,
      summary: {
        sourceProfiles: sourceIds.length,
        canonicalProfiles: canonicalIds.length,
        membershipsToMove: state.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id))).length,
        usersVerified: state.users.length,
        blockers: blockers.length
      },
      blockers,
      message: blockers.length
        ? 'Preflight de aplicación bloqueado. No se ha modificado MySQL.'
        : 'Preflight de aplicación superado. No se ha modificado MySQL.'
    };
  });
}

export async function applyIdentityConsolidationV1(input: { token?: string; confirmation?: string }) {
  return withPool(async (pool) => {
    if (!text(input.token)) throw new Error('Token no recibido. La petición JSON no llegó al servidor.');
    await ensureAuditTable(pool);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const before = await readState(connection, true);
      const blockers = validateBefore(before);
      if (blockers.length) throw new Error(`Aplicación bloqueada: ${blockers.join(' ')}`);
      const token = stateToken(before);
      if (text(input.token) !== token) throw new Error('Token obsoleto. Ejecuta el preflight de nuevo.');
      if (text(input.confirmation) !== `APLICAR 4H.3 ${token}`) throw new Error(`Escribe exactamente: APLICAR 4H.3 ${token}`);

      const batchId = `idc_${new Date().toISOString().replace(/\D/g, '').slice(0,17)}_${randomUUID().slice(0,8)}`;
      const backup: any = { version: VERSION, planHash: PLAN_HASH, capturedAt: new Date().toISOString(), before, afterToken: null };
      const now = new Date();
      await connection.execute(
        `INSERT INTO gc_identity_consolidation_batches (batch_id,version,plan_hash,status,backup_json,created_at,applied_at)
         VALUES (?,?,?,'applying',?,?,NULL)`,
        [batchId, VERSION, PLAN_HASH, JSON.stringify(backup), now]
      );
      let moved = 0;
      for (const item of mappings) {
        const [result]: any = await connection.execute(
          'UPDATE gc_team_memberships SET driver_profile_id=?, updated_at=? WHERE driver_profile_id=?',
          [item.canonicalProfileId, now, item.sourceProfileId]
        );
        moved += Number(result.affectedRows || 0);
      }
      const [deleted]: any = await connection.query(`DELETE FROM gc_driver_profiles WHERE id IN (${marks(sourceIds)})`, sourceIds);
      if (Number(deleted.affectedRows) !== sourceIds.length) throw new Error(`Solo se retiraron ${deleted.affectedRows} de ${sourceIds.length} perfiles.`);
      const after = await readState(connection, true);
      if (after.profiles.some((r) => sourceIds.includes(text(r.id))) || after.memberships.some((r) => sourceIds.includes(text(r.driver_profile_id)))) {
        throw new Error('La verificación posterior encontró referencias de origen.');
      }
      backup.afterToken = stateToken(after);
      await connection.execute(
        `UPDATE gc_identity_consolidation_batches SET status='applied',backup_json=?,applied_at=? WHERE batch_id=? AND status='applying'`,
        [JSON.stringify(backup), now, batchId]
      );
      await connection.commit();
      return { ok: true, version: VERSION, planHash: PLAN_HASH, batchId, profilesConsolidated: sourceIds.length, membershipsMoved: moved, rollbackConfirmation: `REVERTIR 4H.3 ${batchId}`, message: 'Consolidación aplicada y verificada.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  });
}

export async function listIdentityConsolidationBatchesV1() {
  return withPool(async (pool) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT batch_id,version,plan_hash,status,created_at,applied_at,rolled_back_at
         FROM gc_identity_consolidation_batches WHERE plan_hash=? ORDER BY created_at DESC LIMIT 10`, [PLAN_HASH]
      );
      return { ok: true, version: VERSION, planHash: PLAN_HASH, batches: rows };
    } catch (error: any) {
      if (text(error?.code) === 'ER_NO_SUCH_TABLE') return { ok: true, version: VERSION, planHash: PLAN_HASH, batches: [] };
      throw error;
    }
  });
}

export async function rollbackIdentityConsolidationV1(input: { batchId?: string; confirmation?: string }) {
  return withPool(async (pool) => {
    await ensureAuditTable(pool);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const batchId = text(input.batchId);
      if (!batchId || text(input.confirmation) !== `REVERTIR 4H.3 ${batchId}`) throw new Error(`Escribe exactamente: REVERTIR 4H.3 ${batchId}`);
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM gc_identity_consolidation_batches WHERE batch_id=? AND plan_hash=? FOR UPDATE', [batchId, PLAN_HASH]
      );
      const batch: any = rows[0];
      if (!batch || text(batch.status) !== 'applied') throw new Error('El batch no existe o ya no está aplicado.');
      const backup = JSON.parse(String(batch.backup_json || '{}'));
      if (backup.version !== VERSION || backup.planHash !== PLAN_HASH || !backup.afterToken) throw new Error('Backup incompatible o incompleto.');
      const current = await readState(connection, true);
      if (stateToken(current) !== backup.afterToken) throw new Error('Rollback bloqueado: hubo cambios posteriores a la consolidación.');
      for (const row of backup.before.profiles.filter((r: any) => sourceIds.includes(text(r.id)))) {
        await connection.execute(
          `INSERT INTO gc_driver_profiles (${profileColumns.join(',')}) VALUES (${marks(profileColumns)})`,
          profileColumns.map((column) => row[column] ?? null)
        );
      }
      let restored = 0;
      for (const membership of backup.before.memberships.filter((r: any) => sourceIds.includes(text(r.driver_profile_id)))) {
        const canonicalId = mappings.find((item) => item.sourceProfileId === text(membership.driver_profile_id))?.canonicalProfileId;
        const [result]: any = await connection.execute(
          'UPDATE gc_team_memberships SET driver_profile_id=?,updated_at=? WHERE id=? AND driver_profile_id=?',
          [membership.driver_profile_id, membership.updated_at, membership.id, canonicalId]
        );
        if (Number(result.affectedRows) !== 1) throw new Error(`No se pudo restaurar la membresía ${membership.id}.`);
        restored += 1;
      }
      const restoredState = await readState(connection, true);
      if (stateToken(restoredState) !== stateToken(backup.before)) throw new Error('La verificación final del rollback no coincide con el backup.');
      await connection.execute(
        `UPDATE gc_identity_consolidation_batches SET status='rolled_back',rolled_back_at=? WHERE batch_id=? AND status='applied'`,
        [new Date(), batchId]
      );
      await connection.commit();
      return { ok: true, version: VERSION, batchId, profilesRestored: sourceIds.length, membershipsRestored: restored, message: 'Rollback completado y verificado.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  });
}
