// Standalone UAT report generator.
//
// Launches Chromium, loads the app, parses every sample with the real in-app parser,
// scores it against the ground truth, and writes ./report/accuracy-report.{md,json}.
// Run from the repo root:
//   node tests/uat/sheet_music_import/report.mjs
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node tests/uat/sheet_music_import/report.mjs
//
// The Playwright spec (import-accuracy.spec.ts) writes the same report as part of the
// automated suite; this script is for generating the report on demand without a test run.
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scorePiece, pct } = require('./accuracy.cjs');

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '../../..');
const SAMPLES = join(DIR, 'samples');
const TRUTH = join(DIR, 'ground-truth');
const REPORT = join(DIR, 'report');
const TARGET = 0.95;

const names = readdirSync(SAMPLES).filter((f) => f.endsWith('.musicxml')).sort();

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto('file://' + join(ROOT, 'index.html'));
await page.waitForFunction(() => typeof window.parseMusicXML === 'function');

const rows = [];
for (const name of names) {
  const xml = readFileSync(join(SAMPLES, name), 'utf8');
  const truth = JSON.parse(readFileSync(join(TRUTH, name.replace('.musicxml', '.json')), 'utf8'));
  const actual = await page.evaluate((x) => {
    const p = window.parseMusicXML(x, 'uat.musicxml');
    return { keyName: p.keySig.name, timeSig: p.timeSig, tempo: p.tempo, measures: p.measures };
  }, xml);
  const s = scorePiece(truth, actual);
  rows.push({
    name, title: truth.title, keyExpected: truth.keyName, keyActual: actual.keyName,
    keyOk: truth.keyName === actual.keyName,
    timeOk: truth.timeSig.beats === actual.timeSig.beats && truth.timeSig.beatType === actual.timeSig.beatType,
    timeActual: `${actual.timeSig.beats}/${actual.timeSig.beatType}`, ...s,
  });
}
await browser.close();

const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
const avgPitch = avg((r) => r.pitchAccuracy), avgDur = avg((r) => r.durationAccuracy), avgOverall = avg((r) => r.overallAccuracy);
const keysOk = rows.filter((r) => r.keyOk).length, timesOk = rows.filter((r) => r.timeOk).length;

const md = [
  '# Sheet-Music Import — UAT Accuracy Report', '',
  `Generated: ${new Date().toISOString()}`, '',
  '## Summary', '',
  `- Samples: **${rows.length}**`,
  `- Average pitch accuracy: **${pct(avgPitch)}** (target ${pct(TARGET)})`,
  `- Average duration accuracy: **${pct(avgDur)}** (target ${pct(TARGET)})`,
  `- Average overall Import Accuracy Score: **${pct(avgOverall)}**`,
  `- Key signature recovered: **${keysOk}/${rows.length}**`,
  `- Time signature recovered: **${timesOk}/${rows.length}**`, '',
  '## Per-file results', '',
  '| Sample | Title | Key | Time | Events (exp/got) | Pitch | Duration | Overall |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.title} | ${r.keyOk ? '✓' : '✗ ' + r.keyActual} | ${r.timeOk ? '✓' : '✗ ' + r.timeActual} | ${r.expectedEvents}/${r.actualEvents} | ${pct(r.pitchAccuracy)} | ${pct(r.durationAccuracy)} | ${pct(r.overallAccuracy)} |`),
  '',
].join('\n');

mkdirSync(REPORT, { recursive: true });
writeFileSync(join(REPORT, 'accuracy-report.md'), md);
writeFileSync(join(REPORT, 'accuracy-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), target: TARGET, summary: { avgPitch, avgDur, avgOverall, keysOk, timesOk, count: rows.length }, rows }, null, 2));
console.log(md);
console.log(`\nWrote report to ${REPORT}`);
const pass = avgPitch >= TARGET && avgDur >= TARGET;
console.log(pass ? '\n✅ UAT PASS — import accuracy meets the >95% target' : '\n❌ UAT FAIL — below target');
process.exit(pass ? 0 : 1);
