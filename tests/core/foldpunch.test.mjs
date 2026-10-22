// node tests/core/foldpunch.test.mjs — Fold & Punch questions and level data
import { holesQuestion, shapeQuestion, cutQuestion, reverseTarget, piecesOf, subtract, intersect, area, holesOf, shapeAt, replay, shapeSignature, punchCells, flatSheet, fold, line, everyFoldCounts } from '../../src/core/foldpunch.js';
import { foldsUsed, facetsAt, allFolds } from '../../src/core/paper.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS } from '../../games/fold/levels.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

// convex helpers
const sq = [[0, 0], [2, 0], [2, 2], [0, 2]];
ok(Math.abs(area(intersect(sq, [[1, 1], [3, 1], [3, 3], [1, 3]])) - 1) < 1e-9, 'intersect squares');
ok(Math.abs(subtract(sq, [[1, 1], [3, 1], [3, 3], [1, 3]]).reduce((s, p) => s + area(p), 0) - 3) < 1e-9, 'subtract squares');
ok(Math.abs(piecesOf([[0, 0], [4, 0], [4, 4], [0, 4]], [shapeAt('round', [1.5, 1.5])[0]]).reduce((s, p) => s + area(p), 0) - (16 - area(shapeAt('round', [0, 0])[0]))) < 1e-9, 'a punched sheet keeps the rest');

// one fold in half, an L punched: the twin is mirrored
const st = fold(flatSheet(4), line([2, 0], [0, 1]), 1).sheet;
const holes = holesOf(st, shapeAt('ell', [2.5, 1.5]));
ok(holes.length === 4, 'fold in half: two holes of two parts each');
const right = holes.filter(h => h[0][0] > 2), left = holes.filter(h => h[0][0] < 2);
ok(shapeSignature(left) === shapeSignature(right.map(h => h.map(([x, y]) => [4 - x, y]))), 'the twin is a mirror image');

for (const pk of PACKS) for (const l of pk.levels) {
  const rng = seededRng('fold:' + l.id);
  const o = { n: l.n, folds: l.folds, diagonals: !!l.diagonals, punches: l.punches || 1, shape: l.shape };
  const q = l.task === 'holes' ? holesQuestion(rng, o) : l.task === 'mirror' ? shapeQuestion(rng, o) : l.task === 'cut' ? cutQuestion(rng, o) : reverseTarget(rng, o);
  ok(!!q, l.id + ' generates');
  if (!q) continue;
  if (q.options) {
    ok(q.options.length === 4 && q.options.filter(x => x.ok).length === 1, l.id + ' four options, one right');
    ok(new Set(q.options.map(x => shapeSignature(x.holes))).size === 4, l.id + ' options differ');
  }
  // no fold is wasted: the punches (or the cut) go through both sides of every crease
  const fin = (q.states || q.solution.states).at(-1), pun = q.solution ? q.solution.punches : q.punches;
  const counts = q.parts && l.task !== 'holes' ? everyFoldCounts(fin, q.parts) : pun.reduce((m, p) => m | foldsUsed(facetsAt(fin, p)), 0) === allFolds(fin);
  ok(counts && fin.folds === l.folds, l.id + ' every fold counts');
  if (l.task === 'holes') ok(q.holes.length >= 2, l.id + ' at least two holes');
  if (l.task === 'reverse') {
    // the stored solution makes the target
    const s = q.solution, last = s.states[s.states.length - 1];
    const cells = new Set(s.punches.flatMap(p => punchCells(last, p)));
    ok([...cells].sort().join() === [...q.holes].sort().join(), l.id + ' solution makes the target');
  }
}

console.log(fails ? fails + ' failed' : 'foldpunch: all passed');
process.exit(fails ? 1 : 0);
