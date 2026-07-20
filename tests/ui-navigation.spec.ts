import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).showTab === 'function');
});

test('tab navigation shows the selected pane', async ({ page }) => {
  await expect(page.locator('#tab-practice')).toBeVisible();

  await page.click('.tab >> text=stats');
  await expect(page.locator('#tab-stats')).toBeVisible();
  await expect(page.locator('#tab-practice')).toBeHidden();

  await page.click('.tab >> text=practice');
  await expect(page.locator('#tab-practice')).toBeVisible();
});

test('keyboard guide toggle hides the piano support strip', async ({ page }) => {
  const wrap = page.locator('.piano-wrap');
  await expect(wrap).toBeVisible();

  await page.uncheck('#chkKeyboardGuide');
  await expect(wrap).toBeHidden();

  await page.check('#chkKeyboardGuide');
  await expect(wrap).toBeVisible();
});

test('hint mode select updates the global hint mode', async ({ page }) => {
  await page.selectOption('#hintModeSel', 'landmarks');
  expect(await page.evaluate(() => hintMode)).toBe('landmarks');

  await page.selectOption('#hintModeSel', 'none');
  expect(await page.evaluate(() => hintMode)).toBe('none');
});

test('forgiving and adaptive toggles flip their global flags', async ({ page }) => {
  await page.check('#chkForgiving');
  expect(await page.evaluate(() => answerMode)).toBe('forgiving');

  await page.check('#chkAdaptive');
  expect(await page.evaluate(() => adaptiveMode)).toBe(true);

  await page.uncheck('#chkForgiving');
  expect(await page.evaluate(() => answerMode)).toBe('strict');
});

test('compact session metrics row exists on the practice tab', async ({ page }) => {
  await expect(page.locator('#mCorrect')).toBeVisible();
  await expect(page.locator('#mAvgTime')).toBeVisible();
  await expect(page.locator('.metrics-row')).toBeVisible();
});

test('notation hint element lives inside the staff card', async ({ page }) => {
  const inside = await page.evaluate(() => {
    const hint = document.getElementById('notationHint');
    return !!hint && !!hint.closest('.staff-card');
  });
  expect(inside).toBe(true);
});

test('saved settings are applied to controls on reload', async ({ page }) => {
  await page.selectOption('#hintModeSel', 'intervals');
  await page.selectOption('#clefSel', 'bass');
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).showTab === 'function');
  await expect(page.locator('#hintModeSel')).toHaveValue('intervals');
  await expect(page.locator('#clefSel')).toHaveValue('bass');
});
