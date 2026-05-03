import { getAppDb } from '../db/appDb';
import type { GcEvent } from '../types';

export function listUpcomingEvents(): GcEvent[] {
  try {
    const db = getAppDb();

    const rows = db
      .prepare('SELECT id, title, description, track, car, starts_at FROM events ORDER BY starts_at ASC LIMIT 20')
      .all() as Array<{
        id: string;
        title: string;
        description?: string;
        track?: string;
        car?: string;
        starts_at?: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      track: row.track,
      car: row.car,
      startsAt: row.starts_at
    }));
  } catch {
    return [];
  }
}
