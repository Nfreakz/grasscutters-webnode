import type { APIRoute } from 'astro';

import { loadSteamAccountContext } from '@/server/auth/steam-account-context';
import {
  isSteamAuthConfigured,
  maskSteamId
} from '@/server/auth/steam-session';
import { isSteamPersistenceReady } from '@/server/database/steam-user-repository';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const context = await loadSteamAccountContext(cookies);
  const account = context.account;

  return new Response(JSON.stringify({
    ok: true,
    configured: isSteamAuthConfigured(),
    persistenceReady: isSteamPersistenceReady(),
    authenticated: context.authenticated,
    databaseAvailable: context.databaseAvailable,
    user: account && context.session
      ? {
          id: account.id,
          displayName: account.linkedDisplayName ?? account.displayName,
          avatarUrl: account.avatarUrl,
          steamIdMasked: maskSteamId(account.steamId64),
          role: account.role,
          linkedProfileId: account.linkedProfileId,
          linkedDisplayName: account.linkedDisplayName,
          expiresAt: new Date(
            context.session.expiresAt * 1000
          ).toISOString()
        }
      : null,
    generatedAt: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};
