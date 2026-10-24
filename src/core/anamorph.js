// Anamorphosis: a figure painted across a scene so that it is whole from one
// direction only, the way Felice Varini paints a circle across the walls,
// floors and roofs of a street. From anywhere else it falls apart into pieces.
//
// The view is parallel (the axonometric camera): a direction, given as yaw and
// pitch the way the camera rig gives them. The figure lives on the picture
// plane of that view, as convex pieces in [u, w] (right, up) around a pivot.
// Every face the view can see gets the part of the figure that lands on it,
// less what a nearer face covers, lifted back onto the face's own plane.
//
//   const v = viewBasis(yaw, pitch);
//   const paint = paintFigure(faces, figure, v, pivot);   // [{ face, pts3: [...] }]
//
// faces: [{ pts: [[x, y, z], ...] (convex, any winding), n: outward normal }]
// figure: [[[u, w], ...], ...], convex pieces

import { dot, sub, add, mul, cross, unit } from './vec.js';

const EPS = 1e-9;

// the camera rig's direction to the camera is (cos p cos y, cos p sin y, sin p)
export function viewBasis(yaw, pitch) {
  const toCam = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const d = mul(toCam, -1);                       // the way the view looks
  const right = unit(cross(d, [0, 0, 1]));
  const up = cross(right, d);
  return { d, right, up, yaw, pitch };
}

// the angle between two views, in radians
export const viewAngle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a.d, b.d))));

// ------------------------------------------------------------------
// convex polygons in the plane
// ------------------------------------------------------------------

export const area = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const ccw = poly => area(poly) < 0 ? poly.slice().reverse() : poly;

// keep the part of poly on the left of the line a -> b
function clipHalf(poly, a, b) {
  const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= -EPS) out.push(p);
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// the overlap of two convex polygons
export function intersect(a, b) {
  let out = ccw(a);
  const c = ccw(b);
  for (let i = 0; i < c.length && out.length >= 3; i++) out = clipHalf(out, c[i], c[(i + 1) % c.length]);
  return out.length >= 3 && Math.abs(area(out)) > 1e-7 ? out : null;
}

// a convex polygon less another: convex pieces, one per edge of the hole
export function subtract(a, hole) {
  const h = ccw(hole);
  const pieces = [];
  let rest = ccw(a);
  for (let i = 0; i < h.length && rest.length >= 3; i++) {
    const p = h[i], q = h[(i + 1) % h.length];
    const outside = clipHalf(rest, q, p);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-7) pieces.push(outside);
    rest = clipHalf(rest, p, q);
  }
  return pieces;
}

// ------------------------------------------------------------------
// figures: convex pieces on the picture plane
// ------------------------------------------------------------------

const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const t = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });

export const FIGURES = {
  disc: (r = 1, n = 48) => [arc(0, 0, r, 0, Math.PI * 2, n).slice(0, n)],
  // a ring, as quads round it
  ring: (r0 = .7, r1 = 1, n = 48) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
    return [[r0 * Math.cos(a), r0 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)], [r1 * Math.cos(b), r1 * Math.sin(b)], [r0 * Math.cos(b), r0 * Math.sin(b)]];
  }),
  square: (s = 1) => [[[-s, -s], [s, -s], [s, s], [-s, s]]],
  // a square frame, four bars
  frame: (s = 1, t = .22) => [[[-s, -s], [s, -s], [s, -s + t], [-s, -s + t]], [[-s, s - t], [s, s - t], [s, s], [-s, s]],
    [[-s, -s + t], [-s + t, -s + t], [-s + t, s - t], [-s, s - t]], [[s - t, -s + t], [s, -s + t], [s, s - t], [s - t, s - t]]],
  triangle: (s = 1) => [[[-s, -s * .62], [s, -s * .62], [0, s * .95]]],
  cross: (s = 1, t = .3) => [[[-s, -t], [s, -t], [s, t], [-s, t]], [[-t, t], [t, t], [t, s], [-t, s]], [[-t, -s], [t, -s], [t, -t], [-t, -t]]],
  // two rings, one inside the other
  target: (r = 1) => [...FIGURES.ring(r * .78, r), ...FIGURES.ring(r * .3, r * .52)],
};

// the figure's outline, closed loops, for drawing it: the pieces have seams
const circle = (r, n = 48) => arc(0, 0, r, 0, Math.PI * 2, n).slice(0, n);
const OUTLINES = {
  disc: (r = 1) => [circle(r)],
  ring: (r1 = 1) => [circle(r1 * .7), circle(r1)],
  square: s => FIGURES.square(s),
  frame: (s = 1) => [FIGURES.square(s)[0], FIGURES.square(s - .22)[0]],
  triangle: s => FIGURES.triangle(s),
  cross: (s = 1, t = .3) => [[[-s, -t], [-t, -t], [-t, -s], [t, -s], [t, -t], [s, -t], [s, t], [t, t], [t, s], [-t, s], [-t, t], [-s, t]]],
  target: (r = 1) => [circle(r), circle(r * .78), circle(r * .52), circle(r * .3)],
};
export function outlineOf(spec) {
  const [du, dw] = spec.at || [0, 0];
  return OUTLINES[spec.kind](spec.size ?? 1).map(p => p.map(([u, w]) => [u + du, w + dw]));
}

// a figure from a level's spec: { kind, size, at: [u, w] }
export function figureOf(spec) {
  const pieces = FIGURES[spec.kind](spec.size ?? 1);
  const [du, dw] = spec.at || [0, 0];
  return pieces.map(p => p.map(([u, w]) => [u + du, w + dw]));
}

// ------------------------------------------------------------------
// painting
// ------------------------------------------------------------------

const project = (v, O) => p => { const r = sub(p, O); return [dot(r, v.right), dot(r, v.up)]; };

// the depth of face f's plane at picture point q (along the view)
function planeDepth(f, v, O, q) {
  // X = O + u right + w up + t d on the plane: dot(X - P0, n) = 0
  const base = add(O, add(mul(v.right, q[0]), mul(v.up, q[1])));
  const den = dot(v.d, f.n);
  return dot(sub(f.pts[0], base), f.n) / den;
}
function lift(f, v, O, q) {
  const t = planeDepth(f, v, O, q);
  return add(add(O, add(mul(v.right, q[0]), mul(v.up, q[1]))), mul(v.d, t));
}
const centroid = poly => { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / poly.length, y / poly.length]; };

/**
 * paintFigure(faces, figure, view, pivot) → [{ face: index, pts3: [[x,y,z], ...] }]
 * Each piece is convex and lies on its face.
 */
export function paintFigure(faces, figure, v, O = [0, 0, 0]) {
  const P = project(v, O);
  const front = faces.map((f, i) => ({ f, i, poly: f.pts.map(P) })).filter(({ f, poly }) => dot(f.n, v.d) < -1e-6 && Math.abs(area(poly)) > 1e-7);
  const out = [];
  for (const B of front) {
    let pieces = figure.map(piece => intersect(piece, B.poly)).filter(Boolean);
    if (!pieces.length) continue;
    for (const A of front) {
      if (A === B || !pieces.length) continue;
      const lap = intersect(A.poly, B.poly);
      if (!lap) continue;
      const c = centroid(lap);
      if (planeDepth(A.f, v, O, c) >= planeDepth(B.f, v, O, c) - 1e-6) continue;   // A is behind B here
      pieces = pieces.flatMap(p => subtract(p, A.poly));
    }
    for (const p of pieces) out.push({ face: B.i, pts3: p.map(q => lift(B.f, v, O, q)) });
  }
  return out;
}

// how much of the figure lands somewhere (1: all of it), a check on a level
export function coverage(faces, figure, v, O = [0, 0, 0]) {
  const P = project(v, O);
  const total = figure.reduce((s, p) => s + Math.abs(area(p)), 0);
  const painted = paintFigure(faces, figure, v, O).reduce((s, { pts3 }) => s + Math.abs(area(pts3.map(P))), 0);
  return painted / total;
}

