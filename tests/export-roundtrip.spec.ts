import { test, expect } from '@playwright/test';

// Export utilities: a piece serialized to MusicXML / MIDI and re-parsed must reproduce
// the same notes, hands, onsets and durations (round-trip fidelity). PDF must be valid.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).pieceToMusicXML === 'function');
});

const FIXTURE = {
  title: 'Round Trip', composer: 'Tester', source: 'editor', staffType: 'grand',
  keySig: { fifths: -1, mode: 'major', tonic: 5, name: 'F major', detected: false },
  timeSig: { beats: 4, beatType: 4 }, tempo: 100,
  measures: [
    { number: 1, events: [
      { onset: 0, duration: 1, midis: [65], hand: 'R', fingerings: [1] },
      { onset: 1, duration: 0.5, midis: [67], hand: 'R', fingerings: [2] },
      { onset: 1.5, duration: 0.5, midis: [69], hand: 'R', fingerings: [3] },
      { onset: 2, duration: 2, midis: [72, 76], hand: 'R', fingerings: [1, 3] }, // chord, half note
      { onset: 0, duration: 4, midis: [41, 48], hand: 'L', fingerings: [5, 1] }, // whole-ish, LH
    ] },
    { number: 2, events: [
      { onset: 0, duration: 1.5, midis: [70], hand: 'R', fingerings: [4] }, // dotted quarter
      { onset: 1.5, duration: 0.5, midis: [72], hand: 'R', fingerings: [5] },
      { onset: 2, duration: 2, midis: [74], hand: 'R', fingerings: [1] },
      { onset: 0, duration: 4, midis: [36], hand: 'L', fingerings: [5] },
    ] },
  ],
};

function flat(piece: any) {
  const out: any[] = [];
  piece.measures.forEach((m: any, mi: number) => m.events.forEach((e: any) =>
    out.push({ mi, hand: e.hand, onset: +e.onset.toFixed(4), duration: +e.duration.toFixed(4), midis: [...e.midis].sort((a, b) => a - b) })));
  return out.sort((a, b) => a.mi - b.mi || (a.hand < b.hand ? -1 : 1) || a.onset - b.onset);
}

test('MusicXML export round-trips notes, hands, onsets and durations', async ({ page }) => {
  const r = await page.evaluate((fx) => {
    const xml = pieceToMusicXML(fx as any);
    const rp = parseMusicXML(xml, 'rt.musicxml');
    const flat = (piece: any) => {
      const out: any[] = [];
      piece.measures.forEach((m: any, mi: number) => m.events.forEach((e: any) =>
        out.push({ mi, hand: e.hand, onset: +e.onset.toFixed(4), duration: +e.duration.toFixed(4), midis: [...e.midis].sort((a: number, b: number) => a - b) })));
      return out.sort((a, b) => a.mi - b.mi || (a.hand < b.hand ? -1 : 1) || a.onset - b.onset);
    };
    return { original: flat(fx), roundtrip: flat(rp), key: rp.keySig.name, time: rp.timeSig, tempo: rp.tempo, xmlHasFingering: /<fingering>/.test(xml) };
  }, FIXTURE);
  expect(r.roundtrip).toEqual(r.original);
  expect(r.key).toBe('F major');
  expect(r.time).toEqual({ beats: 4, beatType: 4 });
  expect(r.tempo).toBe(100);
  expect(r.xmlHasFingering).toBe(true);
});

test('MIDI export round-trips notes, hands, onsets and durations', async ({ page }) => {
  const r = await page.evaluate((fx) => {
    const bytes = pieceToMIDI(fx as any);
    const rp = parseMIDI(bytes.buffer, 'rt.mid');
    const flat = (piece: any) => {
      const out: any[] = [];
      piece.measures.forEach((m: any, mi: number) => m.events.forEach((e: any) =>
        out.push({ mi, hand: e.hand, onset: +e.onset.toFixed(4), duration: +e.duration.toFixed(4), midis: [...e.midis].sort((a: number, b: number) => a - b) })));
      return out.sort((a, b) => a.mi - b.mi || (a.hand < b.hand ? -1 : 1) || a.onset - b.onset);
    };
    return { original: flat(fx), roundtrip: flat(rp), time: rp.timeSig, tempo: rp.tempo };
  }, FIXTURE);
  expect(r.roundtrip).toEqual(r.original);
  expect(r.time).toEqual({ beats: 4, beatType: 4 });
  expect(r.tempo).toBe(100);
});

test('PDF export produces a valid single-page PDF', async ({ page }) => {
  const r = await page.evaluate((fx) => {
    const bytes = pieceToPDF(fx as any);
    const head = new TextDecoder().decode(bytes.slice(0, 8));
    const tail = new TextDecoder('latin1').decode(bytes.slice(-6));
    return { head, tail, len: bytes.length };
  }, FIXTURE);
  expect(r.head.startsWith('%PDF-')).toBe(true);
  expect(r.tail).toContain('%%EOF');
  expect(r.len).toBeGreaterThan(1000);
});
