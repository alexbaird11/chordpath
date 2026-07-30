import { test, expect } from '@playwright/test';

// PR4 — The success moment. Verifies the celebration overlay fires on a correct
// answer, escalates at milestones, and never throws.

test('Fx.success API is exposed', async ({ page }) => {
  await page.goto('/index.html');
  expect(await page.evaluate(() => typeof (window as any).Fx?.success)).toBe('function');
});

test('a correct answer spawns the celebration overlay', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).setLevel(0); (window as any).simulateCorrect(); });
  // badge + xp float appear inside the staff FX layer
  await expect(page.locator('#staffFx .fx-badge')).toHaveCount(1);
  await expect(page.locator('#staffFx .fx-xp')).toContainText('+');
  // the staff card breathes briefly
  expect(await page.evaluate(() => document.querySelector('.staff-card')!.classList.contains('win'))).toBe(true);
});

test('milestone streak uses the gold star badge', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).Fx.success(13, 10));
  const badge = page.locator('#staffFx .fx-badge.milestone');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText('★');
});

test('overlay elements clean themselves up', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).Fx.success(13, 3));
  await page.waitForTimeout(1200);
  await expect(page.locator('#staffFx .fx-badge')).toHaveCount(0);
});

test('no uncaught errors during celebration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).Sfx.setMuted(true); for (let i=0;i<12;i++) (window as any).simulateCorrect(); });
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});
