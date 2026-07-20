# ChordPath
Single-file HTML piano sight reading trainer. All application logic lives in one `index.html`.

## Architecture
- Pure HTML/CSS/JS, no frameworks, no build step — still a static site
- Web Audio API for mic pitch detection (autocorrelation) and tone playback
- Web MIDI API for keyboard input
- Canvas-based staff and piano rendering (HiDPI / device-pixel-ratio aware)
- Progress persisted to `localStorage` (`chordpath.v3`)

## Features
- 6 difficulty levels: single notes → intervals → triads → 7th chords → progressions → custom
- Treble, bass, and grand staff modes
- Sheet-music-first layout: the staff is the primary surface; the piano is a muted support strip
- Hint modes: full labels · landmark labels · interval hints · no hints
- Diagnostic feedback with strict / forgiving answer modes (missed / extra / wrong-octave)
- Response-time tracking (fluency), adaptive practice, and a scored rhythm timing loop
- Metronome with time signature, subdivisions, count-in
- Exercise builder: custom roots, chord types, inversions, rhythm mode
- Stats: accuracy by level, weak/extra/octave notes, response time, rhythm timing, suggested next drill

## Tests
Playwright drives the app through its global functions plus DOM assertions.

```
npm install
npm test
```

In a sandbox where the browser version is pinned, point Playwright at the
preinstalled Chromium instead of downloading one:

```
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm test
```

## Known limitations / future ideas
- Mic detection remains unreliable for chords (MIDI recommended)
- Rhythm challenge is an MVP scored timing loop — no rhythmic notation yet
- Adaptive mode biases root/type generation from recent misses; not a full mastery model
