// Sun Study: where the sun is, and which parts of a site it leaves dark.
//
// The site is in modules, z up, y north, x east (the front of a building faces
// -y, south, as in drawforms.js). A sun is a unit vector pointing toward it.
//
//   sunDir(lat, season, hour)    the real sun, by latitude, season and solar hour
//   CLASSIC                      the drawing-school sun: over the left shoulder
//                                of someone facing the front, 45° in plan and in
//                                elevation (a cube's diagonal), so a shadow is
//                                offset by exactly the height that casts it
//
// The parts of a scene are convex solids (box, gable, pyramid, hip, all hulls),
// so a ray against a part is a clip against its face planes, and the shadow of
// a part on the ground is the hull of its corners pushed down along the sun.
//
//   darkAt(parts, sun, x, y)     is the plan point dark: its top surface faces
//                                away from the sun (shade) or something stands
//                                between it and the sun (shadow)
//   darkMask(parts, sun, box, step)   that, sampled on a grid
//   polyMask(polys, box, step)   the same grid for polygons the player drew
//   overlap(a, b)                intersection over union of two masks

import { dot } from './vec.js';

const D2R = Math.PI / 180;
export const LAT = 41;                                   // Istanbul
export const SEASONS = { winter: -23.44, equinox: 0, summer: 23.44 };
export const CLASSIC = [-1, -1, 1].map(v => v / Math.sqrt(3));

// toward the sun, east-north-up, from the hour angle (15° an hour from noon)
export function sunDir(lat = LAT, season = 'equinox', hour = 12) {
  const phi = lat * D2R, dec = (typeof season === 'number' ? season : SEASONS[season]) * D2R, H = (hour - 12) * 15 * D2R;
  return [
    -Math.cos(dec) * Math.sin(H),
    Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(H),
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H),
  ];
}

// sunrise and sunset, in solar hours
export function dayOf(lat = LAT, season = 'equinox') {
  const phi = lat * D2R, dec = (typeof season === 'number' ? season : SEASONS[season]) * D2R;
  const c = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec)));
  const h = Math.acos(c) / D2R / 15;
  return [12 - h, 12 + h];
}

export const altitude = s => Math.asin(Math.max(-1, Math.min(1, s[2]))) / D2R;

// the time as a sheet would write it
export const clock = hour => { const m = Math.round(hour * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// ------------------------------------------------------------------
// convex parts
// ------------------------------------------------------------------

// a solid as the planes of its faces: n · p <= d inside
export function partOf(solid) {
  const planes = solid.faces.map(f => ({ n: f.n, d: dot(f.n, solid.verts[f.loop[0]]) }));
  const lo = [0, 1, 2].map(a => Math.min(...solid.verts.map(v => v[a])));
  const hi = [0, 1, 2].map(a => Math.max(...solid.verts.map(v => v[a])));
  return { planes, lo, hi, verts: solid.verts };
}

// where the ray o + t d (t > 0) enters the part: { t, n } or null
export function enter(part, o, d) {
  let t0 = 1e-9, t1 = Infinity, n0 = null;
  for (const { n, d: k } of part.planes) {
    const a = dot(n, d), b = k - dot(n, o);
    if (Math.abs(a) < 1e-12) { if (b < -1e-9) return null; continue; }
    const t = b / a;
    if (a < 0) { if (t > t0) { t0 = t; n0 = n; } } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  return n0 && t0 <= t1 ? { t: t0, n: n0 } : null;
}

function firstHit(parts, o, d) {
  let best = null;
  for (const p of parts) {
    const h = enter(p, o, d);
    if (h && (!best || h.t < best.t)) best = h;
  }
  return best;
}

const UP = [0, 0, 1], DOWN = [0, 0, -1];

// the top surface over a plan point: { z, n } (the ground is z = 0)
export function topAt(parts, x, y) {
  const h = firstHit(parts, [x, y, 1e3], DOWN);
  return h ? { z: 1e3 - h.t, n: h.n } : { z: 0, n: UP };
}

export function darkAt(parts, sun, x, y) {
  if (sun[2] <= 0) return true;
  const { z, n } = topAt(parts, x, y);
  if (dot(n, sun) <= 1e-9) return true;                 // shade: the surface turns away
  const o = [x + n[0] * 1e-6, y + n[1] * 1e-6, z + n[2] * 1e-6];
  return !!firstHit(parts, o, sun);                      // shadow: something is in the way
}

// a grid over box [[x0, y0], [x1, y1]], sampled near cell centres. The sample
// sits a hair off the centre, and by different amounts in x and y: 45° shadow
// edges through lattice points would otherwise pass exactly through samples,
// and rounding would decide which side they fall.
const JX = .5 + .011, JY = .5 - .023;
const gridOf = ([[x0, y0], [x1, y1]], step) => ({ x0, y0, step, nx: Math.max(1, Math.round((x1 - x0) / step)), ny: Math.max(1, Math.round((y1 - y0) / step)) });

export function darkMask(parts, sun, box, step = .1) {
  const g = gridOf(box, step), bits = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++)
    bits[j * g.nx + i] = darkAt(parts, sun, g.x0 + (i + JX) * step, g.y0 + (j + JY) * step) ? 1 : 0;
  return { ...g, bits };
}

// even-odd, so a drawn ring makes a hole
export function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function polyMask(polys, box, step = .1) {
  const g = gridOf(box, step), bits = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = g.x0 + (i + JX) * step, y = g.y0 + (j + JY) * step;
    let c = false;
    for (const p of polys) if (p.length >= 3 && inPoly(p, x, y)) c = !c;
    bits[j * g.nx + i] = c ? 1 : 0;
  }
  return { ...g, bits };
}

export function overlap(a, b) {
  let both = 0, either = 0;
  for (let k = 0; k < a.bits.length; k++) { both += a.bits[k] & b.bits[k]; either += a.bits[k] | b.bits[k]; }
  return either ? both / either : 1;
}

// the cells set in a but not in b, as plan points (for redlines)
export function missOf(a, b) {
  const out = [];
  for (let j = 0; j < a.ny; j++) for (let i = 0; i < a.nx; i++) {
    const k = j * a.nx + i;
    if (a.bits[k] && !b.bits[k]) out.push([a.x0 + (i + .5) * a.step, a.y0 + (j + .5) * a.step]);
  }
  return out;
}

// a mask as rectangles, one per run of set cells in a row: [[x0, y0], [x1, y1]]
export function runsOf(m) {
  const out = [];
  for (let j = 0; j < m.ny; j++) {
    let i = 0;
    while (i < m.nx) {
      if (!m.bits[j * m.nx + i]) { i++; continue; }
      const s = i;
      while (i < m.nx && m.bits[j * m.nx + i]) i++;
      out.push([[m.x0 + s * m.step, m.y0 + j * m.step], [m.x0 + i * m.step, m.y0 + (j + 1) * m.step]]);
    }
  }
  return out;
}

// the plan box that holds the parts and every shadow they throw at sun s
export function siteBox(parts, suns, pad = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) for (const v of p.verts) for (const s of suns) {
    const k = s[2] > .05 ? v[2] / s[2] : 0;
    for (const [x, y] of [[v[0], v[1]], [v[0] - s[0] * k, v[1] - s[1] * k]]) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return [[Math.floor(x0 - pad), Math.floor(y0 - pad)], [Math.ceil(x1 + pad), Math.ceil(y1 + pad)]];
}

// ------------------------------------------------------------------
// a mask's outline: closed loops along the cell edges, the set side on the
// left, then simplified (Douglas-Peucker) and, if asked, snapped to a lattice
// ------------------------------------------------------------------

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1, far = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > far) { far = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function outlineOf(m, { tol = m.step * 1.2, snap = 0 } = {}) {
  const at = (i, j) => i >= 0 && j >= 0 && i < m.nx && j < m.ny && m.bits[j * m.nx + i];
  // directed edges between lattice corners, keyed by their start
  const next = new Map(), key = (i, j) => i + ',' + j;
  const add = (a, b) => { const k = key(...a); if (!next.has(k)) next.set(k, []); next.get(k).push(b); };
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]);
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const loops = [];
  for (const [k0, outs] of next) {
    while (outs.length) {
      const start = k0.split(',').map(Number), loop = [start];
      let cur = outs.pop();
      while (key(...cur) !== k0) {
        loop.push(cur);
        const o = next.get(key(...cur));
        if (!o?.length) break;
        cur = o.pop();
      }
      if (loop.length < 3) continue;
      // start the walk at a corner, so the simplified loop keeps it
      let s = 0;
      for (let i = 0; i < loop.length; i++) {
        const p = loop[(i + loop.length - 1) % loop.length], q = loop[i], r = loop[(i + 1) % loop.length];
        if ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) !== 0) { s = i; break; }
      }
      const pts = [...loop.slice(s), ...loop.slice(0, s), loop[s]].map(([i, j]) => [m.x0 + i * m.step, m.y0 + j * m.step]);
      // a closed walk: split it at the point farthest from its start, simplify each half
      let far = 0;
      pts.forEach((p, i) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i; });
      let poly = [...simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...simplify(pts.slice(far), tol).slice(0, -1)];
      // the two halves' end points may sit mid-edge: drop points that hardly turn
      for (let again = true; again && poly.length > 3;) {
        again = false;
        for (let i = 0; i < poly.length && poly.length > 3; i++) {
          const p = poly[(i + poly.length - 1) % poly.length], q = poly[i], r = poly[(i + 1) % poly.length];
          const L = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1;
          if (Math.abs((r[0] - p[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (r[1] - p[1])) / L < tol) { poly.splice(i, 1); again = true; i--; }
        }
      }
      if (snap) {
        poly = poly.map(([x, y]) => [Math.round(x / snap) * snap, Math.round(y / snap) * snap]);
        poly = poly.filter((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-9; });
        // drop points that lie on a straight run
        poly = poly.filter((q, i) => {
          const p = poly[(i + poly.length - 1) % poly.length], r = poly[(i + 1) % poly.length];
          return Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) > 1e-9;
        });
      }
      if (poly.length >= 3) loops.push(poly);
    }
  }
  return loops;
}
