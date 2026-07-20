import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).checkAnswer === 'function');
});

test('core audio / input entry points are present', async ({ page }) => {
  const r = await page.evaluate(() => ({
    playNotes: typeof playNotes,
    autoCorr: typeof autoCorr,
    toggleMic: typeof toggleMic,
    toggleMidi: typeof toggleMidi,
  }));
  expect(r.playNotes).toBe('function');
  expect(r.autoCorr).toBe('function');
  expect(r.toggleMic).toBe('function');
  expect(r.toggleMidi).toBe('function');
});

test('checkAnswer accepts an optional playedAt timestamp argument', async ({ page }) => {
  const arity = await page.evaluate(() => checkAnswer.length);
  // (played, playedAt = null) -> declared arity is 1 (default param not counted), 2 params total
  expect(arity).toBeGreaterThanOrEqual(1);

  const ok = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'single', midis: [60], label: 'C4', clef: 'treble' };
    targetMidis = [60];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    const before = score.correct;
    checkAnswer([60], performance.now());
    return score.correct - before;
  });
  expect(ok).toBe(1);
});

test('simulateCorrect drives a correct answer through the Web Audio path without error', async ({ page }) => {
  const delta = await page.evaluate(() => {
    setAnswerMode(false);
    currentEx = { type: 'single', midis: [64], label: 'E4', clef: 'treble' };
    targetMidis = [64];
    exerciseStartedAt = performance.now();
    exerciseScored = false;
    const before = score.correct;
    simulateCorrect();
    return score.correct - before;
  });
  expect(delta).toBe(1);
});

test('autoCorr returns a number for a synthetic buffer', async ({ page }) => {
  const type = await page.evaluate(() => {
    const buf = new Float32Array(2048);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    return typeof autoCorr(buf, 44100);
  });
  expect(type).toBe('number');
});

test('toggleMidi guards gracefully when Web MIDI is unavailable', async ({ page }) => {
  // Suppress the alert() the code shows when Web MIDI is unavailable.
  page.on('dialog', d => d.dismiss());
  const threw = await page.evaluate(async () => {
    // Force the unsupported-browser branch so we exercise the guard without a real
    // permission prompt (which would hang headless Chromium).
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true });
    try { await toggleMidi(); return false; } catch (e) { return true; }
  });
  expect(threw).toBe(false);
  // Button stays off since no access was granted.
  await expect(page.locator('#midiBtn')).toHaveText('MIDI off');
});
