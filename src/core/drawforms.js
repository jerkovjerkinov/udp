// The buildings of Drawing Set: plaster models made of a few simple solids
// that may run into each other (a wing into a house, a chimney through a roof).
// Every corner sits on the half-module lattice of the sheet in every view the
// levels ask for, so a correct drawing can always be drawn point to point.
//
// Units are modules, z is up, the front of a building faces -y.

import { prism, hull, mapSolid } from './poly.js';
import { FORMS } from './forms.js';

const box = (x, y, z, w, d, h) => hull([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
const at = (s, [dx, dy, dz]) => mapSolid(s, ([x, y, z]) => [x + dx, y + dy, z + dz]);
// a gable block: ridge along x (or y), eaves at e, ridge at r
const gableX = (x, y, w, d, e, r) => at(mapSolid(prism([[0, 0], [d, 0], [d, e], [d / 2, r], [0, e]], w), ([a, b, c]) => [c, a, b]), [x, y, 0]);
const gableY = (x, y, w, d, e, r) => at(mapSolid(prism([[0, 0], [w, 0], [w, e], [w / 2, r], [0, e]], d), ([a, b, c]) => [a, c, b]), [x, y, 0]);
// a shed (mono-pitch) block, high side at the back, ridge along x
const shedX = (x, y, w, d, lo, hi) => at(mapSolid(prism([[0, 0], [d, 0], [d, hi], [0, lo]], w), ([a, b, c]) => [c, a, b]), [x, y, 0]);
// a section [x, z] at x0, run along y
const sectionY = (x, prof, d) => at(mapSolid(prism(prof, d), ([a, b, c]) => [a, c, b]), [x, 0, 0]);
const pyramidOn = (x, y, w, d, z, h) => hull([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x + w / 2, y + d / 2, z + h]]);
const hipX = (x, y, w, d, e, r) => hull([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0], [x, y, e], [x + w, y, e], [x + w, y + d, e], [x, y + d, e],
  [x + (r - e), y + d / 2, r], [x + w - (r - e), y + d / 2, r]]);
const form = key => () => [FORMS[key].make()];

/** DRAW_FORMS[key] = { name, make() → [solid, ...] } */
export const DRAW_FORMS = {
  // blocks and prisms from Developments
  cube: { name: 'Cube', make: form('cube') },
  step: { name: 'Step', make: form('step') },
  ell: { name: 'L block', make: form('ell') },
  stair3: { name: 'Three steps', make: form('stair3') },
  corner: { name: 'Corner block', make: form('corner') },
  'tri-iso': { name: 'Wedge prism', make: form('tri-iso') },
  gable: { name: 'Gable house', make: form('gable') },
  'ell-prism': { name: 'L-plan block', make: form('ell-prism') },
  'u-prism': { name: 'U-plan court', make: form('u-prism') },
  'tee-prism': { name: 'T-plan block', make: form('tee-prism') },
  wedge: { name: 'Wedge', make: form('wedge') },
  ramp: { name: 'Ramp', make: form('ramp') },
  shed: { name: 'Lean-to shed', make: form('shed') },
  chamfer: { name: 'Chamfered block', make: form('chamfer') },
  'double-wedge': { name: 'Ridge wedge', make: form('double-wedge') },
  'saw-2': { name: 'Sawtooth roof', make: form('saw-2') },
  'saw-3': { name: 'Sawtooth factory', make: form('saw-3') },
  'hip-roof': { name: 'Hip roof', make: form('hip-roof') },
  'stair-block': { name: 'Stepped block', make: form('stair-block') },
  notched: { name: 'Notched beam', make: form('notched') },
  'corner-cut': { name: 'Cube, one corner cut', make: form('corner-cut') },
  'slant-cut': { name: 'Block cut on a slant', make: form('slant-cut') },
  mansard: { name: 'Mansard block', make: form('mansard') },

  // houses
  'hip-house': { name: 'Hipped house', make: () => [hipX(0, 0, 4, 2, 1, 2)] },
  'long-house': { name: 'Long house', make: () => [gableX(0, 0, 4, 2, 1, 2)] },
  'house-shed': { name: 'House with a lean-to', make: () => [gableX(0, 0, 3, 2, 1.5, 2.5), shedX(3, 0, 1.5, 2, 1, 1.5)] },
  'chimney-house': { name: 'House with a chimney', make: () => [gableX(0, 0, 4, 2, 1, 2), box(2.5, 1, 1, .5, .5, 1.5)] },
  'cross-house': { name: 'Cross-gabled house', make: () => [gableX(0, 1, 4, 2, 1, 2), gableY(1, 0, 2, 2, 1, 2)] },
  'ell-house': { name: 'L-shaped house', make: () => [gableX(0, 1, 4, 2, 1, 2), gableY(0, 0, 2, 2, 1, 2)] },
  'tee-house': { name: 'T-shaped house', make: () => [gableX(0, 2, 5, 2, 1, 2), gableY(1.5, 0, 2, 3, 1, 2)] },
  'step-house': { name: 'Two-storey house with a wing', make: () => [gableX(0, 0, 2, 2, 2, 3), gableX(2, 0, 2, 2, 1, 2)] },
  'tower-house': { name: 'Tower house', make: () => [gableX(0, 0, 4, 2, 1, 2), box(4, 0, 0, 2, 2, 3), pyramidOn(4, 0, 2, 2, 3, 1)] },
  // four roofs over one footprint, for telling top views apart
  slab: { name: 'Flat slab', make: () => [box(0, 0, 0, 3, 3, 1)] },
  'ell-prism-r': { name: 'L-plan block, turned', make: () => [mapSolid(FORMS['ell-prism'].make(), ([x, y, z]) => [3 - x, y, z])] },
  'flat-block': { name: 'Flat-roofed block', make: () => [box(0, 0, 0, 4, 2, 1.5)] },
  'cross-ridge': { name: 'House turned end-on', make: () => [gableY(0, 0, 4, 2, 1, 2)] },
  'shed-block': { name: 'Mono-pitch block', make: () => [shedX(0, 0, 4, 2, 1, 2)] },
  chapel: { name: 'Chapel with a bell tower', make: () => [gableY(0, 1, 2, 3, 1.5, 2.5), box(.5, 0, 0, 1, 1, 3), pyramidOn(.5, 0, 1, 1, 3, 1)] },
  basilica: { name: 'Basilica', make: () => [gableY(1, 0, 2, 4, 2.5, 3.5), sectionY(0, [[0, 0], [1, 0], [1, 1.5], [0, 1]], 4), sectionY(3, [[0, 0], [1, 0], [1, 1], [0, 1.5]], 4)] },
  // bigger buildings, for pack F
  courtyard: { name: 'Courtyard house', make: () => [gableX(0, 2, 6, 2, 1, 2), gableY(0, 0, 2, 3, 1, 2), gableY(4, 0, 2, 3, 1, 2)] },
  'dormer-house': { name: 'House with a wall dormer', make: () => [gableX(0, 0, 4, 3, 1.5, 3), gableY(1.5, 0, 1, 1.5, 2, 2.5)] },
  portal: { name: 'Gatehouse', make: () => [box(0, 0, 0, 1, 2, 2), box(2, 0, 0, 1, 2, 2), at(gableX(0, 0, 3, 2, .5, 1.5), [0, 0, 2])] },
  'cross-church': { name: 'Church with a crossing tower', make: () => [gableY(1, 0, 2, 6, 2, 3), gableX(0, 3, 4, 2, 2, 3), box(1.5, 3.5, 0, 1, 1, 4), pyramidOn(1.5, 3.5, 1, 1, 4, 1)] },
  terrace: { name: 'Stepped terrace', make: () => [box(0, 1, 0, 2, 2, 3), box(2, .5, 0, 2, 2.5, 2), box(4, 0, 0, 2, 3, 1)] },
};

export const drawForm = key => DRAW_FORMS[key].make();
