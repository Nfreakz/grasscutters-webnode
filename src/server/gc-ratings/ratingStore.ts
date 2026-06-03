import type { RatingsSnapshot } from './types';
import { LocalJsonRatingStore } from './localJsonRatingStore';
import { MysqlRatingStore } from './mysqlRatingStore';

export interface RatingStore {
  kind: 'json' | 'mysql';
  load(): Promise<RatingsSnapshot | null>;
  save(snapshot: RatingsSnapshot): Promise<void>;
}

export function createRatingStore() {
  const driver = String(process.env.APP_STORAGE_DRIVER ?? '').trim().toLowerCase();

  if (driver === 'mysql' || driver === 'mariadb') return new MysqlRatingStore();
  if (driver === 'json' || driver === 'local-json') return new LocalJsonRatingStore();

  const hasMysqlConfig = Boolean(
    process.env.MYSQL_HOST?.trim() &&
    process.env.MYSQL_DATABASE?.trim() &&
    process.env.MYSQL_USER?.trim()
  );

  if (hasMysqlConfig) return new MysqlRatingStore();

  return new LocalJsonRatingStore();
}
