import type { DriverRatingState, RatingEventResult, RatingsSnapshot, RecalculationLog } from './types';
import { LocalJsonRatingStore } from './localJsonRatingStore';
import { MysqlRatingStore } from './mysqlRatingStore';

export interface RatingStore {
  kind: 'json' | 'mysql';
  load(): Promise<RatingsSnapshot | null>;
  save(snapshot: RatingsSnapshot): Promise<void>;
  append?(payload: {
    snapshot: RatingsSnapshot;
    drivers: DriverRatingState[];
    eventResults: RatingEventResult[];
    recalculationLogs: RecalculationLog[];
  }): Promise<void>;
  /* GC_PHASE4D_SOURCE_ISOLATION_V1 */
  ensureSourceIsolationConstraints?(): Promise<void>;
  diagnostics?(): Promise<Record<string, unknown>>;
}

export function createRatingStore() {
  const driver = String(process.env.APP_STORAGE_DRIVER ?? '').trim().toLowerCase();

  if (driver === 'mysql' || driver === 'mariadb') return new MysqlRatingStore();
  if (driver === 'json' || driver === 'local-json') return new LocalJsonRatingStore();

  const hasMysqlConfig = Boolean(
    (process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim()) &&
    (process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim()) &&
    (process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim())
  );

  if (hasMysqlConfig) return new MysqlRatingStore();

  return new LocalJsonRatingStore();
}
