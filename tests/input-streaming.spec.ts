import { test, expect } from '@playwright/test';

// Streaming note-follow input matcher (the high-tempo practice fix).
//
// Practice used to snapshot the currently-held MIDI keys 110 ms after the last note-on and
// compare that set to one static target. At tempo — where the next key lands before the last
// is released, and notes arrive < 110 ms apart — a fast run collapsed into one bogus "chord"
// and was scored wrong. The matcher instead records note *onsets* and matches them to the
// moving target in order: single-note targets resolve on the next onset, chord targets gather
// near-simultaneous onsets, and a player who is ahead pulls the target up to where they are.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).registerNoteOn === 'function');
  await page.evaluate(() => {
    // A fast right-hand run of four eighth notes plus a two-note step, and a triad step.
    (window as any).__runId = importPieceObject({
      title: 'Fast Run', source: 'musicxml',
      keySig: { fifths: 0, mode: 'major', tonic: 0, name: 'C major', detected: false },
      timeSig: { beats: 4, beatType: 4 }, tempo: 160,
      measures: [
        {
          number: 1, events: [
            { onset: 0.0, duration: 0.5, midis: [60], hand: 'R', fingerings: null },
            { onset: 0.5, duration: 0.5, midis: [62], hand: 'R', fingerings: null },
            { onset: 1.0, duration: 0.5, midis: [64], hand: 'R', fingerings: null },
            { onset: 1.5, duration: 0.5, midis: [65], hand: 'R', fingerings: null },
          ],
        },
      ],
    } as any).id;

    (window as any).__chordId = importPieceObject({
      title: 'Chord Step', source: 'musicxml',
      keySig: { fifths: 0, mode: 'major', tonic: 0, name: 'C major', detected: false },
      timeSig: { beats: 4, beatType: 4 }, tempo: 100,
      measures: [
        {
          number: 1, events: [
            { onset: 0, duration: 2, midis: [60], hand: 'R', fingerings: null },
            { onset: 0, duration: 2, midis: [64], hand: 'R', fingerings: null },
            { onset: 0, duration: 2, midis: [67], hand: 'R', fingerings: null },
          ],
        },
      ],
    } as any).id;
  });
});

test('a rapid single-note run registers every note in order and completes', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__runId, { hand: 'R' });
    const before = { correct: score.correct, total: score.total };
    // Play the run in one synchronous burst — the worst case for the old debounce, which
    // would merge all four onsets into a single [60,62,64,65] "chord" and score it wrong.
    [60, 62, 64, 65].forEach((n) => registerNoteOn(n, performance.now()));
    return {
      cursor: pieceCursor,
      queueLen: pieceQueue.length,
      correctDelta: score.correct - before.correct,
      totalDelta: score.total - before.total,
      extras: Object.keys(errorStats.extraNotes).length,
      missing: Object.keys(errorStats.missingNotes).length,
      hint: document.getElementById('notationHint')!.textContent || '',
    };
  });
  expect(r.cursor).toBe(r.queueLen);       // advanced through all four steps
  expect(r.correctDelta).toBe(4);          // each note scored correct
  expect(r.totalDelta).toBe(4);            // exactly four attempts — nothing merged
  expect(r.extras).toBe(0);                // no phantom "extra note" errors from overlap
  expect(r.missing).toBe(0);
  expect(r.hint).toContain('complete');
});

test('legato overlap (no note-offs between presses) still advances step by step', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__runId, { hand: 'R' });
    // Hold every key down — never send note-off — the way a legato passage overlaps notes.
    [60, 62, 64, 65].forEach((n) => registerNoteOn(n, performance.now()));
    return {
      cursor: pieceCursor,
      queueLen: pieceQueue.length,
      held: heldMidi.size,           // all four keys still "down"
      extras: Object.keys(errorStats.extraNotes).length,
    };
  });
  expect(r.cursor).toBe(r.queueLen); // overlap did not stall or merge the run
  expect(r.held).toBe(4);            // matching used onsets, not the held-key set
  expect(r.extras).toBe(0);
});

test('a chord target gathers near-simultaneous onsets into one correct step', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__chordId, { hand: 'R' });
    const before = score.total;
    // Roll the triad — the third onset completes the target and resolves it in one step.
    registerNoteOn(60, performance.now());
    registerNoteOn(64, performance.now());
    registerNoteOn(67, performance.now());
    return {
      cursor: pieceCursor,
      queueLen: pieceQueue.length,
      totalDelta: score.total - before, // one attempt, not three
      correct: score.correct > 0,
    };
  });
  expect(r.cursor).toBe(r.queueLen);
  expect(r.totalDelta).toBe(1);
  expect(r.correct).toBe(true);
});

test('an incomplete chord is scored wrong when its gather window elapses', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__chordId, { hand: 'R' });
    registerNoteOn(60, performance.now());
    registerNoteOn(64, performance.now()); // only two of three notes
    resolvePendingInput(true);             // simulate the gather window timing out
    return {
      cursor: pieceCursor,
      streak: score.streak,
      missing: Object.keys(errorStats.missingNotes),
      buffered: midiOnsetBuffer.length,
    };
  });
  expect(r.cursor).toBe(0);               // did not advance
  expect(r.streak).toBe(0);
  expect(r.missing).toContain('G4');      // the un-played note is reported missing
  expect(r.buffered).toBe(0);             // the incomplete attempt was consumed
});

test('a wrong note holds at the current target and lets the next press retry', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__runId, { hand: 'R' });
    registerNoteOn(61, performance.now()); // wrong: target is 60
    const afterWrong = { cursor: pieceCursor, target: targetMidis.slice(), buffered: midiOnsetBuffer.length };
    registerNoteOn(60, performance.now()); // correct retry
    const afterRetry = { cursor: pieceCursor };
    return { afterWrong, afterRetry };
  });
  expect(r.afterWrong.cursor).toBe(0);       // wrong note did not advance
  expect(r.afterWrong.target).toEqual([60]); // still waiting on the same note
  expect(r.afterWrong.buffered).toBe(0);     // stale onsets cleared, no de-sync
  expect(r.afterRetry.cursor).toBe(1);       // the correct retry advances
});

test('exiting piece practice clears any buffered onsets', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__chordId, { hand: 'R' });
    registerNoteOn(60, performance.now()); // one note of a triad left pending
    const pending = midiOnsetBuffer.length;
    exitPiecePractice();
    return { pending, afterExit: midiOnsetBuffer.length };
  });
  expect(r.pending).toBe(1);
  expect(r.afterExit).toBe(0);
});
