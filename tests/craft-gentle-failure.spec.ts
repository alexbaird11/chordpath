import { test, expect } from '@playwright/test';

// PR5 — Gentle, instructive failure. A wrong answer names the missed note in
// plain language, locates it on the keys, nudges (not buzzes), and persists.

async function wrongAnswer(page: any) {
  // Target is a single treble note (level 0); answer with a wildly wrong note.
  await page.evaluate(() => { (window as any).setLevel(0); (window as any).checkAnswer([1]); });
}

test('Fx.miss API is exposed', async ({ page }) => {
  await page.goto('/index.html');
  expect(await page.evaluate(() => typeof (window as any).Fx?.miss)).toBe('function');
});

test('a wrong answer shows a located, plain-language nudge', async ({ page }) => {
  await page.goto('/index.html');
  await wrongAnswer(page);
  const hint = page.locator('#notationHint');
  await expect(hint).toHaveClass(/err/);
  await expect(hint).toContainText('not quite');
  await expect(hint).toContainText('on the keys');
  // the missed note is recorded for the keyboard highlight
  const missLen = await page.evaluate(() => (0, eval)('missMidis.length'));
  expect(missLen).toBeGreaterThan(0);
});

test('the diagnostic is not duplicated into the status hint row', async ({ page }) => {
  await page.goto('/index.html');
  await wrongAnswer(page);
  const hintText = await page.evaluate(() => document.getElementById('hintText')?.textContent || '');
  expect(hintText).not.toContain('not quite'); // detail lives only in the staff hint
});

test('the located highlight clears on the next target', async ({ page }) => {
  await page.goto('/index.html');
  await wrongAnswer(page);
  expect(await page.evaluate(() => (0, eval)('missMidis.length'))).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).nextExercise());
  expect(await page.evaluate(() => (0, eval)('missMidis.length'))).toBe(0);
});

test('failure path throws nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).Sfx.setMuted(true); for (let i=0;i<5;i++) (window as any).checkAnswer([1]); });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
