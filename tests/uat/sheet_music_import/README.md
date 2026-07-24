# UAT — Sheet-Music Import Accuracy

A User Acceptance Testing benchmark for ChordPath's file-import pipeline. It proves that
uploaded scores are parsed into correct note data (pitches, durations, hands, measures,
key/time signatures) by scoring the app's real parser against hand-declared ground truth.

## Layout

```
sheet_music_import/
├── samples/               # 12 benchmark .musicxml files (the "uploads")
├── ground-truth/          # matching .json — the canonical note model each file encodes
├── manifest.json          # category / key / meter index of the benchmark
├── accuracy.cjs           # pure scoring module (pitch + duration accuracy)
├── generate.mjs           # regenerates samples + ground truth from note specs
├── import-accuracy.spec.ts# automated UAT: runs under `npm test`, asserts >95%, writes report
├── report.mjs             # standalone report generator (no test runner needed)
└── report/                # generated accuracy-report.md / .json
```

## Benchmark coverage

The 12 samples span every category in the product spec:

| Category | Samples |
|---|---|
| Simple single-line lead sheets | `01-lead-sheet-c-major`, `02-lead-sheet-syncopation` |
| Grand-staff beginner piano | `03-grand-staff-beginner`, `04-grand-staff-broken-chords` |
| Dense multi-measure classical | `08-classical-dense` |
| Complex time signatures | `05-waltz-3-4` (3/4), `06-compound-6-8` (6/8), `07-compound-9-8` (9/8), `12-minor-key-waltz` (3/4) |
| Multiple key signatures | `09-key-a-flat-major` (4♭), `10-key-e-major` (4♯), `12-minor-key-waltz` (minor) |
| Ties / sustains over the barline | `11-ties-and-sustains` |
| Low-res / skewed optical scans | exercised in-spec: synthetic clean + rotated staves scored through the OMR + deskew pipeline |

The MusicXML in `samples/` is encoded independently of the app's own exporter (varied
`divisions`, explicit rests, cross-measure tie encodings, chords, fingerings, dynamics),
so parsing it is a genuine test rather than a round-trip of our own writer.

## Running

```bash
# as part of the automated suite (asserts the >95% Import Accuracy Score)
npm test

# just the UAT
npm run uat

# generate the report on demand, without the test runner
npm run uat:report
```

The **Import Accuracy Score** is a weighted blend of per-note pitch accuracy (60%) and
duration accuracy (40%), penalized for spurious extra events. Per-file and aggregate
scores are written to `report/accuracy-report.md`. The suite fails if average pitch or
duration accuracy drops below 95%, or if any key/time signature is misread.

## Regenerating the benchmark

Edit the note specs in `generate.mjs`, then:

```bash
node tests/uat/sheet_music_import/generate.mjs
```

This rewrites both `samples/*.musicxml` and `ground-truth/*.json` from the same source of
truth, keeping them consistent.
