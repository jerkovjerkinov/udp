// node tests/core/nettasks.test.mjs — the Developments puzzles
import { opening, matchEdges, misfit, misfitPose, distractors, baseFace, parentFaces, fitsAt, tableNet } from '../../src/core/nettasks.js';
import { randomUnfolding, overlaps } from '../../src/core/poly.js';
import { sheetFit } from '../../src/core/nettasks.js';
import { PACKS } from '../../games/developments/levels.js';
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
// every level: the form has no seam on a flat side, and a sheet level has a net that fits its sheet
for (const pk of PACKS) for (const l of pk.levels) {
  const s = FORMS[l.form].make();
  ok(l.form === 'frame' || s.edges.every(e => !e.flat), l.id + ' no flat seam');
  if (!l.paper) continue;
  const base = baseFace(s);
  let found = 0;
  for (let t = 0; t < 600 && found < 3; t++) {
    const net = randomUnfolding(s, seededRng('lv:' + l.id + ':' + t), { root: base, tries: 20, pick: 'any' });
    if (net && !net.overlaps.length && sheetFit(net, ...l.paper).fits) found++;
  }
  ok(found >= 3, l.id + ' nets fit the ' + l.paper.join(' x ') + ' sheet');
}

// ------------------------------------------------------------------
// the ladder (src/core/netrules.js): every rule can be met, and every rule bites
// ------------------------------------------------------------------
import('../../src/core/netrules.js').then(async R => {
  const { verdict, solutions, lineStep, lineEnds, keptFaces, keptWhole, drawRounds, rotations, mended } = R;
  // the cube's rotations: 24; a gable house: 2 (it turns end for end)
  ok(rotations(FORMS.cube.make()).length === 24, 'cube has 24 rotations');
  ok(rotations(FORMS.gable.make()).length === 2, 'gable house has 2 rotations');
  ok(rotations(FORMS.saltbox.make()).length === 1, 'saltbox has only the identity');

  // one line: a cut from the middle branches, a cut away from it jumps
  const c = FORMS.cube.make(), e0 = c.edges[0];
  const touching = c.edges.filter(e => e.id !== 0 && (e.a === e0.a || e.b === e0.a || e.a === e0.b || e.b === e0.b));
  ok(lineStep(c, [0], touching[0].id) === null, 'line: carrying on from an end is fine');
  const apart = c.edges.find(e => ![e0.a, e0.b].includes(e.a) && ![e0.a, e0.b].includes(e.b));
  ok(lineStep(c, [0], apart.id) === 'jump', 'line: a cut away from the line jumps');
  const two = [0, touching[0].id], mid = [e0.a, e0.b].find(v => [touching[0].a, touching[0].b].includes(v));
  const fromMid = c.edges.find(e => !two.includes(e.id) && (e.a === mid || e.b === mid));
  ok(lineStep(c, two, fromMid.id) === 'branch', 'line: a cut from the middle branches');
  ok(lineEnds(c, two).length === 2, 'line: both cuts of a two-cut line are ends');
  ok(keptFaces(c, 'walls').length === 4 && keptFaces(c, 'roof').length === 1, 'cube: four walls, one roof face');

  for (const pk of PACKS) for (const l of pk.levels) {
    const s = FORMS[l.form].make(), rng = seededRng('ladder:' + l.id);
    ok(typeof l.learn === 'string' && l.learn.length > 20, l.id + ' says what it teaches');
    if (l.task === 'cut') {
      const rules = { paper: l.paper, line: l.line, keep: l.keep };
      const sol = solutions(s, rules, { rng, limit: 2, tries: 6000 });
      ok(sol.length >= 1, l.id + ' can be solved under its rules');
      for (const cuts of sol) ok(!verdict(s, cuts, rules), l.id + ' its solution passes');
      // the rule bites: some nets that lie flat break it
      if (l.paper || l.line || l.keep) {
        const free = solutions(s, {}, { rng: seededRng('free:' + l.id), limit: 60, tries: 4000 });
        const broken = free.filter(cuts => verdict(s, cuts, rules)).length;
        ok(broken >= free.length * .3, l.id + ' rule bites: ' + broken + ' of ' + free.length + ' flat nets break it');
      }
    }
    if (l.task === 'draw') {
      const net = tableNet(s, rng), d = drawRounds(s, net, rng, { hard: l.hard });
      ok(d && d.asks.length >= 2 && !d.asks.includes(d.ref) && !d.asks.includes(net.root), l.id + ' has marks to place');
      // no turn of the solid that keeps the base and the clue in place moves an asked face
      if (d) for (const m of rotations(s)) if (m[net.root] === net.root && m[d.ref] === d.ref) ok(d.asks.every(f => m[f] === f), l.id + ' asked faces are unambiguous');
    }
    if (l.task === 'fix') {
      let mf = null, net = null;
      for (let t = 0; t < 20 && !mf; t++) { net = tableNet(s, rng, { pick: 'any' }); mf = misfit(s, net, rng); }
      ok(mf, l.id + ' has a face to move');
      if (mf) {
        ok(mended(s, net, mf.leaf, net.parent[mf.leaf]).ok, l.id + ' its true hinge mends it');
        ok(!mended(s, net, mf.leaf, mf.to.e).ok, l.id + ' the wrong edge does not');
      }
    }
    if (l.task === 'fold' && l.twin) {
      const net = tableNet(s, rng, { pick: 'any' });
      ok(misfit(s, net, rng), l.id + ' twin net has a moved face');
    }
  }
  // the keep rule in play: cutting both edges between two walls of a ring splits it
  const g = FORMS.gable.make(), walls = keptFaces(g, 'walls');
  const between = g.edges.filter(e => walls.includes(e.f[0]) && walls.includes(e.f[1])).map(e => e.id);
  ok(between.length === 4 && keptWhole(g, walls, between.slice(0, 1)) && !keptWhole(g, walls, between.slice(0, 2)), 'gable walls: one cut in the ring is fine, two split it');
  console.log(fails ? fails + ' failed' : 'nettasks: all passed');
  process.exit(fails ? 1 : 0);
});

