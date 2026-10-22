// Paper folding on a square lattice.
//
// An n x n sheet is folded along lattice lines (grid lines or 45-degree
// diagonals), each fold laying one side over the other, and then punched.
// The paper is kept as facets: convex pieces of the original sheet, each with
// the isometry M that carries it to where it now lies and its height z in the
// stack. Coordinates are sheet units, x right, y down.

import { randInt, shuffle } from './rand.js';

// 2d affine maps [a, b, c, d, e, f]: x' = a x + b y + e, y' = c x + d y + f
export const IDENTITY = [1, 0, 0, 1, 0, 0];
export const apply = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[4], M[2] * p[0] + M[3] * p[1] + M[5]];
export const det = M => M[0] * M[3] - M[1] * M[2];
// A after B
export const compose = (A, B) => [
  A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
  A[0] * B[4] + A[1] * B[5] + A[4], A[2] * B[4] + A[3] * B[5] + A[5]];
export function invert(M) {
  const k = 1 / det(M);
  const a = M[3] * k, b = -M[1] * k, c = -M[2] * k, d = M[0] * k;
  return [a, b, c, d, -(a * M[4] + b * M[5]), -(c * M[4] + d * M[5])];
}

// a fold line through lattice point p with direction d (grid or diagonal)
export const line = (p, d) => ({ p, d });
export function reflection({ p, d }) {
  const l = Math.hypot(d[0], d[1]), x = d[0] / l, y = d[1] / l;
  const a = x * x - y * y, b = 2 * x * y;
  return [a, b, b, -a, p[0] - (a * p[0] + b * p[1]), p[1] - (b * p[0] - a * p[1])];
}
// which side of the line q is on: +1, -1 (0 on it)
export const sideOf = ({ p, d }, q) => Math.sign(d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0]));
const signed = ({ p, d }, q) => (d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0])) / Math.hypot(d[0], d[1]);

// the part of a convex polygon on one side of a line (Sutherland-Hodgman)
export function clip(poly, ln, side) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = signed(ln, a) * side, db = signed(ln, b) * side;
    if (da >= -1e-9) out.push(a);
    if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}
export const centroid2 = poly => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);

// distance from q to a convex polygon's boundary, positive inside, negative outside
export function insideBy(poly, q) {
  let m = Infinity, inside = true;
  const n = poly.length, o = orient(poly);
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const s = o * (ex * (q[1] - a[1]) - ey * (q[0] - a[0])) / l;
    if (s < 0) inside = false;
    m = Math.min(m, Math.abs(s));
  }
  if (inside) return m;
  // outside: the true distance to the polygon
  let d = Infinity;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(q, poly[i], poly[(i + 1) % n]));
  return -d;
}
function orient(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.sign(s) || 1;
}
function segDist(q, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2));
  return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy);
}

// ------------------------------------------------------------------
// the sheet
// ------------------------------------------------------------------
export function flatSheet(n) {
  const sq = [[0, 0], [n, 0], [n, n], [0, n]];
  return { n, folds: 0, facets: [{ poly: sq, M: IDENTITY, z: 0, hist: 0 }], outline: sq };
}

// Fold the side `moving` (+1 or -1, see sideOf) of the line over onto the other.
// Every facet keeps its fold history: bit k is set if fold k turned it over.
// Returns the new sheet and what is needed to animate it: the pieces that moved
// and where in the stack each came from.
export function fold(sheet, ln, moving) {
  const R = reflection(ln), k = sheet.folds || 0;
  const stay = [], move = [];
  let zTop = 0;
  for (const f of sheet.facets) zTop = Math.max(zTop, f.z);
  for (const f of sheet.facets) {
    const cur = f.poly.map(p => apply(f.M, p)), inv = invert(f.M);
    const keep = clip(cur, ln, -moving), go = clip(cur, ln, moving);
    if (keep.length > 2 && area(keep) > 1e-7) stay.push({ poly: keep.map(p => apply(inv, p)), M: f.M, z: f.z, hist: f.hist || 0 });
    if (go.length > 2 && area(go) > 1e-7) move.push({ poly: go.map(p => apply(inv, p)), M: compose(R, f.M), zPre: f.z, hist: (f.hist || 0) | 1 << k });
  }
  // the stack that turns over lands upside down on top: its bottom layer ends highest
  let zMove = 0;
  for (const m of move) zMove = Math.max(zMove, m.zPre);
  for (const m of move) m.z = zTop + 1 + (zMove - m.zPre);
  return {
    sheet: { n: sheet.n, folds: k + 1, facets: [...stay, ...move], outline: clip(sheet.outline, ln, -moving) },
    step: { line: ln, moving, R, moved: move.length },          // the moved facets are the last `moved`
  };
}

// every fold of the current outline along a lattice line whose flap lands
// entirely on the paper that stays
export function candidateFolds(sheet, diagonals) {
  const { n, outline } = sheet, out = [];
  const lines = [];
  for (let k = 1; k < n; k++) { lines.push(line([k, 0], [0, 1])); lines.push(line([0, k], [1, 0])); }
  if (diagonals) for (let c = -n + 1; c < 2 * n; c++) { lines.push(line([c, 0], [1, 1])); lines.push(line([c, 0], [1, -1])); }
  const whole = area(outline);
  for (const ln of lines) for (const moving of [1, -1]) {
    const go = clip(outline, ln, moving), keep = clip(outline, ln, -moving);
    if (go.length < 3 || keep.length < 3) continue;
    const ag = area(go);
    if (ag < 1e-6 || area(keep) < 1e-6) continue;
    const R = reflection(ln);
    if (go.some(p => insideBy(keep, apply(R, p)) < -1e-6)) continue;
    out.push({ line: ln, moving, share: ag / whole });
  }
  return out;
}

// the facets lying over point q (current coordinates), each giving the point of
// the original sheet that is there: a punch at q makes a hole at every one
export function holesAt(sheet, q) {
  const out = [];
  for (const f of sheet.facets) {
    if (insideBy(f.poly.map(p => apply(f.M, p)), q) > 1e-6) out.push(apply(invert(f.M), q));
  }
  return out;
}

// The folds a punch through these layers makes count: fold k counts when some of
// the layers were turned over by it and some were not, so the punch goes through
// both sides of that crease. A bit mask over the folds.
export function foldsUsed(facets) {
  let or = 0, and = -1;
  for (const f of facets) { or |= f.hist || 0; and &= f.hist || 0; }
  return facets.length ? or & ~and : 0;
}
export const facetsAt = (sheet, q) => sheet.facets.filter(f => insideBy(f.poly.map(p => apply(f.M, p)), q) > 1e-6);
export const allFolds = sheet => (1 << (sheet.folds || 0)) - 1;

// is q clear of every crease and edge by at least m?
export function clearOfEdges(sheet, q, m) {
  for (const f of sheet.facets) {
    if (Math.abs(insideBy(f.poly.map(p => apply(f.M, p)), q)) < m) return false;
  }
  return true;
}

// ------------------------------------------------------------------
// a question: folds, then punches at cell centres
// opts: { n, folds, diagonals (at least one fold is then diagonal), punches, maxHoles }
// ------------------------------------------------------------------
export const diagonal = ln => ln.d[0] !== 0 && ln.d[1] !== 0;

export function randomFolding(rng, { n = 6, folds = 2, diagonals = false, punches = 1, maxHoles = 12 }) {
  for (let t = 0; t < 400; t++) {
    let sheet = flatSheet(n);
    const states = [sheet], steps = [];
    let ok = true;
    for (let f = 0; f < folds; f++) {
      let cands = candidateFolds(sheet, diagonals && (f > 0 || folds === 1 || rng() < .5));
      // flaps worth folding: not a sliver
      cands = cands.filter(c => c.share >= .2);
      if (!cands.length) { ok = false; break; }
      // a first fold in half reads best; later ones can be anything that fits
      const halves = cands.filter(c => Math.abs(c.share - .5) < 1e-6);
      const pickFrom = f === 0 && halves.length && rng() < .7 ? halves : cands;
      const c = pickFrom[randInt(rng, pickFrom.length)];
      const r = fold(sheet, c.line, c.moving);
      sheet = r.sheet; states.push(sheet); steps.push(r.step);
    }
    if (!ok || (diagonals && !steps.some(st => diagonal(st.line)))) continue;

    // punch at cell centres well inside the folded paper, clear of every crease,
    // preferring places where more layers lie
    const spots = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = [i + .5, j + .5];
      if (insideBy(sheet.outline, q) < .3 || !clearOfEdges(sheet, q, .22)) continue;
      const under = facetsAt(sheet, q);
      spots.push({ q, layers: under.length, used: foldsUsed(under) });
    }
    if (spots.length < punches) continue;
    // every fold must count: together the punches go through both sides of every crease
    const full = allFolds(sheet);
    const sets = [];
    const pickSets = (from, set, mask) => {
      if (set.length === punches) { if (mask === full) sets.push(set); return; }
      for (let i = from; i < spots.length; i++) pickSets(i + 1, [...set, spots[i]], mask | spots[i].used);
    };
    if (punches) pickSets(0, [], 0);
    if (punches && !sets.length) continue;
    const chosen = punches ? shuffle(rng, sets[randInt(rng, sets.length)]) : [];
    const holes = [];
    for (const s of chosen) for (const h of holesAt(sheet, s.q)) holes.push([Math.floor(h[0]), Math.floor(h[1])]);
    const keys = new Set(holes.map(([i, j]) => i + ',' + j));
    if (keys.size !== holes.length) continue;        // two punches landing on one hole: ambiguous
    if (keys.size > maxHoles) continue;
    return { n, states, steps, punches: chosen.map(s => s.q), holes: [...keys] };
  }
  return null;
}
