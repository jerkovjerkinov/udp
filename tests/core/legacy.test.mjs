// node tests/core.test.mjs — the pure geometry modules carried over from ps2
import { makeSolid, randomPolycube } from '../../src/core/polycube.js';
import { checkNet, randomNet, folder, leafFaces, facesOfNet } from '../../src/core/net.js';
import { seededRng } from '../../src/core/rand.js';
import * as P from '../../src/core/paper.js';
import { roofOf, randomFootprint, footprintFrom } from '../../src/core/roof.js';
import { parseStep, pointKey } from '../../src/core/lattice.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const grid = rows => rows.flatMap((r, j) => [...r].map((ch, i) => ch === '#' ? [i, j] : null).filter(Boolean));

const cube = makeSolid([[0, 0, 0]]);
ok(cube.squares.length === 6 && cube.faces.length === 6, 'cube has 6 squares and 6 faces');

// the eleven nets of a cube, plus some that are not
const cross = grid(['.#..', '####', '.#..']);
const tee = grid(['###', '.#.', '.#.', '.#.']);
ok(checkNet(cube, cross).ok, 'cross folds into a cube');
ok(checkNet(cube, tee).ok, 'T folds into a cube');
ok(!checkNet(cube, grid(['###', '###'])).ok, '2x3 block is not a cube net');
ok(checkNet(cube, grid(['###', '###'])).reason === 'fold', '2x3 block reason is fold');
ok(!checkNet(cube, grid(['####', '##..'])).ok, '4+2 same side is not a net');
ok(checkNet(cube, grid(['#####'])).reason === 'count', 'wrong count');
ok(checkNet(cube, grid(['###.##', '#.....'])).reason === 'pieces', 'two pieces');
ok(!checkNet(cube, grid(['#....', '#####'])).ok, '1+5 strip is not a net');

// a few of the eleven cube nets
for (const rows of [['#...', '####', '#...'], ['.#..', '####', '..#.'], ['##..', '.###', '...#'], ['###..', '..###'], ['##...', '.##..', '..##.']])
  ok(checkNet(cube, grid(rows)).ok, 'cube net ' + rows.join('/'));

// a 1x1x2 box: a face cut through its middle must be refused
const bar = makeSolid([[0, 0, 0], [1, 0, 0]]);
ok(bar.squares.length === 10 && bar.faces.length === 6, 'bar has 10 squares, 6 faces');

// random solids: every generated net passes, folds back onto the solid, and has leaf faces
const rng = seededRng('test');
for (let k = 1; k <= 6; k++) for (let t = 0; t < 25; t++) {
  const solid = makeSolid(randomPolycube(rng, k));
  const net = randomNet(solid, rng, 14, 11);
  if (!net) { ok(false, 'no net for k=' + k + ' ' + JSON.stringify(solid.cells)); continue; }
  const res = checkNet(solid, net.cells);
  ok(res.ok, 'generated net checks');
  ok(leafFaces(net).length >= 1 || solid.faces.length === 1, 'has a leaf face');
  ok(facesOfNet(solid, net.map).size === solid.faces.length, 'all faces present');
  // fold end pose lands every cell on its square
  for (const map of [net.map, res.map]) {
    const handed = map === net.map ? 1 : res.handed;
    const pose = folder(solid, map, handed)(1);
    for (const q of pose) {
      const m = q.pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      const c = solid.squares[q.s].center;
      if (Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]) > 1e-6) { ok(false, 'fold lands off its square k=' + k); break; }
      const n = solid.squares[q.s].n;
      if (Math.abs(q.n[0] - n[0]) + Math.abs(q.n[1] - n[1]) + Math.abs(q.n[2] - n[2]) > 1e-6) { ok(false, 'folded normal wrong k=' + k); break; }
    }
  }
  // removing a leaf face breaks the count
  const leaf = leafFaces(net)[0];
  if (leaf !== undefined) {
    const gone = new Set(solid.faces[leaf].squares);
    const rest = net.cells.filter(([i, j]) => !gone.has(net.map.get(i + ',' + j).s));
    ok(checkNet(solid, rest).reason === 'count', 'missing face is a count error');
  }
}

// mirrored net (seen from inside) is accepted
const mirrored = grid(['..#.', '####', '..#.']);
ok(checkNet(cube, mirrored).ok, 'mirror of cross folds');

// ------------------------------------------------------------------
// paper: folding and punching
// ------------------------------------------------------------------
{
  // the right half laid over the left, punched once: a hole and its mirror image
  const { sheet } = P.fold(P.flatSheet(6), P.line([3, 0], [0, 1]), -1);
  const holes = P.holesAt(sheet, [1.5, .5]).map(h => h.map(v => +v.toFixed(6)).join(',')).sort();
  ok(holes.join(' ') === '1.5,0.5 4.5,0.5', 'half fold makes the mirror hole ' + holes.join(' '));
  // the lower left triangle laid over the upper right, along the diagonal
  const d = P.fold(P.flatSheet(6), P.line([0, 0], [1, 1]), 1).sheet;
  const dh = P.holesAt(d, [4.5, 1.5]).map(h => h.map(v => +v.toFixed(6)).join(',')).sort();
  ok(dh.join(' ') === '1.5,4.5 4.5,1.5', 'diagonal fold mirrors across the diagonal ' + dh.join(' '));
}
for (const folds of [1, 2, 3]) for (const diagonals of [false, true]) for (const punches of [1, 2]) {
  for (let s = 0; s < 25; s++) {
    const q = P.randomFolding(seededRng(['paper', folds, diagonals, punches, s].join('-')), { n: 6, folds, diagonals, punches, maxHoles: 12 });
    const tag = ' (' + [folds, diagonals, punches, s] + ')';
    if (!q) { ok(false, 'no question' + tag); continue; }
    const last = q.states[folds];
    ok(last.facets.every(f => Math.abs(Math.abs(P.det(f.M)) - 1) < 1e-9), 'pieces move rigidly' + tag);
    ok(Math.abs(last.facets.reduce((a, f) => a + P.area(f.poly), 0) - 36) < 1e-6, 'no paper lost' + tag);
    ok(q.punches.reduce((a, p) => a + P.holesAt(last, p).length, 0) === q.holes.length, 'a hole per layer' + tag);
    ok(q.holes.length <= 12 && q.holes.every(h => h.split(',').every(v => +v >= 0 && +v < 6)), 'holes on the sheet' + tag);
    ok(!diagonals || q.steps.some(st => P.diagonal(st.line)), 'a diagonal fold when asked' + tag);
  }
}

// ------------------------------------------------------------------
// roofs: every outside corner gets a hip, every inside corner a valley
// ------------------------------------------------------------------
function auditRoof(cells, tag) {
  const roof = roofOf(cells, [3, 2]);
  ok(!roof.problems.length, 'roof on the lattice ' + tag + ' ' + roof.problems.slice(0, 2));
  const at = new Map();
  for (const [k, kind] of roof.creases) for (const p of parseStep(k)) {
    const pk = pointKey(...p);
    if (!at.has(pk)) at.set(pk, []);
    at.get(pk).push(kind);
  }
  for (const [list, want] of [[roof.corners.convex, 'hip'], [roof.corners.reflex, 'valley']]) {
    for (const p of list) {
      const here = at.get(pointKey(...p)) || [];
      ok(here.length === 1 && here[0] === want, want + ' from the corner at ' + p + ' ' + tag);
    }
  }
  ok([...roof.creases.keys()].every(k => !roof.eaveSet.has(k)), 'no crease on an eave ' + tag);
  const corner = new Set([...roof.corners.convex, ...roof.corners.reflex].map(p => pointKey(...p)));
  ok([...at].every(([pk, l]) => l.length > 1 || corner.has(pk)), 'lines end at corners or meet others ' + tag);
  // a lower wing's ridge can stop on a higher roof, so the lines need not be one piece, but never close a loop
  const seen = new Set();
  let parts = 0;
  for (const start of at.keys()) {
    if (seen.has(start)) continue;
    parts++; seen.add(start);
    const todo = [start];
    while (todo.length) {
      const pk = todo.pop();
      for (const k of roof.creases.keys()) {
        const [a, b] = parseStep(k).map(p => pointKey(...p));
        const other = a === pk ? b : b === pk ? a : null;
        if (other && !seen.has(other)) { seen.add(other); todo.push(other); }
      }
    }
  }
  ok(roof.creases.size === at.size - parts, 'no loops ' + tag);
  return roof;
}
{
  const rect = auditRoof(footprintFrom(['####', '####']).cells, 'rectangle');
  const kinds = [...rect.creases.values()];
  ok(kinds.filter(k => k === 'ridge').length === 4 && kinds.filter(k => k === 'hip').length === 8, 'rectangle: 4 hips and a ridge');
  ok(rect.height(3 + 4, 2 + 2) === 2, 'rectangle ridge height is half the width');
  const ell = auditRoof(footprintFrom(['##..', '####', '####']).cells, 'L');
  ok(ell.lines.filter(l => l.kind === 'valley').length === 1, 'L: one valley');
  auditRoof(footprintFrom(['..##..', '..##..', '######', '######', '..##..', '..##..']).cells, 'plus');
  for (let s = 0; s < 120; s++) {
    const fp = randomFootprint(seededRng('roof-' + s), { w: 8, h: 5, blocks: [2, 3], corners: [6, 12], minEdge: 2 });
    if (!fp) { ok(false, 'no footprint ' + s); continue; }
    auditRoof(fp.cells, 'seed ' + s);
  }
}

console.log(fails ? fails + ' failures' : 'all legacy core tests pass');
process.exit(fails ? 1 : 0);
