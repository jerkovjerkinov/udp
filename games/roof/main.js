// Roof Plans: hip roofs over building footprints, read and drawn as plans.
//
// The screen has two halves that always talk to each other: the plaster
// building in 3D, and the roof plan on a large drafting board beside it.
// Pointing at a line on the plan lights the same crease on the roof.
//
// Six tasks (levels.js):
//   which      Which plan? Three plans of one footprint; one is right
//   error      Spot the error: a drafted plan with wrong lines; tap them
//   name       Name the lines: tap each line until it says ridge, hip or valley
//   draw       Roof to plan: look at the roof, draw its plan on the footprint
//   construct  Construct the plan: the roof is a flat lid until the plan is right
//   brief      Design to brief: paint a footprint whose roof meets the brief
// Every solved sheet ends with the roof rising and rain running off it.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage, plasterMaterial } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { lineStyle, createLines } from '../../src/stage/lines.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { animate, ease, wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { roofOf, footprintFrom, randomFootprint, S } from '../../src/core/roof.js';
import { stepKey, stepsOf, snapLine, mergeSteps, parseStep } from '../../src/core/lattice.js';
import { mutate, planLines, compareSteps, meets, roofStats, goodFootprint } from '../../src/core/rooftasks.js';
import { seededRng, pick, randInt, shuffle } from '../../src/core/rand.js';
import { createRoofModel, createRain, KIND_STYLE, KIND_SIGNAL } from './model.js';
import { PACKS } from './levels.js';

const stage = createStage(document.getElementById('stage'));
const frame = createFrame({ game: 'roof', name: 'Roof Plans', stage });
const red = createRedlines(stage);
frame.stack(true);

// ------------------------------------------------------------------
// small helpers
// ------------------------------------------------------------------

const touchScreen = matchMedia('(pointer: coarse)').matches;
const TITLES = { which: 'Which plan is right?', error: 'Can you spot the mistakes?', name: 'What is each line?', draw: 'Can you draw its plan?', construct: 'Can you work out the plan?', brief: 'Can you design to the brief?' };
const TASK_TAGS = { which: 'which plan', error: 'spot the error', name: 'name the lines', draw: 'roof to plan', construct: 'construct', brief: 'design to brief' };
const KIND_NAMES = { ridge: 'ridge', hip: 'hip', valley: 'valley' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const key = (i, j) => i + ',' + j;
const unkey = k => k.split(',').map(Number);
const add2 = (p, o) => [p[0] + o[0], p[1] + o[1]];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// a world point as a client point that follows the camera (redlines)
const at3 = p => () => {
  const P = typeof p === 'function' ? p() : p;
  const [x, y, z] = stage.project(P);
  if (z > 1) return null;
  const r = stage.canvas.getBoundingClientRect();
  return [x + r.left, y + r.top];
};

const rowsOf = cells => {
  let w = 0, h = 0;
  for (const k of cells) { const [i, j] = unkey(k); w = Math.max(w, i + 1); h = Math.max(h, j + 1); }
  return Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => cells.has(key(i, j)) ? '#' : '.').join(''));
};

// the par time in seconds
function parOf(item) {
  if (item.task === 'brief') return 120;
  const n = roofOf(footprintFrom(item.rows).cells).lines.length;
  const p = item.task === 'which' ? 25 + n * 2 : item.task === 'error' ? 20 + n * 2 + 10 * (item.errors || 1)
    : item.task === 'name' ? 15 + n * 4 : item.task === 'draw' ? 25 + n * 5 : 35 + n * 6;
  return Math.round(p / 5) * 5;
}

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l), note: l.learn })),
}));

// ------------------------------------------------------------------
// the plan card: a large drafting board beside the model
// ------------------------------------------------------------------

function legendHTML() {
  const sw = (style, label) => {
    const st = lineStyle(style, 'sheet');
    return `<span class="rf-key"><svg width="34" height="8" viewBox="0 0 34 8"><line x1="1" y1="4" x2="33" y2="4" stroke="${st.color}" stroke-width="${st.width}" ${st.dash ? `stroke-dasharray="${st.dash.join(' ')}"` : ''}/></svg>${label}</span>`;
  };
  return sw('profile', 'eave') + sw('ridge', 'ridge') + sw('fold', 'hip') + sw('mountain', 'valley');
}

// the open card's board, so load() can size the card to it on a phone
let sheet = null;
function openCard(title, note, { interactive = false } = {}) {
  const body = frame.card(true, title, note);
  document.querySelector('.udp-card').classList.add('is-plan');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  const legend = document.createElement('div');
  legend.className = 'rf-legend';
  legend.innerHTML = legendHTML();
  body.append(holder, legend);
  const board = createBoard(holder, { yDown: true, unit: S, sub: S, grid: 'dots', padding: 26, interactive, maxScale: 60 });
  frame.layout();
  sheet = board;
  return board;
}
function closeCard() {
  sheet = null;
  frame.card(false);
  document.querySelector('.udp-card').classList.remove('is-plan');
}

// the footprint: cell fills and the eave line
function drawFootprint(board, roof, { off = [0, 0], id = 'fp', fill = 'face' } = {}) {
  for (const k of roof.cells) {
    const [i, j] = unkey(k);
    const p = [S * i + off[0], S * j + off[1]];
    board.polygon([p, [p[0] + S, p[1]], [p[0] + S, p[1] + S], [p[0], p[1] + S]], { fill, stroke: null, id: `${id}c${k}`, hit: false });
  }
  const eaves = mergeSteps(new Map(roof.eaves.map(([a, b]) => [stepKey(a, b), 'e'])));
  eaves.forEach((l, n) => board.line(add2(l.a, off), add2(l.b, off), 'profile', { id: `${id}e${n}`, hit: false }));
}

// plan lines [{ a, b, kind }]; style(l, i) picks the line type
function drawPlan(board, lines, { off = [0, 0], id = 'pl', style = l => KIND_STYLE[l.kind], hit = true } = {}) {
  lines.forEach((l, i) => board.line(add2(l.a, off), add2(l.b, off), style(l, i), { id: `${id}${i}`, ref: i, line: l, hit }));
}

// a tap on the board (press and release without moving): fn(ev)
function onBoardTap(board, fn) {
  let down = null;
  const d = ev => { down = [ev.clientX, ev.clientY]; };
  const u = ev => { if (down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) < 6) fn(ev); down = null; };
  board.el.addEventListener('pointerdown', d);
  board.el.addEventListener('pointerup', u);
  return () => { board.el.removeEventListener('pointerdown', d); board.el.removeEventListener('pointerup', u); };
}

// pointing at a plan line lights it on the roof
function linkHover(board, model, { filter = it => it.line, style = 'hover', onHover } = {}) {
  let cur = null;
  const move = ev => {
    if (ev.buttons) return;
    const h = board.hit(ev, { kinds: ['seg'], filter, tol: 10 });
    const id = h ? h.id : null;
    if (id === cur) return;
    cur = id;
    model?.overlay('hover', h ? [[h.item.line.a, h.item.line.b]] : [], style);
    onHover?.(h);
    stage.invalidate();
  };
  const leave = () => { if (cur !== null) { cur = null; model?.overlay('hover', [], style); onHover?.(null); stage.invalidate(); } };
  board.el.addEventListener('pointermove', move);
  board.el.addEventListener('pointerleave', leave);
  return () => { board.el.removeEventListener('pointermove', move); board.el.removeEventListener('pointerleave', leave); };
}

// the building in 3D
function addModel(roof, opts) {
  const m = createRoofModel(roof, opts);
  stage.content.add(m.group);
  stage.invalidate();
  return m;
}
function frameModel(m, padding = null) {
  const r = stage.rect;
  stage.frame(m.box(), { padding: padding ?? Math.max(8, Math.min(64, Math.min(r.w, r.h) * .1)) });
}

// the roof rises from a flat lid to its pitch
function raise(m, to = m.pitch, duration = 1100) {
  const from = m.k;
  if (Math.abs(to - from) < 1e-3) return Promise.resolve();
  sfx.slide();
  return animate({ duration, ease: ease.backOut, essential: true, update: v => { m.setK(from + (to - from) * v); stage.invalidate(); } }).promise;
}

// what every solved sheet ends with: the roof up, its creases in their types, rain
async function finale(m, { rainFor = 2600 } = {}) {
  if (!m) return;
  m.creaseStyle('kind');
  m.overlay('hover', []);
  await raise(m);
  sfx.thud();
  const rain = createRain(m);
  rain.start();
  stage.rig.frameTurn(null, -1);
  await wait(rainFor, { essential: true });
  rain.stop();
  await wait(700, { essential: true });
  rain.dispose();
  stage.invalidate();
}

// is a lattice step inside the footprint (not on the eave)?
function inside(roof, s) {
  const [a, b] = parseStep(s);
  const m = mid(a, b);
  if (a[0] !== b[0] && a[1] !== b[1]) return roof.squares.has(key(Math.floor(m[0]), Math.floor(m[1])));
  if (a[1] === b[1]) return roof.squares.has(key(Math.floor(m[0]), m[1] - 1)) && roof.squares.has(key(Math.floor(m[0]), m[1]));
  return roof.squares.has(key(m[0] - 1, Math.floor(m[1]))) && roof.squares.has(key(m[0], Math.floor(m[1])));
}

// ------------------------------------------------------------------
// task: which plan
// ------------------------------------------------------------------

function whichTask(item, roof) {
  const rng = seededRng('which:' + item.id + ':' + (item.seed ?? ''));
  const model = addModel(roof);
  frameModel(model);
  const right = planLines(roof);
  const sig = ls => ls.map(l => stepsOf(l.a, l.b).map(s => s + l.kind).join()).sort().join(';');
  const wrong = [];
  const seen = new Set([sig(right)]);
  for (let t = 0; t < 40 && wrong.length < 2; t++) {
    const m = mutate(roof, rng, 1);
    const s = sig(m.lines);
    if (seen.has(s)) continue;
    seen.add(s); wrong.push(m.lines);
  }
  const opts = shuffle(rng, [{ lines: right, ok: true }, ...wrong.map(lines => ({ lines, ok: false, why: lines.find(l => l.wrong) }))]);
  const W = roof.w * S, H = roof.h * S;
  const tall = H > W * 1.05;
  const off = i => tall ? [i * (W + 3), 0] : [0, i * (H + 3.4)];
  const board = openCard('Three plans', 'one is right');
  opts.forEach((o, i) => {
    o.off = off(i);
    board.polygon([o.off, add2(o.off, [W, 0]), add2(o.off, [W, H]), add2(o.off, [0, H])], { fill: 'none', stroke: null, id: 'opt' + i, opt: i });
    drawFootprint(board, roof, { off: o.off, id: 'f' + i });
    drawPlan(board, o.lines, { off: o.off, id: `o${i}l`, hit: false });
    board.text(tall ? add2(o.off, [W / 2, H + 1.1]) : add2(o.off, [-1.2, H / 2]), String.fromCharCode(65 + i), { id: 'tag' + i, color: '#e9e6df' });
  });
  board.fit();
  let chosen = -1, hoverOpt = -1;

  function setOpt(i, fill) { board.update('opt' + i, { fill }); }
  function choose(i) {
    const o = opts[i];
    if (!o || o.out || chosen >= 0) return;
    if (o.ok) { chosen = i; setOpt(i, 'signal'); session.check(); return; }
    o.out = true;
    setOpt(i, 'none');
    o.lines.forEach((l, n) => board.update(`o${i}l${n}`, { style: l.wrong ? KIND_SIGNAL[l.kind] : 'guide' }));
    const w = o.why;
    session.miss({ note: `Not plan ${String.fromCharCode(65 + i)}. It has ${w.why}.`, culprits: [{ at: () => board.toClient(add2(mid(w.a, w.b), o.off)), r: 22 }] });
  }

  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined }); if (h) choose(h.item.opt); });
  const move = ev => {
    const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined });
    const i = h ? h.item.opt : -1;
    if (i === hoverOpt || chosen >= 0) return;
    if (hoverOpt >= 0 && !opts[hoverOpt].out) setOpt(hoverOpt, 'none');
    hoverOpt = i;
    if (i >= 0 && !opts[i].out) setOpt(i, 'ghost');
  };
  board.el.addEventListener('pointermove', move);

  frame.title(TITLES.which, item.name);
  frame.sub('Only one of these three plans shows this roof correctly, with every hip, valley and ridge in the right place. Tap the one you think it is.');
  frame.tools([
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
    ...opts.map((_, i) => ({ id: 'c' + i, label: String.fromCharCode(65 + i), key: String.fromCharCode(65 + i), hidden: true, run: () => choose(i) })),
  ]);
  viewKeys();

  return {
    model, board,
    _answer: () => opts.findIndex(o => o.ok),
    choose,
    check: () => ({ ok: chosen >= 0 }),
    hint(n) {
      if (n === 1) return { text: 'Start with the outside corners. A hip runs up from each one at 45 degrees, and each inside corner sends up a valley.' };
      if (n === 2) {
        const o = opts.find(x => !x.ok && !x.out);
        if (o) { o.out = true; o.lines.forEach((l, k) => board.update(`o${opts.indexOf(o)}l${k}`, { style: 'guide' })); }
        return { text: 'One of the wrong plans is crossed out for you.' };
      }
      const i = opts.findIndex(o => o.ok);
      return { text: 'It is this one.', culprits: [{ at: () => board.toClient(add2(opts[i].off, [W / 2, H / 2])), r: 40 }] };
    },
    solved: () => finale(model),
    dispose() { offTap(); board.el.removeEventListener('pointermove', move); board.dispose(); closeCard(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: spot the error
// ------------------------------------------------------------------

function errorTask(item, roof) {
  const rng = seededRng('error:' + item.id + ':' + (item.seed ?? ''));
  const n = item.errors || 1;
  const model = addModel(roof);
  frameModel(model);
  const { lines } = mutate(roof, rng, n);
  const board = openCard('Drafted plan', plural(n, 'mistake'));
  drawFootprint(board, roof);
  drawPlan(board, lines);
  board.fit();
  const found = new Set();
  const offHover = linkHover(board, model, { filter: it => it.line && !found.has(it.ref) });

  function sub() { frame.sub(`A student drew this roof plan and made <em>${n === 1 ? 'one mistake' : `${n} mistakes`}</em>. A line may be the wrong kind, run too far or stop short. Compare it with the roof and tap what is wrong.<span class="udp-count"><em>${found.size}</em> / ${n} found</span>`, true); }

  const offTap = onBoardTap(board, ev => {
    const h = board.hit(ev, { kinds: ['seg'], filter: it => it.line, tol: 12 });
    if (!h) return;
    const i = h.item.ref, l = lines[i];
    if (found.has(i)) return;
    if (l.wrong) {
      found.add(i);
      sfx.step(found.size - 1);
      board.update('pl' + i, { style: KIND_SIGNAL[l.kind] });
      board.text(mid(l.a, l.b), l.why, { id: 'why' + i, signal: true, dy: -12, hit: false });
      sub();
      if (found.size >= n) session.check();
      return;
    }
    const why = l.kind === 'hip' ? 'That hip is fine. It runs up from an outside corner at 45 degrees, as it should.'
      : l.kind === 'valley' ? 'That valley is fine. It rises from an inside corner, as it should.'
      : 'That ridge is fine. It is level and sits between the two slopes.';
    session.miss({ note: why, culprits: [{ at: () => board.toClient(mid(l.a, l.b)), r: 16 }] });
  });

  frame.title(TITLES.error, item.name);
  sub();
  frame.tools([{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]);
  viewKeys();

  const left = () => lines.map((l, i) => ({ l, i })).filter(x => x.l.wrong && !found.has(x.i));
  return {
    model, board,
    _answer: () => left().map(x => x.i),
    check: () => ({ ok: found.size >= n }),
    hint(k) {
      const x = left()[0];
      if (!x) return null;
      if (k === 1) return { text: 'A ridge is level and sits halfway between two eaves. Hips start at outside corners and valleys at inside corners.' };
      if (k === 2) return { text: 'Have a look around here.', culprits: [{ at: () => board.toClient(mid(x.l.a, x.l.b)), r: 46 }] };
      return { text: 'Here, ' + x.l.why + '.', culprits: [{ at: () => board.toClient(mid(x.l.a, x.l.b)), r: 16 }] };
    },
    solved: () => finale(model),
    dispose() { offTap(); offHover(); board.dispose(); closeCard(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: name the lines
// ------------------------------------------------------------------

function nameTask(item, roof) {
  const show = item.model !== false;
  const model = addModel(roof, { rise: show ? 1 : 0, creases: 'plain' });
  frameModel(model);
  const lines = planLines(roof);
  const named = lines.map(() => null);
  const board = openCard('Roof plan', show ? 'name every line' : 'no model: plan only');
  drawFootprint(board, roof);
  drawPlan(board, lines, { style: () => 'visible' });
  lines.forEach((l, i) => board.text(mid(l.a, l.b), '?', { id: 'q' + i, signal: true, dy: -10, hit: false }));
  board.fit();
  let hover = null;
  const offHover = linkHover(board, show ? model : null, { onHover: h => { hover = h ? h.item.ref : null; } });
  const ORDER = ['ridge', 'hip', 'valley'];

  function set(i, kind) {
    named[i] = kind;
    board.update('pl' + i, { style: kind ? KIND_STYLE[kind] : 'visible' });
    board.update('q' + i, { text: kind ? kind.toUpperCase() : '?', signal: !kind, color: '#8d8a83' });
    sfx.tick();
    refresh();
  }
  const cycle = i => set(i, ORDER[(ORDER.indexOf(named[i]) + 1) % 3]);
  function refresh() {
    const done = named.filter(Boolean).length;
    frame.sub(`Every line in this roof plan is a ridge, a hip or a valley. Tap a line to name it, and tap again to change your answer.${show ? '' : ' This time there is no model, so read it from the plan alone.'}${touchScreen ? '' : ' You can also point at a line and press 1, 2 or 3.'}<span class="udp-count"><em>${done}</em> / ${lines.length} named</span>`, true);
    frame.primary({ label: 'Check', run: () => session.check(), disabled: done < lines.length, ready: done === lines.length });
  }

  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['seg'], filter: it => it.line, tol: 12 }); if (h) cycle(h.item.ref); });

  frame.title(TITLES.name, item.name);
  frame.tools([{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]);
  frame.keys([
    { key: '1', label: 'The line under the pointer is a ridge', run: () => hover !== null && set(hover, 'ridge') },
    { key: '2', label: 'The line under the pointer is a hip', run: () => hover !== null && set(hover, 'hip') },
    { key: '3', label: 'The line under the pointer is a valley', run: () => hover !== null && set(hover, 'valley') },
  ]);
  viewKeys();
  refresh();

  return {
    model, board, set,
    _answer: () => lines.map(l => l.kind),
    check() {
      const bad = lines.map((l, i) => i).filter(i => named[i] !== lines[i].kind);
      if (!bad.length) return { ok: true };
      for (const i of bad) board.update('pl' + i, { style: 'signalThin' });
      setTimeout(() => bad.forEach(i => named[i] && board.update('pl' + i, { style: KIND_STYLE[named[i]] })), 1600);
      return { ok: false, note: `${bad.length === 1 ? 'One line has' : `${bad.length} lines have`} the wrong name. They are circled.`, culprits: bad.slice(0, 3).map(i => ({ at: () => board.toClient(mid(lines[i].a, lines[i].b)), r: 16 })) };
    },
    hint(n) {
      if (n === 1) return { text: 'A ridge is level. A hip climbs from an outside corner of the walls, and a valley from an inside corner.' };
      if (n === 2) { lines.forEach((l, i) => l.kind === 'ridge' && set(i, 'ridge')); return { text: 'The ridges are now named for you.' }; }
      lines.forEach((l, i) => set(i, l.kind));
      return { text: 'Every line is now named for you.' };
    },
    solved: () => finale(model),
    dispose() { offTap(); offHover(); board.dispose(); closeCard(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: draw the plan (with the roof to look at) and construct it (without)
// ------------------------------------------------------------------

function drawTask(item, roof, { construct = false } = {}) {
  const model = addModel(roof, { rise: construct ? 0 : 1 });
  frameModel(model);
  const board = openCard('Footprint', construct ? 'construct the roof plan' : 'draw the roof plan', { interactive: true });
  drawFootprint(board, roof);
  board.fit();
  let drawn = new Set();
  const history = [];
  let guides = null;

  function render() {
    for (const it of board.items()) if (String(it.id).startsWith('d')) board.remove(it.id);
    const lines = mergeSteps(new Map([...drawn].map(s => [s, 'd'])));
    lines.forEach((l, i) => board.line(l.a, l.b, 'visible', { id: 'd' + i, line: l }));
    if (!construct) model.overlay('drawn', lines.map(l => [l.a, l.b]), 'signalThin');
    const n = lines.length;
    frame.sub(construct
      ? `All the eaves are at one height and every roof slope is the same, so the footprint decides the whole roof. Drag between points to draw the hips, valleys and ridges; tap a line to remove it. When your plan is right, the roof rises.<span class="udp-count">${plural(n, 'line')} drawn</span>`
      : `Look at the roof from a few sides, then draw its plan on the footprint. Drag between points to draw each hip, valley and ridge; tap a line to remove it.<span class="udp-count">${plural(n, 'line')} drawn</span>`, true);
    frame.primary({ label: 'Check', run: () => session.check(), disabled: !drawn.size, ready: false });
    frame.tool('undo', { off: !history.length });
    stage.invalidate();
  }

  function commit(a, b) {
    const add = stepsOf(a, b).filter(s => !drawn.has(s) && inside(roof, s));
    if (!add.length) { sfx.tick(); return; }
    history.push({ add });
    for (const s of add) drawn.add(s);
    sfx.pencil();
    red.clear();
    render();
  }
  function erase(ev) {
    const h = board.hit(ev, { kinds: ['seg'], filter: it => String(it.id).startsWith('d'), tol: 10 });
    if (!h) return;
    const del = h.item.line.steps;
    history.push({ del });
    for (const s of del) drawn.delete(s);
    sfx.tick();
    render();
  }
  function undo() {
    const last = history.pop();
    if (!last) return;
    if (last.add) for (const s of last.add) drawn.delete(s);
    if (last.del) for (const s of last.del) drawn.add(s);
    sfx.tick();
    render();
  }

  const offDraw = board.drawSegments({ commit, constrain: snapLine, readout: false, onSnap: () => sfx.tick?.() });
  const offTap = onBoardTap(board, erase);

  frame.title(construct ? TITLES.construct : TITLES.draw, item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'reset', label: 'Clear', key: 'R', run: () => { if (drawn.size) { history.push({ del: [...drawn] }); drawn = new Set(); sfx.slide(); render(); } } },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  render();

  function showGuides(lines) {
    guides = lines;
    lines.forEach((l, i) => board.line(l.a, l.b, 'signalFold', { id: 'g' + i, hit: false }));
  }

  return {
    model, board,
    commit, _answer: () => planLines(roof),
    check() {
      const r = compareSteps(roof, drawn);
      if (r.ok) return { ok: true };
      const miss = mergeSteps(new Map(r.missing.map(s => [s, 'm'])));
      const extra = mergeSteps(new Map(r.extra.map(s => [s, 'x'])));
      for (const l of extra) board.line(l.a, l.b, 'signalThin', { id: 'x' + l.steps[0], hit: false });
      setTimeout(() => { for (const l of extra) board.remove('x' + l.steps[0]); }, 1800);
      const parts = [];
      if (miss.length) parts.push(`${miss.length === 1 ? 'one line is' : `${miss.length} lines are`} still missing`);
      if (extra.length) parts.push(`${extra.length === 1 ? 'one line isn’t' : `${extra.length} lines aren’t`} on this roof`);
      const culprits = [...extra.slice(0, 2).map(l => ({ at: () => board.toClient(mid(l.a, l.b)), r: 16, note: 'not on this roof' })),
        ...(extra.length ? [] : miss.slice(0, 1).map(l => ({ at: () => board.toClient(mid(l.a, l.b)), r: 26, note: 'missing here' })))];
      return { ok: false, note: 'Not quite: ' + parts.join(', and ') + '.', culprits };
    },
    hint(n) {
      if (n === 1) return { text: 'Start at the corners. Draw a hip at 45 degrees from every outside corner and a valley from every inside corner. Where two of them meet, a level ridge carries on.' };
      const all = planLines(roof);
      if (guides) for (let i = 0; i < guides.length; i++) board.remove('g' + i);
      if (n === 2) {
        const cs = new Set([...roof.corners.convex, ...roof.corners.reflex].map(p => p.join()));
        showGuides(all.filter(l => cs.has(l.a.join()) || cs.has(l.b.join())));
        return { text: 'The lines from the corners are now dashed in for you.' };
      }
      showGuides(all);
      return { text: 'The whole plan is dashed in now. Trace over it.' };
    },
    async solved() {
      board.items().filter(it => String(it.id).startsWith('d') || String(it.id).startsWith('g')).forEach(it => board.remove(it.id));
      drawPlan(board, planLines(roof), { hit: false });
      model.overlay('drawn', []);
      await finale(model);
    },
    dispose() { offDraw(); offTap(); board.dispose(); closeCard(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// the footprint editor: design to brief, and the workshop
// ------------------------------------------------------------------

function editorTask(item, { workshop = false } = {}) {
  const [w, h] = item.size || [10, 8];
  let cells = new Set(item.start || []);
  let model = null, pitch = 1, rain = null;
  const centre = [w * S / 2, h * S / 2];
  const board = openCard(workshop ? 'Site' : 'Site', `${w} × ${h} modules`, { interactive: true });
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    board.polygon([[S * i, S * j], [S * i + S, S * j], [S * i + S, S * j + S], [S * i, S * j + S]], { fill: 'none', stroke: 'guide', id: 'site' + key(i, j), cell: key(i, j) });
  }
  board.setGrid('none');
  board.fit();

  // the site edge on the ground, so the camera frames the whole site
  const site = siteModel(w, h);
  const siteBox = new THREE.Box3(new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, h / 2, 2.6));
  stage.frame(siteBox, { padding: Math.max(8, Math.min(36, Math.min(stage.rect.w, stage.rect.h) * .06)) });

  let stats = null, valid = false;
  function rebuild() {
    for (const it of board.items()) if (/^(f|pl)/.test(String(it.id))) board.remove(it.id);
    model?.dispose(); model = null;
    if (rain) { rain.dispose(); rain = null; }
    valid = cells.size > 0 && goodFootprint(cells, { minEdge: 1 });
    if (cells.size) {
      const roof = roofOf(cells);
      for (const k of cells) board.update('site' + k, { fill: 'face' });
      drawFootprint(board, roof, { fill: 'none' });
      if (valid) drawPlan(board, planLines(roof), { hit: false });
      model = addModel(roof, { centre, pitch, rise: valid ? 1 : 0 });
      stats = valid ? roofStats(cells) : null;
    } else stats = null;
    if (workshop && wantRain && model && valid) { rain = createRain(model); rain.start(); }
    refresh();
    stage.invalidate();
  }

  function refresh() {
    if (workshop) {
      const s = stats;
      frame.sub(s ? `${plural(s.modules, 'module')} · ${plural(s.valleys, 'valley')} · ${plural(s.hips, 'hip')} · ${s.ridges === 1 ? 'one ridge' : plural(s.ridges, 'ridge')} · ridge ${s.height} ${s.height === 1 ? 'module' : 'modules'} up${s.courtyards ? ' · a courtyard' : ''}`
        : cells.size ? 'This footprint can’t carry a single roof. Each block has to touch the next one along a whole side.' : 'Drag over the site to paint a footprint. The roof grows over it as you go.');
      return;
    }
    const m = meets(cells, item.brief);
    const list = m.map(x => `<span class="rf-brief${x.ok ? ' is-ok' : ''}"><i>${x.ok ? '◆' : '◇'}</i>${x.text}</span>`).join(' ');
    const all = m.every(x => x.ok);
    frame.sub(`Drag over the site to paint a footprint. The brief asks for a roof with ${list}${cells.size && !valid ? '<br><em>Each block has to touch the next one along a whole side.</em>' : ''}`, true);
    frame.primary({ label: 'Submit', run: () => session.check(), disabled: !cells.size, ready: all });
  }

  // painting: press on a cell to add or take it away, drag to keep going
  let paint = null;
  const cellAt = ev => { const hh = board.hit(ev, { kinds: ['poly'], filter: it => it.cell !== undefined }); return hh ? hh.item.cell : null; };
  const offPaint = board.onPointer({
    down: ev => { const c = cellAt(ev); if (!c) return; paint = !cells.has(c); apply(c); },
    move: (ev, p, q, dragging) => { if (dragging && paint !== null) { const c = cellAt(ev); if (c) apply(c); } },
    up: () => { paint = null; },
  });
  function apply(c) {
    if (paint === cells.has(c)) return;
    if (paint) cells.add(c); else { cells.delete(c); board.update('site' + c, { fill: 'none' }); }
    sfx.tick();
    red.clear();
    rebuild();
  }

  let wantRain = false;
  function setPitch(p) {
    pitch = Math.max(.25, Math.min(1.6, p));
    if (model && valid) { model.setPitch(pitch); model.setK(pitch); }
    frame.say(`The roof is now pitched at ${Math.round(Math.atan(pitch) * 180 / Math.PI)}°, and the plan stays exactly the same.`, { ms: 2200 });
    stage.invalidate();
  }

  frame.title(workshop ? 'Free roofs' : TITLES.brief, workshop ? 'Any footprint' : item.name);
  frame.tools([
    { id: 'clear', label: 'Clear', key: 'C', run: () => { cells = new Set(); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) board.update('site' + key(i, j), { fill: 'none' }); sfx.slide(); rebuild(); } },
    { id: 'flat', label: 'Flatter', key: '[', run: () => setPitch(pitch - .15) },
    { id: 'steep', label: 'Steeper', key: ']', run: () => setPitch(pitch + .15) },
    { id: 'rain', label: 'Rain', key: 'W', run: () => { wantRain = !wantRain; frame.tool('rain', { active: wantRain }); rebuild(); } },
    ...(workshop ? [] : [{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]),
  ]);
  viewKeys();
  rebuild();

  // a footprint that meets the brief, for the last hint
  function example() {
    const rng = seededRng('brief:' + item.id);
    const ok = c => c && goodFootprint(c, { minEdge: 1 }) && meets(c, item.brief).every(x => x.ok);
    if (item.brief.courtyard) {
      for (let a = 3; a <= w; a++) for (let b = 3; b <= h; b++) for (const t of [1, 2]) {
        const c = new Set();
        for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) if (i < t || j < t || i >= a - t || j >= b - t) c.add(key(i, j));
        if (ok(c)) return c;
      }
    }
    for (let t = 0; t < 4000; t++) {
      const f = randomFootprint(rng, { w, h, blocks: [2, 4], corners: [4, 16], minEdge: 1 });
      if (f && ok(f.cells)) return f.cells;
    }
    return null;
  }

  return {
    get model() { return model; }, board,
    paint: list => { cells = new Set(list); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) board.update('site' + key(i, j), { fill: cells.has(key(i, j)) ? 'face' : 'none' }); rebuild(); },
    _answer: () => { const c = example(); return c && [...c]; },
    check() {
      if (!cells.size) return { ok: false, strike: false, note: 'Paint a footprint first, then submit it.' };
      if (!valid) return { ok: false, note: 'Some blocks only touch at a corner, or the footprint is in pieces. It needs to be one building.' };
      const m = meets(cells, item.brief).filter(x => !x.ok);
      if (!m.length) return { ok: true };
      const s = stats;
      return { ok: false, note: `Close, but the brief asks for ${m.map(x => x.text).join(' and ')}. Yours has ${plural(s.valleys, 'valley')}, ${s.ridges === 1 ? 'one ridge' : plural(s.ridges, 'ridge')} and ${plural(s.modules, 'module')}.` };
    },
    hint(n) {
      if (n === 1) return { text: 'Each inside corner of the walls sends up one valley. An L shape has one, a T or a U has two, and an H has four.' };
      if (n === 2) return { text: item.brief.courtyard ? 'A courtyard needs a ring of rooms all the way round an open middle.' : 'Start from a long bar and add wings. A wing in the middle of a side adds two inside corners, and a wing at the end adds one.' };
      const c = example();
      if (!c) return { text: 'Try a U shape or an H shape.' };
      for (const k of c) board.update('site' + k, { fill: cells.has(k) ? 'face' : 'signal' });
      return { text: 'One footprint that meets the brief is now marked on the site.' };
    },
    solved: () => finale(model),
    dispose() { offPaint(); rain?.dispose(); board.dispose(); closeCard(); model?.dispose(); site.dispose(); },
  };
}

// the site in 3D: a thin plaster plate with the module grid scored into it
function siteModel(w, h) {
  const group = new THREE.Group();
  const t = .04;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w + .6, h + .6, t), plasterMaterial({ color: 0x8f8a82 }));
  plate.position.z = -t / 2 + .001;
  plate.receiveShadow = true;
  const segs = [];
  for (let i = 0; i <= w; i++) segs.push([[i - w / 2, -h / 2, .003], [i - w / 2, h / 2, .003]]);
  for (let j = 0; j <= h; j++) segs.push([[-w / 2, j - h / 2, .003], [w / 2, j - h / 2, .003]]);
  const grid = createLines(segs, 'guide');
  group.add(plate, grid);
  stage.content.add(group);
  return { group, dispose() { grid.dispose(); plate.geometry.dispose(); plate.material.dispose(); group.removeFromParent(); } };
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
    { key: 'T', label: 'Look straight down on the roof', run: () => stage.rig.setView(stage.rig.yaw, 86 * Math.PI / 180) },
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
  frame.primaryEl.style.display = ['name', 'draw', 'construct', 'brief'].includes(item.task) ? '' : 'none';
  if (item.task === 'brief') { task = editorTask(item); return; }
  const roof = roofOf(footprintFrom(item.rows).cells);
  task = item.task === 'which' ? whichTask(item, roof)
    : item.task === 'error' ? errorTask(item, roof)
    : item.task === 'name' ? nameTask(item, roof)
    : drawTask(item, roof, { construct: item.task === 'construct' });
  if (sheet) frame.fitSheet(sheet);
}

function openWorkshop() {
  task?.dispose();
  red.clear(); stage.clear();
  frame.primaryEl.style.display = 'none';
  const start = footprintFrom(['..##......', '..##......', '..######..', '..######..', '..##..##..', '..##..##..']).cells;
  task = editorTask({ id: 'W', size: [12, 9], start: [...start].map(k => { const [i, j] = unkey(k); return key(i, j + 1); }) }, { workshop: true });
}

// generated puzzles: bigger footprints and harder tasks as the difficulty grows
function generate(rng, difficulty) {
  const d = difficulty;
  const size = d <= 2 ? { w: 6, h: 4, blocks: [1, 2], corners: [4, 6] }
    : d <= 5 ? { w: 7, h: 5, blocks: [2, 3], corners: [6, 10] }
    : { w: 9, h: 6, blocks: [3, 4], corners: [8, 14] };
  let fp = null;
  for (let t = 0; t < 20 && !fp; t++) {
    const f = randomFootprint(rng, { ...size, minEdge: 2 });
    if (f && goodFootprint(f.cells)) fp = f;
  }
  const rows = fp ? rowsOf(fp.cells) : ['#####', '#####', '#####'];
  const tasks = d <= 2 ? ['which', 'name'] : d <= 5 ? ['which', 'error', 'name', 'draw'] : ['error', 'name', 'draw', 'construct', 'construct'];
  const t = pick(rng, tasks);
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = { id: 'g' + seed, task: t, name: 'Generated plan', rows, seed, errors: 1 + Math.floor(d / 4), model: !(t === 'name' && d >= 6) };
  return { ...item, label: `Generated plan · ${TASK_TAGS[t]}`, par: parOf(item) };
}

const def = {
  id: 'roof', prefix: 'R', name: 'Roof Plans',
  lead: 'How a footprint becomes a roof.',
  sub: 'With every eave at one height and every slope the same, the footprint decides the roof. Learn to read hips, valleys and ridges, draw roof plans and design to a brief.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  workshop: openWorkshop,
  dailyDifficulty: 6,
  // the star: read the roof from where it stands, without turning it round
  master: { name: 'no turning', says: 'read the roof without turning it', still: true, applies: it => ['which', 'error', 'name', 'draw'].includes(it.task) },
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
// for tests and screenshots
window.__udp = { stage, session, get task() { return task; } };
