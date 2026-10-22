// node tests/core/rooftasks.test.mjs — Roof Plans puzzles and level data
import { goodFootprint, neighbours, mutate, compareSteps, stepsOfLines, planLines, meets, roofStats, descent, holes } from '../../src/core/rooftasks.js';
import { roofOf, footprintFrom } from '../../src/core/roof.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS } from '../../games/roof/levels.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

for (const pk of PACKS) for (const l of pk.levels) {
  if (!l.rows) { ok(l.brief && l.size, l.id + ' brief'); continue; }
  const { cells } = footprintFrom(l.rows);
  ok(goodFootprint(cells), l.id + ' good footprint');
  const roof = roofOf(cells);
  ok(!roof.problems.length, l.id + ' roof problems ' + roof.problems);
  const rng = seededRng(l.id);
  if (l.task === 'which') ok(neighbours(cells, rng, 2).length === 2, l.id + ' two neighbours');
  if (l.task === 'error') {
    const m = mutate(roof, rng, l.errors);
    ok(m.lines.filter(x => x.wrong).length === l.errors, l.id + ' errors ' + m.lines.filter(x => x.wrong).length);
  }
  ok(compareSteps(roof, stepsOfLines(planLines(roof))).ok, l.id + ' own plan compares equal');
}

// briefs can be met: a few known answers
const fp = rows => footprintFrom(rows).cells;
ok(meets(fp(['##...', '##...', '#####', '#####']), { valleys: 1 }).every(m => m.ok), 'L has one valley');
ok(meets(fp(['####', '#..#', '#..#', '####']), { courtyard: true, maxModules: 24 }).every(m => m.ok), 'courtyard brief');
ok(roofStats(fp(['####', '####', '####', '####'])).height === 2, '4x4 roof is 2 high');
ok(meets(fp(['##..##', '##..##', '######', '######']), { valleys: 2, ridges: 1, maxModules: 20 }).every(m => m.ok), 'U meets two valleys one ridge');
ok(holes(fp(['###', '#.#', '###'])) === 1, 'ring has a hole');

// rain runs downhill and out to the eave
const roof = roofOf(fp(['####', '####']));
let p = [3, 1.2], steps = 0;
while (roof.height(...p) > 1e-3 && steps++ < 500) { const d = descent(roof, ...p); if (!d) { p = [p[0] + .01, p[1] + .013]; continue; } p = [p[0] + d[0] * .02, p[1] + d[1] * .02]; }
ok(steps < 500, 'a drop reaches the eave');

console.log(fails ? fails + ' failed' : 'rooftasks: all passed');
process.exit(fails ? 1 : 0);
