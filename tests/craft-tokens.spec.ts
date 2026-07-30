import { test, expect } from '@playwright/test';

// PR2 — Design tokens + humane type. Verifies the CDN webfont dependency is
// gone, the token layer exists, UI text is the humanist sans, and data numbers
// stay monospaced with tabular figures.

test('no external font CDN dependency remains', async ({ page }) => {
  const external: string[] = [];
  page.on('request', r => { const u = r.url(); if (/fonts\.(googleapis|gstatic)\.com/.test(u)) external.push(u); });
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  expect(external).toEqual([]);
  const html = await page.content();
  expect(html).not.toContain('fonts.googleapis.com');
});

test('type + spacing tokens are defined on :root', async ({ page }) => {
  await page.goto('/index.html');
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      ui: s.getPropertyValue('--font-ui').trim(),
      mono: s.getPropertyValue('--font-mono').trim(),
      display: s.getPropertyValue('--font-display').trim(),
      sp4: s.getPropertyValue('--sp-4').trim(),
      fs5: s.getPropertyValue('--fs-5').trim(),
    };
  });
  expect(tokens.ui).toContain('sans-serif');
  expect(tokens.mono).toContain('monospace');
  expect(tokens.display).toContain('serif');
  expect(tokens.sp4).toBe('16px');
  expect(tokens.fs5).toBe('22px');
});

test('UI body text is humanist sans, not monospace', async ({ page }) => {
  await page.goto('/index.html');
  const fam = await page.evaluate(() => getComputedStyle(document.body).fontFamily.toLowerCase());
  expect(fam).toContain('sans-serif');
  expect(fam).not.toContain('mono');
});

test('data numbers remain monospaced with tabular figures', async ({ page }) => {
  await page.goto('/index.html');
  const m = await page.evaluate(() => {
    const el = document.getElementById('mXP')!;
    const s = getComputedStyle(el);
    return { fam: s.fontFamily.toLowerCase(), num: s.fontVariantNumeric };
  });
  expect(m.fam).toContain('mono');
  expect(m.num).toContain('tabular-nums');
});

test('the wordmark uses the display serif', async ({ page }) => {
  await page.goto('/index.html');
  const fam = await page.evaluate(() => getComputedStyle(document.querySelector('.title')!).fontFamily.toLowerCase());
  expect(fam).toContain('serif');
});
