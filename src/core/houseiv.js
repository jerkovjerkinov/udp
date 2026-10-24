// House IV: a block turned into a building by a series of moves, the way
// Peter Eisenman drew House IV (1975) as a row of axonometrics, each one move
// on from the last. He compared it to chess: every move answers the one
// before, so the order matters as much as the moves.
//
// A form is a set of unit cells [x, y, z]. A move is data, so levels can list
// them and the game can label, apply and animate them:
//
//   { kind: 'cut',    sel }            take the selected cells away
//   { kind: 'slide',  sel, by }        move the selected cells by [dx, dy, dz]
//   { kind: 'add',    box }            add the cells of a box [[x0, x1], [y0, y1], [z0, z1]]
//   { kind: 'turn',   q }              turn the whole form q quarter turns about
//                                      the vertical, in its own footprint
//   { kind: 'mirror', axis }           a mirror copy beside the form, along x or y
//
// sel: { x: [a, b], y: [a, b], z: [a, b] }, inclusive cell ranges; a missing
// axis takes every cell. Ranges count in the form as it is at that move.

import { solidOf, mergeFlat } from './poly.js';

export const key = c => c.join(',');
const AX = { x: 0, y: 1, z: 2 };

export const boxCells = ([[x0, x1], [y0, y1], [z0, z1]]) => {
  const out = [];
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y, z]);
  return out;
};

export function boundsOf(cells) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of cells) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
  return { lo, hi };
}

const inSel = (sel = {}) => c => Object.entries(sel).every(([a, [lo, hi]]) => c[AX[a]] >= lo && c[AX[a]] <= hi);
const uniq = cells => { const m = new Map(); for (const c of cells) m.set(key(c), c); return [...m.values()]; };

/**
 * applyMove(cells, move) → { cells, moves: [{ from, to }], gone: [cells], born: [{ from, to }] }
 * moves: every cell that stays, where it was and where it goes (for animation);
 * gone: cells taken away; born: new cells and where they come from.
 */
export function applyMove(cells, m) {
  const { lo, hi } = boundsOf(cells);
  if (m.kind === 'cut') {
    const s = inSel(m.sel);
    const keep = cells.filter(c => !s(c)), gone = cells.filter(s);
    return { cells: keep, moves: keep.map(c => ({ from: c, to: c })), gone, born: [] };
  }
  if (m.kind === 'slide') {
    const s = inSel(m.sel);
    const moves = cells.map(c => ({ from: c, to: s(c) ? [c[0] + m.by[0], c[1] + m.by[1], c[2] + m.by[2]] : c }));
    return { cells: uniq(moves.map(v => v.to)), moves, gone: [], born: [] };
  }
  if (m.kind === 'add') {
    const have = new Set(cells.map(key));
    const born = boxCells(m.box).filter(c => !have.has(key(c))).map(c => ({ from: [c[0], c[1], c[2] - 1], to: c }));
    return { cells: [...cells, ...born.map(b => b.to)], moves: cells.map(c => ({ from: c, to: c })), gone: [], born };
  }
  if (m.kind === 'turn') {
    const q = ((m.q % 4) + 4) % 4;
    const turn1 = ([x, y, z], l, h) => [l[0] + (h[1] - y), l[1] + (x - l[0]), z];
    const moves = cells.map(c => {
      let p = c, l = lo, h = hi;
      for (let i = 0; i < q; i++) { p = turn1(p, l, h); h = [l[0] + (h[1] - l[1]), l[1] + (h[0] - l[0]), h[2]]; }
      return { from: c, to: p };
    });
    return { cells: moves.map(v => v.to), moves, gone: [], born: [], turn: q };
  }
  if (m.kind === 'mirror') {
    const a = AX[m.axis];
    const born = cells.map(c => { const t = c.slice(); t[a] = 2 * hi[a] + 1 - c[a]; return { from: c, to: t }; });
    return { cells: uniq([...cells, ...born.map(b => b.to)]), moves: cells.map(c => ({ from: c, to: c })), gone: [], born };
  }
  throw new Error('unknown move ' + m.kind);
}

export const run = (cells, moves) => moves.reduce((cs, m) => applyMove(cs, m).cells, cells);

// two forms are the same building if they have the same cells, wherever they stand
export function sameForm(a, b) {
  if (a.length !== b.length) return false;
  const la = boundsOf(a).lo, lb = boundsOf(b).lo;
  const s = new Set(a.map(c => key([c[0] - la[0], c[1] - la[1], c[2] - la[2]])));
  return b.every(c => s.has(key([c[0] - lb[0], c[1] - lb[1], c[2] - lb[2]])));
}

// the cells as one plaster solid (coplanar squares merged), standing where they are.
// Cells that touch only along an edge would share that edge four ways, so a
// corner point is one vertex per group of cells around it that touch face to
// face; the two cells on a diagonal each keep their own.
export function cellSolid(cells) {
  const has = new Set(cells.map(key));
  const vid = new Map(), verts = [], loops = [];
  const group = (p, c) => {
    // the cells of the 2x2x2 block around point p, grouped by shared faces
    const round = [];
    for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const q = [p[0] + dx, p[1] + dy, p[2] + dz];
      if (has.has(key(q))) round.push(q);
    }
    const seen = new Set([key(c)]), todo = [c];
    while (todo.length) {
      const a = todo.pop();
      for (const q of round) if (!seen.has(key(q)) && Math.abs(a[0] - q[0]) + Math.abs(a[1] - q[1]) + Math.abs(a[2] - q[2]) === 1) { seen.add(key(q)); todo.push(q); }
    }
    return round.filter(q => seen.has(key(q))).map(key).sort()[0];
  };
  const v = (p, c) => { const k = key(p) + '/' + group(p, c); if (!vid.has(k)) { vid.set(k, verts.length); verts.push(p); } return vid.get(k); };
  const sides = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  for (const c of cells) for (const [d, sq] of sides) {
    if (has.has(key([c[0] + d[0], c[1] + d[1], c[2] + d[2]]))) continue;
    loops.push(sq.map(p => v([c[0] + p[0], c[1] + p[1], c[2] + p[2]], c)));
  }
  return mergeFlat(solidOf(verts, loops, { loose: true }), { loose: true });
}

// the visible squares of the cells seen along d, far ones first: an
// axonometric drawn by the painter's rule, which is exact for unit cells
export function axonSquares(cells, d) {
  const has = new Set(cells.map(key));
  const sides = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const out = [];
  for (const c of cells) for (const n of sides) {
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0) continue;
    if (has.has(key([c[0] + n[0], c[1] + n[1], c[2] + n[2]]))) continue;
    const a = n.findIndex(x => x !== 0), u = [0, 0, 0], w = [0, 0, 0];
    u[(a + 1) % 3] = 1; w[(a + 2) % 3] = 1;
    const o = c.map((x, i) => x + (n[i] > 0 ? 1 : 0) * (i === a ? 1 : 0));
    const pts = [o, o.map((x, i) => x + u[i]), o.map((x, i) => x + u[i] + w[i]), o.map((x, i) => x + w[i])];
    const ctr = c.map((x, i) => x + .5 + n[i] * .5), mid = c.map(x => x + .5);
    out.push({ pts, n, depth: mid[0] * d[0] + mid[1] * d[1] + mid[2] * d[2], tie: ctr[0] * d[0] + ctr[1] * d[1] + ctr[2] * d[2] });
  }
  return out.sort((p, q) => q.depth - p.depth || q.tie - p.tie);
}
