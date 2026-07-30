import { test, expect } from '@playwright/test';

// PR14 — Command palette (⌘K), keyboard-first flow, and focus mode.

test('Ctrl+K opens the palette and Escape closes it', async ({ page }) => {
  await page.goto('/index.html');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#paletteOverlay')).toBeVisible();
  await expect(page.locator('#paletteInput')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#paletteOverlay')).toBeHidden();
});

test('typing filters commands', async ({ page }) => {
  await page.goto('/index.html');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('stats');
  const items = page.locator('.palette-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Go to Stats');
});

test('running a command navigates (keyboard end-to-end)', async ({ page }) => {
  await page.goto('/index.html');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('editor');
  await page.keyboard.press('Enter');
  await expect(page.locator('#paletteOverlay')).toBeHidden();
  await expect(page.locator('#tab-editor')).toHaveClass(/active/);
});

test('a command can change the level', async ({ page }) => {
  await page.goto('/index.html');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('level 3');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (0, eval)('level'))).toBe(2); // "Level 3" → index 2 (triads)
  await expect(page.locator('#levelSel')).toHaveValue('2');
});

test('focus mode fades the chrome and Escape exits it', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).Palette.setFocusMode(true));
  expect(await page.evaluate(() => document.body.classList.contains('focus-mode'))).toBe(true);
  await expect(page.locator('.tab-bar')).toBeHidden();
  await expect(page.locator('#focusExit')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.body.classList.contains('focus-mode'))).toBe(false);
  await expect(page.locator('.tab-bar')).toBeVisible();
});

test('ArrowRight advances the drill on the practice tab', async ({ page }) => {
  await page.goto('/index.html');
  const before = await page.evaluate(() => (0, eval)('JSON.stringify(targetMidis)'));
  // press ArrowRight several times; the exercise should change at least once
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
    const now = await page.evaluate(() => (0, eval)('JSON.stringify(targetMidis)'));
    if (now !== before) changed = true;
  }
  expect(changed).toBe(true);
});

test('palette + shortcuts throw nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
