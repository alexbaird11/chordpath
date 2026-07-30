import { test, expect } from '@playwright/test';

// PR10 — A bundled piano sample, signature cues, and restrained mobile haptics
// all share the same persisted mute and background-safety policy.

test('sample, beat and haptic APIs are exposed', async ({ page }) => {
  await page.goto('/index.html');
  const api = await page.evaluate(() => ({
    notes: typeof (window as any).Sfx?.notes,
    beat: typeof (window as any).Sfx?.beat,
    haptic: typeof (window as any).Sfx?.haptic,
    ready: typeof (window as any).Sfx?.ready,
  }));
  expect(api).toEqual({ notes:'function', beat:'function', haptic:'function', ready:'function' });
});

test('bundled piano sample decodes and drives note playback', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(async () => {
    const sfx = (window as any).Sfx;
    sfx.setMuted(false);
    await sfx.ready();
    const ctx = sfx._ctx();
    let sources = 0;
    const create = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => { sources++; return create(); };
    const sampled = await sfx.notes([60,64,67]);
    return { state:sfx.sampleState(), sources, sampled };
  });
  expect(result).toEqual({ state:'ready', sources:3, sampled:true });
});

test('legacy note and metronome paths route through the shared sound policy', async ({ page }) => {
  await page.goto('/index.html');
  const calls = await page.evaluate(() => {
    const sfx = (window as any).Sfx;
    let notes = 0, beats = 0;
    sfx.notes = () => { notes++; return Promise.resolve(true); };
    sfx.beat = () => { beats++; };
    (window as any).playNotes([60]);
    (window as any).playClick(true,false,false);
    return { notes, beats };
  });
  expect(calls).toEqual({ notes:1, beats:1 });
});

test('correct, milestone and beat feedback use restrained haptic patterns', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__haptics = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => { (window as any).__haptics.push(pattern); return true; },
    });
  });
  await page.goto('/index.html');
  const patterns = await page.evaluate(() => {
    const sfx = (window as any).Sfx;
    sfx.setMuted(false);
    sfx.correct(); sfx.levelUp(); sfx.beat(true,false,false);
    return (window as any).__haptics;
  });
  expect(patterns).toEqual([18,[24,36,24],10]);
});

test('global mute silences audio and haptics and persists in the visible control', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__haptics = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => { (window as any).__haptics.push(pattern); return true; },
    });
  });
  await page.goto('/index.html');
  const before = await page.evaluate(async () => {
    const sfx = (window as any).Sfx;
    sfx.setMuted(true);
    await sfx.notes([60]); sfx.correct(); sfx.levelUp(); sfx.beat(true,false,false);
    return (window as any).__haptics.slice();
  });
  expect(before).toEqual([0]); // muting actively cancels any in-flight vibration
  await page.reload();
  await expect(page.locator('#muteBtn')).toHaveText('sound off');
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed','true');
});

test('hidden pages suppress new sound and haptic feedback', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__haptics = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => { (window as any).__haptics.push(pattern); return true; },
    });
  });
  await page.goto('/index.html');
  const patterns = await page.evaluate(() => {
    const sfx = (window as any).Sfx;
    sfx.setMuted(false);
    Object.defineProperty(document, 'hidden', { configurable:true, value:true });
    document.dispatchEvent(new Event('visibilitychange'));
    sfx.correct(); sfx.levelUp(); sfx.beat(true,false,false);
    return (window as any).__haptics;
  });
  expect(patterns).toEqual([0]);
});
