import { expect, test, type APIRequestContext } from '@playwright/test';

const PORTIMAO_EVENT_ID = '3cf3c3d8-de34-491d-8ef7-0f9944312c4c';
const ADMIN_READ_ONLY_ENDPOINTS = [
  '/api/gc/ratings/identity-audit',
  '/api/gc/ratings/statistics-invariants',
  '/api/gc/ratings/portimao-sr-freeze-audit'
];

async function expectJson(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.headers()['content-type'] || '').toContain('application/json');
  return { response, payload: await response.json() };
}

function looksLikeDriverRow(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return [
    'driverKey',
    'driver_key',
    'steamGuid',
    'steam_guid',
    'displayName',
    'display_name',
    'srScore',
    'gsrRating'
  ].some((key) => key in row);
}

function findDriverRows(payload: unknown): Record<string, unknown>[] {
  const visited = new Set<object>();
  const candidateArrays: Record<string, unknown>[][] = [];

  function visit(value: unknown, depth = 0) {
    if (depth > 12 || value === null || typeof value !== 'object') return;

    const objectValue = value as object;
    if (visited.has(objectValue)) return;
    visited.add(objectValue);

    if (Array.isArray(value)) {
      const driverRows = value.filter(looksLikeDriverRow);
      if (driverRows.length > 0) candidateArrays.push(driverRows);
      for (const item of value) visit(item, depth + 1);
      return;
    }

    for (const child of Object.values(value as Record<string, unknown>)) {
      visit(child, depth + 1);
    }
  }

  visit(payload);

  candidateArrays.sort((left, right) => right.length - left.length);
  return candidateArrays[0] || [];
}

test.describe('GC Phase 4K — regressió funcional 4A–4J', () => {
  test('health continua viu i no exposa secrets', async ({ request }) => {
    const { response, payload } = await expectJson(request, '/api/healthz');
    expect(response.ok()).toBeTruthy();
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('live');
    expect(payload).not.toHaveProperty('environment');
    expect(payload).not.toHaveProperty('secrets');
    expect(JSON.stringify(payload)).not.toMatch(/password|cron.?secret|session.?secret/i);
  });

  test('diagnòstic públic de ratings respon amb estructura vàlida', async ({ request }) => {
    const { response, payload } = await expectJson(request, '/api/gc/ratings/diagnostics');
    expect(response.ok()).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('secret');
  });

  test('leaderboard no conté identitats duplicades exactes', async ({ request }) => {
    const { response, payload } = await expectJson(request, '/api/gc/ratings/leaderboard');
    expect(response.ok()).toBeTruthy();

    const rows = findDriverRows(payload);
    expect(rows.length).toBeGreaterThan(0);

    const keys = rows
      .map((row) => String(
        row.driverKey || row.driver_key || row.steamGuid ||
        row.steam_guid || row.id || ''
      ).trim().toLowerCase())
      .filter(Boolean);

    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('weekly i GT4 mantenen ownership de font explícit', async ({ request }) => {
    for (const source of ['weekly', 'gt4']) {
      const { response, payload } = await expectJson(
        request,
        `/api/gc/ratings/championship?source=${source}`
      );
      expect(response.ok()).toBeTruthy();
      expect(payload).toBeTruthy();

      const serialized = JSON.stringify(payload).toLowerCase();
      expect(serialized).not.toContain('invalid_event_source');
      expect(serialized).not.toContain('ambiguous_event_source');
    }
  });

  test('una font d’esdeveniment desconeguda queda bloquejada', async ({ request }) => {
    const { response, payload } = await expectJson(
      request,
      `/api/gc/ratings/event/${PORTIMAO_EVENT_ID}?source=font-inexistent`
    );

    expect(response.status()).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe('INVALID_EVENT_SOURCE');
    expect(payload.allowedSources).toEqual(expect.arrayContaining(['weekly', 'gt4']));
  });

  test('Portimão només es resol des de la font weekly', async ({ request }) => {
    const weekly = await expectJson(
      request,
      `/api/gc/ratings/event/${PORTIMAO_EVENT_ID}?source=weekly`
    );
    expect(weekly.response.ok()).toBeTruthy();
    expect(weekly.payload.ok).not.toBe(false);

    const gt4 = await expectJson(
      request,
      `/api/gc/ratings/event/${PORTIMAO_EVENT_ID}?source=gt4`
    );
    expect([400, 404]).toContain(gt4.response.status());
    expect(gt4.payload.ok).toBe(false);
  });

  test('els auditors administratius continuen protegits sense sessió', async ({ request }) => {
    for (const endpoint of ADMIN_READ_ONLY_ENDPOINTS) {
      const { response, payload } = await expectJson(request, endpoint);
      expect(response.status()).toBe(403);
      expect(payload.ok).toBe(false);
      expect(String(payload.message || '')).toMatch(/admin/i);
    }
  });

  test('cap prova de regressió activa processament o escriptures', async ({ request }) => {
    const { response, payload } = await expectJson(
      request,
      '/api/gc/ratings/championship?source=weekly&process=0&refresh=0'
    );

    expect(response.ok()).toBeTruthy();
    expect(payload.processRequested).toBe(false);
    expect(payload.adminRefresh).toBe(false);
  });

  test('les pàgines públiques principals continuen carregant', async ({ page }) => {
    for (const path of ['/', '/hotlaps', '/campeonato']) {
      await page.goto(path);
      const mains = page.locator('main');
      expect(await mains.count()).toBeGreaterThan(0);
      await expect(mains.first()).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
    }
  });

  test('la ronda de Portimão carrega amb font estricta', async ({ page }) => {
    await page.goto(`/campeonato/ronda/${PORTIMAO_EVENT_ID}?source=weekly`);
    const mains = page.locator('main');
    expect(await mains.count()).toBeGreaterThan(0);
    await expect(mains.first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Evento no encontrado|Internal Server Error/i);
  });
});
