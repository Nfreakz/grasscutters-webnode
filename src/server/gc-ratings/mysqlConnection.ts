export type MysqlConnectionConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionLimit: number;
};

export function hasMysqlConfig() {
  return Boolean(
    (process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim()) &&
    (process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim()) &&
    (process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim())
  );
}

export function readMysqlConnectionConfig(): MysqlConnectionConfig | null {
  if (!hasMysqlConfig()) return null;
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim() || '',
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim() || '',
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5)
  };
}

export function getMysqlDatabaseName() {
  return process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim() || '';
}
