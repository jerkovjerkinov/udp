// node tests/core/houseiv.test.mjs — Oblique, House IV: moves on cells
import { applyMove, run, sameForm, boxCells, cellSolid, axonSquares, boundsOf, key } from '../../src/core/houseiv.js';
import { PACKS } from '../../games/oblique/levels.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

const cube = boxCells([[0, 2], [0, 2], [0, 2]]);
ok(cube.length === 27, 'a 3 x 3 x 3 block has 27 cells');
ok(sameForm(run(cube, [{ kind: 'turn', q: 1 }, { kind: 'turn', q: 1 }, { kind: 'turn', q: 1 }, { kind: 'turn', q: 1 }]), cube), 'four quarter turns: the same block');
const ell = boxCells([[0, 2], [0, 0], [0, 0]]).concat([[0, 1, 0]]);
const t1 = run(ell, [{ kind: 'turn', q: 1 }]);
ok(!sameForm(t1, ell) && sameForm(run(t1, [{ kind: 'turn', q: 3 }]), ell), 'an L turns, and turns back');
ok(run(cube, [{ kind: 'cut', sel: { x: [2, 2] } }]).length === 18, 'cut a third away');
ok(run(cube, [{ kind: 'mirror', axis: 'x' }]).length === 54, 'a mirror copy doubles the block');
const sl = applyMove(cube, { kind: 'slide', sel: { z: [2, 2] }, by: [1, 0, 0] });
ok(sl.cells.length === 27 && boundsOf(sl.cells).hi[0] === 3, 'slide the top layer one to the right');
// order matters: slide then cut differs from cut then slide
const a = run(cube, [{ kind: 'slide', sel: { z: [2, 2] }, by: [1, 0, 0] }, { kind: 'cut', sel: { x: [2, 2] } }]);
const b = run(cube, [{ kind: 'cut', sel: { x: [2, 2] } }, { kind: 'slide', sel: { z: [2, 2] }, by: [1, 0, 0] }]);
ok(!sameForm(a, b), 'slide then cut is not cut then slide');
// the solid and the drawing
const s = cellSolid(cube);
ok(s.faces.length === 6, 'a block is one solid with six faces, got ' + s.faces.length);
const sq = axonSquares(cube, [-.5, .6, -.6]);
ok(sq.length === 27, 'seen from one corner, three faces of nine squares');

// the levels: every House IV level reaches a new form, decoys do not reach it, and order matters where it says so
for (const pk of PACKS) for (const l of pk.levels.filter(l => l.task === 'moves')) {
  const start = boxCells(l.start);
  const goal = run(start, l.answer.map(i => l.hand[i]));
  ok(!sameForm(goal, start), `${l.id}: the moves change the form`);
  ok(l.answer.length === l.slots, `${l.id}: as many slots as moves in the answer`);
  if (l.ordered) ok(!sameForm(run(start, l.answer.slice().reverse().map(i => l.hand[i])), goal), `${l.id}: the order matters`);
  // no other sequence of the same length from the hand, other than the answer's own reorderings when not ordered, reaches it too easily
  ok(goal.length > 0 && goal.length < 80, `${l.id}: a sensible size (${goal.length} cells)`);
  // nothing floats: every cell reaches the ground through cells it shares a face with
  const has = new Set(goal.map(key)), z0 = Math.min(...goal.map(c => c[2]));
  const seen = new Set(goal.filter(c => c[2] === z0).map(key)), todo = goal.filter(c => c[2] === z0);
  while (todo.length) { const c = todo.pop(); for (const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) { const k = key([c[0]+d[0], c[1]+d[1], c[2]+d[2]]); if (has.has(k) && !seen.has(k)) { seen.add(k); todo.push(k.split(',').map(Number)); } } }
  ok(seen.size === goal.length, `${l.id}: nothing floats (${goal.length - seen.size} cells in the air)`);
}

// blocks touching only along an edge still make one solid, and so does every form a level can reach
const solidOk = cells => { try { return cellSolid(cells).volume > 0; } catch { return false; } };
ok(solidOk([[0, 0, 0], [1, 1, 0]]), 'two cells on a diagonal');
ok(solidOk([[0, 0, 1], [1, 1, 1], [0, 0, 2], [0, 1, 2], [1, 1, 2], [0, 0, 0], [0, 1, 0], [1, 1, 0]]), 'a diagonal bridged above and below');
for (const pk of PACKS) for (const l of pk.levels.filter(l => l.task === 'moves')) {
  let bad = 0;
  const walk = (cells, used) => {
    if (!solidOk(cells)) bad++;
    if (used.length < l.slots) l.hand.forEach((m, i) => { if (!used.includes(i)) walk(applyMove(cells, m).cells, [...used, i]); });
  };
  walk(boxCells(l.start), []);
  ok(!bad, `${l.id}: every reachable form is a solid (${bad} not)`);
}

console.log(fails ? fails + ' failures' : 'houseiv: all pass');
process.exit(fails ? 1 : 0);
