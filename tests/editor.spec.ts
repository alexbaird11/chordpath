import { test, expect } from '@playwright/test';

// Drag-and-drop editor & authoring: state machine, undo/redo history, note editing,
// creation wizard, and library persistence.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).editorNewScore === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
});

test('editor tab renders palette, canvas and wizard entry point', async ({ page }) => {
  await page.click('.tab >> text=editor');
  await expect(page.locator('#tab-editor')).toBeVisible();
  await expect(page.locator('#editorCanvas')).toBeVisible();
  await expect(page.locator('#durPalette')).toBeVisible();
  await expect(page.locator('#accPalette')).toBeVisible();
});

test('new score creates a blank measure-bounded canvas from wizard options', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = editorNewScore({ title: 'My Piece', composer: 'Me', staffType: 'treble', fifths: 2, mode: 'major', beats: 3, beatType: 4, tempo: 72, measures: 4 });
    return { title: p.title, composer: p.composer, staff: p.staffType, key: p.keySig.name, time: p.timeSig, tempo: p.tempo, measures: p.measures.length, notes: allPieceMidis(p).length };
  });
  expect(r.title).toBe('My Piece');
  expect(r.staff).toBe('treble');
  expect(r.key).toBe('D major');
  expect(r.time).toEqual({ beats: 3, beatType: 4 });
  expect(r.tempo).toBe(72);
  expect(r.measures).toBe(4);
  expect(r.notes).toBe(0);
});

test('placing notes, changing pitch and deleting update the model', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ staffType: 'grand', beats: 4, beatType: 4, measures: 2 });
    editorPlaceNote(0, 'R', 0, 60, 1);
    editorPlaceNote(0, 'R', 1, 64, 1);
    editorPlaceNote(0, 'L', 0, 48, 2);
    const placed = allPieceMidis(ED.piece).slice().sort((a, b) => a - b);
    // select the first note and nudge it up a diatonic step (C4 -> D4)
    ED.sel = { mi: 0, hand: 'R', onset: 0 };
    editorNudgePitch(1);
    const firstEv = ED.piece.measures[0].events.find((e: any) => e.hand === 'R' && e.onset === 0);
    const nudged = firstEv.midis[0];
    // delete the selected note
    ED.sel = { mi: 0, hand: 'R', onset: 0 };
    editorDeleteSelected();
    const afterDelete = allPieceMidis(ED.piece).length;
    return { placed, nudged, afterDelete };
  });
  expect(r.placed).toEqual([48, 60, 64]);
  expect(r.nudged).toBe(62); // D4
  expect(r.afterDelete).toBe(2);
});

test('accidental, fingering and dynamic tools modify the selected note', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ staffType: 'treble', beats: 4, beatType: 4, measures: 1 });
    editorPlaceNote(0, 'R', 0, 60, 1);
    ED.sel = { mi: 0, hand: 'R', onset: 0 };
    editorApplyAccidental(1); // sharpen: C -> C#
    editorSetFingering(3);
    editorSetDynamic('mf');
    const ev = ED.piece.measures[0].events[0];
    return { midi: ev.midis[0], finger: ev.fingerings[0], dyn: ev.dyn };
  });
  expect(r.midi).toBe(61);
  expect(r.finger).toBe(3);
  expect(r.dyn).toBe('mf');
});

test('individual notes within a chord can be edited without disturbing siblings', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ staffType: 'grand', beats: 4, beatType: 4, measures: 1 });
    // build an F4+C5 dyad in a single event (same hand + onset)
    editorPlaceNote(0, 'R', 0, 65, 1); // F4
    editorPlaceNote(0, 'R', 0, 72, 1); // C5
    const ev = () => ED.piece.measures[0].events.find((e: any) => e.hand === 'R' && e.onset === 0);
    const dyad = ev().midis.slice();

    // select only the F4 notehead and move it down one diatonic step -> E4 (64); C5 (72) unchanged
    ED.sel = { mi: 0, hand: 'R', onset: 0, midi: 65 };
    editorNudgePitch(-1);
    const afterNudge = ev().midis.slice();
    const selTracked = ED.sel.midi; // selection should follow the moved note

    // sharpen just the selected note: E4 (64) -> F4-ish (65); C5 untouched
    editorApplyAccidental(1);
    const afterAcc = ev().midis.slice();

    // delete only the selected note, leaving the sibling behind
    editorDeleteSelected();
    const afterDelete = ev().midis.slice();

    // whole-event selection (no midi) still nudges every note, preserving old behavior
    ED.sel = { mi: 0, hand: 'R', onset: 0 };
    editorPlaceNote(0, 'R', 0, 60, 1); // add C4 back so the event has a chord again: [60,72]
    editorNudgePitch(1);
    const wholeEvent = ev().midis.slice();

    return { dyad, afterNudge, selTracked, afterAcc, afterDelete, wholeEvent };
  });
  expect(r.dyad).toEqual([65, 72]);            // F4, C5
  expect(r.afterNudge).toEqual([64, 72]);      // E4, C5 — sibling untouched
  expect(r.selTracked).toBe(64);               // selection followed the moved note
  expect(r.afterAcc).toEqual([65, 72]);        // E4 sharpened, C5 still untouched
  expect(r.afterDelete).toEqual([72]);         // only the selected note removed
  // whole-event nudge shifts BOTH notes one diatonic step: [60,72] -> [62,74]
  expect(r.wholeEvent).toEqual([62, 74]);
});

test('undo/redo history stack is unbounded within a session and restores state', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ staffType: 'treble', beats: 4, beatType: 4, measures: 1 });
    for (let i = 0; i < 4; i++) editorPlaceNote(0, 'R', i, 60 + i, 1);
    const full = allPieceMidis(ED.piece).length;
    editorUndo(); editorUndo();
    const after2Undo = allPieceMidis(ED.piece).length;
    editorRedo();
    const after1Redo = allPieceMidis(ED.piece).length;
    // a fresh edit truncates the redo branch
    editorPlaceNote(0, 'R', 3, 80, 1);
    return { full, after2Undo, after1Redo, canRedo: editorCanRedo(), depth: ED.history.length };
  });
  expect(r.full).toBe(4);
  expect(r.after2Undo).toBe(2);
  expect(r.after1Redo).toBe(3);
  expect(r.canRedo).toBe(false);
  expect(r.depth).toBeGreaterThan(4);
});

test('adding notes past the last measure auto-expands the score', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ staffType: 'treble', beats: 4, beatType: 4, measures: 1 });
    const before = ED.piece.measures.length;
    editorPlaceNote(0, 'R', 0, 60, 1); // fills the (only) measure -> a trailing blank is appended
    return { before, after: ED.piece.measures.length };
  });
  expect(r.before).toBe(1);
  expect(r.after).toBe(2);
});

test('save to library persists an authored score and integrates with practice', async ({ page }) => {
  const r = await page.evaluate(() => {
    editorNewScore({ title: 'Authored Tune', staffType: 'treble', fifths: 0, mode: 'major', beats: 4, beatType: 4, measures: 1 });
    editorPlaceNote(0, 'R', 0, 60, 1);
    editorPlaceNote(0, 'R', 1, 62, 1);
    editorPlaceNote(0, 'R', 2, 64, 1);
    editorPlaceNote(0, 'R', 3, 65, 1);
    const saved = editorSaveToLibrary();
    return {
      inLibrary: pieces.some((p: any) => p.id === saved.id),
      title: saved.title,
      fingered: saved.measures[0].events.every((e: any) => Array.isArray(e.fingerings) && e.fingerings.length),
      stored: !!localStorage.getItem('chordpath.pieces.v1'),
    };
  });
  expect(r.inLibrary).toBe(true);
  expect(r.title).toBe('Authored Tune');
  expect(r.fingered).toBe(true);
  expect(r.stored).toBe(true);

  await page.reload();
  await page.waitForFunction(() => typeof (window as any).editorNewScore === 'function');
  const after = await page.evaluate(() => pieces.map((p: any) => p.title));
  expect(after).toContain('Authored Tune');
});

test('an imported piece can be loaded into the editor for correction', async ({ page }) => {
  const r = await page.evaluate(() => {
    const imported = importPieceObject({
      title: 'Imported', source: 'midi', timeSig: { beats: 4, beatType: 4 }, tempo: 90,
      measures: [{ number: 1, events: [{ onset: 0, duration: 1, midis: [60], hand: 'R', fingerings: null }] }],
    } as any);
    const loaded = editorLoadPiece(imported.id);
    return { loadedTitle: loaded.title, notes: allPieceMidis(ED.piece).length, editable: editorCanUndo() === false };
  });
  expect(r.loadedTitle).toBe('Imported');
  expect(r.notes).toBe(1);
});
