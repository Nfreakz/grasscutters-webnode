import crypto from 'node:crypto';
import { getAppDb } from '../db/appDb';
import type { DriverProfile } from '../types';

export function createDriverProfile(displayName: string): DriverProfile {
  try {
    const db = getAppDb();
    const id = crypto.randomUUID();

    db.prepare('INSERT INTO drivers (id, display_name) VALUES (?, ?)').run(id, displayName);

    return {
      id,
      displayName
    };
  } catch {
    return {
      id: crypto.randomUUID(),
      displayName
    };
  }
}

export function listDriverProfiles(): DriverProfile[] {
  try {
    const db = getAppDb();

    const rows = db
      .prepare('SELECT id, display_name, steam_guid, discord_id, avatar_url FROM drivers ORDER BY created_at DESC')
      .all() as Array<{
        id: string;
        display_name: string;
        steam_guid?: string;
        discord_id?: string;
        avatar_url?: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      steamGuid: row.steam_guid,
      discordId: row.discord_id,
      avatarUrl: row.avatar_url
    }));
  } catch {
    return [];
  }
}
