// Build Order: take a building apart and put it together again in an order
// that can actually stand. Real construction systems: trabeated stone, arches
// on their centering, timber frames, joinery, steel, Dom-ino.
//
// Three tasks share the site (levels.js):
//   dismantle  Take it apart. Tap a part: it leaves along a free way if nothing
//              rests on it; otherwise it shakes and the culprit lights up
//   assemble   Put it together. The parts wait in an exploded axonometric, each
//              on the line it travels; tap them in, strike the centering last
//   free       What comes out? Mark every part that could come out now
// The workshop is a free site: any structure, take it apart, rebuild it.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createPicker } from '../../src/stage/pick.js';
import { createLabels } from '../../src/stage/labels.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { buildModel, canRemove, canPlace, removable, assemblyFrom, dismantleOrder, DIRS } from '../../src/core/tectonics.js';
import { pick } from '../../src/core/rand.js';
import { createBuildView } from './view3d.js';
import { PACKS } from './levels.js';

const stage = createStage(document.getElementById('stage'));
const frame = createFrame({ game: 'buildorder', name: 'Build Order', stage });
const red = createRedlines(stage);
const picker = createPicker(stage);
const labels = createLabels(stage);

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

const TITLES = { dismantle: 'Take it apart.', assemble: 'Put it together.', free: 'What comes out?' };
const TASK_TAGS = { dismantle: 'take apart', assemble: 'put together', free: 'what comes out' };
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const ARROW = { '+z': '↑', '-z': '↓', '+x': '→', '-x': '←', '+y': '↗', '-y': '↙' };
const vec = d => new THREE.Vector3(...DIRS[d]);

function parOf(l) {
  const n = buildModel(l.build, l.opts).parts.length;
  const p = l.task === 'free' ? 15 + n * 2 : l.task === 'dismantle' ? 8 + n * 3.5 : 12 + n * 5;
  return Math.round(p / 5) * 5;
}
const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l) })),
}));

// the site log: the order so far, in the side card
function createLog(title) {
  const body = frame.card(true, title, '');
  const card = document.querySelector('.udp-card');
  card.classList.add('is-log');
  body.replaceChildren();
  const ol = document.createElement('ol');
  ol.className = 'bo-log';
  body.append(ol);
  frame.layout();
  const rows = [];
  function draw() {
    ol.replaceChildren(...rows.slice(-12).map(r => {
      const li = document.createElement('li');
      if (r.cls) li.className = r.cls;
      li.innerHTML = `<b>${String(r.n).padStart(2, '0')}</b><span>${r.text}</span><i>${r.mark || ''}</i>`;
      return li;
    }));
  }
  return {
    push(text, { mark = '', cls = '' } = {}) { rows.push({ n: rows.length + 1, text, mark, cls }); draw(); },
    pop() { rows.pop(); draw(); },
    get length() { return rows.length; },
    note(t) { frame.cardNote(t); },
    close() { card.classList.remove('is-log'); frame.card(false); },
  };
}

function addView(m) {
  const v = createBuildView(m, { invalidate: () => stage.invalidate() });
  stage.content.add(v.group);
  return v;
}
function frameView(v, all = false) {
  const r = stage.rect;
  stage.frame(v.box(all), { padding: Math.max(16, Math.min(70, Math.min(r.w, r.h) * .1)) });
}
const at = (v, id) => () => {
  const c = v.centre(id);
  const [x, y] = stage.project([c.x, c.y, c.z]);
  const r = stage.canvas.getBoundingClientRect();
  return [x + r.left, y + r.top];
};

// pointing at a part: a tint and its name beside it; tapping: fn(id)
function partPointer(v, { can = () => true, onTap } = {}) {
  const label = labels.add([0, 0, 0], '', { offset: [0, -26] });
  label.set({ hidden: true });
  let cur = null;
  const hit = ev => {
    const h = picker.face(ev, v.meshes.filter(m => m.parent.visible));
    const id = h ? v.idOf(h.object) : null;
    return id && can(id) ? id : null;
  };
  const move = ev => {
    if (ev.buttons) return;
    const id = hit(ev);
    if (id === cur) return;
    if (cur) v.hover(cur, false);
    cur = id;
    if (id) {
      v.hover(id, true);
      label.set({ at: v.centre(id).toArray(), text: v.name(id), hidden: false });
    } else label.set({ hidden: true });
    stage.canvas.style.cursor = id ? 'pointer' : '';
    stage.invalidate();
  };
  stage.canvas.addEventListener('pointermove', move);
  const offTap = stage.rig.onTap(ev => { const id = hit(ev); if (id) onTap(id, ev); });
  return {
    clear() { if (cur) v.hover(cur, false); cur = null; label.set({ hidden: true }); stage.canvas.style.cursor = ''; },
    dispose() { stage.canvas.removeEventListener('pointermove', move); offTap(); label.remove(); stage.canvas.style.cursor = ''; },
  };
}

// why a part cannot move, in words
function whyNot(m, r) {
  if (r.why === 'rests') return `${m.byId.get(r.by).name} rests on it.`;
  if (r.why === 'needs') return `Nothing to stand on yet: it needs ${r.ids.map(id => m.byId.get(id).name).join(' and ')}.`;
  if (r.by === 'ground') return 'It cannot go down into the ground.';
  return `${m.byId.get(r.by).name} is in the way.`;
}

// where a part waits off the building, on the line it travels along d: parts
// that drop in rise with their height, parts that slide in stand off
function standOff(p, d) {
  const ext = [p.bbox[3] - p.bbox[0], p.bbox[4] - p.bbox[1], p.bbox[5] - p.bbox[2]];
  const v = DIRS[d], k = v[0] ? 0 : v[1] ? 1 : 2;
  const dist = d === '+z' ? p.centre[2] * .7 + 1.8 : ext[k] + (p.temp ? 3.2 : 2.2);
  return vec(d).multiplyScalar(dist).toArray();
}

// the whole thing flies back together, quickly: from the parts still standing
// when it can, else from nothing
async function rebuild(m, v, from = new Set(), { fast = true } = {}) {
  let seq = assemblyFrom(m, from);
  if (!seq) { for (const p of m.parts) v.show(p.id, false); seq = assemblyFrom(m, new Set()) || []; }
  for (const mv of seq) {
    const far = vec(mv.dir).multiplyScalar(5);
    if (mv.op === 'in') {
      v.place(mv.id, far.toArray());
      v.show(mv.id, true);
      v.fly(mv.id, far.toArray(), [0, 0, 0], { duration: fast ? 380 : 650 });
    } else v.fly(mv.id, [0, 0, 0], far.toArray(), { duration: fast ? 380 : 650, out: true });
    sfx.tick();
    await wait(fast ? 110 : 420, { essential: true });
  }
  await wait(450, { essential: true });
  sfx.thud();
}

// ------------------------------------------------------------------
// task: take it apart
// ------------------------------------------------------------------

function dismantleTask(item, m, { free = false } = {}) {
  const v = addView(m);
  // temporary works (an arch's centering) wait beside the site: an arch comes
  // down only once its centering is back under it
  const temps = m.parts.filter(p => p.temp).map(p => p.id);
  const parked = new Map(temps.map(id => [id, standOff(m.byId.get(id), m.byId.get(id).slide[0])]));
  const park = () => { for (const id of temps) { v.show(id, true); v.place(id, parked.get(id)); } };
  park();
  frameView(v, temps.length > 0);
  const present = new Set(m.goal);
  const log = createLog(free ? 'Site' : 'Order');
  const total = m.goal.size;
  let lastHint = null;

  function refresh() {
    const left = [...present].filter(id => m.goal.has(id)).length;
    log.note(`${total - left} of ${total} out`);
    const tmp = temps.length ? ' The centering waits beside the site: tap it in when the stones need it, and strike it at the end.' : '';
    frame.sub(free
      ? `A free site. Tap a part to take it out; Rebuild puts everything back.${tmp} <em>${plural(present.size, 'part')}</em> standing.`
      : `Tap the parts out one by one. A part leaves only if nothing rests on it and nothing is in its way.${tmp} <em>${plural(present.size, 'part')}</em> to go.`, true);
  }
  function refuse(id, r, way) {
    ptr.clear();
    v.shake(id, way);
    if (r.by && r.by !== 'ground') { v.setState(r.by, 'error'); setTimeout(() => { v.setState(r.by, 'normal'); stage.invalidate(); }, 1200); }
    if (free) { frame.say(whyNot(m, r), { ms: 2200 }); sfx.error(); return; }
    const culprit = r.why === 'needs' ? r.ids[0] : r.by;
    session.miss({ note: whyNot(m, r), culprits: culprit && culprit !== 'ground' ? [{ at: at(v, culprit), r: 26 }] : [] });
  }
  function unhint() { if (lastHint) { for (const id of [].concat(lastHint)) v.setState(id, 'normal'); lastHint = null; } }
  async function take(id) {
    red.clear();
    const p = m.byId.get(id);
    if (!present.has(id)) {
      if (!p.temp) return;
      const r = canPlace(m, present, id);
      if (!r.ok) return refuse(id, r, DIRS[r.dir || p.slide[0]]);
      present.add(id);
      ptr.clear(); unhint(); frame.say('');
      log.push(`${p.name} in`, { mark: ARROW[r.dir], cls: 'is-temp' });
      sfx.snap();
      refresh();
      await v.fly(id, v.offset(id).toArray(), [0, 0, 0], { duration: 560 });
      return;
    }
    const r = canRemove(m, present, id);
    if (!r.ok) return refuse(id, r, r.dir ? DIRS[r.dir] : [0, 0, 1]);
    present.delete(id);
    ptr.clear(); unhint(); frame.say('');
    log.push(p.temp ? `${p.name} struck` : p.name, { mark: ARROW[r.dir], cls: p.temp ? 'is-temp' : '' });
    sfx.slide();
    refresh();
    if (p.temp) await v.fly(id, [0, 0, 0], parked.get(id), { duration: 560 });
    else await v.fly(id, [0, 0, 0], vec(r.dir).multiplyScalar(6).toArray(), { out: true });
    if (!present.size && !free) session.check();
  }
  const ptr = partPointer(v, { can: id => present.has(id) || temps.includes(id), onTap: take });

  frame.title(free ? 'Workshop.' : TITLES.dismantle, item.name);
  frame.tools(free ? [] : [{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]);
  viewKeys();
  refresh();

  return {
    v, take, present,
    _order: () => (dismantleOrder(m, present) || []).map(x => x.id),
    check: () => ({ ok: !present.size }),
    hint(k) {
      if (k === 1) return { text: `Start at the top. A part comes out when nothing rests on it and one way out (up, or along a side) is clear.${temps.length ? ' An arch without its keystone falls: give it back its centering first.' : ''}` };
      unhint();
      const next = dismantleOrder(m, present);
      const mv = next?.[0];
      if (!mv) return { text: 'Nothing can come out.' };
      if (mv.op === 'in') {
        lastHint = mv.id;
        v.setState(mv.id, 'selected');
        return { text: `Nothing comes out safely as it stands: put ${m.byId.get(mv.id).name} back in first.`, culprits: [{ at: at(v, mv.id), r: 30 }] };
      }
      const ids = removable(m, present);
      if (k === 2) {
        lastHint = mv.id;
        v.setState(mv.id, 'selected');
        return { text: `${m.byId.get(mv.id).name} can come out now.`, culprits: [{ at: at(v, mv.id), r: 26 }] };
      }
      lastHint = ids;
      ids.forEach(id => v.setState(id, 'selected'));
      return { text: `${plural(ids.length, 'part')} can come out now.`, culprits: ids.slice(0, 4).map(id => ({ at: at(v, id), r: 22 })) };
    },
    rebuild: async () => {
      unhint();
      for (const id of temps) if (!present.has(id)) v.show(id, false);
      await rebuild(m, v, present);
      park();
      present.clear();
      for (const id of m.goal) present.add(id);
      refresh();
      log.note('rebuilt');
    },
    solved: async () => { ptr.clear(); await wait(300, { essential: true }); await rebuild(m, v); stage.rig.step(-1); await wait(700, { essential: true }); },
    dispose() { ptr.dispose(); log.close(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: put it together
// ------------------------------------------------------------------

function assembleTask(item, m) {
  const v = addView(m);
  const seq = assemblyFrom(m, new Set());
  // each part waits on the line it travels in, as in an exploded axonometric
  const home = new Map();
  for (const mv of seq) {
    if (mv.op !== 'in' || home.has(mv.id)) continue;
    home.set(mv.id, { dir: mv.dir, off: standOff(m.byId.get(mv.id), mv.dir) });
  }
  for (const p of m.parts) v.place(p.id, home.get(p.id)?.off || [0, 0, 0]);
  frameView(v, true);
  const present = new Set();
  const done = [];                                 // [{ op, id }] for undo
  const log = createLog('Order');
  let lastHint = null;

  const finished = () => [...m.goal].every(id => present.has(id)) && [...present].every(id => m.goal.has(id));
  function refresh() {
    const temps = m.parts.filter(p => p.temp);
    const left = [...m.goal].filter(id => !present.has(id)).length;
    log.note(`${m.goal.size - left} of ${m.goal.size} in`);
    frame.sub(`Tap the parts in, in an order that stands. ${temps.length ? 'Temporary works go in first and come out last: tap the centering again to strike it. ' : ''}<em>${plural(left, 'part')}</em> to go.`, true);
    frame.tool('undo', { off: !done.length });
  }
  async function tap(id) {
    red.clear();
    const p = m.byId.get(id);
    if (lastHint) { v.setState(lastHint, 'normal'); lastHint = null; }
    if (present.has(id)) {
      if (!p.temp) return;
      const r = canRemove(m, present, id);
      if (!r.ok) { v.shake(id, DIRS[home.get(id).dir]); session.miss({ note: `Not yet: ${whyNot(m, r)}`, culprits: r.by && r.by !== 'ground' ? [{ at: at(v, r.by), r: 26 }] : [] }); return; }
      present.delete(id);
      done.push({ op: 'out', id });
      ptr.clear(); frame.say('');
      log.push(`${p.name} struck`, { mark: ARROW[r.dir], cls: 'is-temp' });
      sfx.slide();
      refresh();
      await v.fly(id, [0, 0, 0], vec(r.dir).multiplyScalar(6).toArray(), { out: true });
      if (finished()) session.check();
      return;
    }
    const r = canPlace(m, present, id);
    if (!r.ok) {
      v.shake(id, DIRS[home.get(id)?.dir || '+z']);
      const culprit = r.why === 'needs' ? r.ids[0] : r.by;
      session.miss({ note: whyNot(m, r), culprits: culprit && culprit !== 'ground' ? [{ at: at(v, culprit), r: 26 }] : [] });
      return;
    }
    present.add(id);
    done.push({ op: 'in', id });
    ptr.clear(); frame.say('');
    log.push(p.name, { mark: ARROW[r.dir], cls: p.temp ? 'is-temp' : '' });
    sfx.snap();
    refresh();
    await v.fly(id, v.offset(id).toArray(), [0, 0, 0], { duration: 560 });
    sfx.tick();
    if (finished()) session.check();
  }
  async function undo() {
    const last = done.pop();
    if (!last) return;
    red.clear();
    log.pop();
    const h = home.get(last.id);
    if (last.op === 'in') {
      present.delete(last.id);
      await v.fly(last.id, [0, 0, 0], h.off, { duration: 420 });
    } else {
      present.add(last.id);
      v.show(last.id, true);
      v.place(last.id, [0, 0, 0]);
    }
    sfx.tick();
    refresh();
  }
  const ptr = partPointer(v, { can: id => !present.has(id) || m.byId.get(id).temp, onTap: tap });

  frame.title(TITLES.assemble, item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  return {
    v, tap, present,
    _order: () => (assemblyFrom(m, present) || []).map(x => x.id),
    check: () => ({ ok: finished() }),
    hint(k) {
      if (k === 1) return { text: 'Build from the ground up. A part goes in when everything it rests on is in and its way in is clear. Watch for a part that would close the way for another.' };
      const next = assemblyFrom(m, present);
      if (!next) {
        const back = [...done].reverse().find(d => d.op === 'in' && assemblyFrom(m, new Set([...present].filter(x => x !== d.id))));
        return { text: back ? `This cannot be finished from here: take back ${m.byId.get(back.id).name} (Undo).` : 'This cannot be finished from here: undo a few steps.' };
      }
      const mv = next[0];
      lastHint = mv.id;
      v.setState(mv.id, 'selected');
      const what = mv.op === 'out' ? `Strike ${m.byId.get(mv.id).name}.` : `${m.byId.get(mv.id).name} can go in next.`;
      return { text: k === 2 ? what : `${what} Then ${next.slice(1, 3).map(x => m.byId.get(x.id).name).join(', then ')}.`, culprits: [{ at: present.has(mv.id) ? at(v, mv.id) : at(v, mv.id), r: 26 }] };
    },
    solved: async () => { ptr.clear(); await wait(350, { essential: true }); sfx.thud(); frameView(v); stage.rig.step(-1); await wait(1200, { essential: true }); },
    dispose() { ptr.dispose(); log.close(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: what comes out
// ------------------------------------------------------------------

function freeTask(item, m) {
  const v = addView(m);
  frameView(v);
  const present = new Set(m.goal);
  const answer = new Set(removable(m, present));
  const marked = new Set();
  frame.card(false);

  function refresh() {
    frame.sub(`Mark every part that could come out right now: nothing rests on it and one way out is clear. <em>${plural(marked.size, 'part')}</em> marked.`, true);
    frame.primary({ label: 'Check', run: () => session.check(), disabled: !marked.size, ready: marked.size > 0 });
  }
  function toggle(id) {
    red.clear();
    if (marked.has(id)) { marked.delete(id); v.mark(id, false); sfx.tick(); }
    else { marked.add(id); v.mark(id, true); sfx.pencil(); }
    stage.invalidate();
    refresh();
  }
  const ptr = partPointer(v, { onTap: toggle });

  frame.title(TITLES.free, item.name);
  frame.tools([{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]);
  viewKeys();
  refresh();

  return {
    v, toggle,
    _answer: () => [...answer],
    check() {
      const extra = [...marked].filter(id => !answer.has(id)), missing = [...answer].filter(id => !marked.has(id));
      if (!extra.length && !missing.length) return { ok: true };
      const parts = [];
      if (extra.length) parts.push(`${m.byId.get(extra[0]).name} cannot: ${whyNot(m, canRemove(m, present, extra[0])).replace(/\.$/, '').toLowerCase()}`);
      if (missing.length) parts.push(`${plural(missing.length, 'part')} that could ${missing.length === 1 ? 'is' : 'are'} not marked`);
      return { ok: false, note: parts.join('; ') + '.', culprits: extra.slice(0, 3).map(id => ({ at: at(v, id), r: 24 })) };
    },
    hint(k) {
      if (k === 1) return { text: 'Look at each part from above and from the sides: does anything sit on it, and is there one direction it can slide without touching anything?' };
      if (k === 2) return { text: `${plural(answer.size, 'part')} can come out now.` };
      const id = [...answer].find(x => !marked.has(x)) || [...answer][0];
      return { text: `${m.byId.get(id).name} can.`, culprits: [{ at: at(v, id), r: 26 }] };
    },
    async solved() {
      ptr.clear();
      sfx.slide();
      await Promise.all([...answer].map(id => v.fly(id, [0, 0, 0], vec(canRemove(m, present, id).dir).multiplyScalar(5).toArray(), { out: true, duration: 900 })));
      await wait(400, { essential: true });
    },
    dispose() { ptr.dispose(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// the camera keys every task shares
// ------------------------------------------------------------------

function viewKeys(extra = []) {
  frame.keys([
    { key: 'ArrowLeft', label: 'Turn the view', run: () => stage.rig.step(-1) },
    { key: 'ArrowRight', run: () => stage.rig.step(1) },
    { key: 'ArrowUp', label: 'Tilt the view', run: () => stage.rig.tilt(8) },
    { key: 'ArrowDown', run: () => stage.rig.tilt(-8) },
    ...extra,
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
  labels.clear?.();
}
function load(item) {
  reset();
  frame.primaryEl.style.display = item.task === 'free' ? '' : 'none';
  const m = buildModel(item.build, item.opts || {});
  task = item.task === 'assemble' ? assembleTask(item, m) : item.task === 'free' ? freeTask(item, m) : dismantleTask(item, m);
}

// workshop: any structure, take it apart freely, rebuild it
const SITES = [
  ['Temple front', 'temple', { n: 4 }], ['Arcade', 'arcade', { count: 3 }], ['Gable roof', 'gableRoof', {}], ['Log crib', 'logCrib', { courses: 6 }],
  ['Keyed tenons', 'keyedFrame', { posts: 3 }], ['Lattice', 'halfLap', { n: 3 }], ['Steel, two storeys', 'steelFrame', { bays: 2, storeys: 2 }], ['Dom-ino', 'domino', { storeys: 3, cladding: true }],
];
let site = 0;
function openWorkshop() {
  reset();
  frame.primaryEl.style.display = '';
  const [name, build, opts] = SITES[site];
  const m = buildModel(build, opts);
  task = dismantleTask({ name }, m, { free: true });
  const go = d => { site = (site + d + SITES.length) % SITES.length; openWorkshop(); };
  frame.tools([
    { id: 'prev', label: 'Previous', key: '[', run: () => go(-1) },
    { id: 'next', label: 'Next', key: ']', run: () => go(1) },
  ]);
  frame.primary({ label: 'Rebuild', run: () => task.rebuild() });
}

// generated puzzles
const GEN_NAMES = { trilithon: 'Trilithon', wall: 'Running bond', deck: 'Deck', halfLap: 'Half lap', steelFrame: 'Steel frame', colonnade: 'Colonnade',
  arch: 'Round arch', pergola: 'Pergola', logCrib: 'Log crib', keyedFrame: 'Keyed tenons', domino: 'Dom-ino', corbel: 'Corbelled opening', temple: 'Temple front',
  arcade: 'Arcade', gableRoof: 'Gable roof' };
function generate(rng, d) {
  const pool = d <= 2 ? [['trilithon', {}], ['wall', { courses: 3, len: 3 }], ['deck', {}], ['halfLap', { n: 2 }], ['steelFrame', { bays: 1, braced: false, deckOn: false }]]
    : d <= 5 ? [['colonnade', { n: 3 }], ['arch', { m: 5 }], ['pergola', {}], ['logCrib', { courses: 4 }], ['keyedFrame', { posts: 2 }], ['steelFrame', { bays: 1 }], ['domino', { storeys: 1 }], ['corbel', { courses: 3 }]]
    : [['temple', { n: 4 }], ['arcade', { count: 2 }], ['gableRoof', {}], ['halfLap', { n: 3 }], ['keyedFrame', { posts: 3 }], ['steelFrame', { bays: 2, storeys: 2 }], ['domino', { storeys: 2, cladding: true }], ['arch', { m: 7 }]];
  const [build, opts] = pick(rng, pool);
  // an arch has nothing free to mark until its centering is back
  const hasTemp = build === 'arch' || build === 'arcade';
  const kind = pick(rng, hasTemp ? ['assemble', 'dismantle'] : ['dismantle', 'assemble', 'free']);
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = { id: 'g' + seed, seed, task: kind, name: GEN_NAMES[build], build, opts };
  return { ...item, label: `${GEN_NAMES[build]} · ${TASK_TAGS[kind]}`, par: parOf(item) };
}

const def = {
  id: 'buildorder', prefix: 'B', name: 'Build Order',
  lead: 'Take it apart. Put it together.',
  sub: 'Real construction systems, part by part: a block leaves only when nothing rests on it and its way out is clear; an arch stands only once its keystone is in.',
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
// for tests: a client point where the pointer finds part id
function pointOf(id) {
  const v = task?.v, mesh = v?.meshes.find(x => x.userData.partId === id);
  if (!mesh) return null;
  const b = new THREE.Box3().setFromObject(mesh), r = stage.canvas.getBoundingClientRect();
  const pts = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(stage.project([x, y, z]));
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const fx = .5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) / 13, fy = .5 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) / 13;
    const ev = { clientX: r.left + x0 + (x1 - x0) * fx, clientY: r.top + y0 + (y1 - y0) * fy };
    const h = picker.face(ev, v.meshes.filter(m => m.parent.visible));
    if (h && v.idOf(h.object) === id) return [ev.clientX, ev.clientY];
  }
  return null;
}
window.__udp = { stage, session, pointOf, get task() { return task; } };
