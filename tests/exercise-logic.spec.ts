import { test, expect } from '@playwright/test';

// Drive the app through its global functions. checkAnswer() and the generators are
// declared at script top level, so they are reachable from page.evaluate.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).checkAnswer === 'function');
});

test('strict mode rejects an answer with an extra note', async ({ page }) => {
  const result = await page.evaluate(() => {
    setAnswerMode(false); // strict
    currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C major', clef: 'treble' };
    targetMidis = [60, 64, 67];
    const before = score.correct;
    checkAnswer([60, 64, 67, 69]); // extra A4, not an octave of any target
    return { correctDelta: score.correct - before, streak: score.streak, extra: errorStats.extraNotes['A4'] || 0 };
  });
  expect(result.correctDelta).toBe(0); // not counted correct under strict mode
  expect(result.streak).toBe(0);
  expect(result.extra).toBe(1); // extra note recorded diagnostically
});

test('forgiving mode preserves old behavior: extra notes still count as correct', async ({ page }) => {
  const result = await page.evaluate(() => {
    setAnswerMode(true); // forgiving
    currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C major', clef: 'treble' };
    targetMidis = [60, 64, 67];
    const before = score.correct;
    checkAnswer([60, 64, 67, 69]); // all targets present + extra
    return { correctDelta: score.correct - before, streak: score.streak };
  });
  expect(result.correctDelta).toBe(1); // legacy "all targets present" acceptance
  expect(result.streak).toBe(1);
});

test('strict mode accepts an exact answer', async ({ page }) => {
  const ok = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C major', clef: 'treble' };
    targetMidis = [60, 64, 67];
    const before = score.correct;
    checkAnswer([67, 60, 64]); // order-independent, exact set
    return score.correct - before;
  });
  expect(ok).toBe(1);
});

test('octave error is detected and recorded distinctly from generic extras', async ({ page }) => {
  const r = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    checkAnswer([72]); // C5 — right pitch class, wrong octave
    return {
      octave: errorStats.octaveErrors['C5'] || 0,
      extra: errorStats.extraNotes['C5'] || 0,
      missing: errorStats.missingNotes['C4'] || 0,
    };
  });
  expect(r.octave).toBe(1);
  expect(r.extra).toBe(0); // an octave error is not a generic extra
  expect(r.missing).toBe(1);
});

test('missing-note feedback names the missed note', async ({ page }) => {
  const hint = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'chord', midis: [55, 59, 62], label: 'G major', clef: 'treble' };
    targetMidis = [55, 59, 62];
    checkAnswer([55, 62]); // missing B (59)
    return document.getElementById('notationHint')!.textContent || '';
  });
  expect(hint).toContain('missed B3');
});

test('layoutChordNoteheads keeps thirds stacked and offsets seconds', async ({ page }) => {
  const r = await page.evaluate(() => {
    const thirds = layoutChordNoteheads([60, 64, 67], 14); // C-E-G, all thirds
    const second = layoutChordNoteheads([60, 62], 14);      // C-D, a second
    return {
      thirdsOffsets: thirds.map((n: any) => n.xOffset),
      secondLower: second[0].xOffset,
      secondUpper: second[1].xOffset,
    };
  });
  expect(r.thirdsOffsets).toEqual([0, 0, 0]);
  expect(r.secondLower).toBe(0);
  expect(r.secondUpper).toBeGreaterThan(0);
});

test('adaptive mode biases generation toward frequently-missed pitch classes', async ({ page }) => {
  const ratio = await page.evaluate(() => {
    missedNotes = { 'C4': 10 }; // heavy misses on pitch class C
    level = 0;
    clef = 'treble';
    adaptiveMode = true;
    let cHits = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const ex = genExercise();
      if (ex.midis[0] % 12 === 0) cHits++;
    }
    return cHits / N;
  });
  // Uniform white-key baseline for C is ~1/7 (0.14); the bias should push well past that.
  expect(ratio).toBeGreaterThan(0.33);
});

test('genExercise still produces valid exercises for every level', async ({ page }) => {
  const ok = await page.evaluate(() => {
    adaptiveMode = false;
    for (let lv = 0; lv <= 5; lv++) {
      level = lv;
      const ex = genExercise();
      if (!ex || !Array.isArray(ex.midis) || ex.midis.length === 0) return false;
    }
    return true;
  });
  expect(ok).toBe(true);
});
