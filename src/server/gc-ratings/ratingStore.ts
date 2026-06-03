import type { RatingsSnapshot } from './types';
import { LocalJsonRatingStore } from './localJsonRatingStore';
import { MysqlRatingStore } from './mysqlRatingStore';

export interface RatingStore {
  kind: 'json' | 'mysql';
  load(): Promise<RatingsSnapshot | null>;
  save(snapshot: RatingsSnapshot): Promise<void>;
}

export function createRatingStore() {
  const driver = String(process.env.APP_STORAGE_DRIVER ?? 'json').trim().toLowerCase();
  if (driver === 'mysql' || driver === 'mariadb') return new MysqlRatingStore();
  return new LocalJsonRatingStore();
}

