// Drawing Set puzzles: comparing a drawing with the right one, the lines a
// level gives you, drawings with a mistake in them, and how the views of one
// building are laid out on a sheet.
//
// Drawings are Maps of lattice step -> line kind ('seen' | 'hidden'), as
// views.js makes them, so two drawings compare step by step whatever strokes
// they were drawn with.

import { mergeSteps, parseStep, stepKey } from './lattice.js';
import { VIEWS, viewOf, shiftSteps, stepsAny } from './views.js';
import { drawForm } from './drawforms.js';
import { shuffle, randInt } from './rand.js';

// right, extra, missing and wrongly typed steps, and the same as whole lines
export function compareDrawing(drawn, answer) {
  const right = [], extra = [], missing = [], wrongKind = [];
  for (const [k, kind] of drawn) {
    const a = answer.get(k);
    if (a === undefined) extra.push(k); else if (a !== kind) wrongKind.push(k); else right.push(k);
  }
  for (const k of answer.keys()) if (!drawn.has(k)) missing.push(k);
  const lines = ks => mergeSteps(new Map(ks.map(k => [k, 'x'])));
  return {
    ok: !extra.length && !missing.length && !wrongKind.length,
    right, extra, missing, wrongKind,
    extraLines: lines(extra), missingLines: lines(missing), wrongKindLines: lines(wrongKind),
  };
}

const onBox = (l, b) => (l.a[0] === l.b[0] && (l.a[0] === b.x0 || l.a[0] === b.x1)) || (l.a[1] === l.b[1] && (l.a[1] === b.y0 || l.a[1] === b.y1));

// the lines a 'complete' level hides: inner lines first, the outline last;
// on a hidden-line sheet the dashed lines go first, since they are the lesson
export function hiddenForComplete(view, rng, n, { hidden = false } = {}) {
  const seen = view.lines.filter(l => l.kind === 'seen' || l.kind === 'cut');
  const inner = shuffle(rng, seen.filter(l => !onBox(l, view.box))), outer = shuffle(rng, seen.filter(l => onBox(l, view.box)));
  const dashed = hidden ? shuffle(rng, view.lines.filter(l => l.kind === 'hidden')) : [];
  return [...dashed, ...inner, ...outer].slice(0, Math.min(n, seen.length - 1 + dashed.length));
}

// A drawing with mistakes: kinds of mistake an architect makes when drawing a view.
//   back     an edge round the back drawn as if you could see it
//   shift    a line drawn one step out of place
//   drop     a line left out (only for 'which', where nothing is tapped)
//   pen      on a hidden-line sheet: a hidden edge drawn solid, or a seen one dashed
// Returns { steps, wrong: [{ a, b, kind, why }] } or null.
export function mistake(view, rng, { kinds = ['back', 'shift'], n = 1, hidden = false } = {}) {
  const steps = new Map([...view.steps].filter(([, v]) => hidden || v !== 'hidden'));
  const wrong = [];
  const seen = view.lines.filter(l => hidden || l.kind !== 'hidden');
  // a section's two pens are cut and seen; otherwise seen and hidden
  const section = view.lines.some(l => l.kind === 'cut');
  const other = section ? 'cut' : 'hidden';
  const pens = shuffle(rng, [...view.lines.filter(l => l.kind === other), ...view.lines.filter(l => l.kind === 'seen' && !onBox(l, view.box))]);
  const backs = shuffle(rng, view.lines.filter(l => l.kind === 'hidden'));
  const b = view.box;
  const inBox = p => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  for (let t = 0; t < 60 && wrong.length < n; t++) {
    const kind = kinds[randInt(rng, kinds.length)];
    if (kind === 'pen' && (hidden || section) && pens.length) {
      const l = pens.shift();
      if (wrong.some(w => w.from === l || w.steps.some(k => l.steps.includes(k)))) continue;
      const to = l.kind === other ? 'seen' : other;
      for (const k of l.steps) steps.set(k, to);
      const why = section ? (to === 'seen' ? 'thin' : 'heavy') : (to === 'seen' ? 'solid' : 'dashed');
      wrong.push({ a: l.a, b: l.b, why, steps: l.steps, kind: to });
    } else if (kind === 'back' && backs.length && !hidden) {
      const l = backs.pop();
      const ks = stepsAny(l.a, l.b).filter(k => !steps.has(k));
      if (!ks.length) continue;
      for (const k of ks) steps.set(k, 'seen');
      wrong.push({ a: l.a, b: l.b, why: 'back', steps: ks });
    } else if (kind === 'shift') {
      const l = seen[randInt(rng, seen.length)];
      if (wrong.some(w => w.from === l)) continue;
      const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], L = Math.hypot(dx, dy);
      // one step across the line, along a lattice axis
      const dirs = Math.abs(dx) > Math.abs(dy) ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const [ox, oy] = dirs[randInt(rng, 2)];
      const a = [l.a[0] + ox, l.a[1] + oy], bb = [l.b[0] + ox, l.b[1] + oy];
      if (!inBox(a) || !inBox(bb) || L < 1) continue;
      const ks = stepsAny(a, bb);
      if (ks.some(k => steps.has(k))) continue;
      for (const k of l.steps) steps.delete(k);
      for (const k of ks) steps.set(k, l.kind);
      wrong.push({ a, b: bb, why: 'shift', steps: ks, from: l, kind: l.kind });
    } else if (kind === 'drop') {
      const l = seen[randInt(rng, seen.length)];
      if (wrong.some(w => w.from === l) || onBox(l, b)) continue;
      for (const k of l.steps) steps.delete(k);
      wrong.push({ a: l.a, b: l.b, why: 'drop', steps: [], from: l });
    }
  }
  return wrong.length === n ? { steps, wrong } : null;
}

export const signature = steps => [...steps].map(([k, v]) => k + v).sort().join(';');

// the views a level needs, each placed on the sheet
//   front at the origin, the right side to its right, the top view above it:
//   the box of views unfolded, so heights line up across and widths up and down
export const GAP = 2;
// cut: { view, at } makes that view a section, cut at depth at along it
export function layout(solids, views, { cut = null } = {}) {
  const vs = Object.fromEntries(views.map(v => [v, viewOf(solids, v, cut && cut.view === v ? { cut: cut.at } : {})]));
  const w = v => vs[v] ? vs[v].box.x1 - vs[v].box.x0 : 0, h = v => vs[v] ? vs[v].box.y1 - vs[v].box.y0 : 0;
  const place = {};
  if (vs.front) place.front = [0, 0];
  if (vs.right) place.right = [vs.front ? w('front') + GAP : 0, 0];
  if (vs.top) place.top = [0, vs.front || vs.right ? Math.max(h('front'), h('right')) + GAP : 0];
  for (const v of views) if (!place[v]) place[v] = [0, 0];
  const out = {};
  for (const v of views) {
    const V = vs[v], off = [place[v][0] - V.box.x0, place[v][1] - V.box.y0];
    out[v] = {
      view: v, off,
      steps: shiftSteps(V.steps, off),
      lines: V.lines.map(l => {
        const a = [l.a[0] + off[0], l.a[1] + off[1]], b = [l.b[0] + off[0], l.b[1] + off[1]];
        return { ...l, a, b, steps: stepsAny(a, b) };
      }),
      box: { x0: place[v][0], y0: place[v][1], x1: place[v][0] + w(v), y1: place[v][1] + h(v) },
      raw: V,
    };
  }
  const all = Object.values(out).map(o => o.box);
  const bounds = { x0: Math.min(...all.map(b => b.x0)), y0: Math.min(...all.map(b => b.y0)), x1: Math.max(...all.map(b => b.x1)), y1: Math.max(...all.map(b => b.y1)) };
  return { views: out, bounds };
}

// the views a task puts on the sheet: the one to draw, and those it gives
export function sheetViews(item) {
  if (item.task === 'third') return [...item.given, item.view];
  return [item.view];
}

export function levelSheet(item) {
  const solids = drawForm(item.form);
  // item.cut is where the plane stands, in modules along the view's axis
  const d = VIEWS[item.view].d, at = item.cut * (d[0] + d[1] + d[2]);
  return { solids, ...layout(solids, sheetViews(item), { cut: item.cut !== undefined ? { view: item.view, at } : null }) };
}

// the steps a drawing should have: seen and cut lines, and hidden ones when a
// level draws those too
export function answerSteps(v, { hidden = false } = {}) {
  return new Map([...v.steps].filter(([, k]) => hidden || k !== 'hidden'));
}

export { parseStep, stepKey };

// The poché of a section: the cut lines walked into closed outlines, as
// polygons on the sheet (lattice points). Outlines that don't close are left out.
export function pocheOf(steps) {
  const adj = new Map(), key = p => p[0] + ',' + p[1];
  const link = (p, q) => { const k = key(p); if (!adj.has(k)) adj.set(k, { p, to: [] }); adj.get(k).to.push(q); };
  // walk unit steps, so a branch from the middle of a long line is still found
  const lines = [...steps].filter(([, k]) => k === 'cut').map(([k]) => { const [a, b] = parseStep(k); return { a, b }; });
  for (const l of lines) { link(l.a, l.b); link(l.b, l.a); }
  const used = new Set(), polys = [];
  const ek = (p, q) => key(p) + '>' + key(q);
  for (const l of lines) {
    if (used.has(ek(l.a, l.b)) || used.has(ek(l.b, l.a))) continue;
    const poly = [l.a];
    let prev = l.a, cur = l.b;
    used.add(ek(l.a, l.b));
    for (let n = 0; n < 200 && key(cur) !== key(l.a); n++) {
      poly.push(cur);
      const node = adj.get(key(cur));
      // turn the sharpest way at a crossing, so each outline stays simple
      const din = [cur[0] - prev[0], cur[1] - prev[1]];
      const next = node.to.filter(q => !used.has(ek(cur, q)) && !used.has(ek(q, cur)) && key(q) !== key(prev))
        .sort((q1, q2) => turn(din, [q1[0] - cur[0], q1[1] - cur[1]]) - turn(din, [q2[0] - cur[0], q2[1] - cur[1]]))[0];
      if (!next) break;
      used.add(ek(cur, next));
      prev = cur; cur = next;
    }
    if (key(cur) === key(l.a) && poly.length >= 3) polys.push(simplify(poly));
  }
  return polys;
}
// drop the points in the middle of straight runs
function simplify(poly) {
  const n = poly.length;
  return poly.filter((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}
const turn = (a, b) => Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
