import { test, expect } from '@playwright/test';

// PR3 — Microinteraction pass. Verifies the interaction layer exists, that
// rolling numbers still resolve to the exact value (no regression to metrics),
// and that reduced-motion disables the animation path.

test('interaction tokens and animated tab underline are present', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const tab = document.querySelector('.tab') as HTMLElement;
    const after = getComputedStyle(tab, '::after');
    return {
      ease: s.getPropertyValue('--ease-out').trim(),
      spring: s.getPropertyValue('--ease-spring').trim(),
      tabPos: getComputedStyle(tab).position,
      underlineExists: after.content !== 'none' && after.height === '2px',
    };
  });
  expect(r.ease).toContain('cubic-bezier');
  expect(r.spring).toContain('cubic-bezier');
  expect(r.tabPos).toBe('relative');
  expect(r.underlineExists).toBe(true);
});

test('interactive cards animate transform on hover', async ({ page }) => {
  await page.goto('/index.html');
  const props = await page.evaluate(() => {
    const el = document.querySelector('.metric-pill') as HTMLElement;
    return getComputedStyle(el).transitionProperty;
  });
  expect(props).toContain('transform');
});

// One correct answer at level 0 from fresh state is deterministic:
// correct = 1, xp = (level+1)*8+5 = 13.
test('rolling numbers resolve to the exact final value', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).setLevel(0); (window as any).simulateCorrect(); });
  await page.waitForTimeout(900); // let the count-up + pop finish
  const dom = await page.evaluate(() => ({
    correct: document.getElementById('mCorrect')!.textContent,
    xp: document.getElementById('mXP')!.textContent,
  }));
  expect(dom.correct).toBe('1');
  expect(dom.xp).toBe('13');
});

test('craftSetNum sets values instantly under reduced-motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).setLevel(0); (window as any).simulateCorrect(); });
  await page.waitForTimeout(60); // one frame is enough when reduced
  const xp = await page.evaluate(() => document.getElementById('mXP')!.textContent);
  expect(xp).toBe('13');
  await ctx.close();
});

test('no uncaught errors during an answer cycle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) (window as any).simulateCorrect(); });
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});
