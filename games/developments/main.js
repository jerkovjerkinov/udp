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

const TITLES = { cut: 'Cut it open.', match: 'Match the edge.', which: 'Which solid?', fold: 'Will it fold?' };
const TASK_TAGS = { cut: 'cut open', match: 'match edges', which: 'which solid', fold: 'will it fold' };
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
  const p = task === 'cut' ? 20 + need * 5 : task === 'match' ? 30 + F * 3 : task === 'which' ? 25 + F * 2 : 45 + F * 2;
  return Math.round(p / 5) * 5;
}

// ------------------------------------------------------------------
// the levels, with names and par times filled in
// ------------------------------------------------------------------

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, name: FORMS[l.form].name, label: `${FORMS[l.form].name} · ${TASK_TAGS[l.task]}`,
    note: FORMS[l.form].note, par: parOf(l.task, FORMS[l.form].make()) })),
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
  let cuts = [], st = opening(solid, [], base), shownT = 1;
  let plan = null, marked = null, motion = null, busy = false, laidFlat = false;

  const restT = s => s.state === 'flat' || s.state === 'jammed' ? .94 : s.state === 'opening' ? .04 : 1;

  function styles() {
    view.setEdgeStyles(solid.edges.map(e => cuts.includes(e.id) ? 'signal' : marked?.has(e.id) ? 'signalFold' : e.flat ? 'guide' : 'visible'));
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
      frame.sub(`Free cutting. ${plural(cuts.length, 'cut')} of ${need}. ${flat ? 'It lies flat: unfold it.' : ''}`);
      frame.primary({ label: laidFlat ? 'Fold up' : 'Unfold', run: toggleFlat, disabled: !flat, ready: flat });
    } else {
      const left = Math.max(0, need - cuts.length);
      frame.sub(`Cut along the edges until it lies flat in one piece. <em>${plural(cuts.length, 'cut')}</em> made, ${left} to go.${paper ? ` The net must fit a ${paper[0]} × ${paper[1]} sheet.` : ''}`, true);
      frame.primary({ label: 'Unfold', run: () => session.check(), disabled: !flat, ready: flat });
    }
    frame.tool('undo', { off: !cuts.length });
    drawCard();
  }

  function setCuts(next) {
    const prev = st, prevT = shownT;
    cuts = next;
    st = opening(solid, cuts, base);
    shownT = restT(st);
    laidFlat = false;
    if (marked) marked = new Set([...marked].filter(e => !cuts.includes(e)));
    refresh();
    moveTo(prev, prevT, st, shownT);
  }

  function toggle(eid) {
    if (busy) return;
    red.clear();
    if (cuts.includes(eid)) { setCuts(cuts.filter(e => e !== eid)); sfx.tick(); return; }
    const next = [...cuts, eid];
    const o = opening(solid, next, base);
    if (o.state === 'apart') {
      // refused: the piece that would come away flashes
      const keep = o.pieces[base];
      const off = solid.faces.map(f => f.id).filter(f => o.pieces[f] !== keep);
      view.setEdgeStyle(eid, 'signalFold');
      view.flashFaces(off, { times: 2, period: 300 }).then(() => styles());
      session.miss({ note: 'That cut lets a piece fall off. Every face keeps at least one hinge.', strike: true, label: 'Refused' });
      return;
    }
    sfx.snip();
    setCuts(next);
  }

  // a good net that keeps the hinges still uncut, for hints: random spanning trees of the uncut edges
  function findPlan() {
    if (plan && cuts.every(c => plan.cuts.includes(c))) return plan;
    const rng = seededRng('plan:' + cuts.join(','));
    const uncut = solid.edges.filter(e => !cuts.includes(e.id));
    for (let t = 0; t < 2000; t++) {
      const parent = solid.faces.map((_, i) => i);
      const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
      const hinges = [];
      for (const e of shuffle(rng, uncut)) {
        const [a, b] = e.f.map(find);
        if (a !== b) { parent[a] = b; hinges.push(e.id); }
      }
      if (hinges.length !== F - 1) return null;
      const net = unfold(solid, hinges, base);
      if (!net || net.overlaps.length) continue;
      if (paper && !sheetFit(net, ...paper).fits) continue;
      plan = { hinges, cuts: solid.edges.map(e => e.id).filter(id => !hinges.includes(id)) };
      return plan;
    }
    // tight sheets: the unfolding search finds the rare nets that fit
    for (let t = 0; t < 200; t++) {
      const net = randomUnfolding(solid, seededRng('plan:' + t), { root: base, tries: 20, pick: 'any' });
      if (!net || net.overlaps.length || net.hinges.some(h => cuts.includes(h))) continue;
      if (paper && !sheetFit(net, ...paper).fits) continue;
      plan = { hinges: net.hinges, cuts: solid.edges.map(e => e.id).filter(id => !net.hinges.includes(id)) };
      return plan;
    }
    return null;
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
  frame.title(workshop ? 'Workshop.' : TITLES.cut, FORMS[item.form].name);
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
    cut: toggle, plan: () => findPlan()?.cuts,
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
          if (!f.fits) return { ok: false, note: `It lies flat, but the net needs ${f.size[0].toFixed(1)} × ${f.size[1].toFixed(1)}: too big for the sheet.` };
        }
        return { ok: true };
      }
      if (st.state === 'jammed') {
        jam();
        const pairs = st.overlaps.slice(0, 2);
        return { ok: false, note: 'Laid flat, two faces land on top of each other. Hinge one of them somewhere else.',
          culprits: pairs.map(([a]) => ({ at: at(() => view.faceCentre(a)), r: 30 })) };
      }
      return { ok: false, strike: false, note: `Not yet: it still holds together. ${plural(need - cuts.length, 'more cut')} to go.` };
    },
    hint(n) {
      if (n === 1) return { text: `${F} faces hang together on ${F - 1} hinges, so a net takes ${need} cuts. Free the faces round one corner first.` };
      const p = findPlan();
      if (!p) return { text: 'These cuts cannot lead to a net that lies flat. Undo a few.' };
      const left = p.cuts.filter(e => !cuts.includes(e));
      if (n === 2) {
        const e = left.find(id => !picker.hidden(view.edgeMid(id), view.faces)) ?? left[0];
        return { text: 'One cut that works:', culprits: [{ at: at(() => view.edgeMid(e)), r: 20, note: 'cut here' }] };
      }
      marked = new Set(left);
      styles();
      return { text: 'Every cut of one good net is marked with a dashed line.' };
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
  const qs = matchEdges(net, rng, 3);
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
    frame.sub(`Edge <em>${qi + 1}</em> is cut. Click the edge it glues back to when the net folds up. ${qi + 1} of ${qs.length}.`, true);
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
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (costs the third mark)', run: peek },
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
      if (n === 1) return { text: 'Fold it in your head: the face with this edge turns up, and the edge meets the face beside it on the solid.' };
      if (n === 2) return { text: 'It glues to an edge of this face:', culprits: [{ at: at(() => view.faceCentre(q.answer.f)), r: 34 }] };
      return { text: 'This one:', culprits: [{ at: at(() => mid(seg(q.answer))), r: 16, note: 'glues to ' + (qi + 1) }] };
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
  const cands = solids.map((s, i) => {
    const lo = [0, 1].map(a => Math.min(...s.verts.map(v => v[a]))), hi = [0, 1].map(a => Math.max(...s.verts.map(v => v[a])));
    const ox = cx - row / 2 + i * gap, oy = ny1 + 2.4;
    const placed = mapSolid(s, v => [ox + (v[0] - (lo[0] + hi[0]) / 2) * k, oy + (v[1] - (lo[1] + hi[1]) / 2) * k, v[2] * k]);
    const v = addView(placed);
    const tag = labels.add([ox, oy - 1.7, 0], String.fromCharCode(65 + i), { ink: true });
    return { key: keys[i], view: v, tag, out: false };
  });
  let busy = false;

  stage.frame(stage.content, { padding: 40 });
  frame.title(TITLES.which, 'A net of ' + plural(solid.faces.length, 'face'));
  frame.sub('Fold the net in your head. Which of the four solids does it make? Click it.');
  frame.tools([
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (costs the third mark)', run: peek },
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
      if (n === 1) return { text: `The net has ${plural(solid.faces.length, 'face')}${tri ? `, ${tri} of them triangles` : ''}. Count them on each solid.` };
      if (n === 2) {
        const wrong = cands.filter(c => c.key !== item.form && !c.out).slice(0, 2);
        for (const c of wrong) { c.out = true; c.view.setAllFaces('ghost'); }
        stage.invalidate();
        return { text: 'Two of the solids are out.' };
      }
      const right = cands.find(c => c.key === item.form);
      return { text: 'This one:', culprits: [{ at: at(() => right.view.faceCentre(0)), r: 40 }] };
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

  // a new net: about half the time one face hangs from the wrong edge
  function deal() {
    view?.dispose();
    const net = tableNet(solid, rng, { pick: 'any' });
    const bad = rng() < .55 ? misfit(solid, net, rng) : null;
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
    frame.sub(`Does this net fold into the solid beside it? Net ${wins + 1} of ${rounds}.`);
    frame.tools(tools());
    viewKeys();
    stage.invalidate();
  }

  const tools = () => step === 'ask' ? [
    { id: 'yes', label: 'It folds', key: 'Y', run: () => say(true) },
    { id: 'no', label: 'It won’t fold', key: 'N', run: () => say(false) },
    { id: 'peek', label: 'Peek', key: 'P', title: 'Fold it halfway for a moment (costs the third mark)', run: peek },
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
      frame.sub('Right: it won’t. Now click a face that lands on another one.');
      frame.tools(tools()); viewKeys();
      return;
    }
    session.miss({ note: folds ? 'It doesn’t fold: one face lands where another face already is.' : 'It does fold: every cut edge finds its partner.' });
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
        session.miss({ note: 'That face folds into place. Look for one with no room.', culprits: [{ at: at(() => view.faceCentre(f)), r: 30 }] });
        next(false);
      }
    },
    check: () => ({ ok: wins >= rounds }),
    hint(n) {
      if (n === 1) return { text: 'Fold it in your head one face at a time, starting from the face on the table.' };
      if (n === 2) return { text: cur.bad ? 'Watch the faces near here:' : 'Every face has its own place on the solid. Check the triangles.', culprits: cur.bad ? [{ at: at(() => view.faceCentre(cur.bad.to.f)), r: 34 }] : [] };
      return { text: cur.bad ? 'This face is hung from the wrong edge.' : 'This net folds.', culprits: cur.bad ? [{ at: at(() => view.faceCentre(cur.bad.leaf)), r: 30 }] : [] };
    },
    async solved() { stage.frame(stage.content, { padding: 56 }); await wait(200); },
    dispose() { view?.dispose(); refView?.dispose(); },
  };
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
  sub: 'Cut solids open, match the edges that glue, and fold nets in your head: from a cube to a basilica.',
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
