import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('coach begins with low-pressure guidance', async ({ page }) => {
  await expect(page.locator('#coachTitle')).toHaveText('A calm place to begin');
  await expect(page.locator('#coachMessage')).toContainText('Nothing here is timed against you');
});

test('coach adds support after a difficult run without punitive language', async ({ page }) => {
  const advice = await page.evaluate(() => {
    const m = (window as any).Mastery;
    for (let i = 0; i < 6; i++) m.record([62], i === 0, 2600, true);
    return (window as any).Coach.advice();
  });
  expect(advice.kind).toBe('support');
  await expect(page.locator('#coachTitle')).toContainText('lighter');
  await expect(page.locator('#coachMessage')).not.toContainText(/wrong|failed|bad/i);
  await page.locator('#coachAction').click();
  const settings = await page.evaluate(() => eval(`({hintMode,adaptiveMode,level})`));
  expect(settings.hintMode).toBe('full');
  expect(settings.adaptiveMode).toBe(true);
});

test('coach offers one bounded stretch after sustained success', async ({ page }) => {
  const advice = await page.evaluate(() => {
    const m = (window as any).Mastery;
    for (let i = 0; i < 9; i++) m.record([60 + i % 3], true, 850, true);
    return (window as any).Coach.advice();
  });
  expect(advice.kind).toBe('stretch');
  expect(advice.level).toBe(1);
  await expect(page.locator('#coachAction')).toHaveText('try the stretch');
});
