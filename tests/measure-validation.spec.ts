import { test, expect } from '@playwright/test';

// Measure Validation Engine: bar-line arithmetic + non-destructive auto-correction.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).validateMeasures === 'function');
});

test('flags an over-full 4/4 measure and redistributes the overflow without dropping notes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const piece: any = {
      title: 'over', source: 'midi', timeSig: { beats: 4, beatType: 4 }, tempo: 90,
      measures: [{ number: 1, events: [
        { onset: 0, duration: 3, midis: [60], hand: 'R', fingerings: null },
        { onset: 3, duration: 3, midis: [62], hand: 'R', fingerings: null }, // straddles the barline
      ] }],
    };
    const before = piece.measures.flatMap((m: any) => m.events.flatMap((e: any) => e.midis)).length;
    const v = validateMeasures(piece, { autoCorrect: true });
    const span = (mi: number) => Math.max(0, ...piece.measures[mi].events.filter((e: any) => e.hand === 'R').map((e: any) => e.onset + e.duration));
    return {
      before,
      after: piece.measures.flatMap((m: any) => m.events.flatMap((e: any) => e.midis)).length,
      measures: piece.measures.length,
      m1span: span(0), m2span: span(1),
      overCount: v.overCount, corrected: v.correctedCount, valid: v.valid,
      pitchesPreserved: [60, 62].every((p) => piece.measures.some((m: any) => m.events.some((e: any) => e.midis.includes(p)))),
    };
  });
  expect(r.overCount).toBe(1);
  expect(r.corrected).toBe(1);
  expect(r.measures).toBe(2);          // overflow pushed into a new measure
  expect(r.m1span).toBeCloseTo(4, 5);  // measure 1 now fits the meter
  expect(r.m2span).toBeCloseTo(2, 5);  // tied remainder
  expect(r.after).toBeGreaterThanOrEqual(r.before); // never fewer notes
  expect(r.pitchesPreserved).toBe(true);
  expect(r.valid).toBe(true);
});

test('leaves a correctly-filled measure untouched and reports it valid', async ({ page }) => {
  const r = await page.evaluate(() => {
    const piece: any = {
      title: 'ok', timeSig: { beats: 3, beatType: 4 }, tempo: 90,
      measures: [{ number: 1, events: [
        { onset: 0, duration: 1, midis: [60], hand: 'R', fingerings: null },
        { onset: 1, duration: 1, midis: [62], hand: 'R', fingerings: null },
        { onset: 2, duration: 1, midis: [64], hand: 'R', fingerings: null },
      ] }],
    };
    const v = validateMeasures(piece, { autoCorrect: true });
    return { measures: piece.measures.length, overCount: v.overCount, corrected: v.correctedCount, valid: v.valid };
  });
  expect(r.measures).toBe(1);
  expect(r.overCount).toBe(0);
  expect(r.corrected).toBe(0);
  expect(r.valid).toBe(true);
});

test('computes capacity from the time signature (6/8 = 3 quarter beats)', async ({ page }) => {
  const cap = await page.evaluate(() => measureCapacity({ beats: 6, beatType: 8 }));
  expect(cap).toBeCloseTo(3, 5);
});
