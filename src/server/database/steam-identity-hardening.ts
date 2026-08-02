import type {
  ResultSetHeader,
  RowDataPacket
} from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

export const STEAM_IDENTITY_HARDENING_CONFIRMATION =
  'ADD_UNIQUE_DRIVER_PROFILE_OWNER_V1';

interface CountRow extends RowDataPacket {
  value: number | string | null;
}

interface DuplicateRow extends RowDataPacket {
  driverProfileId: string;
  owners: number | string;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number | string;
  sequence: number | string;
  columnName: string;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class SteamIdentityHardeningError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

function getDatabaseCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return null;
}

export async function inspectSteamIdentityHardening() {
  const pool = getDatabasePool();

  const [indexRows] = await pool.query<IndexRow[]>(`
    SELECT
      INDEX_NAME AS indexName,
      NON_UNIQUE AS nonUnique,
      SEQ_IN_INDEX AS sequence,
      COLUMN_NAME AS columnName
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gc_driver_identities'
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `);

  const uniqueProfileIndex = indexRows.some(
    (row) =>
      row.indexName === 'uq_gc_driver_identities_profile_owner' &&
      Number(row.nonUnique) === 0 &&
      Number(row.sequence) === 1 &&
      row.columnName === 'driver_profile_id'
  );

  const [duplicateRows] = await pool.query<DuplicateRow[]>(`
    SELECT
      driver_profile_id AS driverProfileId,
      COUNT(DISTINCT steam_user_id) AS owners
    FROM gc_driver_identities
    WHERE driver_profile_id IS NOT NULL
      AND verification_status = 'verified'
    GROUP BY driver_profile_id
    HAVING COUNT(DISTINCT steam_user_id) > 1
    ORDER BY driver_profile_id
  `);

  const [linkedRows] = await pool.query<CountRow[]>(`
    SELECT COUNT(*) AS value
    FROM gc_driver_identities
    WHERE driver_profile_id IS NOT NULL
      AND verification_status = 'verified'
  `);

  const [unlinkedRows] = await pool.query<CountRow[]>(`
    SELECT COUNT(*) AS value
    FROM gc_driver_identities
    WHERE driver_profile_id IS NULL
      AND identity_type = 'steam_id64'
      AND verification_status = 'verified'
  `);

  const [steamUsersRows] = await pool.query<CountRow[]>(`
    SELECT COUNT(*) AS value
    FROM gc_steam_users
  `);

  const duplicates = duplicateRows.map((row) => ({
    driverProfileId: row.driverProfileId,
    owners: num(row.owners)
  }));

  return {
    ok: true,
    readOnly: true,
    writesAvailable: runtimeConfig.database.writeEnabled,
    destructiveChangesApplied: false,
    generatedAt: new Date().toISOString(),
    databaseName: runtimeConfig.database.name,
    summary: {
      steamUsers: num(steamUsersRows[0]?.value),
      verifiedLinkedIdentities: num(linkedRows[0]?.value),
      verifiedUnlinkedSteamIdentities: num(unlinkedRows[0]?.value),
      duplicateProfileOwners: duplicates.length,
      uniqueProfileOwnerIndexExists: uniqueProfileIndex,
      schemaHardened: uniqueProfileIndex && duplicates.length === 0
    },
    duplicates,
    requiredIndex: {
      table: 'gc_driver_identities',
      name: 'uq_gc_driver_identities_profile_owner',
      column: 'driver_profile_id',
      unique: true,
      multipleNullsAllowed: true
    },
    canApply:
      runtimeConfig.database.writeEnabled &&
      !uniqueProfileIndex &&
      duplicates.length === 0,
    safeToApplyAutomatically: false,
    requiredConfirmation:
      STEAM_IDENTITY_HARDENING_CONFIRMATION,
    nextStep: uniqueProfileIndex
      ? 'La protección ya está instalada. Mantener MYSQL_WRITE_ENABLED=false.'
      : duplicates.length > 0
        ? 'Resolver los propietarios duplicados antes de crear el índice.'
        : 'Habilitar temporalmente MYSQL_WRITE_ENABLED y aplicar el índice protegido.'
  };
}

export async function applySteamIdentityHardening(input: {
  confirmation: string;
}) {
  let stage = 'preflight';

  try {
    if (runtimeConfig.appEnvironment !== 'local') {
      throw new SteamIdentityHardeningError(
        stage,
        'LOCAL_ONLY',
        'Schema hardening is restricted to the local administration runtime.'
      );
    }

    if (!runtimeConfig.database.writeEnabled) {
      throw new SteamIdentityHardeningError(
        stage,
        'DATABASE_WRITES_DISABLED',
        'MYSQL_WRITE_ENABLED is disabled.'
      );
    }

    if (
      input.confirmation !==
      STEAM_IDENTITY_HARDENING_CONFIRMATION
    ) {
      throw new SteamIdentityHardeningError(
        stage,
        'INVALID_CONFIRMATION',
        'The confirmation phrase is invalid.'
      );
    }

    const preflight = await inspectSteamIdentityHardening();

    if (preflight.summary.uniqueProfileOwnerIndexExists) {
      throw new SteamIdentityHardeningError(
        stage,
        'INDEX_ALREADY_EXISTS',
        'The unique driver profile owner index already exists.'
      );
    }

    if (preflight.summary.duplicateProfileOwners > 0) {
      throw new SteamIdentityHardeningError(
        stage,
        'DUPLICATE_PROFILE_OWNERS',
        'One or more driver profiles already have multiple verified owners.'
      );
    }

    stage = 'create-index';

    const pool = getDatabasePool();

    await pool.execute<ResultSetHeader>(`
      ALTER TABLE gc_driver_identities
      ADD UNIQUE KEY uq_gc_driver_identities_profile_owner (
        driver_profile_id
      )
    `);

    stage = 'validate';

    const inspection = await inspectSteamIdentityHardening();

    if (!inspection.summary.schemaHardened) {
      throw new SteamIdentityHardeningError(
        stage,
        'POST_APPLY_VALIDATION_FAILED',
        'The unique profile owner index was not validated after creation.'
      );
    }

    return {
      ok: true,
      applied: true,
      readOnly: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      indexCreated: inspection.requiredIndex,
      schemaHardened: true,
      duplicateProfileOwners: 0,
      historicalDataModified: false,
      nextStep:
        'Set MYSQL_WRITE_ENABLED=false, restart the server and verify the status endpoint.'
    };
  } catch (error) {
    if (error instanceof SteamIdentityHardeningError) {
      throw error;
    }

    throw new SteamIdentityHardeningError(
      stage,
      'STEAM_IDENTITY_HARDENING_FAILED',
      error instanceof Error ? error.message : 'Unknown hardening error.',
      getDatabaseCode(error)
    );
  }
}
