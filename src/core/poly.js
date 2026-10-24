// Polyhedra with polygon faces, and their edge unfoldings.
//
// A solid is a list of vertices and a list of faces. Each face is a loop of
// vertex indices, counter-clockwise seen from outside, and may be any simple
// planar polygon: a triangle, a rectangle, the L-shaped end of a prism. Every
// edge is shared by exactly two faces, which walk it in opposite directions.
//
// An edge unfolding keeps some edges as hinges and cuts the rest. The hinges
// must form a spanning tree of the faces: then the surface opens into one
// piece with no loop holding it closed, and every face can be swung about its
// hinge into the plane of a root face.

import { add, sub, mul, dot, cross, unit, len, rotateAbout } from './vec.js';
import { randInt, shuffle } from './rand.js';

const EPS = 1e-7;

// ------------------------------------------------------------------
// building
// ------------------------------------------------------------------

// twice the area vector of a 3d polygon (Newell): its direction is the normal
export function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}
const centroid = pts => mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);

// A solid from vertices and face loops. Throws if the faces do not close up
// into one consistently oriented surface. loose: an edge met by four faces
// (two blocks touching along it) becomes two edges, paired in the order the
// faces come, instead of an error.
export function solidOf(verts, loops, { loose = false } = {}) {
  const faces = loops.map((loop, id) => {
    const pts = loop.map(i => verts[i]), nn = newell(pts);
    return { id, loop, n: unit(nn), area: len(nn) / 2, c: centroid(pts), edges: [] };
  });
  const edges = [], byKey = new Map();
  for (const f of faces) f.loop.forEach((a, k) => {
    const b = f.loop[(k + 1) % f.loop.length], key = Math.min(a, b) + ',' + Math.max(a, b);
    let e = byKey.get(key);
    const taken = e => a < b ? e.f[0] !== undefined : e.f[1] !== undefined;
    if (e && taken(e) && loose) e = e.more?.find(x => !taken(x)) || null;
    if (!e) {
      e = { id: edges.length, a: Math.min(a, b), b: Math.max(a, b), f: [], len: len(sub(verts[a], verts[b])) };
      edges.push(e);
      if (!byKey.has(key)) byKey.set(key, e); else (byKey.get(key).more ||= []).push(e);
    }
    // f[0] walks the edge a -> b, f[1] walks it b -> a
    if (taken(e)) throw new Error('edge ' + key + ' walked twice the same way');
    e.f[a < b ? 0 : 1] = f.id;
    f.edges[k] = e.id;
  });
  for (const e of edges) if (e.f[0] === undefined || e.f[1] === undefined) throw new Error('open edge ' + e.a + ',' + e.b);

  // convex where the second face bends away below the first one's plane
  for (const e of edges) {
    const [f0, f1] = e.f.map(i => faces[i]);
    const d1 = sub(verts[e.a], verts[e.b]);                // the way f1 walks the edge
    const inward1 = cross(f1.n, d1);                       // into f1, in its plane
    const s = dot(inward1, f0.n);
    e.flat = Math.abs(s) < EPS * len(d1) && dot(f0.n, f1.n) > 0;
    e.convex = s < 0;
  }
  const volume = faces.reduce((v, f) => v + dot(f.c, f.n) * f.area, 0) / 3;
  if (volume <= 0) throw new Error('faces wound inside out');
  return { verts, faces, edges, edgeKey: (a, b) => byKey.get(Math.min(a, b) + ',' + Math.max(a, b))?.id, volume };
}

// Merge faces that lie in one plane and share an edge into one face, so a flat
// stretch of surface has no seam to cut and no hinge that folds by nothing.
// Points left in the middle of a straight edge (where only two faces meet) go.
// A group that would not make one simple loop (a ring around a hole) is kept as it was.
export function mergeFlat(solid, opts) {
  const { faces, edges, verts } = solid;
  if (!edges.some(e => e.flat)) return solid;
  const up = faces.map(f => f.id), find = i => up[i] === i ? i : (up[i] = find(up[i]));
  for (const e of edges) if (e.flat) up[find(e.f[0])] = find(e.f[1]);
  const groups = new Map();
  for (const f of faces) { const r = find(f.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
  let loops = [];
  for (const g of groups.values()) {
    if (g.length === 1) { loops.push(g[0].loop.slice()); continue; }
    const next = new Map(), inner = new Set();
    for (const f of g) f.loop.forEach((a, k) => inner.add(a + '>' + f.loop[(k + 1) % f.loop.length]));
    let clash = false;
    for (const f of g) f.loop.forEach((a, k) => {
      const b = f.loop[(k + 1) % f.loop.length];
      if (inner.has(b + '>' + a)) return;
      if (next.has(a)) clash = true;
      next.set(a, b);
    });
    const start = next.keys().next().value, loop = [start];
    for (let v = next.get(start); v !== start && loop.length <= next.size; v = next.get(v)) loop.push(v);
    if (clash || loop.length !== next.size) { for (const f of g) loops.push(f.loop.slice()); continue; }
    loops.push(loop);
  }
  // points on a straight edge between just two faces
  const touch = verts.map(() => 0);
  for (const l of loops) for (const v of l) touch[v]++;
  loops = loops.map(l => l.filter(v => touch[v] > 2));
  const keep = new Map(), nv = [];
  for (const l of loops) for (const v of l) if (!keep.has(v)) { keep.set(v, nv.length); nv.push(verts[v]); }
  return solidOf(nv, loops.map(l => l.map(v => keep.get(v))), opts);
}

// Turn or mirror a solid: f maps a vertex to its new place. Loops are reversed
// when f mirrors, so faces stay counter-clockwise from outside.
export function mapSolid(solid, f) {
  const verts = solid.verts.map(f);
  const o = f([0, 0, 0]), ex = sub(f([1, 0, 0]), o), ey = sub(f([0, 1, 0]), o), ez = sub(f([0, 0, 1]), o);
  const mirror = dot(cross(ex, ey), ez) < 0;
  return solidOf(verts, solid.faces.map(fc => mirror ? fc.loop.slice().reverse() : fc.loop.slice()));
}

// move a solid so its bounding box starts at the origin
export function grounded(solid) {
  const lo = [0, 1, 2].map(a => Math.min(...solid.verts.map(v => v[a])));
  return mapSolid(solid, v => sub(v, lo));
}

// drop consecutive repeated or collinear points of a 2d loop
function tidy(poly) {
  let p = poly.slice();
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < EPS) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
export const area2 = poly => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

// A prism: a simple polygon in the xy plane (either winding) raised by h along z.
export function prism(poly, h) {
  let p = tidy(poly);
  if (area2(p) < 0) p = p.reverse();
  const n = p.length;
  const verts = [...p.map(([x, y]) => [x, y, 0]), ...p.map(([x, y]) => [x, y, h])];
  const loops = [
    [...Array(n).keys()].reverse(),                        // bottom, seen from below
    [...Array(n).keys()].map(i => n + i),                  // top
    ...[...Array(n).keys()].map(i => [i, (i + 1) % n, n + (i + 1) % n, n + i]),
  ];
  return solidOf(verts, loops);
}

// 2d convex hull, counter-clockwise, no collinear points (Andrew's monotone chain)
function hull2(pts) {
  const idx = pts.map((p, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[a][1] - pts[b][1]);
  const turn = (o, a, b) => (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const half = list => {
    const h = [];
    for (const i of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], i) <= EPS) h.pop();
      h.push(i);
    }
    return h;
  };
  const lower = half(idx), upper = half(idx.slice().reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The convex hull of a set of 3d points, with coplanar triangles merged into
// whole faces. Points inside the hull, or inside a face or an edge, are dropped.
// Small point sets only: every triple is tried as a face plane.
export function hull(points) {
  const P = [];
  for (const p of points) if (!P.some(q => len(sub(p, q)) < EPS)) P.push(p);
  const scale = Math.max(1, ...P.map(p => Math.max(...p.map(Math.abs))));
  const planes = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    let n = cross(sub(P[j], P[i]), sub(P[k], P[i]));
    const nl = len(n);
    if (nl < EPS) continue;
    n = mul(n, 1 / nl);
    const d = dot(n, P[i]);
    let above = 0, below = 0;
    for (const p of P) { const s = dot(n, p) - d; if (s > EPS * scale) above++; else if (s < -EPS * scale) below++; }
    if (above && below) continue;
    if (!above && !below) throw new Error('flat point set');
    const out = above ? mul(n, -1) : n, od = above ? -d : d;
    if (!planes.some(q => len(sub(q.n, out)) < 1e-6 && Math.abs(q.d - od) < 1e-6 * scale)) planes.push({ n: out, d: od });
  }
  const used = new Map(), verts = [], loops = [];
  const vid = i => { if (!used.has(i)) { used.set(i, verts.length); verts.push(P[i]); } return used.get(i); };
  for (const { n, d } of planes) {
    const on = P.map((p, i) => i).filter(i => Math.abs(dot(n, P[i]) - d) <= EPS * scale);
    const u = unit(Math.abs(n[0]) < .9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), v = cross(n, u);
    const flat = on.map(i => [dot(P[i], u), dot(P[i], v)]);
    loops.push(hull2(flat).map(k => on[k]));
  }
  return solidOf(verts, loops.map(l => l.map(vid)));
}

// ------------------------------------------------------------------
// 2d polygons: triangulation and overlap
// ------------------------------------------------------------------

// ear clipping; returns triangles as index triples into poly (counter-clockwise)
export function triangulate(poly) {
  const idx = [...poly.keys()];
  if (area2(poly) < 0) idx.reverse();
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cr(a, b, c) <= EPS) continue;
      // no other corner inside or on this ear
      if (idx.some(j => j !== ia && j !== ib && j !== ic &&
        cr(a, b, poly[j]) >= -EPS && cr(b, c, poly[j]) >= -EPS && cr(c, a, poly[j]) >= -EPS)) continue;
      tris.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;                                       // degenerate polygon: give up on the rest
  }
  if (idx.length === 3) tris.push(idx.slice());
  return tris;
}

// do two convex polygons overlap by more than a sliver? (separating axis test)
function convexOverlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ax = [b[1] - a[1], a[0] - b[0]];
    const l = Math.hypot(...ax);
    const pa = A.map(p => (p[0] * ax[0] + p[1] * ax[1]) / l), pb = B.map(p => (p[0] * ax[0] + p[1] * ax[1]) / l);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6) return false;
  }
  return true;
}

// pairs [i, j] of polygons (2d point lists) whose insides overlap
export function overlaps(polys) {
  const tris = polys.map(p => triangulate(p).map(t => t.map(k => p[k])));
  const box = polys.map(p => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]);
  const out = [];
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const a = box[i], b = box[j];
    if (a[2] <= b[0] + 1e-6 || b[2] <= a[0] + 1e-6 || a[3] <= b[1] + 1e-6 || b[3] <= a[1] + 1e-6) continue;
    if (tris[i].some(s => tris[j].some(t => convexOverlap(s, t)))) out.push([i, j]);
  }
  return out;
}

// ------------------------------------------------------------------
// unfolding
// ------------------------------------------------------------------

// Which edges stay as hinges when these are cut, and whether that unfolds:
// { ok, hinges, reason } reason: 'pieces' (cut apart) | 'loop' (not cut enough to lie flat)
export function hingesFromCuts(solid, cuts) {
  const cut = new Set(cuts);
  const hinges = solid.edges.filter(e => !cut.has(e.id)).map(e => e.id);
  const parent = solid.faces.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  let loop = false;
  for (const h of hinges) {
    const [a, b] = solid.edges[h].f.map(find);
    if (a === b) loop = true; else parent[a] = b;
  }
  const pieces = new Set(solid.faces.map(f => find(f.id))).size;
  return { ok: pieces === 1 && !loop, hinges, reason: pieces > 1 ? 'pieces' : loop ? 'loop' : null, pieces };
}

// Lay the solid open with these hinges (a spanning tree of the faces) about a
// root face. Returns null if the hinges are not a spanning tree. The net:
//   flat[f]     the face's loop as 2d points, in the root face's frame seen from outside
//   parent[f]   the hinge edge joining f toward the root (-1 for the root)
//   pose(t)     3d polygons at time t: 0 lies open in the root's plane, 1 is the solid
//   overlaps    pairs of faces that cover each other when laid flat
//   kisses      cut edges whose two sides meet again in the net (the net touches itself)
//   rim         every cut edge with its two places on the net's outline
//   box         the flat net's bounds { x0, y0, x1, y1 }
export function unfold(solid, hinges, root = 0) {
  const { verts, faces, edges } = solid;
  const H = new Set(hinges);
  if (H.size !== faces.length - 1) return null;
  const parent = faces.map(() => -1), chain = faces.map(() => null), order = [root];
  chain[root] = [];
  for (let q = 0; q < order.length; q++) {
    const f = faces[order[q]];
    for (const eid of f.edges) {
      if (!H.has(eid)) continue;
      const e = edges[eid], g = e.f[0] === f.id ? e.f[1] : e.f[0];
      if (chain[g]) continue;
      // swing g about the edge until its outward normal is f's: then it lies open
      const d = unit(sub(verts[e.b], verts[e.a])), nG = faces[g].n, nF = f.n;
      const psi = Math.atan2(dot(cross(nG, nF), d), dot(nG, nF));
      chain[g] = [{ P: verts[e.a], d, psi }, ...chain[f.id]];
      parent[g] = eid;
      order.push(g);
    }
  }
  if (order.length !== faces.length) return null;

  const pose = t => faces.map(f => {
    let pts = f.loop.map(i => verts[i]);
    for (const h of chain[f.id]) if (h.psi) pts = pts.map(p => rotateAbout(p, h.P, h.d, h.psi * (1 - t)));
    return { f: f.id, pts, n: unit(newell(pts)) };
  });

  const R = faces[root], o = verts[R.loop[0]], u = unit(sub(verts[R.loop[1]], o)), v = cross(R.n, u);
  const to2 = p => [dot(sub(p, o), u), dot(sub(p, o), v)];
  const flat = pose(0).map(q => q.pts.map(to2));

  // each cut edge, as it lies on each of its two faces
  const at = (fid, vid) => flat[fid][faces[fid].loop.indexOf(vid)];
  const rim = edges.filter(e => !H.has(e.id)).map(e => ({
    e: e.id, sides: e.f.map(fid => ({ f: fid, a: at(fid, e.a), b: at(fid, e.b) })),
  }));
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  const kisses = rim.filter(r => near(r.sides[0].a, r.sides[1].a) && near(r.sides[0].b, r.sides[1].b)).map(r => r.e);

  const all = flat.flat();
  const box = { x0: Math.min(...all.map(p => p[0])), y0: Math.min(...all.map(p => p[1])), x1: Math.max(...all.map(p => p[0])), y1: Math.max(...all.map(p => p[1])) };
  return { root, hinges: [...H], parent, order, flat, pose, overlaps: overlaps(flat), kisses, rim, box, frame: { o, u, v, n: R.n } };
}

// A random edge unfolding that lies flat without overlapping itself, or null.
//   style  'tree' (any spanning tree), 'star' (faces gathered round the root),
//          'strip' (faces in long runs)
//   kiss   allow nets that touch themselves along a cut edge
//   pick   'compact' (smallest box of a batch) or 'any'
export function randomUnfolding(solid, rng, { root, style = 'tree', kiss = false, tries = 60, keep = 8, pick = 'compact' } = {}) {
  const { faces, edges } = solid;
  const found = [];
  for (let t = 0; t < tries && found.length < keep; t++) {
    const r = root ?? randInt(rng, faces.length);
    const hinges = style === 'tree' ? kruskal(solid, rng) : grow(solid, rng, r, style === 'star');
    const net = unfold(solid, hinges, r);
    if (!net || net.overlaps.length || (!kiss && net.kisses.length)) continue;
    found.push(net);
  }
  if (!found.length) return null;
  if (pick === 'any') return found[0];
  const size = n => (n.box.x1 - n.box.x0) * (n.box.y1 - n.box.y0);
  found.sort((a, b) => size(a) - size(b));
  return found[randInt(rng, Math.min(2, found.length))];

  function kruskal() {
    const parent = faces.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const out = [];
    for (const e of shuffle(rng, edges)) {
      const [a, b] = e.f.map(find);
      if (a !== b) { parent[a] = b; out.push(e.id); }
    }
    return out;
  }
}

// a spanning tree grown from the root: breadth first (star) or depth first (strip)
function grow(solid, rng, root, star) {
  const seen = new Set([root]), out = [], todo = [root];
  while (todo.length) {
    const f = star ? todo.shift() : todo[todo.length - 1];
    const next = shuffle(rng, solid.faces[f].edges).map(eid => solid.edges[eid])
      .find(e => !seen.has(e.f[0] === f ? e.f[1] : e.f[0]));
    if (!next) { if (!star) todo.pop(); continue; }
    const g = next.f[0] === f ? next.f[1] : next.f[0];
    seen.add(g); out.push(next.id); todo.push(g);
    if (star) todo.unshift(f);                            // come back to f until it has no free side
  }
  return out;
}

// the polygons of a solid, for drawing or testing
export const facesOf = solid => solid.faces.map(f => ({ f: f.id, pts: f.loop.map(i => solid.verts[i]), n: f.n }));
