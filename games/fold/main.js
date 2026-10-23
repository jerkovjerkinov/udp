// Fold & Punch: a sheet of paper on the table is folded for real, punched or
// cut with scissors, and the player says what it looks like opened.
//
// Four tasks share the paper (levels.js):
//   holes    Where are the holes? Mark them on the open sheet, then it opens
//   mirror   Which way round? An asymmetric punch: pick the open sheet of four
//   cut      Snip. A cut against a folded edge: pick the lace of four
//   reverse  Fold it yourself. Fold the paper on the table and punch it so it
//            opens into the sheet on the board
// The open sheet lives on a drafting board beside the paper.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { createPicker } from '../../src/stage/pick.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { holesQuestion, shapeQuestion, cutQuestion, reverseTarget, holesOf, chipsOf, shapeAt, punchCells, punchable,
  candidateFolds, fold, flatSheet, clip, insideBy, sideOf, centroid2, SHAPES } from '../../src/core/foldpunch.js';
import { seededRng, pick } from '../../src/core/rand.js';
import { createPaperView } from './paper3d.js';
import { PACKS } from './levels.js';

const stage = createStage(document.getElementById('stage'), { camera: { pitch: 52 * Math.PI / 180 } });
const frame = createFrame({ game: 'fold', name: 'Fold & Punch', stage });
frame.stack(true);
const red = createRedlines(stage);
const picker = createPicker(stage);

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

const TITLES = { holes: 'Where will the holes be?', mirror: 'Which way round?', cut: 'What will the cut make?', reverse: 'Can you fold it yourself?' };
const TASK_TAGS = { holes: 'holes', mirror: 'which way round', cut: 'snip', reverse: 'fold it yourself' };
const plural = (n, w) => `${n} ${n === 1 ? w : w.endsWith('ch') ? w + 'es' : w + 's'}`;
const key = (i, j) => i + ',' + j;
const unkey = k => k.split(',').map(Number);
const circle = (c, r, k = 20) => Array.from({ length: k }, (_, i) => [c[0] + r * Math.cos(i * 2 * Math.PI / k), c[1] + r * Math.sin(i * 2 * Math.PI / k)]);

function parOf(l) {
  const p = l.task === 'holes' ? 15 + l.folds * 12 + (l.punches || 1) * 8 + l.n
    : l.task === 'reverse' ? 30 + l.folds * 20 + (l.punches || 1) * 10
    : 20 + l.folds * 12;
  return Math.round(p / 5) * 5;
}

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l) })),
}));

function question(item) {
  const rng = seededRng('fold:' + (item.seed ? item.id + ':' + item.seed : item.id));
  const o = { n: item.n, folds: item.folds, diagonals: !!item.diagonals, punches: item.punches || 1, shape: item.shape };
  return item.task === 'holes' ? holesQuestion(rng, o) : item.task === 'mirror' ? shapeQuestion(rng, o)
    : item.task === 'cut' ? cutQuestion(rng, o) : reverseTarget(rng, o);
}

// the board in the side card
function openCard(title, note, { interactive = false } = {}) {
  const body = frame.card(true, title, note);
  document.querySelector('.udp-card').classList.add('is-plan', 'is-sheet');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  body.append(holder);
  const board = createBoard(holder, { yDown: true, unit: 1, sub: 1, grid: 'none', padding: 24, interactive, maxScale: 90 });
  frame.layout();
  return board;
}
function closeCard() { frame.card(false); document.querySelector('.udp-card').classList.remove('is-plan', 'is-sheet'); }

// an open sheet on the board at offset off: paper, cell grid, holes
const PAPER = '#d6d1c6';
function drawSheet(board, n, { off = [0, 0], id = 's', holes = [], grid = true, creases = [] } = {}) {
  const o = p => [p[0] + off[0], p[1] + off[1]];
  // a sheet with holes is drawn as paper, opaque, so the holes read the same on any part of the background
  const paper = holes.length > 0;
  board.polygon([o([0, 0]), o([n, 0]), o([n, n]), o([0, n])], { fill: paper ? PAPER : 'face', stroke: 'visible', id: id + 'paper', hit: false });
  if (grid) for (let k = 1; k < n; k++) {
    board.line(o([k, 0]), o([k, n]), 'guide', { id: `${id}gx${k}`, hit: false });
    board.line(o([0, k]), o([n, k]), 'guide', { id: `${id}gy${k}`, hit: false });
  }
  creases.forEach((c, i) => board.line(o(c[0]), o(c[1]), 'fold', { id: `${id}cr${i}`, hit: false }));
  holes.forEach((h, i) => board.polygon(h.map(o), { fill: '#1b1a19', stroke: null, id: `${id}h${i}`, hit: false }));
}

// a tap on the board without a drag
function onBoardTap(board, fn) {
  let down = null;
  const d = ev => { down = [ev.clientX, ev.clientY]; };
  const u = ev => { if (down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) < 6) fn(ev); down = null; };
  board.el.addEventListener('pointerdown', d);
  board.el.addEventListener('pointerup', u);
  return () => { board.el.removeEventListener('pointerdown', d); board.el.removeEventListener('pointerup', u); };
}

// where a fold line crosses the paper: [a, b] or null
function chord(outline, ln) {
  const pts = clip(outline, ln, 1).filter(p => Math.abs(ln.d[0] * (p[1] - ln.p[1]) - ln.d[1] * (p[0] - ln.p[0])) < 1e-6);
  if (pts.length < 2) return null;
  pts.sort((a, b) => (a[0] - b[0]) * ln.d[0] + (a[1] - b[1]) * ln.d[1]);
  return [pts[0], pts[pts.length - 1]];
}

// all the creases of a folding, on the open sheet (for a hint)
function creasesOf(states) {
  const out = [];
  for (const s of states.slice(1)) for (const f of s.facets) for (let i = 0; i < f.poly.length; i++) {
    const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length];
    const n = s.n;
    const border = (a[0] === b[0] && (a[0] === 0 || a[0] === n)) || (a[1] === b[1] && (a[1] === 0 || a[1] === n));
    if (!border) out.push([a, b]);
  }
  const seen = new Set();
  return out.filter(([a, b]) => { const k = [a, b].map(p => p.map(v => v.toFixed(3)).join()).sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ------------------------------------------------------------------
// the paper on the table, and the sequence that folds and punches it
// ------------------------------------------------------------------

function addPaper(n) {
  const pv = createPaperView(n);
  stage.content.add(pv.group);
  pv.show(flatSheet(n), []);
  stage.frame(pv.box(), { padding: padOf() });
  return pv;
}
const phone = matchMedia('(pointer: coarse)').matches;
const padOf = () => { const m = Math.min(stage.rect.w, stage.rect.h); return phone ? 4 : Math.max(6, Math.min(56, m * (m < 260 ? .03 : .1))); };

// frame what lies on the table now: the camera closes in as the sheet folds
// smaller (on a phone a quarter sheet would otherwise be a few pixels across)
function fitTo(pv, sheet, duration = 650) {
  const b = new THREE.Box3();
  for (const [x, y] of sheet.outline) b.expandByPoint(pv.toWorld(x, y, 0));
  b.expandByScalar(phone ? .04 : .2);
  b.max.z = Math.max(b.max.z, .3);
  return stage.frame(b, { padding: padOf(), duration });
}

// fold through the states, then punch or cut; `cancel` stops it between steps
function performer(pv, q) {
  let token = 0;
  async function run() {
    const my = ++token;
    const alive = () => my === token;
    pv.clearChips();
    pv.setMark([]);
    pv.show(q.states[0], []);
    fitTo(pv, q.states[0]);
    stage.invalidate();
    await wait(450, { essential: true });
    for (let i = 0; i < q.steps.length; i++) {
      if (!alive()) return false;
      const st = q.steps[i], A = q.states[i], B = q.states[i + 1];
      const c = chord(A.outline, st.line);
      if (c) pv.setMark([c], 'signalFold');
      stage.invalidate();
      await wait(380, { essential: true });
      if (!alive()) return false;
      pv.setMark([]);
      sfx.flap();
      await pv.foldAnim(A, B, st, { duration: 850 });
      fitTo(pv, B);
      await wait(160, { essential: true });
    }
    if (!alive()) return false;
    const last = q.states[q.states.length - 1];
    const parts = q.parts.length && Array.isArray(q.parts[0][0]) && Array.isArray(q.parts[0][0][0]) ? q.parts.flat() : q.parts;
    pv.setMark(pv.outline(parts), 'signal');
    stage.invalidate();
    await wait(500, { essential: true });
    if (!alive()) return false;
    pv.setMark([]);
    q.kind === 'cut' ? sfx.snip() : sfx.punch();
    const holes = holesOf(last, parts);
    pv.show(last, holes);
    await pv.chips(chipsOf(last, parts), last);
    sfx.tick();
    return true;
  }
  // open the folded, punched paper fold by fold
  async function open(holes) {
    ++token;
    pv.clearChips();
    pv.show(q.states[q.states.length - 1], holes);
    fitTo(pv, q.states[0], 900);
    for (let i = q.steps.length - 1; i >= 0; i--) {
      sfx.flap();
      await pv.foldAnim(q.states[i], q.states[i + 1], q.steps[i], { reverse: true, duration: 800 });
      await wait(90, { essential: true });
    }
    sfx.thud();
  }
  return { run, open, cancel: () => { token++; } };
}

// ------------------------------------------------------------------
// task: where are the holes
// ------------------------------------------------------------------

function holesTask(item, q) {
  const n = q.n;
  const pv = addPaper(n);
  q.kind = 'punch';
  const perf = performer(pv, q);
  const board = openCard('Open sheet', `${n} × ${n}`);
  drawSheet(board, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) board.polygon([[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], { fill: 'none', stroke: null, id: 'cell' + key(i, j), cell: key(i, j) });
  board.fit();
  const marked = new Set();
  const want = new Set(q.holes);
  let busy = false;

  function refresh() {
    frame.sub(`Watch the paper fold and get punched. Turn the folded stack to count its layers, then tap every spot on the open sheet where a hole will be.<span class="udp-count"><em>${marked.size}</em> ${marked.size === 1 ? 'hole' : 'holes'} marked</span>`, true);
    frame.primary({ label: 'Open', run: () => session.check(), disabled: !marked.size, ready: false });
  }
  function toggle(k) {
    if (busy) return;
    red.clear();
    if (marked.has(k)) { marked.delete(k); board.remove('m' + k); sfx.tick(); }
    else { marked.add(k); const [i, j] = unkey(k); board.polygon(circle([i + .5, j + .5], .27), { fill: 'signal', stroke: 'signalThin', id: 'm' + k, hit: false }); sfx.pencil(); }
    refresh();
  }
  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.cell }); if (h) toggle(h.item.cell); });

  frame.title(TITLES.holes, item.name);
  frame.tools([
    { id: 'replay', label: 'Replay', key: 'P', run: () => perf.run() },
    { id: 'clear', label: 'Clear', key: 'C', run: () => { for (const k of [...marked]) toggle(k); } },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();
  perf.run();

  return {
    board, pv, toggle,
    _answer: () => [...want],
    check() {
      const extra = [...marked].filter(k => !want.has(k)), missing = [...want].filter(k => !marked.has(k));
      if (!extra.length && !missing.length) return { ok: true };
      const parts = [];
      if (missing.length) parts.push(`${missing.length === 1 ? 'one hole is' : `${missing.length} holes are`} still missing`);
      if (extra.length) parts.push(`${extra.length === 1 ? 'one mark is' : `${extra.length} marks are`} where the paper stays whole`);
      return { ok: false, note: 'Not quite: ' + parts.join(', and ') + '.', culprits: extra.slice(0, 3).map(k => { const [i, j] = unkey(k); return { at: () => board.toClient([i + .5, j + .5]), r: 20 }; }) };
    },
    hint(k) {
      if (k === 1) return { text: `With ${plural(q.steps.length, 'fold')}, the punch goes through as many as ${2 ** q.steps.length} layers. As each fold opens, every hole is mirrored across its crease.` };
      if (k === 2) { creasesOf(q.states).forEach((c, i) => board.line(c[0], c[1], 'signalFold', { id: 'hc' + i, hit: false })); return { text: 'The creases are now dashed in on the open sheet.' }; }
      const k1 = [...want].find(x => !marked.has(x));
      if (!k1) return { text: 'You have marked every hole. Now take off the extra marks.' };
      const [i, j] = unkey(k1);
      return { text: 'There is a hole here.', culprits: [{ at: () => board.toClient([i + .5, j + .5]), r: 20 }] };
    },
    async solved() {
      busy = true;
      perf.cancel();
      await perf.open(pv.holes.length ? pv.holes : q.punches.flatMap(p => holesOf(q.states[q.states.length - 1], shapeAt('round', p))));
      await wait(300);
    },
    dispose() { perf.cancel(); offTap(); board.dispose(); closeCard(); pv.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: which way round, and snip (pick one of four open sheets)
// ------------------------------------------------------------------

function pickTask(item, q) {
  const n = q.n;
  const pv = addPaper(n);
  q.kind = item.task === 'cut' ? 'cut' : 'punch';
  const perf = performer(pv, q);
  const board = openCard('Four sheets', 'one is right');
  const gap = 1.1;
  q.options.forEach((o, i) => {
    o.off = [(i % 2) * (n + gap), Math.floor(i / 2) * (n + gap + .6)];
    drawSheet(board, n, { off: o.off, id: 'o' + i, holes: o.holes, grid: false });
    board.polygon([o.off, [o.off[0] + n, o.off[1]], [o.off[0] + n, o.off[1] + n], [o.off[0], o.off[1] + n]], { fill: 'none', stroke: null, id: 'opt' + i, opt: i });
    board.text([o.off[0] + n / 2, o.off[1] + n + .45], String.fromCharCode(65 + i), { id: 'tag' + i, color: '#e9e6df' });
  });
  board.fit();
  let chosen = -1, hoverOpt = -1;

  function choose(i) {
    const o = q.options[i];
    if (!o || o.out || chosen >= 0) return;
    if (o.ok) { chosen = i; board.update('opt' + i, { fill: 'signal' }); session.check(); return; }
    o.out = true;
    board.update('opt' + i, { fill: 'rgba(15, 15, 14, .6)' });
    session.miss({ note: `Not ${String.fromCharCode(65 + i)}: ${o.why}.`, culprits: [{ at: () => board.toClient([o.off[0] + n / 2, o.off[1] + n / 2]), r: 30 }] });
  }
  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined }); if (h) choose(h.item.opt); });
  const move = ev => {
    const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined });
    const i = h ? h.item.opt : -1;
    if (i === hoverOpt || chosen >= 0) return;
    if (hoverOpt >= 0 && !q.options[hoverOpt].out) board.update('opt' + hoverOpt, { fill: 'none' });
    hoverOpt = i;
    if (i >= 0 && !q.options[i].out) board.update('opt' + i, { fill: 'rgba(15, 15, 14, .16)' });
  };
  board.el.addEventListener('pointermove', move);

  const what = item.task === 'cut' ? `The scissors cut a ${SHAPES[q.shape].name} into the folded edge.` : `The punch is ${SHAPES[q.shape].name === 'L' || SHAPES[q.shape].name === 'F' ? 'an' : 'a'} ${SHAPES[q.shape].name}, which looks different in a mirror.`;
  frame.title(TITLES[item.task], item.name);
  frame.sub(`${what} Which of these sheets will you see when it opens? Tap it, or press A to D.`);
  frame.tools([
    { id: 'replay', label: 'Replay', key: 'P', run: () => perf.run() },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
    ...q.options.map((_, i) => ({ id: 'c' + i, label: String.fromCharCode(65 + i), key: String.fromCharCode(65 + i), hidden: true, run: () => choose(i) })),
  ]);
  viewKeys();
  perf.run();

  return {
    board, pv, choose,
    _answer: () => q.options.findIndex(o => o.ok),
    check: () => ({ ok: chosen >= 0 }),
    hint(k) {
      if (k === 1) return { text: item.task === 'cut' ? 'A cut into a folded edge opens into a shape mirrored across that crease. Open the folds one at a time, starting with the last.' : 'Open the last fold first. Each crease mirrors the shape, so after two folds, two copies are mirrored and one is turned round.' };
      if (k === 2) {
        const o = q.options.find(x => !x.ok && !x.out);
        if (o) { o.out = true; board.update('opt' + q.options.indexOf(o), { fill: 'rgba(15, 15, 14, .6)' }); }
        return { text: 'One of the wrong sheets is crossed out for you.' };
      }
      const i = q.options.findIndex(o => o.ok);
      return { text: 'It is this one.', culprits: [{ at: () => board.toClient([q.options[i].off[0] + n / 2, q.options[i].off[1] + n / 2]), r: 40 }] };
    },
    async solved() {
      perf.cancel();
      await perf.open(q.options[chosen].holes);
      await wait(300);
    },
    dispose() { perf.cancel(); offTap(); board.el.removeEventListener('pointermove', move); board.dispose(); closeCard(); pv.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: fold it yourself
// ------------------------------------------------------------------

function reverseTask(item, q) {
  const n = q.n;
  const pv = addPaper(n);
  const want = new Set(q.holes);
  const board = openCard('Make this sheet', plural(q.holes.length, 'hole'));
  const targetHoles = q.holes.map(k => { const [i, j] = unkey(k); return circle([i + .5, j + .5], .27); });
  drawSheet(board, n, { holes: targetHoles });
  board.fit();

  // the player's folding: states and steps, then punches
  let states = [flatSheet(n)], steps = [], punches = [], busy = false;
  const cur = () => states[states.length - 1];
  let hover = null;

  function refresh() {
    const left = q.punches - punches.length;
    frame.sub(punches.length
      ? `${left > 0 ? `You can punch ${left === 1 ? 'once more' : `${left} more times`}, or open` : 'Open'} the paper to see what you made.<span class="udp-count">${punches.length} / ${q.punches} ${q.punches === 1 ? 'punch' : 'punches'}</span>`
      : `Fold the paper so that ${q.punches > 1 ? `${q.punches} punches make` : 'one punch makes'} the sheet shown on the board. Tap a crease line to fold the side you tapped over it, then tap a square to punch through.`, true);
    frame.primary({ label: 'Open', run: () => session.check(), disabled: !punches.length || busy, ready: punches.length === q.punches });
    frame.tool('undo', { off: !steps.length && !punches.length });
  }

  // what the pointer would do: { fold: candidate, seg } | { punch: q } | null
  function aimAt(ev) {
    const v = picker.plane(ev, { normal: [0, 0, 1], point: [0, 0, pv.topZ()] });
    if (!v) return null;
    const p = pv.toSheet(v);
    const st = cur();
    const inside = insideBy(st.outline, p);
    if (inside < -.15) return null;
    if (!punches.length) {
      // the nearest lattice line through the paper
      const cands = candidateFolds(st, !!item.diagonals);
      let best = null;
      for (const c of cands) {
        const ln = c.line;
        const d = Math.abs(ln.d[0] * (p[1] - ln.p[1]) - ln.d[1] * (p[0] - ln.p[0])) / Math.hypot(ln.d[0], ln.d[1]);
        if (d > .22) continue;
        if (sideOf(ln, p) !== c.moving) continue;
        if (!best || d < best.d) best = { d, c };
      }
      if (best) return { fold: best.c, seg: chord(st.outline, best.c.line) };
    }
    if (punches.length < q.punches && inside > 0) {
      const c = [Math.floor(p[0]) + .5, Math.floor(p[1]) + .5];
      return { punch: c, ok: punchable(st, c) };
    }
    return null;
  }

  function showAim(a) {
    hover = a;
    if (!a) { pv.setHover([]); pv.setMark([]); }
    else if (a.fold) {
      pv.setHover(a.seg ? [a.seg] : [], 'signalFold');
      const flap = clip(cur().outline, a.fold.line, a.fold.moving);
      pv.setMark(pv.outline([flap]), 'hover');
    } else { pv.setHover([]); pv.setMark(pv.outline([circle(a.punch, .27)]), a.ok ? 'signal' : 'hover'); }
    stage.canvas.style.cursor = a ? 'pointer' : '';
    stage.invalidate();
  }
  const move = ev => { if (ev.buttons || busy) return; showAim(aimAt(ev)); };
  stage.canvas.addEventListener('pointermove', move);

  async function act(ev) {
    if (busy) return;
    const a = aimAt(ev);
    if (!a) return;
    showAim(null);
    if (a.fold) {
      busy = true;
      const r = fold(cur(), a.fold.line, a.fold.moving);
      sfx.flap();
      await pv.foldAnim(cur(), r.sheet, r.step, { duration: 700 });
      states.push(r.sheet); steps.push(r.step);
      fitTo(pv, r.sheet);
      busy = false;
    } else if (a.punch) {
      if (!a.ok) { frame.say('That’s right on a crease. Punch inside a square instead.', { ms: 2000 }); sfx.error(); return; }
      punches.push(a.punch);
      sfx.punch();
      const st = cur();
      const parts = punches.map(p => shapeAt('round', p));
      pv.show(st, parts.flatMap(P => holesOf(st, P)));
      await pv.chips(chipsOf(st, shapeAt('round', a.punch)), st);
    }
    refresh();
  }

  async function undo() {
    if (busy) return;
    red.clear();
    if (punches.length) {
      punches.pop();
      const st = cur();
      pv.clearChips();
      pv.show(st, punches.flatMap(p => holesOf(st, shapeAt('round', p))));
      sfx.tick();
    } else if (steps.length) {
      busy = true;
      const B = states.pop(), st = steps.pop();
      sfx.flap();
      await pv.foldAnim(cur(), B, st, { reverse: true, duration: 600 });
      fitTo(pv, cur());
      busy = false;
    }
    refresh();
  }
  async function reset() {
    if (busy) return;
    while (punches.length || steps.length) await undo();
  }

  const cells = () => new Set(punches.flatMap(p => punchCells(cur(), p)));
  async function openAll() {
    busy = true;
    const st = cur();
    const holes = punches.flatMap(p => holesOf(st, shapeAt('round', p)));
    pv.show(st, holes);
    fitTo(pv, states[0], 900);
    for (let i = steps.length - 1; i >= 0; i--) { sfx.flap(); await pv.foldAnim(states[i], states[i + 1], steps[i], { reverse: true, duration: 700 }); }
    sfx.thud();
    busy = false;
  }
  async function refold() {
    busy = true;
    for (let i = 0; i < steps.length; i++) { sfx.flap(); await pv.foldAnim(states[i], states[i + 1], steps[i], { duration: 500 }); }
    const st = cur();
    pv.show(st, punches.flatMap(p => holesOf(st, shapeAt('round', p))));
    fitTo(pv, st);
    busy = false;
    refresh();
  }

  frame.title(TITLES.reverse, item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'reset', label: 'Flat again', key: 'R', run: reset },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  return {
    board, pv,
    tap: act,
    // for tests: fold and punch as the stored solution does
    async _play() {
      for (const st of q.solution.steps) {
        const r = fold(cur(), st.line, st.moving);
        await pv.foldAnim(cur(), r.sheet, r.step, { duration: 200 });
        states.push(r.sheet); steps.push(r.step);
      }
      for (const p of q.solution.punches) punches.push(p);
      refresh();
    },
    check() {
      const got = cells();
      const extra = [...got].filter(k => !want.has(k)), missing = [...want].filter(k => !got.has(k));
      if (!extra.length && !missing.length) return { ok: true };
      // show what this folding makes, beside the target, then fold it back up
      (async () => {
        await openAll();
        for (const k of got) { const [i, j] = unkey(k); board.polygon(circle([i + .5, j + .5], .2), { fill: 'none', stroke: 'signalThin', id: 'got' + k, hit: false }); }
        await wait(1700, { essential: true });
        for (const k of got) board.remove('got' + k);
        await refold();
      })();
      return { ok: false, note: `That makes ${plural(got.size, 'hole')}. ${missing.length ? `${missing.length === 1 ? 'One hole' : `${missing.length} holes`} from the sheet ${missing.length === 1 ? 'is' : 'are'} missing` : ''}${missing.length && extra.length ? ', and ' : ''}${extra.length ? `${extra.length === 1 ? 'one lands' : `${extra.length} land`} where the sheet has none` : ''}.` };
    },
    hint(k) {
      const s = q.solution;
      if (k === 1) return { text: `The sheet has ${plural(want.size, 'hole')} from ${plural(q.punches, 'punch')}, so the paper was ${want.size / q.punches} layers thick, which takes ${s.steps.length} ${s.steps.length === 1 ? 'fold' : 'folds'}. Look for the lines the holes are mirrored across.` };
      if (k === 2) {
        const c = chord(flatSheet(n).outline, s.steps[0].line);
        if (c) board.line(c[0], c[1], 'signalFold', { id: 'hint1', hit: false });
        return { text: 'The first fold is now dashed in on the board.' };
      }
      creasesOf(s.states).forEach((c, i) => board.line(c[0], c[1], 'signalFold', { id: 'hc' + i, hit: false }));
      return { text: 'Every crease of one way that works is now dashed in.' };
    },
    async solved() { pv.setHover([]); pv.setMark([]); await openAll(); await wait(300); },
    dispose() { stage.canvas.removeEventListener('pointermove', move); stage.canvas.style.cursor = ''; board.dispose(); closeCard(); pv.dispose(); },
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
    { key: 'T', label: 'Look straight down', run: () => stage.rig.setView(stage.rig.yaw, 86 * Math.PI / 180) },
    { key: 'S', label: 'Look along the table to count the layers', run: () => stage.rig.setView(stage.rig.yaw, 9 * Math.PI / 180) },
  ]);
}

// ------------------------------------------------------------------
// the game definition for the session
// ------------------------------------------------------------------

let task = null;
function load(item) {
  task?.dispose();
  red.clear();
  stage.clear();
  frame.primaryEl.style.display = item.task === 'holes' || item.task === 'reverse' ? '' : 'none';
  const q = question(item);
  if (!q) { frame.sub('Something went wrong setting up this sheet. Please try the next one.'); return; }
  task = item.task === 'holes' ? holesTask(item, q) : item.task === 'reverse' ? reverseTask(item, q) : pickTask(item, q);
}

// workshop: fold anything, punch anything, open it
function openWorkshop() {
  task?.dispose();
  red.clear(); stage.clear();
  frame.primaryEl.style.display = '';
  const item = { id: 'W', name: 'Free folding', n: 6, folds: 4, diagonals: true, punches: 99 };
  const q = { n: 6, punches: 99, holes: [], solution: { steps: [], punches: [], states: [flatSheet(6)] } };
  task = reverseTask(item, q);
  frame.title('Free folding', 'Any fold, any punch');
  frame.card(true, 'Workshop', 'fold, punch, open');
  frame.primary({ label: 'Open', run: () => task.check?.() });
}

// generated puzzles
function generate(rng, difficulty) {
  const d = difficulty;
  const n = d <= 3 ? 4 : d <= 6 ? 6 : 8;
  const folds = d <= 2 ? 1 : d <= 4 ? 2 : d <= 7 ? 3 : 4;
  const diagonals = d >= 4 && rng() < .5;
  const task = pick(rng, d <= 2 ? ['holes', 'mirror', 'holes'] : ['holes', 'mirror', 'cut', 'holes', d >= 5 ? 'reverse' : 'cut']);
  const shape = task === 'mirror' ? pick(rng, ['ell', 'eff', 'tri', 'moon']) : task === 'cut' ? pick(rng, ['notch', 'house', 'step', 'flag', 'arch']) : 'round';
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = { id: 'g' + seed, seed, task, name: 'Generated sheet', n, folds: task === 'reverse' ? Math.min(folds, 2) : folds, diagonals, punches: task === 'holes' && d >= 5 ? 2 : 1, shape };
  return { ...item, label: `Generated sheet · ${TASK_TAGS[task]}`, par: parOf(item) };
}

const def = {
  id: 'fold', prefix: 'F', name: 'Fold & Punch',
  lead: 'Fold it, punch it, open it.',
  sub: 'Fold a sheet of paper, punch it or snip it, and work out what it will look like before it opens.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  workshop: openWorkshop,
  dailyDifficulty: 5,
};

const session = createSession({ def, frame, stage, redlines: red });
stage.rig.onTap(ev => task?.tap?.(ev));
session.start();
window.__udp = { stage, session, get task() { return task; } };
