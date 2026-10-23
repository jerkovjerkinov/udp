// Developments: solids and their nets.
//
// Four tasks share one plaster model on the table:
//   cut    Cut it open. Click edges to cut them; faces that hang on one path
//          of hinges swing open as you go; when the cuts make a net, Unfold
//          lays it on the table, or jams where two faces land on each other.
//   match  Match the edge. A net lies on the table; for each numbered cut edge,
//          click the edge it glues back to. Three in a row, then it folds up.
//   which  Which solid? A net and four solids; pick the one it folds into.
//   fold   Will it fold? Three nets, some with one face hung on the wrong
//          edge. Say whether it folds; if not, point at a face that collides.

import '../../src/ui/theme.js';
import { createStage } from '../../src/stage/stage.js';
import { createSolidView } from '../../src/stage/solids.js';
import { createPicker, createHover } from '../../src/stage/pick.js';
import { createLabels } from '../../src/stage/labels.js';
import { createLines } from '../../src/stage/lines.js';
import { createBoard } from '../../src/stage/board.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { animate, ease, wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { FORMS, formsOfPack } from '../../src/core/forms.js';
import { unfold, mapSolid, randomUnfolding } from '../../src/core/poly.js';
import { opening, matchEdges, misfit, misfitPose, distractors, baseFace, sheetFit, tableNet } from '../../src/core/nettasks.js';
import { keptFaces, keptWhole, lineStep, lineEnds, verdict, solutions, drawRounds, mended } from '../../src/core/netrules.js';
import { seededRng, pick, randInt, shuffle } from '../../src/core/rand.js';
import { PACKS } from './levels.js';

const stage = createStage(document.getElementById('stage'));
const frame = createFrame({ game: 'developments', name: 'Developments', stage });
const red = createRedlines(stage);
const labels = createLabels(stage);
const picker = createPicker(stage);

// ------------------------------------------------------------------
// small helpers
// ------------------------------------------------------------------

const TITLES = { cut: 'Can you open it flat?', match: 'Where does it glue?', which: 'Which solid is it?', fold: 'Will it fold?', draw: 'Where does it go on the sheet?', fix: 'Can you mend the net?' };
const TASK_TAGS = { cut: 'cut open', match: 'match edges', which: 'which solid', fold: 'will it fold', draw: 'draw on the net', fix: 'mend the net' };
// a cut level's title follows the rule that makes it hard
const cutTitle = it => it.line ? 'Can you open it in one cut?' : it.keep === 'walls' ? 'Can you keep the walls together?' : it.keep === 'roof' ? 'Can you keep the roof in one piece?' : it.paper ? 'Will it fit on the sheet?' : TITLES.cut;
const ruleTag = it => it.line ? ' · one cut' : it.keep ? ` · ${it.keep} whole` : it.paper ? ' · sheet' : '';
const lerp3 = (a, b, v) => [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v, a[2] + (b[2] - a[2]) * v];
const close = (A, B) => A.every((p, i) => Math.abs(p[0] - B[i][0]) + Math.abs(p[1] - B[i][1]) + Math.abs(p[2] - B[i][2]) < 1e-4);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// a world point as a client point that follows the camera (for redlines)
const at = p => () => {
  const P = typeof p === 'function' ? p() : p;
  const [x, y, z] = stage.project(P);
  if (z > 1) return null;
  const r = stage.canvas.getBoundingClientRect();
  return [x + r.left, y + r.top];
};

function addView(solid, opts = {}) {
  const view = createSolidView(solid, { invalidate: stage.invalidate, ...opts });
  stage.content.add(view.group);
  return view;
}

// flat paper lifts a little out of the shadow; a folded solid does not
function lift(view, to, duration = 600) {
  const from = view._lift ?? 0;
  view._lift = to;
  return animate({ duration, essential: true, update: v => view.setLift(from + (to - from) * v) }).promise;
}

// play a pose function from t0 to t1
function play(view, pose, t0, t1, { duration = 900, easing = ease.cubicInOut } = {}) {
  return animate({ from: t0, to: t1, duration, ease: easing, essential: true,
    update: v => { view.setFacePolys(pose(v)); stage.invalidate(); } }).promise;
}

// the par time in seconds: a little over what a careful first attempt takes
function parOf(task, solid) {
  const F = solid.faces.length, need = solid.edges.length - F + 1;
  const p = task === 'cut' ? 20 + need * 5 : task === 'match' ? 30 + F * 3 : task === 'which' ? 25 + F * 2 : task === 'draw' ? 30 + F * 3 : task === 'fix' ? 25 + F * 2 : 45 + F * 2;
  return Math.round(p / 5) * 5;
}

// ------------------------------------------------------------------
// the levels, with names and par times filled in
// ------------------------------------------------------------------

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, name: FORMS[l.form].name, label: `${FORMS[l.form].name} · ${TASK_TAGS[l.task]}${l.task === 'cut' ? ruleTag(l) : ''}`,
    note: l.learn || FORMS[l.form].note, par: parOf(l.task, FORMS[l.form].make()) + (l.line || l.keep ? 20 : 0) })),
}));

// ------------------------------------------------------------------
// task: cut it open
// ------------------------------------------------------------------

function cutTask(item, solid, { workshop = false } = {}) {
  const view = addView(solid);
  const base = baseFace(solid);
  const F = solid.faces.length, need = solid.edges.length - F + 1;
  const folded = solid.faces.map(f => f.loop.map(i => solid.verts[i]));
  const paper = item.paper || null;
  const rules = { paper, line: !!item.line, keep: item.keep || null };
  const kept = keptFaces(solid, rules.keep);
  let cuts = [], st = opening(solid, [], base), shownT = 1;
  let plan = null, marked = null, motion = null, busy = false, laidFlat = false;

  const restT = s => s.state === 'flat' || s.state === 'jammed' ? .94 : s.state === 'opening' ? .04 : 1;

  function styles() {
    view.setEdgeStyles(solid.edges.map(e => cuts.includes(e.id) ? 'signal' : marked?.has(e.id) ? 'signalFold' : e.flat ? 'guide' : 'visible'));
    for (const f of kept) view.setFaceState(f, 'marked');
    stage.invalidate();
  }

  // move from what is shown to the rest pose of the new state, each face the natural way
  function moveTo(prev, prevT, next, nextT) {
    motion?.cancel();
    const from = solid.faces.map(f => view.facePoly(f.id).map(p => p.slice()));
    const target = next.pose(nextT).map(q => q.pts);
    const how = solid.faces.map(f => {
      const i = f.id;
      if (close(from[i], target[i])) return 'stay';
      if (close(from[i], folded[i])) return 'open';
      if (close(target[i], folded[i]) && prev) return 'shut';
      return 'lerp';
    });
    motion = animate({ duration: 640, ease: ease.backOut, essential: true, update: v => {
      const pn = how.includes('open') ? next.pose(1 + (nextT - 1) * v) : null;
      const pp = how.includes('shut') ? prev.pose(prevT + (1 - prevT) * v) : null;
      view.setFacePolys(how.map((h, i) => h === 'stay' ? target[i] : h === 'open' ? pn[i].pts : h === 'shut' ? pp[i].pts
        : from[i].map((p, k) => lerp3(p, target[i][k], Math.min(1, v)))));
      stage.invalidate();
    } });
    return motion.promise;
  }

  function refresh() {
    styles();
    const flat = st.state === 'flat' || st.state === 'jammed';
    if (workshop) {
      frame.sub(`Cut any edges you like and see how the form opens out.${flat ? ' It can lie flat now, so try unfolding it.' : ''}<span class="udp-count">${cuts.length} / ${need} cuts</span>`, true);
      frame.primary({ label: laidFlat ? 'Fold up' : 'Unfold', run: toggleFlat, disabled: !flat, ready: flat });
    } else {
      const left = Math.max(0, need - cuts.length);
      frame.sub(`${cutSay()}<span class="udp-count"><em>${cuts.length}</em> / ${need} cuts${left ? '' : ' · ready to unfold'}</span>`, true);
      frame.primary({ label: 'Unfold', run: () => session.check(), disabled: !flat, ready: flat });
    }
    frame.tool('undo', { off: !cuts.length });
    drawCard();
  }

  // what the sub says: the goal and the level's one rule, the action only at the start
  function cutSay() {
    if (item.say) return item.say;
    const rule = rules.line ? 'This time the scissors never leave the paper: every cut carries on from an end of the last one.'
      : rules.keep === 'walls' ? 'The walls are shaded. Keep them joined to each other, so they unroll as one strip, like an elevation drawing.'
      : rules.keep === 'roof' ? 'The roof is shaded. Keep its faces joined, so the roof comes out of the sheet in one piece.'
      : paper ? `Open it out flat so that the net fits on a ${paper[0]} × ${paper[1]} sheet. The card on the side shows the sheet.` : '';
    if (rule) return rule;
    return cuts.length ? 'Keep cutting until the form opens out flat, still in one piece.' : 'Tap an edge to cut along it. With enough cuts, the form opens out flat in one piece.';
  }

  function setCuts(next) {
    const prev = st, prevT = shownT;
    cuts = next;
    st = opening(solid, cuts, base);
    shownT = restT(st);
    laidFlat = false;
    if (marked) marked = new Set([...marked].filter(e => !cuts.includes(e)));
    refresh();
    moveTo(prev, prevT, st, shownT).then(() => { if (!busy) keepInView(); });
  }

  // after a cut opens or shuts the faces: refit only when the model leaves the free rect or shrinks far inside it
  function keepInView() {
    const r = stage.rect, pts = [];
    for (const f of solid.faces) for (const q of view.facePoly(f.id)) pts.push(stage.project(q));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const out = x0 < r.x + 4 || y0 < r.y + 4 || x1 > r.x + r.w - 4 || y1 > r.y + r.h - 4;
    const small = (x1 - x0) < r.w * .4 && (y1 - y0) < r.h * .4;
    if (out || small) stage.frame(view.group, { padding: 48, duration: 600 });
  }

  function toggle(eid) {
    if (busy) return;
    red.clear();
    if (cuts.includes(eid)) {
      if (rules.line && !lineEnds(solid, cuts).includes(eid)) {
        view.setEdgeStyle(eid, 'signalFold');
        session.miss({ note: 'That cut is in the middle of your line. You can take back a cut only from one of its two ends.', strike: false, label: 'Not that one' });
        setTimeout(styles, 700);
        return;
      }
      setCuts(cuts.filter(e => e !== eid)); sfx.tick(); return;
    }
    const next = [...cuts, eid];
    const why = rules.line ? lineStep(solid, cuts, eid) : null;
    if (why) {
      view.setEdgeStyle(eid, 'signalFold');
      setTimeout(styles, 700);
      session.miss({ note: why === 'branch' ? 'That would start a second line from the middle of the first. Carry on from one of the two ends instead.'
        : why === 'jump' ? 'The scissors can’t jump there. Your next cut has to start where the line ends.'
        : 'That would close the line into a loop and cut a piece right out.', strike: true, label: 'Not that one' });
      return;
    }
    if (kept.length && !keptWhole(solid, kept, next)) {
      view.setEdgeStyle(eid, 'signalFold');
      view.flashFaces(kept, { times: 1, period: 420 }).then(() => styles());
      session.miss({ note: rules.keep === 'walls' ? 'That edge holds the walls together. With it cut, the elevation would come apart in two strips.' : 'That edge holds the roof together. With it cut, the roof would come out in two pieces.', strike: true, label: 'Not that one' });
      return;
    }
    const o = opening(solid, next, base);
    if (o.state === 'apart') {
      // refused: the piece that would come away flashes
      const keep = o.pieces[base];
      const off = solid.faces.map(f => f.id).filter(f => o.pieces[f] !== keep);
      view.setEdgeStyle(eid, 'signalFold');
      view.flashFaces(off, { times: 2, period: 300 }).then(() => styles());
      session.miss({ note: 'That cut would set a face loose. Every face has to stay joined to the rest along at least one edge.', strike: true, label: 'Not that one' });
      return;
    }
    sfx.snip();
    setCuts(next);
  }

  // a good net that keeps every rule and the cuts made so far, for hints
  function findPlan() {
    if (plan && cuts.every(c => plan.cuts.includes(c))) return plan;
    const rng = seededRng('plan:' + cuts.join(','));
    let found = solutions(solid, rules, { rng, within: cuts, limit: 1 })[0];
    // tight sheets: the unfolding search finds the rare nets that fit
    for (let t = 0; !found && !rules.line && t < 200; t++) {
      const net = randomUnfolding(solid, seededRng('plan:' + t), { root: base, tries: 20, pick: 'any' });
      if (!net || net.hinges.some(h => cuts.includes(h))) continue;
      const c = solid.edges.map(e => e.id).filter(id => !net.hinges.includes(id));
      if (!verdict(solid, c, rules, base)) found = c;
    }
    plan = found ? { cuts: found } : null;
    return plan;
  }

  async function toggleFlat() {
    if (busy || !(st.state === 'flat' || st.state === 'jammed')) return;
    busy = true;
    if (!laidFlat) { sfx.flap(); lift(view, .5, 1300); await play(view, st.pose, shownT, 0, { duration: 1300 }); shownT = 0; laidFlat = true; stage.frame(view.group, { padding: 48 }); }
    else { sfx.flap(); lift(view, 0, 1300); await play(view, st.pose, 0, 1, { duration: 1300 }); shownT = 1; laidFlat = false; stage.frame(view.group, { padding: 48 }); }
    busy = false;
    refresh();
  }

  // ------------------------------------------------------------------
  // the card: the net as it will lie, and the sheet it must fit
  // ------------------------------------------------------------------

  let board = null;
  function drawCard() {
    const net = st.net;
    if (!paper && !net) { frame.card(false); board?.dispose(); board = null; return; }
    const fit = net && paper ? sheetFit(net, ...paper) : null;
    const body = frame.card(true, paper ? 'Sheet' : 'Net', paper ? `${paper[0]} × ${paper[1]}${fit ? (fit.fits ? ' · fits' : ' · too big') : ''}` : `${F} faces`);
    if (!board) { body.replaceChildren(); board = createBoard(body, { grid: 'none', padding: 14 }); }
    board.clear();
    let polys = net ? net.flat : null;
    if (polys && fit) {
      const c = Math.cos(-fit.angle), s = Math.sin(-fit.angle);
      polys = polys.map(P => P.map(([x, y]) => [x * c - y * s, x * s + y * c]));
      const all = polys.flat();
      let x0 = Math.min(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1]));
      const w = Math.max(...all.map(p => p[0])) - x0, h = Math.max(...all.map(p => p[1])) - y0;
      if (w < h) { polys = polys.map(P => P.map(([x, y]) => [y, -x])); const a2 = polys.flat(); x0 = Math.min(...a2.map(p => p[0])); y0 = Math.min(...a2.map(p => p[1])); }
      polys = polys.map(P => P.map(([x, y]) => [x - x0, y - y0]));
    }
    if (paper) {
      const [W, H] = [Math.max(...paper), Math.min(...paper)];
      board.polygon([[0, 0], [W, 0], [W, H], [0, H]], { fill: 'none', stroke: fit && !fit.fits ? 'signalThin' : 'guide' });
    }
    if (polys) {
      const bad = new Set((net.overlaps || []).flat());
      polys.forEach((P, f) => board.polygon(P, { fill: bad.has(f) ? 'error' : 'face', stroke: null }));
      const hinge = new Set(net.hinges);
      for (const e of solid.edges) for (const fid of e.f) {
        if (hinge.has(e.id) && fid !== e.f[0]) continue;
        const loop = solid.faces[fid].loop;
        board.line(polys[fid][loop.indexOf(e.a)], polys[fid][loop.indexOf(e.b)], hinge.has(e.id) ? 'fold' : 'visible');
      }
    }
    board.fit();
  }

  // ------------------------------------------------------------------

  stage.frame(view.group, { padding: 64 });
  frame.title(workshop ? 'Free cutting' : cutTitle(item), FORMS[item.form].name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: () => { if (cuts.length) { setCuts(cuts.slice(0, -1)); sfx.tick(); } } },
    { id: 'reset', label: 'Reset', key: 'R', run: () => { if (cuts.length) { setCuts([]); sfx.slide(); } } },
    ...(workshop ? [
      { id: 'prev', label: 'Prev form', key: '[', run: () => workshopStep(-1) },
      { id: 'next', label: 'Next form', key: ']', run: () => workshopStep(1) },
    ] : [{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]),
  ]);
  viewKeys();
  refresh();

  return {
    view,
    // for tests: cut an edge, or a good plan's cuts
    cut: toggle, plan: () => findPlan()?.cuts, cuts: () => cuts.slice(),
    pick: ev => busy ? null : picker.edge(ev, view.edgeSegments(), { occluders: view.faces, px: 12 }),
    hover: t => { view.hoverEdge(t ? t.id : null); stage.invalidate(); },
    tap(ev) {
      const hit = busy ? null : picker.edge(ev, view.edgeSegments(), { occluders: view.faces, px: 12 });
      if (hit) toggle(hit.id);
    },
    check() {
      if (st.state === 'flat') {
        if (paper) {
          const f = sheetFit(st.net, ...paper);
          if (!f.fits) return { ok: false, note: `It lies flat, but it takes up ${f.size[0].toFixed(1)} × ${f.size[1].toFixed(1)}, which is too big for the sheet. Try hinging the long arms closer to the middle.` };
        }
        return { ok: true };
      }
      if (st.state === 'jammed') {
        jam();
        const pairs = st.overlaps.slice(0, 2);
        return { ok: false, note: 'When it lies flat, two faces end up on top of each other. Try keeping one of them joined along a different edge.',
          culprits: pairs.map(([a]) => ({ at: at(() => view.faceCentre(a)), r: 30 })) };
      }
      return { ok: false, strike: false, note: `It still holds together in places, so it can’t open flat yet. You need ${plural(need - cuts.length, 'more cut')}.` };
    },
    hint(n) {
      if (n === 1) return { text: rules.line ? `One unbroken line through all ${solid.verts.length} corners opens it, passing each corner once. Plan the route before you start: a line that doubles back on itself gets stuck.`
        : rules.keep ? `Cut between two shaded faces only where they would still hold together another way round. The unshaded faces then hang off the shaded strip.`
        : `A flat net of ${F} faces is held together by ${F - 1} uncut edges, so you need ${need} cuts in all. Freeing the faces around one corner is a good start.` };
      const p = findPlan();
      if (!p) return { text: 'With these cuts it can’t open into one flat piece any more. Undo the last few and try another way.' };
      const left = p.cuts.filter(e => !cuts.includes(e));
      if (n === 2) {
        const next = left.filter(id => !rules.line || !lineStep(solid, cuts, id));
        const e = next.find(id => !picker.hidden(view.edgeMid(id), view.faces)) ?? next[0] ?? left[0];
        return { text: 'Here is one cut that leads to a good net.', culprits: [{ at: at(() => view.edgeMid(e)), r: 20, note: 'cut here' }] };
      }
      marked = new Set(left);
      styles();
      return { text: 'The dashed lines show every cut of one good net. Follow them.' };
    },
    async solved() {
      busy = true;
      sfx.flap();
      lift(view, .5, 1500);
      await play(view, st.pose, shownT, 0, { duration: 1500 });
      sfx.thud();
      shownT = 0; laidFlat = true;
      stage.frame(view.group, { padding: 56 });
      drawCard();
      await wait(450);
      busy = false;
    },
    dispose() { board?.dispose(); frame.card(false); view.dispose(); },
  };

  // the net jams: lay it flat, flash the faces on top of each other, lift it back
  async function jam() {
    busy = true;
    const bad = [...new Set(st.overlaps.flat())];
    await play(view, st.pose, shownT, 0, { duration: 700, easing: ease.cubicOut });
    await view.flashFaces(bad, { times: 2, period: 380 });
    await play(view, st.pose, 0, shownT, { duration: 600 });
    busy = false;
  }
}

// ------------------------------------------------------------------
// task: match the edge
// ------------------------------------------------------------------

function matchTask(item, solid) {
  const view = addView(solid);
  const rng = seededRng('match:' + item.id + ':' + (item.seed ?? ''));
  const base = baseFace(solid);
  const net = tableNet(solid, rng);
  const hinge = new Set(net.hinges);
  view.setEdgeStyles(solid.edges.map(e => hinge.has(e.id) ? 'fold' : 'visible'));
  view.setFacePolys(net.pose(0));
  lift(view, .5, 0);
  const qs = matchEdges(net, rng, 3, { far: !!item.far });
  let qi = 0, busy = false;

  const mark = createLines([], 'signal', { on: 'model', renderOrder: 4 });
  const done = createLines([], 'signalThin', { on: 'model', renderOrder: 4 });
  view.group.add(mark, done);
  const seg = side => view.edgeSegments().find(s => s.id === side.e && s.f === side.f) || view.edgeSegments().find(s => s.id === side.e);
  const mid = s => lerp3(s.a, s.b, .5);
  const tags = [], doneSegs = [];

  function show() {
    const q = qs[qi];
    const s = seg(q.given);
    mark.setSegments([[s.a, s.b]]);
    tags.push(labels.add(mid(s), String(qi + 1), { signal: true, offset: [0, -12] }));
    frame.sub(`When this net folds up, edge <em>${qi + 1}</em> meets exactly one other edge. Which one? Tap it.<span class="udp-count">${qi + 1} / ${qs.length}</span>`, true);
    stage.invalidate();
  }

  // the rim sides a player can click: every cut edge on both faces, except the one asked about
  const candidates = () => view.edgeSegments().filter(s => !hinge.has(s.id) && !(s.id === qs[qi].given.e && s.f === qs[qi].given.f));

  async function answer(hit) {
    const q = qs[qi];
    if (hit.id === q.answer.e && hit.edge.f === q.answer.f) {
      sfx.step(qi);
      const a = seg(q.given), b = seg(q.answer);
      doneSegs.push([a.a, a.b], [b.a, b.b]);
      done.setSegments(doneSegs);
      tags.push(labels.add(mid(b), String(qi + 1), { signal: true, offset: [0, -12] }));
      qi++;
      if (qi >= qs.length) { mark.setSegments([]); session.check(); return; }
      show();
      return;
    }
    const L = solid.edges[hit.id].len, want = solid.edges[q.e].len;
    const note = Math.abs(L - want) > 1e-6
      ? `That edge is ${L.toFixed(2).replace(/\.?0+$/, '')} long; edge ${qi + 1} is ${want.toFixed(2).replace(/\.?0+$/, '')}.`
      : 'Same length, but it meets a different face when folded.';
    session.miss({ note, culprits: [{ at: at(hit.point.toArray()), r: 18 }] });
  }

  stage.frame(view.group, { padding: 56 });
  frame.title(TITLES.match, FORMS[item.form].name);
  frame.tools([
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (you lose the third mark)', run: peek },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  frame.primary({ label: 'Match', disabled: true });
  show();

  async function peek() {
    if (busy) return;
    busy = true; session.peek();
    sfx.flap();
    await play(view, net.pose, 0, .55, { duration: 700 });
    await wait(700, { essential: true });
    await play(view, net.pose, .55, 0, { duration: 600 });
    busy = false;
  }

  return {
    view,
    // for tests: where the current answer lies
    _answer: () => qs[qi] && mid(seg(qs[qi].answer)),
    pick: ev => busy ? null : picker.edge(ev, candidates(), { px: 12 }),
    hover: t => { view.hoverEdge(t ? t.id : null); stage.invalidate(); },
    tap(ev) {
      if (busy || qi >= qs.length) return;
      const hit = picker.edge(ev, candidates(), { px: 12 });
      if (hit) answer(hit);
    },
    check: () => ({ ok: qi >= qs.length }),
    hint(n) {
      const q = qs[qi];
      if (!q) return null;
      if (n === 1) return { text: 'Imagine the face with this edge turning up. On the solid, the edge then lies against the face next to it.' };
      if (n === 2) return { text: 'It glues to one of the edges of this face.', culprits: [{ at: at(() => view.faceCentre(q.answer.f)), r: 34 }] };
      return { text: 'It glues to this edge.', culprits: [{ at: at(() => mid(seg(q.answer))), r: 16, note: 'glues to ' + (qi + 1) }] };
    },
    async solved() {
      busy = true;
      for (const t of tags) t.remove();
      mark.setSegments([]);
      sfx.flap();
      lift(view, 0, 1700);
      await play(view, net.pose, 0, 1, { duration: 1700 });
      sfx.thud();
      stage.frame(view.group, { padding: 64 });
      await wait(300);
    },
    dispose() { for (const t of tags) t.remove(); mark.dispose(); done.dispose(); view.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: which solid
// ------------------------------------------------------------------

function whichTask(item, solid) {
  const rng = seededRng('which:' + item.id + ':' + (item.seed ?? ''));
  const base = baseFace(solid);
  const net = tableNet(solid, rng);
  const view = addView(solid);
  view.setEdgeStyles(solid.edges.map(e => net.hinges.includes(e.id) ? 'fold' : 'visible'));
  view.setFacePolys(net.pose(0));
  lift(view, .5, 0);

  // the four solids in a row behind the net, all at one scale
  const keys = shuffle(rng, [item.form, ...distractors(item.form, rng, 3)]);
  const solids = keys.map(k => k === item.form ? solid : FORMS[k].make());
  const big = Math.max(...solids.map(s => Math.max(...[0, 1, 2].map(a => Math.max(...s.verts.map(v => v[a])) - Math.min(...s.verts.map(v => v[a]))))));
  const k = Math.min(1, 2.6 / big);
  const xs = net.pose(0).flatMap(q => q.pts);
  const nx0 = Math.min(...xs.map(p => p[0])), nx1 = Math.max(...xs.map(p => p[0])), ny1 = Math.max(...xs.map(p => p[1]));
  const gap = 3.4, row = (keys.length - 1) * gap, cx = (nx0 + nx1) / 2;
  // a tall screen (a phone held upright) gets them two by two: a row of four would be tiny
  const tall = stage.rect.h > stage.rect.w * 1.2;
  const cands = solids.map((s, i) => {
    const lo = [0, 1].map(a => Math.min(...s.verts.map(v => v[a]))), hi = [0, 1].map(a => Math.max(...s.verts.map(v => v[a])));
    const ox = tall ? cx + ((i % 2) - .5) * gap * 1.3 : cx - row / 2 + i * gap, oy = ny1 + 2.4 + (tall ? Math.floor(i / 2) * gap * 2 : 0);
    const placed = mapSolid(s, v => [ox + (v[0] - (lo[0] + hi[0]) / 2) * k, oy + (v[1] - (lo[1] + hi[1]) / 2) * k, v[2] * k]);
    const v = addView(placed);
    const tag = labels.add([ox, oy - 1.7, 0], String.fromCharCode(65 + i), { ink: true });
    return { key: keys[i], view: v, tag, out: false };
  });
  let busy = false;

  stage.frame(stage.content, { padding: 40 });
  frame.title(TITLES.which, 'A net of ' + plural(solid.faces.length, 'face'));
  frame.sub('Picture this net folding up. Which of the four solids would it make? Tap it.');
  frame.tools([
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (you lose the third mark)', run: peek },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
    ...cands.map((c, i) => ({ id: 'c' + i, label: String.fromCharCode(65 + i), key: String.fromCharCode(65 + i), hidden: true, run: () => choose(i) })),
  ]);
  viewKeys();
  frame.primary({ label: 'Choose', disabled: true });

  async function peek() {
    if (busy) return;
    busy = true; session.peek(); sfx.flap();
    await play(view, net.pose, 0, .5, { duration: 700 });
    await wait(700, { essential: true });
    await play(view, net.pose, .5, 0, { duration: 600 });
    busy = false;
  }

  let chosen = -1;
  function choose(i) {
    const c = cands[i];
    if (busy || c.out) return;
    if (c.key === item.form) { chosen = i; session.check(); return; }
    c.out = true;
    c.view.setAllFaces('ghost');
    const nf = c.view.solid.faces.length, mine = solid.faces.length;
    const note = nf !== mine ? `${String.fromCharCode(65 + i)} has ${nf} faces; the net has ${mine}.` : `${String.fromCharCode(65 + i)} has ${nf} faces too, but they are not the same shapes.`;
    session.miss({ note, culprits: [{ at: at(() => c.view.faceCentre(0)), r: 40 }] });
    stage.invalidate();
  }

  const which = ev => {
    const hit = picker.face(ev, cands.filter(c => !c.out).flatMap(c => c.view.faces));
    if (!hit) return -1;
    return cands.findIndex(c => c.view.faces.includes(hit.object));
  };

  return {
    view,
    _answer: () => cands.findIndex(c => c.key === item.form),
    pick: ev => { if (busy) return null; const i = which(ev); return i < 0 ? null : { id: i }; },
    hover: (t, prev) => {
      if (prev) cands[prev.id].view.setAllFaces(cands[prev.id].out ? 'ghost' : 'normal');
      if (t) cands[t.id].view.setAllFaces('hover');
      stage.invalidate();
    },
    tap(ev) { const i = which(ev); if (i >= 0) choose(i); },
    check: () => ({ ok: chosen >= 0 }),
    hint(n) {
      const tri = solid.faces.filter(f => f.loop.length === 3).length;
      if (n === 1) return { text: `The net has ${plural(solid.faces.length, 'face')}${tri ? `, and ${tri} of them are triangles` : ''}. Count the faces on each solid.` };
      if (n === 2) {
        const wrong = cands.filter(c => c.key !== item.form && !c.out).slice(0, 2);
        for (const c of wrong) { c.out = true; c.view.setAllFaces('ghost'); }
        stage.invalidate();
        return { text: 'Two of the solids can’t be it, so they are crossed out.' };
      }
      const right = cands.find(c => c.key === item.form);
      return { text: 'It is this one.', culprits: [{ at: at(() => right.view.faceCentre(0)), r: 40 }] };
    },
    async solved() {
      busy = true;
      const c = cands[chosen];
      c.view.setAllFaces('selected');
      for (const o of cands) if (o !== c) o.view.setAllFaces('ghost');
      c.tag.set({ signal: true });
      sfx.flap();
      lift(view, 0, 1600);
      await play(view, net.pose, 0, 1, { duration: 1600 });
      sfx.thud();
      await wait(300);
    },
    dispose() { view.dispose(); for (const c of cands) { c.tag.remove(); if (c.view !== view) c.view.dispose(); } },
  };
}

// ------------------------------------------------------------------
// task: will it fold
// ------------------------------------------------------------------

function foldTask(item, solid) {
  const rng = seededRng('fold:' + item.id + ':' + (item.seed ?? ''));
  const base = baseFace(solid);
  const rounds = 3;
  let round = 0, wins = 0, step = 'ask', cur = null, busy = false;
  let view = null;

  // the solid itself, small, behind the nets
  const ref = (() => {
    const lo = [0, 1].map(a => Math.min(...solid.verts.map(v => v[a]))), hi = [0, 1].map(a => Math.max(...solid.verts.map(v => v[a])));
    return { lo, hi };
  })();
  let refView = null;

  // twin levels show one net again and again, sometimes with a single face moved
  const twinNet = item.twin ? tableNet(solid, rng, { pick: 'any' }) : null;
  const twinBad = shuffle(rng, [true, false, true]);

  // a new net: about half the time one face hangs from the wrong edge
  function deal() {
    view?.dispose();
    const net = twinNet || tableNet(solid, rng, { pick: 'any' });
    const bad = (twinNet ? twinBad[round % 3] : rng() < .55) ? misfit(solid, net, rng) : null;
    view = addView(solid);
    view.setEdgeStyles(solid.edges.map(() => 'visible'));
    const pose = bad ? misfitPose(solid, net, bad) : net.pose;
    view.setFacePolys(pose(0));
    lift(view, .5, 0);
    cur = { net, bad, pose };
    step = 'ask';
    if (!refView) {
      const pts = pose(0).flatMap(q => q.pts);
      const nx1 = Math.max(...pts.map(p => p[0])), ny1 = Math.max(...pts.map(p => p[1]));
      const placed = mapSolid(solid, v => [v[0] - ref.lo[0] + nx1 + 1.6, v[1] - ref.lo[1] + ny1 - (ref.hi[1] - ref.lo[1]), v[2]]);
      refView = addView(placed);
    }
    stage.frame(stage.content, { padding: 48 });
    frame.sub(`${twinNet && round ? 'The same net again, or is it? A single face may have moved to another edge.' : 'Would this net fold up into the solid beside it, with no gaps and no faces doubled up?'}<span class="udp-count">net ${wins + 1} / ${rounds}</span>`, true);
    frame.tools(tools());
    viewKeys();
    stage.invalidate();
  }

  const tools = () => step === 'ask' ? [
    { id: 'yes', label: 'It folds', key: 'Y', run: () => say(true) },
    { id: 'no', label: 'It won’t fold', key: 'N', run: () => say(false) },
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (you lose the third mark)', run: peek },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ] : [
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ];

  async function reveal({ good }) {
    busy = true;
    sfx.flap();
    lift(view, 0, 1500);
    await play(view, cur.pose, 0, 1, { duration: 1500 });
    if (cur.bad) await view.flashFaces([cur.bad.leaf, cur.bad.lands], { times: 2, period: 360 });
    else sfx.thud();
    await wait(good ? 500 : 1100, { essential: true });
    busy = false;
  }

  async function next(good) {
    if (good) { wins++; sfx.step(wins - 1); }
    await reveal({ good });
    if (wins >= rounds) { session.check(); return; }
    round++;
    deal();
  }

  function say(folds) {
    if (busy || step !== 'ask') return;
    if (folds && !cur.bad) return next(true);
    if (!folds && cur.bad) {
      step = 'which';
      frame.sub('Right, it won’t fold. Which face is the problem? Tap one that would land on top of another.');
      frame.tools(tools()); viewKeys();
      return;
    }
    session.miss({ note: folds ? 'This one doesn’t fold. One face would land where another face already is.' : 'This one does fold. Every cut edge finds its partner.' });
    next(false);
  }

  async function peek() {
    if (busy) return;
    busy = true; session.peek(); sfx.flap();
    await play(view, cur.pose, 0, .5, { duration: 700 });
    await wait(700, { essential: true });
    await play(view, cur.pose, .5, 0, { duration: 600 });
    busy = false;
  }

  frame.title(TITLES.fold, FORMS[item.form].name);
  frame.primary({ label: 'Answer', disabled: true });
  deal();

  return {
    get view() { return view; },
    _answer: () => cur.bad ? { folds: false, face: cur.bad.leaf } : { folds: true },
    pick: ev => { if (busy || step !== 'which') return null; const h = picker.face(ev, view.faces); return h ? { id: h.faceId } : null; },
    hover: (t, prev) => {
      if (prev && view.faceState(prev.id) === 'hover') view.setFaceState(prev.id, 'normal');
      if (t) view.setFaceState(t.id, 'hover');
      stage.invalidate();
    },
    tap(ev) {
      if (busy || step !== 'which') return;
      const h = picker.face(ev, view.faces);
      if (!h) return;
      view.setAllFaces('normal');
      const f = h.faceId;
      if (f === cur.bad.leaf || f === cur.bad.lands) next(true);
      else {
        session.miss({ note: 'That face folds into place fine. Look for one that has nowhere to go.', culprits: [{ at: at(() => view.faceCentre(f)), r: 30 }] });
        next(false);
      }
    },
    check: () => ({ ok: wins >= rounds }),
    hint(n) {
      if (n === 1) return { text: 'Fold it one face at a time, starting from the face lying on the table.' };
      if (n === 2) return { text: cur.bad ? 'Watch the faces around here.' : 'Every face seems to have its own place on the solid. Check the triangles again.', culprits: cur.bad ? [{ at: at(() => view.faceCentre(cur.bad.to.f)), r: 34 }] : [] };
      return { text: cur.bad ? 'This face is joined along the wrong edge.' : 'This net folds.', culprits: cur.bad ? [{ at: at(() => view.faceCentre(cur.bad.leaf)), r: 30 }] : [] };
    },
    async solved() { stage.frame(stage.content, { padding: 56 }); await wait(200); },
    dispose() { view?.dispose(); refView?.dispose(); },
  };
}

// ------------------------------------------------------------------
// the model standing beside a flat net (draw and fix)
// ------------------------------------------------------------------

// a copy of the solid to the right of the net, or below it on a tall screen
function besideNet(solid, flatPolys) {
  const pts = flatPolys.flatMap(q => q.pts);
  const lo = [0, 1].map(a => Math.min(...solid.verts.map(v => v[a]))), hi = [0, 1].map(a => Math.max(...solid.verts.map(v => v[a])));
  const nx0 = Math.min(...pts.map(p => p[0])), nx1 = Math.max(...pts.map(p => p[0])), ny0 = Math.min(...pts.map(p => p[1])), ny1 = Math.max(...pts.map(p => p[1]));
  const tall = stage.rect.h > stage.rect.w * 1.2;
  const ox = tall ? (nx0 + nx1) / 2 - (hi[0] - lo[0]) / 2 - lo[0] : nx1 + 1.6 - lo[0];
  const oy = tall ? ny1 + 1.6 - lo[1] : (ny0 + ny1) / 2 - (hi[1] - lo[1]) / 2 - lo[1];
  return addView(mapSolid(solid, v => [v[0] + ox, v[1] + oy, v[2]]));
}

// ------------------------------------------------------------------
// task: draw on the net
// ------------------------------------------------------------------

// A mark drawn on a face of the folded solid, as segments: a door stands on the
// bottom edge of a wall, a window or skylight sits in the middle.
function glyph(solid, fid, kind) {
  const f = solid.faces[fid], P = f.loop.map(i => solid.verts[i]);
  const c = P.reduce((s, p) => add3(s, mul3(p, 1 / P.length)), [0, 0, 0]);
  let d = sub3([0, 0, -1], mul3(f.n, -f.n[2]));
  if (Math.hypot(...d) < .3) d = sub3(P[1], P[0]);
  d = norm3(d);
  const s = cross3(f.n, d);
  const along = u => P.map(p => dot3(sub3(p, c), u));
  const W = Math.max(...along(s)) - Math.min(...along(s)), H = Math.max(...along(d)) - Math.min(...along(d));
  const at = (x, y) => add3(c, add3(mul3(s, x), mul3(d, y)));
  if (kind === 'door') {
    const w = Math.min(.5, W * .28) / 2, bottom = Math.max(...along(d)), top = bottom - Math.min(1.05, H * .55);
    return [[at(-w, bottom), at(-w, top)], [at(-w, top), at(w, top)], [at(w, top), at(w, bottom)]];
  }
  const a = Math.min(.42, W * .3, H * .3) / 2;
  const q = [at(-a, -a), at(a, -a), at(a, a), at(-a, a)];
  return [[q[0], q[1]], [q[1], q[2]], [q[2], q[3]], [q[3], q[0]], [at(0, -a), at(0, a)]];
}
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => mul3(a, 1 / (Math.hypot(...a) || 1));

// carry points on a face from one placement of it (src polygon) to another (dst), a hair off the face
function faceMap(src, dst) {
  const fr = P => {
    const o = P[0], x = norm3(sub3(P[1], P[0]));
    let n = [0, 0, 0];
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n = add3(n, cross3(a, b)); }
    n = norm3(n);
    return { o, x, y: cross3(n, x), n };
  };
  const A = fr(src), B = fr(dst);
  return p => {
    const v = sub3(p, A.o);
    return add3(B.o, add3(mul3(B.x, dot3(v, A.x)), add3(mul3(B.y, dot3(v, A.y)), mul3(B.n, dot3(v, A.n) + .006))));
  };
}

function drawTask(item, solid) {
  const rng = seededRng('draw:' + item.id + ':' + (item.seed ?? ''));
  let net = null, plan = null;
  // the faces turned toward the camera, so every asked mark can be seen on the model
  stage.rig.camera.updateMatrixWorld();
  const m = stage.rig.camera.matrixWorld.elements, eye = [m[8], m[9], m[10]];
  const seen = f => dot3(solid.faces[f].n, eye) > .2;
  for (let t = 0; t < 12 && !plan; t++) { net = tableNet(solid, rng); plan = net && drawRounds(solid, net, rng, { n: 3, hard: !!item.hard, seen }); }
  const { ref, asks } = plan;
  const folded = solid.faces.map(f => f.loop.map(i => solid.verts[i]));
  const upright = f => Math.abs(solid.faces[f].n[2]) < .01;
  const kinds = asks.map((f, i) => !upright(f) ? 'skylight' : i === 0 || !asks.slice(0, i).some(upright) ? 'door' : 'window');
  const marks = [{ f: ref, kind: 'window' }, ...asks.map((f, i) => ({ f, kind: kinds[i] }))];
  const segsOf = marks.map(m => glyph(solid, m.f, m.kind));

  const view = addView(solid);
  view.setEdgeStyles(solid.edges.map(e => net.hinges.includes(e.id) ? 'fold' : 'visible'));
  view.setFacePolys(net.pose(0));
  lift(view, .5, 0);
  const model = besideNet(solid, net.pose(0));
  const mOff = sub3(model.solid.verts[0], solid.verts[0]);

  // ink for marks already drawn, signal for the one asked about
  const netInk = createLines([], 'visible', { on: 'model', renderOrder: 4 }), netNew = createLines([], 'signal', { on: 'model', renderOrder: 4 });
  const modelInk = createLines([], 'visible', { on: 'model', renderOrder: 4 }), modelAsk = createLines([], 'signal', { on: 'model', renderOrder: 4 });
  view.group.add(netInk, netNew);
  model.group.add(modelInk, modelAsk);
  let qi = 0, busy = false, flash = -1;

  const onNet = i => { const f = marks[i].f, m = faceMap(folded[f], view.facePoly(f)); return segsOf[i].map(([a, b]) => [m(a), m(b)]); };
  const onModel = i => { const m = faceMap(folded[marks[i].f], folded[marks[i].f].map(p => add3(p, mOff))); return segsOf[i].map(([a, b]) => [m(a), m(b)]); };
  function drawMarks() {
    const done = [0, ...asks.slice(0, qi).map((_, k) => k + 1)];
    netInk.setSegments(done.filter(i => i !== flash).flatMap(onNet));
    netNew.setSegments(flash >= 0 ? onNet(flash) : []);
    modelInk.setSegments(done.flatMap(onModel));
    modelAsk.setSegments(qi < asks.length ? onModel(qi + 1) : []);
    stage.invalidate();
  }
  function show() {
    const k = kinds[qi];
    frame.sub(qi === 0
      ? `Model makers draw on the flat sheet before they fold it. Tap the face of the net where the orange ${k} belongs.<span class="udp-count">${qi + 1} / ${asks.length}</span>`
      : `Now the ${k}. Tap the face of the net where it belongs.<span class="udp-count">${qi + 1} / ${asks.length}</span>`, true);
    drawMarks();
  }

  async function playNet(t0, t1, duration) {
    await animate({ from: t0, to: t1, duration, ease: ease.cubicInOut, essential: true,
      update: v => { view.setFacePolys(net.pose(v)); drawMarks(); } }).promise;
  }
  async function peek() {
    if (busy) return;
    busy = true; session.peek(); sfx.flap();
    await playNet(0, .5, 700);
    await wait(700, { essential: true });
    await playNet(.5, 0, 600);
    busy = false;
  }

  function answer(f) {
    const want = asks[qi], k = kinds[qi];
    if (f === want) {
      sfx.step(qi);
      flash = qi + 1;
      qi++;
      drawMarks();
      if (qi >= asks.length) { session.check(); return; }
      setTimeout(() => { flash = -1; show(); }, 500);
      return;
    }
    const note = f === net.root ? 'That is the face the model stands on, so it ends up underneath.'
      : marks.slice(0, qi + 1).some(m => m.f === f) ? 'That face already has its drawing.'
      : `That face folds up into the side circled on the model. The ${k} is on another side.`;
    session.miss({ note, culprits: f === net.root ? [] : [{ at: at(() => model.faceCentre(f)), r: 34 }] });
    model.flashFaces([f], { times: 2, period: 380 });
  }

  stage.frame(stage.content, { padding: 44 });
  frame.title(TITLES.draw, FORMS[item.form].name);
  frame.tools([
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (you lose the third mark)', run: peek },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  frame.primary({ label: 'Draw', disabled: true });
  show();

  return {
    view,
    _answer: () => asks[qi],
    answer,
    pick: ev => { if (busy || qi >= asks.length) return null; const h = picker.face(ev, view.faces); return h ? { id: h.faceId } : null; },
    hover: (t, prev) => {
      if (prev) view.setFaceState(prev.id, 'normal');
      if (t) view.setFaceState(t.id, 'hover');
      stage.invalidate();
    },
    tap(ev) {
      if (busy || qi >= asks.length) return;
      const h = picker.face(ev, view.faces);
      if (h) answer(h.faceId);
    },
    check: () => ({ ok: qi >= asks.length }),
    hint(n) {
      const want = asks[qi];
      if (!want && want !== 0) return null;
      if (n === 1) return { text: 'Start from the face lying in the middle of the net: the model stands on it. Then find the face that already has a window, and turn the net in your head from there.' };
      if (n === 2) {
        const d = netDistance(want, ref);
        return { text: `On the net, the ${kinds[qi]} is ${d} ${d === 1 ? 'hinge' : 'hinges'} away from the face with the grey window.` };
      }
      return { text: 'It goes on this face.', culprits: [{ at: at(() => view.faceCentre(want)), r: 30 }] };
    },
    async solved() {
      busy = true;
      flash = -1;
      sfx.flap();
      lift(view, 0, 1700);
      await playNet(0, 1, 1700);
      sfx.thud();
      stage.frame(stage.content, { padding: 56 });
      await wait(300);
    },
    dispose() { netInk.dispose(); netNew.dispose(); modelInk.dispose(); modelAsk.dispose(); model.dispose(); view.dispose(); },
  };

  function netDistance(f, g) {
    const up = x => { const out = [x]; while (net.parent[x] >= 0) { const e = solid.edges[net.parent[x]]; x = e.f[0] === x ? e.f[1] : e.f[0]; out.push(x); } return out; };
    const A = up(f), B = up(g), i = A.findIndex(x => B.includes(x));
    return i + B.indexOf(A[i]);
  }
}

// ------------------------------------------------------------------
// task: mend the net
// ------------------------------------------------------------------

function fixTask(item, solid) {
  const rng = seededRng('fix:' + item.id + ':' + (item.seed ?? ''));
  let net = null, mis = null;
  // the stray face should be one the player can see on the model
  stage.rig.camera.updateMatrixWorld();
  const m = stage.rig.camera.matrixWorld.elements, seen = f => dot3(solid.faces[f].n, [m[8], m[9], m[10]]) > .2;
  for (let t = 0; t < 40 && !(mis && seen(mis.leaf)); t++) { const n2 = tableNet(solid, rng, { pick: 'any' }), m2 = n2 && misfit(solid, n2, rng); if (m2 && (!mis || seen(m2.leaf))) { net = n2; mis = m2; } }
  const leaf = mis.leaf, oldHinge = net.parent[leaf];
  const pose0 = misfitPose(solid, net, mis);
  const view = addView(solid);
  const hinges = new Set(net.hinges.filter(h => h !== oldHinge));
  view.setEdgeStyles(solid.edges.map(e => hinges.has(e.id) ? 'fold' : 'visible'));
  view.setFacePolys(pose0(0));
  view.setFaceState(leaf, 'selected');
  lift(view, .5, 0);
  const model = besideNet(solid, pose0(0));
  model.setFaceState(leaf, 'selected');
  let busy = false, done = null;

  frame.title(TITLES.fix, FORMS[item.form].name);
  frame.sub('The orange face is joined along the wrong edge, so this net won’t fold. Find it on the model, then tap the edge of the net where it really belongs.');
  frame.tools([
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (you lose the third mark)', run: peek },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  frame.primary({ label: 'Mend', disabled: true });
  stage.frame(stage.content, { padding: 44 });

  // the free edges of the rest of the net: where the face could hang instead
  const candidates = () => view.edgeSegments().filter(s => s.f !== leaf && !hinges.has(s.id) && !(s.id === mis.to.e && s.f === mis.to.f));

  async function peek() {
    if (busy) return;
    busy = true; session.peek(); sfx.flap();
    await play(view, pose0, 0, .5, { duration: 700 });
    await wait(700, { essential: true });
    await play(view, pose0, .5, 0, { duration: 600 });
    busy = false;
  }

  async function answer(eid) {
    const r = mended(solid, net, leaf, eid);
    if (r.ok) {
      busy = true;
      done = r.net;
      sfx.snip();
      // the face swings over to its new edge on the table, then the net folds
      const from = view.facePoly(leaf).map(p => p.slice()), to = r.net.pose(0)[leaf].pts;
      await animate({ duration: 700, ease: ease.cubicInOut, essential: true, update: v => {
        const all = pose0(0);
        all[leaf] = { f: leaf, pts: from.map((p, k) => lerp3(p, to[k], v).map((x, j) => j === 2 ? x + Math.sin(v * Math.PI) * .8 : x)) };
        view.setFacePolys(all); stage.invalidate();
      } }).promise;
      view.setEdgeStyles(solid.edges.map(e => r.net.hinges.includes(e.id) ? 'fold' : 'visible'));
      busy = false;
      session.check();
      return;
    }
    session.miss({ note: r.why === 'overlap' ? 'That is one of its true edges, but laid flat there it would cover another face. Try another of its edges.'
      : 'On the model, the orange face doesn’t touch that edge. Look at which faces it meets there.', culprits: [{ at: at(() => model.faceCentre(leaf)), r: 34 }] });
  }

  return {
    view,
    _answer: () => net.parent[leaf],
    answer,
    pick: ev => busy || done ? null : picker.edge(ev, candidates(), { px: 12 }),
    hover: t => { view.hoverEdge(t ? t.id : null); stage.invalidate(); },
    tap(ev) {
      if (busy || done) return;
      const hit = picker.edge(ev, candidates(), { px: 12 });
      if (hit) answer(hit.id);
    },
    check: () => ({ ok: !!done }),
    hint(n) {
      const nb = solid.faces[leaf].edges.map(e => solid.edges[e]).map(e => e.f[0] === leaf ? e.f[1] : e.f[0]);
      if (n === 1) return { text: `On the model, the orange face touches ${nb.length} other faces. Its true place is along an edge of one of them.` };
      const host = parentOf(leaf);
      if (n === 2) return { text: 'It belongs on one of the edges of this face.', culprits: [{ at: at(() => view.faceCentre(host)), r: 34 }] };
      return { text: 'It hangs from this edge.', culprits: [{ at: at(() => view.edgeMid(oldHinge, host)), r: 16 }] };
    },
    async solved() {
      busy = true;
      view.setFaceState(leaf, 'normal');
      sfx.flap();
      lift(view, 0, 1600);
      await play(view, done.pose, 0, 1, { duration: 1600 });
      sfx.thud();
      stage.frame(stage.content, { padding: 56 });
      await wait(300);
    },
    dispose() { model.dispose(); view.dispose(); },
  };

  function parentOf(f) { const e = solid.edges[net.parent[f]]; return e.f[0] === f ? e.f[1] : e.f[0]; }
}

// ------------------------------------------------------------------
// the camera keys every task shares
// ------------------------------------------------------------------

function viewKeys() {
  frame.keys([
    { key: 'ArrowLeft', label: 'Turn the view', run: () => stage.rig.step(-1) },
    { key: 'ArrowRight', run: () => stage.rig.step(1) },
    { key: 'ArrowUp', label: 'Tilt the view', run: () => stage.rig.tilt(8) },
    { key: 'ArrowDown', run: () => stage.rig.tilt(-8) },
    { key: 'V', label: 'Perspective on or off', run: () => stage.rig.togglePerspective() },
  ]);
}

// ------------------------------------------------------------------
// the game definition for the session
// ------------------------------------------------------------------

let task = null;
function load(item) {
  task?.dispose();
  red.clear();
  labels.clear();
  stage.clear();
  frame.card(false);
  frame.primaryEl.style.display = item.task === 'cut' ? '' : 'none';
  const solid = FORMS[item.form].make();
  task = item.task === 'cut' ? cutTask(item, solid)
    : item.task === 'match' ? matchTask(item, solid)
    : item.task === 'which' ? whichTask(item, solid)
    : item.task === 'draw' ? drawTask(item, solid)
    : item.task === 'fix' ? fixTask(item, solid)
    : foldTask(item, solid);
  if (task.view?.group) stage.invalidate();
}

// workshop: any form, cut freely
const allForms = Object.keys(FORMS);
let wsIndex = 0;
function workshopStep(d) {
  wsIndex = (wsIndex + d + allForms.length) % allForms.length;
  openWorkshop();
}
function openWorkshop() {
  task?.dispose();
  red.clear(); labels.clear(); stage.clear();
  frame.primaryEl.style.display = '';
  const form = allForms[wsIndex];
  task = cutTask({ form, id: 'W' }, FORMS[form].make(), { workshop: true });
}

// generated puzzles: the pack follows the difficulty, the task is drawn by lot
function generate(rng, difficulty, i) {
  const pk = 'ABCDEF'[Math.min(5, Math.floor((difficulty - 1) * 6 / 9))];
  const forms = formsOfPack(pk);
  const f = pick(rng, forms);
  const task = difficulty <= 2 ? pick(rng, ['match', 'which', 'fold']) : pick(rng, ['cut', 'match', 'which', 'fold', 'cut']);
  const seed = Math.floor(rng() * 1e9).toString(36);
  return { id: 'g' + seed, task, form: f.key, seed, name: f.name, par: parOf(task, f.make()) };
}

const def = {
  id: 'developments', prefix: 'D', name: 'Developments',
  lead: 'Nets and solids.',
  sub: 'Cut solids open, find where the edges glue, draw on the flat sheet and mend broken nets, from a cube to a basilica.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  workshop: openWorkshop,
  dailyDifficulty: 6,
};

const session = createSession({ def, frame, stage, redlines: red });

// input: taps and hover go to the task
stage.rig.onTap(ev => task?.tap?.(ev));
createHover(stage, ev => task?.pick?.(ev) ?? null, (t, prev) => task?.hover?.(t, prev));

session.start();
// for tests and screenshots
window.__udp = { stage, session, get task() { return task; }, FORMS };
