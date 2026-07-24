import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

const VERSION = 'GC_PHASE4I_2_STATISTICS_INVARIANTS_AUDIT_FIX_V1';
const text = (value: unknown) => String(value ?? '').trim();
const count = (value: unknown) => Number(value || 0);

function mysqlConfig() {
  const url = text(process.env.MYSQL_URL || process.env.DATABASE_URL);
  if (url) return { uri: url };
  return {
    host: text(process.env.MYSQL_HOST || '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: text(process.env.MYSQL_USER),
    password: String(process.env.MYSQL_PASSWORD || ''),
    database: text(process.env.MYSQL_DATABASE)
  };
}

async function pool(): Promise<Pool> {
  const config: any = mysqlConfig();
  if (config.uri) return mysql.createPool(config.uri);
  if (!config.user || !config.database) throw new Error('MySQL no está configurado.');
  return mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
}

export async function readMysqlStatisticsInvariantAuditV1() {
  const db = await pool();
  try {
    const [
      [totals], [storedVsResults], [duplicateResults], [duplicateSteamRatings],
      [orphanResults], [resultsWithoutOptionalProfile], [brokenMemberships],
      [ratingContinuity], [resultKeyProblems]
    ] = await Promise.all([
      db.query<RowDataPacket[]>(`
        SELECT
          (SELECT COUNT(*) FROM gc_driver_rating) ratings,
          (SELECT COUNT(*) FROM gc_rating_event_result) results,
          (SELECT COUNT(*) FROM gc_driver_profiles) profiles,
          (SELECT COUNT(*) FROM gc_team_memberships WHERE status='active') active_memberships
      `),
      db.query<RowDataPacket[]>(`
        SELECT r.driver_key, r.display_name, r.races_count stored_races,
          r.clean_races stored_clean, r.wins stored_wins, r.podiums stored_podiums,
          COUNT(e.id) result_rows,
          COUNT(DISTINCT CONCAT(COALESCE(e.source_key,''),'|',COALESCE(e.event_id,''))) unique_races,
          COALESCE(SUM(e.clean_race=1),0) calculated_clean,
          COALESCE(SUM(e.position=1 AND e.dsq=0),0) calculated_wins,
          COALESCE(SUM(e.position BETWEEN 1 AND 3 AND e.dsq=0),0) calculated_podiums
        FROM gc_driver_rating r
        LEFT JOIN gc_rating_event_result e ON e.driver_key=r.driver_key
        GROUP BY r.driver_key,r.display_name,r.races_count,r.clean_races,r.wins,r.podiums
        HAVING stored_races<>unique_races OR stored_clean<>calculated_clean
          OR stored_wins<>calculated_wins OR stored_podiums<>calculated_podiums
        ORDER BY r.display_name
      `),
      db.query<RowDataPacket[]>(`
        SELECT source_key,event_id,result_identity_key,COUNT(*) rows_count,
          GROUP_CONCAT(id ORDER BY id SEPARATOR ',') result_ids
        FROM gc_rating_event_result
        GROUP BY source_key,event_id,result_identity_key
        HAVING COUNT(*)>1
        ORDER BY rows_count DESC,source_key,event_id
      `),
      db.query<RowDataPacket[]>(`
        SELECT steam_guid,COUNT(*) rating_rows,
          GROUP_CONCAT(driver_key ORDER BY driver_key SEPARATOR ',') driver_keys
        FROM gc_driver_rating
        WHERE steam_guid IS NOT NULL AND TRIM(steam_guid)<>''
        GROUP BY steam_guid HAVING COUNT(*)>1
      `),
      db.query<RowDataPacket[]>(`
        SELECT e.id,e.source_key,e.event_id,e.driver_key,e.steam_guid,e.stracker_player_id,e.display_name
        FROM gc_rating_event_result e
        LEFT JOIN gc_driver_rating r_key ON r_key.driver_key=e.driver_key
        LEFT JOIN gc_driver_rating r_steam ON e.steam_guid IS NOT NULL AND e.steam_guid<>''
          AND r_steam.steam_guid=e.steam_guid
        WHERE r_key.id IS NULL AND r_steam.id IS NULL
        ORDER BY e.processed_at DESC LIMIT 250
      `),
      db.query<RowDataPacket[]>(`
        SELECT e.driver_key,e.steam_guid,MAX(e.display_name) display_name,COUNT(*) result_rows
        FROM gc_rating_event_result e
        LEFT JOIN gc_driver_profiles p_key ON p_key.driver_key=e.driver_key
        LEFT JOIN gc_driver_profiles p_steam ON e.steam_guid IS NOT NULL AND e.steam_guid<>''
          AND p_steam.steam_guid=e.steam_guid
        WHERE p_key.id IS NULL AND p_steam.id IS NULL
        GROUP BY e.driver_key,e.steam_guid
        ORDER BY display_name
      `),
      db.query<RowDataPacket[]>(`
        SELECT m.id,m.status,m.driver_profile_id,m.team_id,m.user_id,
          (p.id IS NULL) missing_profile,(t.id IS NULL) missing_team,
          (m.user_id IS NOT NULL AND u.id IS NULL) missing_user
        FROM gc_team_memberships m
        LEFT JOIN gc_driver_profiles p ON p.id=m.driver_profile_id
        LEFT JOIN gc_teams t ON t.id=m.team_id
        LEFT JOIN gc_users u ON u.id=m.user_id
        WHERE p.id IS NULL OR t.id IS NULL OR (m.user_id IS NOT NULL AND u.id IS NULL)
        ORDER BY m.status,m.id
      `),
      db.query<RowDataPacket[]>(`
        SELECT r.driver_key,r.display_name,r.last_event_id,r.last_race_at,r.sr_score,r.gsr_rating,
          e.id result_id,e.event_id,e.event_date,e.new_sr,e.new_gsr,e.processed_at
        FROM gc_driver_rating r
        LEFT JOIN gc_rating_event_result e ON e.id=(
          SELECT x.id FROM gc_rating_event_result x
          WHERE x.event_id=r.last_event_id AND (
            x.driver_key=r.driver_key OR (
              r.steam_guid IS NOT NULL AND r.steam_guid<>'' AND x.steam_guid=r.steam_guid
            )
          )
          ORDER BY (x.driver_key=r.driver_key) DESC,x.processed_at DESC,x.id DESC LIMIT 1
        )
        WHERE (r.races_count>0 AND (r.last_event_id IS NULL OR e.id IS NULL))
          OR ABS(r.sr_score-e.new_sr)>0.011 OR r.gsr_rating<>e.new_gsr
        ORDER BY r.display_name
      `),
      db.query<RowDataPacket[]>(`
        SELECT id,source_key,event_id,driver_key,result_identity_key,event_scope_key
        FROM gc_rating_event_result
        WHERE TRIM(source_key)='' OR TRIM(event_id)='' OR TRIM(driver_key)=''
          OR TRIM(result_identity_key)='' OR TRIM(event_scope_key)=''
        ORDER BY processed_at DESC LIMIT 250
      `)
    ]);

    const mismatches = (storedVsResults as any[]).map((r) => ({
      driverKey: text(r.driver_key), displayName: text(r.display_name),
      stored: { races: count(r.stored_races), clean: count(r.stored_clean), wins: count(r.stored_wins), podiums: count(r.stored_podiums) },
      calculated: { races: count(r.unique_races), clean: count(r.calculated_clean), wins: count(r.calculated_wins), podiums: count(r.calculated_podiums) },
      resultRows: count(r.result_rows)
    }));
    const blockers = (duplicateResults as any[]).length + (duplicateSteamRatings as any[]).length +
      (orphanResults as any[]).length + (brokenMemberships as any[]).length + (resultKeyProblems as any[]).length;
    const warnings = mismatches.length + (ratingContinuity as any[]).length;
    return {
      ok: true, source: 'gc-ratings-v1:statistics-invariants:mysql', version: VERSION,
      generatedAt: new Date().toISOString(), readOnly: true, writesAvailable: false,
      destructiveChangesApplied: false, safeToContinue: blockers === 0,
      summary: {
        ratings: count((totals as any[])[0]?.ratings), results: count((totals as any[])[0]?.results),
        profiles: count((totals as any[])[0]?.profiles), activeMemberships: count((totals as any[])[0]?.active_memberships),
        blockers, warnings, statisticsMismatches: mismatches.length,
        duplicateRaceDriverRows: (duplicateResults as any[]).length,
        duplicateSteamRatings: (duplicateSteamRatings as any[]).length,
        orphanResults: (orphanResults as any[]).length,
        driversWithoutOptionalProfile: (resultsWithoutOptionalProfile as any[]).length,
        brokenMemberships: (brokenMemberships as any[]).length,
        ratingContinuityMismatches: (ratingContinuity as any[]).length,
        invalidResultKeys: (resultKeyProblems as any[]).length
      },
      checks: {
        statisticsMismatches: mismatches,
        duplicateRaceDriverRows: duplicateResults,
        duplicateSteamRatings,
        orphanResults,
        resultsWithoutOptionalProfile,
        brokenMemberships,
        ratingContinuityMismatches: ratingContinuity,
        invalidResultKeys: resultKeyProblems
      },
      definitions: {
        race: 'Una combinación única source_key + event_id por driver_key.',
        win: 'position = 1 y dsq = 0.',
        podium: 'position entre 1 y 3 y dsq = 0.',
        cleanRace: 'clean_race = 1.',
        canonicalIdentity: 'Un resultado es canónico cuando coincide con gc_driver_rating por driver_key o SteamID.',
        driverProfile: 'gc_driver_profiles aporta usuario, equipo y metadatos; es opcional para pilotos con rating sin cuenta o equipo.',
        ratingContinuity: 'El rating actual debe coincidir con el resultado indicado explícitamente por last_event_id.'
      },
      message: blockers ? 'Hay incoherencias estructurales que deben resolverse antes de continuar.' :
        warnings ? 'Estructura íntegra; hay diferencias estadísticas que requieren revisión.' :
          'Todos los invariantes comprobados coinciden.'
    };
  } finally {
    await db.end();
  }
}
