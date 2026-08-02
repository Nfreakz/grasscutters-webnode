import type { APIRoute } from 'astro';
import { clearSteamSession } from '@/server/auth/steam-session';

export const prerender = false;

export const POST: APIRoute = ({ cookies, redirect, url }) => {
  clearSteamSession(cookies, url);
  return redirect('/perfil/?auth=logged-out', 303);
};

export const GET: APIRoute = ({ redirect }) =>
  redirect('/perfil/', 302);
