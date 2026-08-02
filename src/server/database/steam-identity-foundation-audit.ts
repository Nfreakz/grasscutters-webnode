import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface TableRow extends RowDataPacket {
  tableName: string;
}

interface ColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: 'YES' | 'NO';
  columnKey: string;
}

interface CountRow extends RowDataPacket {
  value: number | string | null;
}

interface DuplicateRow extends RowDataPacket {
  duplicateGroups: number | string | null;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface SteamIdentityFoundationAudit {
  ok: true;
  readOnly: true;
  writesAvailable: false;
  destructiveChangesApplied: false;
  generatedAt: string;
  databaseName: string;
  summary: {
    legacyUsers: number;
    driverProfiles: number;
    profilesWithLegacySteamIdentity: number;
    profilesWithoutLegacySteamIdentity: number;
    profilesWithPlayerId: number;
    duplicateLegacySteamIdentities: number;
    duplicatePlayerIds: number;
    steamUsersTableExists: boolean;
    driverIdentitiesTableExists: boolean;
    safeToApplyMigration: false;
  };
  currentSchema: {
    tablesPresent: string[];
    profileColumns: string[];
    legacyUserColumns: string[];
  };
  proposedModel: {
    steamUsersTable: string;
    driverIdentitiesTable: string;
    canonicalIdentity: 'steam_id64';
    loginMethod: 'steam_openid';
    passwordLoginSupported: false;
    emailLoginSupported: false;
    legacyAccountsImported: false;
  };
  migrationPlan: {
    phases: Array<{
      order: number;
      name: string;
      action: string;
      writes: boolean;
    }>;
    sqlFile: string;
    requiresManualApproval: true;
    rollbackRequired: true;
  };
  blockers: string[];
  nextStep: string;
}

export class SteamIdentityFoundationError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function auditSteamIdentityFoundation(): Promise<SteamIdentityFoundationAudit> {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new SteamIdentityFoundationError(
        stage,
        'DATABASE_NOT_CONFIGURED',
        'Database is not configured.'
      );
    }

    const pool = getDatabasePool();

    stage = 'schema-tables';

    const [tableRows] = await pool.query<TableRow[]>(`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    const tables = new Set(tableRows.map((row) => row.tableName));

    stage = 'schema-columns';

    const [columnRows] = await pool.query<ColumnRow[]>(`
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType,
        IS_NULLABLE AS isNullable,
        COLUMN_KEY AS columnKey
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('gc_users', 'gc_driver_profiles')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    const profileColumns = columnRows
      .filter((row) => row.tableName === 'gc_driver_profiles')
      .map((row) => row.columnName);

    const legacyUserColumns = columnRows
      .filter((row) => row.tableName === 'gc_users')
      .map((row) => row.columnName);

    if (!tables.has('gc_driver_profiles')) {
      throw new SteamIdentityFoundationError(
        stage,
        'DRIVER_PROFILES_TABLE_MISSING',
        'gc_driver_profiles is missing.'
      );
    }

    stage = 'count-legacy-users';

    let legacyUsers = 0;

    if (tables.has('gc_users')) {
      const [rows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_users
      `);
      legacyUsers = num(rows[0]?.value);
    }

    stage = 'count-profiles';

    const [profileRows] = await pool.query<CountRow[]>(`
      SELECT COUNT(*) AS value
      FROM gc_driver_profiles
    `);

    const driverProfiles = num(profileRows[0]?.value);

    const hasSteamGuid = profileColumns.includes('steam_guid');
    const hasPlayerId = profileColumns.includes('player_id');

    stage = 'count-identities';

    let profilesWithLegacySteamIdentity = 0;
    let profilesWithPlayerId = 0;
    let duplicateLegacySteamIdentities = 0;
    let duplicatePlayerIds = 0;

    if (hasSteamGuid) {
      const [rows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_driver_profiles
        WHERE steam_guid IS NOT NULL
          AND TRIM(CAST(steam_guid AS CHAR)) <> ''
      `);

      profilesWithLegacySteamIdentity = num(rows[0]?.value);

      const [duplicates] = await pool.query<DuplicateRow[]>(`
        SELECT COUNT(*) AS duplicateGroups
        FROM (
          SELECT steam_guid
          FROM gc_driver_profiles
          WHERE steam_guid IS NOT NULL
            AND TRIM(CAST(steam_guid AS CHAR)) <> ''
          GROUP BY steam_guid
          HAVING COUNT(*) > 1
        ) duplicate_steam
      `);

      duplicateLegacySteamIdentities = num(
        duplicates[0]?.duplicateGroups
      );
    }

    if (hasPlayerId) {
      const [rows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_driver_profiles
        WHERE player_id IS NOT NULL
      `);

      profilesWithPlayerId = num(rows[0]?.value);

      const [duplicates] = await pool.query<DuplicateRow[]>(`
        SELECT COUNT(*) AS duplicateGroups
        FROM (
          SELECT player_id
          FROM gc_driver_profiles
          WHERE player_id IS NOT NULL
          GROUP BY player_id
          HAVING COUNT(*) > 1
        ) duplicate_player
      `);

      duplicatePlayerIds = num(duplicates[0]?.duplicateGroups);
    }

    const profilesWithoutLegacySteamIdentity =
      driverProfiles - profilesWithLegacySteamIdentity;

    const blockers: string[] = [];

    if (duplicateLegacySteamIdentities > 0) {
      blockers.push(
        `${duplicateLegacySteamIdentities} identidad(es) Steam heredadas aparecen en más de un perfil.`
      );
    }

    if (duplicatePlayerIds > 0) {
      blockers.push(
        `${duplicatePlayerIds} Player ID aparecen en más de un perfil.`
      );
    }

    if (profilesWithoutLegacySteamIdentity > 0) {
      blockers.push(
        `${profilesWithoutLegacySteamIdentity} perfil(es) no tienen identidad Steam heredada y deberán permanecer sin reclamar.`
      );
    }

    if (tables.has('gc_steam_users')) {
      blockers.push(
        'La tabla gc_steam_users ya existe; antes de aplicar nada hay que auditar su estructura.'
      );
    }

    if (tables.has('gc_driver_identities')) {
      blockers.push(
        'La tabla gc_driver_identities ya existe; antes de aplicar nada hay que auditar su estructura.'
      );
    }

    blockers.push(
      'La migración debe ejecutarse con copia de seguridad, transacción y aprobación manual.'
    );

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      summary: {
        legacyUsers,
        driverProfiles,
        profilesWithLegacySteamIdentity,
        profilesWithoutLegacySteamIdentity,
        profilesWithPlayerId,
        duplicateLegacySteamIdentities,
        duplicatePlayerIds,
        steamUsersTableExists: tables.has('gc_steam_users'),
        driverIdentitiesTableExists: tables.has('gc_driver_identities'),
        safeToApplyMigration: false
      },
      currentSchema: {
        tablesPresent: [...tables],
        profileColumns,
        legacyUserColumns
      },
      proposedModel: {
        steamUsersTable: 'gc_steam_users',
        driverIdentitiesTable: 'gc_driver_identities',
        canonicalIdentity: 'steam_id64',
        loginMethod: 'steam_openid',
        passwordLoginSupported: false,
        emailLoginSupported: false,
        legacyAccountsImported: false
      },
      migrationPlan: {
        phases: [
          {
            order: 1,
            name: 'Crear tablas nuevas',
            action:
              'Crear gc_steam_users y gc_driver_identities sin modificar tablas existentes.',
            writes: true
          },
          {
            order: 2,
            name: 'Activar login Steam',
            action:
              'Crear o actualizar gc_steam_users al recibir un SteamID64 verificado.',
            writes: true
          },
          {
            order: 3,
            name: 'Registrar identidades técnicas',
            action:
              'Vincular steam_id64, legacy_steam_guid y stracker_player_id con restricciones UNIQUE.',
            writes: true
          },
          {
            order: 4,
            name: 'Reclamar perfil',
            action:
              'Asignar un perfil únicamente mediante coincidencia determinista o aprobación administrativa.',
            writes: true
          },
          {
            order: 5,
            name: 'Retirar gc_users del runtime',
            action:
              'Dejar de consultar cuentas antiguas sin eliminar la tabla.',
            writes: false
          }
        ],
        sqlFile: 'database/migrations/2026-08-01-steam-identity-foundation.sql',
        requiresManualApproval: true,
        rollbackRequired: true
      },
      blockers,
      nextStep:
        'Revisar el SQL propuesto, confirmar nombres y tipos de columnas, y preparar una ejecución dry-run transaccional sin COMMIT.'
    };
  } catch (error) {
    if (error instanceof SteamIdentityFoundationError) {
      throw error;
    }

    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;

    throw new SteamIdentityFoundationError(
      stage,
      'STEAM_IDENTITY_FOUNDATION_AUDIT_FAILED',
      error instanceof Error ? error.message : 'Unknown audit error.',
      databaseCode
    );
  }
}
