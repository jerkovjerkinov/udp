// Stack: modules on a site. Pick a module from the tray, turn and tip it; its
// ghost follows the pointer and drops onto the column under it. The stack is
// right when it works as housing: every module carried, lit, with a roof
// garden, and a way in (the rules of each level, src/core/stack.js).
//
// Tasks (levels.js): fill the massing, habitat, match the drawings, fix the
// stack, optimise. The workshop is an open site with every module and rule.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createPicker } from '../../src/stage/pick.js';
import { createLabels } from '../../src/stage/labels.js';
import { createLines } from '../../src/stage/lines.js';
import { createFrame, esc } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { seededRng, pick } from '../../src/core/rand.js';
import { SHAPES, oriented, turn, tip, drop, evaluate, WHY, ruleLines, RULE_NAMES, matchDrawings, levelFrom, cloneMods, K } from '../../src/core/stack.js';
import { createStackView } from './view3d.js';
import { PACKS } from './levels.js';

const D2R = Math.PI / 180;
const YAW = -118 * D2R, PITCH = 32 * D2R;
const stage = createStage(document.getElementById('stage'), { camera: { pitch: PITCH } });
const frame = createFrame({ game: 'stack', name: 'Stack', stage });
const red = createRedlines(stage);
const picker = createPicker(stage);
const labels = createLabels(stage);

const TITLES = { fill: 'Fill the massing.', habitat: 'Make it habitable.', match: 'Match the drawings.', fix: 'Fix the stack.', optimise: 'Design for the score.' };
const TASK_TAGS = { fill: 'fill', habitat: 'habitat', match: 'drawings', fix: 'fix', optimise: 'optimise' };
const GOAL_NAMES = { terrace: 'Roof garden', daylight: 'Windows' };
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;

// ------------------------------------------------------------------
// levels
// ------------------------------------------------------------------

const cache = new Map();
function levelOf(spec) {
  const key = spec.id || spec.seed;
  if (!cache.has(key)) cache.set(key, levelFrom(spec, i => seededRng('stack:' + key + ':' + i)));
  return cache.get(key);
}
function parOf(spec) {
  const n = spec.task === 'fill' ? Math.ceil(spec.mass.flat().reduce((a, b) => a + b, 0) / 3.5) : spec.types.length;
  const rules = Object.values(spec.rules || {}).filter(v => v !== null && v !== undefined && v !== false).length;
  const per = { fill: 14, habitat: 9 + rules * 4, match: 16 + rules * 3, fix: 7 + rules * 3, optimise: 18 + rules * 4 }[spec.task];
  return Math.round((20 + n * per) / 5) * 5;
}
const packs = PACKS.map(pk => ({ ...pk, levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l) })) }));

// ------------------------------------------------------------------
// the tray, the rules and the drawings: the side card
// ------------------------------------------------------------------

// a module as a small cabinet drawing (front, top, side), for the tray
function iconOf(type, o = 0, s = 9) {
  const cells = oriented(type, o);
  const set = new Set(cells.map(c => K(...c)));
  const P = (x, y, z) => [x * s + y * s * .5, -z * s - y * s * .5];
  const pts = cells.flatMap(c => [P(c[0], c[1], c[2]), P(c[0] + 1, c[1] + 1, c[2] + 1)]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
  const poly = (q, cls) => `<polygon class="${cls}" points="${q.map(p => (p[0] - x0).toFixed(1) + ',' + (p[1] - y0).toFixed(1)).join(' ')}"/>`;
  const order = cells.slice().sort((a, b) => b[1] - a[1] || a[2] - b[2] || a[0] - b[0]);
  let svg = '';
  for (const [x, y, z] of order) {
    if (!set.has(K(x, y - 1, z))) svg += poly([P(x, y, z), P(x + 1, y, z), P(x + 1, y, z + 1), P(x, y, z + 1)], 'f');
    if (!set.has(K(x, y, z + 1))) svg += poly([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], 't');
    if (!set.has(K(x + 1, y, z))) svg += poly([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], 's');
  }
  return `<svg class="st-icon" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}">${svg}</svg>`;
}

// a drawing on squared paper: target cells hatched in signal, the stack's in grey
function drawingSVG(target, now, cols, rows, label) {
  const s = Math.max(9, Math.min(18, Math.floor(120 / Math.max(cols, rows))));
  const W = cols * s, H = rows * s;
  let g = '';
  for (let i = 0; i <= cols; i++) g += `<line class="g" x1="${i * s}" y1="0" x2="${i * s}" y2="${H}"/>`;
  for (let j = 0; j <= rows; j++) g += `<line class="g" x1="0" y1="${j * s}" x2="${W}" y2="${j * s}"/>`;
  let cells = '';
  for (const k of now) { const [a, b] = k.split(',').map(Number); if (a < cols && b < rows) cells += `<rect class="n${target.has(k) ? '' : ' x'}" x="${a * s}" y="${H - (b + 1) * s}" width="${s}" height="${s}"/>`; }
  for (const k of target) { const [a, b] = k.split(',').map(Number); cells += `<rect class="t" x="${a * s + 1}" y="${H - (b + 1) * s + 1}" width="${s - 2}" height="${s - 2}"/><line class="h" x1="${a * s + 2}" y1="${H - b * s - 2}" x2="${a * s + s - 2}" y2="${H - (b + 1) * s + 2}"/>`; }
  return `<figure class="st-draw"><svg viewBox="-1 -1 ${W + 2} ${H + 2}" width="${W + 2}" height="${H + 2}">${g}${cells}</svg><figcaption>${label}</figcaption></figure>`;
}

function createCard() {
  const body = frame.card(true, 'Modules', '');
  const card = document.querySelector('.udp-card');
  card.classList.add('is-tray');
  body.replaceChildren();
  const draw = document.createElement('div'); draw.className = 'st-drawings';
  const tray = document.createElement('div'); tray.className = 'st-tray';
  const rules = document.createElement('ul'); rules.className = 'st-rules';
  body.append(draw, tray, rules);
  frame.layout();
  return {
    draw, tray, rules,
    note(t) { frame.cardNote(t); },
    close() { card.classList.remove('is-tray'); frame.card(false); },
  };
}

// ------------------------------------------------------------------
// one site: the play every task shares
// ------------------------------------------------------------------

let ids = 0;
const newId = () => 'p' + (++ids);

function createPlay(item, lv, { free = false } = {}) {
  const { site, rules } = lv;
  const view = createStackView(site, { invalidate: () => stage.invalidate() });
  stage.content.add(view.group);
  stage.rig.setView(YAW, PITCH, false);
  const r0 = stage.rect;
  stage.frame(view.box(), { padding: Math.max(16, Math.min(60, Math.min(r0.w, r0.h) * .08)) });
  const card = createCard();
  const label = labels.add([0, 0, 0], '', { offset: [0, -30], className: 'st-why' });
  label.set({ hidden: true });
  const hintLines = createLines([], 'signalFold', { renderOrder: 5 });
  view.group.add(hintLines);

  // state
  let mods = cloneMods(lv.start || []);
  const start = cloneMods(lv.start || []);
  const counts = {};
  for (const t of lv.tray) counts[t] = (counts[t] || 0) + 1;
  const order = [...new Set(lv.tray)];
  const orient = {};                               // the last orientation per shape
  let hand = null;                                 // { type, o, id? }
  let history = [];
  let ev = evaluate(site, mods, rules);
  let lastCol = null, lastGhost = null, hoverId = null;

  if (lv.task === 'fill') view.setTarget(lv.target);
  const details = lv.task !== 'fill';
  const left = () => Object.values(counts).reduce((a, b) => a + b, 0);
  const snapshot = () => history.push({ mods: cloneMods(mods), counts: { ...counts }, hand: hand && { ...hand } });

  function select(type) {
    if (!type || !counts[type]) { hand = null; }
    else hand = { type, o: orient[type] ?? 0 };
    lastCol = null;
    sfx.tick();
    refresh();
  }
  function nextType() { return order.find(t => counts[t] > 0) || null; }

  // ---- status: tray, rules, drawings, the sub line --------------
  function status() {
    const ok = lv.task === 'fill' ? fillState() : null;
    // tray
    if (lv.task === 'fix') {
      card.tray.innerHTML = `<p class="st-tray-note">${hand ? 'Drop it where every rule holds.' : 'Tap a module to lift it. Only one may move: lifting another puts the first back.'}</p>`;
    } else {
      card.tray.innerHTML = order.map((t, i) => `<button type="button" class="st-mod${hand?.type === t ? ' is-on' : ''}${counts[t] ? '' : ' is-out'}" data-type="${t}"${counts[t] ? '' : ' disabled'}>
        ${iconOf(t, orient[t] ?? 0)}<span class="st-mod-name"><b>${i + 1}</b> ${esc(SHAPES[t].name)}</span><span class="st-mod-n">${free ? '∞' : '×' + counts[t]}</span></button>`).join('');
    }
    // rules
    const rows = [];
    const n = mods.length;
    if (lv.task === 'fill') rows.push({ text: 'Massing', v: `${ok.inside} / ${lv.target.length}`, ok: ok.inside === lv.target.length && !ok.outside });
    if (lv.task === 'fill' && ok.outside) rows.push({ text: 'Outside the massing', v: plural(ok.outside, 'cell'), ok: false });
    if (lv.task !== 'fill') for (const r of ruleLines(rules)) {
      const bad = [...ev.fails.values()].filter(f => f.some(x => x.rule === r.rule)).length;
      rows.push({ text: `${RULE_NAMES[r.rule]} · ${r.text}`, v: n ? `${n - bad} / ${n}` : '—', ok: n > 0 && !bad });
    }
    if (lv.task === 'match') {
      const md = matchDrawings(mods, lv.drawings);
      rows.push({ text: 'Plan', v: md.plan ? 'matches' : 'differs', ok: md.plan }, { text: 'Front elevation', v: md.front ? 'matches' : 'differs', ok: md.front });
      card.draw.innerHTML = drawingSVG(lv.drawings.plan, md.now.plan, site.W, site.D, 'Plan') + drawingSVG(lv.drawings.front, md.now.front, site.W, site.H, 'Front');
    } else card.draw.innerHTML = '';
    if (lv.task === 'optimise' || free) {
      const g = lv.goal || { kind: 'terrace' };
      rows.push({ text: `${GOAL_NAMES[g.kind]} score`, v: lv.goal ? `${ev.score[g.kind]} / ${g.value}` : `${ev.score.terrace} roof · ${ev.score.daylight} windows`, ok: lv.goal ? ev.score[g.kind] >= g.value : true, score: true });
    }
    card.rules.innerHTML = rows.map(r => `<li class="${r.ok ? 'is-ok' : r.score ? '' : 'is-bad'}"><span>${esc(r.text)}</span><i>${esc(r.v)}</i></li>`).join('');
    card.note(lv.task === 'fix' ? `${ev.failing.length ? plural(ev.failing.length, 'module') + ' failing' : 'all well'}` : free ? `${mods.length} placed` : `${left()} left`);
    frame.layout();
    // sub line
    const sub = {
      fill: `Fill the signal massing exactly. <em>${plural(left(), 'module')}</em> left.`,
      habitat: `Place every module so every rule holds. <em>${plural(left(), 'module')}</em> left.`,
      match: `Place the modules so the stack matches the plan and the front elevation. <em>${plural(left(), 'module')}</em> left.`,
      fix: `${ev.failing.length ? `<em>${plural(ev.failing.length, 'module')}</em> ${ev.failing.length === 1 ? 'breaks' : 'break'} a rule.` : 'Every rule holds.'} Move one module so every rule holds.`,
      optimise: `Every rule must hold, and the ${lv.goal ? GOAL_NAMES[lv.goal.kind].toLowerCase() : ''} score must reach <em>${lv.goal?.value}</em>.`,
    }[lv.task];
    frame.sub(free ? `An open site: every module, every rule. ${plural(mods.length, 'module')} placed.` : sub, true);
    frame.tool('undo', { off: !history.length });
    const done = lv.task === 'fix' ? !hand : !left();
    if (!free) frame.primary({ label: 'Check', run: () => session.check(), disabled: false, ready: done });
  }
  card.tray.addEventListener('click', e => { const b = e.target.closest('.st-mod'); if (b && !b.disabled) select(hand?.type === b.dataset.type ? null : b.dataset.type); });

  function fillState() {
    const t = new Set(lv.target.map(c => K(...c)));
    let inside = 0, outside = 0;
    for (const m of mods) for (const c of m.cells) t.has(K(...c)) ? inside++ : outside++;
    return { inside, outside };
  }

  function paintStates() {
    view.clearStates();
    if (lv.task === 'fill') {
      const t = new Set(lv.target.map(c => K(...c)));
      for (const m of mods) if (m.cells.some(c => !t.has(K(...c)))) view.setState(m.id, 'error');
    } else for (const id of ev.failing) view.setState(id, 'error');
    if (hoverId) view.setState(hoverId, 'hint');
  }
  function refresh() {
    ev = evaluate(site, mods, rules);
    view.setMods(mods, ev, { details });
    paintStates();
    status();
    updateGhost();
  }

  // ---- the ghost ---------------------------------------------------
  function columnAt(e) {
    const objs = [...view.meshes, ...view.coreMeshes];
    const h = picker.face(e, objs);
    if (h) return { col: view.columnOf(h), id: view.idOf(h.object) };
    const P = picker.plane(e, 'ground');
    const c = view.groundColumn(P);
    return c && c[0] >= -1 && c[1] >= -1 && c[0] <= site.W && c[1] <= site.D ? { col: c, id: null } : null;
  }
  // what goes wrong if the hand lands here: the first new failure
  function reasonFor(cells) {
    const m = { id: hand.id || '_ghost', type: hand.type, o: hand.o, cells };
    const ev2 = evaluate(site, [...mods.filter(x => x.id !== m.id), m], rules);
    if (lv.task === 'fill') {
      const t = new Set(lv.target.map(c => K(...c)));
      return cells.every(c => t.has(K(...c))) ? null : 'Outside the massing.';
    }
    const mine = ev2.fails.get(m.id);
    if (mine) return mine[0].text;
    for (const [id, f] of ev2.fails) if (!ev.fails.has(id) || ev.fails.get(id).length < f.length) {
      const what = { daylight: 'takes the window of', terrace: 'covers the roof garden of', support: 'unsettles', access: 'cuts off' }[f[f.length - 1].rule];
      return `It ${what} the ${SHAPES[mods.find(x => x.id === id).type].name.toLowerCase()} next to it.`;
    }
    return null;
  }
  let ghostAt = null;
  function updateGhost(col = lastCol) {
    lastCol = col;
    if (!hand || !col) { view.setGhost(null); label.set({ hidden: true }); ghostAt = null; return; }
    const r = drop(site, mods, oriented(hand.type, hand.o), col[0], col[1], { skip: hand.id });
    ghostAt = r;
    const why = r.ok ? reasonFor(r.cells) : WHY[r.why];
    const show = r.why !== 'site' || r.cells.some(c => c[0] >= 0 && c[1] >= 0 && c[0] < site.W && c[1] < site.D);
    if (!show) { view.setGhost(null); label.set({ hidden: true }); return; }
    view.setGhost(r.cells, r.ok && !why);
    const top = r.cells.reduce((a, c) => c[2] > a[2] ? c : a, r.cells[0]);
    label.set({ at: view.cellCentre([top[0], top[1], top[2] + .7]), text: why || '', hidden: !why, signal: true });
  }

  function move(e) {
    if (e.buttons || e.pointerType === 'touch') return;
    const a = columnAt(e);
    const id = !hand && a?.id && canLift(a.id) ? a.id : null;
    if (id !== hoverId) { hoverId = id; paintStates(); stage.canvas.style.cursor = id ? 'pointer' : ''; }
    const col = hand ? a?.col || null : null;
    if (String(col) !== String(lastCol)) updateGhost(col);
  }
  stage.canvas.addEventListener('pointermove', move);
  const canLift = id => !!mods.find(m => m.id === id);

  // ---- acting ------------------------------------------------------
  async function place() {
    if (!hand || !ghostAt) return;
    if (!ghostAt.ok) { sfx.error(); frame.say(WHY[ghostAt.why], { ms: 1600 }); return; }
    snapshot();
    const m = { id: hand.id || newId(), type: hand.type, o: hand.o, cells: ghostAt.cells };
    mods = [...mods.filter(x => x.id !== m.id), m];
    if (!free && counts[hand.type]) counts[hand.type]--;
    const kept = hand;
    hand = lv.task === 'fix' ? null : counts[kept.type] > 0 || free ? { type: kept.type, o: kept.o } : (nextType() ? { type: nextType(), o: orient[nextType()] ?? 0 } : null);
    red.clear(); frame.say('');
    clearHint();
    refresh();
    sfx.snap();
    view.land(m.id).then(() => sfx.tick());
    if (!free && done()) { await wait(320, { essential: true }); session.check(); }
  }
  function lift(id) {
    const m = mods.find(x => x.id === id);
    if (!m) return;
    snapshot();
    if (lv.task === 'fix') {
      // only one module may move: the others go back where they started
      mods = mods.map(x => x.id === id ? x : (start.find(s => s.id === x.id) ? cloneMods([start.find(s => s.id === x.id)])[0] : x));
      hand = { type: m.type, o: m.o, id: m.id };
      mods = mods.filter(x => x.id !== id);
    } else {
      mods = mods.filter(x => x.id !== id);
      if (!free) counts[m.type]++;
      hand = { type: m.type, o: m.o };
      orient[m.type] = m.o;
    }
    hoverId = null;
    red.clear(); frame.say('');
    sfx.slide();
    refresh();
  }
  function undo() {
    const s = history.pop();
    if (!s) return;
    mods = s.mods; Object.assign(counts, s.counts); hand = s.hand;
    red.clear(); frame.say('');
    sfx.tick();
    refresh();
  }
  function rotate(fn) {
    if (!hand) return;
    hand.o = fn(hand.o);
    orient[hand.type] = hand.o;
    sfx.tick();
    status();
    updateGhost();
  }
  function putBack() {
    if (!hand) return;
    if (lv.task === 'fix') { undo(); return; }
    hand = null;
    refresh();
  }

  const offTap = stage.rig.onTap(e => {
    const a = columnAt(e);
    if (!a) return;
    if (!hand) { if (a.id && canLift(a.id)) lift(a.id); return; }
    // on a touch screen the first tap shows the ghost, the second drops it
    if (e.pointerType === 'touch' && String(a.col) !== String(lastCol)) { updateGhost(a.col); return; }
    updateGhost(a.col);
    place();
  });

  // ---- checking ----------------------------------------------------
  function done() {
    if (lv.task === 'fill') { const s = fillState(); return s.inside === lv.target.length && !s.outside; }
    if (lv.task === 'fix') return !hand && ev.ok;
    if (left()) return false;
    if (!ev.ok) return false;
    if (lv.task === 'match') { const md = matchDrawings(mods, lv.drawings); return md.plan && md.front; }
    if (lv.task === 'optimise') return ev.score[lv.goal.kind] >= lv.goal.value;
    return true;
  }
  const at = c => () => {
    const [x, y] = stage.project(c);
    const r = stage.canvas.getBoundingClientRect();
    return [x + r.left, y + r.top];
  };
  const culpritsOf = list => list.slice(0, 3).map(id => ({ at: at(view.centre(id)), r: 26 }));
  function check() {
    if (done()) return { ok: true };
    if (lv.task === 'fill') {
      const s = fillState();
      if (s.outside) {
        const t = new Set(lv.target.map(c => K(...c)));
        const bad = mods.filter(m => m.cells.some(c => !t.has(K(...c)))).map(m => m.id);
        return { ok: false, note: `${plural(s.outside, 'cell')} outside the massing.`, culprits: culpritsOf(bad) };
      }
      return { ok: false, note: `${plural(lv.target.length - s.inside, 'cell')} of the massing still empty.` };
    }
    if (lv.task === 'fix' && hand) return { ok: false, note: 'Drop the module you are holding first.' };
    if (!ev.ok) {
      const [id, f] = [...ev.fails][0];
      const name = SHAPES[mods.find(m => m.id === id).type].name;
      const by = f[0].by?.length ? ` (${f[0].by.map(b => SHAPES[mods.find(m => m.id === b)?.type]?.name.toLowerCase()).filter(Boolean).join(', ')} in the way)` : '';
      return { ok: false, note: `${name}: ${f[0].text.replace(/\.$/, '')}${by}.`, culprits: culpritsOf(ev.failing) };
    }
    if (left()) return { ok: false, note: `${plural(left(), 'module')} still in the tray.` };
    if (lv.task === 'match') {
      const md = matchDrawings(mods, lv.drawings);
      return { ok: false, note: !md.plan && !md.front ? 'Neither the plan nor the front elevation matches yet.' : !md.plan ? 'The front matches; the plan does not.' : 'The plan matches; the front elevation does not.' };
    }
    if (lv.task === 'optimise') return { ok: false, note: `Every rule holds, but the ${GOAL_NAMES[lv.goal.kind].toLowerCase()} score is ${ev.score[lv.goal.kind]}; the goal is ${lv.goal.value}.` };
    return { ok: false };
  }

  // ---- hints: one module of a solution, then the whole of it ---------
  function clearHint() { hintLines.setSegments([]); stage.invalidate(); }
  function showHint(list) {
    const segs = [];
    for (const m of list) for (const [a, b] of edgesOf(m.cells)) segs.push([a, b]);
    hintLines.setSegments(segs);
    stage.invalidate();
  }
  function edgesOf(cells) {
    const W = site.W, D = site.D, w = p => [p[0] - W / 2, p[1] - D / 2, p[2]];
    const set = new Set(cells.map(c => K(...c))), out = [];
    for (const c of cells) for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      // the twelve edges of each cell, minus those inside the module
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const a = c.slice(), b = c.slice();
        const k = dx ? 0 : dy ? 1 : 2, i = (k + 1) % 3, j = (k + 2) % 3;
        a[i] += u; a[j] += v; b[i] += u; b[j] += v; b[k] += 1;
        const ni = [0, 0, 0], nj = [0, 0, 0]; ni[i] = u ? 1 : -1; nj[j] = v ? 1 : -1;
        const inner = set.has(K(c[0] + ni[0], c[1] + ni[1], c[2] + ni[2])) || set.has(K(c[0] + nj[0], c[1] + nj[1], c[2] + nj[2]));
        if (!inner) out.push([w(a), w(b)]);
      }
    }
    return out;
  }
  const occupied = () => new Set(mods.flatMap(m => m.cells.map(c => K(...c))));
  function hint(k) {
    if (k === 1) return { text: {
      fill: 'Work from the bottom up: a module only drops onto what is under it. Fill the corners and the low parts first, and keep the awkward shapes for where they fit.',
      habitat: 'Keep a gap of open ground in front of every window, and leave each module part of its roof. The overhang counts across the plan from the cells that are carried.',
      match: 'Read the plan for where there is something, and the front for how high. A column high in the front can stand anywhere along its row.',
      fix: 'The failing module is not always the one to move: something may stand in front of its window or on its roof.',
      optimise: lv.goal?.kind === 'terrace' ? 'Every cell covered by another module is a garden lost. Spread the modules and step them like a hillside.' : 'Every cell face that sees out over open ground to the edge of the site is a window. Keep the stack thin and the ground in front of it open.',
    }[lv.task] };
    const sol = lv.solution;
    if (lv.task === 'fix') {
      const [id, f] = [...ev.fails][0] || [];
      if (k === 2) return { text: id ? `${SHAPES[mods.find(m => m.id === id).type].name}: ${f[0].text}` : 'Every rule holds already: drop what you hold.', culprits: id ? culpritsOf([id]) : [] };
      const s = sol.find(m => m.id === lv.moved);
      showHint([s]);
      const now = mods.find(m => m.id === lv.moved) || null;
      return { text: `Move the ${SHAPES[s.type].name.toLowerCase()}: the dashed outline is one place where every rule holds.`, culprits: now ? culpritsOf([now.id]) : [] };
    }
    const occ = occupied();
    const free = sol.filter(m => m.cells.every(c => !occ.has(K(...c))));
    if (!free.length) return { text: 'Your stack has left the known solution: undo a few moves, or lift the modules in the way.' };
    if (k === 2) {
      const m = free.find(x => counts[x.type] > 0) || free[0];
      showHint([m]);
      return { text: `One way: a ${SHAPES[m.type].name.toLowerCase()} in the dashed outline.` };
    }
    showHint(free);
    return { text: `The dashed outlines are one solution: ${plural(free.length, 'module')} still to go.` };
  }

  frame.title(free ? 'Workshop.' : TITLES[lv.task], item.name);
  frame.tools([
    { id: 'turn', label: 'Turn', key: 'E', keys: ['Q'], legend: 'Turn the module (Q back)', run: e => rotate(o => turn(o, e?.key?.toLowerCase() === 'q' ? -1 : 1)) },
    { id: 'tip', label: 'Tip', key: 'R', legend: 'Tip the module on its side', run: () => rotate(tip) },
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'down', label: 'Hand', key: 'X', legend: 'Put the module down, to lift one instead', hidden: true, run: putBack },
    ...(free ? [{ id: 'clear', label: 'Clear', key: 'C', run: () => { snapshot(); mods = []; hand = { type: order[0], o: 0 }; refresh(); } }]
      : [{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]),
  ]);
  frame.keys([
    ...order.slice(0, 9).map((t, i) => ({ key: String(i + 1), label: i === 0 ? 'Take a module from the tray' : undefined, run: () => select(t) })),
    { key: 'ArrowLeft', label: 'Turn the view', run: () => stage.rig.step(-1) },
    { key: 'ArrowRight', run: () => stage.rig.step(1) },
    { key: 'ArrowUp', label: 'Tilt the view', run: () => stage.rig.tilt(8) },
    { key: 'ArrowDown', run: () => stage.rig.tilt(-8) },
    { key: 'T', label: 'Look down: the plan', run: () => stage.rig.setView(-90 * D2R, 86 * D2R) },
    { key: 'F', label: 'Look from the street: the front', run: () => stage.rig.setView(-90 * D2R, 3 * D2R) },
  ]);
  if (free) frame.primaryEl.style.display = 'none';
  else frame.primaryEl.style.display = '';
  if (lv.task !== 'fix') hand = { type: order[0], o: 0 };
  refresh();

  return {
    view, check, hint,
    // tests: place a solution module through the same path as a tap
    _solution: () => lv.solution,
    _level: () => lv,
    _place(m) { hand = { type: m.type, o: m.o, id: lv.task === 'fix' ? m.id : undefined }; ghostAt = { ok: true, cells: m.cells }; return place(); },
    _lift: lift,
    get hand() { return hand; },
    // tests: the client point over the top of column (x, y)
    _pointOver(x, y) {
      const z = Math.max(0, ...mods.flatMap(m => m.cells.filter(c => c[0] === x && c[1] === y).map(c => c[2] + 1)));
      const [px, py] = stage.project(view.cellCentre([x, y, z - .5]));
      const r = stage.canvas.getBoundingClientRect();
      return [px + r.left, py + r.top];
    },
    get mods() { return mods; },
    get ev() { return ev; },
    select, rotate,
    async solved() {
      label.set({ hidden: true });
      view.setGhost(null);
      clearHint();
      hand = null;
      sfx.done();
      // a slow quarter turn round the finished stack, centred on the site
      stage.rig.step(-1);
      await wait(900, { essential: true });
    },
    dispose() {
      stage.canvas.removeEventListener('pointermove', move);
      offTap();
      label.remove();
      hintLines.dispose();
      card.close();
      view.dispose();
      stage.canvas.style.cursor = '';
    },
  };
}

// ------------------------------------------------------------------
// the session
// ------------------------------------------------------------------

let task = null;
function reset() {
  task?.dispose();
  task = null;
  red.clear();
  stage.clear();
  labels.clear();
}
function load(item) {
  reset();
  const lv = levelOf(item);
  task = createPlay(item, lv);
}

function openWorkshop() {
  reset();
  const lv = { task: 'habitat', site: { W: 6, D: 5, H: 6, cores: [[1, 3], [4, 2]], street: true }, rules: { support: 1, daylight: 'any', terrace: 1, access: true },
    tray: ['studio', 'flat', 'corner', 'family', 'tee', 'square', 'step'], solution: [] };
  task = createPlay({ name: 'Open site' }, lv, { free: true });
}

// generated sites, harder with the difficulty
const GEN_TYPES = ['flat', 'corner', 'studio', 'family', 'studio', 'corner', 'flat', 'tee'];
function generate(rng, d) {
  const seed = Math.floor(rng() * 1e9).toString(36);
  let spec;
  if (d <= 2 && rng() < .5) {
    const W = 2 + Math.floor(rng() * 2), D = 2, h = 1 + Math.floor(rng() * 2);
    spec = { task: 'fill', mass: Array.from({ length: D }, () => Array.from({ length: W }, () => h)), pool: ['studio', 'corner', 'flat', 'square', 'family'] };
    spec.site = { W, D, H: h };
  } else {
    const n = Math.min(8, 4 + Math.floor(d / 2));
    const W = d < 5 ? 4 : 5, D = d < 4 ? 3 : 4;
    const rules = d <= 2 ? { support: 1 } : d <= 4 ? { support: 1, daylight: 'any' } : d <= 6 ? { support: 1, daylight: 'any', terrace: 1 } : { support: 1, daylight: pick(rng, ['any', 'south']), terrace: d >= 9 ? 2 : 1, access: true };
    const cores = rules.access ? [[Math.floor(W / 2), Math.floor(D / 2)]] : [];
    const kind = pick(rng, d <= 3 ? ['habitat', 'match'] : ['habitat', 'match', 'fix', 'optimise']);
    spec = { task: kind, site: { W, D, H: W, cores }, types: GEN_TYPES.slice(0, n), rules, goal: rng() < .5 ? 'terrace' : 'daylight', hard: d > 5 };
  }
  const item = { ...spec, id: 'g' + seed, seed, name: 'Generated site' };
  if (!levelOf(item)) return generate(rng, Math.max(1, d - 1));
  return { ...item, label: `Generated site · ${TASK_TAGS[item.task]}`, par: parOf(item) };
}

const def = {
  id: 'stack', prefix: 'S', name: 'Stack',
  lead: 'Each roof is another\'s garden.',
  sub: 'Drop modules onto a site so the stack works as housing: every unit carried, lit, with a roof open to the sky and a way in.',
  packs, load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  workshop: openWorkshop,
  dailyDifficulty: 6,
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
window.__udp = { stage, session, turn, tip, get task() { return task; } };
void THREE;
