# ChordPath
Single-file HTML piano sight reading trainer. All application logic lives in one `index.html`.

## Architecture
- Pure HTML/CSS/JS, no frameworks, no build step — still a static site
- Web Audio API for mic pitch detection (autocorrelation) and tone playback
- Web MIDI API for keyboard input
- Canvas-based staff and piano rendering (HiDPI / device-pixel-ratio aware)
- Progress persisted to `localStorage` (`chordpath.v3`); imported pieces in `chordpath.pieces.v1`

## Features
- 6 difficulty levels: single notes → intervals → triads → 7th chords → progressions → custom
- Treble, bass, and grand staff modes
- Sheet-music-first layout: wide (~1180px) reading surface with width-responsive staff sizing;
  the staff is the primary surface and the piano is a muted support strip
- Toggleable fingering annotations (1–5): RH above the staff, LH below, per engraving convention
- Hint modes: full labels · landmark labels · interval hints · no hints
- Diagnostic feedback with strict / forgiving answer modes (missed / extra / wrong-octave)
- Response-time tracking (fluency), adaptive practice, and a scored rhythm timing loop
- Metronome with time signature, subdivisions, count-in
- Exercise builder: custom roots, chord types, inversions, rhythm mode
- Stats: accuracy by level, weak/extra/octave notes, response time, rhythm timing, suggested next drill

## Pieces: upload · analyze · train
The **pieces** tab accepts uploaded scores and turns them into interactive practice:

- **Formats**: `.musicxml` / `.xml` (DOMParser), `.mxl` (built-in ZIP reader +
  `DecompressionStream`), `.mid` / `.midi` (built-in SMF parser), and experimental optical
  recognition for `.png` / `.jpg` (staff-line + notehead detection) and `.pdf`
  (rasterized via pdf.js from CDN, then OMR). Exact-data formats are always preferred;
  OMR is an honest MVP for clean, printed, single-line scores and approximates rhythm.
- **Robust import pipeline**: the MusicXML parser recovers chords, dual staves, dynamics,
  imported fingerings, and ties (including ties held over the barline, which extend the
  sustained note instead of dropping the continuation). The optical reader adds a
  multi-stage front end — grayscale + contrast normalization, **Otsu adaptive
  thresholding**, and **projection-profile deskew** for slightly rotated scans.
- **Measure Validation Engine**: after parsing, every measure's bar-line arithmetic is
  checked against the meter (e.g. a 4/4 bar must hold four beats). Notes that overflow the
  barline are flagged and non-destructively redistributed into the following measure —
  straddling notes split and tie over, notes wholly past the line move — so nothing is
  dropped. Corrections are surfaced in the import status line.
- **Analysis**: key signature is taken from the file when present, otherwise inferred with
  the Krumhansl–Schmuckler profile method. Every note gets a recommended fingering —
  chords via pedagogical cluster rules (1-3-5, 1-2-5, …), melodic lines via a
  dynamic-programming model of hand position, thumb-under and cross-over technique.
- **Native rendering**: parsed pieces render on the same canvas staff (measures, barlines,
  key/time signatures, half/whole noteheads, cursor highlighting) and are played through
  the existing mic / MIDI / simulate answer loop.
- **Play-assessment → practice plan**: an assessment run records per-measure accuracy and
  response time, flags difficult measures, and generates a plan — weak measures isolated
  hands-separate at 60% tempo, recombined at 70%, then full-piece tempo ramping to 100%.
  Each plan step launches practice pre-configured (measure range, hand, tempo).

## Editor: correct · compose · export
The **editor** tab is a drag-and-drop notation editor and authoring tool built on the same
canvas engine:

- **Notation palette**: note durations (whole → 32nd, dotted), rests, accidentals
  (𝄫 ♭ ♮ ♯ 𝄪), fingerings (1–5), and dynamics (pp–ff).
- **Direct staff interaction**: pick a duration/accidental and click a staff line or space
  to place a note with pitch snapping; click a notehead to select it, then drag up/down (or
  use ↑/↓) to change pitch, retap a duration to re-value it, or apply fingerings/dynamics.
- **Undo / redo**: a full history stack (Ctrl+Z / Ctrl+Shift+Z) with unbounded steps per
  session; a fresh edit truncates the redo branch.
- **Create from scratch**: the *new score* wizard sets title, composer, staff type (grand /
  treble / bass), key, time signature and tempo, then opens a blank measure-bounded canvas
  that auto-expands as you add notes.
- **Correct imports**: any library piece can be loaded into the editor to fix OMR mistakes.
- **Persistence & export**: save authored scores straight to the library (fully integrated
  with practice, playback, MIDI input and fingering suggestions), or export to
  `.musicxml`, `.midi`, and `.pdf`. The MusicXML and MIDI writers round-trip through the
  importers.

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

### UAT: sheet-music import accuracy
`tests/uat/sheet_music_import/` is a User Acceptance benchmark: 12 independently-encoded
MusicXML samples (lead sheets, grand-staff pieces, dense classical, 3/4·6/8·9/8 meters,
sharp/flat/minor keys, cross-barline ties) plus ground-truth JSON. The runner parses each
file with the real in-app parser, scores pitch + duration accuracy against ground truth,
and asserts the **>95% Import Accuracy Score** target. It also exercises the OMR + deskew
path on synthetic clean and rotated staves.

```
npm run uat           # run the accuracy benchmark (part of `npm test`)
npm run uat:report    # write tests/uat/sheet_music_import/report/accuracy-report.md
npm run uat:generate  # regenerate samples + ground truth from the note specs
```

See `tests/uat/sheet_music_import/README.md` for details.

## Known limitations / future ideas
- Mic detection remains unreliable for chords (MIDI recommended)
- Rhythm challenge is an MVP scored timing loop — no rhythmic notation yet
- Adaptive mode biases root/type generation from recent misses; not a full mastery model
