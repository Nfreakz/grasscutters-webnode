import { expect, test } from '@playwright/test';

test('home pública carga estructura esencial', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1')).toContainText(/competición/i);
  await expect(page.locator('[data-home2-track]')).toBeVisible();
});

test('health endpoint responde sin datos sensibles', async ({ request }) => {
  const response = await request.get('/api/healthz');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  expect(payload.status).toBe('live');
  expect(payload).not.toHaveProperty('environment');
  expect(payload).not.toHaveProperty('secrets');
});

test('navegación por teclado muestra foco', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
});

test('panel Race Control conserva contenido principal', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: /GrassCutters Race Control/i })).toBeAttached();
  await expect(page.getByRole('heading', { name: /Pilotos en pista/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Vueltas del combo/i })).toBeVisible();
});
