// A solid made of unit cubes, and its surface cut into unit squares.
//
// Axes: x and y on the ground, z up. A square is one exposed face of one cube,
// named by the cube it belongs to (c) and its outward normal (n). Squares are
// grouped into faces: the flat, connected regions an architect would call a face
// of the solid, which a development must never cut through.

import { add, neg, mul } from './vec.js';
import { randInt } from './rand.js';

export const AXES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const ck = c => c[0] + ',' + c[1] + ',' + c[2];

// the two positive in-plane axes of a square with normal n
function inPlane(n) {
  const a = n.findIndex(x => x !== 0), u = [0,0,0], v = [0,0,0];
  u[(a + 1) % 3] = 1; v[(a + 2) % 3] = 1;
  return [u, v];
}

export function makeSolid(cells) {
  const set = new Set(cells.map(ck));
  const has = c => set.has(ck(c));
  const squares = [], index = new Map();
  for (const c of cells) for (const n of AXES) {
    if (has(add(c, n))) continue;
    const [u, v] = inPlane(n);
    const center = [c[0] + .5 + n[0] * .5, c[1] + .5 + n[1] * .5, c[2] + .5 + n[2] * .5];
    index.set(ck(c) + '|' + ck(n), squares.length);
    squares.push({ id: squares.length, c, n, u, v, center, face: -1, dirs: [u, neg(u), v, neg(v)] });
  }
  const at = (c, n) => index.get(ck(c) + '|' + ck(n));

  // Walk off square id across its edge in in-plane direction d. Returns the square
  // on the other side, the direction e that points away from the shared edge on
  // it, and how the surface turns there.
  function step(id, d) {
    const { c, n } = squares[id];
    const up = add(add(c, n), d);
    if (has(up)) return { id: at(up, neg(d)), e: n, kind: 'concave' };
    const side = add(c, d);
    if (has(side)) return { id: at(side, n), e: d, kind: 'flat' };
    return { id: at(c, d), e: neg(n), kind: 'convex' };
  }

  // faces: union squares across every flat edge
  const parent = squares.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (const s of squares) for (const d of s.dirs) {
    const r = step(s.id, d);
    if (r.kind === 'flat') parent[find(s.id)] = find(r.id);
  }
  const faceOf = new Map(), faces = [];
  for (const s of squares) {
    const root = find(s.id);
    if (!faceOf.has(root)) { faceOf.set(root, faces.length); faces.push({ id: faces.length, n: s.n, squares: [] }); }
    s.face = faceOf.get(root);
    faces[s.face].squares.push(s.id);
  }

  // which edges of each square are real edges of the solid (not a seam inside a face)
  for (const s of squares) s.hard = s.dirs.map(d => step(s.id, d).kind !== 'flat');

  return { cells, has, squares, faces, step, at };
}

// the four corners of a square, wound counter-clockwise seen from outside
export function corners(sq) {
  const { center: m, u, v } = sq;
  const hu = mul(u, .5), hv = mul(v, .5);
  const p = (a, b) => [m[0] + a * hu[0] + b * hv[0], m[1] + a * hu[1] + b * hv[1], m[2] + a * hu[2] + b * hv[2]];
  return [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
}

// the corner pair bounding the edge of a square that lies toward direction index k (u, -u, v, -v)
export function edgeOf(sq, k) {
  const c = corners(sq);
  return [[c[1], c[2]], [c[3], c[0]], [c[2], c[3]], [c[0], c[1]]][k];
}

export function bounds(cells) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of cells) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a] + 1);
  }
  return { lo, hi };
}

// Two cubes that meet only along an edge, or only at a corner, make a surface a
// sheet of paper cannot become. Every such pair must be bridged by a face neighbour.
function manifold(cells) {
  const set = new Set(cells.map(ck));
  for (const a of cells) for (const b of cells) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    if (d.some(x => Math.abs(x) > 1)) continue;
    const off = d.filter(x => x !== 0).length;
    if (off === 2) {
      const ax = [0, 1, 2].filter(i => d[i] !== 0);
      const m1 = a.slice(); m1[ax[0]] += d[ax[0]];
      const m2 = a.slice(); m2[ax[1]] += d[ax[1]];
      if (!set.has(ck(m1)) && !set.has(ck(m2))) return false;
    } else if (off === 3) {
      // connected through the 2x2x2 block the two cubes span
      const inBlock = c => [0, 1, 2].every(i => c[i] === a[i] || c[i] === b[i]);
      const seen = new Set([ck(a)]), q = [a];
      while (q.length) {
        const c = q.pop();
        for (const n of AXES) {
          const p = add(c, n), k = ck(p);
          if (inBlock(p) && set.has(k) && !seen.has(k)) { seen.add(k); q.push(p); }
        }
      }
      if (!seen.has(ck(b))) return false;
    }
  }
  return true;
}

// a connected polycube of k cubes, no wider than span in any direction, resting on z = 0
export function randomPolycube(rng, k, span = 3) {
  for (let t = 0; t < 2000; t++) {
    const cells = [[0, 0, 0]], set = new Set(['0,0,0']);
    let guard = 0;
    while (cells.length < k && guard++ < 500) {
      const p = add(cells[randInt(rng, cells.length)], AXES[randInt(rng, 6)]);
      if (set.has(ck(p))) continue;
      cells.push(p); set.add(ck(p));
    }
    const { lo, hi } = bounds(cells);
    if ([0, 1, 2].some(a => hi[a] - lo[a] > span)) continue;
    const norm = cells.map(c => [c[0] - lo[0], c[1] - lo[1], c[2] - lo[2]]);
    if (!manifold(norm)) continue;
    return norm;
  }
  return [[0, 0, 0]];
}
