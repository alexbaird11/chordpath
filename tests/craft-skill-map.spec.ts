import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('genuine answers build per-note mastery and a speed curve', async ({ page }) => {
  await page.evaluate(() => (window as any).Mastery.record([60, 64], true, 1200, true));
  await expect(page.locator('#masteryMap .mastery-note')).toHaveCount(2);
  await expect(page.locator('#speedCurve .speed-point')).toHaveCount(1);
  const state = await page.evaluate(() => (window as any).Mastery.state);
  expect(state.notes.C4.correct).toBe(1);
});

test('simulated answers never change mastery', async ({ page }) => {
  await page.evaluate(() => (window as any).simulateCorrect());
  const state = await page.evaluate(() => (window as any).Mastery.state);
  expect(state.totalCorrect).toBe(0);
  expect(Object.keys(state.notes)).toHaveLength(0);
});

test('milestones and level-up are driven by real correct reads', async ({ page }) => {
  await page.evaluate(() => {
    const m = (window as any).Mastery;
    for (let i = 0; i < 25; i++) m.record([60 + i % 5], true, 900, true);
  });
  await expect(page.locator('#badgeShelf .earned')).toContainText('10 true reads');
  await expect(page.locator('#levelToast')).toContainText('reading level 2');
  const state = await page.evaluate(() => (window as any).Mastery.state);
  expect(state.level).toBe(1);
});
