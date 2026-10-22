// node tests/core/origamic.test.mjs — Origamic geometry, generators and level data
import { profileOf, poseCard, massOf, randomCard, readOptions, tearCard, cardFrom, cardKey, stripsOf, cutsOf, foldLinesOf, drawingsOf, fieldEdges, svgOf } from '../../src/core/origamic.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS, BUILDS } from '../../games/origamic/levels.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// one box: depth 2, height 3
ok(profileOf([-2, 1, 3]).ok, 'a box stands');
ok(!profileOf([-2, 2, 3]).ok, 'a box whose walls do not reach the wall tears');
ok(!profileOf([-2, 3]).ok, 'two folds are not enough');
ok(profileOf([-3, -1, 0, 2, 4]).ok, 'a two-step strip stands');
ok(profileOf([-2, 0, 2]).ok, 'an inner fold on the gutter line is fine');

// every piece meets the next at every opening angle, and the chain ends on the wall
for (const f of [[-2, 1, 3], [-3, -1, 0, 2, 4], [-3, -2, -1, 0, 1, 2, 3], [-3, 1, 3, 4, 5]]) {
  const card = { W: 1, D: 5, H: 6, cols: [f] };
  for (const th of [Math.PI, 2.5, 2, Math.PI / 2, 1, .3]) {
    const r = poseCard(card, th);
    const pieces = r.filter(x => x.kind === 'piece');
    const floor = r.find(x => x.kind === 'floor'), wall = r.find(x => x.kind === 'wall');
    let at = floor.quad[3];
    let chain = true;
    for (const p of pieces) { chain &&= near(p.quad[0][1], at[1]) && near(p.quad[0][2], at[2]); at = p.quad[3]; }
    ok(chain && near(at[1], wall.quad[0][1]) && near(at[2], wall.quad[0][2]), `${f} closes at ${th.toFixed(2)}`);
  }
}

// the building under a box is one mass, d deep and h high
const m = massOf({ W: 1, D: 5, H: 6, cols: [[-2, 1, 3]] });
ok(m.length === 1 && m[0].y0 === 0 && m[0].y1 === 2 && m[0].z1 === 3, 'mass of a box');

// drawings: the plan of a box has its roof edge at its depth, the elevation its top at its height
const d = drawingsOf({ W: 3, D: 5, H: 6, cols: [null, [-2, 1, 3], null] });
ok(d.plan[1].join() === '3,3,0,0,0' && d.plan[0].every(v => v === 0), 'plan heights');
ok(d.face[1].join() === '2,2,2,0,0,0', 'elevation depths');
const pe = fieldEdges(d.plan);
ok(pe.some(([a, b]) => a[1] === 2 && b[1] === 2 && a[0] === 1 && b[0] === 2), 'the plan draws the roof front edge');

// the hand-made buildings all stand
for (const [k, b] of Object.entries(BUILDS)) {
  const c = cardFrom({ W: 10, D: 5, H: 6, ...b });
  ok(stripsOf(c).every(st => profileOf(st.folds).ok), `build ${k} stands`);
  ok(c.cols.every(f => !f || (-f[0] <= c.D - 1 && f[f.length - 1] <= c.H - 1)), `build ${k} fits its card`);
}

// every level generates: options distinct with one right, tears really tear
for (const pk of PACKS) for (const l of pk.levels) {
  const W = l.W ?? 10, D = l.D ?? 5, H = l.H ?? 6;
  const rng = seededRng('origamic:' + l.id);
  const card = l.build ? cardFrom({ W, D, H, ...BUILDS[l.build] }) : randomCard(rng, { W, D, H, strips: l.strips, width: l.width || [1, 3], steps: l.steps });
  ok(stripsOf(card).length >= 1 && stripsOf(card).every(st => profileOf(st.folds).ok), l.id + ' stands');
  ok(card.cols.every(f => !f || (f[0] > -card.D && f[f.length - 1] < card.H)), l.id + ' fits the card');
  if (!l.build && l.strips) ok(stripsOf(card).length >= l.strips[0] - 1, l.id + ' has enough strips (' + stripsOf(card).length + ')');
  if (l.task === 'read') {
    const o = readOptions(rng, card);
    ok(o.length === 4 && o.filter(x => x.ok).length === 1, l.id + ' four options, one right');
    ok(new Set(o.map(x => cardKey(x.card))).size === 4, l.id + ' options differ');
    ok(o.every(x => x.ok || x.why), l.id + ' every wrong option says why');
  }
  if (l.task === 'tear') {
    const t = tearCard(rng, card, l.broken || 1);
    ok(t && t.broken.length === (l.broken || 1), l.id + ' tears ' + (l.broken || 1));
    if (t) {
      const bad = stripsOf(t.card).filter(st => !profileOf(st.folds).ok).map(st => st.x0);
      ok(bad.length === t.broken.length && bad.every(x => t.broken.includes(x)), l.id + ' the torn strips are the broken ones');
      ok(stripsOf(t.card).length === stripsOf(card).length, l.id + ' tearing keeps the strips');
    }
  }
  ok(cutsOf(card).every(c => c.s1 > c.s0), l.id + ' cuts have length');
  ok(foldLinesOf(card).length > 0, l.id + ' has folds');
  ok(svgOf(card).startsWith('<svg'), l.id + ' exports');
}

console.log(fails ? `${fails} of ${n} failed` : `all ${n} checks pass`);
process.exit(fails ? 1 : 0);
