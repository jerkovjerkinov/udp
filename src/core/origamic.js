// Origamic architecture: one sheet, cuts and folds, a building that stands up
// when the card opens to 90 degrees.
//
// The card is W columns wide. Paper coordinate s runs across the gutter: the
// floor half is s in [-D, 0] (y = -s, toward the viewer), the wall half s in
// [0, H] (z = s when open). Each unit column is either plain (it just bends at
// the gutter) or carries folds at integer rows s0 < s1 < ... < sm. Between the
// first and last fold the column is cut free and its pieces alternate: a W
// piece stays parallel to the wall, an F piece parallel to the floor, W first
// and F last. It stands only if the W pieces add up to sm (the height where it
// meets the wall) and the F pieces to -s0 (how far out it leaves the floor):
// then it is a chain of parallelograms and moves for every opening angle.
// Every column is a section of the building.
//
// Folds, from the floor up: valley, mountain, valley, ..., valley.

import { randInt, pick, shuffle } from './rand.js';

// ------------------------------------------------------------------
// one column
// ------------------------------------------------------------------

// profileOf([s0, ..., sm]) -> { ok, a, b, pieces: [{ t: 'W'|'F', s0, s1 }], why }
export function profileOf(folds) {
  if (!folds || !folds.length) return { ok: true, plain: true, pieces: [] };
  const f = [...folds].sort((x, y) => x - y);
  const a = f[0], b = f[f.length - 1];
  const pieces = [];
  for (let i = 0; i + 1 < f.length; i++) pieces.push({ t: i % 2 ? 'F' : 'W', s0: f[i], s1: f[i + 1] });
  if (f.length < 3) return { ok: false, a, b, pieces, why: 'a strip needs at least three folds: floor, the top edge, wall' };
  if (a >= 0) return { ok: false, a, b, pieces, why: 'the first fold must be on the floor half' };
  if (b <= 0) return { ok: false, a, b, pieces, why: 'the last fold must be on the wall half' };
  if (pieces.length % 2) return { ok: false, a, b, pieces, why: 'an odd number of pieces: it cannot both rise from the floor and meet the wall' };
  const W = pieces.filter(p => p.t === 'W').reduce((s, p) => s + p.s1 - p.s0, 0);
  const F = pieces.filter(p => p.t === 'F').reduce((s, p) => s + p.s1 - p.s0, 0);
  if (W !== b) return { ok: false, a, b, pieces, why: `the walls rise ${W} but the strip meets the wall at ${b}` };
  if (F !== -a) return { ok: false, a, b, pieces, why: `the roofs reach back ${F} but the strip leaves the floor ${-a} out` };
  return { ok: true, a, b, pieces };
}

// the fold types of a column: valley, mountain, ..., valley
export const foldTypes = folds => [...folds].sort((x, y) => x - y).map((_, i) => i % 2 ? 'mountain' : 'valley');

// a random standing profile: depth d, height h, in `steps` setbacks
export function randomProfile(rng, { D = 5, H = 5, steps = [1, 2], minD = 1, minH = 1 } = {}) {
  for (let t = 0; t < 200; t++) {
    const k = steps[0] + randInt(rng, steps[1] - steps[0] + 1);
    const d = Math.max(minD, k) + randInt(rng, Math.max(1, D - Math.max(minD, k)));
    const h = Math.max(minH, k) + randInt(rng, Math.max(1, H - Math.max(minH, k) + 1));
    if (d > D - 1 || h > H - 1) continue;
    const ws = split(rng, h, k), fs = split(rng, d, k);
    if (!ws || !fs) continue;
    const folds = [-d];
    let s = -d;
    for (let i = 0; i < k; i++) { s += ws[i]; folds.push(s); s += fs[i]; folds.push(s); }
    if (profileOf(folds).ok) return folds;
  }
  return [-2, 1, 3];
}
// n split into k positive parts
function split(rng, n, k) {
  if (n < k) return null;
  const cuts = shuffle(rng, Array.from({ length: n - 1 }, (_, i) => i + 1)).slice(0, k - 1).sort((x, y) => x - y);
  const out = [];
  let prev = 0;
  for (const c of [...cuts, n]) { out.push(c - prev); prev = c; }
  return out;
}

// another standing profile near this one (a different depth, height or step)
export function nearProfile(rng, folds, { D, H }) {
  const p = profileOf(folds);
  const k = p.pieces.length / 2;
  for (let t = 0; t < 60; t++) {
    const ws = p.pieces.filter(x => x.t === 'W').map(x => x.s1 - x.s0);
    const fs = p.pieces.filter(x => x.t === 'F').map(x => x.s1 - x.s0);
    const which = rng() < .5 ? ws : fs;
    const i = randInt(rng, k);
    which[i] += rng() < .5 ? 1 : -1;
    if (which[i] < 1) continue;
    const d = fs.reduce((x, y) => x + y, 0), h = ws.reduce((x, y) => x + y, 0);
    if (d > D - 1 || h > H - 1) continue;
    const out = [-d];
    let s = -d;
    for (let j = 0; j < k; j++) { s += ws[j]; out.push(s); s += fs[j]; out.push(s); }
    if (profileOf(out).ok && out.join() !== folds.join()) return out;
  }
  return null;
}

// break a profile: move one inner fold a row, so the strip no longer closes
export function brokenProfile(rng, folds, { D, H }) {
  const f = [...folds].sort((x, y) => x - y);
  for (let t = 0; t < 30; t++) {
    const i = 1 + randInt(rng, f.length - 2);
    const to = f[i] + (rng() < .5 ? 1 : -1);
    if (to <= f[i - 1] || to >= f[i + 1]) continue;
    const g = f.slice(); g[i] = to;
    if (!profileOf(g).ok) return g;
  }
  return null;
}

// ------------------------------------------------------------------
// the card
// ------------------------------------------------------------------

// spec: { W, D, H, cols: [folds | null] x W }
export const sameCol = (p, q) => (p ? p.join() : '') === (q ? q.join() : '');

// strips: runs of neighbouring columns with the same folds: [{ x0, x1, folds }]
export function stripsOf(card) {
  const out = [];
  for (let i = 0; i < card.W; i++) {
    const f = card.cols[i];
    if (!f || !f.length) continue;
    const last = out[out.length - 1];
    if (last && last.x1 === i && sameCol(last.folds, f)) last.x1 = i + 1;
    else out.push({ x0: i, x1: i + 1, folds: [...f].sort((x, y) => x - y) });
  }
  return out;
}

// the cut lines: along each side of a strip, over the rows it moves
export function cutsOf(card) {
  const range = f => { const s = [...f].sort((x, y) => x - y); return [s[0], s[s.length - 1]]; };
  const out = [];
  for (let x = 0; x <= card.W; x++) {
    const L = x > 0 ? card.cols[x - 1] : null, R = x < card.W ? card.cols[x] : null;
    const l = L && L.length ? L : null, r = R && R.length ? R : null;
    if (!l && !r) continue;
    if (l && r && sameCol([...l].sort((a, b) => a - b), [...r].sort((a, b) => a - b))) continue;
    const rs = [l, r].filter(Boolean).map(range);
    // a cut along the card's own edge is no cut: the paper ends there
    if (x === 0 || x === card.W) continue;
    out.push({ x, s0: Math.min(...rs.map(q => q[0])), s1: Math.max(...rs.map(q => q[1])) });
  }
  return out;
}

// every fold line: [{ x0, x1, s, type, strip }] (the gutter of plain columns too)
export function foldLinesOf(card) {
  const out = [];
  for (const st of stripsOf(card)) {
    const types = foldTypes(st.folds);
    st.folds.forEach((s, i) => out.push({ x0: st.x0, x1: st.x1, s, type: types[i], strip: st }));
  }
  let run = null;
  for (let i = 0; i <= card.W; i++) {
    const plain = i < card.W && !(card.cols[i] && card.cols[i].length);
    if (plain) { if (run) run.x1 = i + 1; else run = { x0: i, x1: i + 1, s: 0, type: 'valley', gutter: true }; }
    else if (run) { out.push(run); run = null; }
  }
  return out;
}

// ------------------------------------------------------------------
// the card opening: every piece of paper as a 3D rectangle at angle theta
// ------------------------------------------------------------------

// theta: angle between floor and wall (180 flat, 90 open), in radians.
// Returns [{ col, kind: 'floor'|'wall'|'piece', ok, s0, s1, quad: [[x, y, z] x4] }]
// with x across the card, y out from the gutter along the floor, z up.
export function poseCard(card, theta) {
  const wd = [Math.cos(theta), Math.sin(theta)];          // the wall's direction in (y, z)
  const out = [];
  const floorPt = s => [-s, 0];                            // s <= 0
  const wallPt = s => [s * wd[0], s * wd[1]];              // s >= 0
  const rect = (col, kind, ok, s0, s1, p0, p1, x0 = col, x1 = col + 1) => out.push({ col, kind, ok, s0, s1,
    quad: [[x0, p0[0], p0[1]], [x1, p0[0], p0[1]], [x1, p1[0], p1[1]], [x0, p1[0], p1[1]]] });
  for (let i = 0; i < card.W; i++) {
    const f = card.cols[i];
    const p = profileOf(f);
    if (p.plain) {
      rect(i, 'floor', true, -card.D, 0, floorPt(-card.D), floorPt(0));
      rect(i, 'wall', true, 0, card.H, wallPt(0), wallPt(card.H));
      continue;
    }
    if (!p.ok) {
      // a strip that cannot stand stays in the sheet: cut and creased, but flat
      const at = s => s <= 0 ? floorPt(s) : wallPt(s);
      const pts = [...new Set([...f, 0])].sort((x, y) => x - y);
      rect(i, 'floor', false, -card.D, pts[0], floorPt(-card.D), floorPt(pts[0]));
      for (let k = 0; k + 1 < pts.length; k++) rect(i, 'piece', false, pts[k], pts[k + 1], at(pts[k]), at(pts[k + 1]));
      rect(i, 'wall', false, pts[pts.length - 1], card.H, wallPt(pts[pts.length - 1]), wallPt(card.H));
      continue;
    }
    rect(i, 'floor', true, -card.D, p.a, floorPt(-card.D), floorPt(p.a));
    rect(i, 'wall', true, p.b, card.H, wallPt(p.b), wallPt(card.H));
    let at = floorPt(p.a);
    for (const pc of p.pieces) {
      const L = pc.s1 - pc.s0;
      const dir = pc.t === 'W' ? wd : [-1, 0];
      const next = [at[0] + dir[0] * L, at[1] + dir[1] * L];
      rect(i, 'piece', true, pc.s0, pc.s1, at, next);
      out[out.length - 1].t = pc.t;
      at = next;
    }
  }
  return out;
}

// the building a card makes at 90 degrees, as boxes per column: [{ col, y0, y1, z0, z1 }]
// (the solid under each roof piece), for comparing and drawing targets
export function massOf(card) {
  const out = [];
  for (let i = 0; i < card.W; i++) {
    const p = profileOf(card.cols[i]);
    if (p.plain || !p.ok) continue;
    let y = -p.a, z = 0;
    for (const pc of p.pieces) {
      const L = pc.s1 - pc.s0;
      if (pc.t === 'W') z += L;
      else { out.push({ col: i, y0: y - L, y1: y, z0: 0, z1: z }); y -= L; }
    }
  }
  return out;
}

// ------------------------------------------------------------------
// the open building as orthographic drawings
// ------------------------------------------------------------------

// On the unit lattice:
//   plan[col][j]   roof height over the floor cell y in [j, j + 1] (0: the floor)
//   face[col][k]   depth of the frontmost face at height z in [k, k + 1] (0: the wall)
export function drawingsOf(card) {
  const plan = [], face = [];
  for (let i = 0; i < card.W; i++) {
    const hp = Array(card.D).fill(0), fd = Array(card.H).fill(0);
    const p = profileOf(card.cols[i]);
    if (!p.plain && p.ok) {
      let y = -p.a, z = 0;
      for (const pc of p.pieces) {
        const L = pc.s1 - pc.s0;
        if (pc.t === 'W') { for (let k = z; k < z + L; k++) fd[k] = y; z += L; }
        else { for (let j = y - L; j < y; j++) hp[j] = z; y -= L; }
      }
    }
    plan.push(hp); face.push(fd);
  }
  return { plan, face };
}

// the lines of a drawing: unit edges between cells of a field that differ,
// plus the outline. field[i][j], i across (0..nx-1), j up (0..ny-1).
// Returns [[[x, j], [x, j]], ...] in field units, neighbouring unit edges merged.
export function fieldEdges(field) {
  const nx = field.length, ny = field[0].length;
  const at = (i, j) => i < 0 || i >= nx || j < 0 || j >= ny ? null : field[i][j];
  const out = [];
  // across: horizontal edges at j, runs along i
  for (let j = 0; j <= ny; j++) {
    let run = null;
    for (let i = 0; i <= nx; i++) {
      const on = i < nx && at(i, j - 1) !== at(i, j);
      if (on) { if (run) run[1][0] = i + 1; else run = [[i, j], [i + 1, j]]; }
      else if (run) { out.push(run); run = null; }
    }
  }
  // up: vertical edges at i, runs along j
  for (let i = 0; i <= nx; i++) {
    let run = null;
    for (let j = 0; j <= ny; j++) {
      const on = j < ny && at(i - 1, j) !== at(i, j);
      if (on) { if (run) run[1][1] = j + 1; else run = [[i, j], [i, j + 1]]; }
      else if (run) { out.push(run); run = null; }
    }
  }
  return out;
}

// ------------------------------------------------------------------
// generators
// ------------------------------------------------------------------

// a building of `strips` strips across a W-column card, with gaps
export function randomCard(rng, { W = 10, D = 5, H = 5, strips = [2, 3], width = [1, 3], steps = [1, 2] } = {}) {
  for (let t = 0; t < 200; t++) {
    const n = strips[0] + randInt(rng, strips[1] - strips[0] + 1);
    const cols = Array(W).fill(null);
    let x = randInt(rng, 2), made = 0, prev = null;
    while (made < n && x < W) {
      const w = Math.min(W - x, width[0] + randInt(rng, width[1] - width[0] + 1));
      let f = randomProfile(rng, { D, H, steps });
      if (prev && sameCol(prev, f)) f = nearProfile(rng, f, { D, H }) || f;
      for (let i = x; i < x + w; i++) cols[i] = f;
      prev = f; made++;
      x += w + (rng() < .4 ? 0 : 1);
    }
    if (made < n) continue;
    // centre the building on the card
    const used = cols.map((f, i) => f ? i : -1).filter(i => i >= 0);
    const shift = Math.floor((W - (used[used.length - 1] + 1 + used[0])) / 2);
    const moved = Array(W).fill(null);
    cols.forEach((f, i) => { if (f && i + shift >= 0 && i + shift < W) moved[i + shift] = f; });
    return { W, D, H, cols: moved };
  }
  return { W, D, H, cols: Array(W).fill(null).map((_, i) => i >= 3 && i < 7 ? [-2, 1, 3] : null) };
}

// three other cards a careless reader could take for this one
export function readOptions(rng, card) {
  const strips = stripsOf(card);
  const seen = new Set([key(card)]);
  const out = [];
  const add = (c, why) => { const k = key(c); if (seen.has(k)) return; seen.add(k); out.push({ card: c, why }); };
  for (let t = 0; t < 40 && out.length < 6; t++) {
    const c = { ...card, cols: card.cols.slice() };
    const st = pick(rng, strips);
    const r = rng();
    if (r < .5) {
      const f = nearProfile(rng, st.folds, card);
      if (!f) continue;
      for (let i = st.x0; i < st.x1; i++) c.cols[i] = f;
      add(c, 'one strip has a different section');
    } else if (r < .75 && st.x1 - st.x0 > 1) {
      c.cols[rng() < .5 ? st.x0 : st.x1 - 1] = null;
      add(c, 'a strip is narrower');
    } else {
      // the strip moves one column over
      const dx = rng() < .5 ? -1 : 1;
      if (st.x0 + dx < 0 || st.x1 + dx > card.W) continue;
      for (let i = st.x0; i < st.x1; i++) c.cols[i] = null;
      for (let i = st.x0; i < st.x1; i++) c.cols[i + dx] = st.folds;
      add(c, 'a strip sits one column over');
    }
  }
  return shuffle(rng, [{ card, ok: true }, ...shuffle(rng, out).slice(0, 3)]);
}
const key = c => c.cols.map(f => f ? f.join(' ') : '-').join('|');
export const cardKey = key;

// a card with 1 or 2 strips that cannot stand
export function tearCard(rng, card, n = 1) {
  const strips = shuffle(rng, stripsOf(card));
  const c = { ...card, cols: card.cols.slice() }, broken = [];
  for (const st of strips) {
    if (broken.length >= n) break;
    const g = brokenProfile(rng, st.folds, card);
    if (!g) continue;
    for (let i = st.x0; i < st.x1; i++) c.cols[i] = g;
    broken.push(st.x0);
  }
  return broken.length ? { card: c, broken } : null;
}

// a card from rows of a little drawing language, for hand-made levels:
// cols is a list of [width, folds | null]
export function cardFrom({ W = 10, D = 5, H = 5, cols }) {
  const out = [];
  for (const [w, f] of cols) for (let i = 0; i < w; i++) out.push(f ? f.slice() : null);
  while (out.length < W) out.push(null);
  return { W, D, H, cols: out.slice(0, W) };
}

// ------------------------------------------------------------------
// export: the card as SVG with standard line types
// ------------------------------------------------------------------

export function svgOf(card, unit = 10) {
  const W = card.W * unit, Hh = (card.D + card.H) * unit;
  const X = x => (x * unit).toFixed(1), Y = s => ((card.H - s) * unit).toFixed(1);
  const lines = [];
  lines.push(`<rect x="0" y="0" width="${W}" height="${Hh}" fill="none" stroke="#000" stroke-width="0.3"/>`);
  for (const c of cutsOf(card)) lines.push(`<line x1="${X(c.x)}" y1="${Y(c.s0)}" x2="${X(c.x)}" y2="${Y(c.s1)}" stroke="#000" stroke-width="0.3"/>`);
  for (const f of foldLinesOf(card)) {
    const dash = f.type === 'valley' ? '2 1.2' : '3 1 .6 1';
    lines.push(`<line x1="${X(f.x0)}" y1="${Y(f.s)}" x2="${X(f.x1)}" y2="${Y(f.s)}" stroke="#000" stroke-width="0.2" stroke-dasharray="${dash}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${Hh}mm" viewBox="0 0 ${W} ${Hh}">\n<!-- cut: solid · valley fold: dashed · mountain fold: dash-dot -->\n${lines.join('\n')}\n</svg>\n`;
}
