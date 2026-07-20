import { test, expect } from '@playwright/test';

// Fingering engine + toolbar toggle (Part 1). Cluster rules follow common piano
// pedagogy (RH root triad 1-3-5, first inversion 1-2-5, LH mirrored); melodic runs
// are fingered by dynamic programming with thumb-under / cross-over modelling.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).fingeringForCluster === 'function');
});

test('cluster fingering: RH triads, inversions, intervals and sevenths', async ({ page }) => {
  const r = await page.evaluate(() => ({
    majRoot: fingeringForCluster([60, 64, 67], 'R'),
    firstInv: fingeringForCluster([64, 67, 72], 'R'),
    third: fingeringForCluster([60, 64], 'R'),
    fifth: fingeringForCluster([60, 67], 'R'),
    dom7: fingeringForCluster([60, 64, 67, 70], 'R'),
  }));
  expect(r.majRoot).toEqual([1, 3, 5]);
  expect(r.firstInv).toEqual([1, 2, 5]);
  expect(r.third).toEqual([1, 3]);
  expect(r.fifth).toEqual([1, 5]);
  expect(r.dom7).toEqual([1, 2, 4, 5]);
});

test('cluster fingering: left hand mirrors the right hand', async ({ page }) => {
  const r = await page.evaluate(() => ({
    majRoot: fingeringForCluster([48, 52, 55], 'L'),
    secondInv: fingeringForCluster([43, 48, 52], 'L'),
    fifth: fingeringForCluster([48, 55], 'L'),
  }));
  expect(r.majRoot).toEqual([5, 3, 1]);
  expect(r.secondInv).toEqual([5, 2, 1]);
  expect(r.fifth).toEqual([5, 1]);
});

test('melodic fingering: two-octave RH scale uses valid fingers with thumb crossings', async ({ page }) => {
  const r = await page.evaluate(() => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
    const up = inferMelodicFingering(scale, 'R');
    const down = inferMelodicFingering(scale.slice().reverse(), 'R');
    const hasThumbUnder = up.some((f: number, i: number) => i > 0 && scale[i] > scale[i - 1] && f < up[i - 1]);
    return { up, down, hasThumbUnder };
  });
  expect(r.up.every((f: number) => f >= 1 && f <= 5)).toBe(true);
  expect(r.down.every((f: number) => f >= 1 && f <= 5)).toBe(true);
  // 15 ascending notes cannot be played with 5 fingers without crossing
  expect(r.hasThumbUnder).toBe(true);
  // an ascending scale should start from the thumb side, a descending one from the pinky side
  expect(r.up[0]).toBeLessThanOrEqual(2);
  expect(r.down[0]).toBeGreaterThanOrEqual(4);
});

test('annotateFingerings gives every event a fingering aligned with its notes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const piece = {
      title: 't', measures: [{
        number: 1, events: [
          { onset: 0, duration: 1, midis: [60], hand: 'R', fingerings: null },
          { onset: 1, duration: 1, midis: [62], hand: 'R', fingerings: null },
          { onset: 2, duration: 1, midis: [60, 64, 67], hand: 'R', fingerings: null },
          { onset: 0, duration: 2, midis: [48, 52, 55], hand: 'L', fingerings: null },
        ]
      }]
    };
    annotateFingerings(piece as any);
    return piece.measures[0].events.map((e: any) => e.fingerings);
  });
  expect(r[0]).toHaveLength(1);
  expect(r[1]).toHaveLength(1);
  expect(r[2]).toEqual([1, 3, 5]);
  expect(r[3]).toEqual([5, 3, 1]);
});

test('fingering toolbar toggle flips state, redraws, and persists across reload', async ({ page }) => {
  const btn = page.locator('#fingeringBtn');
  await expect(btn).toBeVisible();
  expect(await page.evaluate(() => showFingering)).toBe(true);
  await expect(btn).toHaveClass(/on/);

  await btn.click();
  expect(await page.evaluate(() => showFingering)).toBe(false);
  await expect(btn).not.toHaveClass(/on/);

  await page.reload();
  await page.waitForFunction(() => typeof (window as any).toggleFingering === 'function');
  expect(await page.evaluate(() => showFingering)).toBe(false);
  await expect(page.locator('#fingeringBtn')).not.toHaveClass(/on/);
});

test('drawStaff renders fingerings for treble and grand clusters without throwing', async ({ page }) => {
  const ok = await page.evaluate(() => {
    try {
      showFingering = true;
      currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C', clef: 'treble' };
      targetMidis = currentEx.midis.slice();
      drawStaff();
      currentEx = { type: 'chord', midis: [48, 52, 55, 64, 67], label: 'C', clef: 'grand' };
      targetMidis = currentEx.midis.slice();
      drawStaff();
      currentEx = { type: 'single', midis: [45], label: 'A2', clef: 'bass' };
      targetMidis = [45];
      drawStaff();
      return true;
    } catch (e) {
      return false;
    }
  });
  expect(ok).toBe(true);
});

test('staff metrics scale up with width for the roomier layout', async ({ page }) => {
  const r = await page.evaluate(() => ({
    wide: staffMetrics(1100, false),
    narrow: staffMetrics(500, false),
    grand: staffMetrics(1100, true),
  }));
  expect(r.wide.lg).toBeGreaterThan(r.narrow.lg);
  expect(r.wide.H).toBeGreaterThan(190); // taller than the old fixed 190px staff
  expect(r.grand.H).toBeGreaterThan(300); // taller than the old fixed 300px grand staff
});
