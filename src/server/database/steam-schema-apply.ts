import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface TableRow extends RowDataPacket {
  tableName: string;
}

interface ColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  columnType: string;
  isNullable: 'YES' | 'NO';
  columnKey: string;
}

interface IndexRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  nonUnique: number | string;
  columnName: string;
}

interface ForeignKeyRow extends RowDataPacket {
  constraintName: string;
  tableName: string;
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
}

export const STEAM_SCHEMA_CONFIRMATION =
  'CREATE_STEAM_IDENTITY_TABLES_V1';

export class SteamSchemaApplyError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

async function listTargetTables(): Promise<string[]> {
  const [rows] = await getDatabasePool().query<TableRow[]>(`
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('gc_steam_users', 'gc_driver_identities')
    ORDER BY TABLE_NAME
  `);

  return rows.map((row) => row.tableName);
}

export async function inspectSteamIdentitySchema() {
  const pool = getDatabasePool();
  const existingTables = await listTargetTables();

  const [columns] = await pool.query<ColumnRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      COLUMN_TYPE AS columnType,
      IS_NULLABLE AS isNullable,
      COLUMN_KEY AS columnKey
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('gc_steam_users', 'gc_driver_identities')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const [indexes] = await pool.query<IndexRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      INDEX_NAME AS indexName,
      NON_UNIQUE AS nonUnique,
      COLUMN_NAME AS columnName
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('gc_steam_users', 'gc_driver_identities')
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);

  const [foreignKeys] = await pool.query<ForeignKeyRow[]>(`
    SELECT
      CONSTRAINT_NAME AS constraintName,
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      REFERENCED_TABLE_NAME AS referencedTableName,
      REFERENCED_COLUMN_NAME AS referencedColumnName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gc_driver_identities'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME
  `);

  const requiredTables = new Set([
    'gc_steam_users',
    'gc_driver_identities'
  ]);

  const allTablesPresent = [...requiredTables].every((table) =>
    existingTables.includes(table)
  );

  const steamIdUnique = indexes.some(
    (row) =>
      row.tableName === 'gc_steam_users' &&
      row.indexName === 'uq_gc_steam_users_steam_id64' &&
      Number(row.nonUnique) === 0 &&
      row.columnName === 'steam_id64'
  );

  const identityTypeValueUnique = indexes.some(
    (row) =>
      row.tableName === 'gc_driver_identities' &&
      row.indexName === 'uq_gc_driver_identities_type_value' &&
      Number(row.nonUnique) === 0
  );

  const steamUserForeignKey = foreignKeys.some(
    (row) =>
      row.columnName === 'steam_user_id' &&
      row.referencedTableName === 'gc_steam_users' &&
      row.referencedColumnName === 'id'
  );

  const driverProfileForeignKey = foreignKeys.some(
    (row) =>
      row.columnName === 'driver_profile_id' &&
      row.referencedTableName === 'gc_driver_profiles' &&
      row.referencedColumnName === 'id'
  );

  const valid =
    allTablesPresent &&
    steamIdUnique &&
    identityTypeValueUnique &&
    steamUserForeignKey &&
    driverProfileForeignKey;

  return {
    existingTables,
    allTablesPresent,
    columns: columns.map((row) => ({
      table: row.tableName,
      column: row.columnName,
      type: row.columnType,
      nullable: row.isNullable === 'YES',
      key: row.columnKey
    })),
    indexes: indexes.map((row) => ({
      table: row.tableName,
      name: row.indexName,
      unique: Number(row.nonUnique) === 0,
      column: row.columnName
    })),
    foreignKeys: foreignKeys.map((row) => ({
      name: row.constraintName,
      column: row.columnName,
      references: `${row.referencedTableName}.${row.referencedColumnName}`
    })),
    checks: {
      steamIdUnique,
      identityTypeValueUnique,
      steamUserForeignKey,
      driverProfileForeignKey
    },
    valid
  };
}

export async function applySteamIdentitySchema(input: {
  confirmation: string;
}) {
  let stage = 'preflight';

  try {
    if (runtimeConfig.appEnvironment !== 'local') {
      throw new SteamSchemaApplyError(
        stage,
        'LOCAL_ONLY',
        'Schema creation is restricted to the local administration runtime.'
      );
    }

    if (!runtimeConfig.database.writeEnabled) {
      throw new SteamSchemaApplyError(
        stage,
        'DATABASE_WRITES_DISABLED',
        'MYSQL_WRITE_ENABLED is not enabled.'
      );
    }

    if (input.confirmation !== STEAM_SCHEMA_CONFIRMATION) {
      throw new SteamSchemaApplyError(
        stage,
        'INVALID_CONFIRMATION',
        'The one-time confirmation phrase is invalid.'
      );
    }

    const existingTables = await listTargetTables();

    if (existingTables.length > 0) {
      throw new SteamSchemaApplyError(
        stage,
        'TARGET_TABLES_ALREADY_EXIST',
        `Target tables already exist: ${existingTables.join(', ')}`
      );
    }

    const pool = getDatabasePool();

    stage = 'create-steam-users';

    await pool.query(`
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
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    stage = 'create-driver-identities';

    await pool.query(`
      CREATE TABLE gc_driver_identities (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        steam_user_id BIGINT UNSIGNED NOT NULL,
        driver_profile_id VARCHAR(64) NULL,
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
          REFERENCES gc_driver_profiles (id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    stage = 'validate';

    const inspection = await inspectSteamIdentitySchema();

    if (!inspection.valid) {
      throw new SteamSchemaApplyError(
        stage,
        'POST_CREATE_VALIDATION_FAILED',
        'Tables were created but validation did not pass. Do not insert data.'
      );
    }

    return {
      ok: true,
      applied: true,
      readOnly: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      createdTables: inspection.existingTables,
      validation: inspection.checks,
      schemaValid: inspection.valid,
      legacyTablesModified: false,
      dataInserted: false,
      nextStep:
        'Disable MYSQL_WRITE_ENABLED, restart the server, then verify the schema status endpoint.'
    };
  } catch (error) {
    if (error instanceof SteamSchemaApplyError) {
      throw error;
    }

    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;

    throw new SteamSchemaApplyError(
      stage,
      'STEAM_SCHEMA_APPLY_FAILED',
      error instanceof Error ? error.message : 'Unknown schema apply error.',
      databaseCode
    );
  }
}
