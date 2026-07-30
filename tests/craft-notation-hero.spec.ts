import { test, expect } from '@playwright/test';

// PR6 — Notation as hero. The staff/notehead scale up and the dead space
// tightens so the note dominates the card; the skip button is demoted.

test('the staff fills more of its card (less dead space)', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(() => {
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    const card = document.querySelector('.staff-card') as HTMLElement;
    return { canvasH: canvas.getBoundingClientRect().height, cardH: card.getBoundingClientRect().height };
  });
  // The canvas (the notation) should occupy the large majority of the card.
  expect(r.canvasH / r.cardH).toBeGreaterThan(0.7);
});

test('the next/skip button is no longer the loud accent control', async ({ page }) => {
  await page.goto('/index.html');
  const next = page.locator('button.ghost-next');
  await expect(next).toHaveCount(1);
  await expect(next).toContainText('next');
  // it must not carry the primary accent styling
  expect(await page.evaluate(() => document.querySelector('button.ghost-next')!.classList.contains('accent'))).toBe(false);
  // and it advertises that it skips
  await expect(next).toHaveAttribute('title', /skip/i);
});

test('staff still renders without error across clefs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).setClef('bass'); (window as any).setClef('grand'); (window as any).setClef('treble'); });
  await page.waitForTimeout(150);
  expect(errors).toEqual([]);
});
