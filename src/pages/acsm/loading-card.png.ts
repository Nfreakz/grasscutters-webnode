export const prerender = false;

function getHeaderValue(request: Request, names: string[]): string {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value && value.trim()) return value.split(',')[0].trim();
  }
  return '';
}

function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = getHeaderValue(request, ['x-forwarded-host', 'x-original-host']);
  const host = forwardedHost || getHeaderValue(request, ['host']);
  const forwardedProto = getHeaderValue(request, ['x-forwarded-proto', 'x-forwarded-scheme']) || url.protocol.replace(':', '') || 'https';

  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${forwardedProto}://${host}`;
  }

  const envOrigin =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_API_BASE_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.FRONTEND_URL) ||
    process.env.PUBLIC_API_BASE_URL ||
    process.env.FRONTEND_URL ||
    '';

  if (envOrigin && !String(envOrigin).includes('localhost')) {
    return String(envOrigin).replace(/\/$/, '');
  }

  return url.origin;
}

async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { accept: 'image/svg+xml,text/plain,*/*' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET({ request }: { request: Request }) {
  try {
    const { default: sharp } = await import('sharp');
    const requestUrl = new URL(request.url);
    const origin = getRequestOrigin(request);
    const svgUrl = new URL('/acsm/loading-card.svg', origin);

    // Mantiene el mismo comportamiento si usamos overrides como ?track=mugello&cars=...
    for (const [key, value] of requestUrl.searchParams.entries()) {
      svgUrl.searchParams.set(key, value);
    }
    svgUrl.searchParams.set('pngSource', String(Date.now()));

    const svgResponse = await fetchWithTimeout(svgUrl.toString());
    if (!svgResponse.ok) {
      return new Response(`No se pudo generar SVG base: ${svgResponse.status}`, { status: 502 });
    }

    const svg = await svgResponse.text();
    const png = await sharp(Buffer.from(svg), { density: 144 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    return new Response(`No se pudo generar PNG dinámico: ${message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
