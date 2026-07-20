import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).classifyTiming === 'function');
});

test('classifyTiming returns null when rhythm mode is inactive', async ({ page }) => {
  const t = await page.evaluate(() => {
    rhythmActive = false;
    currentBeatStartedAt = performance.now();
    return classifyTiming(performance.now());
  });
  expect(t).toBeNull();
});

test('classifyTiming buckets on-time, early and late hits', async ({ page }) => {
  const r = await page.evaluate(() => {
    rhythmActive = true;
    rhythmWindowMs = 180;
    const beat = 1000;
    currentBeatStartedAt = beat;
    return {
      onTime: classifyTiming(beat + 50),   // within window
      early: classifyTiming(beat - 300),   // well before
      late: classifyTiming(beat + 300),    // well after
      edge: classifyTiming(beat + 180),    // exactly at window edge -> on time
    };
  });
  expect(r.onTime).toBe('onTime');
  expect(r.early).toBe('early');
  expect(r.late).toBe('late');
  expect(r.edge).toBe('onTime');
});

test('checkAnswer scores rhythm timing when a timestamp is supplied', async ({ page }) => {
  const r = await page.evaluate(() => {
    setAnswerMode(false);
    rhythmActive = true;
    rhythmWindowMs = 180;
    currentBeatStartedAt = performance.now();
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    const before = rhythmScore.onTime;
    checkAnswer([60], currentBeatStartedAt + 20); // on time
    return { onTimeDelta: rhythmScore.onTime - before };
  });
  expect(r.onTimeDelta).toBe(1);
});

test('timing pill becomes visible after a rhythm-scored answer', async ({ page }) => {
  await page.evaluate(() => {
    setAnswerMode(false);
    rhythmActive = true;
    rhythmWindowMs = 180;
    currentBeatStartedAt = performance.now();
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    checkAnswer([60], currentBeatStartedAt + 400); // late
  });
  const pill = page.locator('#timingPill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText('late');
});

test('metronome start/stop toggles button state', async ({ page }) => {
  await page.click('.tab >> text=metronome');
  await page.click('#metroBtn');
  await expect(page.locator('#metroBtn')).toHaveText('stop');
  await page.click('#metroBtn');
  await expect(page.locator('#metroBtn')).toHaveText('start');
});
