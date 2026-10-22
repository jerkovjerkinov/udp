// node tests/core/stack.test.mjs — Stack rules, generators and level data
import { ROTS, orientations, oriented, turn, tip, drop, evaluate, tile, massCells, buildOrder, levelFrom, matchDrawings, K } from '../../src/core/stack.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS } from '../../games/stack/levels.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const mod = (id, type, cells) => ({ id, type, o: 0, cells });

ok(ROTS.length === 24, '24 rotations');
ok(orientations('studio').length === 3 && orientations('family').length === 24 && orientations('square').length === 3, 'distinct orientations');
ok([0, 5, 11].every(o => turn(turn(turn(turn(o)))) === o), 'four turns come back');
ok([0, 7].every(o => tip(tip(tip(tip(o)))) === o), 'four tips come back');
ok(turn(turn(0, 1), -1) === 0, 'turning back undoes a turn');

// dropping: a module falls until it rests, never under an overhang
const site = { W: 4, D: 3, H: 4, street: true };
const a = mod('a', 'flat', [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
let r = drop(site, [a], oriented('studio', 0), 1, 0);
ok(r.ok && r.cells.every(c => c[2] === 1), 'drops onto the flat below');
r = drop(site, [a], oriented('studio', 0), 2, 0);
ok(r.ok && r.cells.some(c => c[0] === 3 && c[2] === 1), 'one cell on the flat holds the whole studio up');
ok(!drop(site, [], oriented('flat', 0), 2, 0).ok && drop(site, [], oriented('flat', 0), 2, 0).why === 'site', 'outside the site');
ok(drop({ ...site, cores: [[1, 1]] }, [], oriented('flat', 0), 0, 1).why === 'core', 'a core is in the way');
ok(drop({ ...site, rows: [1, 4, 4] }, [a], oriented('studio', 0), 0, 0).why === 'limit', 'the setback limits the height');

// support and overhang
const over = mod('b', 'flat', [[2, 0, 1], [3, 0, 1], [4, 0, 1]]);
const wide = { W: 5, D: 3, H: 4 };
let ev = evaluate(wide, [a, over], { support: 1 });
ok(!ev.ok && ev.fails.get('b')[0].rule === 'support', 'an overhang of two fails a limit of one');
ok(evaluate(wide, [a, over], { support: 2 }).ok, 'and passes a limit of two');
ok(!evaluate(wide, [mod('c', 'cell', [[0, 0, 2]])], {}).ok, 'a floating module fails');

// daylight: a window looks out over open ground to the edge of the site
const box = { W: 3, D: 3, H: 2 };
const ring = [];
for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) ring.push(mod('r' + x + y, 'cell', [[x, y, 0]]));
const mid = mod('mid', 'cell', [[1, 1, 0]]);
ev = evaluate(box, [...ring, mid], { daylight: 'any' });
ok(ev.fails.get('mid')?.[0].rule === 'daylight', 'a module walled in on four sides is dark');
ok(ev.fails.get('mid')[0].by.length === 4, 'and knows who blocks it');
ok(!ev.fails.has('r00'), 'the ring is lit from outside');
ev = evaluate(box, [mod('n', 'cell', [[1, 2, 0]]), mod('s', 'cell', [[1, 0, 0]])], { daylight: 'south' });
ok(ev.fails.has('n') && !ev.fails.has('s'), 'south light: the back module is shaded by the front one');

// terrace: roof cells open to the sky
ev = evaluate(site, [a, mod('t', 'flat', [[0, 0, 1], [1, 0, 1], [2, 0, 1]])], { terrace: 1 });
ok(ev.fails.get('a')?.[0].rule === 'terrace' && !ev.fails.has('t'), 'a module built over loses its garden');
ok(ev.score.terrace === 3, 'the garden score counts open roof cells');

// access: a core beside it, or the street at ground level
const cs = { W: 4, D: 3, H: 4, cores: [[1, 2]], street: true };
ok(evaluate(cs, [mod('g', 'cell', [[3, 0, 0]])], { access: true }).ok, 'on the street at ground level');
ok(!evaluate(cs, [mod('h', 'cell', [[3, 2, 0]])], { access: true }).ok, 'away from the street and the core');
ok(evaluate(cs, [mod('h', 'cell', [[2, 2, 0]])], { access: true }).ok, 'beside the core');

// drawings
const d = matchDrawings([a], { plan: new Set(['0,0', '1,0', '2,0']), front: new Set(['0,0', '1,0', '2,0']) });
ok(d.plan && d.front, 'a flat matches its own drawings');

// tiling: a 3x3x3 cube from tetracubes, built from the bottom up
const cube = massCells([[3, 3, 3], [3, 3, 3], [3, 3, 3]]);
const t = tile(seededRng('cube'), cube, ['corner', 'family', 'tee', 'step', 'tripod', 'twist']);
ok(t && t.reduce((s, m) => s + m.cells.length, 0) === 27, 'the cube is tiled');
ok(t && new Set(t.flatMap(m => m.cells.map(c => K(...c)))).size === 27, 'without overlaps');
ok(t && buildOrder(t), 'in an order that drops');
// replaying the order by drops lands every module where it belongs
if (t) {
  const placed = [];
  let same = true;
  for (const m of t) {
    const cells = oriented(m.type, m.o), an = cells[0];
    const q = m.cells.slice().sort((p, q) => p[2] - q[2] || p[1] - q[1] || p[0] - q[0])[0];
    const rr = drop({ W: 3, D: 3, H: 3 }, placed, cells, q[0], q[1]);
    same &&= rr.ok && JSON.stringify(rr.cells.map(c => K(...c)).sort()) === JSON.stringify(m.cells.map(c => K(...c)).sort());
    placed.push({ ...m, cells: rr.cells });
    void an;
  }
  ok(same, 'dropping in that order rebuilds the cube');
}

// every level: generated, solvable, and its solution keeps its rules
const ids = new Set();
for (const pk of PACKS) {
  ok(pk.levels.length === 8, pk.id + ' has 8 levels');
  for (const l of pk.levels) {
    ok(!ids.has(l.id), l.id + ' is unique'); ids.add(l.id);
    const lv = levelFrom(l, i => seededRng('stack:' + l.id + ':' + i));
    ok(!!lv, l.id + ' generates');
    if (!lv) continue;
    const sol = evaluate(lv.site, lv.solution, lv.rules);
    if (lv.task === 'fill') {
      const want = new Set(lv.target.map(c => K(...c))), got = lv.solution.flatMap(m => m.cells.map(c => K(...c)));
      ok(got.length === want.size && got.every(k => want.has(k)), l.id + ' the solution fills the massing');
      ok(lv.tray.length === lv.solution.length, l.id + ' the tray holds the solution');
    } else {
      ok(sol.ok, l.id + ' the solution keeps every rule');
      ok(lv.solution.every(m => m.cells.every(c => c[0] >= 0 && c[1] >= 0 && c[0] < lv.site.W && c[1] < lv.site.D && c[2] < lv.site.H)), l.id + ' inside the site');
    }
    if (lv.task === 'match') ok(matchDrawings(lv.solution, lv.drawings).plan, l.id + ' the drawings come from the solution');
    if (lv.task === 'fix') {
      ok(!evaluate(lv.site, lv.start, lv.rules).ok, l.id + ' starts broken');
      ok(lv.start.filter((m, i) => JSON.stringify(m.cells) !== JSON.stringify(lv.solution[i].cells)).length === 1, l.id + ' one module moved');
    }
    if (lv.task === 'optimise') ok(sol.score[lv.goal.kind] >= lv.goal.value && lv.goal.value > 0, l.id + ' the goal is reachable');
  }
}
ok(PACKS.length === 6, 'six packs');

console.log(fails ? `${fails} of ${n} failed` : `all ${n} checks pass`);
process.exit(fails ? 1 : 0);
