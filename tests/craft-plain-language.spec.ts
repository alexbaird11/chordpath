import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('advanced controls use plain, outcome-led labels', async ({ page }) => {
  await expect(page.locator('label', { hasText: 'allow extra notes' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'practice my weak spots' })).toBeVisible();
  await expect(page.locator('#hearAnswerBtn')).toHaveText('hear this');
  await expect(page.locator('#hintModeSel option').first()).toHaveText('show note names');
});

test('glossary explains music terms without leaving practice', async ({ page }) => {
  await page.getByRole('button', { name: 'terms' }).click();
  await expect(page.locator('#glossaryModal')).toBeVisible();
  await expect(page.locator('#glossaryModal')).toContainText('The distance from one note to another');
  await page.getByRole('button', { name: 'got it' }).click();
  await expect(page.locator('#glossaryModal')).toBeHidden();
});

test('adaptive names fade only for mastered non-guidepost notes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const w = window as any;
    for (let i = 0; i < 8; i++) w.Mastery.record([62, 60], true, 700, true);
    return eval(`(function(){ adaptiveMode=true; hintMode='full'; return {
      mastered: shouldShowNoteLabel(62,{clef:'treble'}),
      guidepost: shouldShowNoteLabel(60,{clef:'treble'})
    } })()`);
  });
  expect(result).toEqual({ mastered: false, guidepost: true });
});
