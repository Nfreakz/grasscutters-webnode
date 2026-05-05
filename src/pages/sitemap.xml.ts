import type { APIRoute } from 'astro';

const publicRoutes = [
  '/',
  '/comunidad',
  '/discord',
  '/app-android',
  '/estado',
  '/datos',
  '/normas',
  '/privacidad',
  '/login',
  '/app',
  '/hotlaps',
  '/combos',
  '/pilotos',
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.PUBLIC_SITE_URL || site?.toString() || 'https://grasscuttersracing.com').replace(/\/$/, '');
  const now = new Date().toISOString();
  const urls = publicRoutes.map((route) => {
    const loc = route === '/' ? base : `${base}${route}`;
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${now}</lastmod>\n  </url>`;
  }).join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
