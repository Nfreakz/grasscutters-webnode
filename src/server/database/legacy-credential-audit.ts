import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface ColumnRow extends RowDataPacket {
  columnName: string;
  dataType: string;
}

interface CredentialRow extends RowDataPacket {
  algorithmValue: string | null;
  hashValue: string | null;
  saltValue: string | null;
  resetValue: string | null;
}

type Scheme =
  | 'bcrypt'
  | 'argon2'
  | 'pbkdf2'
  | 'scrypt'
  | 'phpass'
  | 'sha512'
  | 'sha256'
  | 'sha1'
  | 'md5'
  | 'plain-or-custom'
  | 'unknown'
  | 'none';

function quote(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

function normalize(value: unknown): string | null {
  const result = String(value ?? '').trim();
  return result ? result : null;
}

function choose(columns: Set<string>, names: string[]): string | null {
  return names.find((name) => columns.has(name)) ?? null;
}

function select(column: string | null, alias: string): string {
  return column ? `CAST(${quote(column)} AS CHAR) AS ${alias}` : `NULL AS ${alias}`;
}

function detectScheme(hash: string | null, algorithm: string | null): Scheme {
  const algo = normalize(algorithm)?.toLowerCase() ?? '';
  const value = normalize(hash);

  if (algo.includes('bcrypt')) return 'bcrypt';
  if (algo.includes('argon')) return 'argon2';
  if (algo.includes('pbkdf2')) return 'pbkdf2';
  if (algo.includes('scrypt')) return 'scrypt';
  if (algo.includes('phpass')) return 'phpass';
  if (algo.includes('sha512')) return 'sha512';
  if (algo.includes('sha256')) return 'sha256';
  if (algo.includes('sha1')) return 'sha1';
  if (algo.includes('md5')) return 'md5';

  if (!value) return 'none';
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)) return 'bcrypt';
  if (/^\$argon2(id|i|d)\$/i.test(value)) return 'argon2';
  if (/^pbkdf2[:$]/i.test(value) || /^\$pbkdf2-/i.test(value)) return 'pbkdf2';
  if (/^scrypt[:$]/i.test(value) || /^\$scrypt\$/i.test(value)) return 'scrypt';
  if (/^\$P\$|^\$H\$/.test(value)) return 'phpass';
  if (/^[a-f0-9]{128}$/i.test(value)) return 'sha512';
  if (/^[a-f0-9]{64}$/i.test(value)) return 'sha256';
  if (/^[a-f0-9]{40}$/i.test(value)) return 'sha1';
  if (/^[a-f0-9]{32}$/i.test(value)) return 'md5';
  if (value.length > 0 && value.length < 32) return 'plain-or-custom';

  return 'unknown';
}

export class CredentialAuditError extends Error {
  constructor(
    public readonly stage: string,
    public readonly errorCode: string,
    message: string,
    public readonly databaseCode: string | null = null
  ) {
    super(message);
  }
}

export async function auditLegacyCredentials() {
  let stage = 'configuration';

  try {
    if (!runtimeConfig.databaseConfigured) {
      throw new CredentialAuditError(stage, 'DATABASE_NOT_CONFIGURED', 'Database is not configured.');
    }

    const pool = getDatabasePool();

    stage = 'schema-columns';

    const [columnRows] = await pool.query<ColumnRow[]>(`
      SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'gc_users'
      ORDER BY ORDINAL_POSITION
    `);

    const columns = new Set(columnRows.map((row) => row.columnName));

    const algorithmColumn =
      choose(columns, ['password_algorithm', 'password_algo', 'credential_algorithm', 'hash_algorithm', 'algorithm']) ??
      columnRows.find((row) => /algorithm|algo|scheme/i.test(row.columnName))?.columnName ??
      null;

    const hashColumn =
      choose(columns, ['password_hash', 'passwd_hash', 'credential_hash', 'password', 'passwd', 'hash']) ??
      columnRows.find((row) => {
        const name = row.columnName.toLowerCase();
        return (
          !/algorithm|algo|scheme|salt|reset|token|session/i.test(name) &&
          (name === 'password' || name === 'passwd' || name === 'hash' || name.endsWith('_hash'))
        );
      })?.columnName ??
      null;

    const saltColumn =
      choose(columns, ['password_salt', 'credential_salt', 'salt']) ??
      columnRows.find((row) => /salt|pepper/i.test(row.columnName))?.columnName ??
      null;

    const resetColumn =
      choose(columns, ['password_reset_token', 'reset_token', 'recovery_token', 'forgot_token']) ??
      columnRows.find((row) => /reset|recovery|forgot/i.test(row.columnName))?.columnName ??
      null;

    stage = 'load-metadata';

    const [rows] = await pool.query<CredentialRow[]>(`
      SELECT
        ${select(algorithmColumn, 'algorithmValue')},
        ${select(hashColumn, 'hashValue')},
        ${select(saltColumn, 'saltValue')},
        ${select(resetColumn, 'resetValue')}
      FROM gc_users
    `);

    stage = 'analyze';

    const schemes: Record<Scheme, number> = {
      bcrypt: 0,
      argon2: 0,
      pbkdf2: 0,
      scrypt: 0,
      phpass: 0,
      sha512: 0,
      sha256: 0,
      sha1: 0,
      md5: 0,
      'plain-or-custom': 0,
      unknown: 0,
      none: 0
    };

    const algorithmCounts = new Map<string, number>();
    const lengthCounts = new Map<number, number>();

    let usersWithHash = 0;
    let usersWithAlgorithm = 0;
    let usersWithSalt = 0;
    let usersWithResetData = 0;

    for (const row of rows) {
      const hash = normalize(row.hashValue);
      const algorithm = normalize(row.algorithmValue);
      const salt = normalize(row.saltValue);
      const reset = normalize(row.resetValue);

      if (hash) {
        usersWithHash += 1;
        lengthCounts.set(hash.length, (lengthCounts.get(hash.length) ?? 0) + 1);
      }

      if (algorithm) {
        usersWithAlgorithm += 1;
        const key = algorithm.toLowerCase();
        algorithmCounts.set(key, (algorithmCounts.get(key) ?? 0) + 1);
      }

      if (salt) usersWithSalt += 1;
      if (reset) usersWithResetData += 1;

      schemes[detectScheme(hash, algorithm)] += 1;
    }

    const recognized = schemes.bcrypt + schemes.argon2 + schemes.pbkdf2 +
      schemes.scrypt + schemes.phpass + schemes.sha512 + schemes.sha256 +
      schemes.sha1 + schemes.md5;

    const unknown = schemes.unknown + schemes['plain-or-custom'];
    const noHash = schemes.none;

    return {
      ok: true,
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      generatedAt: new Date().toISOString(),
      databaseName: runtimeConfig.database.name,
      detectedSchema: {
        algorithmColumn,
        hashColumn,
        saltColumn,
        resetColumn,
        candidateColumns: columnRows
          .filter((row) => /password|passwd|credential|hash|salt|algorithm|reset|token/i.test(row.columnName))
          .map((row) => ({ column: row.columnName, dataType: row.dataType }))
      },
      summary: {
        users: rows.length,
        usersWithHash,
        usersWithAlgorithm,
        usersWithSalt,
        usersWithResetData,
        usersWithRecognizedScheme: recognized,
        usersWithUnknownScheme: unknown,
        usersWithoutHash: noHash,
        safeToEnableLegacyLogin: false
      },
      schemes,
      algorithmLabels: [...algorithmCounts.entries()].map(([label, users], index) => ({
        labelRef: `algorithm-${index + 1}`,
        users
      })),
      passwordLengths: [...lengthCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([length, users]) => ({ length, users })),
      compatibility: {
        canVerifyWithoutMigration:
          Boolean(hashColumn) && recognized > 0 && unknown === 0 && noHash === 0,
        requiresSaltSupport: usersWithSalt > 0,
        requiresLegacyVerifier:
          schemes.sha512 > 0 || schemes.sha256 > 0 || schemes.sha1 > 0 ||
          schemes.md5 > 0 || schemes.phpass > 0 || unknown > 0,
        recommendation:
          !hashColumn
            ? 'No se ha localizado la columna de hash. Revisar el código antiguo.'
            : unknown > 0
              ? 'Identificar la función de hash del código antiguo antes de implementar compatibilidad.'
              : 'Implementar un verificador compatible y rehashear tras el primer acceso correcto.'
      },
      blockers: [
        ...(!hashColumn ? ['No se ha identificado una columna de hash.'] : []),
        ...(unknown > 0 ? [`${unknown} cuenta(s) usan un formato desconocido o personalizado.`] : []),
        ...(noHash > 0 ? [`${noHash} cuenta(s) no tienen hash utilizable.`] : []),
        ...(usersWithSalt > 0 ? ['Existen salts separados; debe reproducirse exactamente el esquema antiguo.'] : []),
        'No activar el login antiguo hasta validarlo con una cuenta controlada.'
      ],
      nextStep:
        'Localizar la función de autenticación antigua, confirmar el algoritmo con una cuenta controlada y preparar un verificador sin escrituras.'
    };
  } catch (error) {
    if (error instanceof CredentialAuditError) throw error;

    const databaseCode =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null;

    throw new CredentialAuditError(
      stage,
      'CREDENTIAL_AUDIT_FAILED',
      error instanceof Error ? error.message : 'Unknown credential audit error.',
      databaseCode
    );
  }
}
