import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.PUBLIC_SITE_URL || site?.toString() || 'https://grasscuttersracing.com').replace(/\/$/, '');

  return new Response([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /perfil',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
