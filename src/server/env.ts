export type AppEnvironment = 'local' | 'staging' | 'production';
export type DatabaseSslMode = 'disabled' | 'preferred' | 'required';

function readRaw(...names: string[]): string {
  for (const name of names) {
    const viteValue = import.meta.env[name];
    const processValue = process.env[name];
    const value = String(viteValue ?? processValue ?? '').trim();

    if (value) {
      return value;
    }
  }

  return '';
}

function readAppEnvironment(): AppEnvironment {
  const value = readRaw('APP_ENV');

  if (value === 'staging' || value === 'production') {
    return value;
  }

  return 'local';
}

function readBoolean(
  names: string[],
  fallback = false
): boolean {
  const value = readRaw(...names).toLowerCase();

  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value);
}

function readInteger(
  names: string[],
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(readRaw(...names), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function readSslMode(): DatabaseSslMode {
  const value = readRaw('MYSQL_SSL_MODE', 'DB_SSL_MODE').toLowerCase();

  if (value === 'preferred' || value === 'required') {
    return value;
  }

  return 'disabled';
}

const database = Object.freeze({
  host: readRaw('MYSQL_HOST', 'DB_HOST'),
  port: readInteger(['MYSQL_PORT', 'DB_PORT'], 3306, 1, 65535),
  name: readRaw('MYSQL_DATABASE', 'DB_NAME'),
  user: readRaw('MYSQL_USER', 'DB_USER'),
  password: readRaw('MYSQL_PASSWORD', 'DB_PASSWORD'),
  writeEnabled: readBoolean(
    ['MYSQL_WRITE_ENABLED', 'DB_WRITE_ENABLED'],
    false
  ),
  steamAuthPersistenceEnabled: readBoolean(
    ['STEAM_AUTH_PERSISTENCE_ENABLED'],
    false
  ),
  steamProfileClaimEnabled: readBoolean(
    ['STEAM_PROFILE_CLAIM_ENABLED'],
    false
  ),
  connectionLimit: readInteger(
    ['MYSQL_CONNECTION_LIMIT', 'DB_CONNECTION_LIMIT'],
    4,
    1,
    20
  ),
  connectTimeoutMs: readInteger(
    ['MYSQL_CONNECT_TIMEOUT_MS', 'DB_CONNECT_TIMEOUT_MS'],
    5000,
    1000,
    30000
  ),
  idleTimeoutMs: readInteger(
    ['MYSQL_IDLE_TIMEOUT_MS', 'DB_IDLE_TIMEOUT_MS'],
    60000,
    10000,
    600000
  ),
  sslMode: readSslMode()
});

export const runtimeConfig = Object.freeze({
  appEnvironment: readAppEnvironment(),
  nodeEnvironment: readRaw('NODE_ENV') || 'development',
  publicSiteUrl: readRaw('PUBLIC_SITE_URL'),
  database,
  databaseConfigured: Boolean(
    database.host &&
    database.name &&
    database.user &&
    database.password
  )
});
