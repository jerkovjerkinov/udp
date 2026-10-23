// Build Order: a building as parts that rest on one another, and the two rules
// of a building site.
//
// A part is one or more convex pieces: boxes, or prisms of a convex profile
// extruded along x, y or z (voussoirs, rafters, braces, pediments):
//   { id, name, kind, mat, pieces, slide?, on?, temp? }
//   slide  the directions it can move out along (default: all six, up first)
//   on     what it rests on, as alternatives: [[a, b], [c]] rests on a and b,
//          or on c; [] stands on the ground. Default: from contact, flat
//          bottoms on flat tops
//   temp   temporary works (centering): in place while building, gone at the end
//
// Coming out: nothing that stands may lose its last support with the part gone,
// and the part must slide out along one of its directions without passing
// through anything. Going in is the same rule backwards.
//
// The sweep test is exact for convex pieces: the separating axis test run along
// the motion, axis by axis, gives the times at which the moving piece overlaps
// the other; the piece is blocked when those times share a moment after it starts.

const EPS = 1e-4;
export const DIRS = { '+z': [0, 0, 1], '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };
export const ALL_DIRS = Object.keys(DIRS);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]); return l < 1e-12 ? null : [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------------------
// pieces
// ------------------------------------------------------------------

// a prism: a convex profile [[u, v], ...] in the plane across `axis`, from e0 to e1
// (axis x: u = y, v = z; axis y: u = x, v = z; axis z: u = x, v = y)
export function prism(profile, axis, e0, e1) {
  const to3 = axis === 'x' ? (u, v, e) => [e, u, v] : axis === 'y' ? (u, v, e) => [u, e, v] : (u, v, e) => [u, v, e];
  const n = profile.length;
  const verts = [...profile.map(([u, v]) => to3(u, v, e0)), ...profile.map(([u, v]) => to3(u, v, e1))];
  const ax = to3(0, 0, 1);
  const axes = [ax], edges = [ax];
  for (let i = 0; i < n; i++) {
    const a = profile[i], b = profile[(i + 1) % n];
    const du = b[0] - a[0], dv = b[1] - a[1];
    const e = unit(to3(du, dv, 0)), f = unit(to3(dv, -du, 0));
    if (e) edges.push(e);
    if (f) axes.push(f);
  }
  const faces = [[...Array(n).keys()], [...Array(n).keys()].map(i => n + i)];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j, n + i]); }
  const lines = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; lines.push([i, j], [n + i, n + j], [i, n + i]); }
  const xs = verts.map(v => v[0]), ys = verts.map(v => v[1]), zs = verts.map(v => v[2]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys), Math.max(...zs)];
  return { verts, axes, edges, faces, lines, bbox };
}
export const box = (x0, y0, z0, x1, y1, z1) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'z', z0, z1);

// move a piece
export function shifted(pc, d) {
  const verts = pc.verts.map(v => [v[0] + d[0], v[1] + d[1], v[2] + d[2]]);
  const b = pc.bbox;
  return { ...pc, verts, bbox: [b[0] + d[0], b[1] + d[1], b[2] + d[2], b[3] + d[0], b[4] + d[1], b[5] + d[2]] };
}

function span(verts, n) {
  let lo = Infinity, hi = -Infinity;
  for (const v of verts) { const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}

// does piece A, moving along d (from t = 0 on), pass through piece B?
// With d = [0, 0, 0]: do they overlap where they are?
export function sweepHits(A, d, B) {
  let lo = -Infinity, hi = Infinity;
  const axes = [...A.axes, ...B.axes];
  for (const ea of A.edges) for (const eb of B.edges) { const c = unit(cross(ea, eb)); if (c) axes.push(c); }
  for (const n of axes) {
    const [a0, a1] = span(A.verts, n), [b0, b1] = span(B.verts, n);
    const dn = dot(d, n);
    if (Math.abs(dn) < 1e-9) {
      if (Math.min(a1, b1) - Math.max(a0, b0) <= EPS) return false;
      continue;
    }
    let t0 = (b0 + EPS - a1) / dn, t1 = (b1 - EPS - a0) / dn;
    if (dn < 0) [t0, t1] = [t1, t0];
    if (t0 > lo) lo = t0;
    if (t1 < hi) hi = t1;
    if (hi <= lo || hi <= 0) return false;
  }
  return hi > Math.max(lo, 0) + 1e-9;
}
export const overlaps = (A, B) => sweepHits(A, [0, 0, 0], B);

// ------------------------------------------------------------------
// the model
// ------------------------------------------------------------------

const bboxOf = pieces => pieces.reduce((b, p) => [
  Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.min(b[2], p.bbox[2]),
  Math.max(b[3], p.bbox[3]), Math.max(b[4], p.bbox[4]), Math.max(b[5], p.bbox[5])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);

// the flat bottom or top of a piece: the xy box of the verts at its lowest or highest z
function cap(pc, top) {
  const z = top ? pc.bbox[5] : pc.bbox[2];
  const vs = pc.verts.filter(v => Math.abs(v[2] - z) < EPS);
  if (vs.length < 3) return null;
  const xs = vs.map(v => v[0]), ys = vs.map(v => v[1]);
  return { z, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function restsOn(p, q) {
  for (const a of p.pieces) {
    const b0 = cap(a, false);
    if (!b0) continue;
    for (const b of q.pieces) {
      const t = cap(b, true);
      if (!t || Math.abs(t.z - b0.z) > EPS) continue;
      if (Math.min(b0.x1, t.x1) - Math.max(b0.x0, t.x0) > EPS && Math.min(b0.y1, t.y1) - Math.max(b0.y0, t.y0) > EPS) return true;
    }
  }
  return false;
}

export function createModel(parts) {
  const byId = new Map();
  for (const p of parts) {
    p.slide = p.slide || ALL_DIRS;
    p.bbox = bboxOf(p.pieces);
    p.centre = [(p.bbox[0] + p.bbox[3]) / 2, (p.bbox[1] + p.bbox[4]) / 2, (p.bbox[2] + p.bbox[5]) / 2];
    byId.set(p.id, p);
  }
  for (const p of parts) {
    if (p.on) continue;
    if (p.bbox[2] < EPS) { p.on = []; continue; }
    p.on = [parts.filter(q => q !== p && !q.temp && restsOn(p, q)).map(q => q.id)];
  }
  const ids = parts.map(p => p.id);
  return { parts, byId, ids, goal: new Set(parts.filter(p => !p.temp).map(p => p.id)) };
}

// does p stand with these parts present?
export const supported = (p, present) => !p.on.length || p.on.some(alt => alt.every(id => present.has(id)));

// can q block p moving along the axis direction d? (a quick test on boxes)
function ahead(pb, qb, d) {
  const k = d[0] ? 0 : d[1] ? 1 : 2, s = d[k];
  for (let j = 0; j < 3; j++) if (j !== k && Math.min(pb[j + 3], qb[j + 3]) - Math.max(pb[j], qb[j]) <= EPS) return false;
  return s > 0 ? qb[k + 3] > pb[k] + EPS : qb[k] < pb[k + 3] - EPS;
}

// the first present part in the way of p moving along d, or 'ground', or null
export function blocker(m, present, p, d) {
  for (const qid of present) {
    if (qid === p.id) continue;
    const q = m.byId.get(qid);
    if (!ahead(p.bbox, q.bbox, d)) continue;
    for (const a of p.pieces) for (const b of q.pieces) if (sweepHits(a, d, b)) return qid;
  }
  return d[2] < 0 ? 'ground' : null;
}

// a free way out (or in): { ok, dir } | { ok: false, why: 'blocked', by, dir }
function wayOut(m, present, p) {
  let first = null;
  for (const dk of p.slide) {
    const by = blocker(m, present, p, DIRS[dk]);
    if (!by) return { ok: true, dir: dk };
    if (!first) first = { dir: dk, by };
  }
  return { ok: false, why: 'blocked', by: first.by, dir: first.dir };
}

// can part id come out now? { ok, dir } | { ok: false, why: 'rests', by } | { ok: false, why: 'blocked', by, dir }
export function canRemove(m, present, id) {
  const p = m.byId.get(id);
  const rest = new Set(present);
  rest.delete(id);
  for (const qid of rest) {
    const q = m.byId.get(qid);
    if (q.on.length && supported(q, present) && !supported(q, rest)) return { ok: false, why: 'rests', by: qid };
  }
  return wayOut(m, rest, p);
}

// can part id go in now? { ok, dir } | { ok: false, why: 'needs', ids } | { ok: false, why: 'blocked', by, dir }
export function canPlace(m, present, id) {
  const p = m.byId.get(id);
  if (!supported(p, present)) {
    const alt = p.on.map(a => a.filter(x => !present.has(x))).sort((a, b) => a.length - b.length)[0];
    return { ok: false, why: 'needs', ids: alt };
  }
  return wayOut(m, present, p);
}

// the geometry alone: is there a clear way out for part id (or, going in, a
// clear way in)? What stays standing is the physics' to say (physics.js)
export function slideOut(m, present, id) {
  const rest = new Set(present);
  rest.delete(id);
  return wayOut(m, rest, m.byId.get(id));
}
export function slideIn(m, present, id) {
  const rest = new Set(present);
  rest.delete(id);
  return wayOut(m, rest, m.byId.get(id));
}

// every part that could come out now
export const removable = (m, present) => [...present].filter(id => canRemove(m, present, id).ok);

// ------------------------------------------------------------------
// sequences
// ------------------------------------------------------------------

// A way to build from `present` to the goal (every lasting part in, no temporary
// works left): [{ op: 'in' | 'out', id, dir }] or null. Depth-first with a
// memo; lasting parts first, temporary works only when nothing else goes.
//
// `stable(set)`, when given, is the physics' word on whether a set of parts
// stands (physics.js stableOracle); a move that would leave a set that falls is
// not taken.
// `temps` caps how many temporary works may stand on the site at once.
export function assemblyFrom(m, present = new Set(), { limit = 40000, stable = null, temps = Infinity } = {}) {
  const seen = new Set();
  let nodes = 0;
  const key = s => [...s].sort().join(',');
  const done = s => s.size === m.goal.size && [...m.goal].every(id => s.has(id));
  function go(s) {
    if (done(s)) return [];
    if (++nodes > limit) return null;
    const k = key(s);
    if (seen.has(k)) return null;
    seen.add(k);
    const moves = [];
    // temporary works go in only while a part still to come needs them, and
    // are struck only once none does (so a hint never sends them back and forth)
    const needed = id => m.parts.some(q => !q.temp && !s.has(q.id) && q.on.some(alt => alt.includes(id)));
    for (const p of m.parts) if (!s.has(p.id) && !p.temp) { const r = canPlace(m, s, p.id); if (r.ok) moves.push({ op: 'in', id: p.id, dir: r.dir }); }
    for (const p of m.parts) if (s.has(p.id) && p.temp && !needed(p.id)) { const r = canRemove(m, s, p.id); if (r.ok) moves.push({ op: 'out', id: p.id, dir: r.dir }); }
    const onSite = m.parts.filter(p => p.temp && s.has(p.id)).length;
    if (onSite < temps) for (const p of m.parts) if (!s.has(p.id) && p.temp && needed(p.id)) { const r = canPlace(m, s, p.id); if (r.ok) moves.push({ op: 'in', id: p.id, dir: r.dir }); }
    for (const mv of moves) {
      const t = new Set(s);
      mv.op === 'in' ? t.add(mv.id) : t.delete(mv.id);
      if (stable && t.size && !stable(t)) continue;
      const rest = go(t);
      if (rest) return [mv, ...rest];
    }
    return null;
  }
  return go(new Set(present));
}

// a way to take everything apart from `present`, temporary works allowed back
// in: [{ op, id, dir }] or null. Removing a lasting part never makes another
// removal harder, so lasting parts go first and the search rarely turns back.
export function dismantleOrder(m, present = m.goal, { limit = 40000, stable = null } = {}) {
  const seen = new Set();
  let nodes = 0;
  function go(s) {
    if (!s.size) return [];
    if (++nodes > limit) return null;
    const k = [...s].sort().join(',');
    if (seen.has(k)) return null;
    seen.add(k);
    const moves = [];
    const after = id => { const t = new Set(s); t.delete(id); return t; };
    // without the physics, taking a lasting part out never makes another
    // removal harder, so the first that goes will do; with it, one can (a back
    // block gone tips the corbel it held down), so every one is a branch
    for (const id of s) if (!m.byId.get(id).temp) {
      const r = canRemove(m, s, id);
      if (r.ok && (!stable || s.size === 1 || stable(after(id)))) { moves.push({ op: 'out', id, dir: r.dir }); if (!stable) break; }
    }
    if (!moves.length) {
      for (const p of m.parts) if (p.temp && !s.has(p.id)) { const r = canPlace(m, s, p.id); if (r.ok) moves.push({ op: 'in', id: p.id, dir: r.dir }); }
      for (const id of s) if (m.byId.get(id).temp) { const r = canRemove(m, s, id); if (r.ok) moves.push({ op: 'out', id, dir: r.dir }); }
    }
    for (const mv of moves) {
      const t = new Set(s);
      mv.op === 'in' ? t.add(mv.id) : t.delete(mv.id);
      if (stable && t.size && !stable(t)) continue;
      const rest = go(t);
      if (rest) return [mv, ...rest];
    }
    return null;
  }
  return go(new Set(present));
}

// ------------------------------------------------------------------
// structures: real construction systems, simplified to their logic
// ------------------------------------------------------------------

function kit() {
  const parts = [];
  const add = (id, name, kind, mat, pieces, o = {}) => { parts.push({ id, name, kind, mat, pieces: Array.isArray(pieces) ? pieces : [pieces], ...o }); return id; };
  return { parts, add };
}

// two posts and a lintel
export function trilithon({ span = 2, h = 3 } = {}) {
  const { parts, add } = kit();
  add('p1', 'Left post', 'post', 'stone', box(0, 0, 0, 1, 1, h));
  add('p2', 'Right post', 'post', 'stone', box(1 + span, 0, 0, 2 + span, 1, h));
  add('l', 'Lintel', 'lintel', 'stone', box(-.2, -.05, h, 2.2 + span, 1.05, h + .9));
  return parts;
}

// a stylobate of slabs, columns, an architrave with its joints over the
// columns, and a cornice that bridges those joints (running bond)
export function colonnade({ n = 4, cornice = true, steps = 1 } = {}) {
  const { parts, add } = kit();
  const L = 2 * n;
  let z = 0;
  for (let s = 0; s < steps; s++) {
    const inset = s * .35;
    for (let i = 0; i < n; i++) add(`s${s}_${i}`, `Step ${s + 1}, slab ${i + 1}`, 'slab', 'stone',
      box(i === 0 ? inset - .2 : i * 2, -.6 + inset, z, i === n - 1 ? L - inset + .2 : i * 2 + 2, 1.6 - inset, z + .35));
    z += .35;
  }
  const h = 3.2;
  for (let i = 0; i < n; i++) add('c' + i, `Column ${i + 1}`, 'column', 'stone', box(2 * i + .6, .1, z, 2 * i + 1.4, .9, z + h));
  const za = z + h;
  // architrave: joints over the column centres
  const joints = [.4, ...Array.from({ length: n - 2 }, (_, i) => 2 * i + 3), L - .4];
  for (let j = 0; j + 1 < joints.length; j++) add('a' + j, `Architrave ${j + 1}`, 'architrave', 'stone', box(joints[j], 0, za, joints[j + 1], 1, za + .6));
  if (cornice) {
    // cornice joints fall in the middle of the architrave blocks
    const mids = [];
    for (let j = 0; j + 1 < joints.length; j++) mids.push((joints[j] + joints[j + 1]) / 2);
    const cuts = [joints[0] - .2, ...mids.slice(0, -1), joints[joints.length - 1] + .2];
    for (let k = 0; k + 1 < cuts.length; k++) add('k' + k, `Cornice ${k + 1}`, 'cornice', 'stone', box(cuts[k], -.2, za + .6, cuts[k + 1], 1.2, za + 1.05));
  }
  return parts;
}

// a wall of blocks three long, each course set over by one (a third bond):
// a block keeps two thirds of its bed on one block below, so it stands on that
// one alone, but not on the third it has on the other
export function wall({ courses = 3, len = 3, depth = 1, b = 3 } = {}) {
  const { parts, add } = kit();
  for (let c = 0; c < courses; c++) {
    const cuts = c % 2 ? [0, ...Array.from({ length: len }, (_, i) => b * i + 1), b * len] : Array.from({ length: len + 1 }, (_, i) => b * i);
    for (let i = 0; i + 1 < cuts.length; i++) add(`w${c}_${i}`, `Course ${c + 1}, block ${i + 1}`, 'block', 'stone', box(cuts[i], 0, c, cuts[i + 1], depth, c + 1));
  }
  return parts;
}

// a wall with a stone balcony: a long stone set into the wall that juts out in
// front. More of it juts out than is held in the wall, so it stays up only
// while the courses above press its tail down. While it is built, a timber
// prop under its front edge can hold it (prop: true)
export function balcony({ courses = 4, at = 2, out = 1.4, prop = false } = {}) {
  const { parts, add } = kit();
  for (let c = 0; c < courses; c++) {
    const cuts = c % 2 ? [0, 1, 3, 5, 6] : [0, 2, 4, 6];
    for (let i = 0; i + 1 < cuts.length; i++) {
      if (c === at && cuts[i] === 2) continue;
      add(`w${c}_${i}`, `Course ${c + 1}, block ${i + 1}`, 'block', 'stone', box(cuts[i], 0, c, cuts[i + 1], 1, c + 1));
    }
  }
  // it rests on the course below, and stays up on the prop or on the two blocks over its tail
  const below = parts.filter(p => p.pieces[0].bbox[5] === at && p.pieces[0].bbox[3] > 2 && p.pieces[0].bbox[0] < 4).map(p => p.id);
  const over = parts.filter(p => p.pieces[0].bbox[2] === at + 1 && p.pieces[0].bbox[3] > 2 && p.pieces[0].bbox[0] < 4).map(p => p.id);
  add('bal', 'Balcony stone', 'corbel', 'stone', box(2, -out, at, 4, 1, at + 1), { slide: ['-y', '+z'], ...(prop ? { on: [[...below, 'prop'], [...below, ...over]] } : {}) });
  if (prop) add('prop', 'Prop', 'prop', 'timber', box(2.8, -out, 0, 3.2, -out + .4, at), { temp: true, slide: ['-y', '-x', '+x'], on: [] });
  return parts;
}

// a corbelled opening: courses step in from both sides, each block resting on
// the one below and the back blocks, until a capstone spans the gap
export function corbel({ courses = 3, gap = 3.6, step = .5 } = {}) {
  const { parts, add } = kit();
  for (let c = 0; c < courses; c++) {
    const reach = c * step;
    add(`bl${c}`, `Left back block ${c + 1}`, 'block', 'stone', box(-2.8, 0, c, -1.6 + reach, 1, c + 1));
    add(`l${c}`, `Left corbel ${c + 1}`, 'corbel', 'stone', box(-1.6 + reach, 0, c, reach, 1, c + 1));
    add(`r${c}`, `Right corbel ${c + 1}`, 'corbel', 'stone', box(gap - reach, 0, c, gap + 1.6 - reach, 1, c + 1));
    add(`br${c}`, `Right back block ${c + 1}`, 'block', 'stone', box(gap + 1.6 - reach, 0, c, gap + 2.8, 1, c + 1));
  }
  const reach = (courses - 1) * step;
  add('cap', 'Capstone', 'lintel', 'stone', box(reach - .6, 0, courses, gap - reach + .6, 1, courses + .7));
  return parts;
}

// a temple front: stepped base, columns, architrave, and a pediment of two
// raking halves on the cornice
export function temple({ n = 4 } = {}) {
  const parts = colonnade({ n, cornice: true, steps: 2 });
  const top = Math.max(...parts.map(p => p.pieces[0].bbox[5]));
  const L = 2 * n;
  const h = 1.3;
  parts.push({ id: 'pl', name: 'Pediment, left half', kind: 'pediment', mat: 'stone',
    pieces: [prism([[0, top], [L / 2, top], [L / 2, top + h]], 'y', -.1, 1.1)] });
  parts.push({ id: 'pr', name: 'Pediment, right half', kind: 'pediment', mat: 'stone',
    pieces: [prism([[L / 2, top], [L, top], [L / 2, top + h]], 'y', -.1, 1.1)] });
  return parts;
}

// a round arch: piers, voussoirs, a keystone, and the timber centering that
// carries the voussoirs until the keystone locks them
export function arch({ m = 5, r = 1.6, t = .8, h = 2, x = 0, piers = true, prefix = '', ids = {} } = {}) {
  const { parts, add } = kit();
  const R = r + t;
  const P = id => prefix + id;
  const pl = ids.left || P('pl'), pr = ids.right || P('pr');
  if (piers) {
    if (!ids.left) add(pl, 'Left pier', 'pier', 'stone', box(x - R - .4, 0, 0, x - r, 1, h));
    if (!ids.right) add(pr, 'Right pier', 'pier', 'stone', box(x + r, 0, 0, x + R + .4, 1, h));
  }
  const at = (rad, th) => [x + rad * Math.cos(th), h + rad * Math.sin(th)];
  const k = (m - 1) / 2;
  for (let i = 0; i < m; i++) {
    const a = Math.PI * i / m, b = Math.PI * (i + 1) / m;
    const prof = [at(r, a), at(R, a), at(R, b), at(r, b)];
    const right = i < k, key = i === k;
    const name = key ? 'Keystone' : `Voussoir ${right ? 'R' : 'L'}${right ? i + 1 : m - i}`;
    add(P('v' + i), name, key ? 'keystone' : 'voussoir', 'stone', prism(prof, 'y', 0, 1), { slide: key ? ['+z'] : ['+z', right ? '+x' : '-x'] });
  }
  const arc = [];
  for (let i = 0; i <= m; i++) arc.push(at(r, Math.PI * i / m));
  add(P('c'), 'Centering', 'centering', 'timber', prism([[x + r, 0], ...arc, [x - r, 0]], 'y', .1, .9), { temp: true, slide: ['+y', '-y'], on: [] });
  // supports: on the stone below and the centering, or between both neighbours
  for (let i = 0; i < m; i++) {
    const v = parts.find(p => p.id === P('v' + i));
    if (i === k) { v.on = [[P('v' + (i - 1)), P('v' + (i + 1))]]; continue; }
    const below = i < k ? (i === 0 ? pr : P('v' + (i - 1))) : (i === m - 1 ? pl : P('v' + (i + 1)));
    const above = i < k ? P('v' + (i + 1)) : P('v' + (i - 1));
    v.on = [[below, P('c')], [below, above]];
  }
  return parts;
}

// a row of arches on shared piers
// (gap: what an inner pier has beyond the two arch feet it carries; abut: what
// an end pier has beyond its one. Slender inner piers stand only while the
// thrusts of the arches on both sides balance)
export function arcade({ count = 2, m = 5, r = 1.4, t = .7, h = 2, gap = .4, abut = .4 } = {}) {
  const R = r + t, pitch = 2 * R + gap;          // a pier between two arches is 2t + gap wide
  const parts = [];
  for (let j = 0; j <= count; j++) {
    const x0 = j === 0 ? -R - abut : (j - 1) * pitch + r;
    const x1 = j === count ? (count - 1) * pitch + R + abut : j * pitch - r;
    parts.push({ id: 'pier' + j, name: `Pier ${j + 1}`, kind: 'pier', mat: 'stone', pieces: [box(x0, 0, 0, x1, 1, h)] });
  }
  for (let j = 0; j < count; j++) {
    const a = arch({ m, r, t, h, x: j * pitch, piers: false, prefix: `a${j}`, ids: { left: 'pier' + j, right: 'pier' + (j + 1) } });
    for (const p of a) p.name += `, arch ${j + 1}`;
    parts.push(...a);
  }
  return parts;
}

// a timber deck: posts, beams, joists, boards
export function deck({ lx = 4, ly = 3, joists = 3, boards = 4, h = 2 } = {}) {
  const { parts, add } = kit();
  const s = .3;
  for (const [i, [x, y]] of [[0, 0], [lx, 0], [0, ly], [lx, ly]].entries()) add('p' + i, `Post ${i + 1}`, 'post', 'timber', box(x - s / 2, y - s / 2, 0, x + s / 2, y + s / 2, h));
  add('b0', 'Front beam', 'beam', 'timber', box(-.3, -s / 2, h, lx + .3, s / 2, h + .35));
  add('b1', 'Back beam', 'beam', 'timber', box(-.3, ly - s / 2, h, lx + .3, ly + s / 2, h + .35));
  for (let j = 0; j < joists; j++) {
    const x = joists === 1 ? lx / 2 : j * lx / (joists - 1);
    add('j' + j, `Joist ${j + 1}`, 'joist', 'timber', box(x - .1, -.35, h + .35, x + .1, ly + .35, h + .6));
  }
  const bw = (ly + .7) / boards;
  for (let k = 0; k < boards; k++) add('d' + k, `Board ${k + 1}`, 'board', 'timber', box(-.4, -.35 + k * bw, h + .6, lx + .4, -.35 + (k + 1) * bw - .04, h + .7));
  return parts;
}

// a pergola: two rows of posts with beams, rafters across, battens along
export function pergola({ n = 3, ly = 2.4, h = 2.4, battens = 3 } = {}) {
  const { parts, add } = kit();
  const s = .26, gap = 1.8, lx = (n - 1) * gap;
  for (let i = 0; i < n; i++) for (const [r, y] of [[0, 0], [1, ly]]) add(`p${r}${i}`, `Post ${r ? 'back' : 'front'} ${i + 1}`, 'post', 'timber', box(i * gap - s / 2, y - s / 2, 0, i * gap + s / 2, y + s / 2, h));
  add('b0', 'Front beam', 'beam', 'timber', box(-.5, -s / 2, h, lx + .5, s / 2, h + .3));
  add('b1', 'Back beam', 'beam', 'timber', box(-.5, ly - s / 2, h, lx + .5, ly + s / 2, h + .3));
  const nr = n * 2 - 1;
  for (let i = 0; i < nr; i++) { const x = -.2 + i * (lx + .4) / (nr - 1); add('r' + i, `Rafter ${i + 1}`, 'rafter', 'timber', box(x - .08, -.6, h + .3, x + .08, ly + .6, h + .55)); }
  for (let k = 0; k < battens; k++) { const y = -.3 + k * (ly + .6) / (battens - 1); add('t' + k, `Batten ${k + 1}`, 'batten', 'timber', box(-.5, y - .06, h + .55, lx + .5, y + .06, h + .65)); }
  return parts;
}

// a gable roof frame: corner posts and plates, a ridge on two king posts,
// rafters from plate to ridge, a purlin on each slope
export function gableRoof({ lx = 4, ly = 3, h = 2.2, rise = 1.4, rafters = 3, purlins = true } = {}) {
  const { parts, add } = kit();
  const s = .3, pt = .3, rw = .12;
  for (const [i, [x, y]] of [[0, 0], [lx, 0], [0, ly], [lx, ly]].entries()) add('p' + i, `Corner post ${i + 1}`, 'post', 'timber', box(x - s / 2, y - s / 2, 0, x + s / 2, y + s / 2, h));
  add('w0', 'Front plate', 'plate', 'timber', box(-.3, -s / 2, h, lx + .3, s / 2, h + pt));
  add('w1', 'Back plate', 'plate', 'timber', box(-.3, ly - s / 2, h, lx + .3, ly + s / 2, h + pt));
  const zt = h + pt, zr = zt + rise;           // plate top, ridge underside at the rafter ends
  const ym = ly / 2;
  add('k0', 'King post 1', 'post', 'timber', box(-.15, ym - .12, 0, .15, ym + .12, zr - .1));
  add('k1', 'King post 2', 'post', 'timber', box(lx - .15, ym - .12, 0, lx + .15, ym + .12, zr - .1));
  add('rg', 'Ridge beam', 'ridge', 'timber', box(-.3, ym - rw, zr - .1, lx + .3, ym + rw, zr + .45));
  const tv = .28;                                // rafter depth, measured upright
  const slope = (zr - zt) / (ym - rw - 0);
  const xs = Array.from({ length: rafters }, (_, i) => rafters === 1 ? lx / 2 : .25 + i * (lx - .5) / (rafters - 1));
  xs.forEach((x, i) => {
    // front slope: from the plate's inner... outer edge y = 0 up to the ridge face
    add(`rf${i}`, `Front rafter ${i + 1}`, 'rafter', 'timber', prism([[0, zt], [ym - rw, zr], [ym - rw, zr + tv], [0, zt + tv]], 'x', x - .07, x + .07), { on: [['w0', 'rg']], slide: ['+z', '-y'], fix: ['w0', 'rg'] });
    add(`rb${i}`, `Back rafter ${i + 1}`, 'rafter', 'timber', prism([[ly, zt], [ly, zt + tv], [ym + rw, zr + tv], [ym + rw, zr]], 'x', x - .07, x + .07), { on: [['w1', 'rg']], slide: ['+z', '+y'], fix: ['w1', 'rg'] });
  });
  if (purlins) {
    const pw = .2, ph = .18;
    const yf = (ym - rw) * .5;                   // halfway up the front slope
    const ztop = y => zt + tv + slope * y;       // the front rafters' top line
    add('uf', 'Front purlin', 'purlin', 'timber', box(-.3, yf - pw / 2, ztop(yf + pw / 2), lx + .3, yf + pw / 2, ztop(yf + pw / 2) + ph), { on: [xs.map((_, i) => `rf${i}`)], fix: xs.map((_, i) => `rf${i}`) });
    const yb = ly - yf;
    add('ub', 'Back purlin', 'purlin', 'timber', box(-.3, yb - pw / 2, ztop(yf + pw / 2), lx + .3, yb + pw / 2, ztop(yf + pw / 2) + ph), { on: [xs.map((_, i) => `rb${i}`)], fix: xs.map((_, i) => `rb${i}`) });
  }
  return parts;
}

// half-lapped sticks: a lattice of n along x below and n along y above, each
// crossing cut half away on both
export function halfLap({ n = 2, len = 5 } = {}) {
  const { parts, add } = kit();
  const w = .6, gap = len / (n + 1);
  const at = i => (i + 1) * gap;
  for (let i = 0; i < n; i++) {
    const y = at(i), pcs = [];
    let x = 0;
    for (let j = 0; j < n; j++) {
      const c = at(j);
      pcs.push(box(x, y - w / 2, 0, c - w / 2, y + w / 2, 1));
      pcs.push(box(c - w / 2, y - w / 2, 0, c + w / 2, y + w / 2, .5));
      x = c + w / 2;
    }
    pcs.push(box(x, y - w / 2, 0, len, y + w / 2, 1));
    add('x' + i, `Lower stick ${i + 1}`, 'stick', 'timber', pcs);
  }
  for (let i = 0; i < n; i++) {
    const x = at(i), pcs = [];
    let y = 0;
    for (let j = 0; j < n; j++) {
      const c = at(j);
      pcs.push(box(x - w / 2, y, 0, x + w / 2, c - w / 2, 1));
      pcs.push(box(x - w / 2, c - w / 2, .5, x + w / 2, c + w / 2, 1));
      y = c + w / 2;
    }
    pcs.push(box(x - w / 2, y, 0, x + w / 2, len, 1));
    add('y' + i, `Upper stick ${i + 1}`, 'stick', 'timber', pcs);
  }
  return parts;
}

// a log crib: courses of notched logs, crossing at the corners, each course
// half sunk into the one below
export function logCrib({ courses = 4, len = 4 } = {}) {
  const { parts, add } = kit();
  const w = .5, hh = .5;                         // log width; half a log's height
  const ends = [.5, len - .5];
  for (let c = 0; c < courses; c++) {
    const alongX = c % 2 === 0, z0 = c * hh;
    for (const [k, e] of ends.entries()) {
      const pcs = [];
      // full section between the crossings, notched (half height) where it crosses the logs below and above
      const cuts = [0, ends[0] - w / 2, ends[0] + w / 2, ends[1] - w / 2, ends[1] + w / 2, len];
      for (let s = 0; s + 1 < cuts.length; s++) {
        const crossing = s === 1 || s === 3;
        // at a crossing the log keeps only its middle half: the one below fills its lower quarter... kept simple:
        // the log sits half into the course below (z0..z0+hh) and half above (z0+hh..z0+2hh)
        const zlo = crossing ? z0 + hh : z0, zhi = z0 + 2 * hh;
        if (crossing && c === courses - 1) { /* the top course is whole above its seat */ }
        const a = cuts[s], b = cuts[s + 1];
        pcs.push(alongX ? box(a, e - w / 2, zlo, b, e + w / 2, zhi) : box(e - w / 2, a, zlo, e + w / 2, b, zhi));
      }
      add(`g${c}_${k}`, `Course ${c + 1}, ${alongX ? (k ? 'back' : 'front') : (k ? 'right' : 'left')} log`, 'log', 'timber', pcs);
    }
  }
  // the first course lies on the ground at its ends' full sections only: drop
  // its crossings to the ground too, so it stands
  for (const p of parts.filter(p => p.id.startsWith('g0_'))) p.on = [];
  return parts;
}

// a frame of posts and a beam held by keyed through-tenons: the tenons come up
// through the beam, a key through each tenon locks the beam down
export function keyedFrame({ posts = 2, gap = 2.4, h = 2.4 } = {}) {
  const { parts, add } = kit();
  const L = (posts - 1) * gap + 1, beamZ = [h, h + .8];
  const mort = i => { const x0 = i * gap + .3; return [x0, x0 + .4]; };
  const beam = [];
  let x = -.4;
  for (let i = 0; i < posts; i++) {
    const [m0, m1] = mort(i);
    beam.push(box(x, 0, beamZ[0], m0, 1, beamZ[1]));
    beam.push(box(m0, 0, beamZ[0], m1, .3, beamZ[1]), box(m0, .7, beamZ[0], m1, 1, beamZ[1]));
    x = m1;
  }
  beam.push(box(x, 0, beamZ[0], L + .4, 1, beamZ[1]));
  for (let i = 0; i < posts; i++) {
    const [m0, m1] = mort(i);
    const top = beamZ[1] + .55, hole = [beamZ[1] + .1, beamZ[1] + .38];
    add('p' + i, `Post ${i + 1}`, 'post', 'timber', [
      box(i * gap, 0, 0, i * gap + 1, 1, h),
      box(m0, .3, h, m1, .7, hole[0]),
      box(m0, .3, hole[0], m0 + .1, .7, hole[1]), box(m1 - .1, .3, hole[0], m1, .7, hole[1]),
      box(m0, .3, hole[1], m1, .7, top),
    ]);
    add('k' + i, `Key ${i + 1}`, 'key', 'timber', box(m0 + .1, -.35, hole[0], m1 - .1, 1.35, hole[1] - .02), { on: [['p' + i]] });
  }
  add('b', 'Beam', 'beam', 'timber', beam, { on: [Array.from({ length: posts }, (_, i) => 'p' + i)] });
  return parts;
}

// a steel frame: columns, beams on them, braces in the end bays, a deck
export function steelFrame({ bays = 2, storeys = 1, braced = true, deckOn = true, h = 2.6, bay = 2.6, depth = 2.2 } = {}) {
  const { parts, add } = kit();
  const c = .24;
  let z = 0;
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i <= bays; i++) for (const [r, y] of [[0, 0], [1, depth]]) {
      add(`c${s}_${i}_${r}`, `Column ${i + 1}${r ? 'B' : 'A'}, level ${s + 1}`, 'column', 'steel', box(i * bay - c / 2, y - c / 2, z, i * bay + c / 2, y + c / 2, z + h));
    }
    const zb = z + h;
    for (const [r, y] of [[0, 0], [1, depth]]) add(`b${s}_${r}`, `Edge beam ${r ? 'B' : 'A'}, level ${s + 1}`, 'beam', 'steel', box(-.2, y - .14, zb, bays * bay + .2, y + .14, zb + .34));
    for (let i = 0; i <= bays; i++) add(`t${s}_${i}`, `Cross beam ${i + 1}, level ${s + 1}`, 'beam', 'steel', box(i * bay - .1, -.3, zb + .34, i * bay + .1, depth + .3, zb + .62));
    if (braced) for (const [r, y] of [[0, 0], [1, depth]]) {
      // one diagonal per side, in the first bay, from low on one column to high on the next
      const xa = c / 2, xb = bay - c / 2, za = z + .25, zb2 = z + h - .55, tv = .2;
      add(`x${s}_${r}`, `Brace ${r ? 'B' : 'A'}, level ${s + 1}`, 'brace', 'steel',
        prism([[xa, za], [xb, zb2], [xb, zb2 + tv], [xa, za + tv]], 'y', y - .05, y + .05), { on: [[`c${s}_0_${r}`, `c${s}_1_${r}`]], slide: [r ? '+y' : '-y', '+z'], fix: [`c${s}_0_${r}`, `c${s}_1_${r}`] });
    }
    z = zb + .62;
    if (deckOn) {
      // a panel per bay and half, spanning cross beam to cross beam
      for (let i = 0; i < bays; i++) for (const [k, y0, y1] of [[0, -.4, depth / 2], [1, depth / 2, depth + .4]]) {
        add(`d${s}_${i}${k}`, `Deck panel ${i + 1}${'AB'[k]}, level ${s + 1}`, 'deck', 'concrete', box(i * bay - (i === 0 ? .3 : 0), y0, z, (i + 1) * bay + (i === bays - 1 ? .3 : 0), y1, z + .18));
      }
      z += .18;
    }
  }
  return parts;
}

// Dom-ino: columns, flat slabs, a stair, and an outer skin hung on the slab edges
// (each panel hangs from the slab above it)
export function domino({ storeys = 2, stair = true, cladding = false, lx = 5, ly = 3.4, h = 2.6 } = {}) {
  const { parts, add } = kit();
  const c = .26, st = .26;
  const colX = [.6, lx / 2, lx - .6], colY = [.6, ly - .6];
  add('f', 'Footing slab', 'slab', 'concrete', box(0, 0, 0, lx, ly, st));
  let z = st;
  for (let s = 0; s < storeys; s++) {
    colX.forEach((x, i) => colY.forEach((y, j) => add(`c${s}_${i}${j}`, `Column ${i + 1}${'AB'[j]}, level ${s + 1}`, 'column', 'concrete', box(x - c / 2, y - c / 2, z, x + c / 2, y + c / 2, z + h))));
    add('s' + s, s === storeys - 1 ? 'Roof slab' : `Slab ${s + 2}`, 'slab', 'concrete', box(0, 0, z + h, lx, ly, z + h + st));
    if (cladding) {
      const zc0 = z, zc1 = z + h, n = 3;
      for (let k = 0; k < n; k++) {
        const x0 = k * lx / n + .02, x1 = (k + 1) * lx / n - .02;
        add(`e${s}_${k}`, `Front panel ${k + 1}, level ${s + 1}`, 'panel', 'glass', box(x0, -.12, zc0, x1, -.02, zc1 - .02), { on: [['s' + s]], slide: ['-y', '+z'], fix: ['s' + s] });
      }
    }
    z += h + st;
  }
  if (stair) {
    // a straight flight beside the frame, from the ground to the first slab
    const n = 8, run = .32, rise = (h + st) / n, x0 = lx + .05;
    const pcs = [];
    for (let i = 0; i < n; i++) pcs.push(box(x0, .4 + i * run, 0, x0 + 1, .4 + (i + 1) * run, (i + 1) * rise));
    add('st', 'Stair', 'stair', 'concrete', pcs, { on: [] });
  }
  return parts;
}

export const BUILDERS = { trilithon, colonnade, wall, balcony, corbel, temple, arch, arcade, deck, pergola, gableRoof, halfLap, logCrib, keyedFrame, steelFrame, domino };

export function buildModel(name, opts = {}) {
  return createModel(BUILDERS[name](opts));
}
