// The puzzles of Roof Plans, over roof.js roofs.
//
//   planLines(roof)            the roof plan as lines { a, b, kind } on the sheet
//   mutate(roof, rng, n)       a plan with n wrong lines (Spot the error)
//   compareSteps(roof, steps)  what a drawn plan misses and adds (Draw the plan)
//   neighbours(cells, rng)     footprints one block away (Which roof?)
//   briefOf / meets            design briefs with many right answers (Design to brief)
//   descent(roof, x, y)        which way water runs on the roof at a sheet point (rain)
//
// Sheet coordinates as in roof.js: x right, y down, S = 2 sheet units per module.

import { roofOf, cornersOf, outlineOf, S } from './roof.js';
import { stepKey, stepsOf, parseStep, pointKey } from './lattice.js';
import { randInt, shuffle, pick } from './rand.js';

export const KINDS = ['ridge', 'hip', 'valley'];
const key = (i, j) => i + ',' + j;
const unkey = k => k.split(',').map(Number);

export const planLines = roof => roof.lines.map(l => ({ a: l.a, b: l.b, kind: l.kind }));

// ------------------------------------------------------------------
// footprints
// ------------------------------------------------------------------

// can this footprint carry a roof the game can draw? one piece, no pinched
// corner, every wall at least `minEdge` modules, roof fully on the lattice
export function goodFootprint(cells, { minEdge = 1 } = {}) {
  if (!cells.size || !connected(cells)) return false;
  if (cornersOf(cells).pinch) return false;
  if (!holes(cells) && outlineOf(cells).some(e => e.len < minEdge)) return false;
  return !roofOf(cells).problems.length;
}

function connected(cells) {
  const first = cells.values().next().value, seen = new Set([first]), todo = [first];
  while (todo.length) {
    const [i, j] = unkey(todo.pop());
    for (const k of [key(i + 1, j), key(i - 1, j), key(i, j + 1), key(i, j - 1)]) if (cells.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); }
  }
  return seen.size === cells.size;
}

// the courtyards: empty cells inside the bounding box that cannot reach its edge
export function holes(cells) {
  let w = 0, h = 0;
  for (const k of cells) { const [i, j] = unkey(k); w = Math.max(w, i + 1); h = Math.max(h, j + 1); }
  const seen = new Set(), todo = [];
  for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) if (i < 0 || j < 0 || i === w || j === h) { seen.add(key(i, j)); todo.push([i, j]); }
  while (todo.length) {
    const [i, j] = todo.pop();
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < -1 || b < -1 || a > w || b > h) continue;
      const k = key(a, b);
      if (cells.has(k) || seen.has(k)) continue;
      seen.add(k); todo.push([a, b]);
    }
  }
  let n = 0;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (!cells.has(key(i, j)) && !seen.has(key(i, j))) n++;
  return n;
}

// move a footprint so its bounding box starts at 0, 0
export function normalise(cells) {
  let x0 = Infinity, y0 = Infinity;
  for (const k of cells) { const [i, j] = unkey(k); x0 = Math.min(x0, i); y0 = Math.min(y0, j); }
  return new Set([...cells].map(k => { const [i, j] = unkey(k); return key(i - x0, j - y0); }));
}

// Footprints one block away: a 1 x 2 or 2 x 2 block added at the edge or taken
// off a wing. Used as the wrong answers of Which roof?, so they must be good
// footprints and must not have the same roof plan.
export function neighbours(cells, rng, n = 2) {
  const out = [], seen = new Set([sig(cells)]);
  let w = 0, h = 0;
  for (const k of cells) { const [i, j] = unkey(k); w = Math.max(w, i + 1); h = Math.max(h, j + 1); }
  for (let t = 0; t < 400 && out.length < n; t++) {
    const next = new Set(cells);
    const bw = 1 + randInt(rng, 2), bh = 1 + randInt(rng, 2);
    const x = randInt(rng, w + 2) - 1, y = randInt(rng, h + 2) - 1;
    const add = rng() < .55;
    for (let i = x; i < x + bw; i++) for (let j = y; j < y + bh; j++) add ? next.add(key(i, j)) : next.delete(key(i, j));
    if (next.size === cells.size || next.size < 4) continue;
    const norm = normalise(next);
    if (!goodFootprint(norm, { minEdge: 1 })) continue;
    const s = sig(norm);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(norm);
  }
  return out;
}
const sig = cells => [...normalise(cells)].sort().join(';');

// ------------------------------------------------------------------
// spot the error
// ------------------------------------------------------------------

// A plan with n wrong lines: a hip drawn as a valley (or the other way), a
// ridge drawn as a hip, a ridge one step too long or too short. Returns
// { lines: [{ a, b, kind, wrong, why }] } with the wrong ones marked.
export function mutate(roof, rng, n = 1) {
  const lines = planLines(roof).map(l => ({ ...l, wrong: false }));
  const squares = roof.squares, creases = roof.creases;
  const inside = p => [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => squares.has(key(p[0] + dx, p[1] + dy)));
  const order = shuffle(rng, lines.map((_, i) => i));
  let done = 0;
  for (const i of order) {
    if (done >= n) break;
    const l = lines[i];
    const len = Math.max(Math.abs(l.b[0] - l.a[0]), Math.abs(l.b[1] - l.a[1]));
    const options = [];
    if (l.kind === 'hip') options.push(['kind', 'valley', 'a hip drawn as a valley']);
    if (l.kind === 'valley') options.push(['kind', 'hip', 'a valley drawn as a hip']);
    if (l.kind === 'ridge') options.push(['kind', 'hip', 'a ridge drawn as a hip']);
    if (l.kind === 'ridge') {
      // one step longer, through an end that is free
      for (const [end, other] of [['a', 'b'], ['b', 'a']]) {
        const d = [Math.sign(l[end][0] - l[other][0]), Math.sign(l[end][1] - l[other][1])];
        const p = [l[end][0] + d[0], l[end][1] + d[1]];
        if (inside(p) && !creases.has(stepKey(l[end], p)) && !roof.eaveSet.has(stepKey(l[end], p))) options.push(['grow', { end, p }, 'the ridge runs on too far']);
      }
      if (len >= 2) options.push(['shrink', null, 'the ridge stops short']);
    }
    if (!options.length) continue;
    const [what, arg, why] = pick(rng, options);
    if (what === 'kind') l.kind = arg;
    else if (what === 'grow') l[arg.end] = arg.p;
    else {
      const end = rng() < .5 ? 'a' : 'b', other = end === 'a' ? 'b' : 'a';
      const d = [Math.sign(l[other][0] - l[end][0]), Math.sign(l[other][1] - l[end][1])];
      l[end] = [l[end][0] + d[0], l[end][1] + d[1]];
    }
    l.wrong = true; l.why = why;
    done++;
  }
  return { lines };
}

// ------------------------------------------------------------------
// draw the plan
// ------------------------------------------------------------------

// what a drawn plan (a set of step keys) misses and adds, ignoring line kinds
export function compareSteps(roof, drawn) {
  const want = new Set(roof.creases.keys());
  const missing = [...want].filter(k => !drawn.has(k));
  const extra = [...drawn].filter(k => !want.has(k));
  return { ok: !missing.length && !extra.length, missing, extra };
}

// the step keys of drawn lines [{ a, b }]
export const stepsOfLines = lines => {
  const s = new Set();
  for (const l of lines) for (const k of stepsOf(l.a, l.b)) s.add(k);
  return s;
};

// ------------------------------------------------------------------
// design to brief
// ------------------------------------------------------------------

// What a footprint's roof has: modules, valleys, outside corners, ridge pieces,
// highest point (modules above the eaves), courtyards.
export function roofStats(cells) {
  const roof = roofOf(cells);
  const c = cornersOf(cells);
  let top = 0;
  for (const t of roof.tris) for (const p of t.pts) top = Math.max(top, p[2]);
  // ridge pieces: connected groups of ridge steps
  const ridge = [...roof.creases].filter(([, k]) => k === 'ridge').map(([s]) => s);
  const parent = new Map(ridge.map(s => [s, s]));
  const find = s => parent.get(s) === s ? s : (parent.set(s, find(parent.get(s))), parent.get(s));
  const at = new Map();
  for (const s of ridge) for (const p of parseStep(s)) {
    const pk = pointKey(...p);
    if (at.has(pk)) parent.set(find(s), find(at.get(pk))); else at.set(pk, s);
  }
  const ridges = new Set(ridge.map(find)).size;
  return { modules: cells.size, valleys: c.reflex.length, hips: c.convex.length, ridges, height: top / S, courtyards: holes(cells) ? 1 : 0, roof };
}

// A brief: a few targets a footprint must meet. Each test reads roofStats.
export const BRIEF_TESTS = {
  modules: (s, v) => s.modules === v,
  minModules: (s, v) => s.modules >= v,
  maxModules: (s, v) => s.modules <= v,
  valleys: (s, v) => s.valleys === v,
  ridges: (s, v) => s.ridges === v,
  height: (s, v) => Math.abs(s.height - v) < 1e-9,
  courtyard: (s, v) => !!s.courtyards === v,
};
export const BRIEF_TEXT = {
  modules: v => `exactly ${v} modules`,
  minModules: v => `at least ${v} modules`,
  maxModules: v => `at most ${v} modules`,
  valleys: v => v === 0 ? 'no valleys' : `exactly ${v} valley${v === 1 ? '' : 's'}`,
  ridges: v => v === 1 ? 'one continuous ridge' : `${v} separate ridges`,
  height: v => `the highest ridge ${v} module${v === 1 ? '' : 's'} above the eaves`,
  courtyard: v => v ? 'a courtyard' : 'no courtyard',
};

// which targets of a brief a footprint meets: [{ key, value, ok, text }]
export function meets(cells, brief) {
  const ok = cells.size && connected(cells) && !cornersOf(cells).pinch && !roofOf(cells).problems.length;
  const s = ok ? roofStats(cells) : null;
  return Object.entries(brief).map(([k, v]) => ({ key: k, value: v, ok: !!s && BRIEF_TESTS[k](s, v), text: BRIEF_TEXT[k](v), have: s }));
}

// ------------------------------------------------------------------
// rain
// ------------------------------------------------------------------

// The way water runs at a sheet point: down the steepest slope, as a unit
// vector in sheet units, or null where the roof is flat to the touch (a ridge
// or the eave). Across a valley the two planes pull toward each other; their
// sum runs down the valley, which is what keeps drops in it.
export function descent(roof, x, y, e = .02) {
  const g = grad(roof, x, y, e);
  if (!g) return null;
  const ahead = grad(roof, x - g[0] * .12, y - g[1] * .12, e);
  let d = [-g[0], -g[1]];
  if (ahead && g[0] * ahead[0] + g[1] * ahead[1] < .3) d = [-(g[0] + ahead[0]), -(g[1] + ahead[1])];
  const l = Math.hypot(d[0], d[1]);
  return l < 1e-6 ? null : [d[0] / l, d[1] / l];
}
function grad(roof, x, y, e) {
  const h = roof.height;
  const gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e);
  const l = Math.hypot(gx, gy);
  return l < 1e-6 ? null : [gx / l, gy / l];
}
