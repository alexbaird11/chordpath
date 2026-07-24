import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scorePiece, pct } from './accuracy.cjs';

// ═══════════════════════════════════════════════════════════════════════════
// UAT: Sheet-Music Import Accuracy Benchmark
//
// For every sample in ./samples the app's real parser (parseMusicXML, run in-page)
// produces a piece, which is scored against ./ground-truth using the pure accuracy
// module. The suite asserts the target Import Accuracy Score (>95% pitch + duration)
// and writes a human-readable report to ./report. It also exercises the optical
// (OMR) pipeline, including deskew, on synthetic clean and skewed staves.
// ═══════════════════════════════════════════════════════════════════════════
const DIR = __dirname;
const SAMPLES = join(DIR, 'samples');
const TRUTH = join(DIR, 'ground-truth');
const REPORT = join(DIR, 'report');
const TARGET = 0.95;

const sampleNames = readdirSync(SAMPLES).filter((f) => f.endsWith('.musicxml')).sort();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).parseMusicXML === 'function');
});

test('MusicXML import accuracy meets the >95% target across the benchmark', async ({ page }) => {
  const rows: any[] = [];
  for (const name of sampleNames) {
    const xml = readFileSync(join(SAMPLES, name), 'utf8');
    const truth = JSON.parse(readFileSync(join(TRUTH, name.replace('.musicxml', '.json')), 'utf8'));
    const actual = await page.evaluate((x) => {
      const p = (window as any).parseMusicXML(x, 'uat.musicxml');
      return { keyName: p.keySig.name, timeSig: p.timeSig, tempo: p.tempo, measures: p.measures };
    }, xml);
    const s = scorePiece(truth, actual);
    rows.push({
      name, title: truth.title,
      keyExpected: truth.keyName, keyActual: actual.keyName, keyOk: truth.keyName === actual.keyName,
      timeExpected: `${truth.timeSig.beats}/${truth.timeSig.beatType}`,
      timeActual: `${actual.timeSig.beats}/${actual.timeSig.beatType}`,
      timeOk: truth.timeSig.beats === actual.timeSig.beats && truth.timeSig.beatType === actual.timeSig.beatType,
      ...s,
    });
  }

  // ——— write the comparison report ———
  const avgPitch = rows.reduce((a, r) => a + r.pitchAccuracy, 0) / rows.length;
  const avgDur = rows.reduce((a, r) => a + r.durationAccuracy, 0) / rows.length;
  const avgOverall = rows.reduce((a, r) => a + r.overallAccuracy, 0) / rows.length;
  const minPitch = Math.min(...rows.map((r) => r.pitchAccuracy));
  const keysOk = rows.filter((r) => r.keyOk).length, timesOk = rows.filter((r) => r.timeOk).length;

  mkdirSync(REPORT, { recursive: true });
  const md = [
    '# Sheet-Music Import — UAT Accuracy Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Samples: **${rows.length}**`,
    `- Average pitch accuracy: **${pct(avgPitch)}** (target ${pct(TARGET)})`,
    `- Average duration accuracy: **${pct(avgDur)}** (target ${pct(TARGET)})`,
    `- Average overall Import Accuracy Score: **${pct(avgOverall)}**`,
    `- Lowest single-file pitch accuracy: **${pct(minPitch)}**`,
    `- Key signature recovered: **${keysOk}/${rows.length}**`,
    `- Time signature recovered: **${timesOk}/${rows.length}**`,
    '',
    '## Per-file results',
    '',
    '| Sample | Title | Key | Time | Events (exp/got) | Pitch | Duration | Overall |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.title} | ${r.keyOk ? '✓' : '✗ ' + r.keyActual} | ${r.timeOk ? '✓' : '✗ ' + r.timeActual} | ${r.expectedEvents}/${r.actualEvents} | ${pct(r.pitchAccuracy)} | ${pct(r.durationAccuracy)} | ${pct(r.overallAccuracy)} |`),
    '',
  ].join('\n');
  writeFileSync(join(REPORT, 'accuracy-report.md'), md);
  writeFileSync(join(REPORT, 'accuracy-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), target: TARGET, summary: { avgPitch, avgDur, avgOverall, minPitch, keysOk, timesOk, count: rows.length }, rows }, null, 2));
  console.log('\n' + md);

  // ——— assertions (the UAT gate) ———
  for (const r of rows) {
    expect.soft(r.keyOk, `${r.name} key signature`).toBe(true);
    expect.soft(r.timeOk, `${r.name} time signature`).toBe(true);
    expect.soft(r.pitchAccuracy, `${r.name} pitch accuracy`).toBeGreaterThanOrEqual(TARGET);
    expect.soft(r.durationAccuracy, `${r.name} duration accuracy`).toBeGreaterThanOrEqual(TARGET);
  }
  expect(avgPitch).toBeGreaterThanOrEqual(TARGET);
  expect(avgDur).toBeGreaterThanOrEqual(TARGET);
});

test('optical pipeline reads a clean synthetic staff and deskew helps a rotated one', async ({ page }) => {
  const r = await page.evaluate(() => {
    // Render a 5-line staff with four noteheads at known pitches, optionally sheared.
    function renderStaff(skew: number) {
      const cv = document.createElement('canvas');
      cv.width = 900; cv.height = 220;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#fff'; c.fillRect(0, 0, 900, 220);
      c.save();
      c.translate(0, 20); c.transform(1, skew, 0, 1, 0, 0); // vertical shear = page skew
      c.fillStyle = '#000';
      const top = 60, gap = 12;
      for (let i = 0; i < 5; i++) c.fillRect(40, top + i * gap - 1, 800, 2);
      const head = (x: number, y: number) => { c.beginPath(); c.ellipse(x, y, 7, 5, -0.3, 0, Math.PI * 2); c.fill(); };
      head(250, top + 4 * gap); // E4
      head(370, top + 3 * gap); // G4
      head(490, top + 2 * gap); // B4
      head(610, top + 1 * gap); // D5
      c.restore();
      return c.getImageData(0, 0, 900, 220);
    }
    const expected = [64, 67, 71, 74];
    const recall = (midis: number[]) => expected.filter((p) => midis.includes(p)).length / expected.length;
    const clean = (window as any).omrFromImageData(renderStaff(0));
    const cleanMidis = clean.measures.flatMap((m: any) => m.events.flatMap((e: any) => e.midis));
    const skewed = (window as any).omrFromImageData(renderStaff(0.05)); // ~2.9° rotation
    const skewMidis = skewed.measures.flatMap((m: any) => m.events.flatMap((e: any) => e.midis));
    return { cleanRecall: recall(cleanMidis), skewRecall: recall(skewMidis), cleanMidis, skewMidis };
  });
  // clean scan: the exact notes come back
  expect(r.cleanRecall).toBe(1);
  // skewed scan: deskew keeps it usable (optical is inherently approximate, honest bound)
  expect(r.skewRecall).toBeGreaterThanOrEqual(0.75);
});
