import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface TableMetaRow extends RowDataPacket {
  tableName: string;
  engine: string | null;
  tableCollation: string | null;
}

interface ColumnMetaRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  columnType: string;
  dataType: string;
  isNullable: 'YES' | 'NO';
  columnDefault: string | null;
  columnKey: string;
  extra: string;
  characterSetName: string | null;
  collationName: string | null;
}

interface IndexRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  nonUnique: number | string;
  sequence: number | string;
  columnName: string;
}

function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

export class SteamSchemaCompatibilityError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function auditSteamSchemaCompatibility() {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new SteamSchemaCompatibilityError(
        stage,
        'DATABASE_NOT_CONFIGURED',
        'Database is not configured.'
      );
    }

    const pool = getDatabasePool();

    stage = 'table-metadata';

    const [tableRows] = await pool.query<TableMetaRow[]>(`
      SELECT
        TABLE_NAME AS tableName,
        ENGINE AS engine,
        TABLE_COLLATION AS tableCollation
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'gc_driver_profiles',
          'gc_users',
          'gc_steam_users',
          'gc_driver_identities'
        )
      ORDER BY TABLE_NAME
    `);

    stage = 'column-metadata';

    const [columnRows] = await pool.query<ColumnMetaRow[]>(`
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName,
        COLUMN_TYPE AS columnType,
        DATA_TYPE AS dataType,
        IS_NULLABLE AS isNullable,
        COLUMN_DEFAULT AS columnDefault,
        COLUMN_KEY AS columnKey,
        EXTRA AS extra,
        CHARACTER_SET_NAME AS characterSetName,
        COLLATION_NAME AS collationName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('gc_driver_profiles', 'gc_users')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    stage = 'index-metadata';

    const [indexRows] = await pool.query<IndexRow[]>(`
      SELECT
        TABLE_NAME AS tableName,
        INDEX_NAME AS indexName,
        NON_UNIQUE AS nonUnique,
        SEQ_IN_INDEX AS sequence,
        COLUMN_NAME AS columnName
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('gc_driver_profiles', 'gc_users')
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);

    const profileTable = tableRows.find(
      (row) => row.tableName === 'gc_driver_profiles'
    );

    const profileId = columnRows.find(
      (row) =>
        row.tableName === 'gc_driver_profiles' &&
        row.columnName === 'id'
    );

    if (!profileTable || !profileId) {
      throw new SteamSchemaCompatibilityError(
        stage,
        'PROFILE_SCHEMA_INCOMPLETE',
        'gc_driver_profiles or its id column is missing.'
      );
    }

    const profileIdUnique = indexRows.some(
      (row) =>
        row.tableName === 'gc_driver_profiles' &&
        row.columnName === 'id' &&
        Number(row.nonUnique) === 0
    );

    const profileIdSql = profileId.columnType;
    const profileEngine = profileTable.engine ?? 'InnoDB';
    const profileCollation =
      profileTable.tableCollation ?? 'utf8mb4_unicode_ci';

    const profileCharacterSet =
      profileId.characterSetName ??
      (profileCollation.includes('_')
        ? profileCollation.split('_')[0]
        : 'utf8mb4');

    const existingTables = new Set(tableRows.map((row) => row.tableName));

    const blockers: string[] = [];

    if (profileEngine.toLowerCase() !== 'innodb') {
      blockers.push(
        `gc_driver_profiles usa ${profileEngine}; las claves foráneas requieren revisar el motor.`
      );
    }

    if (!profileIdUnique) {
      blockers.push(
        'gc_driver_profiles.id no tiene un índice UNIQUE o PRIMARY detectable.'
      );
    }

    if (existingTables.has('gc_steam_users')) {
      blockers.push(
        'gc_steam_users ya existe y no debe recrearse sin auditarla.'
      );
    }

    if (existingTables.has('gc_driver_identities')) {
      blockers.push(
        'gc_driver_identities ya existe y no debe recrearse sin auditarla.'
      );
    }

    blockers.push(
      'CREATE TABLE produce commit implícito en MariaDB/MySQL; la ejecución requiere copia de seguridad y verificación posterior, no un ROLLBACK transaccional.'
    );

    const sql = `-- GrassCutters Web V2
-- Steam identity schema proposal generated from live Hostinger metadata.
-- Do not execute automatically.

CREATE TABLE gc_steam_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id64 CHAR(17) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  steam_profile_url VARCHAR(500) NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'member',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gc_steam_users_steam_id64 (steam_id64),
  KEY idx_gc_steam_users_status (status),
  KEY idx_gc_steam_users_last_login_at (last_login_at)
) ENGINE=${profileEngine}
  DEFAULT CHARSET=${profileCharacterSet}
  COLLATE=${profileCollation};

CREATE TABLE gc_driver_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_user_id BIGINT UNSIGNED NOT NULL,
  driver_profile_id ${profileIdSql} NULL,
  identity_type VARCHAR(50) NOT NULL,
  identity_value VARCHAR(255) NOT NULL,
  source VARCHAR(60) NOT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'verified',
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_gc_driver_identities_type_value (
    identity_type,
    identity_value
  ),
  UNIQUE KEY uq_gc_driver_identities_user_type (
    steam_user_id,
    identity_type
  ),
  KEY idx_gc_driver_identities_profile (driver_profile_id),
  CONSTRAINT fk_gc_driver_identities_steam_user
    FOREIGN KEY (steam_user_id)
    REFERENCES gc_steam_users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_gc_driver_identities_profile
    FOREIGN KEY (driver_profile_id)
    REFERENCES gc_driver_profiles (${quoteIdentifier('id')})
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=${profileEngine}
  DEFAULT CHARSET=${profileCharacterSet}
  COLLATE=${profileCollation};
`;

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      summary: {
        profileEngine,
        profileCollation,
        profileCharacterSet,
        profileIdType: profileIdSql,
        profileIdUnique,
        steamUsersTableExists: existingTables.has('gc_steam_users'),
        driverIdentitiesTableExists:
          existingTables.has('gc_driver_identities'),
        schemaCompatible:
          profileEngine.toLowerCase() === 'innodb' &&
          profileIdUnique &&
          !existingTables.has('gc_steam_users') &&
          !existingTables.has('gc_driver_identities'),
        safeToExecute: false
      },
      profileReference: {
        table: 'gc_driver_profiles',
        column: 'id',
        columnType: profileId.columnType,
        dataType: profileId.dataType,
        nullable: profileId.isNullable === 'YES',
        uniqueOrPrimary: profileIdUnique,
        characterSet: profileId.characterSetName,
        collation: profileId.collationName
      },
      proposedTables: {
        steamUsers: 'gc_steam_users',
        driverIdentities: 'gc_driver_identities'
      },
      generatedSql: sql,
      sqlFile:
        'database/migrations/2026-08-01-steam-identity-foundation-final.sql',
      executionRules: [
        'Crear una copia de seguridad completa en Hostinger.',
        'Comprobar que no existen las tablas destino.',
        'Ejecutar cada CREATE TABLE de forma controlada.',
        'Verificar estructura, índices y claves foráneas inmediatamente.',
        'Eliminar solo las tablas nuevas si falla la validación.',
        'No modificar gc_users ni gc_driver_profiles.'
      ],
      blockers,
      nextStep:
        'Revisar este informe. Si schemaCompatible=true, preparar un ejecutor explícito protegido por MYSQL_WRITE_ENABLED y una confirmación de un solo uso.'
    };
  } catch (error) {
    if (error instanceof SteamSchemaCompatibilityError) {
      throw error;
    }

    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;

    throw new SteamSchemaCompatibilityError(
      stage,
      'STEAM_SCHEMA_COMPATIBILITY_FAILED',
      error instanceof Error ? error.message : 'Unknown compatibility error.',
      databaseCode
    );
  }
}
