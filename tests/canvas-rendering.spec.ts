import { test, expect } from '@playwright/test';

// These tests run in both the default (dpr=1) and chromium-hidpi (dpr=2) projects.
// Assertions are written relative to the observed devicePixelRatio so both pass.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).drawStaff === 'function');
});

test('setupHiDPICanvas scales the staff backing store by devicePixelRatio', async ({ page }) => {
  const r = await page.evaluate(() => {
    drawStaff();
    const c = document.getElementById('staffCanvas') as HTMLCanvasElement;
    const cssW = parseFloat(c.style.width);
    const cssH = parseFloat(c.style.height);
    return { dpr: window.devicePixelRatio, cssW, cssH, w: c.width, h: c.height };
  });
  expect(r.cssW).toBeGreaterThan(0);
  expect(r.w).toBe(Math.round(r.cssW * r.dpr));
  expect(r.h).toBe(Math.round(r.cssH * r.dpr));
});

test('piano canvas is also HiDPI-scaled', async ({ page }) => {
  const r = await page.evaluate(() => {
    drawPiano();
    const c = document.getElementById('pianoCanvas') as HTMLCanvasElement;
    const cssW = parseFloat(c.style.width);
    return { dpr: window.devicePixelRatio, cssW, w: c.width };
  });
  expect(r.w).toBe(Math.round(r.cssW * r.dpr));
});

test('drawStaff renders grand staff without throwing', async ({ page }) => {
  const ok = await page.evaluate(() => {
    try {
      currentEx = { type: 'chord', midis: [48, 52, 55, 64, 67], label: 'C', clef: 'grand' };
      targetMidis = currentEx.midis.slice();
      drawStaff();
      return true;
    } catch (e) {
      return false;
    }
  });
  expect(ok).toBe(true);
});

test('full hint mode shows the chord label in the notation hint, not on the staff', async ({ page }) => {
  const text = await page.evaluate(() => {
    currentEx = { type: 'chord', midis: [67, 71, 74], label: 'G major', clef: 'treble' };
    targetMidis = currentEx.midis.slice();
    setHintMode('full');
    return document.getElementById('notationHint')!.textContent || '';
  });
  expect(text).toContain('G major');
});

test('interval hint mode describes chord shape (stacked thirds)', async ({ page }) => {
  const text = await page.evaluate(() => {
    currentEx = { type: 'chord', midis: [67, 71, 74], label: 'G major', clef: 'treble' };
    targetMidis = currentEx.midis.slice();
    setHintMode('intervals');
    return document.getElementById('notationHint')!.textContent || '';
  });
  expect(text).toContain('stacked thirds');
});

test('no-hints mode clears the notation hint for a single exercise', async ({ page }) => {
  const text = await page.evaluate(() => {
    currentEx = { type: 'single', midis: [64], label: 'E4', clef: 'treble' };
    targetMidis = [64];
    setHintMode('none');
    return document.getElementById('notationHint')!.textContent || '';
  });
  expect(text).toBe('');
});

test('landmark detection identifies middle C in treble', async ({ page }) => {
  const r = await page.evaluate(() => ({
    middleC: isLandmarkNote(60, 'treble'),
    randomNote: isLandmarkNote(63, 'treble'),
  }));
  expect(r.middleC).toBe(true);
  expect(r.randomNote).toBe(false);
});
