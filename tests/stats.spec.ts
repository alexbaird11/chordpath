import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).checkAnswer === 'function');
});

test('response time is recorded on a correct answer', async ({ page }) => {
  const r = await page.evaluate(() => {
    setAnswerMode(false);
    level = 0;
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    exerciseStartedAt = performance.now() - 500; // pretend the reader took 500ms
    exerciseScored = false;
    checkAnswer([60]);
    return {
      count: responseStats.count,
      total: responseStats.totalMs,
      fastest: responseStats.fastestCorrectMs,
      byLevel0: responseStats.byLevel[0].count,
    };
  });
  expect(r.count).toBe(1);
  expect(r.total).toBeGreaterThan(0);
  expect(r.fastest).toBeGreaterThan(0);
  expect(r.byLevel0).toBe(1);
});

test('response time is recorded once per exercise, not per attempt', async ({ page }) => {
  const count = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    checkAnswer([60]); // scored
    checkAnswer([60]); // exerciseScored already true -> should not double count
    return responseStats.count;
  });
  expect(count).toBe(1);
});

test('error stats accumulate missing, extra and octave errors', async ({ page }) => {
  const r = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C', clef: 'treble' };
    targetMidis = [60, 64, 67];
    checkAnswer([64, 67, 69]); // missing 60(C4), extra 69(A4)
    currentEx = { type: 'single', midis: [62], label: 'D4', clef: 'treble' };
    targetMidis = [62];
    checkAnswer([74]); // octave error D5
    return {
      missing: errorStats.missingNotes['C4'] || 0,
      extra: errorStats.extraNotes['A4'] || 0,
      octave: errorStats.octaveErrors['D5'] || 0,
    };
  });
  expect(r.missing).toBe(1);
  expect(r.extra).toBe(1);
  expect(r.octave).toBe(1);
});

test('state persists to localStorage and reloads', async ({ page }) => {
  await page.evaluate(() => {
    setAnswerMode(false);
    setHintMode('landmarks');
    setLevel(2);
    currentEx = { type: 'chord', midis: [60, 64, 67], label: 'C', clef: 'treble' };
    targetMidis = [60, 64, 67];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    checkAnswer([60, 64, 67]); // correct -> bumps score + saves
  });
  const stored = await page.evaluate(() => localStorage.getItem('chordpath.v3'));
  expect(stored).toBeTruthy();

  await page.reload();
  await page.waitForFunction(() => typeof (window as any).checkAnswer === 'function');
  const restored = await page.evaluate(() => ({
    correct: score.correct,
    hintMode,
    level,
    hintSel: (document.getElementById('hintModeSel') as HTMLSelectElement).value,
  }));
  expect(restored.correct).toBeGreaterThanOrEqual(1);
  expect(restored.hintMode).toBe('landmarks');
  expect(restored.level).toBe(2);
  expect(restored.hintSel).toBe('landmarks');
});

test('resetStats clears persisted state', async ({ page }) => {
  await page.evaluate(() => {
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    checkAnswer([60]);
  });
  await page.evaluate(() => {
    // stub confirm() so resetStats proceeds headlessly
    window.confirm = () => true;
    resetStats();
  });
  const r = await page.evaluate(() => ({
    total: score.total,
    stored: localStorage.getItem('chordpath.v3'),
  }));
  expect(r.total).toBe(0);
  // resetStats removes the key then immediately re-saves the cleared state
  const parsed = JSON.parse(r.stored as string);
  expect(parsed.score.total).toBe(0);
});

test('getSuggestedDrill recommends octave work when octave errors pile up', async ({ page }) => {
  const s = await page.evaluate(() => {
    errorStats.octaveErrors = { 'C5': 4 };
    return getSuggestedDrill();
  });
  expect(s.toLowerCase()).toContain('octave');
});

test('getSuggestedDrill always returns a non-empty string', async ({ page }) => {
  const s = await page.evaluate(() => getSuggestedDrill());
  expect(typeof s).toBe('string');
  expect(s.length).toBeGreaterThan(0);
});
