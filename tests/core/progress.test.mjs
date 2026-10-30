// node tests/core/progress.test.mjs — which sheet comes next
import { levelAfter, nextLevel } from '../../src/ui/progress.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const packs = [{ id: 'A', levels: [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }] }, { id: 'B', levels: [{ id: 'B1' }, { id: 'B2' }] }];
const p = { levels: { B1: { marks: [true, false, false], best: 30 } } };

// a level picked from the map leads on to the one after it, not back to the first unsolved
ok(nextLevel(p, packs).id === 'A1', 'the first unsolved is A1');
ok(levelAfter(p, packs, 'B1').id === 'B2', 'after B1 comes B2');
ok(levelAfter(p, packs, 'A2').id === 'A3', 'after A2 comes A3');
ok(levelAfter(p, packs, 'A3').id === 'B1', 'after the last of a pack, the first of the next');
// past the very last level: back to what is still unsolved
ok(levelAfter(p, packs, 'B2').id === 'A1', 'after the last level, the first unsolved');
const all = { levels: Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2'].map(id => [id, { marks: [true, false, false], best: 30 }])) };
ok(levelAfter(all, packs, 'B2') === null, 'after the last level with everything drawn, nothing');

console.log(fails ? fails + ' failures' : 'progress: all pass');
process.exit(fails ? 1 : 0);
