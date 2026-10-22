// The puzzles of Developments, as pure functions over a solid and its nets.
//
//   opening(solid, cuts)     what a set of cuts does: which faces already swing
//                            free, whether it lies flat, falls apart or jams
//   matchEdge(net, rng)      a cut edge on one side of the net; the answer is its
//                            other side, where the two glue together
//   misfit(solid, net, rng)  a net with one end face hinged to the wrong edge:
//                            folded, it lands on another face (Will it fold? / Fix the net)
//   distractors(key, rng)    forms that could be mistaken for this one (Which solid?)
//
// A "side" of a cut edge is { e, f }: the edge as it lies on face f.

import { unfold, hingesFromCuts, overlaps, randomUnfolding } from './poly.js';
import { randInt, shuffle, pick } from './rand.js';
import { FORMS } from './forms.js';
import { rotateAbout, sub, unit, dot, cross } from './vec.js';

// ------------------------------------------------------------------
// cutting open
// ------------------------------------------------------------------

// The faces that can already swing open, and where they would come to rest.
// Hinges that are left form a graph on the faces. Prune it leaf by leaf: what
// is pruned hangs on a single path of hinges and swings free; what is left
// (the core) still closes into a loop and holds its shape. When nothing is
// left, the cuts are a spanning tree and the whole solid lies flat.
//
// Returns {
//   state: 'closed' | 'opening' | 'flat' | 'apart' | 'jammed',
//   free: face ids that swing, core: face ids that hold,
//   pose(t): 3d face polygons, t = 1 folded, t = 0 every free face swung open,
//   net: the unfolding when flat (or jammed), overlaps: face pairs that collide
// }
export function opening(solid, cuts, root = baseFace(solid)) {
  const { faces, edges, verts } = solid;
  const cut = new Set(cuts);
  const nbr = faces.map(() => []);
  for (const e of edges) if (!cut.has(e.id)) { nbr[e.f[0]].push(e.id); nbr[e.f[1]].push(e.id); }
  const other = (e, f) => e.f[0] === f ? e.f[1] : e.f[0];

  const h = hingesFromCuts(solid, cuts);
  if (h.reason === 'pieces') return { state: 'apart', free: [], core: faces.map(f => f.id), pieces: pieceOf(solid, cuts), pose: () => folded(solid) };
  if (h.ok) {
    const net = unfold(solid, h.hinges, root);
    return { state: net.overlaps.length ? 'jammed' : 'flat', free: faces.map(f => f.id).filter(i => i !== root), core: [root], net, overlaps: net.overlaps, pose: net.pose };
  }

  // prune leaves
  const deg = nbr.map(l => l.length), gone = new Set();
  const queue = faces.map(f => f.id).filter(i => deg[i] <= 1);
  while (queue.length) {
    const f = queue.pop();
    if (gone.has(f)) continue;
    gone.add(f);
    for (const eid of nbr[f]) {
      const g = other(edges[eid], f);
      if (!gone.has(g) && --deg[g] <= 1) queue.push(g);
    }
  }
  const core = faces.map(f => f.id).filter(i => !gone.has(i));
  if (!gone.size) return { state: 'closed', free: [], core, pose: () => folded(solid) };

  // each free face swings about the hinge toward the core, carried by its parents
  const chain = faces.map(() => null);
  const order = [...core];
  for (const c of core) chain[c] = [];
  for (let q = 0; q < order.length; q++) {
    const f = faces[order[q]];
    for (const eid of nbr[f.id]) {
      const e = edges[eid], g = other(e, f.id);
      if (chain[g]) continue;
      const d = unit(sub(verts[e.b], verts[e.a])), nG = faces[g].n, nF = f.n;
      const psi = Math.atan2(dot(cross(nG, nF), d), dot(nG, nF));
      chain[g] = [{ P: verts[e.a], d, psi }, ...chain[f.id]];
      order.push(g);
    }
  }
  const pose = t => faces.map(f => {
    let pts = f.loop.map(i => verts[i]);
    for (const c of chain[f.id] || []) if (c.psi) pts = pts.map(p => rotateAbout(p, c.P, c.d, c.psi * (1 - t)));
    return { f: f.id, pts };
  });
  return { state: 'opening', free: [...gone], core, pose };
}

const folded = solid => solid.faces.map(f => ({ f: f.id, pts: f.loop.map(i => solid.verts[i]) }));

// the face the solid stands on: the lowest face whose normal points down most
export function baseFace(solid) {
  let best = 0, bz = Infinity;
  for (const f of solid.faces) {
    const z = f.c[2] + f.n[2] * 10;
    if (z < bz) { bz = z; best = f.id; }
  }
  return best;
}

// which piece each face is in, when cuts cut the surface apart
function pieceOf(solid, cuts) {
  const cut = new Set(cuts);
  const parent = solid.faces.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (const e of solid.edges) if (!cut.has(e.id)) parent[find(e.f[0])] = find(e.f[1]);
  return solid.faces.map(f => find(f.id));
}

// ------------------------------------------------------------------
// match the edge
// ------------------------------------------------------------------

// Pick cut edges to ask about: their two sides lie apart on the net (not
// touching), and the further apart the better. Returns [{ e, given: side, answer: side }].
export function matchEdges(net, rng, n = 3) {
  const far = net.rim.filter(r => !net.kisses.includes(r.e)).map(r => {
    const [s0, s1] = r.sides;
    const m = s => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    const a = m(s0), b = m(s1);
    return { r, d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }).sort((x, y) => y.d - x.d);
  // the far ones first, but not always the same three
  const pool = shuffle(rng, far.slice(0, Math.max(n + 2, Math.ceil(far.length * .6))));
  return pool.slice(0, n).map(({ r }) => {
    const k = randInt(rng, 2);
    return { e: r.e, given: { e: r.e, f: r.sides[k].f }, answer: { e: r.e, f: r.sides[1 - k].f } };
  });
}

// ------------------------------------------------------------------
// will it fold / fix the net
// ------------------------------------------------------------------

// A misfit: one leaf face hinged to another free edge of the net where it
// fits (same length). Folded, it lands where a different face of the solid
// already is (the collision), and its own place stays open (the gap).
// Returns { leaf, from: { e, f }, to: { e, f }, lands: face id it collides with, flat: 2d polygons } or null.
export function misfit(solid, net, rng) {
  const parentFace = parentFaces(solid, net);
  const isLeaf = f => f !== net.root && !parentFace.includes(f);
  const leavesL = shuffle(rng, net.order.filter(isLeaf));
  for (const leaf of leavesL) {
    const hinge = solid.edges[net.parent[leaf]];
    const L = hinge.len;
    // free sides on the rest of the net where the leaf could hang instead
    const spots = [];
    for (const r of net.rim) for (const s of r.sides) {
      if (s.f === leaf || r.e === hinge.id) continue;
      if (Math.abs(solid.edges[r.e].len - L) > 1e-6) continue;
      // the leaf's true neighbour across the cut: where the misplaced leaf would land
      const lands = s.f === r.sides[0].f ? r.sides[1].f : r.sides[0].f;
      if (lands === leaf) continue;                     // that is its other true place
      spots.push({ side: { e: r.e, f: s.f }, lands });
    }
    for (const sp of shuffle(rng, spots)) {
      const flat = rehang(solid, net, leaf, sp.side);
      if (!flat) continue;
      const others = flat.filter((_, i) => i !== leaf);
      if (overlaps([flat[leaf], ...others]).some(([i]) => i === 0)) continue;
      return { leaf, from: { e: hinge.id, f: parentFace[leaf] }, to: sp.side, lands: sp.lands, flat };
    }
  }
  return null;
}

// the face each face hangs from in the net (-1 for the root)
export function parentFaces(solid, net) {
  return net.parent.map((eid, f) => eid < 0 ? -1 : (solid.edges[eid].f[0] === f ? solid.edges[eid].f[1] : solid.edges[eid].f[0]));
}

// the flat net with face `leaf` moved to hang from `side` (an edge as it lies on face side.f).
// The leaf is placed by matching its hinge edge onto that side, mirrored across it so it lies outside.
function rehang(solid, net, leaf, side) {
  const e0 = solid.edges[net.parent[leaf]];
  const fl = net.flat[leaf], loop = solid.faces[leaf].loop;
  const A = fl[loop.indexOf(e0.a)], B = fl[loop.indexOf(e0.b)];
  // the target side: the edge's ends on the host face, in the host's loop order
  const host = solid.faces[side.f], hl = host.loop, hf = net.flat[side.f];
  const ia = hl.indexOf(solid.edges[side.e].a), ib = hl.indexOf(solid.edges[side.e].b);
  // walking the host loop, the edge goes p -> q; the leaf must walk it q -> p
  const fwd = (ia + 1) % hl.length === ib;
  const p = hf[fwd ? ia : ib], q = hf[fwd ? ib : ia];
  // the leaf's hinge, in the leaf's loop order: it walks it u -> v
  const ja = loop.indexOf(e0.a), jb = loop.indexOf(e0.b);
  const lf = (ja + 1) % loop.length === jb;
  const u = lf ? A : B, v = lf ? B : A;
  // rigid motion (no mirror) taking u -> q and v -> p
  const ang = Math.atan2(p[1] - q[1], p[0] - q[0]) - Math.atan2(v[1] - u[1], v[0] - u[0]);
  const c = Math.cos(ang), s = Math.sin(ang);
  const moved = fl.map(([x, y]) => {
    const dx = x - u[0], dy = y - u[1];
    return [q[0] + dx * c - dy * s, q[1] + dx * s + dy * c];
  });
  const out = net.flat.slice();
  out[leaf] = moved;
  return out;
}

// ------------------------------------------------------------------
// which solid
// ------------------------------------------------------------------

// Forms that look alike: close in face count, preferring the same pack and the
// pack next to it. Returns keys, not including key.
export function distractors(key, rng, n = 3) {
  const me = FORMS[key], nf = me.faces ?? me.make().faces.length;
  const packs = 'ABCDEF';
  const pi = packs.indexOf(me.pack);
  const pool = Object.entries(FORMS).filter(([k, f]) => k !== key && Math.abs(packs.indexOf(f.pack) - pi) <= 1).map(([k, f]) => {
    const m = f.make().faces.length;
    return { k, score: Math.abs(m - nf) + (f.pack === me.pack ? 0 : 1.5) + rng() * 2 };
  }).sort((a, b) => a.score - b.score);
  return pool.slice(0, n).map(p => p.k);
}

export { pick };

// The misfit net folding up: the rest folds as the true net does; the leaf
// swings about the wrong edge by the angle that edge has on the solid, so
// at t = 1 it lies in the plane of the face it collides with.
export function misfitPose(solid, net, mis) {
  const { faces, verts, edges } = solid;
  const host = mis.to.f, e = edges[mis.to.e];
  const hl = faces[host].loop, hf = net.flat[host];
  const ia = hl.indexOf(e.a), ib = hl.indexOf(e.b);
  const P2 = hf[ia], Q2 = hf[ib];
  const lands = faces[mis.lands], hostF = faces[host];
  const d = unit(sub(verts[e.b], verts[e.a]));
  const psi = Math.atan2(dot(cross(lands.n, hostF.n), d), dot(lands.n, hostF.n));
  return t => {
    const all = net.pose(t);
    const H = all[host].pts, A = H[ia], B = H[ib];
    // the host's plane at t: x along A->B, y in-plane, from the host's own polygon
    const n = unit(polyNormal(H));
    const x = unit(sub(B, A)), y = cross(n, x);
    const x2 = [Q2[0] - P2[0], Q2[1] - P2[1]], l2 = Math.hypot(...x2);
    const ux = [x2[0] / l2, x2[1] / l2], uy = [-ux[1], ux[0]];
    const to3 = ([px, py]) => {
      const dx = px - P2[0], dy = py - P2[1];
      const a = dx * ux[0] + dy * ux[1], b = dx * uy[0] + dy * uy[1];
      return [A[0] + x[0] * a + y[0] * b, A[1] + x[1] * a + y[1] * b, A[2] + x[2] * a + y[2] * b];
    };
    const dd = unit(sub(B, A));
    const pts = mis.flat[mis.leaf].map(to3).map(p => rotateAbout(p, A, dd, -psi * t));
    all[mis.leaf] = { f: mis.leaf, pts };
    return all;
  };
}

function polyNormal(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

// Is hanging face `leaf` from side { e, f } a true fold? Only along one of its own edges.
export const fitsAt = (solid, leaf, side) => {
  const e = solid.edges[side.e];
  return e.f.includes(leaf) && e.f.includes(side.f) && side.f !== leaf;
};

// Does the flat net fit on a w x h sheet, turned any way? A rectangle round a
// convex outline is tightest with one side on an edge of its hull, so trying
// every hull edge direction is enough. Returns the best turn found:
// { fits, angle, size: [a, b] } with a >= b.
export function sheetFit(net, w, h) {
  const pts = hull2d(net.flat.flat());
  const W = Math.max(w, h), H = Math.min(w, h);
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const A = Math.max(x1 - x0, y1 - y0), B = Math.min(x1 - x0, y1 - y0);
    const fits = A <= W + 1e-6 && B <= H + 1e-6;
    const slack = Math.min(W - A, H - B);
    if (!best || (fits && !best.fits) || (fits === best.fits && slack > best.slack)) best = { fits, angle: ang, size: [A, B], slack };
  }
  return best;
}

function hull2d(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const h = [];
    for (const p of list) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], p) <= 1e-9) h.pop(); h.push(p); }
    return h;
  };
  const lo = half(pts), up = half(pts.slice().reverse());
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// A net to show on the table: lies flat around the base without overlapping
// itself. Some solids rarely give one by a random spanning tree, so the
// search widens (faces gathered round the base, long strips, then nets that
// touch themselves along a cut) before it gives up.
export function tableNet(solid, rng, { pick: how = 'compact' } = {}) {
  const root = baseFace(solid);
  for (const o of [{ style: 'tree' }, { style: 'star' }, { style: 'strip' }, { style: 'tree', kiss: true }, { style: 'star', kiss: true }]) {
    const n = randomUnfolding(solid, rng, { root, tries: 150, pick: how, ...o });
    if (n) return n;
  }
  return null;
}
