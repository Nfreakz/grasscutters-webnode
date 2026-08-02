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
}

interface GenericIdentityRow extends RowDataPacket {
  entityId: string;
  linkedUserId: string | null;
  steamIdentity: string | null;
  playerId: string | null;
}

interface CountRow extends RowDataPacket {
  value: number | string | null;
}

interface AvatarCountRow extends RowDataPacket {
  populated: number | string | null;
  distinctValues: number | string | null;
  remoteUrls: number | string | null;
  localReferences: number | string | null;
}

interface DirectoryCount {
  path: string;
  exists: boolean;
  files: number;
}

interface DetectedSchema {
  userTable: string;
  profileTable: string;
  userIdColumn: string;
  profileIdColumn: string;
  profileUserLinkColumn: string | null;
  userSteamColumn: string | null;
  profileSteamColumn: string | null;
  userPlayerColumn: string | null;
  profilePlayerColumn: string | null;
}

const SENSITIVE_NAME_PARTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'session',
  'email',
  'steam_guid'
];

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

function normalize(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized ? normalized : null;
}

function isSafeMetadataName(value: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(value);
}

function chooseColumn(
  columns: Set<string>,
  candidates: string[]
): string | null {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return candidate;
  }
  return null;
}

function maskColumnName(columnName: string): string {
  const lower = columnName.toLowerCase();

  if (SENSITIVE_NAME_PARTS.some((part) => lower.includes(part))) {
    if (lower.includes('password') || lower.includes('passwd')) {
      return 'credential_hash';
    }

    if (lower.includes('email')) {
      return 'email_reference';
    }

    if (lower.includes('steam_guid')) {
      return 'steam_identity_reference';
    }

    return 'sensitive_reference';
  }

  return columnName;
}

async function countFiles(pathValue: string): Promise<DirectoryCount> {
  const { readdir } = await import('node:fs/promises');

  try {
    const entries = await readdir(pathValue, { withFileTypes: true });

    return {
      path: pathValue,
      exists: true,
      files: entries.filter((entry) => entry.isFile()).length
    };
  } catch {
    return {
      path: pathValue,
      exists: false,
      files: 0
    };
  }
}

function buildIdentitySelect(
  table: string,
  idColumn: string,
  linkedUserColumn: string | null,
  steamColumn: string | null,
  playerColumn: string | null
): string {
  const id = quoteIdentifier(idColumn);

  return `
    SELECT
      CAST(${id} AS CHAR) AS entityId,
      ${
        linkedUserColumn
          ? `CAST(${quoteIdentifier(linkedUserColumn)} AS CHAR)`
          : 'NULL'
      } AS linkedUserId,
      ${
        steamColumn
          ? `CAST(${quoteIdentifier(steamColumn)} AS CHAR)`
          : 'NULL'
      } AS steamIdentity,
      ${
        playerColumn
          ? `CAST(${quoteIdentifier(playerColumn)} AS CHAR)`
          : 'NULL'
      } AS playerId
    FROM ${quoteIdentifier(table)}
    ORDER BY CAST(${id} AS CHAR)
  `;
}

function duplicateValueCount(values: Array<string | null>): number {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.values()].filter((count) => count > 1).length;
}

export interface AccountRecoveryAudit {
  ok: true;
  readOnly: true;
  writesAvailable: false;
  destructiveChangesApplied: false;
  generatedAt: string;
  databaseName: string;
  detectedSchema: DetectedSchema;
  summary: {
    oldUsers: number;
    profiles: number;
    directlyLinkedUsers: number;
    uniquelyRecoverableUsers: number;
    ambiguousUsers: number;
    orphanUsers: number;
    credentialRowsFound: number;
    avatarReferencesFound: number;
    avatarFilesFoundLocally: number;
    safeToMigrate: false;
  };
  accounts: {
    tablesPresent: string[];
    credentialStorageDetected: boolean;
    credentialColumns: Array<{
      table: string;
      column: string;
      populatedRows: number;
    }>;
    emailReferenceDetected: boolean;
    classifications: {
      directProfileLink: number;
      uniqueSteamMatch: number;
      uniquePlayerIdMatch: number;
      ambiguousSteamMatch: number;
      ambiguousPlayerIdMatch: number;
      orphan: number;
    };
    sampleClassifications: Array<{
      userRef: string;
      classification:
        | 'direct-link'
        | 'unique-steam'
        | 'unique-player-id'
        | 'ambiguous'
        | 'orphan';
      matchingProfiles: number;
    }>;
  };
  profiles: {
    total: number;
    directlyLinked: number;
    withSteamIdentity: number;
    withPlayerId: number;
    duplicateSteamIdentityValues: number;
    duplicatePlayerIds: number;
  };
  avatars: {
    columns: Array<{
      table: string;
      column: string;
      populatedRows: number;
      distinctValues: number;
      remoteUrls: number;
      localReferences: number;
    }>;
    localDirectories: DirectoryCount[];
    note: string;
  };
  blockers: string[];
  nextStep: string;
}

export class AccountRecoveryAuditError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function auditAccountRecovery(): Promise<AccountRecoveryAudit> {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new AccountRecoveryAuditError(
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
        AND TABLE_NAME IN (
          'gc_users',
          'gc_driver_profiles',
          'gc_team_memberships',
          'gc_teams'
        )
      ORDER BY TABLE_NAME
    `);

    const tables = new Set(tableRows.map((row) => row.tableName));

    if (!tables.has('gc_users') || !tables.has('gc_driver_profiles')) {
      throw new AccountRecoveryAuditError(
        stage,
        'IDENTITY_TABLES_MISSING',
        'Required identity tables are missing.'
      );
    }

    stage = 'schema-columns';

    const [columnRows] = await pool.query<ColumnRow[]>(`
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('gc_users', 'gc_driver_profiles')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    const columnsByTable = new Map<string, Set<string>>();

    for (const row of columnRows) {
      if (!columnsByTable.has(row.tableName)) {
        columnsByTable.set(row.tableName, new Set());
      }

      columnsByTable.get(row.tableName)?.add(row.columnName);
    }

    const userColumns = columnsByTable.get('gc_users') ?? new Set<string>();
    const profileColumns =
      columnsByTable.get('gc_driver_profiles') ?? new Set<string>();

    const detectedSchema: DetectedSchema = {
      userTable: 'gc_users',
      profileTable: 'gc_driver_profiles',
      userIdColumn:
        chooseColumn(userColumns, ['id', 'user_id', 'account_id']) ?? '',
      profileIdColumn:
        chooseColumn(profileColumns, ['id', 'profile_id', 'driver_profile_id']) ??
        '',
      profileUserLinkColumn: chooseColumn(profileColumns, [
        'linked_user_id',
        'user_id',
        'account_id',
        'gc_user_id'
      ]),
      userSteamColumn: chooseColumn(userColumns, [
        'pilot_steam_guid',
        'steam_guid',
        'steam_id',
        'steamid',
        'steam_id64'
      ]),
      profileSteamColumn: chooseColumn(profileColumns, [
        'steam_guid',
        'pilot_steam_guid',
        'steam_id',
        'steamid',
        'steam_id64'
      ]),
      userPlayerColumn: chooseColumn(userColumns, [
        'pilot_player_id',
        'player_id',
        'stracker_player_id'
      ]),
      profilePlayerColumn: chooseColumn(profileColumns, [
        'player_id',
        'pilot_player_id',
        'stracker_player_id'
      ])
    };

    if (!detectedSchema.userIdColumn || !detectedSchema.profileIdColumn) {
      throw new AccountRecoveryAuditError(
        stage,
        'IDENTITY_ID_COLUMNS_MISSING',
        'Could not identify user/profile primary key columns.'
      );
    }

    stage = 'load-users';

    const [userRows] = await pool.query<GenericIdentityRow[]>(
      buildIdentitySelect(
        detectedSchema.userTable,
        detectedSchema.userIdColumn,
        null,
        detectedSchema.userSteamColumn,
        detectedSchema.userPlayerColumn
      )
    );

    stage = 'load-profiles';

    const [profileRows] = await pool.query<GenericIdentityRow[]>(
      buildIdentitySelect(
        detectedSchema.profileTable,
        detectedSchema.profileIdColumn,
        detectedSchema.profileUserLinkColumn,
        detectedSchema.profileSteamColumn,
        detectedSchema.profilePlayerColumn
      )
    );

    stage = 'classify-users';

    const profilesByLinkedUser = new Map<string, Set<string>>();
    const profilesBySteam = new Map<string, Set<string>>();
    const profilesByPlayer = new Map<string, Set<string>>();

    for (const profile of profileRows) {
      const profileId = String(profile.entityId);
      const linkedUser = normalize(profile.linkedUserId);
      const steam = normalize(profile.steamIdentity);
      const player = normalize(profile.playerId);

      if (linkedUser) {
        if (!profilesByLinkedUser.has(linkedUser)) {
          profilesByLinkedUser.set(linkedUser, new Set());
        }
        profilesByLinkedUser.get(linkedUser)?.add(profileId);
      }

      if (steam) {
        if (!profilesBySteam.has(steam)) {
          profilesBySteam.set(steam, new Set());
        }
        profilesBySteam.get(steam)?.add(profileId);
      }

      if (player) {
        if (!profilesByPlayer.has(player)) {
          profilesByPlayer.set(player, new Set());
        }
        profilesByPlayer.get(player)?.add(profileId);
      }
    }

    let directLinkedUsers = 0;
    let uniqueSteamMatches = 0;
    let uniquePlayerMatches = 0;
    let ambiguousSteamMatches = 0;
    let ambiguousPlayerMatches = 0;
    let orphanUsers = 0;
    let ambiguousUsers = 0;

    const sampleClassifications:
      AccountRecoveryAudit['accounts']['sampleClassifications'] = [];

    for (const user of userRows) {
      const userId = normalize(user.entityId) ?? '';
      const steam = normalize(user.steamIdentity);
      const player = normalize(user.playerId);

      const directProfiles = profilesByLinkedUser.get(userId)?.size ?? 0;
      const steamProfiles = steam
        ? profilesBySteam.get(steam)?.size ?? 0
        : 0;
      const playerProfiles = player
        ? profilesByPlayer.get(player)?.size ?? 0
        : 0;

      let classification:
        | 'direct-link'
        | 'unique-steam'
        | 'unique-player-id'
        | 'ambiguous'
        | 'orphan';
      let matchingProfiles = 0;

      if (directProfiles === 1) {
        directLinkedUsers += 1;
        classification = 'direct-link';
        matchingProfiles = 1;
      } else if (
        directProfiles > 1 ||
        steamProfiles > 1 ||
        playerProfiles > 1
      ) {
        ambiguousUsers += 1;

        if (steamProfiles > 1) ambiguousSteamMatches += 1;
        if (playerProfiles > 1) ambiguousPlayerMatches += 1;

        classification = 'ambiguous';
        matchingProfiles = Math.max(
          directProfiles,
          steamProfiles,
          playerProfiles
        );
      } else if (steamProfiles === 1) {
        uniqueSteamMatches += 1;
        classification = 'unique-steam';
        matchingProfiles = 1;
      } else if (playerProfiles === 1) {
        uniquePlayerMatches += 1;
        classification = 'unique-player-id';
        matchingProfiles = 1;
      } else {
        orphanUsers += 1;
        classification = 'orphan';
        matchingProfiles = 0;
      }

      if (sampleClassifications.length < 30) {
        sampleClassifications.push({
          userRef: `user-${String(user.entityId).slice(-6).padStart(6, '0')}`,
          classification,
          matchingProfiles
        });
      }
    }

    stage = 'credential-metadata';

    const credentialColumns = columnRows.filter((row) => {
      if (row.tableName !== 'gc_users') return false;

      const name = row.columnName.toLowerCase();

      return (
        name.includes('password') ||
        name.includes('passwd') ||
        name === 'hash' ||
        name.endsWith('_hash')
      );
    });

    const credentialResults:
      AccountRecoveryAudit['accounts']['credentialColumns'] = [];

    let credentialRowsFound = 0;

    for (const column of credentialColumns) {
      if (!isSafeMetadataName(column.columnName)) continue;

      const field = quoteIdentifier(column.columnName);

      const [rows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_users
        WHERE ${field} IS NOT NULL
          AND TRIM(CAST(${field} AS CHAR)) <> ''
      `);

      const populatedRows = num(rows[0]?.value);
      credentialRowsFound += populatedRows;

      credentialResults.push({
        table: column.tableName,
        column: maskColumnName(column.columnName),
        populatedRows
      });
    }

    const emailReferenceDetected = columnRows.some(
      (row) =>
        row.tableName === 'gc_users' &&
        row.columnName.toLowerCase().includes('email')
    );

    stage = 'avatar-metadata';

    const avatarColumns = columnRows.filter((row) => {
      const name = row.columnName.toLowerCase();

      return (
        name.includes('avatar') ||
        name.includes('photo') ||
        name.includes('image') ||
        name.includes('picture')
      );
    });

    const avatarResults: AccountRecoveryAudit['avatars']['columns'] = [];
    let avatarReferencesFound = 0;

    for (const column of avatarColumns) {
      if (
        !isSafeMetadataName(column.tableName) ||
        !isSafeMetadataName(column.columnName)
      ) {
        continue;
      }

      const table = quoteIdentifier(column.tableName);
      const field = quoteIdentifier(column.columnName);

      const [rows] = await pool.query<AvatarCountRow[]>(`
        SELECT
          COUNT(*) AS populated,
          COUNT(DISTINCT CAST(${field} AS CHAR)) AS distinctValues,
          COALESCE(SUM(
            LOWER(TRIM(CAST(${field} AS CHAR))) LIKE 'http://%'
            OR LOWER(TRIM(CAST(${field} AS CHAR))) LIKE 'https://%'
          ), 0) AS remoteUrls,
          COALESCE(SUM(
            LOWER(TRIM(CAST(${field} AS CHAR))) NOT LIKE 'http://%'
            AND LOWER(TRIM(CAST(${field} AS CHAR))) NOT LIKE 'https://%'
          ), 0) AS localReferences
        FROM ${table}
        WHERE ${field} IS NOT NULL
          AND TRIM(CAST(${field} AS CHAR)) <> ''
      `);

      const row = rows[0];
      const populatedRows = num(row?.populated);
      avatarReferencesFound += populatedRows;

      avatarResults.push({
        table: column.tableName,
        column: column.columnName,
        populatedRows,
        distinctValues: num(row?.distinctValues),
        remoteUrls: num(row?.remoteUrls),
        localReferences: num(row?.localReferences)
      });
    }

    stage = 'avatar-files';

    const localDirectories = await Promise.all([
      countFiles('data/app/pilot-avatar-files'),
      countFiles('data/app/uploads'),
      countFiles('public/uploads'),
      countFiles('public/assets/drivers')
    ]);

    const avatarFilesFoundLocally = localDirectories.reduce(
      (total, directory) => total + directory.files,
      0
    );

    stage = 'build-report';

    const profileSteamValues = profileRows.map((row) =>
      normalize(row.steamIdentity)
    );
    const profilePlayerValues = profileRows.map((row) =>
      normalize(row.playerId)
    );

    const directlyLinkedProfiles = profileRows.filter(
      (row) => Boolean(normalize(row.linkedUserId))
    ).length;

    const profilesWithSteam = profileSteamValues.filter(Boolean).length;
    const profilesWithPlayerId = profilePlayerValues.filter(Boolean).length;
    const duplicateSteamIdentityValues =
      duplicateValueCount(profileSteamValues);
    const duplicatePlayerIds = duplicateValueCount(profilePlayerValues);

    const uniquelyRecoverableUsers =
      directLinkedUsers + uniqueSteamMatches + uniquePlayerMatches;

    const blockers: string[] = [];

    if (!detectedSchema.profileUserLinkColumn) {
      blockers.push(
        'No se ha localizado una columna directa de vínculo usuario → perfil.'
      );
    }

    if (ambiguousUsers > 0) {
      blockers.push(
        `${ambiguousUsers} cuenta(s) tienen más de un perfil candidato.`
      );
    }

    if (orphanUsers > 0) {
      blockers.push(
        `${orphanUsers} cuenta(s) no tienen coincidencia con un perfil actual.`
      );
    }

    if (credentialRowsFound > 0) {
      blockers.push(
        'Se han localizado credenciales heredadas, pero falta identificar y validar el algoritmo de hash.'
      );
    }

    if (avatarReferencesFound > 0 && avatarFilesFoundLocally === 0) {
      blockers.push(
        'Hay referencias de avatar en la base de datos, pero no se han localizado archivos en las rutas locales conocidas.'
      );
    }

    if (duplicateSteamIdentityValues > 0) {
      blockers.push('Existen identidades Steam repetidas entre perfiles.');
    }

    if (duplicatePlayerIds > 0) {
      blockers.push('Existen Player ID repetidos entre perfiles.');
    }

    if (blockers.length === 0) {
      blockers.push(
        'Falta ejecutar una migración simulada y verificar manualmente credenciales y archivos antes de permitir escrituras.'
      );
    }

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      detectedSchema,
      summary: {
        oldUsers: userRows.length,
        profiles: profileRows.length,
        directlyLinkedUsers: directLinkedUsers,
        uniquelyRecoverableUsers,
        ambiguousUsers,
        orphanUsers,
        credentialRowsFound,
        avatarReferencesFound,
        avatarFilesFoundLocally,
        safeToMigrate: false
      },
      accounts: {
        tablesPresent: [...tables],
        credentialStorageDetected: credentialResults.length > 0,
        credentialColumns: credentialResults,
        emailReferenceDetected,
        classifications: {
          directProfileLink: directLinkedUsers,
          uniqueSteamMatch: uniqueSteamMatches,
          uniquePlayerIdMatch: uniquePlayerMatches,
          ambiguousSteamMatch: ambiguousSteamMatches,
          ambiguousPlayerIdMatch: ambiguousPlayerMatches,
          orphan: orphanUsers
        },
        sampleClassifications
      },
      profiles: {
        total: profileRows.length,
        directlyLinked: directlyLinkedProfiles,
        withSteamIdentity: profilesWithSteam,
        withPlayerId: profilesWithPlayerId,
        duplicateSteamIdentityValues,
        duplicatePlayerIds
      },
      avatars: {
        columns: avatarResults,
        localDirectories,
        note:
          'El auditor cuenta referencias y archivos, pero no devuelve URLs, nombres de archivo ni rutas privadas individuales.'
      },
      blockers,
      nextStep:
        'Preparar un dry-run por usuario con decisión conservar, vincular, revisar o archivar; después verificar el algoritmo de contraseña y copiar avatares a una biblioteca canónica.'
    };
  } catch (error) {
    if (error instanceof AccountRecoveryAuditError) {
      throw error;
    }

    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;

    const message =
      error instanceof Error ? error.message : 'Unknown audit error.';

    throw new AccountRecoveryAuditError(
      stage,
      'ACCOUNT_RECOVERY_AUDIT_FAILED',
      message,
      databaseCode
    );
  }
}
