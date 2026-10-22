// node tests/core/nettasks.test.mjs — the Developments puzzles
import { opening, matchEdges, misfit, misfitPose, distractors, baseFace, parentFaces, fitsAt, tableNet } from '../../src/core/nettasks.js';
import { randomUnfolding, overlaps } from '../../src/core/poly.js';
import { FORMS } from '../../src/core/forms.js';
import { seededRng } from '../../src/core/rand.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

const cube = FORMS.cube.make();
const base = baseFace(cube);
ok(cube.faces[base].n[2] < -.99, 'base face points down');
for (const [key, f] of Object.entries(FORMS)) { const s = f.make(); ok(s.faces[baseFace(s)].n[2] < -.999, key + ' rests on a face'); }

// cutting step by step: closed, then a flap swings free, then flat
ok(opening(cube, []).state === 'closed', 'no cuts: closed');
const top = cube.faces.findIndex(f => f.n[2] > .99);
const topEdges = cube.faces[top].edges;
const o3 = opening(cube, topEdges.slice(0, 3));
ok(o3.state === 'opening' && o3.free.length === 1 && o3.free[0] === top, 'three cuts round the lid free the lid');
const lid = o3.pose(0)[top].pts;
ok(Math.abs(lid.reduce((s, p) => s + p[2], 0) / 4 - (1 + .0)) > .01, 'the lid swings');
ok(o3.pose(1)[top].pts.every((p, i) => dist(p, cube.verts[cube.faces[top].loop[i]]) < 1e-9), 'pose(1) folded');
ok(opening(cube, topEdges).state === 'apart', 'four cuts round the lid: it falls off');

for (const [key, f] of Object.entries(FORMS)) {
  const s = f.make(), rng = seededRng('t:' + key);
  const net = randomUnfolding(s, rng, { root: baseFace(s), tries: 200 });
  if (!net) { ok(false, key + ' unfolds from its base'); continue; }
  const cuts = s.edges.map(e => e.id).filter(id => !net.hinges.includes(id));
  ok(opening(s, cuts).state === 'flat', key + ' cuts lie flat');
  const m = matchEdges(net, rng, 3);
  ok(m.every(q => q.given.f !== q.answer.f && s.edges[q.e].f.includes(q.given.f) && s.edges[q.e].f.includes(q.answer.f)), key + ' match edges are the two sides');
  const mf = misfit(s, net, rng);
  if (mf) {
    ok(!fitsAt(s, mf.leaf, mf.to), key + ' misfit hangs where it does not fold');
    ok(fitsAt(s, mf.leaf, mf.from), key + ' its true place fits');
    const pz = misfitPose(s, net, mf);
    const p0 = pz(0)[mf.leaf].pts;
    const R = s.faces[net.root], r0 = pz(0)[net.root].pts[0];
    ok(p0.every(p => Math.abs((p[0] - r0[0]) * R.n[0] + (p[1] - r0[1]) * R.n[1] + (p[2] - r0[2]) * R.n[2]) < 1e-6), key + ' misfit flat at t=0');
    // at t=1 the leaf lies in the plane of the face it lands on
    const L = s.faces[mf.lands];
    const p1 = pz(1)[mf.leaf].pts;
    ok(p1.every(p => Math.abs((p[0] - L.c[0]) * L.n[0] + (p[1] - L.c[1]) * L.n[1] + (p[2] - L.c[2]) * L.n[2]) < 1e-6), key + ' misfit lands in the plane of ' + mf.lands);
  }
  const d = distractors(key, rng);
  ok(d.length === 3 && !d.includes(key), key + ' distractors');
}
// every form gives a table net for many seeds
for (const [key, f] of Object.entries(FORMS)) {
  const s = f.make();
  let miss = 0;
  for (let i = 0; i < 12; i++) if (!tableNet(s, seededRng(key + ':' + i))) miss++;
  ok(!miss, key + ' table net missing for ' + miss + ' seeds');
}
console.log(fails ? fails + ' failed' : 'nettasks: all passed');
process.exit(fails ? 1 : 0);
