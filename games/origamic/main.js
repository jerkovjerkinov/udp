// Origamic: one sheet, cuts and folds, and a building stands up when the card
// opens to 90 degrees. Every column of the card is a section of the building:
// the floor half reads as a plan, the wall half as an elevation.
//
// Four tasks share the card (levels.js):
//   read    What opens? A building stands on the table; pick its card of four
//   draw    Draw the card. Fold a blank card on the board until it makes the building
//   tear    Will it stand? Mark the strips whose folds cannot close, then open it
//   plans   From drawings. Only a plan and an elevation: draw the card, and see
//           your own card stand up as you fold it
// The workshop is a free designer that exports the card as SVG with standard
// line types (cut solid, valley dashed, mountain dash-dot).

import '../../src/ui/theme.js';
import { createStage } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { lineStyle } from '../../src/stage/lines.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { profileOf, stripsOf, cutsOf, foldLinesOf, foldTypes, randomCard, readOptions, tearCard, cardFrom,
  drawingsOf, fieldEdges, svgOf, sameCol } from '../../src/core/origamic.js';
import { seededRng, pick } from '../../src/core/rand.js';
import { createCardView } from './card3d.js';
import { PACKS, BUILDS } from './levels.js';

const D2R = Math.PI / 180;
const OPEN = Math.PI / 2, FLAT = Math.PI;
const YAW = -112.5 * D2R, PITCH = 28 * D2R;

const stage = createStage(document.getElementById('stage'), { camera: { pitch: PITCH } });
const frame = createFrame({ game: 'origamic', name: 'Origamic', stage });
frame.stack(true);
const red = createRedlines(stage);
// shadows fall on the card only: the wall's would run off across the table
if (stage.ground) stage.ground.receiveShadow = false;

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

const TITLES = { read: 'What opens?', draw: 'Draw the card.', tear: 'Will it stand?', plans: 'From drawings.' };
const TASK_TAGS = { read: 'read', draw: 'draw', tear: 'will it stand', plans: 'from drawings' };
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const LETTER = i => String.fromCharCode(65 + i);
const clone = c => ({ ...c, cols: c.cols.map(f => f ? f.slice() : null) });
const blank = c => ({ ...c, cols: Array(c.W).fill(null) });
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function buildInfo(l) {
  const b = l.build && BUILDS[l.build];
  if (!b) return { strips: l.strips[1], steps: l.steps[1] };
  const live = b.cols.filter(c => c[1]);
  return { strips: live.length, steps: Math.max(...live.map(c => (c[1].length - 1) / 2)) };
}
function parOf(l) {
  const { strips, steps } = buildInfo(l);
  const p = l.task === 'read' ? 25 + strips * 8
    : l.task === 'tear' ? 25 + strips * 10 + (l.broken || 1) * 5
    : l.task === 'draw' ? 30 + strips * (15 + steps * 10)
    : 45 + strips * (20 + steps * 12);
  return Math.round(p / 5) * 5;
}

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l) })),
}));

// the level's card, and the rng that made it (for options and tears)
function cardOf(item) {
  const W = item.W ?? 10, D = item.D ?? 5, H = item.H ?? 6;
  const rng = seededRng('origamic:' + (item.seed ? item.id + ':' + item.seed : item.id));
  const card = item.build ? cardFrom({ W, D, H, ...BUILDS[item.build] })
    : randomCard(rng, { W, D, H, strips: item.strips, width: item.width || [1, 3], steps: item.steps });
  return { rng, card };
}

// the same building? (column by column; a column that cannot stand is flat paper)
function differences(got, want) {
  const out = [];
  for (let i = 0; i < want.W; i++) {
    const p = profileOf(got.cols[i]);
    const a = p.ok && !p.plain ? got.cols[i] : null, b = want.cols[i];
    if (!p.ok || !sameCol(a && [...a].sort((x, y) => x - y), b && [...b].sort((x, y) => x - y))) out.push(i);
  }
  return out;
}
function diffNote(got, want, i) {
  const p = profileOf(got.cols[i]), q = profileOf(want.cols[i]);
  const c = `Column ${i + 1}`;
  if (!p.ok) return `${c} cannot stand: ${p.why}.`;
  if (p.plain) return `${c} is flat, but the building stands there.`;
  if (q.plain) return `${c} stands, but the building has nothing there.`;
  const steps = x => x.pieces.length / 2;
  if (steps(p) !== steps(q)) return `${c} has ${plural(steps(p), 'step')}; the building has ${steps(q)} there.`;
  if (p.a !== q.a) return `${c} leaves the floor ${-p.a} out; the building is ${-q.a} deep there.`;
  if (p.b !== q.b) return `${c} meets the wall at ${p.b}; the building is ${q.b} high there.`;
  return `${c} has the right depth and height, but its step is in another place.`;
}

// a column, in words, for the readout under the board
function describe(card, i) {
  const p = profileOf(card.cols[i]);
  if (p.plain) return `column ${i + 1} · flat`;
  if (!p.ok) return `column ${i + 1} · ${p.why}`;
  const k = p.pieces.length / 2;
  return `column ${i + 1} · stands · ${-p.a} out · ${p.b} up · ${plural(k, 'step')}`;
}

// ------------------------------------------------------------------
// the board: the card pattern in standard line types
// ------------------------------------------------------------------

function legendHTML() {
  const sw = (style, label) => {
    const st = lineStyle(style, 'sheet');
    return `<span class="rf-key"><svg width="34" height="8" viewBox="0 0 34 8"><line x1="1" y1="4" x2="33" y2="4" stroke="${st.color}" stroke-width="${st.width}" ${st.dash ? `stroke-dasharray="${st.dash.join(' ')}"` : ''}/></svg>${label}</span>`;
  };
  return sw('profile', 'cut') + sw('fold', 'valley') + sw('mountain', 'mountain');
}

function openCard(title, note, { grid = 'dots' } = {}) {
  const body = frame.card(true, title, note);
  document.querySelector('.udp-card').classList.add('is-plan');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  const legend = document.createElement('div');
  legend.className = 'rf-legend';
  legend.innerHTML = legendHTML();
  body.append(holder, legend);
  const board = createBoard(holder, { unit: 1, sub: 1, grid, padding: 22, maxScale: 46 });
  frame.layout();
  return board;
}
function closeCard() { frame.card(false); document.querySelector('.udp-card').classList.remove('is-plan'); }

// the pattern of a card at offset off; returns a function that removes it.
// live: strips that cannot stand show in the signal colour
function drawPattern(board, card, { off = [0, 0], id = 'p', live = true } = {}) {
  const ids = [];
  const o = p => [p[0] + off[0], p[1] + off[1]];
  const put = r => { ids.push(r); return r; };
  put(board.polygon(rect(0, card.W, -card.D, card.H).map(o), { fill: 'face', stroke: 'visible', id: id + 'paper', hit: false }));
  // the gutter, ticked outside the paper
  put(board.line(o([-.5, 0]), o([-.05, 0]), 'visible', { id: id + 'gl', hit: false }));
  put(board.line(o([card.W + .05, 0]), o([card.W + .5, 0]), 'visible', { id: id + 'gr', hit: false }));
  const bad = st => live && !profileOf(st.folds).ok;
  stripsOf(card).forEach((st, n) => {
    if (!bad(st)) return;
    const f = st.folds, s0 = Math.min(f[0], 0), s1 = Math.max(f[f.length - 1], 0);
    put(board.polygon(rect(st.x0, st.x1, s0, s1).map(o), { fill: 'signal', stroke: null, id: id + 'bad' + n, hit: false }));
  });
  foldLinesOf(card).forEach((f, n) => {
    const style = f.strip && bad(f.strip) ? 'signalFold' : f.type === 'valley' ? 'fold' : 'mountain';
    put(board.line(o([f.x0, f.s]), o([f.x1, f.s]), style, { id: id + 'f' + n, hit: false }));
  });
  cutsOf(card).forEach((c, n) => { if (c.s1 > c.s0) put(board.line(o([c.x, c.s0]), o([c.x, c.s1]), 'profile', { id: id + 'c' + n, hit: false })); });
  return () => ids.forEach(i => board.remove(i));
}

// the plan and the elevation of a building, beside the card at x offset ox:
// the elevation behind the wall half, the plan under the floor half
function drawDrawings(board, card, ox) {
  const { plan, face } = drawingsOf(card);
  fieldEdges(plan).forEach(([a, b], n) => board.line([ox + a[0], -a[1]], [ox + b[0], -b[1]], 'visible', { id: 'pl' + n, hit: false }));
  fieldEdges(face).forEach(([a, b], n) => board.line([ox + a[0], a[1]], [ox + b[0], b[1]], 'visible', { id: 'el' + n, hit: false }));
  // the ground line runs past the elevation, as drawn
  board.line([ox - .4, 0], [ox + card.W + .4, 0], 'profile', { id: 'ground', hit: false });
  board.text([ox, card.H + .55], 'ELEVATION', { id: 'elT', anchor: 'start' });
  board.text([ox, -card.D - .55], 'PLAN', { id: 'plT', anchor: 'start' });
}

// fold a blank card on the board: tap a row in a column to fold it there, drag
// along a row to fold the columns you pass. Cuts and fold types follow.
function createEditor(board, start, { onChange, onHover } = {}) {
  let cols = clone(start).cols;
  const history = [];
  let undraw = () => {}, locked = false, paint = null, hov = null;
  const now = () => ({ ...start, cols: cols.map(f => f ? f.slice() : null) });
  const W = start.W, D = start.D, H = start.H;
  board.setGrid('dots', { x0: 0, y0: -D, x1: W, y1: H });

  function redraw() { undraw(); undraw = drawPattern(board, now(), { id: 'e' }); }
  const has = (i, r) => !!cols[i]?.includes(r);
  function set(i, r, on) {
    const f = new Set(cols[i] || []);
    if (on) f.add(r); else f.delete(r);
    cols[i] = f.size ? [...f].sort((a, b) => a - b) : null;
  }
  const at = p => {
    const i = Math.floor(p[0]), r = Math.round(p[1]);
    if (i < 0 || i >= W || r <= -D || r >= H || Math.abs(p[1] - r) > .34) return null;
    return { i, r };
  };
  function hover(a) {
    const key = a ? a.i + ',' + a.r : null;
    if (key === hov) return;
    hov = key;
    if (a) {
      board.line([a.i, a.r], [a.i + 1, a.r], 'hover', { id: 'hov', hit: false, noFit: true });
      board.text([0, -D - .6], describe(now(), a.i), { id: 'readout', anchor: 'start', noFit: true });
    } else { board.remove('hov'); board.remove('readout'); }
    onHover?.(a ? a.i : null);
  }
  const changed = () => { redraw(); onChange?.(now()); };
  const offPointer = board.onPointer({
    down(ev, p) {
      const a = at(p);
      if (!a || locked) return;
      red.clear();
      history.push(cols.map(f => f && f.slice()));
      paint = { r: a.r, on: !has(a.i, a.r), last: a.i };
      set(a.i, a.r, paint.on);
      paint.on ? sfx.pencil() : sfx.tick();
      hov = null; hover(a);
      changed();
    },
    move(ev, p, q, dragging) {
      if (dragging && paint) {
        const i = Math.max(0, Math.min(W - 1, Math.floor(p[0])));
        if (i === paint.last) return;
        const step = i > paint.last ? 1 : -1;
        for (let k = paint.last + step; k !== i + step; k += step) set(k, paint.r, paint.on);
        paint.last = i;
        sfx.tick();
        hov = null; hover({ i, r: paint.r });
        changed();
        return;
      }
      if (!locked) hover(at(p));
    },
    up() { paint = null; },
  });
  const leave = () => hover(null);
  board.el.addEventListener('pointerleave', leave);
  redraw();

  return {
    get card() { return now(); },
    set(c) { history.push(cols.map(f => f && f.slice())); cols = clone(c).cols; changed(); },
    toggle(i, r) { history.push(cols.map(f => f && f.slice())); set(i, r, !has(i, r)); changed(); },
    undo() { if (!history.length || locked) return; cols = history.pop(); sfx.tick(); changed(); },
    clear() { if (locked || cols.every(f => !f)) return; history.push(cols.map(f => f && f.slice())); cols = Array(W).fill(null); sfx.tick(); changed(); },
    lock(v) { locked = v; if (v) hover(null); },
    get empty() { return cols.every(f => !f); },
    dispose() { offPointer(); board.el.removeEventListener('pointerleave', leave); undraw(); },
  };
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

// ------------------------------------------------------------------
// the card on the table
// ------------------------------------------------------------------

function addCard(card, theta = OPEN) {
  const v = createCardView(card, { theta });
  stage.content.add(v.group);
  frameCard(v);
  return v;
}
function frameCard(v, flat = false) {
  const r = stage.rect;
  stage.frame(v.box(flat), { padding: Math.max(10, Math.min(60, Math.min(r.w, r.h) * .1)) });
}

// what every solved card ends with: it closes flat and opens into the building
async function finale(v) {
  v.markColumn([]);
  v.setGhost(null);
  if (v.theta < FLAT - .01) { sfx.flap(); await v.open(FLAT - .02, 650); await wait(220, { essential: true }); }
  sfx.slide();
  await v.open(OPEN, 1700);
  sfx.thud();
  stage.rig.step(-1);
  await wait(900, { essential: true });
}

// open a card that is not the answer beside the building it should make,
// then fold it away again
async function showAttempt(got, want, { after } = {}) {
  const v = addCard(got, FLAT - .02);
  v.setGhost(want);
  sfx.slide();
  await v.open(OPEN, 1300);
  if (stripsOf(got).some(st => !profileOf(st.folds).ok)) sfx.error();
  await wait(1500, { essential: true });
  await v.open(FLAT - .02, 600);
  v.dispose();
  after?.();
  stage.invalidate();
}

// ------------------------------------------------------------------
// task: what opens (pick the card of four)
// ------------------------------------------------------------------

function readTask(item, card, rng) {
  const view = addCard(card);
  const options = readOptions(rng, card);
  const board = openCard('Four cards', 'one opens into it', { grid: 'none' });
  const gx = card.W + 2, gy = card.D + card.H + 2.4;
  options.forEach((o, i) => {
    o.off = [(i % 2) * gx, -Math.floor(i / 2) * gy];
    drawPattern(board, o.card, { off: o.off, id: 'o' + i, live: false });
    board.polygon(rect(0, card.W, -card.D, card.H).map(p => [p[0] + o.off[0], p[1] + o.off[1]]), { fill: 'none', stroke: null, id: 'opt' + i, opt: i });
    board.text([o.off[0] + card.W / 2, o.off[1] + card.H + .75], LETTER(i), { id: 'tag' + i, color: '#e9e6df' });
  });
  board.fit();
  let chosen = -1, hoverOpt = -1;

  function choose(i) {
    const o = options[i];
    if (!o || o.out || chosen >= 0) return;
    if (o.ok) { chosen = i; board.update('opt' + i, { fill: 'signal' }); session.check(); return; }
    o.out = true;
    board.update('opt' + i, { fill: 'rgba(15, 15, 14, .6)' });
    session.miss({ note: `${LETTER(i)}: ${o.why}.`, culprits: [{ at: () => board.toClient([o.off[0] + card.W / 2, o.off[1]]), r: 34 }] });
  }
  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined }); if (h) choose(h.item.opt); });
  // pointing at a card lights it; pointing at a column lights that section on the building
  let col = -1;
  const move = ev => {
    const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined });
    const i = h ? h.item.opt : -1;
    if (i !== hoverOpt && chosen < 0) {
      if (hoverOpt >= 0 && !options[hoverOpt].out) board.update('opt' + hoverOpt, { fill: 'none' });
      hoverOpt = i;
      if (i >= 0 && !options[i].out) board.update('opt' + i, { fill: 'ghost' });
    }
    const c = i >= 0 ? Math.floor(board.toWorld(ev)[0] - options[i].off[0]) : -1;
    if (c !== col) { col = c; view.markColumn(c >= 0 ? [c] : []); stage.invalidate(); }
  };
  const leave = () => { col = -1; view.markColumn([]); stage.invalidate(); };
  board.el.addEventListener('pointermove', move);
  board.el.addEventListener('pointerleave', leave);

  frame.title(TITLES.read, item.name);
  frame.sub('Which card opens into this building? Point at a column to light its section. Click a card, or press A to D.');
  frame.tools([
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
    ...options.map((_, i) => ({ id: 'c' + i, label: LETTER(i), key: LETTER(i), hidden: true, run: () => choose(i) })),
  ]);
  viewKeys();

  return {
    board, view, choose,
    _answer: () => options.findIndex(o => o.ok),
    check: () => ({ ok: chosen >= 0 }),
    hint(k) {
      if (k === 1) return { text: 'Read a card column by column. The first fold below the gutter is how far the strip stands out of the floor; the last fold above it is the height where it meets the wall.' };
      if (k === 2) {
        const o = options.find(x => !x.ok && !x.out);
        if (o) { o.out = true; board.update('opt' + options.indexOf(o), { fill: 'rgba(15, 15, 14, .6)' }); }
        return { text: 'One wrong card is out.' };
      }
      const i = options.findIndex(o => o.ok);
      return { text: 'This one:', culprits: [{ at: () => board.toClient([options[i].off[0] + card.W / 2, options[i].off[1]]), r: 40 }] };
    },
    solved: () => finale(view),
    dispose() { offTap(); board.el.removeEventListener('pointermove', move); board.el.removeEventListener('pointerleave', leave); board.dispose(); closeCard(); view.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: draw the card (from the building, or from a plan and an elevation)
// ------------------------------------------------------------------

function drawTask(item, want) {
  const fromDrawings = item.task === 'plans';
  // draw: the building stands on the table. plans: your own card does, as you fold it
  const view = addCard(fromDrawings ? blank(want) : want);
  const board = openCard(fromDrawings ? 'Card, plan, elevation' : 'Your card', `${want.W} × ${want.D + want.H}`);
  if (fromDrawings) drawDrawings(board, want, want.W + 2.2);
  let busy = false;
  const ed = createEditor(board, blank(want), {
    onChange(c) { if (fromDrawings) { view.set(c); stage.invalidate(); } refresh(); },
    onHover(i) {
      view.markColumn(i === null ? [] : [i]);
      if (fromDrawings) {
        if (i === null) { board.remove('hpl'); board.remove('hel'); }
        else {
          const ox = want.W + 2.2;
          board.polygon(rect(ox + i, ox + i + 1, -want.D, 0), { fill: 'ghost', stroke: null, id: 'hpl', hit: false, noFit: true });
          board.polygon(rect(ox + i, ox + i + 1, 0, want.H), { fill: 'ghost', stroke: null, id: 'hel', hit: false, noFit: true });
        }
      }
      stage.invalidate();
    },
  });
  board.fit();

  function refresh() {
    const c = ed.card;
    const n = stripsOf(c).length, bad = stripsOf(c).filter(st => !profileOf(st.folds).ok).length;
    const how = 'Tap a row to fold a column there; drag along a row for several.';
    const count = n ? ` <em>${plural(n, 'strip')}</em>${bad ? `, ${bad} cannot stand` : ''}.` : '';
    frame.sub(fromDrawings
      ? `Fold the card that makes this plan and elevation. ${how}${count}`
      : `Fold the blank card so it opens into this building. ${how}${count}`, true);
    frame.primary({ label: 'Open', run: () => session.check(), disabled: ed.empty || busy, ready: !bad && n > 0 });
  }

  frame.title(TITLES[item.task], item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: () => ed.undo() },
    { id: 'clear', label: 'Clear', key: 'C', run: () => ed.clear() },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  const wrongCol = () => differences(ed.card, want)[0];
  return {
    board, view, editor: ed,
    _play() { ed.set(want); },
    check() {
      const got = ed.card, diff = differences(got, want);
      if (!diff.length) return { ok: true };
      if (!fromDrawings) {
        busy = true; ed.lock(true); refresh();
        view.group.visible = false;
        showAttempt(got, want, { after: () => { view.group.visible = true; busy = false; ed.lock(false); refresh(); } });
      }
      const note = diff.length === 1 ? diffNote(got, want, diff[0]) : `${diff.length} columns differ. ${diffNote(got, want, diff[0])}`;
      return { ok: false, note, culprits: diff.slice(0, 3).map(i => ({ at: () => board.toClient([i + .5, 0]), r: 18 })) };
    },
    hint(k) {
      if (k === 1) return { text: fromDrawings
        ? 'The plan shows where each roof starts and ends; the elevation how high each one is. In a strip the front roof is the lowest. A box d deep and h high folds at −d, h − d and h.'
        : 'Every column is a section of the building. A box d deep and h high folds at −d, h − d and h, and is cut from −d to h. Each step back adds a wall piece and a roof.' };
      const i = wrongCol();
      if (i === undefined) return { text: 'Every column is right. Open it.' };
      if (k === 2) {
        view.markColumn([i]);
        return { text: diffNote(ed.card, want, i), culprits: [{ at: () => board.toClient([i + .5, 0]), r: 18 }] };
      }
      const f = want.cols[i];
      if (f) foldTypes(f).forEach((t, n) => board.line([i, f[n]], [i + 1, f[n]], 'signalFold', { id: 'hf' + i + '_' + n, hit: false }));
      else board.polygon(rect(i, i + 1, -want.D, want.H), { fill: 'signal', stroke: null, id: 'hf' + i, hit: false });
      return { text: f ? `Column ${i + 1} folds at ${[...f].sort((a, b) => a - b).map(v => String(v).replace('-', '−')).join(', ')}: dashed in.` : `Column ${i + 1} stays flat.` };
    },
    solved() { ed.lock(true); frame.primary({ label: 'Open', disabled: true }); return finale(view); },
    dispose() { ed.dispose(); board.dispose(); closeCard(); view.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: will it stand (mark the strips that tear)
// ------------------------------------------------------------------

function tearTask(item, card, rng) {
  const t = tearCard(rng, card, item.broken || 1) || { card, broken: [] };
  const c = t.card, broken = new Set(t.broken);
  stage.rig.setView(YAW, 50 * D2R, false);
  const view = addCard(c, FLAT);
  view.showTorn(false);
  frameCard(view, true);
  const board = openCard('The card', 'which strips tear?');
  board.setGrid('dots', { x0: 0, y0: -c.D, x1: c.W, y1: c.H });
  drawPattern(board, c, { id: 'p', live: false });
  const strips = stripsOf(c);
  strips.forEach((st, n) => {
    const f = st.folds;
    board.polygon(rect(st.x0, st.x1, Math.min(f[0], 0), Math.max(f[f.length - 1], 0)), { fill: 'none', stroke: null, id: 'st' + n, strip: n });
  });
  board.fit();
  const marked = new Set();
  let hoverN = -1, busy = false;

  function refresh() {
    frame.sub(`A strip stands if its walls add up to where it meets the wall, and its roofs to how far out it leaves the floor. Mark the strips that tear. <em>${plural(marked.size, 'strip')}</em> marked.`, true);
    frame.primary({ label: 'Open', run: () => session.check(), disabled: busy, ready: marked.size > 0 });
  }
  const markedCols = () => [...marked].flatMap(k => Array.from({ length: strips[k].x1 - strips[k].x0 }, (_, j) => strips[k].x0 + j));
  const fillOf = n => marked.has(n) ? 'signalStrong' : n === hoverN ? 'ghost' : 'none';
  function toggle(n) {
    if (busy) return;
    red.clear();
    marked.has(n) ? marked.delete(n) : marked.add(n);
    marked.has(n) ? sfx.pencil() : sfx.tick();
    board.update('st' + n, { fill: fillOf(n) });
    view.markColumn(markedCols());
    stage.invalidate();
    refresh();
  }
  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.strip !== undefined }); if (h) toggle(h.item.strip); });
  const move = ev => {
    const h = board.hit(ev, { kinds: ['poly'], filter: it => it.strip !== undefined });
    const n = h ? h.item.strip : -1;
    if (n === hoverN) return;
    const was = hoverN;
    hoverN = n;
    if (was >= 0) board.update('st' + was, { fill: fillOf(was) });
    if (n >= 0) board.update('st' + n, { fill: fillOf(n) });
  };
  board.el.addEventListener('pointermove', move);

  frame.title(TITLES.tear, item.name);
  frame.tools([
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  const brokenN = () => strips.map((st, n) => broken.has(st.x0) ? n : -1).filter(n => n >= 0);
  async function openAndBack() {
    busy = true; refresh();
    view.markColumn([]);
    view.showTorn(true);
    sfx.slide();
    await view.open(OPEN, 1400);
    sfx.error();
    await wait(1500, { essential: true });
    await view.open(FLAT, 700);
    view.showTorn(false);
    view.markColumn(markedCols());
    busy = false; refresh();
  }
  return {
    board, view, toggle,
    _answer: () => brokenN(),
    check() {
      const want = new Set(brokenN());
      const extra = [...marked].filter(n => !want.has(n)), missing = [...want].filter(n => !marked.has(n));
      if (!extra.length && !missing.length) return { ok: true };
      openAndBack();
      const parts = [];
      if (missing.length) parts.push(`${plural(missing.length, 'strip')} that ${missing.length === 1 ? 'tears is' : 'tear are'} not marked`);
      if (extra.length) parts.push(`${plural(extra.length, 'marked strip')} ${extra.length === 1 ? 'stands' : 'stand'} up fine`);
      const at = n => () => board.toClient([(strips[n].x0 + strips[n].x1) / 2, 0]);
      return { ok: false, note: parts.join('; ') + '.', culprits: extra.slice(0, 3).map(n => ({ at: at(n), r: 22 })) };
    },
    hint(k) {
      if (k === 1) return { text: 'Add up each strip from its first fold. Pieces alternate: wall, roof, wall, roof. The walls must reach the last fold, the roofs the distance of the first fold below the gutter.' };
      const left = brokenN().filter(n => !marked.has(n));
      const n = left[0] ?? brokenN()[0];
      if (n === undefined) return { text: 'Every strip stands.' };
      const why = profileOf(strips[n].folds).why;
      return { text: k === 2 ? 'This strip tears.' : `This strip tears: ${why}.`, culprits: [{ at: () => board.toClient([(strips[n].x0 + strips[n].x1) / 2, 0]), r: 22 }] };
    },
    async solved() {
      busy = true;
      view.markColumn([]);
      view.showTorn(true);
      sfx.slide();
      frameCard(view);
      await view.open(OPEN, 1700);
      sfx.thud();
      stage.rig.step(-1);
      await wait(900, { essential: true });
    },
    dispose() { offTap(); board.el.removeEventListener('pointermove', move); board.dispose(); closeCard(); view.dispose(); },
  };
}

// ------------------------------------------------------------------
// workshop: design any card, open it, export it
// ------------------------------------------------------------------

function workshopTask() {
  const start = { W: 12, D: 6, H: 7, cols: Array(12).fill(null) };
  const view = addCard(start);
  const board = openCard('Workshop', '12 × 13 · export SVG');
  let theta = OPEN, busy = false;
  const ed = createEditor(board, start, {
    onChange(c) { view.set(c); stage.invalidate(); refresh(); },
    onHover(i) { view.markColumn(i === null ? [] : [i]); stage.invalidate(); },
  });
  board.fit();
  function refresh() {
    const c = ed.card, bad = stripsOf(c).filter(st => !profileOf(st.folds).ok).length;
    frame.sub(`Design any card. Tap a row to fold a column there; drag along a row for several. <em>${plural(stripsOf(c).length, 'strip')}</em>${bad ? `, ${bad} cannot stand` : ''}.`, true);
    frame.primary({ label: theta === OPEN ? 'Close' : 'Open', run: toggleOpen, disabled: busy });
  }
  async function toggleOpen() {
    if (busy) return;
    busy = true; refresh();
    theta = theta === OPEN ? FLAT : OPEN;
    sfx.slide();
    await view.open(theta, 1300);
    if (theta === OPEN) sfx.thud();
    busy = false; refresh();
  }
  function exportSVG() {
    const svg = svgOf(ed.card, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = 'origamic-card.svg';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    frame.say('Card exported: cut solid, valley dashed, mountain dash-dot. 10 mm grid.', { ms: 2600 });
  }
  function random() {
    ed.set(randomCard(seededRng('ws:' + Date.now()), { W: 12, D: 6, H: 7, strips: [3, 5], width: [1, 2], steps: [1, 3] }));
    sfx.flap();
  }
  frame.title('Workshop.', 'Free card');
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: () => ed.undo() },
    { id: 'clear', label: 'Clear', key: 'C', run: () => ed.clear() },
    { id: 'random', label: 'Random', key: 'R', run: random },
    { id: 'export', label: 'Export SVG', key: 'E', run: exportSVG },
  ]);
  viewKeys();
  refresh();
  return { board, view, editor: ed, exportSVG, check: () => ({ ok: false, note: '' }), dispose() { ed.dispose(); board.dispose(); closeCard(); view.dispose(); } };
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
    { key: 'T', label: 'Look down: the plan', run: () => stage.rig.setView(-90 * D2R, 86 * D2R) },
    { key: 'F', label: 'Look from the front: the elevation', run: () => stage.rig.setView(-90 * D2R, 4 * D2R) },
    { key: 'S', label: 'Look from the side: the section', run: () => stage.rig.setView(180 * D2R, 4 * D2R) },
  ]);
}

// ------------------------------------------------------------------
// the game definition for the session
// ------------------------------------------------------------------

let task = null;
function reset() {
  task?.dispose();
  red.clear();
  stage.clear();
  stage.rig.setView(YAW, PITCH, false);
}
function load(item) {
  reset();
  frame.primaryEl.style.display = item.task === 'read' ? 'none' : '';
  const { rng, card } = cardOf(item);
  task = item.task === 'read' ? readTask(item, card, rng) : item.task === 'tear' ? tearTask(item, card, rng) : drawTask(item, card);
}
function openWorkshop() {
  reset();
  frame.primaryEl.style.display = '';
  task = workshopTask();
}

// generated puzzles
function generate(rng, d) {
  const big = d >= 6;
  const kind = pick(rng, d <= 1 ? ['read', 'draw', 'tear'] : ['read', 'draw', 'tear', 'draw', d >= 4 ? 'plans' : 'read']);
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = {
    id: 'g' + seed, seed, task: kind, name: 'Generated card',
    strips: d <= 1 ? [2, 2] : d <= 4 ? [2, 3] : d <= 7 ? [3, 4] : [4, 5],
    steps: [1, d <= 2 ? 1 : d <= 5 ? 2 : 3],
    width: [1, d <= 3 ? 3 : 2],
    broken: kind === 'tear' ? (d >= 6 ? 2 : 1) : undefined,
    ...(big ? { W: 12, D: 6, H: 7 } : {}),
  };
  return { ...item, label: `Generated card · ${TASK_TAGS[kind]}`, par: parOf(item) };
}

const def = {
  id: 'origamic', prefix: 'O', name: 'Origamic',
  lead: 'Cut, fold, open.',
  sub: 'One sheet, cuts and folds: open the card to 90 degrees and a building stands up. Every column is a section.',
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
session.start();
window.__udp = { stage, session, get task() { return task; } };
