// node tests/core/anamorph.test.mjs — Oblique: figures painted for one view
import { viewBasis, viewAngle, intersect, subtract, area, paintFigure, coverage, figureOf, FIGURES } from '../../src/core/anamorph.js';
import { hull } from '../../src/core/poly.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const D2R = Math.PI / 180;

// convex clipping
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
ok(near(area(intersect(sq(0, 0, 2), sq(1, 1, 2))), 1), 'two squares overlap in a unit square');
ok(intersect(sq(0, 0, 1), sq(2, 2, 1)) === null, 'apart: no overlap');
ok(near(subtract(sq(0, 0, 2), sq(1, 1, 2)).reduce((s, p) => s + area(p), 0), 3), 'a square less a quarter of it');
ok(near(subtract(sq(0, 0, 2), sq(.5, .5, 1)).reduce((s, p) => s + area(p), 0), 3), 'a square with a hole in it');

// the view basis is right-handed and matches the camera rig
const v = viewBasis(-112.5 * D2R, 28 * D2R);
ok(near(v.right[2], 0) && v.up[2] > 0 && v.d[2] < 0, 'view: right is level, up is up, the view looks down');

// a block on a ground: the figure lands somewhere, all of it, once
const facesOf = s => s.faces.map(f => ({ pts: f.loop.map(i => s.verts[i]), n: f.n }));
const box = (x, y, z, w, d, h) => hull([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
const ground = { pts: [[-30, -30, 0], [30, -30, 0], [30, 30, 0], [-30, 30, 0]], n: [0, 0, 1] };
const scene = [ground, ...facesOf(box(0, 0, 0, 2, 2, 2)), ...facesOf(box(-3, 1, 0, 1, 3, 3))];
for (const kind of Object.keys(FIGURES)) {
  const fig = figureOf({ kind, size: 1.5, at: [0, .8] });
  const c = coverage(scene, fig, v, [0, 0, 1]);
  ok(near(c, 1, 1e-4), `${kind}: painted once, all of it (coverage ${c.toFixed(5)})`);
}
// from another view the same paint does not make the figure: some of it hides or spreads
const paint = paintFigure(scene, figureOf({ kind: 'disc', size: 1.5 }), v, [0, 0, 1]);
ok(paint.length > 3, 'the disc is in pieces across faces');
ok(paint.every(p => p.pts3.length >= 3), 'pieces are polygons');
ok(near(viewAngle(v, viewBasis(-102.5 * D2R, 28 * D2R)) / D2R, 10 * Math.cos(28 * D2R), .3), 'view angle: ten degrees of yaw at this pitch');

console.log(fails ? fails + ' failures' : 'anamorph: all pass');
process.exit(fails ? 1 : 0);
