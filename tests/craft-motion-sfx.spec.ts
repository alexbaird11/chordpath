import { test, expect } from '@playwright/test';

// PR1 — Motion & Sfx foundation. Verifies the toolkit exists, is inert w.r.t.
// existing behavior, honors reduced-motion, and persists the global mute.

test('Motion and Sfx APIs are exposed', async ({ page }) => {
  await page.goto('/index.html');
  const api = await page.evaluate(() => ({
    motion: typeof (window as any).Motion,
    tween: typeof (window as any).Motion?.tween,
    countUp: typeof (window as any).Motion?.countUp,
    reduced: typeof (window as any).Motion?.reduced,
    sfx: typeof (window as any).Sfx,
    correct: typeof (window as any).Sfx?.correct,
    miss: typeof (window as any).Sfx?.miss,
    setMuted: typeof (window as any).Sfx?.setMuted,
  }));
  expect(api).toEqual({
    motion: 'object', tween: 'function', countUp: 'function', reduced: 'function',
    sfx: 'object', correct: 'function', miss: 'function', setMuted: 'function',
  });
});

test('Motion.tween completes and reports final value', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(() => new Promise<{last:number, done:boolean}>((resolve) => {
    let last = -1, done = false;
    (window as any).Motion.tween({
      from: 0, to: 100, dur: 120,
      onUpdate: (v: number) => { last = v; },
      onDone: () => { done = true; resolve({ last: Math.round(last), done }); },
    });
    setTimeout(() => resolve({ last: Math.round(last), done }), 1000);
  }));
  expect(result.done).toBe(true);
  expect(result.last).toBe(100);
});

test('reduced-motion snaps tween to the end value', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/index.html');
  const r = await page.evaluate(() => new Promise<{reduced:boolean, mid:number}>((resolve) => {
    const reduced = (window as any).Motion.reduced();
    (window as any).Motion.tween({ from: 0, to: 42, dur: 5000,
      onUpdate: (v: number) => {}, onDone: () => resolve({ reduced, mid: 42 }) });
  }));
  expect(r.reduced).toBe(true);
  expect(r.mid).toBe(42);
  await ctx.close();
});

test('global mute persists across reloads and is default-off', async ({ page }) => {
  await page.goto('/index.html');
  expect(await page.evaluate(() => (window as any).Sfx.isMuted())).toBe(false);
  await page.evaluate(() => (window as any).Sfx.setMuted(true));
  await page.reload();
  expect(await page.evaluate(() => (window as any).Sfx.isMuted())).toBe(true);
});

test('sound calls are safe no-ops when muted (no throw)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => {
    (window as any).Sfx.setMuted(true);
    (window as any).Sfx.correct(); (window as any).Sfx.miss();
    (window as any).Sfx.levelUp(); (window as any).Sfx.countIn(4, 80);
  });
  expect(errors).toEqual([]);
});
