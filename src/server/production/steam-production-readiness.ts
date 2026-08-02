import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface CountRow extends RowDataPacket {
  value: number | string | null;
}

interface TableRow extends RowDataPacket {
  tableName: string;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number | string;
  sequence: number | string;
  columnName: string;
}

function readRaw(...names: string[]): string {
  for (const name of names) {
    const viteValue = import.meta.env[name];
    const processValue = process.env[name];
    const value = String(viteValue ?? processValue ?? '').trim();

    if (value) return value;
  }

  return '';
}

function readBoolean(names: string[], fallback = false): boolean {
  const value = readRaw(...names).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inspectPublicSiteUrl(value: string) {
  if (!value) {
    return {
      configured: false,
      validUrl: false,
      https: false,
      originOnly: false,
      normalizedOrigin: null as string | null,
      callbackUrl: null as string | null,
      loginUrl: null as string | null,
      logoutUrl: null as string | null
    };
  }

  try {
    const parsed = new URL(value);
    const originOnly =
      (parsed.pathname === '/' || parsed.pathname === '') &&
      !parsed.search &&
      !parsed.hash;

    return {
      configured: true,
      validUrl: true,
      https: parsed.protocol === 'https:',
      originOnly,
      normalizedOrigin: parsed.origin,
      callbackUrl: `${parsed.origin}/auth/steam/callback/`,
      loginUrl: `${parsed.origin}/auth/steam/`,
      logoutUrl: `${parsed.origin}/auth/logout/`
    };
  } catch {
    return {
      configured: true,
      validUrl: false,
      https: false,
      originOnly: false,
      normalizedOrigin: null,
      callbackUrl: null,
      loginUrl: null,
      logoutUrl: null
    };
  }
}

export async function inspectSteamProductionReadiness() {
  const publicSiteUrl = readRaw('PUBLIC_SITE_URL');
  const authSessionSecret = readRaw('AUTH_SESSION_SECRET');
  const persistenceEnabled = readBoolean(
    ['STEAM_AUTH_PERSISTENCE_ENABLED'],
    false
  );
  const manualClaimEnabled = readBoolean(
    ['STEAM_PROFILE_CLAIM_ENABLED'],
    false
  );

  const site = inspectPublicSiteUrl(publicSiteUrl);

  const checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    required: boolean;
    detail: string;
  }> = [
    {
      id: 'app-environment',
      label: 'APP_ENV=production',
      ok: runtimeConfig.appEnvironment === 'production',
      required: true,
      detail: `Valor actual: ${runtimeConfig.appEnvironment}`
    },
    {
      id: 'node-environment',
      label: 'NODE_ENV=production',
      ok: runtimeConfig.nodeEnvironment === 'production',
      required: true,
      detail: `Valor actual: ${runtimeConfig.nodeEnvironment}`
    },
    {
      id: 'public-site-url',
      label: 'PUBLIC_SITE_URL válida',
      ok: site.validUrl && site.originOnly,
      required: true,
      detail: site.normalizedOrigin ?? 'No configurada o no válida'
    },
    {
      id: 'public-site-https',
      label: 'PUBLIC_SITE_URL usa HTTPS',
      ok: site.https,
      required: true,
      detail: site.https
        ? 'La cookie de sesión podrá marcarse Secure.'
        : 'Producción debe utilizar https://'
    },
    {
      id: 'auth-secret',
      label: 'AUTH_SESSION_SECRET robusto',
      ok: authSessionSecret.length >= 48,
      required: true,
      detail: authSessionSecret
        ? `${authSessionSecret.length} caracteres configurados; el valor no se expone.`
        : 'No configurado.'
    },
    {
      id: 'steam-persistence',
      label: 'Persistencia Steam activada',
      ok: persistenceEnabled,
      required: true,
      detail: `STEAM_AUTH_PERSISTENCE_ENABLED=${persistenceEnabled}`
    },
    {
      id: 'general-writes-disabled',
      label: 'Escrituras administrativas bloqueadas',
      ok: !runtimeConfig.database.writeEnabled,
      required: true,
      detail: `MYSQL_WRITE_ENABLED=${runtimeConfig.database.writeEnabled}`
    },
    {
      id: 'manual-claim-disabled',
      label: 'Reclamación manual bloqueada',
      ok: !manualClaimEnabled,
      required: true,
      detail: `STEAM_PROFILE_CLAIM_ENABLED=${manualClaimEnabled}`
    },
    {
      id: 'database-configured',
      label: 'Base de datos configurada',
      ok: runtimeConfig.databaseConfigured,
      required: true,
      detail: runtimeConfig.databaseConfigured
        ? 'Credenciales presentes; no se exponen.'
        : 'Faltan variables MySQL.'
    }
  ];

  let database = {
    reachable: false,
    steamUsersTable: false,
    driverIdentitiesTable: false,
    uniqueSteamId: false,
    uniqueProfileOwner: false,
    duplicateSteamIds: 0,
    duplicateProfileOwners: 0,
    steamUsers: 0,
    linkedProfiles: 0
  };

  let databaseDiagnostic: string | null = null;

  if (runtimeConfig.databaseConfigured) {
    try {
      const pool = getDatabasePool();

      const [tableRows] = await pool.query<TableRow[]>(`
        SELECT TABLE_NAME AS tableName
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'gc_steam_users',
            'gc_driver_identities'
          )
      `);

      const tables = new Set(
        tableRows.map((row) => row.tableName)
      );

      const [indexRows] = await pool.query<IndexRow[]>(`
        SELECT
          INDEX_NAME AS indexName,
          NON_UNIQUE AS nonUnique,
          SEQ_IN_INDEX AS sequence,
          COLUMN_NAME AS columnName
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'gc_steam_users',
            'gc_driver_identities'
          )
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `);

      const uniqueSteamId = indexRows.some(
        (row) =>
          row.indexName === 'uq_gc_steam_users_steam_id64' &&
          Number(row.nonUnique) === 0 &&
          Number(row.sequence) === 1 &&
          row.columnName === 'steam_id64'
      );

      const uniqueProfileOwner = indexRows.some(
        (row) =>
          row.indexName ===
            'uq_gc_driver_identities_profile_owner' &&
          Number(row.nonUnique) === 0 &&
          Number(row.sequence) === 1 &&
          row.columnName === 'driver_profile_id'
      );

      const [duplicateSteamRows] =
        await pool.query<CountRow[]>(`
          SELECT COUNT(*) AS value
          FROM (
            SELECT steam_id64
            FROM gc_steam_users
            GROUP BY steam_id64
            HAVING COUNT(*) > 1
          ) duplicate_steam
        `);

      const [duplicateProfileRows] =
        await pool.query<CountRow[]>(`
          SELECT COUNT(*) AS value
          FROM (
            SELECT driver_profile_id
            FROM gc_driver_identities
            WHERE driver_profile_id IS NOT NULL
              AND verification_status = 'verified'
            GROUP BY driver_profile_id
            HAVING COUNT(DISTINCT steam_user_id) > 1
          ) duplicate_profiles
        `);

      const [steamUserRows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_steam_users
      `);

      const [linkedRows] = await pool.query<CountRow[]>(`
        SELECT COUNT(*) AS value
        FROM gc_driver_identities
        WHERE driver_profile_id IS NOT NULL
          AND verification_status = 'verified'
      `);

      database = {
        reachable: true,
        steamUsersTable: tables.has('gc_steam_users'),
        driverIdentitiesTable:
          tables.has('gc_driver_identities'),
        uniqueSteamId,
        uniqueProfileOwner,
        duplicateSteamIds: num(duplicateSteamRows[0]?.value),
        duplicateProfileOwners:
          num(duplicateProfileRows[0]?.value),
        steamUsers: num(steamUserRows[0]?.value),
        linkedProfiles: num(linkedRows[0]?.value)
      };
    } catch (error) {
      databaseDiagnostic =
        error instanceof Error
          ? error.message.slice(0, 240)
          : 'Unknown database error.';
    }
  }

  checks.push(
    {
      id: 'database-reachable',
      label: 'Base de datos accesible',
      ok: database.reachable,
      required: true,
      detail: database.reachable
        ? runtimeConfig.database.name
        : databaseDiagnostic ?? 'No comprobada.'
    },
    {
      id: 'steam-tables',
      label: 'Tablas Steam instaladas',
      ok:
        database.steamUsersTable &&
        database.driverIdentitiesTable,
      required: true,
      detail:
        `gc_steam_users=${database.steamUsersTable}, ` +
        `gc_driver_identities=${database.driverIdentitiesTable}`
    },
    {
      id: 'unique-steam-id',
      label: 'SteamID64 único en base',
      ok:
        database.uniqueSteamId &&
        database.duplicateSteamIds === 0,
      required: true,
      detail:
        `índice=${database.uniqueSteamId}, ` +
        `duplicados=${database.duplicateSteamIds}`
    },
    {
      id: 'unique-profile-owner',
      label: 'Perfil con propietario único',
      ok:
        database.uniqueProfileOwner &&
        database.duplicateProfileOwners === 0,
      required: true,
      detail:
        `índice=${database.uniqueProfileOwner}, ` +
        `duplicados=${database.duplicateProfileOwners}`
    }
  );

  const blockingChecks = checks.filter(
    (check) => check.required && !check.ok
  );

  const readyForProduction =
    blockingChecks.length === 0;

  return {
    ok: true,
    readOnly: true,
    writesAvailable: false,
    secretsExposed: false,
    generatedAt: new Date().toISOString(),
    summary: {
      readyForProduction,
      passedChecks: checks.filter((check) => check.ok).length,
      totalChecks: checks.length,
      blockers: blockingChecks.length,
      steamUsers: database.steamUsers,
      linkedProfiles: database.linkedProfiles
    },
    currentEnvironment: {
      appEnvironment: runtimeConfig.appEnvironment,
      nodeEnvironment: runtimeConfig.nodeEnvironment,
      publicSiteOrigin: site.normalizedOrigin,
      databaseName: runtimeConfig.database.name || null,
      databaseSslMode: runtimeConfig.database.sslMode
    },
    endpoints: {
      login: site.loginUrl,
      callback: site.callbackUrl,
      logout: site.logoutUrl,
      profile: site.normalizedOrigin
        ? `${site.normalizedOrigin}/perfil/`
        : null,
      session: site.normalizedOrigin
        ? `${site.normalizedOrigin}/api/v2/auth/session/`
        : null
    },
    cookiePolicy: {
      name: 'gc_steam_session',
      httpOnly: true,
      sameSite: 'lax',
      secureInProduction: true,
      maxAgeDays: 14
    },
    database,
    checks,
    blockers: blockingChecks.map((check) => ({
      id: check.id,
      label: check.label,
      detail: check.detail
    })),
    productionVariables: {
      APP_ENV: 'production',
      NODE_ENV: 'production',
      PUBLIC_SITE_URL: 'https://TU-DOMINIO',
      AUTH_SESSION_SECRET: 'secreto aleatorio de 48+ caracteres',
      STEAM_AUTH_PERSISTENCE_ENABLED: 'true',
      STEAM_PROFILE_CLAIM_ENABLED: 'false',
      MYSQL_WRITE_ENABLED: 'false'
    },
    nextStep: readyForProduction
      ? 'Desplegar el build y realizar una prueba controlada del login Steam en HTTPS.'
      : 'Resolver los bloqueos indicados antes de habilitar el login Steam público.'
  };
}
