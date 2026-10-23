// node tests/core/views.test.mjs — Drawing Set: views, drawings and levels
import { viewOf, stepsAny } from '../../src/core/views.js';
import { DRAW_FORMS, drawForm } from '../../src/core/drawforms.js';
import { compareDrawing, mistake, levelSheet, answerSteps, hiddenForComplete, signature } from '../../src/core/drawtasks.js';
import { FORMS } from '../../src/core/forms.js';
import { seededRng } from '../../src/core/rand.js';
import { PACKS } from '../../games/drawing/levels.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const seen = (v, kind = 'seen') => v.lines.filter(l => l.kind === kind);
const has = (v, a, b, kind = 'seen') => stepsAny(a, b).every(k => v.steps.get(k) === kind);

// the basics: a cube is a square from every side
for (const side of ['front', 'right', 'top']) ok(seen(viewOf([FORMS.cube.make()], side)).length === 4, 'cube ' + side + ': four lines');
// the gable house: a pentagon in front, the eave line across the side, the ridge from above
const gable = [FORMS.gable.make()];
ok(seen(viewOf(gable, 'front')).length === 5, 'gable front is a pentagon');
ok(has(viewOf(gable, 'right'), [0, 3], [6, 3]), 'gable side: the eave line runs across');
ok(has(viewOf(gable, 'top'), [2, 0], [2, 6]), 'gable top: the ridge runs down the middle');
// a wall that steps back draws a line; an inside corner round the back is hidden
const ellp = [FORMS['ell-prism'].make()];
ok(has(viewOf(ellp, 'right'), [2, 0], [2, 2]), 'L block side: the step back is a line');
ok(has(viewOf(ellp, 'front'), [2, 0], [2, 2], 'hidden'), 'L block front: the inside corner is hidden');
// a step seen from the side hides its lower tread
ok(has(viewOf([FORMS.step.make()], 'right'), [0, 2], [2, 2], 'hidden'), 'step side: the lower tread is hidden');

// solids that run into each other: the valleys of a cross gable, and no seams where faces are flush
const cross = drawForm('cross-house');
const ct = viewOf(cross, 'top');
ok(has(ct, [2, 2], [4, 4]) && has(ct, [6, 2], [4, 4]), 'cross gable top: two valleys');
ok(!ct.lines.some(l => l.kind === 'hidden'), 'cross gable top: no seams on the ground show as hidden lines');
const cf = viewOf(cross, 'front');
ok(has(cf, [2, 2], [6, 2], 'hidden'), 'cross gable front: the main eave behind the wing is hidden');
const tower = viewOf(drawForm('tower-house'), 'front');
ok(!stepsAny([8, 0], [8, 2]).some(k => tower.steps.has(k)), 'tower house: no line where the walls are flush');
const ch = viewOf(drawForm('chimney-house'), 'front');
ok(has(ch, [5, 3], [6, 3], 'hidden'), 'chimney: where it meets the back slope is hidden from the front');

// every building has a closed set of views on the lattice
for (const [key, f] of Object.entries(DRAW_FORMS)) {
  const s = f.make();
  for (const side of ['front', 'right', 'top']) {
    const v = viewOf(s, side);
    ok(seen(v).length >= 3, `${key} ${side}: has an outline`);
  }
}

// comparing drawings
const gv = viewOf(gable, 'front');
const ans = answerSteps(gv);
ok(compareDrawing(ans, ans).ok, 'a drawing matches itself');
const less = new Map(ans); less.delete([...less.keys()][0]);
const r1 = compareDrawing(less, ans);
ok(!r1.ok && r1.missingLines.length === 1, 'a missing step is one missing line');
const more = new Map(ans); for (const k of stepsAny([0, 1], [4, 1])) more.set(k, 'seen');
const r2 = compareDrawing(more, ans);
ok(!r2.ok && r2.extraLines.length === 1 && !r2.missing.length, 'an extra line is found');
// strokes split or joined make the same drawing
const split = new Map([...stepsAny([0, 0], [2, 0]), ...stepsAny([2, 0], [4, 0])].map(k => [k, 'seen']));
const whole = new Map(stepsAny([0, 0], [4, 0]).map(k => [k, 'seen']));
ok(signature(split) === signature(whole), 'two strokes or one: the same line');
ok(stepsAny([0, 0], [6, 3]).length === 3, 'a sloping line steps through the lattice points on it');

// every level: on the lattice, fits a phone sheet, and its task can be set
const SPAN = 18;
for (const pk of PACKS) {
  ok(pk.levels.length >= 6 && pk.levels.length <= 8, pk.id + ': 6 to 8 levels');
  for (const l of pk.levels) {
    ok(DRAW_FORMS[l.form], l.id + ': form exists');
    ok(l.learn, l.id + ': has a learn line');
    const sh = levelSheet(l);
    for (const [v, s] of Object.entries(sh.views)) ok(!s.raw.offLattice.length, `${l.id} ${v}: every line ends on a lattice point`);
    ok(sh.bounds.x1 - sh.bounds.x0 <= SPAN && sh.bounds.y1 - sh.bounds.y0 <= SPAN, `${l.id}: the sheet fits (${sh.bounds.x1 - sh.bounds.x0} x ${sh.bounds.y1 - sh.bounds.y0})`);
    const t = sh.views[l.view];
    const hid = { hidden: !!l.hidden };
    if (l.hidden) ok(t.raw.lines.some(x => x.kind === 'hidden'), l.id + ': a hidden-line sheet has a hidden line to draw');
    if (l.task === 'complete') {
      const gone = hiddenForComplete(t, seededRng('complete:' + l.id + ':'), l.missing, hid);
      ok(gone.length === l.missing, l.id + ': lines to complete');
      if (l.hidden) ok(gone[0].kind === 'hidden', l.id + ': the line to add is the dashed one');
    }
    if (l.task === 'error') {
      const m = mistake(t, seededRng('error:' + l.id + ':'), { kinds: l.kinds, n: l.errors, ...hid });
      ok(m, l.id + ': a drawing with mistakes can be made');
      if (m) ok(!compareDrawing(m.steps, answerSteps(t, hid)).ok, l.id + ': the mistakes are real');
    }
    if (l.task === 'which') {
      const sigs = [l.form, ...l.options].map(k => signature(answerSteps(viewOf(drawForm(k), l.view), hid)));
      ok(new Set(sigs).size === sigs.length, l.id + ': the four drawings differ');
      const boxes = [l.form, ...l.options].map(k => { const b = viewOf(drawForm(k), l.view).box; return (b.x1 - b.x0) + 'x' + (b.y1 - b.y0); });
      ok(new Set(boxes).size === 1, l.id + ': the four outlines match');
    }
    if (l.task === 'third') ok(l.given.length === 2 && !l.given.includes(l.view), l.id + ': two other views given');
    if (l.task !== 'which') ok(seen(t.raw).length >= 3, l.id + ': the answer has lines');
  }
}

console.log(fails ? fails + ' failures' : 'views: all pass');
process.exit(fails ? 1 : 0);
