import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('computer keys provide honest, gear-free note input', async ({ page }) => {
  await page.evaluate(() => eval(`targetMidis=[60]; currentEx={type:'single',midis:[60],label:'C4',clef:'treble'}; exerciseStartedAt=performance.now(); habitExerciseCredited=false`));
  await page.keyboard.press('a');
  await expect(page.locator('#statusPill')).toHaveText('correct');
  await expect(page.locator('#dailyGoalCount')).toHaveText('1');
});

test('Cmd/Ctrl+K opens a keyboard-operable command palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#commandPalette')).toBeVisible();
  await page.getByRole('button', { name: /See progress/ }).click();
  await expect(page.locator('#tab-stats')).toHaveClass(/active/);
});

test('focus mode keeps notation and offers an escape route', async ({ page }) => {
  await page.evaluate(() => (window as any).KeyboardPractice.focus(true));
  await expect(page.locator('body')).toHaveClass(/focus-mode/);
  await expect(page.locator('#staffCanvas')).toBeVisible();
  await expect(page.locator('#focusExit')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
});
