// node tests/core/poly.test.mjs — polygon solids, hulls, unfoldings and the Developments forms
import { solidOf, hull, prism, unfold, randomUnfolding, hingesFromCuts, overlaps, triangulate, area2 } from '../../src/core/poly.js';
import { FORMS, blocks } from '../../src/core/forms.js';
import { seededRng } from '../../src/core/rand.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// a cube by hull: 6 square faces, 12 edges, volume 8
const cube = hull([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 2], [2, 0, 2], [2, 2, 2], [0, 2, 2], [1, 1, 1]]);
ok(cube.faces.length === 6 && cube.edges.length === 12, 'hull cube faces/edges ' + cube.faces.length + '/' + cube.edges.length);
ok(near(cube.volume, 8), 'cube volume ' + cube.volume);
ok(cube.edges.every(e => e.convex && !e.flat), 'cube edges convex');

// an L prism has one concave edge pair
const L = prism([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 1);
ok(L.faces.length === 8 && near(L.volume, 3), 'L prism');
ok(L.edges.filter(e => !e.convex).length === 1, 'L prism has one concave edge');

// triangulation and overlap
ok(triangulate([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]).length === 4, 'L triangulates into 4');
ok(overlaps([[[0, 0], [1, 0], [1, 1], [0, 1]], [[1, 0], [2, 0], [2, 1], [1, 1]]]).length === 0, 'touching squares do not overlap');
ok(overlaps([[[0, 0], [1, 0], [1, 1], [0, 1]], [[.5, .5], [2, .5], [2, 2], [.5, 2]]]).length === 1, 'shifted squares overlap');

// cutting: a cube needs 7 cuts; 6 of a spanning-tree complement leaves a loop
const rng = seededRng('poly');
const net = randomUnfolding(cube, rng);
ok(net && net.overlaps.length === 0, 'cube unfolds');
const cuts = cube.edges.map(e => e.id).filter(id => !net.hinges.includes(id));
ok(cuts.length === 7 && hingesFromCuts(cube, cuts).ok, 'cube: 7 cuts unfold');
ok(hingesFromCuts(cube, cuts.slice(1)).reason === 'loop', 'one cut short is a loop');
ok(hingesFromCuts(cube, [...cuts, net.hinges[0]]).reason === 'pieces', 'one cut too many falls apart');

// every form: closed, positive volume, unfolds flat without overlap, pose(1) is the solid,
// pose(0) is flat, and the flat faces keep their areas
for (const [key, f] of Object.entries(FORMS)) {
  let s;
  try { s = f.make(); } catch (e) { ok(false, key + ' builds: ' + e.message); continue; }
  ok(s.volume > 0, key + ' volume');
  ok(s.edges.length === s.verts.length + s.faces.length - 2 + (key === 'frame' ? 2 : 0), key + ' Euler ' + [s.verts.length, s.edges.length, s.faces.length]);
  ok(Math.min(...s.verts.map(v => v[2])) === 0, key + ' stands on the ground');
  const n = randomUnfolding(s, seededRng('f:' + key), { tries: 200 });
  if (!n) { ok(false, key + ' has a flat net'); continue; }
  const folded = n.pose(1);
  ok(folded.every(q => q.pts.every((p, i) => dist(p, s.verts[s.faces[q.f].loop[i]]) < 1e-6)), key + ' pose(1) is the solid');
  const flat = n.pose(0), nz = flat[n.root].n;
  ok(flat.every(q => Math.abs(q.n[0] * nz[0] + q.n[1] * nz[1] + q.n[2] * nz[2] - 1) < 1e-6), key + ' pose(0) is flat');
  ok(n.flat.every((p, i) => near(Math.abs(area2(p)), s.faces[i].area, 1e-6)), key + ' flat areas');
  ok(n.flat.every(p => area2(p) > 0), key + ' flat faces seen from outside (ccw)');
}
ok(blocks([[0, 0, 0], [1, 0, 0]]).faces.length === 10, 'domino has 10 unit squares');

console.log(fails ? fails + ' failed' : 'poly: all passed');
process.exit(fails ? 1 : 0);
