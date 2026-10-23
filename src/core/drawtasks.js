// Drawing Set puzzles: comparing a drawing with the right one, the lines a
// level gives you, drawings with a mistake in them, and how the views of one
// building are laid out on a sheet.
//
// Drawings are Maps of lattice step -> line kind ('seen' | 'hidden'), as
// views.js makes them, so two drawings compare step by step whatever strokes
// they were drawn with.

import { mergeSteps, parseStep, stepKey } from './lattice.js';
import { viewOf, shiftSteps, stepsAny } from './views.js';
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

// the lines a 'complete' level hides: inner lines first, the outline last
export function hiddenForComplete(view, rng, n) {
  const seen = view.lines.filter(l => l.kind === 'seen');
  const inner = shuffle(rng, seen.filter(l => !onBox(l, view.box))), outer = shuffle(rng, seen.filter(l => onBox(l, view.box)));
  return [...inner, ...outer].slice(0, Math.min(n, seen.length - 1));
}

// A drawing with mistakes: kinds of mistake an architect makes when drawing a view.
//   back     an edge round the back drawn as if you could see it
//   shift    a line drawn one step out of place
//   drop     a line left out (only for 'which', where nothing is tapped)
// Returns { steps, wrong: [{ a, b, kind, why }] } or null.
export function mistake(view, rng, { kinds = ['back', 'shift'], n = 1 } = {}) {
  const steps = new Map([...view.steps].filter(([, v]) => v === 'seen'));
  const wrong = [];
  const seen = view.lines.filter(l => l.kind === 'seen');
  const backs = shuffle(rng, view.lines.filter(l => l.kind === 'hidden'));
  const b = view.box;
  const inBox = p => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  for (let t = 0; t < 60 && wrong.length < n; t++) {
    const kind = kinds[randInt(rng, kinds.length)];
    if (kind === 'back' && backs.length) {
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
      for (const k of ks) steps.set(k, 'seen');
      wrong.push({ a, b: bb, why: 'shift', steps: ks, from: l });
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
export function layout(solids, views) {
  const vs = Object.fromEntries(views.map(v => [v, viewOf(solids, v)]));
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
  return { solids, ...layout(solids, sheetViews(item)) };
}

// keep only the steps of one kind ('seen' unless a level draws hidden lines too)
export function answerSteps(v, { hidden = false } = {}) {
  return new Map([...v.steps].filter(([, k]) => hidden || k === 'seen'));
}

export { parseStep, stepKey };
