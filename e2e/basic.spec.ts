import { test, expect } from '@playwright/test';

test('app loads sidebar navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.logo')).toHaveText('latte-models');
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('navigation switches pages', async ({ page }) => {
  await page.goto('/');

  // Click benchmark nav
  await page.click('text=性能测试');
  await expect(page.locator('.content')).toContainText('性能测试');

  // Click role chat nav
  await page.click('text=角色问答');
  await expect(page.locator('.content')).toContainText('角色问答');

  // Click config nav
  await page.click('text=配置管理');
  await expect(page.locator('.content')).toContainText('配置管理');
});

test('config page has global and project tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tabs')).toBeVisible();
  await expect(page.locator('text=全局配置')).toBeVisible();
  await expect(page.locator('text=项目配置')).toBeVisible();
});

// ========== API Tests ==========

test('GET /api/config/global returns valid JSON', async ({ request }) => {
  const resp = await request.get('/api/config/global');
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  expect(data).toBeDefined();
});

test('GET /api/config/project returns valid JSON', async ({ request }) => {
  const resp = await request.get('/api/config/project');
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  expect(data).toBeDefined();
});

test('GET /api/chat/roles returns 4 roles', async ({ request }) => {
  const resp = await request.get('/api/chat/roles');
  expect(resp.ok()).toBeTruthy();
  const roles = await resp.json();
  expect(roles).toHaveLength(4);
});

test('GET /api/benchmark/history returns array', async ({ request }) => {
  const resp = await request.get('/api/benchmark/history');
  expect(resp.ok()).toBeTruthy();
  const history = await resp.json();
  expect(Array.isArray(history)).toBe(true);
});

test('config CRUD: add and delete provider', async ({ request }) => {
  const provider = {
    baseURL: 'https://api.test.com',
    authType: 'apiKey',
    models: ['test-model'],
  };

  // Add
  let resp = await request.post('/api/config/global', {
    data: { name: 'e2e-test', provider },
  });
  expect(resp.ok()).toBeTruthy();

  // Verify added
  resp = await request.get('/api/config/global');
  const config = await resp.json();
  expect(config.providers?.['e2e-test']).toBeDefined();

  // Delete
  resp = await request.delete('/api/config/global/e2e-test');
  expect(resp.ok()).toBeTruthy();
});
