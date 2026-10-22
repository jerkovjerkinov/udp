// Stack: modules on a site, where a stack is valid only when it works as
// housing (Habitat 67: each unit's roof is another's garden). Pure logic on a
// cell grid, tested in node.
//
// Cells are integer [x, y, z], z up. The site is W x D cells; y = 0 is the
// street side, which faces south (the sun comes from -y). A module is a
// polycube of one of the SHAPES in one of the 24 orientations; it is dropped
// from above onto a column and falls until it rests (3D Tetris), so it can
// never slide in under an overhang.
//
// Rules (a level picks some):
//   support   every module rests on the ground or on another module; a bottom
//             cell with nothing under it overhangs, and may lie at most k cells
//             (across the plan) from one that is carried
//   daylight  every module has a window: a side face that looks out over open
//             ground to the edge of the site ('any' side, or 'south' only)
//   terrace   every module has at least n roof cells open to the sky
//   access    every module touches a circulation core, or the street at
//             ground level (row y = 0, z = 0)
// The envelope (the site, the height limit, setbacks by row) and the cores are
// hard limits: a module cannot be dropped outside them.
//
// Tasks built on this (makeLevel):
//   fill      fill a massing exactly with the given modules
//   habitat   place every module so every rule holds
//   match     place the modules so the stack matches a plan and a front elevation
//   fix       one module breaks a rule: move one module so every rule holds
//   optimise  every rule holds and the terrace (or daylight) score reaches the goal

import { randInt, shuffle, pick } from './rand.js';

// ------------------------------------------------------------------
// shapes and orientations
// ------------------------------------------------------------------

export const SHAPES = {
  cell:   { name: 'Cell',   cells: [[0, 0, 0]] },
  studio: { name: 'Studio', cells: [[0, 0, 0], [1, 0, 0]] },
  flat:   { name: 'Flat',   cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] },
  corner: { name: 'Corner', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
  family: { name: 'Family', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]] },
  tee:    { name: 'Tee',    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
  square: { name: 'Square', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
  step:   { name: 'Step',   cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]] },
  tripod: { name: 'Tripod', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  twist:  { name: 'Twist',  cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
};

const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const RZ = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];     // a quarter turn about z (yaw)
const RX = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];     // a quarter turn about x (tip)
const mkey = M => M.flat().join(',');

// the 24 rotations of the cube, identity first
export const ROTS = (() => {
  const out = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
  const seen = new Set([mkey(out[0])]);
  for (let i = 0; i < out.length; i++) for (const R of [RZ, RX]) {
    const M = mul(R, out[i]);
    if (!seen.has(mkey(M))) { seen.add(mkey(M)); out.push(M); }
  }
  return out;
})();
const ROT_INDEX = new Map(ROTS.map((M, i) => [mkey(M), i]));
export const turn = (o, s = 1) => { let M = ROTS[o]; for (let k = 0; k < ((s % 4) + 4) % 4; k++) M = mul(RZ, M); return ROT_INDEX.get(mkey(M)); };
export const tip = o => ROT_INDEX.get(mkey(mul(RX, ROTS[o])));

// cells in the order the tiler fills them: by z, then y, then x
const cmp = (a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0];

// a shape turned by orientation o, moved so its least corner is at the origin
export function oriented(type, o = 0) {
  const M = ROTS[o];
  const c = SHAPES[type].cells.map(p => [0, 1, 2].map(i => M[i][0] * p[0] + M[i][1] * p[1] + M[i][2] * p[2]));
  const mn = [0, 1, 2].map(i => Math.min(...c.map(p => p[i])));
  return c.map(p => [p[0] - mn[0], p[1] - mn[1], p[2] - mn[2]]).sort(cmp);
}
const shapeKey = cells => cells.map(p => p.join(',')).join(';');

// the distinct orientations of a shape: [o]
const DISTINCT = new Map();
export function orientations(type) {
  if (!DISTINCT.has(type)) {
    const seen = new Set(), out = [];
    for (let o = 0; o < 24; o++) { const k = shapeKey(oriented(type, o)); if (!seen.has(k)) { seen.add(k); out.push(o); } }
    DISTINCT.set(type, out);
  }
  return DISTINCT.get(type);
}
// lying down: no two cells stacked (a single storey)
export const flatOrientations = type => orientations(type).filter(o => oriented(type, o).every(p => p[2] === 0));

// the cell a module hangs from when dropped onto a column: its lowest, then nearest the street, then leftmost
export const anchorOf = cells => cells.slice().sort(cmp)[0];

// ------------------------------------------------------------------
// the site
// ------------------------------------------------------------------

export const K = (x, y, z) => x + ',' + y + ',' + z;
const K2 = (x, y) => x + ',' + y;

// site: { W, D, H, rows?: height limit per row y (setbacks), cores?: [[x, y]], street?: true }
export const limitAt = (site, y) => Math.min(site.H, site.rows?.[y] ?? site.H);
export const onSite = (site, x, y) => x >= 0 && y >= 0 && x < site.W && y < site.D;
export const isCore = (site, x, y) => (site.cores || []).some(c => c[0] === x && c[1] === y);

// who fills each cell: Map 'x,y,z' -> module id ('core' for cores)
export function occupancy(site, mods, skip = null) {
  const occ = new Map();
  for (const [x, y] of site.cores || []) for (let z = 0; z < site.H; z++) occ.set(K(x, y, z), 'core');
  for (const m of mods) if (m.id !== skip) for (const c of m.cells) occ.set(K(...c), m.id);
  return occ;
}
// the top of each column: Map 'x,y' -> first free z
function tops(mods, skip = null) {
  const t = new Map();
  for (const m of mods) if (m.id !== skip) for (const c of m.cells) { const k = K2(c[0], c[1]); t.set(k, Math.max(t.get(k) || 0, c[2] + 1)); }
  return t;
}

// drop a module (cells in its own frame) with its anchor over column (ax, ay):
// { cells, ok, why } where why is 'site' | 'core' | 'limit'
export function drop(site, mods, cells, ax, ay, { skip = null } = {}) {
  const a = anchorOf(cells), dx = ax - a[0], dy = ay - a[1];
  const t = tops(mods, skip);
  let z0 = 0, why = null;
  for (const c of cells) {
    const x = c[0] + dx, y = c[1] + dy;
    if (!onSite(site, x, y)) why = why || 'site';
    else if (isCore(site, x, y)) why = why || 'core';
    z0 = Math.max(z0, (t.get(K2(x, y)) || 0) - c[2]);
  }
  const out = cells.map(c => [c[0] + dx, c[1] + dy, c[2] + z0]);
  if (!why && out.some(c => c[2] >= limitAt(site, c[1]))) why = 'limit';
  return { cells: out, ok: !why, why };
}

export const WHY = {
  site: 'Outside the site.',
  core: 'A core is in the way.',
  limit: 'Above the height limit.',
};

// ------------------------------------------------------------------
// the rules
// ------------------------------------------------------------------

export const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOUTH = [[0, -1]];

// rules: { support: k (overhang limit; null for none), daylight: null | 'any' | 'south', terrace: n, access: bool }
// -> { ok, fails: Map id -> [{ rule, text, by: [ids] }], lit: Map id -> [{ c, d }], sky: Map id -> [c],
//      access: Map id -> bool, score: { terrace, daylight }, failing: [ids] }
export function evaluate(site, mods, rules = {}) {
  const occ = occupancy(site, mods);
  const fails = new Map(), lit = new Map(), sky = new Map(), access = new Map();
  const fail = (id, f) => { if (!fails.has(id)) fails.set(id, []); fails.get(id).push(f); };
  const above = new Map();          // highest filled z per column
  for (const [k, v] of occ) if (v !== 'core') { const [x, y, z] = k.split(',').map(Number); const kk = K2(x, y); above.set(kk, Math.max(above.get(kk) ?? -1, z)); }
  let terrace = 0, daylight = 0;
  for (const m of mods) {
    const own = new Set(m.cells.map(c => K(...c)));
    // support
    const bottoms = m.cells.filter(c => !own.has(K(c[0], c[1], c[2] - 1)));
    const below = c => occ.get(K(c[0], c[1], c[2] - 1));
    const borne = bottoms.filter(c => c[2] === 0 || (below(c) && below(c) !== 'core'));
    if (!borne.length) fail(m.id, { rule: 'support', text: 'Nothing under it.', by: [] });
    else if (rules.support != null) {
      let far = 0;
      for (const c of bottoms) if (!borne.includes(c)) far = Math.max(far, Math.min(...borne.map(b => Math.abs(b[0] - c[0]) + Math.abs(b[1] - c[1]))));
      if (far > rules.support) fail(m.id, { rule: 'support', text: rules.support ? `It overhangs ${far} cells; ${rules.support} at most.` : 'Every cell must stand on something: no overhang.', by: [] });
    }
    // daylight: side faces that look over open ground to the edge of the site
    const faces = [], blockers = new Set();
    for (const c of m.cells) for (const d of rules.daylight === 'south' ? SOUTH : DIR4) {
      if (own.has(K(c[0] + d[0], c[1] + d[1], c[2]))) continue;
      let t = 1, by = null;
      for (;; t++) {
        const x = c[0] + d[0] * t, y = c[1] + d[1] * t;
        if (!onSite(site, x, y)) break;
        const o = occ.get(K(x, y, c[2]));
        if (o) { by = o; break; }
      }
      if (by) { if (by !== 'core' && by !== m.id) blockers.add(by); } else faces.push({ c, d });
    }
    lit.set(m.id, faces);
    daylight += faces.length;
    if (rules.daylight && !faces.length) fail(m.id, { rule: 'daylight', text: rules.daylight === 'south' ? 'No window faces south over open ground.' : 'No window looks out over open ground.', by: [...blockers] });
    // terrace: roof cells with nothing above them
    const open = m.cells.filter(c => (above.get(K2(c[0], c[1])) ?? -1) === c[2]);
    sky.set(m.id, open);
    terrace += open.length;
    if (rules.terrace && open.length < rules.terrace) {
      const by = new Set();
      for (const c of m.cells) for (let z = c[2] + 1; z <= (above.get(K2(c[0], c[1])) ?? -1); z++) { const o = occ.get(K(c[0], c[1], z)); if (o && o !== m.id) by.add(o); }
      fail(m.id, { rule: 'terrace', text: rules.terrace === 1 ? 'No roof open to the sky: no terrace.' : `${open.length} of ${rules.terrace} roof cells open to the sky.`, by: [...by] });
    }
    // access: a core beside it, or the street under it
    const reach = m.cells.some(c => (site.street !== false && c[2] === 0 && c[1] === 0) || DIR4.some(d => isCore(site, c[0] + d[0], c[1] + d[1])));
    access.set(m.id, reach);
    if (rules.access && !reach) fail(m.id, { rule: 'access', text: 'No way in: it touches no core, and not the street.', by: [] });
  }
  return { ok: fails.size === 0, fails, lit, sky, access, score: { terrace, daylight }, failing: [...fails.keys()] };
}

export const RULE_NAMES = { support: 'Support', daylight: 'Daylight', terrace: 'Terrace', access: 'Access' };

// the rules a level applies, as lines for the side card
export function ruleLines(rules) {
  const out = [];
  out.push({ rule: 'support', text: rules.support == null ? 'Rests on something' : rules.support ? `Overhang ${rules.support} at most` : 'No overhang' });
  if (rules.daylight) out.push({ rule: 'daylight', text: rules.daylight === 'south' ? 'A south window' : 'A window to the open' });
  if (rules.terrace) out.push({ rule: 'terrace', text: rules.terrace === 1 ? 'A roof open to the sky' : `${rules.terrace} roof cells open to the sky` });
  if (rules.access) out.push({ rule: 'access', text: 'Touches a core or the street' });
  return out;
}

// ------------------------------------------------------------------
// drawings: the plan (footprint) and the front elevation (silhouette from the street)
// ------------------------------------------------------------------

export function drawingsOf(mods) {
  const plan = new Set(), front = new Set();
  for (const m of mods) for (const c of m.cells) { plan.add(K2(c[0], c[1])); front.add(K2(c[0], c[2])); }
  return { plan, front };
}
const sameSet = (a, b) => a.size === b.size && [...a].every(k => b.has(k));
export function matchDrawings(mods, target) {
  const d = drawingsOf(mods);
  return { plan: sameSet(d.plan, target.plan), front: sameSet(d.front, target.front), now: d };
}

// a massing from a height map: heights[y][x] -> cells
export function massCells(heights) {
  const out = [];
  heights.forEach((row, y) => row.forEach((h, x) => { for (let z = 0; z < h; z++) out.push([x, y, z]); }));
  return out;
}

// ------------------------------------------------------------------
// generators
// ------------------------------------------------------------------

let nextId = 0;
const newMod = (type, o, cells) => ({ id: 'm' + (++nextId), type, o, cells });
export const cloneMods = mods => mods.map(m => ({ ...m, cells: m.cells.map(c => c.slice()) }));
export const volume = types => types.reduce((n, t) => n + SHAPES[t].cells.length, 0);

// Fill a target exactly with modules from `pool` (exact cover, the lowest empty
// cell first), in an order that can be built by dropping from above.
// -> mods (in a buildable order) | null
export function tile(rng, target, pool, { tries = 30, limit = 60000 } = {}) {
  const tset = new Set(target.map(c => K(...c)));
  const order = target.slice().sort(cmp);
  const vol = target.length;
  for (let attempt = 0; attempt < tries; attempt++) {
    // a multiset of shapes whose volumes add up to the target
    const types = [];
    let left = vol;
    for (let g = 0; left > 0 && g < 200; g++) {
      const fit = pool.filter(t => SHAPES[t].cells.length <= left && (left - SHAPES[t].cells.length === 0 || left - SHAPES[t].cells.length >= Math.min(...pool.map(p => SHAPES[p].cells.length))));
      if (!fit.length) break;
      const t = pick(rng, fit);
      types.push(t); left -= SHAPES[t].cells.length;
    }
    if (left) continue;
    const filled = new Set(), placed = [];
    let nodes = 0;
    const counts = {};
    for (const t of types) counts[t] = (counts[t] || 0) + 1;
    const kinds = shuffle(rng, Object.keys(counts));
    const go = () => {
      if (placed.length === types.length) return true;
      if (++nodes > limit) return false;
      const first = order.find(c => !filled.has(K(...c)));
      for (const t of kinds) {
        if (!counts[t]) continue;
        for (const o of shuffle(rng, orientations(t))) {
          const cells = oriented(t, o), a = cells[0];
          const at = cells.map(c => [c[0] - a[0] + first[0], c[1] - a[1] + first[1], c[2] - a[2] + first[2]]);
          if (!at.every(c => tset.has(K(...c)) && !filled.has(K(...c)))) continue;
          counts[t]--; at.forEach(c => filled.add(K(...c))); placed.push(newMod(t, o, at));
          if (go()) return true;
          counts[t]++; at.forEach(c => filled.delete(K(...c))); placed.pop();
        }
      }
      return false;
    };
    if (!go()) continue;
    const seq = buildOrder(placed);
    if (seq) return seq;
  }
  return null;
}

// an order to drop the modules in so each lands where it is: everything under a
// module in its columns goes first -> mods | null (when they interlock)
export function buildOrder(mods) {
  const col = new Map();
  for (const m of mods) for (const c of m.cells) { const k = K2(c[0], c[1]); if (!col.has(k)) col.set(k, []); col.get(k).push([c[2], m.id]); }
  const after = new Map(mods.map(m => [m.id, new Set()]));
  for (const list of col.values()) for (const [za, a] of list) for (const [zb, b] of list) if (a !== b && za < zb) after.get(b).add(a);
  const out = [], done = new Set();
  while (out.length < mods.length) {
    const next = mods.find(m => !done.has(m.id) && [...after.get(m.id)].every(id => done.has(id)));
    if (!next) return null;
    done.add(next.id); out.push(next);
  }
  return out;
}

// Grow a stack by dropping the given modules one by one, each where it keeps
// every rule (checked after every drop: the rules only get harder as the stack
// grows, apart from support, which a drop always brings).
//   prefer: 'random' | 'low' (compact massing) | 'terrace' | 'daylight' (greedy on the score)
// -> mods | null
export function grow(rng, site, types, rules, { tries = 60, cand = 36, prefer = 'random', flat = false } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const mods = [];
    let ok = true;
    for (const t of types) {
      const os = flat ? flatOrientations(t) : orientations(t);
      const opts = [];
      for (let k = 0; k < cand; k++) {
        const o = pick(rng, os), cells = oriented(t, o);
        const r = drop(site, mods, cells, randInt(rng, site.W), randInt(rng, site.D));
        if (!r.ok) continue;
        const m = newMod(t, o, r.cells);
        const ev = evaluate(site, [...mods, m], rules);
        if (!ev.ok) continue;
        const top = Math.max(...r.cells.map(c => c[2]));
        const s = prefer === 'low' ? -top * 10 + contacts(site, mods, r.cells) : prefer === 'terrace' ? ev.score.terrace : prefer === 'daylight' ? ev.score.daylight : rng();
        opts.push({ m, s });
      }
      if (!opts.length) { ok = false; break; }
      opts.sort((a, b) => b.s - a.s);
      mods.push(opts[0].m);
    }
    if (ok) return mods;
  }
  return null;
}
function contacts(site, mods, cells) {
  const occ = occupancy(site, mods), own = new Set(cells.map(c => K(...c)));
  let n = 0;
  for (const c of cells) {
    if (c[2] === 0) n++;
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) { const k = K(c[0] + d[0], c[1] + d[1], c[2] + d[2]); if (!own.has(k) && occ.has(k)) n++; }
  }
  return n;
}

// break a valid stack: move one module (one with nothing resting on it) to a
// place where some rule fails. prefer 'other': the move hurts another module
// -> { start: mods, moved: id, from: cells } | null
export function breakStack(rng, site, mods, rules, { prefer = 'any', cand = 300 } = {}) {
  const occ = occupancy(site, mods);
  const free = mods.filter(m => !m.cells.some(c => { const o = occ.get(K(c[0], c[1], c[2] + 1)); return o && o !== m.id; }));
  const opts = [];
  for (let k = 0; k < cand; k++) {
    const m = pick(rng, free);
    if (!m) break;
    const o = pick(rng, orientations(m.type)), cells = oriented(m.type, o);
    const r = drop(site, mods, cells, randInt(rng, site.W), randInt(rng, site.D), { skip: m.id });
    if (!r.ok || shapeKey(r.cells.slice().sort(cmp)) === shapeKey(m.cells.slice().sort(cmp))) continue;
    const start = mods.map(x => x.id === m.id ? { ...x, o, cells: r.cells } : x);
    const ev = evaluate(site, start, rules);
    if (ev.ok) continue;
    const others = ev.failing.some(id => id !== m.id);
    opts.push({ start, moved: m.id, from: m.cells, others, rules: [...new Set([...ev.fails.values()].flat().map(f => f.rule))] });
  }
  if (!opts.length) return null;
  const pref = prefer === 'other' ? opts.filter(x => x.others) : prefer === 'self' ? opts.filter(x => !x.others) : opts;
  return pick(rng, pref.length ? pref : opts);
}

// ------------------------------------------------------------------
// levels
// ------------------------------------------------------------------

// spec: { task, site: { W, D, H, rows?, cores? }, types?, pool?, mass?, rules?, goal?: 'terrace' | 'daylight', prefer?, flat? }
// -> { task, site, rules, tray: [type], solution: mods, target?, drawings?, start?, moved?, goal? }
export function makeLevel(spec, rng) {
  const site = { street: true, ...spec.site };
  const rules = { support: 1, ...spec.rules };
  if (spec.task === 'fill') {
    const target = massCells(spec.mass);
    const sol = tile(rng, target, spec.pool || ['corner', 'family', 'tee', 'step', 'square', 'tripod', 'twist']);
    if (!sol) return null;
    return { task: 'fill', site, rules: { support: null }, tray: sol.map(m => m.type), solution: sol, target };
  }
  const types = spec.types;
  if (spec.task === 'optimise') {
    let best = null;
    for (let i = 0; i < (spec.runs || 8); i++) {
      const s = grow(rng, site, types, rules, { prefer: i % 2 ? spec.goal : 'random', flat: spec.flat });
      if (!s) continue;
      const v = evaluate(site, s, rules).score[spec.goal];
      if (!best || v > best.v) best = { s, v };
    }
    if (!best) return null;
    return { task: 'optimise', site, rules, tray: types.slice(), solution: best.s, goal: { kind: spec.goal, value: best.v } };
  }
  const sol = grow(rng, site, types, rules, { prefer: spec.prefer || 'random', flat: spec.flat });
  if (!sol) return null;
  if (spec.task === 'habitat') return { task: 'habitat', site, rules, tray: types.slice(), solution: sol };
  if (spec.task === 'match') { const d = drawingsOf(sol); return { task: 'match', site, rules, tray: types.slice(), solution: sol, drawings: d }; }
  if (spec.task === 'fix') {
    const b = breakStack(rng, site, sol, rules, { prefer: spec.hard ? 'other' : 'any' });
    if (!b) return null;
    return { task: 'fix', site, rules, tray: [], solution: sol, start: b.start, moved: b.moved, broken: b.rules };
  }
  return null;
}

// a level made with retries (a seeded generator can be unlucky)
export function levelFrom(spec, rngFor) {
  for (let i = 0; i < 12; i++) { const l = makeLevel(spec, rngFor(i)); if (l) return l; }
  return null;
}
