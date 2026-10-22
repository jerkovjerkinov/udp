// The solids of Developments, by pack, with architectural names.
//
// Every form is built from three operations in poly.js: a prism (a plan or a
// section raised), a convex hull (pyramids, hip roofs, cut corners) and, for
// the squared-paper pack, a block of unit cubes whose faces stay unit squares.
// Units are plan modules, z is up, and every solid stands on z = 0.

import { prism, hull, mapSolid, grounded, solidOf } from './poly.js';
import { rotateAbout, cross, unit, len } from './vec.js';

// a section [x, z] drawn as seen from the front, extruded along y by depth
const section = (profile, depth) => grounded(mapSolid(prism(profile, depth), ([x, y, z]) => [x, z, y]));
// a plan [x, y] raised by h
const plan = (outline, h) => grounded(prism(outline, h));
const box = (x, y, z, w, d, h) => [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
const solid = pts => grounded(hull(pts));

// A block of unit cubes, every face a unit square (cells [x, y, z]).
export function blocks(cells) {
  const has = new Set(cells.map(c => c.join(',')));
  const vid = new Map(), verts = [], loops = [];
  const v = p => { const k = p.join(','); if (!vid.has(k)) { vid.set(k, verts.length); verts.push(p); } return vid.get(k); };
  // each side: the neighbour's offset and the square's corners, counter-clockwise from outside
  const sides = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  for (const c of cells) for (const [d, sq] of sides) {
    if (has.has([c[0] + d[0], c[1] + d[1], c[2] + d[2]].join(','))) continue;
    loops.push(sq.map(p => v([c[0] + p[0], c[1] + p[1], c[2] + p[2]])));
  }
  return grounded(solidOf(verts, loops));
}

// turn a solid so the face whose normal is closest to dir points straight down
export function restOn(s, dir) {
  const d = unit(dir);
  const f = s.faces.reduce((b, f) => f.n[0] * d[0] + f.n[1] * d[1] + f.n[2] * d[2] > b.n[0] * d[0] + b.n[1] * d[1] + b.n[2] * d[2] ? f : b);
  const axis = cross(f.n, [0, 0, -1]);
  if (len(axis) < 1e-9) return s;
  const ang = Math.acos(Math.max(-1, Math.min(1, -f.n[2])));
  const a = unit(axis);
  return grounded(mapSolid(s, p => rotateAbout(p, [0, 0, 0], a, ang)));
}

const r3 = Math.sqrt(3);
const hexagon = r => [...Array(6).keys()].map(i => [r * Math.cos(i * Math.PI / 3), r * Math.sin(i * Math.PI / 3)]);

/**
 * FORMS[key] = { name, pack, make() → solid, note }
 * note: what makes it interesting, shown on the level map and in hints
 */
export const FORMS = {
  // A. Blocks: unit cubes on squared paper
  cube: { pack: 'A', name: 'Cube', make: () => blocks([[0, 0, 0]]) },
  domino: { pack: 'A', name: 'Two-cube block', make: () => blocks([[0, 0, 0], [1, 0, 0]]) },
  ell: { pack: 'A', name: 'L block', make: () => blocks([[0, 0, 0], [1, 0, 0], [0, 1, 0]]) },
  step: { pack: 'A', name: 'Step', make: () => blocks([[0, 0, 0], [1, 0, 0], [1, 0, 1]]) },
  tee: { pack: 'A', name: 'T block', make: () => blocks([[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]]) },
  corner: { pack: 'A', name: 'Corner block', make: () => blocks([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]) },
  skew: { pack: 'A', name: 'Skew block', make: () => blocks([[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]]) },
  stair3: { pack: 'A', name: 'Three steps', make: () => blocks([[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1], [2, 0, 1], [2, 0, 2]]) },

  // B. Prisms: the first triangles
  'tri-iso': { pack: 'B', name: 'Right triangular prism', note: 'two isosceles right triangles', make: () => section([[0, 0], [2, 0], [0, 2]], 3) },
  'tri-345': { pack: 'B', name: '3-4-5 prism', note: 'a 3-4-5 triangle: the slope is 5 long', make: () => section([[0, 0], [4, 0], [0, 3]], 2) },
  gable: { pack: 'B', name: 'Gable house', note: 'a pentagon section', make: () => section([[0, 0], [2, 0], [2, 1.5], [1, 2.5], [0, 1.5]], 3) },
  'ell-prism': { pack: 'B', name: 'L-plan block', make: () => plan([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], 1) },
  'tee-prism': { pack: 'B', name: 'T-plan block', make: () => plan([[0, 0], [3, 0], [3, 1], [2, 1], [2, 3], [1, 3], [1, 1], [0, 1]], 1) },
  'u-prism': { pack: 'B', name: 'U-plan court', make: () => plan([[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]], 1) },
  hex: { pack: 'B', name: 'Hexagonal pavilion', make: () => plan(hexagon(1.2), 1.6) },
  trapezoid: { pack: 'B', name: 'Trapezoid prism', make: () => section([[0, 0], [3, 0], [2, 1.5], [1, 1.5]], 2) },

  // C. Wedges and ramps: right triangles and a slanted rectangle
  wedge: { pack: 'C', name: 'Wedge', note: 'a cube cut on its diagonal', make: () => section([[0, 0], [2, 0], [2, 2]], 2) },
  ramp: { pack: 'C', name: 'Ramp', make: () => section([[0, 0], [4, 0], [4, 1.5]], 1.5) },
  shed: { pack: 'C', name: 'Lean-to shed', note: 'a mono-pitch roof', make: () => section([[0, 0], [3, 0], [3, 1.5], [0, 2.5]], 2) },
  'ramp-landing': { pack: 'C', name: 'Ramp with landing', make: () => section([[0, 0], [5, 0], [5, 1.5], [3, 1.5]], 1.5) },
  chamfer: { pack: 'C', name: 'Chamfered block', note: 'one edge cut away', make: () => section([[0, 0], [3, 0], [3, 1], [2, 2], [0, 2]], 2) },
  'double-wedge': { pack: 'C', name: 'Ridge wedge', make: () => section([[0, 0], [4, 0], [2, 2]], 2) },
  'saw-2': { pack: 'C', name: 'Sawtooth roof, two bays', note: 'north lights', make: () => section([[0, 0], [4, 0], [4, 2], [2, 1], [2, 2], [0, 1]], 2) },
  'saw-3': { pack: 'C', name: 'Sawtooth factory', note: 'three bays of north lights', make: () => section([[0, 0], [6, 0], [6, 2], [4, 1], [4, 2], [2, 1], [2, 2], [0, 1]], 2.5) },

  // D. Pyramids and roofs: triangle fans that overlap easily
  pyramid: { pack: 'D', name: 'Square pyramid', make: () => solid([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [1, 1, 1.6]]) },
  'tetra-corner': { pack: 'D', name: 'Corner tetrahedron', note: 'three right triangles meet at the corner', make: () => solid([[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]]) },
  yangma: { pack: 'D', name: 'Yangma', note: 'the apex stands over a corner: right triangles', make: () => solid([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 2]]) },
  'hip-roof': { pack: 'D', name: 'Hip roof', note: 'two trapezoids and two triangles', make: () => solid([[0, 0, 0], [4, 0, 0], [4, 2, 0], [0, 2, 0], [1, 1, 1], [3, 1, 1]]) },
  frustum: { pack: 'D', name: 'Frustum', make: () => solid([[0, 0, 0], [3, 0, 0], [3, 3, 0], [0, 3, 0], [1, 1, 1.5], [2, 1, 1.5], [2, 2, 1.5], [1, 2, 1.5]]) },
  'tri-pyramid': { pack: 'D', name: 'Triangular pyramid', make: () => solid([[0, 0, 0], [2.4, 0, 0], [1.2, 1.2 * r3, 0], [1.2, .4 * r3, 2]]) },
  'hex-pyramid': { pack: 'D', name: 'Hexagonal spire', make: () => solid([...hexagon(1.2).map(([x, y]) => [x, y, 0]), [0, 0, 2.2]]) },
  octahedron: { pack: 'D', name: 'Octahedron', note: 'eight triangles', make: () => restOn(solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(p => p.map(c => c * 1.4))), [-1, -1, -1]) },

  // E. Buildings: sections and massings you would draw in studio
  'hip-house': { pack: 'E', name: 'Hip-roofed house', make: () => solid([...box(0, 0, 0, 4, 2.5, 1.5), [1.25, 1.25, 2.6], [2.75, 1.25, 2.6]]) },
  'spire-tower': { pack: 'E', name: 'Tower with spire', make: () => solid([...box(0, 0, 0, 1.5, 1.5, 3), [.75, .75, 5]]) },
  saltbox: { pack: 'E', name: 'Saltbox', note: 'one long roof slope', make: () => section([[0, 0], [3.5, 0], [3.5, 1], [1.2, 2.6], [0, 2]], 3) },
  gambrel: { pack: 'E', name: 'Gambrel barn', make: () => section([[0, 0], [4, 0], [4, 2], [3.4, 3], [2, 3.6], [.6, 3], [0, 2]], 3) },
  basilica: { pack: 'E', name: 'Basilica', note: 'nave, clerestory and aisles', make: () => section([[0, 0], [5, 0], [5, 1.5], [3.5, 2], [3.5, 3], [2.5, 3.6], [1.5, 3], [1.5, 2], [0, 1.5]], 4) },
  mansard: { pack: 'E', name: 'Mansard block', make: () => solid([...box(0, 0, 0, 3, 3, 2), [.5, .5, 3], [2.5, .5, 3], [2.5, 2.5, 3], [.5, 2.5, 3]]) },
  'stair-block': { pack: 'E', name: 'Stepped block', make: () => section([[0, 0], [3, 0], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1], [0, 1]], 2) },
  'porch-house': { pack: 'E', name: 'House with porch', make: () => section([[0, 0], [4, 0], [4, 1.2], [3, 1.6], [3, 2], [1.5, 3], [0, 2]], 3) },

  // F. Cut and carved: triangles and pentagons appear where corners go
  'corner-cut': { pack: 'F', name: 'Cube, one corner cut', note: 'a triangle and three pentagons', make: () => solid([...box(0, 0, 0, 2, 2, 2).filter(p => !(p[0] === 2 && p[1] === 2 && p[2] === 2)), [1, 2, 2], [2, 1, 2], [2, 2, 1]]) },
  'two-corners': { pack: 'F', name: 'Two corners cut', make: () => solid([...box(0, 0, 0, 2, 2, 2).filter(p => !(p[2] === 2 && p[1] === 2 && (p[0] === 0 || p[0] === 2))), [1, 2, 2], [2, 1, 2], [2, 2, 1], [1, 2, 2], [0, 1, 2], [0, 2, 1]]) },
  'slant-cut': { pack: 'F', name: 'Block cut on a slant', note: 'the top is one tilted plane', make: () => solid([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 1], [2, 0, 2], [2, 2, 3], [0, 2, 2]]) },
  'notched': { pack: 'F', name: 'Notched beam', make: () => section([[0, 0], [4, 0], [4, 2], [3, 2], [3, 1], [1, 1], [1, 2], [0, 2]], 1.5) },
  'cut-pyramid': { pack: 'F', name: 'Pyramid cut on a slant', make: () => solid([[0, 0, 0], [3, 0, 0], [3, 3, 0], [0, 3, 0], [.5, .5, 1], [2.25, .75, .5], [2.25, 2.25, .5], [.5, 2.5, 1]]) },
  'truncated-cube': { pack: 'F', name: 'Cube, all corners cut', note: 'six octagons, eight triangles', make: () => {
    const t = .6, s = 2, pts = [];
    for (const x of [0, s]) for (const y of [0, s]) for (const z of [0, s]) {
      const d = c => c === 0 ? t : -t;
      pts.push([x + d(x), y, z], [x, y + d(y), z], [x, y, z + d(z)]);
    }
    return solid(pts);
  } },
  frame: { pack: 'F', name: 'Box with a hole', note: 'a ring: the hole needs its own faces', make: () => ring(3, 1, 1.2) },
  'twisted-wedge': { pack: 'F', name: 'Skew wedge', make: () => solid([[0, 0, 0], [3, 0, 0], [3, 2, 0], [0, 2, 0], [0, 0, 2], [0, 2, 1]]) },
};

// A square ring: an outer square s with a square hole h through it, height z.
// Top and bottom are split into four trapezoids so every face is a simple polygon.
export function ring(s, h, z) {
  const a = (s - h) / 2, b = a + h;
  const out = [[0, 0], [s, 0], [s, s], [0, s]], inn = [[a, a], [b, a], [b, b], [a, b]];
  const verts = [];
  const V = (p, zz) => { verts.push([p[0], p[1], zz]); return verts.length - 1; };
  const o0 = out.map(p => V(p, 0)), o1 = out.map(p => V(p, z)), i0 = inn.map(p => V(p, 0)), i1 = inn.map(p => V(p, z));
  const loops = [];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    loops.push([o0[k], o0[n], o1[n], o1[k]]);              // outer wall, facing out
    loops.push([i0[n], i0[k], i1[k], i1[n]]);              // inner wall, facing the hole
    loops.push([o1[k], o1[n], i1[n], i1[k]]);              // top trapezoid
    loops.push([o0[n], o0[k], i0[k], i0[n]]);              // bottom trapezoid
  }
  return solidOf(verts, loops);
}

export const formsOfPack = id => Object.entries(FORMS).filter(([, f]) => f.pack === id).map(([key, f]) => ({ key, ...f }));
