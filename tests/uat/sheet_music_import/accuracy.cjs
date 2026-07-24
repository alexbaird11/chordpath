// Import Accuracy scoring for the sheet-music UAT benchmark.
//
// Pure, dependency-free CommonJS (usable from the Playwright spec and the Node report
// script alike). Compares an imported piece (produced by the app's parsers) against a
// hand-declared ground-truth piece and reports pitch + duration accuracy.
//
// Method: events are keyed by (hand, measureIndex, onset). Each ground-truth event is
// matched to the imported event with the same hand + measure and the closest onset within
// a small tolerance. Pitch accuracy is the fraction of ground-truth noteheads also present
// in the matched event; duration accuracy is the fraction of matched events whose duration
// is within tolerance. Missing/extra events count against the score.

const ONSET_TOL = 0.03; // beats
const DUR_TOL = 0.03;   // beats

function eventsOf(piece) {
  const out = [];
  (piece.measures || []).forEach((m, mi) => (m.events || []).forEach((e) => {
    if (!e.midis || !e.midis.length) return; // rests are not scored
    out.push({ mi, hand: e.hand, onset: +(+e.onset).toFixed(4), duration: +(+e.duration).toFixed(4), midis: [...e.midis].sort((a, b) => a - b) });
  }));
  return out;
}

function scorePiece(expected, actual) {
  const exp = eventsOf(expected);
  const act = eventsOf(actual);
  const usedAct = new Set();
  let pitchTotal = 0, pitchHit = 0;
  let durMatched = 0, durHit = 0, matchedEvents = 0;

  for (const ge of exp) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < act.length; i++) {
      if (usedAct.has(i)) continue;
      const ae = act[i];
      if (ae.hand !== ge.hand || ae.mi !== ge.mi) continue;
      const d = Math.abs(ae.onset - ge.onset);
      if (d < bestD) { bestD = d; best = i; }
    }
    pitchTotal += ge.midis.length;
    if (best >= 0 && bestD <= ONSET_TOL) {
      usedAct.add(best);
      matchedEvents++;
      const aset = new Set(act[best].midis);
      for (const p of ge.midis) if (aset.has(p)) pitchHit++;
      durMatched++;
      if (Math.abs(act[best].duration - ge.duration) <= DUR_TOL) durHit++;
    }
  }
  const extraEvents = act.length - usedAct.size;
  const pitchAccuracy = pitchTotal ? pitchHit / pitchTotal : 1;
  const durationAccuracy = durMatched ? durHit / durMatched : 1;
  return {
    expectedEvents: exp.length,
    actualEvents: act.length,
    matchedEvents,
    extraEvents,
    pitchTotal,
    pitchHit,
    pitchAccuracy,
    durationAccuracy,
    // combined score also penalizes spurious extra events
    overallAccuracy: (pitchAccuracy * 0.6 + durationAccuracy * 0.4) * (exp.length ? Math.min(1, exp.length / Math.max(exp.length, act.length)) : 1),
  };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

module.exports = { scorePiece, pct };
