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

interface GenericRow extends RowDataPacket {
  entityId: string;
  linkedUserId: string | null;
  steamIdentity: string | null;
  playerId: string | null;
  emailValue: string | null;
  usernameValue: string | null;
  roleValue: string | null;
  statusValue: string | null;
  createdAtValue: string | null;
  lastLoginValue: string | null;
  credentialValue: string | null;
}

interface CountRow extends RowDataPacket {
  value: number | string | null;
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
  userEmailColumn: string | null;
  userNameColumn: string | null;
  userRoleColumn: string | null;
  userStatusColumn: string | null;
  userCreatedAtColumn: string | null;
  userLastLoginColumn: string | null;
  credentialColumn: string | null;
}

type Decision = 'keep' | 'link' | 'review' | 'archive';
type CredentialScheme =
  | 'bcrypt'
  | 'argon2'
  | 'pbkdf2'
  | 'scrypt'
  | 'phpass'
  | 'sha512'
  | 'sha256'
  | 'sha1'
  | 'md5'
  | 'unknown'
  | 'none';

function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

function normalize(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeKey(value: unknown): string | null {
  const normalized = normalize(value);
  return normalized ? normalized.toLowerCase() : null;
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

function detectCredentialScheme(value: string | null): CredentialScheme {
  if (!value) return 'none';

  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)) {
    return 'bcrypt';
  }

  if (/^\$argon2(id|i|d)\$/i.test(value)) {
    return 'argon2';
  }

  if (/^pbkdf2[:$]/i.test(value) || /^\$pbkdf2-/i.test(value)) {
    return 'pbkdf2';
  }

  if (/^scrypt[:$]/i.test(value) || /^\$scrypt\$/i.test(value)) {
    return 'scrypt';
  }

  if (/^\$P\$|^\$H\$/.test(value)) {
    return 'phpass';
  }

  if (/^[a-f0-9]{128}$/i.test(value)) {
    return 'sha512';
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return 'sha256';
  }

  if (/^[a-f0-9]{40}$/i.test(value)) {
    return 'sha1';
  }

  if (/^[a-f0-9]{32}$/i.test(value)) {
    return 'md5';
  }

  return 'unknown';
}

function looksLikeTestAccount(
  username: string | null,
  email: string | null,
  role: string | null,
  status: string | null
): boolean {
  const combined = [
    username,
    email,
    role,
    status
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return [
    'test',
    'demo',
    'dummy',
    'prueba',
    'sample',
    'dev',
    'developer',
    'bot',
    'temp',
    'temporary'
  ].some((token) => combined.includes(token));
}

function maskRef(value: string): string {
  const suffix = value.slice(-6).padStart(6, '0');
  return `user-${suffix}`;
}

function profileRef(value: string): string {
  const suffix = value.slice(-6).padStart(6, '0');
  return `profile-${suffix}`;
}

function selectExpression(
  column: string | null,
  alias: string
): string {
  return column
    ? `CAST(${quoteIdentifier(column)} AS CHAR) AS ${alias}`
    : `NULL AS ${alias}`;
}

function buildUserSelect(schema: DetectedSchema): string {
  return `
    SELECT
      CAST(${quoteIdentifier(schema.userIdColumn)} AS CHAR) AS entityId,
      NULL AS linkedUserId,
      ${selectExpression(schema.userSteamColumn, 'steamIdentity')},
      ${selectExpression(schema.userPlayerColumn, 'playerId')},
      ${selectExpression(schema.userEmailColumn, 'emailValue')},
      ${selectExpression(schema.userNameColumn, 'usernameValue')},
      ${selectExpression(schema.userRoleColumn, 'roleValue')},
      ${selectExpression(schema.userStatusColumn, 'statusValue')},
      ${selectExpression(schema.userCreatedAtColumn, 'createdAtValue')},
      ${selectExpression(schema.userLastLoginColumn, 'lastLoginValue')},
      ${selectExpression(schema.credentialColumn, 'credentialValue')}
    FROM ${quoteIdentifier(schema.userTable)}
    ORDER BY CAST(${quoteIdentifier(schema.userIdColumn)} AS CHAR)
  `;
}

function buildProfileSelect(schema: DetectedSchema): string {
  return `
    SELECT
      CAST(${quoteIdentifier(schema.profileIdColumn)} AS CHAR) AS entityId,
      ${selectExpression(schema.profileUserLinkColumn, 'linkedUserId')},
      ${selectExpression(schema.profileSteamColumn, 'steamIdentity')},
      ${selectExpression(schema.profilePlayerColumn, 'playerId')},
      NULL AS emailValue,
      NULL AS usernameValue,
      NULL AS roleValue,
      NULL AS statusValue,
      NULL AS createdAtValue,
      NULL AS lastLoginValue,
      NULL AS credentialValue
    FROM ${quoteIdentifier(schema.profileTable)}
    ORDER BY CAST(${quoteIdentifier(schema.profileIdColumn)} AS CHAR)
  `;
}

export interface RecoveryDryRunItem {
  userRef: string;
  decision: Decision;
  reason: string;
  linkedProfileRef: string | null;
  candidateProfileRefs: string[];
  directProfileLink: boolean;
  hasEmail: boolean;
  hasCredential: boolean;
  credentialScheme: CredentialScheme;
  hasSteamIdentity: boolean;
  hasPlayerId: boolean;
  likelyTestAccount: boolean;
  hasRoleMetadata: boolean;
  hasStatusMetadata: boolean;
  hasCreationDate: boolean;
  hasLastLoginDate: boolean;
  recommendedAction: string;
}

export interface RecoveryDryRunReport {
  ok: true;
  readOnly: true;
  writesAvailable: false;
  destructiveChangesApplied: false;
  generatedAt: string;
  databaseName: string;
  detectedSchema: DetectedSchema;
  summary: {
    users: number;
    profiles: number;
    keep: number;
    link: number;
    review: number;
    archive: number;
    profilesWithoutUser: number;
    credentialsDetected: number;
    knownCredentialSchemes: number;
    unknownCredentialSchemes: number;
    likelyTestAccounts: number;
    safeToApply: false;
  };
  credentialSchemes: Record<CredentialScheme, number>;
  users: RecoveryDryRunItem[];
  unlinkedProfiles: Array<{
    profileRef: string;
    hasSteamIdentity: boolean;
    hasPlayerId: boolean;
    candidateUserRefs: string[];
    recommendation: string;
  }>;
  blockers: string[];
  nextStep: string;
}

export class RecoveryDryRunError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function buildAccountRecoveryDryRun(): Promise<RecoveryDryRunReport> {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new RecoveryDryRunError(
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
        AND TABLE_NAME IN ('gc_users', 'gc_driver_profiles')
      ORDER BY TABLE_NAME
    `);

    const tableNames = new Set(tableRows.map((row) => row.tableName));

    if (
      !tableNames.has('gc_users') ||
      !tableNames.has('gc_driver_profiles')
    ) {
      throw new RecoveryDryRunError(
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

    const userColumns = new Set(
      columnRows
        .filter((row) => row.tableName === 'gc_users')
        .map((row) => row.columnName)
    );

    const profileColumns = new Set(
      columnRows
        .filter((row) => row.tableName === 'gc_driver_profiles')
        .map((row) => row.columnName)
    );

    const credentialCandidates = columnRows
      .filter((row) => {
        if (row.tableName !== 'gc_users') return false;
        const name = row.columnName.toLowerCase();

        return (
          name.includes('password') ||
          name.includes('passwd') ||
          name === 'hash' ||
          name.endsWith('_hash')
        );
      })
      .map((row) => row.columnName);

    const schema: DetectedSchema = {
      userTable: 'gc_users',
      profileTable: 'gc_driver_profiles',
      userIdColumn:
        chooseColumn(userColumns, ['id', 'user_id', 'account_id']) ?? '',
      profileIdColumn:
        chooseColumn(profileColumns, [
          'id',
          'profile_id',
          'driver_profile_id'
        ]) ?? '',
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
      ]),
      userEmailColumn: chooseColumn(userColumns, [
        'email',
        'email_address',
        'user_email'
      ]),
      userNameColumn: chooseColumn(userColumns, [
        'username',
        'user_name',
        'name',
        'display_name',
        'login'
      ]),
      userRoleColumn: chooseColumn(userColumns, [
        'role',
        'user_role',
        'account_role'
      ]),
      userStatusColumn: chooseColumn(userColumns, [
        'status',
        'user_status',
        'account_status',
        'is_active',
        'active'
      ]),
      userCreatedAtColumn: chooseColumn(userColumns, [
        'created_at',
        'created',
        'registered_at',
        'registration_date'
      ]),
      userLastLoginColumn: chooseColumn(userColumns, [
        'last_login_at',
        'last_login',
        'last_seen_at',
        'updated_at'
      ]),
      credentialColumn: credentialCandidates[0] ?? null
    };

    if (!schema.userIdColumn || !schema.profileIdColumn) {
      throw new RecoveryDryRunError(
        stage,
        'IDENTITY_ID_COLUMNS_MISSING',
        'Could not identify primary key columns.'
      );
    }

    stage = 'load-users';

    const [users] = await pool.query<GenericRow[]>(
      buildUserSelect(schema)
    );

    stage = 'load-profiles';

    const [profiles] = await pool.query<GenericRow[]>(
      buildProfileSelect(schema)
    );

    stage = 'index-identities';

    const profilesByUser = new Map<string, Set<string>>();
    const profilesBySteam = new Map<string, Set<string>>();
    const profilesByPlayer = new Map<string, Set<string>>();

    for (const profile of profiles) {
      const profileId = String(profile.entityId);
      const userId = normalizeKey(profile.linkedUserId);
      const steam = normalizeKey(profile.steamIdentity);
      const player = normalizeKey(profile.playerId);

      if (userId) {
        if (!profilesByUser.has(userId)) {
          profilesByUser.set(userId, new Set());
        }
        profilesByUser.get(userId)?.add(profileId);
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

    const usersBySteam = new Map<string, Set<string>>();
    const usersByPlayer = new Map<string, Set<string>>();

    for (const user of users) {
      const userId = String(user.entityId);
      const steam = normalizeKey(user.steamIdentity);
      const player = normalizeKey(user.playerId);

      if (steam) {
        if (!usersBySteam.has(steam)) {
          usersBySteam.set(steam, new Set());
        }
        usersBySteam.get(steam)?.add(userId);
      }

      if (player) {
        if (!usersByPlayer.has(player)) {
          usersByPlayer.set(player, new Set());
        }
        usersByPlayer.get(player)?.add(userId);
      }
    }

    stage = 'classify-users';

    const credentialSchemes: Record<CredentialScheme, number> = {
      bcrypt: 0,
      argon2: 0,
      pbkdf2: 0,
      scrypt: 0,
      phpass: 0,
      sha512: 0,
      sha256: 0,
      sha1: 0,
      md5: 0,
      unknown: 0,
      none: 0
    };

    const reportItems: RecoveryDryRunItem[] = [];

    for (const user of users) {
      const userId = String(user.entityId);
      const userKey = normalizeKey(userId) ?? userId;
      const steam = normalizeKey(user.steamIdentity);
      const player = normalizeKey(user.playerId);

      const directCandidates = [
        ...(profilesByUser.get(userKey) ?? [])
      ];

      const steamCandidates = steam
        ? [...(profilesBySteam.get(steam) ?? [])]
        : [];

      const playerCandidates = player
        ? [...(profilesByPlayer.get(player) ?? [])]
        : [];

      const allCandidates = [
        ...new Set([
          ...directCandidates,
          ...steamCandidates,
          ...playerCandidates
        ])
      ];

      const directProfileLink = directCandidates.length === 1;
      const credentialScheme = detectCredentialScheme(
        normalize(user.credentialValue)
      );
      credentialSchemes[credentialScheme] += 1;

      const hasEmail = Boolean(normalize(user.emailValue));
      const hasCredential = credentialScheme !== 'none';
      const likelyTestAccount = looksLikeTestAccount(
        normalize(user.usernameValue),
        normalize(user.emailValue),
        normalize(user.roleValue),
        normalize(user.statusValue)
      );

      let decision: Decision;
      let reason: string;
      let linkedProfileRef: string | null = null;
      let recommendedAction: string;

      if (directCandidates.length === 1) {
        decision = 'keep';
        linkedProfileRef = profileRef(directCandidates[0]);
        reason = 'La cuenta ya está vinculada a un único perfil canónico.';
        recommendedAction =
          'Conservar la cuenta y validar el acceso con su hash actual antes de migrar.';
      } else if (directCandidates.length > 1 || allCandidates.length > 1) {
        decision = 'review';
        reason = 'Existen varios perfiles candidatos.';
        recommendedAction =
          'Revisión manual obligatoria; no vincular automáticamente.';
      } else if (allCandidates.length === 1) {
        decision = 'link';
        linkedProfileRef = profileRef(allCandidates[0]);
        reason =
          'No existe vínculo directo, pero Steam o Player ID apuntan a un único perfil.';
        recommendedAction =
          'Proponer el vínculo en una migración simulada y confirmar manualmente.';
      } else if (likelyTestAccount && !hasCredential) {
        decision = 'archive';
        reason =
          'No tiene perfil, no tiene credencial y presenta señales de cuenta de prueba.';
        recommendedAction =
          'Archivar después de una revisión manual mínima.';
      } else {
        decision = 'review';
        reason =
          'La cuenta no tiene perfil candidato verificable.';
        recommendedAction =
          'Comprobar si es una cuenta comunitaria, administrativa, duplicada o sin actividad deportiva.';
      }

      reportItems.push({
        userRef: maskRef(userId),
        decision,
        reason,
        linkedProfileRef,
        candidateProfileRefs: allCandidates.map(profileRef),
        directProfileLink,
        hasEmail,
        hasCredential,
        credentialScheme,
        hasSteamIdentity: Boolean(steam),
        hasPlayerId: Boolean(player),
        likelyTestAccount,
        hasRoleMetadata: Boolean(normalize(user.roleValue)),
        hasStatusMetadata: Boolean(normalize(user.statusValue)),
        hasCreationDate: Boolean(normalize(user.createdAtValue)),
        hasLastLoginDate: Boolean(normalize(user.lastLoginValue)),
        recommendedAction
      });
    }

    stage = 'classify-unlinked-profiles';

    const linkedProfileIds = new Set(
      profiles
        .filter((profile) => Boolean(normalize(profile.linkedUserId)))
        .map((profile) => String(profile.entityId))
    );

    const unlinkedProfiles = profiles
      .filter((profile) => !linkedProfileIds.has(String(profile.entityId)))
      .map((profile) => {
        const profileId = String(profile.entityId);
        const steam = normalizeKey(profile.steamIdentity);
        const player = normalizeKey(profile.playerId);

        const candidateUsers = [
          ...new Set([
            ...(steam ? usersBySteam.get(steam) ?? [] : []),
            ...(player ? usersByPlayer.get(player) ?? [] : [])
          ])
        ];

        return {
          profileRef: profileRef(profileId),
          hasSteamIdentity: Boolean(steam),
          hasPlayerId: Boolean(player),
          candidateUserRefs: [...candidateUsers].map(maskRef),
          recommendation:
            candidateUsers.size === 1
              ? 'Existe una única cuenta candidata; revisar y preparar vínculo.'
              : candidateUsers.size > 1
                ? 'Hay varias cuentas candidatas; revisión manual obligatoria.'
                : 'No hay cuenta candidata; permitir reclamación verificada mediante Steam.'
        };
      });

    stage = 'build-report';

    const summary = {
      users: reportItems.length,
      profiles: profiles.length,
      keep: reportItems.filter((item) => item.decision === 'keep').length,
      link: reportItems.filter((item) => item.decision === 'link').length,
      review: reportItems.filter((item) => item.decision === 'review').length,
      archive: reportItems.filter((item) => item.decision === 'archive').length,
      profilesWithoutUser: unlinkedProfiles.length,
      credentialsDetected: reportItems.filter((item) => item.hasCredential).length,
      knownCredentialSchemes: reportItems.filter(
        (item) =>
          item.hasCredential &&
          item.credentialScheme !== 'unknown'
      ).length,
      unknownCredentialSchemes: reportItems.filter(
        (item) => item.credentialScheme === 'unknown'
      ).length,
      likelyTestAccounts: reportItems.filter(
        (item) => item.likelyTestAccount
      ).length,
      safeToApply: false as const
    };

    const blockers: string[] = [];

    if (summary.review > 0) {
      blockers.push(
        `${summary.review} cuenta(s) requieren revisión manual.`
      );
    }

    if (summary.unknownCredentialSchemes > 0) {
      blockers.push(
        `${summary.unknownCredentialSchemes} cuenta(s) usan un esquema de credencial no identificado.`
      );
    }

    if (summary.profilesWithoutUser > 0) {
      blockers.push(
        `${summary.profilesWithoutUser} perfil(es) todavía no tienen cuenta vinculada.`
      );
    }

    if (!schema.credentialColumn) {
      blockers.push(
        'No se ha identificado una columna principal de contraseña.'
      );
    }

    blockers.push(
      'No se aplicará ninguna vinculación hasta validar manualmente el dry-run.'
    );

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      detectedSchema: schema,
      summary,
      credentialSchemes,
      users: reportItems,
      unlinkedProfiles,
      blockers,
      nextStep:
        'Validar la clasificación, identificar el algoritmo real de contraseña y preparar una migración transaccional con rollback.'
    };
  } catch (error) {
    if (error instanceof RecoveryDryRunError) {
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
      error instanceof Error ? error.message : 'Unknown dry-run error.';

    throw new RecoveryDryRunError(
      stage,
      'ACCOUNT_RECOVERY_DRY_RUN_FAILED',
      message,
      databaseCode
    );
  }
}
