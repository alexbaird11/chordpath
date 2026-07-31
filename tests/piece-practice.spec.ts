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

// ——— Configurable practice view (multi-row / read-ahead) ———

// A long single-hand piece that wraps into several staff systems (rows), so the
// number of rows actually changes what is on screen.
async function loadLongPiece(page: any) {
  return page.evaluate(() => {
    const measures: any[] = [];
    for (let i = 0; i < 24; i++) {
      measures.push({
        number: i + 1, events: [
          { onset: 0, duration: 1, midis: [60], hand: 'R', fingerings: null },
          { onset: 1, duration: 1, midis: [62], hand: 'R', fingerings: null },
          { onset: 2, duration: 1, midis: [64], hand: 'R', fingerings: null },
          { onset: 3, duration: 1, midis: [65], hand: 'R', fingerings: null },
        ],
      });
    }
    return importPieceObject({
      title: 'Long Piece', source: 'musicxml',
      keySig: { fifths: 0, mode: 'major', tonic: 0, name: 'C major', detected: false },
      timeSig: { beats: 4, beatType: 4 }, tempo: 100, measures,
    } as any).id;
  });
}

test('piece practice renders a configurable number of rows (read-ahead)', async ({ page }) => {
  const id = await loadLongPiece(page);
  // A tall window so every row fits at natural size — this asserts the "more rows show more
  // music" behaviour when there is room; the fit-to-height shrink is covered separately below.
  await page.setViewportSize({ width: 1280, height: 1600 });
  const r = await page.evaluate((pid) => {
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    startPiecePractice(pid, { hand: 'both' });
    const h = (n: number) => { setPieceViewRows(n); return parseFloat(canvas.style.height); };
    return { h1: h(1), h2: h(2), h3: h(3) };
  }, id);
  // more rows → a taller reading surface (more music visible at once)
  expect(r.h2).toBeGreaterThan(r.h1);
  expect(r.h3).toBeGreaterThan(r.h2);
});

test('the current line stays visible as the cursor advances across systems', async ({ page }) => {
  const id = await loadLongPiece(page);
  const visible = await page.evaluate((pid) => {
    startPiecePractice(pid, { hand: 'both' });
    setPieceViewRows(2);
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    // advance to a step deep in the piece, then confirm the canvas still renders
    // a bounded window (height stays ~2 systems, not the whole piece)
    const twoRowH = parseFloat(canvas.style.height);
    pieceCursor = pieceQueue.length - 2; // near the end
    setPieceTarget(); // re-renders
    const endH = parseFloat(canvas.style.height);
    return { twoRowH, endH };
  }, id);
  // the window is bounded — the view never grows to the full piece height
  expect(Math.abs(visible.endH - visible.twoRowH)).toBeLessThan(1);
});

test('pieceViewRows clamps to 1–4 and persists to localStorage', async ({ page }) => {
  const r = await page.evaluate(() => {
    setPieceViewRows(9);
    const hi = pieceViewRows;
    setPieceViewRows(0);
    const lo = pieceViewRows;
    setPieceViewRows(3);
    const saved = JSON.parse(localStorage.getItem('chordpath.v3') || '{}');
    return { hi, lo, savedRows: saved.settings && saved.settings.pieceViewRows };
  });
  expect(r.hi).toBe(4);
  expect(r.lo).toBe(1);
  expect(r.savedRows).toBe(3);
});

test('the rows selector reflects the restored setting', async ({ page }) => {
  const val = await page.evaluate(() => {
    setPieceViewRows(3);
    (document.getElementById('pieceRowsSel') as HTMLSelectElement).value = '1'; // desync
    applySettingsToControls();
    return (document.getElementById('pieceRowsSel') as HTMLSelectElement).value;
  });
  expect(val).toBe('3');
});

// ——— Configurable measures per row (reading grid) ———

test('measures/row packs exactly the chosen number of measures into each system', async ({ page }) => {
  const id = await loadLongPiece(page); // 24 measures
  const r = await page.evaluate((pid) => {
    const p = pieces.find((x: any) => x.id === pid)!;
    const spans = (mpr: number) =>
      buildPieceLines(p, 1200, mpr).lines.map((L: any) => L.end - L.start + 1);
    return { four: spans(4), two: spans(2), eight: spans(8) };
  }, id);
  // 24 measures at 4/row → 6 full systems of 4
  expect(r.four).toEqual([4, 4, 4, 4, 4, 4]);
  // at 2/row → 12 systems of 2
  expect(r.two).toEqual(Array(12).fill(2));
  // at 8/row → 3 systems of 8
  expect(r.eight).toEqual([8, 8, 8]);
});

test('the last system holds the remainder when measures do not divide evenly', async ({ page }) => {
  const r = await page.evaluate(() => {
    const measures: any[] = [];
    for (let i = 0; i < 10; i++) measures.push({ number: i + 1, events: [{ onset: 0, duration: 4, midis: [60], hand: 'R', fingerings: null }] });
    const p = importPieceObject({
      title: 'Ten', source: 'musicxml',
      keySig: { fifths: 0, mode: 'major', tonic: 0, name: 'C major', detected: false },
      timeSig: { beats: 4, beatType: 4 }, tempo: 100, measures,
    } as any);
    return buildPieceLines(p, 1200, 4).lines.map((L: any) => L.end - L.start + 1);
  });
  expect(r).toEqual([4, 4, 2]); // 10 measures → 4 + 4 + 2
});

test('auto (0) still wraps by width rather than a fixed count', async ({ page }) => {
  const id = await loadLongPiece(page);
  const r = await page.evaluate((pid) => {
    const p = pieces.find((x: any) => x.id === pid)!;
    const auto = buildPieceLines(p, 1200, 0).lines;
    const narrow = buildPieceLines(p, 600, 0).lines;
    return { autoLines: auto.length, narrowLines: narrow.length };
  }, id);
  // a narrower surface fits fewer measures per row → more systems
  expect(r.autoLines).toBeGreaterThanOrEqual(1);
  expect(r.narrowLines).toBeGreaterThan(r.autoLines);
});

test('measures/row = 4 with rows = 3 shows a 4×3 reading grid (target state)', async ({ page }) => {
  const id = await loadLongPiece(page);
  // Tall window so the 4×3 grid renders at natural size (fit-to-height would otherwise shrink
  // it to stay on screen — that path is asserted in the fit-to-viewport tests below).
  await page.setViewportSize({ width: 1280, height: 1600 });
  const r = await page.evaluate((pid) => {
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    startPiecePractice(pid, { hand: 'both' });
    setPieceMeasuresPerRow(4);
    setPieceViewRows(3);
    const h3 = parseFloat(canvas.style.height);
    setPieceViewRows(1);
    const h1 = parseFloat(canvas.style.height);
    return { h3, h1, mpr: pieceMeasuresPerRow, rows: 3 };
  }, id);
  expect(r.mpr).toBe(4);
  // three visible rows are ~3× the height of one row
  expect(r.h3).toBeGreaterThan(r.h1 * 2.5);
});

test('setPieceMeasuresPerRow clamps, maps auto↔0, and persists', async ({ page }) => {
  const r = await page.evaluate(() => {
    setPieceMeasuresPerRow('auto');
    const auto = pieceMeasuresPerRow;
    setPieceMeasuresPerRow(99);
    const hi = pieceMeasuresPerRow;
    setPieceMeasuresPerRow(4);
    const saved = JSON.parse(localStorage.getItem('chordpath.v3') || '{}');
    return { auto, hi, saved: saved.settings && saved.settings.pieceMeasuresPerRow };
  });
  expect(r.auto).toBe(0);
  expect(r.hi).toBe(8);
  expect(r.saved).toBe(4);
});

test('the measures/row selector reflects the restored setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    setPieceMeasuresPerRow(6);
    (document.getElementById('pieceMprSel') as HTMLSelectElement).value = 'auto'; // desync
    applySettingsToControls();
    const six = (document.getElementById('pieceMprSel') as HTMLSelectElement).value;
    setPieceMeasuresPerRow('auto');
    applySettingsToControls();
    const auto = (document.getElementById('pieceMprSel') as HTMLSelectElement).value;
    return { six, auto };
  });
  expect(r.six).toBe('6');
  expect(r.auto).toBe('auto');
});

// ——— Fit-to-height reading grid (Practice display sizes to the viewport) ———

test('pieceRowFitScale returns 1 when the grid already fits, else shrinks, floored for readability', async ({ page }) => {
  const r = await page.evaluate(() => ({
    fits: pieceRowFitScale(100, 20, 3, 400),   // 3×100=300 ≤ 400 → no shrink
    shrinks: pieceRowFitScale(100, 20, 3, 150), // 300 > 150 → 150/300 = 0.5 (above floor 9/20)
    floored: pieceRowFitScale(100, 20, 3, 30),  // tiny budget → floored at 9/20 = 0.45
  }));
  expect(r.fits).toBe(1);
  expect(r.shrinks).toBeCloseTo(0.5, 5);
  expect(r.floored).toBeCloseTo(0.45, 5); // never shrinks the line gap below 9px
});

test('the multi-row reading grid fits the viewport — all rows are visible without scrolling', async ({ page }) => {
  const id = await loadLongPiece(page);
  await page.setViewportSize({ width: 1280, height: 900 }); // a normal laptop content height
  const r = await page.evaluate((pid) => {
    startPiecePractice(pid, { hand: 'both' });
    setPieceMeasuresPerRow(4);
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    const bottomFor = (rows: number) => { setPieceViewRows(rows); return canvas.getBoundingClientRect().bottom; };
    return { one: bottomFor(1), two: bottomFor(2), three: bottomFor(3), vh: window.innerHeight };
  }, id);
  // the staff no longer runs off the bottom of the screen — every selected row stays on-screen
  expect(r.one).toBeLessThanOrEqual(r.vh);
  expect(r.two).toBeLessThanOrEqual(r.vh);
  expect(r.three).toBeLessThanOrEqual(r.vh);
});

test('adding rows shrinks each row so they all stay on screen (dynamic size adjustment)', async ({ page }) => {
  const id = await loadLongPiece(page);
  await page.setViewportSize({ width: 1280, height: 760 }); // constrained height forces the fit
  const r = await page.evaluate((pid) => {
    startPiecePractice(pid, { hand: 'both' });
    setPieceMeasuresPerRow(4);
    const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
    const perRow = (rows: number) => { setPieceViewRows(rows); return parseFloat(canvas.style.height) / rows; };
    return { p1: perRow(1), p2: perRow(2), p4: perRow(4) };
  }, id);
  // each added row makes every row smaller — the display dynamically reduces size, not scrolls
  expect(r.p2).toBeLessThan(r.p1);
  expect(r.p4).toBeLessThan(r.p2);
});

test('a single row keeps its natural size when it already fits (no needless shrinking)', async ({ page }) => {
  const id = await loadLongPiece(page);
  const heightAt = (h: number) => page.setViewportSize({ width: 1280, height: h }).then(() =>
    page.evaluate((pid) => {
      startPiecePractice(pid, { hand: 'both' });
      setPieceViewRows(1);
      const canvas = document.getElementById('staffCanvas') as HTMLCanvasElement;
      // the natural, width-based single-system height for comparison
      const natural = staffMetrics(canvas.clientWidth, false).H;
      return { css: parseFloat(canvas.style.height), natural };
    }, id));
  const tall = await heightAt(1600);
  const cramped = await heightAt(500);
  // one row is drawn at its natural size on a tall window; only a too-short window shrinks it
  expect(tall.css).toBeCloseTo(tall.natural, 0);
  expect(cramped.css).toBeLessThan(tall.css);
});
