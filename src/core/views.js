// Orthographic views of plaster models, as lines on the sheet lattice.
//
// A model is a list of closed solids (poly.js); they may touch or run into each
// other, like a wing built into a house or a tower through a roof. A view looks
// at the model along one axis and draws what an architect would draw:
//
//   seen     a line wherever the surface you see changes: an edge, a crease, a
//            step in depth, the outline against the sky
//   hidden   an edge that is there but behind the surface you see (dashed)
//   cut      in a section: the outline of the cut, where the plane runs through
//            the plaster (the heaviest line, around the poché)
//
// A section (opts.cut = the depth of the plane along the view) takes away all
// of the model in front of the plane. The same test then holds: the rays start
// at the plane, and a ray that starts inside the plaster meets the cut itself.
//
// The test is the same for every line: look just to the left and just to the
// right of it. If the two rays meet different surfaces, a seen line runs there.
// That needs no list of special cases, so it works for steps, inside corners,
// slopes seen edge-on and solids that run into each other. Where two solids
// cross, the line where their faces meet (a valley, the foot of a tower) is
// found from the faces themselves.
//
// The sheet lattice has a point every half module (STEP), so a line is stored
// as its unit steps (lattice.js), along any direction between lattice points.

import { stepKey, mergeSteps, parseStep } from './lattice.js';
import { dot, sub, add, mul, cross, len } from './vec.js';

export const STEP = .5;

// d: the way the viewer looks; u, w: right and up on the sheet
export const VIEWS = {
  front: { short: 'Front', d: [0, 1, 0], u: [1, 0, 0], w: [0, 0, 1], name: 'Front elevation', seen: 'from the front', yaw: -90, pitch: 0 },
  back: { short: 'Back', d: [0, -1, 0], u: [-1, 0, 0], w: [0, 0, 1], name: 'Back elevation', seen: 'from the back', yaw: 90, pitch: 0 },
  right: { short: 'Right side', d: [-1, 0, 0], u: [0, 1, 0], w: [0, 0, 1], name: 'Right elevation', seen: 'from the right', yaw: 0, pitch: 0 },
  left: { short: 'Left side', d: [1, 0, 0], u: [0, -1, 0], w: [0, 0, 1], name: 'Left elevation', seen: 'from the left', yaw: 180, pitch: 0 },
  top: { short: 'Top', d: [0, 0, -1], u: [1, 0, 0], w: [0, 1, 0], name: 'Top view', seen: 'from above', yaw: -90, pitch: 89 },
};

// where two kinds land on the same step, the stronger line wins
const RANK = { hidden: 0, seen: 1, cut: 2 };
const near = (x, k = 1e-6) => Math.abs(x - Math.round(x)) < k;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the unit steps of a line between two lattice points, in any direction
export function stepsAny(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const g = gcd(Math.abs(dx), Math.abs(dy));
  if (!g) return [];
  const ux = dx / g, uy = dy / g, out = [];
  for (let i = 0; i < g; i++) out.push(stepKey([a[0] + ux * i, a[1] + uy * i], [a[0] + ux * (i + 1), a[1] + uy * (i + 1)]));
  return out;
}

function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// a 3d polygon flattened onto the axis plane its normal leans to most
function flatOf(n) {
  const ax = [0, 1, 2].reduce((m, i) => Math.abs(n[i]) > Math.abs(n[m]) ? i : m, 0);
  const [i, j] = [[1, 2], [2, 0], [0, 1]][ax];
  return p => [p[i], p[j]];
}

// where two face planes cross, clipped to both faces: [[a, b], ...] in 3d
function faceCrossing(F, G) {
  const dir = cross(F.n, G.n);
  const dl = len(dir);
  if (dl < 1e-9) return [];
  // a point on both planes: rows n1, n2, dir; right side c1, c2, 0 (Cramer)
  const M = [F.n, G.n, dir], r = [F.c, G.c, 0];
  const det3 = m => dot(m[0], cross(m[1], m[2]));
  const D = det3(M);
  if (Math.abs(D) < 1e-12) return [];
  const col = k => M.map((row, i) => row.map((v, j) => j === k ? r[i] : v));
  const p0 = [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
  const u = mul(dir, 1 / dl);
  // where the line crosses each face's outline, as parameters along u
  const ss = [];
  for (const H of [F, G]) {
    const fl = flatOf(H.n), P = H.pts.map(fl);
    const q0 = fl(p0), qu = fl(add(p0, u));
    const v = [qu[0] - q0[0], qu[1] - q0[1]];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const e = [b[0] - a[0], b[1] - a[1]];
      const den = v[0] * e[1] - v[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = [a[0] - q0[0], a[1] - q0[1]];
      const s = (w[0] * e[1] - w[1] * e[0]) / den, t = (w[0] * v[1] - w[1] * v[0]) / den;
      if (t > -1e-9 && t < 1 + 1e-9) ss.push(s);
    }
  }
  ss.sort((a, b) => a - b);
  const out = [];
  const flF = flatOf(F.n), flG = flatOf(G.n);
  const PF = F.pts.map(flF), PG = G.pts.map(flG);
  for (let i = 0; i + 1 < ss.length; i++) {
    if (ss[i + 1] - ss[i] < 1e-7) continue;
    const m = add(p0, mul(u, (ss[i] + ss[i + 1]) / 2));
    if (inPoly(flF(m), PF) && inPoly(flG(m), PG)) {
      const a = add(p0, mul(u, ss[i])), b = add(p0, mul(u, ss[i + 1]));
      const last = out[out.length - 1];
      if (last && len(sub(last[1], a)) < 1e-7) last[1] = b; else out.push([a, b]);
    }
  }
  return out;
}

/**
 * viewOf(solids, view) → {
 *   steps: Map stepKey -> 'seen' | 'hidden',
 *   lines: [{ a, b, kind, steps, a3, b3 }]   merged lines on the lattice, with 3d ends where known
 *   box: { x0, y0, x1, y1 }                  the model's extent on the lattice
 *   offLattice: [[a, b], ...]                lines whose ends miss the lattice (a level to avoid)
 * }
 * Lattice coordinates are sheet units / STEP, with the model's own origin.
 */
export function viewOf(solids, viewName, { hidden = true, cut = null } = {}) {
  const V = typeof viewName === 'string' ? VIEWS[viewName] : viewName;
  const sec = cut !== null;
  if (sec) hidden = false;
  const P = p => [dot(p, V.u) / STEP, dot(p, V.w) / STEP];
  const depthOf = p => dot(p, V.d);

  // every face, for rays and for crossings
  const faces = [];
  solids.forEach((s, si) => {
    for (const f of s.faces) {
      const pts = f.loop.map(i => s.verts[i]);
      const c = dot(f.n, pts[0]);
      faces.push({ si, n: f.n, c, pts, nd: dot(f.n, V.d), poly: pts.map(P),
        key: f.n.map(x => Math.round(x * 1e6)).join(',') + '|' + Math.round(c * 1e6) });
    }
  });
  const rayFaces = faces.filter(f => Math.abs(f.nd) > 1e-9);
  // the depth at which the ray through sheet point q meets face f's plane
  const tAt = (f, q) => (f.c - STEP * (q[0] * dot(f.n, V.u) + q[1] * dot(f.n, V.w))) / f.nd;
  const CUT = { key: 'cut' };
  const at3 = (q, t) => add(add(mul(V.u, q[0] * STEP), mul(V.w, q[1] * STEP)), mul(V.d, t));
  function firstHit(q) {
    if (sec && inSolid(at3(q, cut + 1e-6))) return CUT;
    let best = null, bt = Infinity;
    for (const f of rayFaces) if (inPoly(q, f.poly)) { const t = tAt(f, q); if (sec && t < cut - 1e-9) continue; if (t < bt - 1e-9) { bt = t; best = f; } }
    return best;
  }
  // is anything in front of depth t on the ray through sheet point q?
  function covered(q, t) {
    for (const f of rayFaces) if (inPoly(q, f.poly) && tAt(f, q) < t - 1e-6) return true;
    return false;
  }
  // is the 3d point inside the model (any solid)? ray parity along a skew direction
  const RAY = [.2873, .4511, .8451];
  const solidFaces = solids.map((s, si) => faces.filter(f => f.si === si).map(f => {
    const fl = flatOf(f.n);
    return { ...f, fl, flat: f.pts.map(fl), rn: dot(f.n, RAY) };
  }));
  function inModel(p) {
    if (sec && dot(p, V.d) < cut) return false;
    return inSolid(p);
  }
  function inSolid(p) {
    for (const fs of solidFaces) {
      let n = 0;
      for (const f of fs) {
        if (Math.abs(f.rn) < 1e-12) continue;
        const s = (f.c - dot(f.n, p)) / f.rn;
        if (s <= 0) continue;
        if (inPoly(f.fl(add(p, mul(RAY, s))), f.flat)) n++;
      }
      if (n % 2) return true;
    }
    return false;
  }
  // is there a real edge of the model at p, running along u? Look all round it:
  // a flat stretch of surface fills exactly half the ring, a crease does not
  const RING = [...Array(16).keys()].map(k => (k + .37) * Math.PI / 8);
  function creaseAt(p, u) {
    const a = Math.abs(u[0]) < .9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = cross(u, a), l1 = len(e1), e1n = mul(e1, 1 / l1), e2 = cross(u, e1n);
    let n = 0;
    for (const th of RING) if (inModel(add(p, add(mul(e1n, Math.cos(th) * 1e-3), mul(e2, Math.sin(th) * 1e-3))))) n++;
    return n !== 0 && n !== 16 && n !== 8;
  }

  // the candidate lines: every edge, and where faces of two solids cross
  const cands = [];
  solids.forEach((s, si) => {
    for (const e of s.edges) {
      if (e.flat) continue;
      const a3 = s.verts[e.a], b3 = s.verts[e.b];
      cands.push({ a3, b3 });
    }
  });
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    if (faces[i].si === faces[j].si) continue;
    for (const [a3, b3] of faceCrossing(faces[i], faces[j])) cands.push({ a3, b3 });
  }
  // a section: where the plane runs through each face is the outline of the cut
  if (sec) {
    const R = 1e3, plane = { n: V.d, c: cut, pts: [[-R, -R], [R, -R], [R, R], [-R, R]].map(([x, y]) => at3([x / STEP, y / STEP], cut)) };
    for (const f of faces) if (Math.abs(Math.abs(f.nd) - 1) > 1e-9) for (const [a3, b3] of faceCrossing(f, plane)) cands.push({ a3, b3, onCut: true });
  }
  for (const c of cands) { c.A = P(c.a3); c.B = P(c.b3); const d3 = sub(c.b3, c.a3); c.u3 = mul(d3, 1 / (len(d3) || 1)); }
  const live = cands.filter(c => Math.hypot(c.B[0] - c.A[0], c.B[1] - c.A[1]) > 1e-7);

  // split each candidate where any other crosses it, then judge each piece
  const steps = new Map(), lines3 = [], offLattice = [];
  for (const c of live) {
    const d = [c.B[0] - c.A[0], c.B[1] - c.A[1]], L = Math.hypot(d[0], d[1]);
    const ts = [0, 1];
    for (const o of live) {
      if (o === c) continue;
      const e = [o.B[0] - o.A[0], o.B[1] - o.A[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      const w = [o.A[0] - c.A[0], o.A[1] - c.A[1]];
      if (Math.abs(den) < 1e-12 * L * L) {
        // parallel: on the same line, the other's ends split this one
        if (Math.abs(w[0] * d[1] - w[1] * d[0]) > 1e-7 * L) continue;
        for (const p of [o.A, o.B]) { const t = ((p[0] - c.A[0]) * d[0] + (p[1] - c.A[1]) * d[1]) / (L * L); if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); }
        continue;
      }
      const t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * d[1] - w[1] * d[0]) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && s > -1e-9 && s < 1 + 1e-9) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    const nrm = [-d[1] / L, d[0] / L], dl = 1e-3;
    let run = null;
    const flush = () => {
      if (!run) return;
      const a = lerp2(c.A, c.B, run.t0), b = lerp2(c.A, c.B, run.t1);
      if (!(near(a[0]) && near(a[1]) && near(b[0]) && near(b[1]))) offLattice.push([a, b]);
      const ai = a.map(Math.round), bi = b.map(Math.round);
      for (const k of stepsAny(ai, bi)) if ((RANK[run.kind] ?? 0) >= (RANK[steps.get(k)] ?? -1)) steps.set(k, run.kind);
      lines3.push({ a: ai, b: bi, a3: lerp3(c.a3, c.b3, run.t0), b3: lerp3(c.a3, c.b3, run.t1), kind: run.kind });
      run = null;
    };
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-9) continue;
      const tm = (ts[i] + ts[i + 1]) / 2, m = lerp2(c.A, c.B, tm);
      const p3 = lerp3(c.a3, c.b3, tm), t = depthOf(p3);
      let kind = null;
      if (creaseAt(p3, c.u3)) {
        const s1 = firstHit([m[0] + nrm[0] * dl, m[1] + nrm[1] * dl]), s2 = firstHit([m[0] - nrm[0] * dl, m[1] - nrm[1] * dl]);
        if ((s1?.key ?? null) !== (s2?.key ?? null)) kind = s1 === CUT || s2 === CUT ? 'cut' : 'seen';
        else if (hidden && covered(m, t)) kind = 'hidden';
      }
      if (run && run.kind === kind) { run.t1 = ts[i + 1]; continue; }
      flush();
      if (kind) run = { kind, t0: ts[i], t1: ts[i + 1] };
    }
    flush();
  }
  const xs = [], ys = [];
  for (const s of solids) for (const v of s.verts) { const p = P(v); xs.push(p[0]); ys.push(p[1]); }
  const box = { x0: Math.round(Math.min(...xs)), y0: Math.round(Math.min(...ys)), x1: Math.round(Math.max(...xs)), y1: Math.round(Math.max(...ys)) };
  const lines = mergeSteps(steps);
  // 3d ends for each merged line, from the pieces that make it up
  for (const l of lines) {
    const ks = new Set(l.steps);
    const parts = lines3.filter(p => p.kind === l.kind && stepsAny(p.a, p.b).some(k => ks.has(k)));
    l.parts3 = parts.map(p => [p.a3, p.b3]);
  }
  return { steps, lines, box, offLattice };
}

// move a set of steps by a whole lattice offset
export function shiftSteps(steps, [dx, dy]) {
  const out = new Map();
  for (const [k, v] of steps) {
    const [a, b] = parseStep(k);
    out.set(stepKey([a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy]), v);
  }
  return out;
}

// the parts of a model as 3d segments for one kind of line (for the model overlay)
export const parts3Of = (view, kind = 'seen') => view.lines.filter(l => l.kind === kind).flatMap(l => l.parts3);


// Module lines: where the planes x, y or z = k (k a whole module) cross the
// faces of the model, drawn faintly on the plaster so a wall can be counted
// off in modules, like the crosses on the sheet. Each line sits a hair off its
// face (lift) so it does not flicker in the plaster. Returns [[p, q], ...].
export function moduleLines(solids, { step = 1, lift = .004 } = {}) {
  const out = [];
  for (const s of solids) for (const f of s.faces) {
    const pts = f.loop.map(i => s.verts[i]);
    const n = f.n;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(n[a]) > .999) continue;            // the face lies in one of these planes
      let lo = Infinity, hi = -Infinity;
      for (const p of pts) { lo = Math.min(lo, p[a]); hi = Math.max(hi, p[a]); }
      const along = cross(n, a === 0 ? [1, 0, 0] : a === 1 ? [0, 1, 0] : [0, 0, 1]);
      for (let k = Math.ceil(lo / step + 1e-6) * step; k < hi - 1e-6; k += step) {
        const hits = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length];
          if ((p[a] < k) === (q[a] < k)) continue;
          const t = (k - p[a]) / (q[a] - p[a]);
          hits.push(add(p, mul(sub(q, p), t)));
        }
        hits.sort((u, v) => dot(u, along) - dot(v, along));
        for (let i = 0; i + 1 < hits.length; i += 2) {
          if (len(sub(hits[i + 1], hits[i])) < 1e-6) continue;
          out.push([add(hits[i], mul(n, lift)), add(hits[i + 1], mul(n, lift))]);
        }
      }
    }
  }
  return out;
}
