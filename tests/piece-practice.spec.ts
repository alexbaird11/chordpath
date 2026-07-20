import { test, expect } from '@playwright/test';

// Piece practice flow: queue, cursor advancement through checkAnswer, hand isolation,
// play-assessment recording, and practice-plan generation.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).startPiecePractice === 'function');
  await page.evaluate(() => {
    (window as any).__pid = importPieceObject({
      title: 'Flow Test', source: 'musicxml',
      keySig: { fifths: 0, mode: 'major', tonic: 0, name: 'C major', detected: false },
      timeSig: { beats: 4, beatType: 4 }, tempo: 100,
      measures: [
        {
          number: 1, events: [
            { onset: 0, duration: 1, midis: [60], hand: 'R', fingerings: null },
            { onset: 1, duration: 1, midis: [64], hand: 'R', fingerings: null },
            { onset: 0, duration: 2, midis: [48], hand: 'L', fingerings: null },
          ]
        },
        {
          number: 2, events: [
            { onset: 0, duration: 1, midis: [67], hand: 'R', fingerings: null },
            { onset: 1, duration: 1, midis: [72], hand: 'R', fingerings: null },
          ]
        },
      ],
    } as any).id;
  });
});

test('startPiecePractice builds a queue of onsets merging both hands', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'both' });
    return {
      mode: practiceMode,
      queue: pieceQueue.map((s: any) => ({ measure: s.measure, midis: s.midis })),
      target: targetMidis.slice(),
      banner: (document.getElementById('pieceBanner') as HTMLElement).style.display,
    };
  });
  expect(r.mode).toBe('piece');
  expect(r.queue).toEqual([
    { measure: 1, midis: [48, 60] }, // LH + RH share beat 0
    { measure: 1, midis: [64] },
    { measure: 2, midis: [67] },
    { measure: 2, midis: [72] },
  ]);
  expect(r.target).toEqual([48, 60]);
  expect(r.banner).not.toBe('none');
});

test('hand isolation practices only the chosen hand', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'R' });
    const right = pieceQueue.map((s: any) => s.midis);
    startPiecePractice((window as any).__pid, { hand: 'L' });
    const left = pieceQueue.map((s: any) => s.midis);
    return { right, left };
  });
  expect(r.right).toEqual([[60], [64], [67], [72]]);
  expect(r.left).toEqual([[48]]);
});

test('measure range restricts the queue (plan-step isolation)', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'both', measures: [2, 2] });
    return pieceQueue.map((s: any) => ({ measure: s.measure, midis: s.midis }));
  });
  expect(r).toEqual([{ measure: 2, midis: [67] }, { measure: 2, midis: [72] }]);
});

test('a correct answer advances the piece cursor; the piece completes', async ({ page }) => {
  await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'L' }); // single-step queue
    checkAnswer([...targetMidis]);
  });
  await page.waitForFunction(() => pieceCursor >= pieceQueue.length);
  const r = await page.evaluate(() => ({
    hint: document.getElementById('notationHint')!.textContent || '',
    mode: practiceMode,
  }));
  expect(r.hint).toContain('complete');
  expect(r.mode).toBe('piece'); // stays in piece mode until the user exits
});

test('wrong answers do not advance the cursor', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'both' });
    checkAnswer([61]); // wrong
    return { cursor: pieceCursor, target: targetMidis.slice() };
  });
  expect(r.cursor).toBe(0);
  expect(r.target).toEqual([48, 60]);
});

test('exitPiecePractice returns to drill mode and hides the banner', async ({ page }) => {
  const r = await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { hand: 'both' });
    exitPiecePractice();
    return {
      mode: practiceMode,
      banner: (document.getElementById('pieceBanner') as HTMLElement).style.display,
      hasExercise: !!currentEx && currentEx.type !== 'piece',
    };
  });
  expect(r.mode).toBe('drill');
  expect(r.banner).toBe('none');
  expect(r.hasExercise).toBe(true);
});

test('play-assessment records per-measure results and generates a practice plan', async ({ page }) => {
  await page.evaluate(() => {
    startPiecePractice((window as any).__pid, { assess: true, hand: 'both', tempoPct: 80 });
  });
  // measure 1, step 1: miss once, then get it right
  await page.evaluate(() => { checkAnswer([50]); checkAnswer([...targetMidis]); });
  await page.waitForFunction(() => pieceCursor === 1);
  await page.evaluate(() => checkAnswer([...targetMidis]));
  await page.waitForFunction(() => pieceCursor === 2);
  await page.evaluate(() => checkAnswer([...targetMidis]));
  await page.waitForFunction(() => pieceCursor === 3);
  await page.evaluate(() => checkAnswer([...targetMidis]));
  // assessment finishes → back to drill mode with a stored plan
  await page.waitForFunction(() => practiceMode === 'drill');
  const r = await page.evaluate(() => {
    const p = pieces.find((x: any) => x.id === (window as any).__pid)!;
    const m1 = p.assessment.summary.find((s: any) => s.measure === 1);
    const m2 = p.assessment.summary.find((s: any) => s.measure === 2);
    return {
      m1: { attempts: m1.attempts, correct: m1.correct, difficult: m1.difficult },
      m2: { attempts: m2.attempts, correct: m2.correct, difficult: m2.difficult },
      plan: p.assessment.plan.map((s: any) => ({ label: s.label, hand: s.hand, tempoPct: s.tempoPct, measures: s.measures })),
      stored: JSON.parse(localStorage.getItem('chordpath.pieces.v1')!).pieces.some((x: any) => x.assessment),
    };
  });
  expect(r.m1.attempts).toBe(3); // 1 miss + 2 correct steps in measure 1
  expect(r.m1.correct).toBe(2);
  expect(r.m1.difficult).toBe(true);
  expect(r.m2.attempts).toBe(2);
  expect(r.m2.difficult).toBe(false);
  expect(r.stored).toBe(true);
  // plan isolates measure 1 hands-separate (grand piece), then ramps the full piece to 100%
  expect(r.plan.some((s: any) => s.hand === 'R' && s.measures && s.measures[0] === 1 && s.tempoPct < 100)).toBe(true);
  expect(r.plan.some((s: any) => s.hand === 'L' && s.measures && s.measures[0] === 1)).toBe(true);
  expect(r.plan[r.plan.length - 1]).toMatchObject({ hand: 'both', tempoPct: 100, measures: null });
});

test('startPlanStep launches practice with the step settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = pieces.find((x: any) => x.id === (window as any).__pid)!;
    p.assessment = {
      date: Date.now(),
      perMeasure: { 1: { attempts: 4, correct: 1, totalMs: 3000 } },
      summary: summarizeAssessment({ 1: { attempts: 4, correct: 1, totalMs: 3000 } }),
      plan: null as any,
    };
    p.assessment.plan = generatePracticePlan(p.assessment, p);
    selectPiece(p.id);
    startPlanStep(0);
    return { mode: practiceMode, opts: pieceOpts, queue: pieceQueue.map((s: any) => s.midis) };
  });
  expect(r.mode).toBe('piece');
  expect(r.opts.measures).toEqual([1, 1]);
  expect(r.opts.hand).toBe('R');
  expect(r.opts.tempoPct).toBe(60);
  expect(r.queue).toEqual([[60], [64]]);
});

test('piece staff renders without throwing and marks the current step', async ({ page }) => {
  const ok = await page.evaluate(() => {
    try {
      startPiecePractice((window as any).__pid, { hand: 'both' });
      drawStaff(); // dispatches to drawPieceStaff
      pieceCursor = 1; setPieceTarget();
      return practiceMode === 'piece';
    } catch (e) {
      return false;
    }
  });
  expect(ok).toBe(true);
});
