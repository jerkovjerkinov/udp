// The rules a Developments level can add to cutting open, and the two newer
// puzzles: drawing on the net, and mending a net.
//
// Cutting rules (a level's opts):
//   paper [w, h]   the flat net has to fit on this sheet
//   line  true     the cuts are one unbroken scissor line through the corners
//   keep  'walls' | 'roof'
//                  those faces stay joined to each other, in one piece on the
//                  sheet: the walls as one unrolled elevation, the roof as one sheet
//
//   keptFaces(solid, keep)       the faces a keep rule names
//   keptWhole(solid, kept, cuts) do they still hold together through uncut edges?
//   lineStep(solid, cuts, eid)   can this cut carry the line on? null, or why not
//   lineEnds(solid, cuts)        the cuts at either end of the line (the ones you can take back)
//   verdict(solid, cuts, rules)  for a full set of cuts: null when every rule holds
//   solutions(solid, rules, o)   cut sets that pass, for hints and for the tests
//
// Drawing on the net:
//   rotations(solid)             the turns that carry the solid onto itself, as face maps
//   drawRounds(solid, net, rng)  a face marked on both, and faces to find on the net
//
// Mending a net: misfit() in nettasks.js moves a face; mended() says whether
// hanging it from a given edge puts it right.

import { unfold, hingesFromCuts } from './poly.js';
import { baseFace, sheetFit } from './nettasks.js';
import { shuffle } from './rand.js';
import { sub, dot, cross, len } from './vec.js';

// ------------------------------------------------------------------
// keep in one piece
// ------------------------------------------------------------------

export function keptFaces(solid, keep) {
  if (keep === 'walls') return solid.faces.filter(f => Math.abs(f.n[2]) < 1e-6).map(f => f.id);
  if (keep === 'roof') return solid.faces.filter(f => f.n[2] > 1e-6).map(f => f.id);
  return [];
}

export function keptWhole(solid, kept, cuts) {
  if (kept.length < 2) return true;
  const K = new Set(kept), cut = new Set(cuts), seen = new Set([kept[0]]), todo = [kept[0]];
  while (todo.length) {
    const f = todo.pop();
    for (const eid of solid.faces[f].edges) {
      if (cut.has(eid)) continue;
      const e = solid.edges[eid], g = e.f[0] === f ? e.f[1] : e.f[0];
      if (K.has(g) && !seen.has(g)) { seen.add(g); todo.push(g); }
    }
  }
  return seen.size === K.size;
}

// ------------------------------------------------------------------
// one scissor line
// ------------------------------------------------------------------

const degrees = (solid, cuts) => {
  const d = solid.verts.map(() => 0);
  for (const id of cuts) { const e = solid.edges[id]; d[e.a]++; d[e.b]++; }
  return d;
};

// 'branch': it starts from the middle of the line; 'jump': it does not touch the
// line; 'loop': both its ends are already on the line (it would cut a piece out)
export function lineStep(solid, cuts, eid) {
  if (!cuts.length) return null;
  const d = degrees(solid, cuts), e = solid.edges[eid];
  if (d[e.a] && d[e.b]) return 'loop';
  const on = d[e.a] ? e.a : d[e.b] ? e.b : -1;
  if (on < 0) return 'jump';
  return d[on] === 1 ? null : 'branch';
}

export function lineEnds(solid, cuts) {
  if (cuts.length <= 1) return cuts.slice();
  const d = degrees(solid, cuts);
  return cuts.filter(id => d[solid.edges[id].a] === 1 || d[solid.edges[id].b] === 1);
}

const isLine = (solid, cuts) => {
  const d = degrees(solid, cuts);
  if (d.some(k => k > 2)) return false;
  // a path: connected, one fewer edge than its corners
  const on = d.map((k, v) => k ? v : -1).filter(v => v >= 0);
  return on.length === cuts.length + 1 && hingesFromCuts(solid, cuts).pieces === 1;
};

// ------------------------------------------------------------------
// judging a full set of cuts
// ------------------------------------------------------------------

// null when the cuts open the solid into one flat net that keeps every rule;
// otherwise { why: 'apart' | 'closed' | 'overlap' | 'paper' | 'line' | 'keep', net?, fit? }
export function verdict(solid, cuts, rules = {}, root = baseFace(solid)) {
  const h = hingesFromCuts(solid, cuts);
  if (h.reason === 'pieces') return { why: 'apart' };
  if (!h.ok) return { why: 'closed' };
  if (rules.line && !isLine(solid, cuts)) return { why: 'line' };
  if (rules.keep && !keptWhole(solid, keptFaces(solid, rules.keep), cuts)) return { why: 'keep' };
  const net = unfold(solid, h.hinges, root);
  if (net.overlaps.length) return { why: 'overlap', net };
  if (rules.paper) {
    const fit = sheetFit(net, ...rules.paper);
    if (!fit.fits) return { why: 'paper', net, fit };
  }
  return null;
}

// Cut sets that pass every rule, up to limit, each containing the cuts in
// `within` (for a hint mid-way). A line level walks every scissor path through
// the corners; the others sample spanning trees of the faces.
export function solutions(solid, rules = {}, { rng, limit = 1, within = [], tries = 3000 } = {}) {
  const out = [], seen = new Set(), must = new Set(within);
  const take = cuts => {
    if (!within.every(c => cuts.includes(c))) return;
    const key = cuts.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    if (!verdict(solid, cuts, rules)) out.push(cuts);
  };
  if (rules.line) {
    for (const p of scissorPaths(solid, rng)) { take(p); if (out.length >= limit) break; }
    return out;
  }
  const uncut = solid.edges.filter(e => !must.has(e.id));
  for (let t = 0; t < tries && out.length < limit; t++) {
    const parent = solid.faces.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const hinges = [];
    for (const e of shuffle(rng, uncut)) {
      const [a, b] = e.f.map(find);
      if (a !== b) { parent[a] = b; hinges.push(e.id); }
    }
    if (hinges.length !== solid.faces.length - 1) return out;
    take(solid.edges.map(e => e.id).filter(id => !hinges.includes(id)));
  }
  return out;
}

// every path through all the corners (each once), in a shuffled order
function* scissorPaths(solid, rng) {
  const V = solid.verts.length;
  const adj = solid.verts.map(() => []);
  for (const e of solid.edges) { adj[e.a].push([e.b, e.id]); adj[e.b].push([e.a, e.id]); }
  if (rng) for (const l of adj) shuffle(rng, l).forEach((x, i) => { l[i] = x; });
  const starts = rng ? shuffle(rng, [...Array(V).keys()]) : [...Array(V).keys()];
  const on = new Array(V).fill(false), path = [];
  function* walk(v, n, s) {
    if (n === V) { if (s < v) yield path.slice(); return; }  // each path once, not once per direction
    for (const [w, id] of adj[v]) {
      if (on[w]) continue;
      on[w] = true; path.push(id);
      yield* walk(w, n + 1, s);
      path.pop(); on[w] = false;
    }
  }
  for (const s of starts) { on[s] = true; yield* walk(s, 1, s); on[s] = false; }
}

// ------------------------------------------------------------------
// drawing on the net
// ------------------------------------------------------------------

// The proper rotations of a solid onto itself, as maps face -> face.
// A rotation is fixed by where it sends three corners of one face, so try
// every placement of face 0's first three corners onto a face of the same size.
export function rotations(solid) {
  const { verts, faces } = solid;
  const key = p => p.map(x => Math.round(x * 1e4) || 0).join(',');
  const at = new Map(verts.map((p, i) => [key(p), i]));
  const c = verts.reduce((s, p) => [s[0] + p[0] / verts.length, s[1] + p[1] / verts.length, s[2] + p[2] / verts.length], [0, 0, 0]);
  const f0 = faces[0], [a, b, d] = f0.loop.slice(0, 3).map(i => sub(verts[i], c));
  const basis = (p, q, r) => { const x = p, y = q, z = cross(sub(q, p), sub(r, p)); return [x, y, z]; };
  const B = basis(a, b, d);
  const inv = invert3(B);
  if (!inv) return [faces.map(f => f.id)];
  const out = [];
  for (const g of faces) {
    if (g.loop.length !== f0.loop.length) continue;
    const L = g.loop.length;
    for (let k = 0; k < L; k++) {
      const [p, q, r] = [0, 1, 2].map(j => sub(verts[g.loop[(k + j) % L]], c));
      const M = mulM(colsOf(basis(p, q, r)), inv);           // takes face 0's frame onto g's
      if (!isRotation(M)) continue;
      const vmap = verts.map(v => at.get(key(addC(apply(M, sub(v, c)), c))));
      if (vmap.some(v => v === undefined)) continue;
      const fmap = faces.map(f => {
        const set = new Set(f.loop.map(i => vmap[i]));
        return faces.find(h => h.loop.length === set.size && h.loop.every(i => set.has(i)))?.id;
      });
      if (fmap.some(x => x === undefined)) continue;
      if (!out.some(m => m.every((x, i) => x === fmap[i]))) out.push(fmap);
    }
  }
  return out;
}
const addC = (p, c) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
const colsOf = ([x, y, z]) => [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
const apply = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const mulM = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
function invert3(basisVecs) {
  const m = colsOf(basisVecs);
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, Bc = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * Bc + c * C;
  if (Math.abs(det) < 1e-9) return null;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [Bc / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
function isRotation(M) {
  const I = mulM(M, [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]]);
  const orth = I.every((r, i) => r.every((x, j) => Math.abs(x - (i === j ? 1 : 0)) < 1e-6));
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  return orth && det > 0;
}

// how many hinges apart two faces lie on the net
export function netDistance(solid, net, f, g) {
  const up = x => { const out = [x]; while (net.parent[x] >= 0) { const e = solid.edges[net.parent[x]]; x = e.f[0] === x ? e.f[1] : e.f[0]; out.push(x); } return out; };
  const A = up(f), B = up(g);
  const i = A.findIndex(x => B.includes(x));
  return i + B.indexOf(A[i]);
}

// A drawing round: the solid stands on its base, one face is marked on the model
// and on the net (the reference), and each asked face is marked on the model
// only: the player finds it on the net. Asked faces are ones no turn of the
// solid can mistake for another, given the base and the marks drawn so far.
// hard: ask the faces furthest from the reference on the net first.
// Returns { ref, asks: [face ids] } or null.
// seen(f): whether the player can see face f on the model without turning it
export function drawRounds(solid, net, rng, { n = 3, hard = false, seen = () => true } = {}) {
  const rots = rotations(solid), base = net.root;
  const fixing = known => rots.filter(m => known.every(f => m[f] === f));
  const all = solid.faces.filter(f => f.id !== base && isConvexish(solid, f)).map(f => f.id);
  const front = all.filter(seen);
  const sides = front.length >= 3 ? front : all;
  for (const ref of shuffle(rng, sides.slice())) {
    const asks = [], known = [base, ref];
    let pool = sides.filter(f => f !== ref);
    pool = hard ? pool.sort((x, y) => netDistance(solid, net, ref, y) - netDistance(solid, net, ref, x) || rng() - .5)
      : shuffle(rng, pool).sort((x, y) => netDistance(solid, net, ref, x) - netDistance(solid, net, ref, y));
    for (const f of pool) {
      if (asks.length >= n) break;
      if (fixing(known).some(m => m[f] !== f)) continue;   // a turn would put it elsewhere: ambiguous
      asks.push(f); known.push(f);
    }
    if (asks.length === Math.min(n, sides.length - 1)) return { ref, asks };
  }
  return null;
}

// marks sit in the middle of a face, so the face should hold its centre
function isConvexish(solid, f) {
  const P = f.loop.map(i => solid.verts[i]), L = P.length;
  for (let i = 0; i < L; i++) {
    const a = P[i], b = P[(i + 1) % L], c = P[(i + 2) % L];
    if (dot(cross(sub(b, a), sub(c, b)), f.n) < -1e-9) return false;
  }
  return len(f.n) > 0;
}

// ------------------------------------------------------------------
// mending a net
// ------------------------------------------------------------------

// The misplaced face `leaf` hung from edge eid instead: is that a true fold, and
// does the mended net lie flat? Returns { ok, why: 'not-its-edge' | 'overlap', net }.
export function mended(solid, net, leaf, eid) {
  const e = solid.edges[eid];
  if (!e.f.includes(leaf)) return { ok: false, why: 'not-its-edge' };
  const hinges = net.hinges.filter(h => h !== net.parent[leaf]).concat(eid);
  const fixed = unfold(solid, hinges, net.root);
  if (!fixed) return { ok: false, why: 'not-its-edge' };
  if (fixed.overlaps.length) return { ok: false, why: 'overlap', net: fixed };
  return { ok: true, net: fixed };
}
