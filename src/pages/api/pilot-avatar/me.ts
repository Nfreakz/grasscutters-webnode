import type { APIRoute } from 'astro';
import {
  DEFAULT_PILOT_AVATAR_URL,
  deleteAvatarForAuth,
  getAvatarMeta,
  getCurrentAvatarAuth,
  json,
  saveAvatarForAuth
} from '../../../lib/pilot-avatars';

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const auth = await getCurrentAvatarAuth(request);
  if (!auth) {
    return json({ ok: false, authenticated: false, message: 'Login requerido.' }, 401);
  }

  const playerId = auth.user.pilotLink?.playerId ?? null;
  const avatar = playerId ? getAvatarMeta(playerId) : { playerId: null, avatarUrl: DEFAULT_PILOT_AVATAR_URL, isDefault: true, uploadedAt: null };

  return json({
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL,
    ...avatar
  });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await getCurrentAvatarAuth(request);
  if (!auth) return json({ ok: false, authenticated: false, message: 'Login requerido.' }, 401);
  if (!auth.user.pilotLink?.playerId) return json({ ok: false, authenticated: true, linked: false, message: 'Primero vincula tu cuenta con un piloto.' }, 400);

  try {
    const body = await request.json().catch(() => null) as any;
    const result = await saveAvatarForAuth(auth, body?.imageData, body?.fileName);
    return json({ ok: true, authenticated: true, linked: true, ...result });
  } catch (error: any) {
    return json({ ok: false, authenticated: true, linked: true, message: error?.message || 'No se pudo guardar el avatar.' }, 400);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const auth = await getCurrentAvatarAuth(request);
  if (!auth) return json({ ok: false, authenticated: false, message: 'Login requerido.' }, 401);
  if (!auth.user.pilotLink?.playerId) return json({ ok: false, authenticated: true, linked: false, message: 'Primero vincula tu cuenta con un piloto.' }, 400);

  try {
    const result = await deleteAvatarForAuth(auth);
    return json({ ok: true, authenticated: true, linked: true, ...result });
  } catch (error: any) {
    return json({ ok: false, authenticated: true, linked: true, message: error?.message || 'No se pudo restablecer el avatar.' }, 400);
  }
};
