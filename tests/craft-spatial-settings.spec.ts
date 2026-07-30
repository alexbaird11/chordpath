import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('tabs enter from the direction of travel', async ({ page }) => {
  await page.getByRole('button', { name: 'stats' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tab-direction', 'forward');
  await page.getByRole('button', { name: 'practice' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tab-direction', 'back');
  const animation = await page.locator('#tab-practice').evaluate(el => getComputedStyle(el).animationName);
  expect(animation).toContain('tab-enter-back');
});

test('settings preview live and cancel rolls back', async ({ page }) => {
  await page.getByRole('button', { name: 'settings' }).click();
  await page.locator('#themeSetting').selectOption('dark');
  await page.locator('#textSetting').selectOption('large');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
  await page.getByRole('button', { name: 'cancel' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'default');
});

test('saved appearance persists across reload', async ({ page }) => {
  await page.getByRole('button', { name: 'settings' }).click();
  await page.locator('#themeSetting').selectOption('light');
  await page.getByRole('button', { name: 'save' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chordpath.appearance.v1') || '{}'));
  expect(stored.theme).toBe('light');
});
