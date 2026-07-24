import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

// GC_PHASE4H3_3_ADRI_POLICE1370_RECONCILIATION_V1
const VERSION = 'GC_PHASE4H3_3_ADRI_POLICE1370_RECONCILIATION_V1';
const PLAN_HASH = '2e2940143acbb5545a108729e61659acaa435004629538732a710626954015bb';
const SOURCE_ID = 'drv_3466fa72-aa7a-4f07-a8b7-08c4dc9040cb';
const SOURCE_KEY = 'player:29';
const TARGET_ID = 'drv_24c9311c-5041-4d4e-8c42-e9727a1e5eac';
const TARGET_KEY = 'steam:sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c';
const PROTECTED_ID = 'drv_9966317b-96a5-4d88-a11a-5862c073c253';
const PROTECTED_KEY = 'name:36';
const POLICE_USER_ID = '9e5e76c6-8497-4d93-9e6c-83006ffcdb46';
const text = (value: unknown) => String(value ?? '').trim();

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4', timezone: 'Z', waitForConnections: true, connectionLimit: 2
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
      batch_id VARCHAR(64) NOT NULL PRIMARY KEY, version VARCHAR(80) NOT NULL,
      plan_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL, backup_json LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL, applied_at DATETIME(3) NULL, rolled_back_at DATETIME(3) NULL,
      INDEX idx_gc_identity_batches_status (status), INDEX idx_gc_identity_batches_plan (plan_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function readState(db: Pool | PoolConnection, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const ids = [SOURCE_ID, TARGET_ID, PROTECTED_ID];
  const [profiles] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_driver_profiles WHERE id IN (?,?,?) ORDER BY id${suffix}`, ids
  );
  const [memberships] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_team_memberships WHERE driver_profile_id IN (?,?) ORDER BY id${suffix}`, [SOURCE_ID, TARGET_ID]
  );
  const [users] = await db.query<RowDataPacket[]>(
    `SELECT * FROM gc_users WHERE id=?${suffix}`, [POLICE_USER_ID]
  );
  const [ratings] = await db.query<RowDataPacket[]>(
    'SELECT driver_key,steam_guid,stracker_player_id,display_name,races_count,wins,podiums FROM gc_driver_rating WHERE driver_key IN (?,?) ORDER BY driver_key',
    [SOURCE_KEY, TARGET_KEY]
  );
  const [results] = await db.query<RowDataPacket[]>(
    'SELECT id,event_id,source_key,event_scope_key,driver_key,steam_guid,stracker_player_id,display_name,position FROM gc_rating_event_result WHERE driver_key IN (?,?) ORDER BY id',
    [SOURCE_KEY, TARGET_KEY]
  );
  return { profiles: profiles as any[], memberships: memberships as any[], users: users as any[], ratings: ratings as any[], results: results as any[] };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stateToken(state: Awaited<ReturnType<typeof readState>>) {
  const stable = {
    profiles: state.profiles.map((r) => ({ id:text(r.id), key:text(r.driver_key), linked:text(r.linked_user_id)||null, updated:r.updated_at ? new Date(r.updated_at).toISOString() : null })),
    memberships: state.memberships.map((r) => ({ id:text(r.id), profile:text(r.driver_profile_id), team:text(r.team_id), status:text(r.status), updated:r.updated_at ? new Date(r.updated_at).toISOString() : null })),
    users: state.users.map((r) => ({ id:text(r.id), player:r.pilot_player_id == null ? null : Number(r.pilot_player_id), steam:text(r.pilot_steam_guid)||null, name:text(r.pilot_stracker_name)||null })),
    ratings: state.ratings, results: state.results
  };
  return createHash('sha256').update(`${PLAN_HASH}:${stableJson(stable)}`).digest('hex').slice(0,16).toUpperCase();
}

function validate(state: Awaited<ReturnType<typeof readState>>) {
  const blockers: string[] = [];
  const byId = new Map(state.profiles.map((row) => [text(row.id), row]));
  if (text(byId.get(SOURCE_ID)?.driver_key) !== SOURCE_KEY) blockers.push('No existe Adri/player:29 con el perfil esperado.');
  if (text(byId.get(TARGET_ID)?.driver_key) !== TARGET_KEY) blockers.push('No existe el perfil Steam canónico esperado de Police1370.');
  if (text(byId.get(PROTECTED_ID)?.driver_key) !== PROTECTED_KEY) blockers.push('El perfil protegido name:36 cambió o desapareció.');
  const police = state.users[0];
  if (!police || Number(police.pilot_player_id) !== 29 || text(police.pilot_steam_guid) !== TARGET_KEY.slice(6)) blockers.push('La cuenta de Police1370 ya no demuestra Player ID 29 y el Steam esperado.');
  if (state.ratings.some((r) => text(r.driver_key) === SOURCE_KEY)) blockers.push('Adri/player:29 tiene rating propio; se requiere un plan de estadísticas.');
  if (state.results.some((r) => text(r.driver_key) === SOURCE_KEY)) blockers.push('Adri/player:29 tiene resultados propios; se requiere un plan de estadísticas.');
  const sourceMemberships = state.memberships.filter((r) => text(r.driver_profile_id) === SOURCE_ID);
  for (const row of sourceMemberships) {
    if (state.memberships.some((target) => text(target.driver_profile_id) === TARGET_ID && text(target.team_id) === text(row.team_id) && text(target.status) === text(row.status))) {
      blockers.push(`Colisión de membresía ${text(row.id)} con el perfil canónico.`);
    }
  }
  return blockers;
}

export async function preflightAdriPoliceReconciliationV1() {
  return withPool(async (pool) => {
    const state = await readState(pool);
    const blockers = validate(state);
    const token = blockers.length ? null : stateToken(state);
    const sourceMemberships = state.memberships.filter((r) => text(r.driver_profile_id) === SOURCE_ID);
    return {
      ok: blockers.length === 0, source:'gc-ratings-v1:adri-police1370-preflight:mysql', version:VERSION,
      generatedAt:new Date().toISOString(), readOnly:true, writesAvailable:blockers.length === 0,
      destructiveChangesApplied:false, readyForApply:blockers.length === 0, planHash:PLAN_HASH,
      confirmationToken:token, confirmation:token ? `APLICAR 4H.3.3 ADRI A POLICE1370 ${token}` : null,
      summary:{sourceProfile:'Adri / player:29',targetProfile:'Police1370 / Steam',membershipsToMove:sourceMemberships.length,sourceRatings:state.ratings.filter((r)=>text(r.driver_key)===SOURCE_KEY).length,sourceResults:state.results.filter((r)=>text(r.driver_key)===SOURCE_KEY).length,protectedProfile:'36 / name:36',blockers:blockers.length},
      blockers, message:blockers.length ? 'Preflight bloqueado. No se ha modificado MySQL.' : 'Preflight superado. No se ha modificado MySQL.'
    };
  });
}

const profileColumns = ['id','driver_key','player_id','steam_guid','driver_name','display_name','avatar_url','country_code','linked_user_id','created_at','updated_at'];

export async function applyAdriPoliceReconciliationV1(input:{token?:string;confirmation?:string}) {
  return withPool(async (pool) => {
    if (!text(input.token)) throw new Error('Token no recibido.');
    await ensureAuditTable(pool);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const before = await readState(connection, true);
      const blockers = validate(before);
      if (blockers.length) throw new Error(`Aplicación bloqueada: ${blockers.join(' ')}`);
      const token = stateToken(before);
      if (text(input.token) !== token) throw new Error('Token obsoleto. Ejecuta el preflight de nuevo.');
      if (text(input.confirmation) !== `APLICAR 4H.3.3 ADRI A POLICE1370 ${token}`) throw new Error(`Escribe exactamente: APLICAR 4H.3.3 ADRI A POLICE1370 ${token}`);
      const batchId = `idc_adri_${new Date().toISOString().replace(/\D/g,'').slice(0,17)}_${randomUUID().slice(0,8)}`;
      const backup:any = {version:VERSION,planHash:PLAN_HASH,capturedAt:new Date().toISOString(),before,afterToken:null};
      const now = new Date();
      await connection.execute(`INSERT INTO gc_identity_consolidation_batches (batch_id,version,plan_hash,status,backup_json,created_at,applied_at) VALUES (?,?,?,'applying',?,?,NULL)`,[batchId,VERSION,PLAN_HASH,JSON.stringify(backup),now]);
      const [moved]:any = await connection.execute('UPDATE gc_team_memberships SET driver_profile_id=?,updated_at=? WHERE driver_profile_id=?',[TARGET_ID,now,SOURCE_ID]);
      const [deleted]:any = await connection.execute('DELETE FROM gc_driver_profiles WHERE id=? AND driver_key=?',[SOURCE_ID,SOURCE_KEY]);
      if (Number(deleted.affectedRows)!==1) throw new Error('No se retiró exactamente el perfil Adri/player:29.');
      const after = await readState(connection,true);
      if (after.profiles.some((r)=>text(r.id)===SOURCE_ID) || after.memberships.some((r)=>text(r.driver_profile_id)===SOURCE_ID)) throw new Error('La verificación posterior encontró referencias a Adri.');
      if (text(after.profiles.find((r)=>text(r.id)===PROTECTED_ID)?.driver_key)!==PROTECTED_KEY) throw new Error('La verificación posterior no encontró intacto el perfil 36.');
      backup.afterToken=stateToken(after);
      await connection.execute(`UPDATE gc_identity_consolidation_batches SET status='applied',backup_json=?,applied_at=? WHERE batch_id=? AND status='applying'`,[JSON.stringify(backup),now,batchId]);
      await connection.commit();
      return {ok:true,version:VERSION,planHash:PLAN_HASH,batchId,profilesConsolidated:1,membershipsMoved:Number(moved.affectedRows||0),protectedProfileUntouched:true,rollbackConfirmation:`REVERTIR 4H.3.3 ${batchId}`,message:'Adri se ha reconciliado con Police1370 y el perfil 36 permanece intacto.'};
    } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
  });
}

export async function rollbackAdriPoliceReconciliationV1(input:{batchId?:string;confirmation?:string}) {
  return withPool(async (pool) => {
    await ensureAuditTable(pool);
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      const batchId=text(input.batchId);
      if (!batchId || text(input.confirmation)!==`REVERTIR 4H.3.3 ${batchId}`) throw new Error(`Escribe exactamente: REVERTIR 4H.3.3 ${batchId}`);
      const [rows]=await connection.query<RowDataPacket[]>('SELECT * FROM gc_identity_consolidation_batches WHERE batch_id=? AND plan_hash=? FOR UPDATE',[batchId,PLAN_HASH]);
      const batch:any=rows[0];
      if (!batch || text(batch.status)!=='applied') throw new Error('El batch no existe o ya no está aplicado.');
      const backup=JSON.parse(String(batch.backup_json||'{}'));
      const current=await readState(connection,true);
      if (backup.version!==VERSION || stateToken(current)!==backup.afterToken) throw new Error('Rollback bloqueado: backup incompatible o cambios posteriores.');
      const source=backup.before.profiles.find((r:any)=>text(r.id)===SOURCE_ID);
      await connection.execute(`INSERT INTO gc_driver_profiles (${profileColumns.join(',')}) VALUES (${profileColumns.map(()=>'?').join(',')})`,profileColumns.map((column)=>source[column]??null));
      let restored=0;
      for (const membership of backup.before.memberships.filter((r:any)=>text(r.driver_profile_id)===SOURCE_ID)) {
        const [result]:any=await connection.execute('UPDATE gc_team_memberships SET driver_profile_id=?,updated_at=? WHERE id=? AND driver_profile_id=?',[SOURCE_ID,membership.updated_at,membership.id,TARGET_ID]);
        if (Number(result.affectedRows)!==1) throw new Error(`No se restauró ${membership.id}.`);
        restored++;
      }
      await connection.execute(`UPDATE gc_identity_consolidation_batches SET status='rolled_back',rolled_back_at=? WHERE batch_id=? AND status='applied'`,[new Date(),batchId]);
      await connection.commit();
      return {ok:true,version:VERSION,batchId,profilesRestored:1,membershipsRestored:restored,message:'Rollback completado.'};
    } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
  });
}
