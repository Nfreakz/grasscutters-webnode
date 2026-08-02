import type { APIRoute } from 'astro';
import {
  consumeSteamNonce,
  getPublicSiteUrl,
  isSteamAuthConfigured,
  writeSteamSession
} from '@/server/auth/steam-session';
import { verifySteamOpenId } from '@/server/auth/steam-openid';
import {
  isSteamPersistenceReady,
  persistSteamLogin,
  SteamUserPersistenceError
} from '@/server/database/steam-user-repository';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  if (!isSteamAuthConfigured()) {
    return redirect('/perfil/?auth=not-configured', 302);
  }

  if (!isSteamPersistenceReady()) {
    return redirect('/perfil/?auth=persistence-disabled', 302);
  }

  const state = url.searchParams.get('state') ?? '';

  if (!consumeSteamNonce(cookies, state, url)) {
    return redirect('/perfil/?auth=invalid-state', 302);
  }

  const origin = getPublicSiteUrl(url);
  const expectedReturnTo =
    `${origin}/auth/steam/callback/?state=${encodeURIComponent(state)}`;

  try {
    const steamId64 = await verifySteamOpenId(url, expectedReturnTo);

    if (!steamId64) {
      return redirect('/perfil/?auth=verification-failed', 302);
    }

    const account = await persistSteamLogin(steamId64);
    writeSteamSession(cookies, account, url);

    return redirect('/perfil/?auth=success', 302);
  } catch (error) {
    if (error instanceof SteamUserPersistenceError) {
      const reason = encodeURIComponent(error.errorCode);
      return redirect(`/perfil/?auth=persistence-error&reason=${reason}`, 302);
    }

    return redirect('/perfil/?auth=provider-error', 302);
  }
};
