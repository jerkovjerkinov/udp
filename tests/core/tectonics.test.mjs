// node tests/core/tectonics.test.mjs — Build Order rules, structures and level data
import { BUILDERS, createModel, buildModel, overlaps, canRemove, canPlace, removable, assemblyFrom, dismantleOrder, box, sweepHits } from '../../src/core/tectonics.js';
import { PACKS } from '../../games/buildorder/levels.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };

// sweeping: a block slides past a neighbour it only touches, not through one ahead
const a = box(0, 0, 0, 1, 1, 1), b = box(1, 0, 0, 2, 1, 1), c = box(0, 0, 1, 1, 1, 2);
ok(!overlaps(a, b), 'touching blocks do not overlap');
ok(sweepHits(a, [1, 0, 0], b), 'a block cannot slide into its neighbour');
ok(!sweepHits(a, [-1, 0, 0], b), 'it can slide away from it');
ok(!sweepHits(a, [0, 1, 0], b), 'or along it');
ok(sweepHits(a, [0, 0, 1], c), 'a block under another cannot lift');

// trilithon: the lintel first; a post cannot leave from under it
{
  const m = buildModel('trilithon');
  const lintel = m.parts.find(p => p.kind === 'lintel'), post = m.parts.find(p => p.kind === 'post');
  ok(lintel && post, 'trilithon has a lintel and posts');
  const r = canRemove(m, m.goal, post.id);
  ok(!r.ok && r.why === 'rests' && r.by === lintel.id, 'a post under the lintel cannot come out');
  ok(canRemove(m, m.goal, lintel.id).ok, 'the lintel lifts off');
  ok(canRemove(m, m.goal, lintel.id).dir === '+z', 'upwards');
  ok(removable(m, m.goal).join() === lintel.id, 'only the lintel can come out');
  const p = canPlace(m, new Set(), lintel.id);
  ok(!p.ok && p.why === 'needs', 'the lintel needs its posts');
}

// arch: the centering carries the voussoirs until the keystone locks them
{
  const m = buildModel('arch', { m: 5 });
  const key = m.parts.find(p => p.kind === 'keystone'), cen = m.parts.find(p => p.temp);
  ok(key && cen && !m.goal.has(cen.id), 'an arch has a keystone and temporary centering');
  const piers = m.parts.filter(p => p.kind === 'pier').map(p => p.id);
  const v0 = m.parts.find(p => p.id === 'v0');
  ok(!canPlace(m, new Set(piers), v0.id).ok, 'the springer needs the centering');
  ok(canPlace(m, new Set([...piers, cen.id]), v0.id).ok, 'and stands on it');
  ok(!canRemove(m, m.goal, key.id).ok, 'the keystone of a standing arch cannot come out without the centering');
  ok(canRemove(m, new Set([...m.goal, cen.id]), key.id).ok, 'with the centering back under, it can');
  const seq = assemblyFrom(m);
  ok(seq && seq[seq.length - 1].op === 'out' && seq[seq.length - 1].id === cen.id, 'the centering is struck last');
  ok(seq && seq.findIndex(x => x.id === cen.id) < seq.findIndex(x => x.id === v0.id), 'and goes in before the stones');
  ok(removable(m, m.goal).every(id => !['voussoir', 'keystone'].includes(m.byId.get(id).kind)), 'no stone leaves a standing arch on its own');
}

// every structure: no overlaps, nothing floating, can be built and taken apart
for (const [name, fn] of Object.entries(BUILDERS)) {
  const m = createModel(fn());
  let bad = 0;
  for (let i = 0; i < m.parts.length; i++) for (let j = i + 1; j < m.parts.length; j++)
    if (m.parts[i].pieces.some(x => m.parts[j].pieces.some(y => overlaps(x, y)))) bad++;
  ok(!bad, `${name}: no parts overlap`);
  ok(m.parts.every(p => !p.on.some(alt => alt.length === 0) || p.bbox[2] < 1e-3 || p.temp), `${name}: nothing floats`);
  ok(new Set(m.ids).size === m.ids.length, `${name}: ids are unique`);
  ok(m.parts.every(p => p.name), `${name}: every part has a name`);
  ok(!!assemblyFrom(m), `${name}: can be built`);
  ok(!!dismantleOrder(m), `${name}: can be taken apart`);
}

// levels: unique ids, five to eight to a pack, every one playable by the rules
// (the physics checks are in physics.test.mjs)
const ids = new Set();
for (const pk of PACKS) {
  ok(pk.levels.length >= 5 && pk.levels.length <= 8, pk.id + ' has 5 to 8 levels');
  for (const l of pk.levels) {
    ok(!ids.has(l.id), l.id + ' is unique'); ids.add(l.id);
    ok(['dismantle', 'assemble', 'free', 'keep', 'test'].includes(l.task), l.id + ' has a task');
    const m = buildModel(l.build, l.opts);
    ok(m.parts.length >= 2, l.id + ' has parts');
    if (l.task === 'assemble') {
      const s = assemblyFrom(m);
      ok(s && s.filter(x => x.op === 'in' && m.goal.has(x.id)).length === m.goal.size, l.id + ' can be built');
      ok(removable(m, new Set()).length === 0, l.id + ' starts empty');
    }
    if (l.task === 'dismantle') ok(!!dismantleOrder(m), l.id + ' can be taken apart');
    if (l.task === 'keep') {
      const re = new RegExp(l.keep), order = l.order.split(' ');
      ok([...m.goal].some(id => re.test(id)), l.id + ' keeps some parts');
      ok(order.length === l.target && order.every(id => m.goal.has(id) && !re.test(id)), l.id + ' its order takes out target parts, none kept');
    }
  }
  // a pack does not repeat itself: no task on the same structure twice
  const keys = pk.levels.map(l => l.task + ':' + l.build + ':' + JSON.stringify(l.opts));
  ok(new Set(keys).size === keys.length, pk.id + ' has no repeated level');
}
ok(PACKS.length === 6, 'six packs');

console.log(fails ? `${fails} of ${n} failed` : `all ${n} checks pass`);
process.exit(fails ? 1 : 0);
