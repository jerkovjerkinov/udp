// Developments (nets) of a polycube, on a square grid.
//
// A net is a set of grid cells. The rule the player is told: squares that touch
// are joined, every shared edge is a fold. Under that rule a net either folds
// into the solid or it does not, with no guessing about where the cuts are.
//
// Grid coordinates are (i, j), i to the right, j down the screen. A placement
// says which square of the solid a cell becomes and how it is turned: E and N are
// the 3d directions that the cell's screen-right and screen-up edges point to.

import { neg, dot, cross, sub, add, mul, rotateAbout } from './vec.js';
import { randInt, shuffle } from './rand.js';

export const DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1]];        // E N W S
export const cellKey = (i, j) => i + ',' + j;
export const parseKey = k => k.split(',').map(Number);

const dirOf = (pl, k) => k === 0 ? pl.E : k === 1 ? pl.N : k === 2 ? neg(pl.E) : neg(pl.N);

// the placement of the neighbouring cell in direction k, if that edge is a fold
function advance(solid, pl, k) {
  const r = solid.step(pl.s, dirOf(pl, k));
  const next = { s: r.id, E: pl.E, N: pl.N, kind: r.kind };
  if (k === 0) next.E = r.e;
  else if (k === 2) next.E = neg(r.e);
  else if (k === 1) next.N = r.e;
  else next.N = neg(r.e);
  return next;
}
const samePl = (a, b) => a.s === b.s && a.E.every((x, i) => x === b.E[i]) && a.N.every((x, i) => x === b.N[i]);

// +1 when the net shows the outside of the solid, -1 when it shows the inside
export const handedness = (solid, pl) => Math.sign(dot(cross(pl.E, pl.N), solid.squares[pl.s].n));

function connected(keys) {
  if (!keys.size) return false;
  const first = keys.values().next().value, seen = new Set([first]), q = [first];
  while (q.length) {
    const [i, j] = parseKey(q.pop());
    for (const [di, dj] of DIRS) {
      const k = cellKey(i + di, j + dj);
      if (keys.has(k) && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  return seen.size === keys.size;
}

// Fold the cells starting from one guess for the first cell. Returns the
// placements, or null as soon as two cells disagree or claim the same square.
function foldFrom(solid, keys, startKey, startPl) {
  const map = new Map([[startKey, startPl]]), used = new Set([startPl.s]), q = [startKey];
  while (q.length) {
    const key = q.shift(), [i, j] = parseKey(key), pl = map.get(key);
    for (let k = 0; k < 4; k++) {
      const nk = cellKey(i + DIRS[k][0], j + DIRS[k][1]);
      if (!keys.has(nk)) continue;
      const next = advance(solid, pl, k);
      const have = map.get(nk);
      if (have) { if (!samePl(have, next)) return null; continue; }
      if (used.has(next.s)) return null;
      used.add(next.s); map.set(nk, next); q.push(nk);
    }
  }
  return map;
}

// a fold that cuts through a face leaves a flat edge of the solid with no cell beyond it
function tornFace(solid, keys, map) {
  for (const [key, pl] of map) {
    const [i, j] = parseKey(key);
    for (let k = 0; k < 4; k++) {
      if (solid.step(pl.s, dirOf(pl, k)).kind !== 'flat') continue;
      if (!keys.has(cellKey(i + DIRS[k][0], j + DIRS[k][1]))) return true;
    }
  }
  return false;
}

// every way a square can lie on the grid: 4 turns, shown from outside or inside
function framesOf(sq) {
  const out = [];
  for (const E of sq.dirs) for (const N of sq.dirs) if (dot(E, N) === 0) out.push({ s: sq.id, E, N });
  return out;
}

// Does this set of cells fold into the solid?
// { ok, reason, map, handed }   reason: 'empty' | 'count' | 'pieces' | 'torn' | 'fold'
export function checkNet(solid, cellList) {
  const keys = new Set(cellList.map(([i, j]) => cellKey(i, j)));
  const total = solid.squares.length;
  if (!keys.size) return { ok: false, reason: 'empty', have: 0, need: total };
  if (keys.size !== total) return { ok: false, reason: 'count', have: keys.size, need: total };
  if (!connected(keys)) return { ok: false, reason: 'pieces' };
  const start = keys.values().next().value;
  let torn = false;
  for (const sq of solid.squares) for (const pl of framesOf(sq)) {
    const map = foldFrom(solid, keys, start, pl);
    if (!map || map.size !== total) continue;
    if (tornFace(solid, keys, map)) { torn = true; continue; }
    return { ok: true, map, handed: handedness(solid, pl) };
  }
  return { ok: false, reason: torn ? 'torn' : 'fold' };
}

// A random development, grown one face at a time: lay a face flat, then keep
// hinging a not-yet-placed face onto the sheet wherever it lands on empty cells
// and every edge it touches is a true fold. That way the result always obeys the
// touching-is-joined rule. Of a batch of tries that fit in maxW x maxH, one of
// the most compact is returned.
export function randomNet(solid, rng, maxW, maxH, tries = 12) {
  const { squares, faces } = solid;
  const found = [];

  // the cells a face covers when it enters the sheet as placement pl at (i, j)
  function layFace(pl, i, j) {
    const cells = new Map([[cellKey(i, j), pl]]), seen = new Set([pl.s]), q = [[i, j]];
    while (q.length) {
      const [a, b] = q.shift(), cur = cells.get(cellKey(a, b));
      for (let k = 0; k < 4; k++) {
        const next = advance(solid, cur, k);
        if (next.kind !== 'flat' || seen.has(next.s)) continue;
        const na = a + DIRS[k][0], nb = b + DIRS[k][1];
        seen.add(next.s); cells.set(cellKey(na, nb), next); q.push([na, nb]);
      }
    }
    return cells;
  }
  const box = keys => {
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const k of keys) { const [i, j] = parseKey(k); lo = [Math.min(lo[0], i), Math.min(lo[1], j)]; hi = [Math.max(hi[0], i), Math.max(hi[1], j)]; }
    return { mi: lo[0], mj: lo[1], w: hi[0] - lo[0] + 1, h: hi[1] - lo[1] + 1 };
  };

  for (let t = 0; t < tries * 6 && found.length < tries; t++) {
    const root = squares[randInt(rng, squares.length)];
    const E = root.dirs[randInt(rng, 4)];
    const at = layFace({ s: root.id, E, N: cross(root.n, E) }, 0, 0);
    const done = new Set([root.face]), tree = [];
    let stuck = false;
    while (done.size < faces.length) {
      // every hinge from a placed cell onto a face not yet placed
      const opts = [];
      for (const [key, pl] of at) {
        const [i, j] = parseKey(key);
        for (let k = 0; k < 4; k++) {
          const next = advance(solid, pl, k);
          if (done.has(squares[next.s].face)) continue;
          opts.push([pl, next, i + DIRS[k][0], j + DIRS[k][1]]);
        }
      }
      let best = null;
      for (const [pl, next, i, j] of shuffle(rng, opts)) {
        const add = layFace(next, i, j);
        let fine = true;
        for (const [key, npl] of add) {
          if (at.has(key)) { fine = false; break; }
          const [a, b] = parseKey(key);
          for (let k = 0; k < 4 && fine; k++) {
            const nk = cellKey(a + DIRS[k][0], b + DIRS[k][1]);
            const other = at.get(nk) || add.get(nk);
            if (other && !samePl(advance(solid, npl, k), other)) fine = false;
          }
          if (!fine) break;
        }
        if (!fine) continue;
        const bb = box([...at.keys(), ...add.keys()]);
        if (bb.w > maxW || bb.h > maxH) continue;
        const score = bb.w * bb.h + rng() * 4;
        if (!best || score < best.score) best = { score, add, from: squares[pl.s].face, to: squares[next.s].face };
        if (rng() < .35) break;       // do not always take the tightest fit
      }
      if (!best) { stuck = true; break; }
      for (const [key, npl] of best.add) at.set(key, npl);
      done.add(best.to); tree.push([best.from, best.to]);
    }
    if (stuck) continue;

    const bb = box(at.keys());
    const map = new Map();
    for (const [key, pl] of at) { const [i, j] = parseKey(key); map.set(cellKey(i - bb.mi, j - bb.mj), pl); }
    const cells = [...map.keys()].map(parseKey);
    if (!checkNet(solid, cells).ok) continue;
    found.push({ cells, map, w: bb.w, h: bb.h, tree, handed: 1 });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.w * a.h - b.w * b.h);
  return found[randInt(rng, Math.min(3, found.length))];
}

// cells of the net grouped by the face of the solid they become
export function facesOfNet(solid, map) {
  const by = new Map();
  for (const [key, pl] of map) {
    const f = solid.squares[pl.s].face;
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(parseKey(key));
  }
  return by;
}

// faces that hang off the rest of the net by a single hinge
export function leafFaces(net) {
  const deg = new Map();
  for (const [a, b] of net.tree) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  return [...deg].filter(([, d]) => d === 1).map(([f]) => f);
}

// ------------------------------------------------------------------
// folding
// The net starts flat in the plane of its root square and every hinge turns
// by up to 90 degrees. At t = 1 each cell sits exactly on its square of the
// solid, in the solid's own coordinates, so the animation ends where the
// ordinary solid view begins.
// ------------------------------------------------------------------
export function folder(solid, map, handed, rootKey) {
  const keys = [...map.keys()];
  rootKey = rootKey || keys[0];
  const node = new Map([[rootKey, { key: rootKey, chain: [] }]]), q = [rootKey];
  while (q.length) {
    const key = q.shift(), [i, j] = parseKey(key), pl = map.get(key), me = node.get(key);
    for (let k = 0; k < 4; k++) {
      const nk = cellKey(i + DIRS[k][0], j + DIRS[k][1]);
      if (!map.has(nk) || node.has(nk)) continue;
      const kind = solid.step(pl.s, dirOf(pl, k)).kind;
      // flat coordinates: cell (i, j) covers x in [i, i+1], y in [-j-1, -j]
      const cx = i + .5, cy = -j - .5, dx = DIRS[k][0], dy = -DIRS[k][1];
      const hinge = {
        P: [cx + dx * .5, cy + dy * .5, 0],
        a: [-dy, dx, 0],
        // positive turn about a swings the far side toward -z. convex folds go
        // inward (against the outward side, which is handed * z), concave outward.
        sign: kind === 'flat' ? 0 : (kind === 'convex' ? handed : -handed),
        depth: me.chain.length,
      };
      node.set(nk, { key: nk, chain: [hinge, ...me.chain] });
      q.push(nk);
    }
  }

  const rpl = map.get(rootKey), [ri, rj] = parseKey(rootKey), rsq = solid.squares[rpl.s];
  // the root cell's centre, lying on the root square's centre
  const C = rsq.center, rx = ri + .5, ry = -rj - .5, Z = mul(rsq.n, handed);
  const place = p => add(add(add(C, mul(rpl.E, p[0] - rx)), mul(rpl.N, p[1] - ry)), mul(Z, p[2]));

  // the pose at time t (0 flat, 1 folded): one quad per cell
  return function pose(t) {
    const th = Math.PI / 2 * t;
    const out = [];
    for (const [key, pl] of map) {
      const [i, j] = parseKey(key);
      let pts = [[i, -j - 1, 0], [i + 1, -j - 1, 0], [i + 1, -j, 0], [i, -j, 0]];
      for (const h of node.get(key).chain) {
        if (!h.sign) continue;
        pts = pts.map(p => rotateAbout(p, h.P, h.a, th * h.sign));
      }
      pts = pts.map(place);
      // corners run counter-clockwise seen from +z, so this normal is outward when handed is +1
      const n = mul(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])), handed);
      out.push({ key, s: pl.s, pts, n, cell: [i, j], N: pl.N });
    }
    return out;
  };
}
