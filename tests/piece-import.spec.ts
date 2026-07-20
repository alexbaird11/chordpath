import { test, expect } from '@playwright/test';

// Upload pipeline: MusicXML / MXL / MIDI parsers, key detection, OMR, persistence.

const MUSICXML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
 <work><work-title>Test Minuet</work-title></work>
 <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>2</divisions>
    <key><fifths>1</fifths><mode>major</mode></key>
    <time><beats>3</beats><beat-type>4</beat-type></time>
    <staves>2</staves>
   </attributes>
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
   <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
   <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note>
   <backup><duration>6</duration></backup>
   <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><staff>2</staff></note>
   <note><chord/><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note>
  </measure>
  <measure number="2">
   <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note>
  </measure>
 </part>
</score-partwise>`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).parseMusicXML === 'function');
});

test('parseMusicXML extracts measures, chords, hands, key and time signature', async ({ page }) => {
  const p = await page.evaluate((xml) => {
    const piece = parseMusicXML(xml, 'fixture.musicxml');
    return {
      title: piece.title,
      key: piece.keySig,
      time: piece.timeSig,
      measures: piece.measures.map((m: any) => m.events.map((e: any) => ({ o: e.onset, d: e.duration, m: e.midis, h: e.hand }))),
    };
  }, MUSICXML_FIXTURE);
  expect(p.title).toBe('Test Minuet');
  expect(p.key.fifths).toBe(1);
  expect(p.key.name).toBe('G major');
  expect(p.key.detected).toBe(false);
  expect(p.time).toEqual({ beats: 3, beatType: 4 });
  // measure 1: RH G4/B4/D5 quarters, LH G2+D3 chord (half note) at beat 0
  expect(p.measures[0]).toContainEqual({ o: 0, d: 1, m: [67], h: 'R' });
  expect(p.measures[0]).toContainEqual({ o: 1, d: 1, m: [71], h: 'R' });
  expect(p.measures[0]).toContainEqual({ o: 2, d: 1, m: [74], h: 'R' });
  expect(p.measures[0]).toContainEqual({ o: 0, d: 2, m: [43, 50], h: 'L' });
  // measure 2: F#4 then G4 (half)
  expect(p.measures[1]).toContainEqual({ o: 0, d: 1, m: [66], h: 'R' });
  expect(p.measures[1]).toContainEqual({ o: 1, d: 2, m: [67], h: 'R' });
});

test('extractMxlXml unpacks a zip container and finds the score', async ({ page }) => {
  const p = await page.evaluate(async (xml) => {
    // build a stored (method 0) zip: [local header + data] × entries, central dir, EOCD
    const enc = new TextEncoder();
    const files = [
      { name: 'META-INF/container.xml', data: enc.encode('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>') },
      { name: 'score.xml', data: enc.encode(xml) },
    ];
    const bytes: number[] = [];
    const u16 = (v: number) => [v & 255, (v >> 8) & 255];
    const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
    const central: number[] = [];
    files.forEach(f => {
      const nameB = [...enc.encode(f.name)];
      const lho = bytes.length;
      bytes.push(0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(f.data.length), ...u32(f.data.length), ...u16(nameB.length), ...u16(0),
        ...nameB, ...f.data);
      central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(f.data.length), ...u32(f.data.length), ...u16(nameB.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(lho), ...nameB);
    });
    const cdOff = bytes.length;
    bytes.push(...central);
    bytes.push(0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(central.length), ...u32(cdOff), ...u16(0));
    const xmlOut = await extractMxlXml(new Uint8Array(bytes).buffer);
    const piece = parseMusicXML(xmlOut, 'test.mxl');
    return { title: piece.title, measures: piece.measures.length };
  }, MUSICXML_FIXTURE);
  expect(p.title).toBe('Test Minuet');
  expect(p.measures).toBe(2);
});

test('parseMIDI reads notes, chords, tempo, key and time signature', async ({ page }) => {
  const p = await page.evaluate(() => {
    const vlq = (n: number) => { const b = [n & 0x7f]; while (n >>= 7) b.unshift((n & 0x7f) | 0x80); return b; };
    const bytes: number[] = [];
    const push = (delta: number, ...data: number[]) => bytes.push(...vlq(delta), ...data);
    push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8);          // 4/4
    push(0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);     // 120 bpm
    push(0, 0xff, 0x59, 0x02, 0x01, 0x00);           // 1 sharp, major
    push(0, 0x90, 67, 80); push(480, 0x80, 67, 0);   // G4 quarter (starting at tick 0)
    push(0, 0x90, 71, 80); push(480, 0x80, 71, 0);   // B4 quarter
    push(0, 0x90, 74, 80); push(0, 0x90, 67, 80);    // D5+G4 half
    push(960, 0x80, 74, 0); push(0, 0x80, 67, 0);
    push(0, 0xff, 0x2f, 0x00);
    const len = bytes.length;
    const trk = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...bytes];
    const hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (480 >> 8) & 255, 480 & 255];
    const piece = parseMIDI(new Uint8Array([...hdr, ...trk]).buffer, 'song.mid');
    return {
      title: piece.title, tempo: piece.tempo, key: piece.keySig.name, time: piece.timeSig,
      events: piece.measures[0].events.map((e: any) => ({ o: e.onset, d: e.duration, m: e.midis })),
    };
  });
  expect(p.title).toBe('song');
  expect(p.tempo).toBe(120);
  expect(p.key).toBe('G major');
  expect(p.time).toEqual({ beats: 4, beatType: 4 });
  expect(p.events).toContainEqual({ o: 0, d: 1, m: [67] });
  expect(p.events).toContainEqual({ o: 1, d: 1, m: [71] });
  expect(p.events).toContainEqual({ o: 2, d: 2, m: [67, 74] });
});

test('detectKey infers major and minor keys from note content', async ({ page }) => {
  const r = await page.evaluate(() => ({
    g: detectKey([67, 69, 71, 72, 74, 76, 78, 79, 67, 74, 71]),
    f: detectKey([65, 67, 69, 70, 72, 74, 76, 77, 65, 72, 69]),
    am: detectKey([57, 59, 60, 62, 64, 65, 68, 69, 64, 57, 60]),
  }));
  expect(r.g.name).toBe('G major');
  expect(r.g.fifths).toBe(1);
  expect(r.g.detected).toBe(true);
  expect(r.f.name).toBe('F major');
  expect(r.f.fifths).toBe(-1);
  expect(r.am.name).toBe('A minor');
});

test('omrFromImageData reads noteheads from a clean synthetic staff image', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = 800; cv.height = 200;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 800, 200);
    c.fillStyle = '#000';
    const top = 60, gap = 12;
    for (let i = 0; i < 5; i++) c.fillRect(40, top + i * gap - 1, 720, 2);
    const head = (x: number, y: number) => { c.beginPath(); c.ellipse(x, y, 7, 5, -0.3, 0, Math.PI * 2); c.fill(); };
    head(200, top + 4 * gap);       // E4 — bottom line
    head(300, top + 3 * gap);       // G4
    head(400, top + 2 * gap);       // B4
    head(500, top + 1.5 * gap);     // C5
    const piece = omrFromImageData(c.getImageData(0, 0, 800, 200));
    return {
      approx: piece.approx,
      midis: piece.measures.flatMap((m: any) => m.events.flatMap((e: any) => e.midis)),
    };
  });
  expect(r.approx).toBe(true);
  expect(r.midis).toEqual([64, 67, 71, 72]);
});

test('importPieceObject fills in a detected key, fingerings, and persists the library', async ({ page }) => {
  await page.evaluate(() => {
    importPieceObject({
      title: 'Persist Me', source: 'midi', timeSig: { beats: 4, beatType: 4 }, tempo: 100,
      measures: [{
        number: 1, events: [
          { onset: 0, duration: 1, midis: [67], hand: 'R', fingerings: null },
          { onset: 1, duration: 1, midis: [71], hand: 'R', fingerings: null },
          { onset: 2, duration: 1, midis: [74], hand: 'R', fingerings: null },
          { onset: 3, duration: 1, midis: [79], hand: 'R', fingerings: null },
        ]
      }],
    } as any);
  });
  const before = await page.evaluate(() => {
    const p = pieces[pieces.length - 1];
    return {
      key: p.keySig.name, detected: p.keySig.detected,
      fingered: p.measures[0].events.every((e: any) => Array.isArray(e.fingerings) && e.fingerings.length === e.midis.length),
      stored: !!localStorage.getItem('chordpath.pieces.v1'),
    };
  });
  expect(before.key).toBe('G major'); // inferred — the upload had no key signature
  expect(before.detected).toBe(true);
  expect(before.fingered).toBe(true);
  expect(before.stored).toBe(true);

  await page.reload();
  await page.waitForFunction(() => typeof (window as any).parseMusicXML === 'function');
  const after = await page.evaluate(() => pieces.map((p: any) => p.title));
  expect(after).toContain('Persist Me');
});

test('pieces tab shows the upload dropzone and library UI', async ({ page }) => {
  await page.click('.tab >> text=pieces');
  await expect(page.locator('#tab-pieces')).toBeVisible();
  await expect(page.locator('#uploadDrop')).toBeVisible();
  await expect(page.locator('#pieceList')).toBeVisible();
});
