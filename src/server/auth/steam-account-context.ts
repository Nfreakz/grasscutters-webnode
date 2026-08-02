import type { CookieJar, SteamSession } from '@/server/auth/steam-session';
import { readSteamSession } from '@/server/auth/steam-session';
import {
  findSteamUserAccount,
  type SteamUserAccount
} from '@/server/database/steam-user-repository';

export interface SteamAccountContext {
  session: SteamSession | null;
  account: SteamUserAccount | null;
  authenticated: boolean;
  databaseAvailable: boolean;
}

export async function loadSteamAccountContext(
  cookies: CookieJar
): Promise<SteamAccountContext> {
  const session = readSteamSession(cookies);

  if (!session) {
    return {
      session: null,
      account: null,
      authenticated: false,
      databaseAvailable: true
    };
  }

  try {
    const account = await findSteamUserAccount({
      steamUserId: session.steamUserId,
      steamId64: session.steamId64
    });

    return {
      session,
      account,
      authenticated: Boolean(account),
      databaseAvailable: true
    };
  } catch {
    return {
      session,
      account: null,
      authenticated: false,
      databaseAvailable: false
    };
  }
}
