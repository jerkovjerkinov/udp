// node tests/core/physics.test.mjs — Build Order under real gravity: every level against the physics
import { loadPhysics, settle } from '../../src/core/physics.js';
import { buildModel, assemblyFrom, dismantleOrder, slideOut } from '../../src/core/tectonics.js';
import { createVerdicts, canStrip, testCases } from '../../src/core/stability.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS } from '../../games/buildorder/levels.js';

await loadPhysics();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };

// the plain cases: a lintel without a post falls, a trilithon without its lintel stands
{
  const m = buildModel('trilithon');
  ok(settle(m, [...m.goal]).stands, 'a trilithon stands');
  ok(!settle(m, ['p1', 'l']).stands && settle(m, ['p1', 'l']).falling.includes('l'), 'the lintel on one post falls');
  ok(settle(m, ['p1', 'p2']).stands, 'two posts stand');
  const a = settle(m, ['p1', 'l']), b = settle(m, ['p1', 'l']);
  ok(a.falling.join() === b.falling.join() && a.lean === b.lean, 'the physics gives the same answer twice');
}
// an arch: stands on its own once closed; without its keystone it falls, unless the centering is under it
{
  const m = buildModel('arch', { m: 5 });
  ok(settle(m, [...m.goal]).stands, 'a closed arch stands without its centering');
  const open = [...m.goal].filter(id => id !== 'v2');
  ok(!settle(m, open).stands, 'without the keystone it falls');
  ok(settle(m, [...open, 'c']).stands, 'on its centering it stands');
}
// a corbel stands only with the blocks behind it holding it down
{
  const m = buildModel('corbel', { courses: 4 });
  ok(settle(m, [...m.goal]).stands, 'a corbelled opening stands');
  ok(!settle(m, [...m.goal].filter(id => !id.startsWith('bl') && !id.startsWith('br'))).stands, 'four courses out, without its back blocks it tips in');
}

const T0 = Date.now();
for (const pk of PACKS) for (const l of pk.levels) {
  const m = buildModel(l.build, l.opts), V = createVerdicts(m);
  ok(V.stable(m.goal), l.id + ' stands as built');
  if (l.task === 'assemble') {
    const s = assemblyFrom(m, new Set(), { stable: V.stable });
    ok(!!s, l.id + ' can be built in an order that stands at every step');
  }
  if (l.task === 'dismantle') ok(!!dismantleOrder(m, m.goal, { stable: V.stable }), l.id + ' can be taken apart in an order that stands');
  if (l.task === 'free') {
    const free = [...m.goal].filter(id => slideOut(m, m.goal, id).ok && V.check([...m.goal].filter(x => x !== id)).stands);
    ok(free.length >= 1 && free.length < m.goal.size, `${l.id} has some, not all, parts free (${free.length})`);
  }
  if (l.task === 'keep') {
    const re = new RegExp(l.keep), keep = new Set([...m.goal].filter(id => re.test(id)));
    const s = new Set(m.goal);
    let good = 0;
    for (const id of l.order.split(' ')) { if (!canStrip(m, V, s, id, keep).ok) break; s.delete(id); good++; }
    ok(good === l.target, `${l.id} its order takes out ${l.target} and keeps it up (got ${good})`);
  }
  if (l.task === 'test') {
    const cs = testCases(m, V, seededRng('test:' + l.id + ':'));
    ok(cs.length === 3, l.id + ' has three versions');
    ok(cs.some(c => c.stands) && cs.some(c => !c.stands), l.id + ' some stand and some fall');
  }
}

console.log(fails ? `${fails} of ${n} failed` : `all ${n} checks pass (${Math.round((Date.now() - T0) / 1000)} s of levels)`);
process.exit(fails ? 1 : 0);
