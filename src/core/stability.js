// Build Order puzzles that need the physics: a remembered verdict per set of
// parts, the "keep it up" search, and the "stands or falls?" cases.

import { settle } from './physics.js';
import { slideOut } from './tectonics.js';
import { shuffle } from './rand.js';

// the physics' word on a model, remembered per set of parts
//   check(ids) → { stands, falling, lean };  stable(set) → bool (for tectonics.js searches)
export function createVerdicts(m, { ignore = [] } = {}) {
  const memo = new Map();
  const check = ids => {
    const list = [...ids];
    if (!list.length) return { stands: true, falling: [], lean: null };
    const k = list.sort().join(',');
    if (!memo.has(k)) memo.set(k, settle(m, list, { ignore }));
    return memo.get(k);
  };
  return { check, stable: set => check(set).stands, memo };
}

// Keep it up: can part id come out now, with the outlined parts still up?
export function canStrip(m, V, present, id, keep) {
  if (keep.has(id)) return { ok: false, why: 'keep' };
  const r = slideOut(m, present, id);
  if (!r.ok) return r;
  const rest = [...present].filter(x => x !== id);
  const v = V.check(rest);
  return v.stands ? r : { ok: false, why: 'falls', falling: v.falling, lean: v.lean };
}

// the longest run of parts out found by a few greedy tries (offline: levels.js
// keeps the target and its order; hints start from the current state)
export function keepSearch(m, V, keep, rng, { runs = 12, from = m.goal } = {}) {
  let best = [];
  for (let r = 0; r < runs; r++) {
    const s = new Set(from), order = [];
    for (;;) {
      const id = shuffle(rng, [...s]).find(x => canStrip(m, V, s, x, keep).ok);
      if (!id) break;
      s.delete(id); order.push(id);
    }
    if (order.length > best.length) best = order;
  }
  return best;
}

// Stands or falls? Versions of the building with a part or two missing, each a
// real question: something rested on what is gone. Picks `n` with both answers
// among them when it can, the surprises (a cantilever that holds, a block that
// was not carrying anything yet brings the rest down) first.
// With temporary works (an arch's centering) some versions keep them in place.
// A case: { without: ids, with: temporary ids, stands, falling, lean, surprise }
export function testCases(m, V, rng, { n = 3 } = {}) {
  const lasting = [...m.goal], temps = m.parts.filter(p => p.temp).map(p => p.id);
  // a part that carries something, and is not a slab or step lying on the ground
  // (without that, everything only drops a hand's breadth)
  const carries = id => lasting.some(q => q !== id && m.byId.get(q).on.some(alt => alt.includes(id)));
  const footing = id => { const b = m.byId.get(id).bbox; return b[2] < 1e-6 && b[5] < .5; };
  const seen = new Set(), cands = [];
  const tryCase = (without, w = []) => {
    const k = [...without].sort().join(',') + '|' + w.join(',');
    if (seen.has(k) || without.length >= lasting.length - 1) return;
    seen.add(k);
    const left = [...lasting.filter(id => !without.includes(id)), ...w];
    const v = V.check(left);
    // what the rules of thumb say: it falls if a part lost everything it rested on
    const naive = left.some(q => { const p = m.byId.get(q); return p.on.length && !p.on.some(alt => alt.every(x => left.includes(x))); });
    cands.push({ without, with: w, stands: v.stands, falling: v.falling, lean: v.lean, surprise: naive === v.stands });
  };
  const carriers = shuffle(rng, lasting.filter(id => carries(id) && !footing(id)));
  for (const id of carriers.slice(0, 9)) tryCase([id]);
  for (let i = 0; i < 8 && carriers.length > 1; i++) { const [a, b] = shuffle(rng, carriers); tryCase([a, b]); }
  if (temps.length) for (const id of carriers.slice(0, 6)) tryCase([id], temps);
  const out = [];
  const take = c => { if (c && !out.includes(c) && out.length < n) out.push(c); };
  take(cands.find(c => c.surprise));
  take(cands.find(c => c.stands && !out.includes(c)));
  take(cands.find(c => !c.stands && !out.includes(c)));
  for (const c of cands) take(c);
  return shuffle(rng, out);
}
