// Fold & Punch puzzles over paper.js folds.
//
// A punch or a scissor cut is a shape: a few convex polygons (an L or an F is
// two or three rectangles). It goes through every layer of the folded stack at
// once; what it takes out of each layer is mapped back to the open sheet, so a
// hole is a convex polygon in the sheet's own coordinates (x right, y down).
// Opened, every hole is the shape seen through that layer's fold history:
// shifted, turned and, after an odd number of folds, mirrored.
//
//   holesOf(sheet, parts)         the holes a punch makes, on the open sheet
//   piecesOf(poly, holes)         a facet's paper left after the holes (convex pieces)
//   shapeAt(key, q, frame)        a shape's parts placed at q
//   holesQuestion / shapeQuestion / cutQuestion / reverseTarget
//
// Every question is deterministic for a given rng.

import { apply, invert, compose, clip, area, centroid2, line, sideOf, fold, flatSheet, candidateFolds, holesAt, clearOfEdges, insideBy, randomFolding, det, diagonal, foldsUsed, allFolds } from './paper.js';
import { randInt, pick, shuffle } from './rand.js';

// ------------------------------------------------------------------
// convex polygon helpers
// ------------------------------------------------------------------

const EPS = 1e-7;

// the half-planes of a convex polygon, each as [line, side that is inside]
function halfPlanes(P) {
  const c = centroid2(P), out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
    const ln = line(a, [b[0] - a[0], b[1] - a[1]]);
    out.push([ln, sideOf(ln, c) || 1]);
  }
  return out;
}

export function intersect(A, B) {
  let r = A;
  for (const [ln, s] of halfPlanes(B)) {
    r = clip(r, ln, s);
    if (r.length < 3) return [];
  }
  return area(r) > EPS ? r : [];
}

// A minus B, both convex: convex pieces
export function subtract(A, B) {
  const out = [];
  let rest = A;
  for (const [ln, s] of halfPlanes(B)) {
    const outside = clip(rest, ln, -s);
    if (outside.length > 2 && area(outside) > EPS) out.push(outside);
    rest = clip(rest, ln, s);
    if (rest.length < 3 || area(rest) < EPS) return out;
  }
  return out;                                   // what is left of rest lies inside B: gone
}

const bbox = P => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
const overlap = (a, b) => a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;

// the paper of one facet that the holes leave
export function piecesOf(poly, holes) {
  let pieces = [poly];
  for (const h of holes) {
    const hb = bbox(h);
    pieces = pieces.flatMap(p => overlap(bbox(p), hb) ? subtract(p, h) : [p]);
  }
  return pieces;
}

// ------------------------------------------------------------------
// shapes
// ------------------------------------------------------------------

const ngon = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => [r * Math.cos(a0 + i * 2 * Math.PI / n), r * Math.sin(a0 + i * 2 * Math.PI / n)]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// Punches sit in one cell (about .7 wide); y is down, so 'up' is -y.
// Cuts are drawn against a folded edge: the edge is y = 0 and the cut goes up into the paper (y < 0).
export const SHAPES = {
  round:  { kind: 'punch', name: 'round', parts: [ngon(16, .27)] },
  tri:    { kind: 'punch', name: 'triangle', parts: [[[-.3, .3], [.3, .3], [-.3, -.3]]], chiral: true },
  moon:   { kind: 'punch', name: 'half-moon', parts: [[[-.12, -.3], ...Array.from({ length: 9 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 8; return [-.12 + .3 * Math.cos(a), .3 * Math.sin(a)]; })]], chiral: true },
  ell:    { kind: 'punch', name: 'L', parts: [rect(-.28, -.32, -.08, .32), rect(-.08, .12, .28, .32)], chiral: true },
  eff:    { kind: 'punch', name: 'F', parts: [rect(-.26, -.32, -.06, .32), rect(-.06, -.32, .28, -.13), rect(-.06, -.04, .16, .12)], chiral: true },
  notch:  { kind: 'cut', name: 'notch', parts: [[[-.55, 0], [.55, 0], [0, -.9]]] },
  // half a house lying along the fold: opened, a whole house with its ridge on the crease
  house:  { kind: 'cut', name: 'house', parts: [rect(-.65, -.5, .3, 0), [[.28, 0], [.28, -.66], [1, 0]]] },
  step:   { kind: 'cut', name: 'step', parts: [rect(-.6, -.45, .6, 0), rect(-.25, -1.05, .6, -.45)], chiral: true },
  flag:   { kind: 'cut', name: 'flag', parts: [rect(-.12, -1.3, .12, 0), [[.12, -1.3], [.75, -1.05], [.12, -.8]]], chiral: true },
  // half a doorway along the fold: opened, a round-headed arch
  arch:   { kind: 'cut', name: 'arch', parts: [rect(-.75, -.42, .15, 0), [[.15, 0], ...Array.from({ length: 7 }, (_, i) => { const a = Math.PI / 2 - i * Math.PI / 12; return [.15 + .42 * Math.cos(a), -.42 * Math.sin(a)]; })]] },
};

// a shape's parts at q; frame = [u, v]: where the shape's x and y axes point
export function shapeAt(key, q, frame = [[1, 0], [0, 1]]) {
  const [u, v] = frame;
  return SHAPES[key].parts.map(P => P.map(([x, y]) => [q[0] + x * u[0] + y * v[0], q[1] + x * u[1] + y * v[1]]));
}

// ------------------------------------------------------------------
// punching
// ------------------------------------------------------------------

// the holes a punch with these parts (current coordinates) makes in every layer,
// as convex polygons on the open sheet; each knows its layer's map
export function holesOf(sheet, parts) {
  const out = [];
  for (const f of sheet.facets) {
    const cur = f.poly.map(p => apply(f.M, p)), inv = invert(f.M);
    for (const P of parts) {
      const X = intersect(P, cur);
      if (X.length) out.push(X.map(p => apply(inv, p)));
    }
  }
  return out;
}

// the layers a punch with these parts goes through
export function facetsUnder(sheet, parts) {
  return sheet.facets.filter(f => {
    const cur = f.poly.map(p => apply(f.M, p));
    return parts.some(P => { const X = intersect(P, cur); return X.length > 2 && area(X) > 1e-4; });
  });
}
// does every fold count for this punch or cut? (see paper.js foldsUsed)
export const everyFoldCounts = (sheet, parts) => foldsUsed(facetsUnder(sheet, parts)) === allFolds(sheet);

// what a punch takes out, in current coordinates, layer by layer (the falling discs)
export function chipsOf(sheet, parts) {
  const out = [];
  for (const f of sheet.facets) {
    const cur = f.poly.map(p => apply(f.M, p));
    for (const P of parts) { const X = intersect(P, cur); if (X.length) out.push({ poly: X, z: f.z }); }
  }
  return out;
}

// a comparable signature of a set of holes (rounded centroids and areas)
export function signature(holes) {
  return holes.map(h => { const c = centroid2(h); return [c[0].toFixed(2), c[1].toFixed(2), area(h).toFixed(3)].join(':'); }).sort().join(';');
}
// a stronger one that also tells mirror images apart (rounded vertices)
export function shapeSignature(holes) {
  return holes.map(h => h.map(p => p.map(v => (Math.round(v * 50) / 50).toFixed(2)).join(',')).sort().join(' ')).sort().join(';');
}

// replay a list of fold steps on a flat sheet
export function replay(n, steps) {
  let sheet = flatSheet(n);
  const states = [sheet];
  for (const st of steps) { sheet = fold(sheet, st.line, st.moving).sheet; states.push(sheet); }
  return states;
}

// ------------------------------------------------------------------
// questions
// ------------------------------------------------------------------

// Where are the holes? Round punches at cell centres: the answer is a set of cells.
export function holesQuestion(rng, { n = 4, folds = 1, diagonals = false, punches = 1, maxHoles = 12 } = {}) {
  const q = randomFolding(rng, { n, folds, diagonals, punches, maxHoles });
  if (!q) return null;
  const sheet = q.states[q.states.length - 1];
  const holes = q.punches.flatMap(p => holesOf(sheet, shapeAt('round', p)));
  return { ...q, shape: 'round', parts: q.punches.map(p => shapeAt('round', p)), holeShapes: holes };
}

// the four answers of a multiple-choice sheet: the right holes and three wrong
// ones, each a mistake a person makes when unfolding in their head
function wrongs(rng, n, steps, sheet, parts, q, correct) {
  const seen = new Set([shapeSignature(correct)]);
  const out = [];
  const add = (holes, why) => {
    if (!holes || !holes.length) return;
    const s = shapeSignature(holes);
    if (seen.has(s)) return;
    seen.add(s); out.push({ holes, why });
  };
  // each layer's own holes, turned about where the punch landed in it
  const layers = sheet.facets.map(f => ({ f, c: apply(invert(f.M), q), holes: holesOf({ facets: [f] }, parts) })).filter(l => l.holes.length);
  const about = (c, L) => p => [c[0] + L[0] * (p[0] - c[0]) + L[1] * (p[1] - c[1]), c[1] + L[2] * (p[0] - c[0]) + L[3] * (p[1] - c[1])];
  const remap = choose => layers.flatMap(l => {
    const L = choose(l);
    if (!L) return l.holes;
    const tr = about(l.c, L);
    return l.holes.map(h => intersect(h.map(tr), l.f.poly)).filter(h => h.length);
  });
  const flipped = l => det(l.f.M) < 0;
  const cands = shuffle(rng, [
    [() => remap(l => [l.f.M[0], l.f.M[1], l.f.M[2], l.f.M[3]]), 'the shape only slides: it never flips'],
    [() => remap(l => flipped(l) ? [-1, 0, 0, -1] : null), 'the flipped copies are turned, not mirrored'],
    [() => remap(() => [0, -1, 1, 0]), 'every copy is a quarter turn out'],
    [() => remap(l => flipped(l) ? null : [-1, 0, 0, 1]), 'mirrors the copies that should not be'],
  ]);
  // the last fold the other way over
  const last = steps[steps.length - 1];
  const alt = replay(n, [...steps.slice(0, -1), { line: last.line, moving: -last.moving }]);
  const altSheet = alt[alt.length - 1];
  if (insideBy(altSheet.outline, q) > .05) add(holesOf(altSheet, parts), 'the last fold went the other way');
  // one fold fewer
  if (steps.length > 1) {
    const fewer = replay(n, steps.slice(0, -1));
    add(holesOf(fewer[fewer.length - 1], parts), 'it forgets the last fold');
  }
  for (const [make, why] of cands) add(make(), why);
  return shuffle(rng, out.slice(0, 2).concat(shuffle(rng, out.slice(2)))).slice(0, 3);
}

// Which way round? An asymmetric punch; pick the open sheet.
export function shapeQuestion(rng, { n = 4, folds = 2, diagonals = false, shape = 'ell' } = {}) {
  for (let t = 0; t < 60; t++) {
    const q = randomFolding(rng, { n, folds, diagonals, punches: 1, maxHoles: 16 });
    if (!q) continue;
    const sheet = q.states[q.states.length - 1];
    const p = q.punches[0];
    const turn = randInt(rng, 4);
    const frames = [[[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]], [[0, -1], [1, 0]]];
    const fr = frames[turn];
    const parts = shapeAt(shape, p, fr);
    if (!everyFoldCounts(sheet, parts)) continue;
    const correct = holesOf(sheet, parts);
    if (correct.length < 2) continue;
    const bad = wrongs(rng, n, q.steps, sheet, parts, p, correct);
    if (bad.length < 3) continue;
    const options = shuffle(rng, [{ holes: correct, ok: true }, ...bad]);
    return { n, steps: q.steps, states: q.states, shape, punch: p, parts, options };
  }
  return null;
}

// Snip: a scissor cut against a folded edge; pick the open sheet (lace, a chain of houses)
export function cutQuestion(rng, { n = 4, folds = 2, diagonals = false, shape = 'house' } = {}) {
  for (let t = 0; t < 80; t++) {
    const q = randomFolding(rng, { n, folds, diagonals, punches: 0, maxHoles: 99 });
    if (!q) continue;
    const sheet = q.states[q.states.length - 1];
    // a folded edge: the last crease, where it bounds the folded outline
    const st = q.steps[q.steps.length - 1];
    const seg = edgeOn(sheet.outline, st.line);
    if (!seg) continue;
    const L = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
    if (L < 1.4) continue;
    const u0 = [(seg[1][0] - seg[0][0]) / L, (seg[1][1] - seg[0][1]) / L];
    // into the paper: toward the side that stayed
    let v = [-u0[1], u0[0]];
    const probe = [(seg[0][0] + seg[1][0]) / 2 + v[0] * .2, (seg[0][1] + seg[1][1]) / 2 + v[1] * .2];
    if (insideBy(sheet.outline, probe) < 0) v = [-v[0], -v[1]];
    // the shape's y axis points up (-y) into the paper, so its +y is -v; x keeps the frame right-handed
    const fv = [-v[0], -v[1]];
    const fu = [fv[1], -fv[0]];
    const room = L / 2 - .7;
    const along = room > 0 ? (rng() - .5) * 2 * Math.min(room, .8) : 0;
    const c = [(seg[0][0] + seg[1][0]) / 2 + u0[0] * along, (seg[0][1] + seg[1][1]) / 2 + u0[1] * along];
    const snap = x => Math.round(x * 2) / 2;
    const at = [snap(c[0]), snap(c[1])];
    if (Math.abs(st.line.d[0] * (at[1] - st.line.p[1]) - st.line.d[1] * (at[0] - st.line.p[0])) > 1e-6) continue;
    const parts = shapeAt(shape, at, [fu, fv]);
    // the cut must stay on the paper away from the other edges
    if (parts.some(P => P.some(p => insideBy(sheet.outline, p) < -.6))) continue;
    if (!everyFoldCounts(sheet, parts)) continue;
    const correct = holesOf(sheet, parts);
    if (correct.length < 2) continue;
    const bad = wrongs(rng, n, q.steps, sheet, parts, at, correct);
    if (bad.length < 3) continue;
    const options = shuffle(rng, [{ holes: correct, ok: true }, ...bad]);
    return { n, steps: q.steps, states: q.states, shape, at, parts, options };
  }
  return null;
}

// the part of a convex outline's boundary that lies on a line: [a, b] or null
function edgeOn(outline, ln) {
  const on = outline.filter(p => Math.abs(ln.d[0] * (p[1] - ln.p[1]) - ln.d[1] * (p[0] - ln.p[0])) < 1e-6);
  if (on.length < 2) return null;
  on.sort((a, b) => (a[0] - b[0]) * ln.d[0] + (a[1] - b[1]) * ln.d[1]);
  return [on[0], on[on.length - 1]];
}

// Fold it yourself: a target sheet of round holes, made by some folds and punches.
// The player may find any folding that gives the same holes.
export function reverseTarget(rng, { n = 4, folds = 1, diagonals = false, punches = 1 } = {}) {
  const q = randomFolding(rng, { n, folds, diagonals, punches, maxHoles: 12 });
  if (!q) return null;
  return { n, folds, punches, diagonals, holes: q.holes, solution: q };
}

// the cells a round punch at q holes, on the open sheet
export function punchCells(sheet, q) {
  return holesAt(sheet, q).map(h => Math.floor(h[0]) + ',' + Math.floor(h[1]));
}

// can a round punch go at cell centre q? (inside the paper, off every crease)
export const punchable = (sheet, q) => insideBy(sheet.outline, q) > .28 && clearOfEdges(sheet, q, .22);

export { candidateFolds, fold, flatSheet, det, diagonal, apply, invert, compose, area, centroid2, insideBy, clip, line, sideOf };
