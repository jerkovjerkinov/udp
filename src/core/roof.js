// Hip roofs on rectilinear footprints.
//
// Every eave is at one height and every roof plane has one pitch, so the roof
// over a point is as high as the point is far from the nearest eave, measured
// the way a square grows: the half side of the largest square centred on the
// point that still fits inside the footprint (the L-infinity distance to the
// outside). That surface is the classic hip roof: a hip rises from every outside
// corner, a valley from every inside corner, and ridges run level between them.
//
// Ridges can sit half way across a plan cell, so the roof plan lives on a sheet
// at twice the plan scale (S). On it every ridge, hip and valley runs between
// lattice points, horizontally, vertically or at 45 degrees, and the roof is flat
// on each of the four triangles that a unit square's diagonals cut it into. The
// creases are found there: wherever two neighbouring triangles slope differently.
//
// Plan cells are 'i,j' keys; sheet coordinates are x right, y down.

import { stepKey, parseStep, pointKey, mergeSteps } from './lattice.js';
import { randInt } from './rand.js';

export const S = 2;                              // sheet units per plan unit

const key = (i, j) => i + ',' + j;
const unkey = k => k.split(',').map(Number);

// ------------------------------------------------------------------
// footprints
// ------------------------------------------------------------------

// the corners of a footprint, in plan units: where one cell of a 2x2 block is in
// (outside corner) or three are (inside corner). Two cells across a diagonal pinch.
export function cornersOf(cells) {
  const convex = [], reflex = [];
  let pinch = false;
  const pts = new Set();
  for (const k of cells) { const [i, j] = unkey(k); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pts.add(key(i + a, j + b)); }
  for (const p of pts) {
    const [x, y] = unkey(p);
    const nw = cells.has(key(x - 1, y - 1)), ne = cells.has(key(x, y - 1));
    const sw = cells.has(key(x - 1, y)), se = cells.has(key(x, y));
    const n = nw + ne + sw + se;
    if (n === 1) convex.push([x, y]);
    else if (n === 3) reflex.push([x, y]);
    else if (n === 2 && nw === se) pinch = true;
  }
  return { convex, reflex, pinch };
}

// the outline as one closed loop of corner points, going round with the inside on
// the right (clockwise on screen), each with the length of the edge leaving it
export function outlineOf(cells) {
  const next = new Map();
  const add = (a, b) => next.set(key(...a), b);
  for (const k of cells) {
    const [i, j] = unkey(k);
    if (!cells.has(key(i, j - 1))) add([i, j], [i + 1, j]);
    if (!cells.has(key(i + 1, j))) add([i + 1, j], [i + 1, j + 1]);
    if (!cells.has(key(i, j + 1))) add([i + 1, j + 1], [i, j + 1]);
    if (!cells.has(key(i - 1, j))) add([i, j + 1], [i, j]);
  }
  const start = next.keys().next().value;
  const loop = [];
  let p = unkey(start), guard = 0;
  do {
    loop.push(p);
    p = next.get(key(...p));
  } while (key(...p) !== start && ++guard < 10000);
  // keep the turning points only
  const n = loop.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out.map((p, i) => {
    const q = out[(i + 1) % out.length];
    return { p, len: Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) };
  });
}

function connected(cells) {
  const first = cells.values().next().value, seen = new Set([first]), todo = [first];
  while (todo.length) {
    const [i, j] = unkey(todo.pop());
    for (const k of [key(i + 1, j), key(i - 1, j), key(i, j + 1), key(i, j - 1)]) {
      if (cells.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); }
    }
  }
  return seen.size === cells.size;
}

// a courtyard: an outside cell that cannot reach the edge of the bounding box
function holed(cells, w, h) {
  const seen = new Set(), todo = [];
  for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
    if (i === -1 || j === -1 || i === w || j === h) { seen.add(key(i, j)); todo.push([i, j]); }
  }
  while (todo.length) {
    const [i, j] = todo.pop();
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < -1 || b < -1 || a > w || b > h) continue;
      const k = key(a, b);
      if (cells.has(k) || seen.has(k)) continue;
      seen.add(k); todo.push([a, b]);
    }
  }
  return (w + 2) * (h + 2) - seen.size !== cells.size;
}

// A footprint made of overlapping blocks, at least 2 x 2 each, inside w x h cells:
// one piece, no courtyard, no two cells meeting only at a corner, every wall at
// least minEdge long and a number of corners in range.
export function randomFootprint(rng, { w = 8, h = 5, blocks = [2, 3], corners = [6, 12], minEdge = 2 } = {}) {
  for (let t = 0; t < 2000; t++) {
    const n = blocks[0] + randInt(rng, blocks[1] - blocks[0] + 1);
    const cells = new Set();
    for (let b = 0; b < n; b++) {
      const bw = 2 + randInt(rng, w - 1), bh = 2 + randInt(rng, h - 1);
      const x = randInt(rng, w - bw + 1), y = randInt(rng, h - bh + 1);
      for (let i = x; i < x + bw; i++) for (let j = y; j < y + bh; j++) cells.add(key(i, j));
    }
    if (!connected(cells)) continue;
    // move it to the origin
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of cells) { const [i, j] = unkey(k); x0 = Math.min(x0, i); y0 = Math.min(y0, j); x1 = Math.max(x1, i); y1 = Math.max(y1, j); }
    const moved = new Set([...cells].map(k => { const [i, j] = unkey(k); return key(i - x0, j - y0); }));
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
    const c = cornersOf(moved);
    const nc = c.convex.length + c.reflex.length;
    if (c.pinch || nc < corners[0] || nc > corners[1]) continue;
    if (holed(moved, fw, fh)) continue;
    if (outlineOf(moved).some(e => e.len < minEdge)) continue;
    return { cells: moved, w: fw, h: fh };
  }
  return null;
}

// a block footprint, for tests and fixed questions: rows of '#' and '.'
export function footprintFrom(rows) {
  const cells = new Set();
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') cells.add(key(i, j)); }));
  return { cells, w: Math.max(...rows.map(r => r.length)), h: rows.length };
}

// ------------------------------------------------------------------
// the roof
// ------------------------------------------------------------------

// The roof over a footprint, drawn on the sheet with its plan origin at sheet
// point `at`. Returns
//   height(x, y)   roof height over a sheet point, in sheet units (0 outside)
//   creases        Map stepKey -> 'ridge' | 'hip' | 'valley'
//   lines          the creases as straight lines of one kind, broken where lines meet
//   eaves          the outline as unit steps [a, b], inside on the right
//   squares        Set of 'x,y' sheet squares under the roof
//   tris           the roof surface: [{ pts: [[x, y, z] x3], crease: [bool x3], eave: [bool x3] }]
//   corners        { convex, reflex } in sheet points
//   problems       anything the geometry could not place on the lattice (none, normally)
export function roofOf(cells, at = [0, 0]) {
  let w = 0, h = 0;
  for (const k of cells) { const [i, j] = unkey(k); w = Math.max(w, i + 1); h = Math.max(h, j + 1); }
  const [ox, oy] = at;

  // the outside, as cells of the ring around the bounding box and the gaps inside it
  const outside = [];
  for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
    if (!cells.has(key(i, j))) outside.push([ox + S * i, oy + S * j]);
  }
  const height = (x, y) => {
    let m = Infinity;
    for (const [cx, cy] of outside) {
      const dx = Math.max(0, cx - x, x - cx - S), dy = Math.max(0, cy - y, y - cy - S);
      const d = dx > dy ? dx : dy;
      if (d < m) m = d;
    }
    return m;
  };

  const squares = new Set();
  for (const k of cells) {
    const [i, j] = unkey(k);
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) squares.add(key(ox + S * i + a, oy + S * j + b));
  }

  // four triangles per square, cut by its diagonals: 0 top, 1 right, 2 bottom, 3 left.
  // Corners run p00 p10 p11 p01; triangle t is (corner t, corner t+1, centre).
  const tri = new Map();                      // 'x,y,t' -> { pts, g }
  const zAt = new Map();
  const z = (x, y) => { const k = x + ',' + y; let v = zAt.get(k); if (v === undefined) { v = height(x, y); zAt.set(k, v); } return v; };
  for (const sk of squares) {
    const [x, y] = unkey(sk);
    const P = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    const c = [x + .5, y + .5];
    for (let t = 0; t < 4; t++) {
      const a = P[t], b = P[(t + 1) % 4];
      const pts = [[...a, z(...a)], [...b, z(...b)], [...c, z(...c)]];
      tri.set(sk + ',' + t, { pts, g: gradient(pts) });
    }
  }
  const T = (x, y, t) => tri.get(x + ',' + y + ',' + t);

  // compare two triangles across their shared edge e0 -> e1:
  // null when they lie in one plane, else 'convex' or 'concave'
  const fold = (A, B, e0, e1) => {
    const dg = [B.g[0] - A.g[0], B.g[1] - A.g[1]];
    if (Math.abs(dg[0]) < 1e-9 && Math.abs(dg[1]) < 1e-9) return null;
    // n: across the edge, from A's side to B's
    let n = [e1[1] - e0[1], e0[0] - e1[0]];
    const ca = centre(A.pts), cb = centre(B.pts);
    if (n[0] * (cb[0] - ca[0]) + n[1] * (cb[1] - ca[1]) < 0) n = [-n[0], -n[1]];
    return dg[0] * n[0] + dg[1] * n[1] < 0 ? 'convex' : 'concave';
  };

  const creases = new Map(), problems = [];
  const creaseOf = new Map();                  // 'x,y,t,e' -> bool, for the 3d edges
  const mark = (x, y, t, e, v) => creaseOf.set(x + ',' + y + ',' + t + ',' + e, v);

  for (const sk of squares) {
    const [x, y] = unkey(sk);
    const t0 = T(x, y, 0), t1 = T(x, y, 1), t2 = T(x, y, 2), t3 = T(x, y, 3);
    const c = [x + .5, y + .5];
    // half diagonals: centre to each corner; triangle t's edge 1 runs corner t+1 -> centre,
    // its edge 2 centre -> corner t
    const h00 = fold(t3, t0, [x, y], c), h10 = fold(t0, t1, [x + 1, y], c);
    const h11 = fold(t1, t2, [x + 1, y + 1], c), h01 = fold(t2, t3, [x, y + 1], c);
    mark(x, y, 0, 2, !!h00); mark(x, y, 3, 1, !!h00);
    mark(x, y, 0, 1, !!h10); mark(x, y, 1, 2, !!h10);
    mark(x, y, 1, 1, !!h11); mark(x, y, 2, 2, !!h11);
    mark(x, y, 2, 1, !!h01); mark(x, y, 3, 2, !!h01);
    // the two diagonals of the square, each made of two halves that must agree
    for (const [ha, hb, a, b] of [[h00, h11, [x, y], [x + 1, y + 1]], [h10, h01, [x + 1, y], [x, y + 1]]]) {
      if (!ha && !hb) continue;
      if (ha !== hb) { problems.push('half diagonal at ' + sk); continue; }
      creases.set(stepKey(a, b), ha === 'convex' ? 'hip' : 'valley');
    }
    // the square's top and left edges, against the squares above and to the left
    if (squares.has(key(x, y - 1))) {
      const f = fold(T(x, y - 1, 2), t0, [x, y], [x + 1, y]);
      mark(x, y, 0, 0, !!f); mark(x, y - 1, 2, 0, !!f);
      if (f) { creases.set(stepKey([x, y], [x + 1, y]), f === 'convex' ? 'ridge' : 'valley'); if (f !== 'convex') problems.push('level valley at ' + sk); }
    }
    if (squares.has(key(x - 1, y))) {
      const f = fold(T(x - 1, y, 1), t3, [x, y + 1], [x, y]);
      mark(x, y, 3, 0, !!f); mark(x - 1, y, 1, 0, !!f);
      if (f) { creases.set(stepKey([x, y], [x, y + 1]), f === 'convex' ? 'ridge' : 'valley'); if (f !== 'convex') problems.push('level valley at ' + sk); }
    }
  }

  // the outline, as unit steps with the roof on the right
  const eaves = [];
  for (const sk of squares) {
    const [x, y] = unkey(sk);
    if (!squares.has(key(x, y - 1))) eaves.push([[x, y], [x + 1, y]]);
    if (!squares.has(key(x + 1, y))) eaves.push([[x + 1, y], [x + 1, y + 1]]);
    if (!squares.has(key(x, y + 1))) eaves.push([[x + 1, y + 1], [x, y + 1]]);
    if (!squares.has(key(x - 1, y))) eaves.push([[x, y + 1], [x, y]]);
  }
  const eaveSet = new Set(eaves.map(([a, b]) => stepKey(a, b)));

  // the surface, edge by edge: crease, eave or seam
  const tris = [];
  for (const sk of squares) {
    const [x, y] = unkey(sk);
    for (let t = 0; t < 4; t++) {
      const { pts } = T(x, y, t);
      const crease = [0, 1, 2].map(e => !!creaseOf.get(x + ',' + y + ',' + t + ',' + e));
      const eave = [eaveSet.has(stepKey(pts[0], pts[1])), false, false];
      tris.push({ pts, crease, eave });
    }
  }

  // lines: break wherever three or more crease steps meet
  const degree = new Map();
  for (const k of creases.keys()) for (const p of parseStep(k)) { const pk = pointKey(...p); degree.set(pk, (degree.get(pk) || 0) + 1); }
  const breaks = new Set([...degree].filter(([, d]) => d >= 3).map(([p]) => p));
  const lines = mergeSteps(creases, breaks);

  const c = cornersOf(cells);
  const toSheet = ([i, j]) => [ox + S * i, oy + S * j];
  return {
    w, h, at, cells, squares, height, creases, lines, eaves, eaveSet, tris, problems,
    corners: { convex: c.convex.map(toSheet), reflex: c.reflex.map(toSheet) },
  };
}

// the gradient of the plane through three 3d points (dz/dx, dz/dy)
function gradient([a, b, c]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
  const dz1 = b[2] - a[2], dz2 = c[2] - a[2];
  const det = ux * vy - uy * vx;
  return [(dz1 * vy - dz2 * uy) / det, (ux * dz2 - vx * dz1) / det];
}
const centre = pts => [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
