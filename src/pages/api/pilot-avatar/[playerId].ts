import type { APIRoute } from 'astro';
import { DEFAULT_PILOT_AVATAR_URL, readAvatarImage } from '../../../lib/pilot-avatars';

export const prerender = false;
export const GET: APIRoute = async ({ params, request }) => {
  const playerId = params.playerId || '';
  const image = readAvatarImage(playerId);

  if (!image) {
    return Response.redirect(new URL(DEFAULT_PILOT_AVATAR_URL, request.url), 302);
  }

  return new Response(image.buffer, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=3600',
      'X-GC-Avatar-Uploaded-At': image.uploadedAt
    }
  });
};
