import { test, expect } from '@playwright/test';

// PR7 — Living staff. An FX overlay canvas mirrors the staff canvas and runs an
// ambient glow + ignition ring, without disturbing the notation render.

test('LiveStaff controller is exposed and started', async ({ page }) => {
  await page.goto('/index.html');
  const api = await page.evaluate(() => ({
    ctrl: typeof (window as any).LiveStaff,
    ignite: typeof (window as any).LiveStaff?.ignite,
    sync: typeof (window as any).LiveStaff?.sync,
  }));
  expect(api).toEqual({ ctrl: 'object', ignite: 'function', sync: 'function' });
});

test('the FX overlay canvas exists and tracks the staff canvas box', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForTimeout(200); // let a frame sync
  const r = await page.evaluate(() => {
    const s = document.getElementById('staffCanvas')!.getBoundingClientRect();
    const f = document.getElementById('staffFxCanvas')!.getBoundingClientRect();
    return { sw: Math.round(s.width), sh: Math.round(s.height), fw: Math.round(f.width), fh: Math.round(f.height),
             dx: Math.abs(s.left - f.left), dy: Math.abs(s.top - f.top) };
  });
  expect(r.fw).toBe(r.sw);
  expect(r.fh).toBe(r.sh);
  expect(r.dx).toBeLessThanOrEqual(1);
  expect(r.dy).toBeLessThanOrEqual(1);
});

test('the overlay never occludes the notation (pointer-events none, below celebration)', async ({ page }) => {
  await page.goto('/index.html');
  const z = await page.evaluate(() => {
    const f = getComputedStyle(document.getElementById('staffFxCanvas')!);
    const fx = getComputedStyle(document.getElementById('staffFx')!);
    return { pe: f.pointerEvents, fxCanvasZ: f.zIndex, celebrationZ: fx.zIndex };
  });
  expect(z.pe).toBe('none');
  expect(Number(z.celebrationZ)).toBeGreaterThan(Number(z.fxCanvasZ));
});

test('ignite() and the ambient loop throw nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await page.evaluate(() => { (window as any).LiveStaff.ignite(); (window as any).simulateCorrect(); });
  await page.waitForTimeout(700);
  expect(errors).toEqual([]);
});
