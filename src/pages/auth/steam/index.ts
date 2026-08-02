import type { APIRoute } from 'astro';
import {
  createSteamNonce,
  getPublicSiteUrl,
  isSteamAuthConfigured
} from '@/server/auth/steam-session';
import { buildSteamLoginUrl } from '@/server/auth/steam-openid';
import { isSteamPersistenceReady } from '@/server/database/steam-user-repository';

export const prerender = false;

export const GET: APIRoute = ({ cookies, redirect, url }) => {
  if (!isSteamAuthConfigured()) {
    return redirect('/perfil/?auth=not-configured', 302);
  }

  if (!isSteamPersistenceReady()) {
    return redirect('/perfil/?auth=persistence-disabled', 302);
  }

  const origin = getPublicSiteUrl(url);
  const nonce = createSteamNonce(cookies, url);
  const callback = `${origin}/auth/steam/callback/?state=${encodeURIComponent(nonce)}`;

  const loginUrl = buildSteamLoginUrl({
    realm: `${origin}/`,
    returnTo: callback
  });

  return redirect(loginUrl, 302);
};
