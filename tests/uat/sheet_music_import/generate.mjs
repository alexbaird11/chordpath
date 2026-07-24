// Generates the UAT benchmark: writes samples/*.musicxml (independently encoded, with
// varied divisions, explicit rests, cross-measure ties, chords, fingerings and dynamics)
// plus ground-truth/*.json (the canonical note model a correct parser must recover).
//
// The MusicXML writer here is intentionally NOT the app's exporter — it exercises the
// parser against realistic third-party-style encodings. Run:  node generate.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function midiToPitch(midi, fifths) {
  const names = fifths < 0 ? FLAT : SHARP;
  const nm = names[((midi % 12) + 12) % 12];
  const step = nm[0];
  const alter = nm.length > 1 ? (nm[1] === '#' ? 1 : -1) : 0;
  const octave = Math.floor(midi / 12) - 1;
  return { step, alter, octave };
}
function typeOf(d) {
  const t = [[4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd']];
  for (const [b, n] of t) { if (Math.abs(d - b) < 1e-4) return { type: n, dots: 0 }; if (Math.abs(d - b * 1.5) < 1e-4) return { type: n, dots: 1 }; }
  let best = t[2]; for (const e of t) if (Math.abs(e[0] - d) < Math.abs(best[0] - d)) best = e; return { type: best[1], dots: 0 };
}
function noteXML(midi, dur, fifths, div, opts = {}) {
  const { step, alter, octave } = midiToPitch(midi, fifths);
  const { type, dots } = typeOf(dur);
  let s = '   <note>\n';
  if (opts.chord) s += '    <chord/>\n';
  s += `    <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>\n`;
  s += `    <duration>${Math.round(dur * div)}</duration>\n`;
  if (opts.tie) opts.tie.forEach((t) => { s += `    <tie type="${t}"/>\n`; });
  s += `    <type>${type}</type>\n`;
  for (let i = 0; i < dots; i++) s += '    <dot/>\n';
  if (opts.staff) s += `    <staff>${opts.staff}</staff>\n`;
  const notations = [];
  if (opts.tie) opts.tie.forEach((t) => notations.push(`<tied type="${t}"/>`));
  if (opts.finger != null) notations.push(`<technical><fingering>${opts.finger}</fingering></technical>`);
  if (notations.length) s += `    <notations>${notations.join('')}</notations>\n`;
  s += '   </note>\n';
  return s;
}
function restXML(dur, div, staff) {
  const { type } = typeOf(dur);
  return `   <note><rest/><duration>${Math.round(dur * div)}</duration><type>${type}</type>${staff ? `<staff>${staff}</staff>` : ''}</note>\n`;
}

// Encode one hand's notes (array of {on,dur,mid:[..],finger,tie}) with rests filling gaps.
function encodeHand(notes, cap, fifths, div, staff) {
  const sorted = [...notes].sort((a, b) => a.on - b.on);
  let s = '', pos = 0;
  for (const n of sorted) {
    if (n.on > pos + 1e-6) { s += restXML(n.on - pos, div, staff); }
    const mids = [...n.mid].sort((a, b) => a - b);
    mids.forEach((m, i) => { s += noteXML(m, n.dur, fifths, div, { chord: i > 0, staff, finger: i === 0 ? n.finger : null, tie: i === 0 ? n.tie : null }); });
    pos = Math.max(pos, n.on + n.dur);
  }
  if (pos < cap - 1e-6) s += restXML(cap - pos, div, staff);
  return s;
}

// Build a MusicXML document + canonical ground truth from a spec.
// spec: { name, title, composer, fifths, mode, beats, beatType, tempo, div, grand, measures }
// measures: [ [ {h:'R'|'L', on, dur, mid:[..], finger?, dyn?, tieNext?} ... ] ... ]
// A note with tieNext:X is emitted as two tied notes (dur X then dur-X, possibly across the
// barline into the next measure's onset 0) but stays a single sustained event in the truth.
function build(spec) {
  const { fifths, mode, beats, beatType, div, grand } = spec;
  const cap = beats * 4 / beatType;
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
  xml += '<score-partwise version="3.1">\n';
  xml += ` <work><work-title>${spec.title}</work-title></work>\n`;
  xml += ` <identification><creator type="composer">${spec.composer || 'Anon'}</creator></identification>\n`;
  xml += ' <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>\n';
  xml += ' <part id="P1">\n';

  // ground truth accumulator
  const truthMeasures = spec.measures.map(() => ({ events: [] }));
  const addTruth = (mi, h, on, dur, mid, finger, dyn) => {
    const evs = truthMeasures[mi].events;
    let e = evs.find((x) => x.hand === h && Math.abs(x.onset - on) < 1e-6);
    if (!e) { e = { onset: on, duration: dur, midis: [], hand: h }; evs.push(e); }
    mid.forEach((m) => { if (!e.midis.includes(m)) e.midis.push(m); });
    e.duration = Math.max(e.duration, dur);
    if (finger != null && e.midis.length === 1) e.fingering = finger;
    if (dyn) e.dyn = dyn;
  };

  spec.measures.forEach((notes, mi) => {
    xml += `  <measure number="${mi + 1}">\n`;
    if (mi === 0) {
      xml += '   <attributes>\n';
      xml += `    <divisions>${div}</divisions>\n`;
      xml += `    <key><fifths>${fifths}</fifths><mode>${mode || 'major'}</mode></key>\n`;
      xml += `    <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>\n`;
      xml += `    <staves>${grand ? 2 : 1}</staves>\n`;
      xml += '    <clef number="1"><sign>G</sign><line>2</line></clef>\n';
      if (grand) xml += '    <clef number="2"><sign>F</sign><line>4</line></clef>\n';
      xml += '   </attributes>\n';
      if (spec.tempo) xml += `   <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${spec.tempo}</per-minute></metronome></direction-type><sound tempo="${spec.tempo}"/></direction>\n`;
    }
    // dynamics: emit a direction before the first R note that carries one
    const dynNote = notes.find((n) => n.dyn);
    if (dynNote) xml += `   <direction placement="below"><direction-type><dynamics><${dynNote.dyn}/></dynamics></direction-type></direction>\n`;

    ['R', 'L'].forEach((hand) => {
      if (hand === 'L' && !grand) return;
      const staff = grand ? (hand === 'R' ? 1 : 2) : null;
      const handNotes = [];
      notes.filter((n) => n.h === hand).forEach((n) => {
        // ground truth: single sustained event
        addTruth(mi, hand, n.on, n.dur, n.mid, n.finger, n.dyn);
        if (n.tieNext != null) {
          const firstDur = n.tieNext, restDur = n.dur - n.tieNext;
          handNotes.push({ on: n.on, dur: firstDur, mid: n.mid, finger: n.finger, tie: ['start'] });
          const spill = n.on + firstDur - cap;
          if (spill > -1e-6 && mi + 1 < spec.measures.length) {
            // ties over the barline: the continuation lands in the next measure at onset 0
            spec.measures[mi + 1].__carry = spec.measures[mi + 1].__carry || [];
            spec.measures[mi + 1].__carry.push({ on: 0, dur: restDur, mid: n.mid, tie: ['stop'], hand });
          } else {
            handNotes.push({ on: n.on + firstDur, dur: restDur, mid: n.mid, tie: ['stop'] });
          }
        } else {
          handNotes.push({ on: n.on, dur: n.dur, mid: n.mid, finger: n.finger });
        }
      });
      // carried tie-continuations from the previous measure
      (notes.__carry || []).filter((c) => c.hand === hand).forEach((c) => handNotes.push(c));
      xml += hand === 'L' ? `   <backup><duration>${Math.round(cap * div)}</duration></backup>\n` : '';
      xml += encodeHand(handNotes, cap, fifths, div, staff);
    });
    xml += '  </measure>\n';
  });
  xml += ' </part>\n</score-partwise>\n';

  // finalize ground truth
  truthMeasures.forEach((m) => {
    m.events.sort((a, b) => a.onset - b.onset || (a.hand === b.hand ? 0 : a.hand === 'R' ? -1 : 1));
    m.events.forEach((e) => e.midis.sort((x, y) => x - y));
  });
  const truth = {
    title: spec.title, keyName: keyName(fifths, mode), fifths, mode: mode || 'major',
    timeSig: { beats, beatType }, tempo: spec.tempo,
    measures: truthMeasures.map((m, i) => ({ number: i + 1, events: m.events })),
  };
  return { xml, truth };
}
function keyName(fifths, mode) {
  const majorPc = ((fifths * 7) % 12 + 12) % 12;
  const tonic = (mode === 'minor') ? (majorPc + 9) % 12 : majorPc;
  return (fifths < 0 ? FLAT : SHARP)[tonic] + ' ' + (mode === 'minor' ? 'minor' : 'major');
}

// ——— The benchmark specs (12 pieces across the required categories) ———
const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79 };
const SPECS = [
  { name: '01-lead-sheet-c-major', title: 'Lead Sheet in C', category: 'simple single-line lead sheet', fifths: 0, mode: 'major', beats: 4, beatType: 4, tempo: 100, div: 2, grand: false, measures: [
    [{ h: 'R', on: 0, dur: 1, mid: [60], finger: 1, dyn: 'mf' }, { h: 'R', on: 1, dur: 1, mid: [62] }, { h: 'R', on: 2, dur: 1, mid: [64] }, { h: 'R', on: 3, dur: 1, mid: [65] }],
    [{ h: 'R', on: 0, dur: 2, mid: [67] }, { h: 'R', on: 2, dur: 2, mid: [64] }],
    [{ h: 'R', on: 0, dur: 1, mid: [65] }, { h: 'R', on: 1, dur: 1, mid: [64] }, { h: 'R', on: 2, dur: 1, mid: [62] }, { h: 'R', on: 3, dur: 1, mid: [60] }],
    [{ h: 'R', on: 0, dur: 4, mid: [60] }],
  ] },
  { name: '02-lead-sheet-syncopation', title: 'Syncopated Line', category: 'single-line lead sheet (eighths, dotted)', fifths: 1, mode: 'major', beats: 4, beatType: 4, tempo: 112, div: 4, grand: false, measures: [
    [{ h: 'R', on: 0, dur: 0.5, mid: [67] }, { h: 'R', on: 0.5, dur: 0.5, mid: [69] }, { h: 'R', on: 1, dur: 1, mid: [71] }, { h: 'R', on: 2, dur: 1.5, mid: [74] }, { h: 'R', on: 3.5, dur: 0.5, mid: [71] }],
    [{ h: 'R', on: 0, dur: 1, mid: [72] }, { h: 'R', on: 1, dur: 0.5, mid: [74] }, { h: 'R', on: 1.5, dur: 0.5, mid: [72] }, { h: 'R', on: 2, dur: 2, mid: [67] }],
  ] },
  { name: '03-grand-staff-beginner', title: 'First Piano Piece', category: 'grand staff beginner', fifths: 0, mode: 'major', beats: 4, beatType: 4, tempo: 84, div: 2, grand: true, measures: [
    [{ h: 'R', on: 0, dur: 1, mid: [60], finger: 1 }, { h: 'R', on: 1, dur: 1, mid: [62], finger: 2 }, { h: 'R', on: 2, dur: 1, mid: [64], finger: 3 }, { h: 'R', on: 3, dur: 1, mid: [65], finger: 4 },
     { h: 'L', on: 0, dur: 2, mid: [48], finger: 5 }, { h: 'L', on: 2, dur: 2, mid: [55], finger: 1 }],
    [{ h: 'R', on: 0, dur: 2, mid: [67], finger: 5 }, { h: 'R', on: 2, dur: 2, mid: [64], finger: 3 },
     { h: 'L', on: 0, dur: 4, mid: [48], finger: 5 }],
  ] },
  { name: '04-grand-staff-broken-chords', title: 'Broken Chords', category: 'grand staff, LH accompaniment', fifths: 1, mode: 'major', beats: 4, beatType: 4, tempo: 96, div: 4, grand: true, measures: [
    [{ h: 'R', on: 0, dur: 2, mid: [71] }, { h: 'R', on: 2, dur: 2, mid: [74] },
     { h: 'L', on: 0, dur: 0.5, mid: [43] }, { h: 'L', on: 0.5, dur: 0.5, mid: [50] }, { h: 'L', on: 1, dur: 0.5, mid: [55] }, { h: 'L', on: 1.5, dur: 0.5, mid: [50] }, { h: 'L', on: 2, dur: 0.5, mid: [43] }, { h: 'L', on: 2.5, dur: 0.5, mid: [50] }, { h: 'L', on: 3, dur: 0.5, mid: [55] }, { h: 'L', on: 3.5, dur: 0.5, mid: [50] }],
    [{ h: 'R', on: 0, dur: 4, mid: [67] },
     { h: 'L', on: 0, dur: 0.5, mid: [48] }, { h: 'L', on: 0.5, dur: 0.5, mid: [55] }, { h: 'L', on: 1, dur: 0.5, mid: [60] }, { h: 'L', on: 1.5, dur: 0.5, mid: [55] }, { h: 'L', on: 2, dur: 0.5, mid: [48] }, { h: 'L', on: 2.5, dur: 0.5, mid: [55] }, { h: 'L', on: 3, dur: 0.5, mid: [60] }, { h: 'L', on: 3.5, dur: 0.5, mid: [55] }],
  ] },
  { name: '05-waltz-3-4', title: 'Little Waltz', category: 'complex time signature 3/4', fifths: 2, mode: 'major', beats: 3, beatType: 4, tempo: 132, div: 2, grand: true, measures: [
    [{ h: 'R', on: 0, dur: 2, mid: [78] }, { h: 'R', on: 2, dur: 1, mid: [74] },
     { h: 'L', on: 0, dur: 1, mid: [50] }, { h: 'L', on: 1, dur: 1, mid: [57, 62] }, { h: 'L', on: 2, dur: 1, mid: [57, 62] }],
    [{ h: 'R', on: 0, dur: 2, mid: [76] }, { h: 'R', on: 2, dur: 1, mid: [73] },
     { h: 'L', on: 0, dur: 1, mid: [45] }, { h: 'L', on: 1, dur: 1, mid: [52, 57] }, { h: 'L', on: 2, dur: 1, mid: [52, 57] }],
    [{ h: 'R', on: 0, dur: 3, mid: [74] }, { h: 'L', on: 0, dur: 3, mid: [50, 57, 62] }],
  ] },
  { name: '06-compound-6-8', title: 'Compound Meter', category: 'complex time signature 6/8', fifths: -1, mode: 'major', beats: 6, beatType: 8, tempo: 120, div: 2, grand: false, measures: [
    // cap = 6*4/8 = 3 quarter beats; eighth = 0.5
    [{ h: 'R', on: 0, dur: 0.5, mid: [65] }, { h: 'R', on: 0.5, dur: 0.5, mid: [69] }, { h: 'R', on: 1, dur: 0.5, mid: [72] }, { h: 'R', on: 1.5, dur: 0.5, mid: [70] }, { h: 'R', on: 2, dur: 0.5, mid: [69] }, { h: 'R', on: 2.5, dur: 0.5, mid: [65] }],
    [{ h: 'R', on: 0, dur: 1.5, mid: [72] }, { h: 'R', on: 1.5, dur: 1.5, mid: [69] }],
  ] },
  { name: '07-compound-9-8', title: 'Nine Eight Study', category: 'complex time signature 9/8', fifths: 3, mode: 'major', beats: 9, beatType: 8, tempo: 108, div: 2, grand: false, measures: [
    // cap = 9*4/8 = 4.5
    [{ h: 'R', on: 0, dur: 0.5, mid: [76] }, { h: 'R', on: 0.5, dur: 0.5, mid: [78] }, { h: 'R', on: 1, dur: 0.5, mid: [80] }, { h: 'R', on: 1.5, dur: 1.5, mid: [83] }, { h: 'R', on: 3, dur: 0.5, mid: [80] }, { h: 'R', on: 3.5, dur: 0.5, mid: [78] }, { h: 'R', on: 4, dur: 0.5, mid: [76] }],
  ] },
  { name: '08-classical-dense', title: 'Classical Excerpt', category: 'dense multi-measure classical', fifths: -2, mode: 'major', beats: 4, beatType: 4, tempo: 92, div: 4, grand: true, measures: [
    [{ h: 'R', on: 0, dur: 0.5, mid: [70] }, { h: 'R', on: 0.5, dur: 0.5, mid: [74] }, { h: 'R', on: 1, dur: 0.5, mid: [77] }, { h: 'R', on: 1.5, dur: 0.5, mid: [82] }, { h: 'R', on: 2, dur: 1, mid: [79, 74] }, { h: 'R', on: 3, dur: 1, mid: [77, 70] },
     { h: 'L', on: 0, dur: 1, mid: [46, 58] }, { h: 'L', on: 1, dur: 1, mid: [53, 58] }, { h: 'L', on: 2, dur: 2, mid: [51, 58] }],
    [{ h: 'R', on: 0, dur: 1, mid: [75, 70] }, { h: 'R', on: 1, dur: 1, mid: [74, 70] }, { h: 'R', on: 2, dur: 0.5, mid: [72] }, { h: 'R', on: 2.5, dur: 0.5, mid: [74] }, { h: 'R', on: 3, dur: 1, mid: [75] },
     { h: 'L', on: 0, dur: 2, mid: [39, 55] }, { h: 'L', on: 2, dur: 2, mid: [46, 58] }],
    [{ h: 'R', on: 0, dur: 4, mid: [74, 70, 65] }, { h: 'L', on: 0, dur: 4, mid: [58, 46, 34] }],
  ] },
  { name: '09-key-a-flat-major', title: 'Study in A-flat', category: 'multiple key signatures (4 flats)', fifths: -4, mode: 'major', beats: 4, beatType: 4, tempo: 88, div: 2, grand: true, measures: [
    [{ h: 'R', on: 0, dur: 1, mid: [68] }, { h: 'R', on: 1, dur: 1, mid: [72] }, { h: 'R', on: 2, dur: 2, mid: [75] },
     { h: 'L', on: 0, dur: 2, mid: [44, 56] }, { h: 'L', on: 2, dur: 2, mid: [51, 56] }],
    [{ h: 'R', on: 0, dur: 2, mid: [80] }, { h: 'R', on: 2, dur: 2, mid: [75] },
     { h: 'L', on: 0, dur: 4, mid: [44, 56, 63] }],
  ] },
  { name: '10-key-e-major', title: 'Study in E', category: 'multiple key signatures (4 sharps)', fifths: 4, mode: 'major', beats: 4, beatType: 4, tempo: 100, div: 2, grand: false, measures: [
    [{ h: 'R', on: 0, dur: 1, mid: [64] }, { h: 'R', on: 1, dur: 1, mid: [68] }, { h: 'R', on: 2, dur: 1, mid: [71] }, { h: 'R', on: 3, dur: 1, mid: [73] }],
    [{ h: 'R', on: 0, dur: 2, mid: [76] }, { h: 'R', on: 2, dur: 1, mid: [75] }, { h: 'R', on: 3, dur: 1, mid: [71] }],
    [{ h: 'R', on: 0, dur: 4, mid: [64] }],
  ] },
  { name: '11-ties-and-sustains', title: 'Ties and Sustains', category: 'ties over the barline, sustains', fifths: 0, mode: 'major', beats: 4, beatType: 4, tempo: 76, div: 4, grand: true, measures: [
    // RH note tied across the barline: 2 beats in m1 + 2 beats in m2 = 4-beat sustain at m1 onset 2
    [{ h: 'R', on: 0, dur: 2, mid: [72] }, { h: 'R', on: 2, dur: 4, mid: [76], tieNext: 2 },
     { h: 'L', on: 0, dur: 4, mid: [48] }],
    [{ h: 'R', on: 2, dur: 2, mid: [74] },
     { h: 'L', on: 0, dur: 2, mid: [43] }, { h: 'L', on: 2, dur: 2, mid: [48] }],
    [{ h: 'R', on: 0, dur: 4, mid: [72] }, { h: 'L', on: 0, dur: 4, mid: [48] }],
  ] },
  { name: '12-minor-key-waltz', title: 'Minor Waltz', category: 'minor key, 3/4', fifths: 0, mode: 'minor', beats: 3, beatType: 4, tempo: 120, div: 2, grand: false, measures: [
    [{ h: 'R', on: 0, dur: 1, mid: [69] }, { h: 'R', on: 1, dur: 1, mid: [72] }, { h: 'R', on: 2, dur: 1, mid: [76] }],
    [{ h: 'R', on: 0, dur: 2, mid: [77] }, { h: 'R', on: 2, dur: 1, mid: [76] }],
    [{ h: 'R', on: 0, dur: 1, mid: [74] }, { h: 'R', on: 1, dur: 1, mid: [72] }, { h: 'R', on: 2, dur: 1, mid: [71] }],
    [{ h: 'R', on: 0, dur: 3, mid: [69] }],
  ] },
];

let manifest = [];
for (const spec of SPECS) {
  const { xml, truth } = build(spec);
  writeFileSync(join(DIR, 'samples', spec.name + '.musicxml'), xml);
  writeFileSync(join(DIR, 'ground-truth', spec.name + '.json'), JSON.stringify(truth, null, 2) + '\n');
  manifest.push({ name: spec.name, title: spec.title, category: spec.category, key: truth.keyName, time: `${spec.beats}/${spec.beatType}`, grand: !!spec.grand });
}
writeFileSync(join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`generated ${SPECS.length} samples + ground truth into ${DIR}`);
