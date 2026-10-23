// Build Order: take a building apart and put it together again in an order
// that can actually stand. Real construction systems: trabeated stone, arches
// on their centering, timber frames, joinery, steel, Dom-ino.
//
// Geometry and physics share the work. A part moves only along a way nothing
// blocks (tectonics.js sweeps). Whether what is left stands is the physics' to
// say (physics.js, a rigid-body world of dry stone and timber): take out the
// wrong part and the building comes down for real, then goes back as it was.
//
// Five tasks share the site (levels.js):
//   dismantle  Take it apart, part by part, in an order that stands
//   assemble   Put it together from an exploded axonometric; strike the centering last
//   free       What comes out? Mark every part that could come out now
//   keep       Keep it up: take out as many parts as you can; the orange ones stay up
//   test       Stands or falls? Three versions with parts missing: say, then watch
// The workshop is a free site: any structure, take it apart, bring it down, rebuild it.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createPicker } from '../../src/stage/pick.js';
import { createLabels } from '../../src/stage/labels.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait, every, reducedMotion } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { buildModel, slideOut, slideIn, blocker, assemblyFrom, dismantleOrder, DIRS } from '../../src/core/tectonics.js';
import { loadPhysics, runWorld } from '../../src/core/physics.js';
import { createVerdicts, canStrip, keepSearch, testCases } from '../../src/core/stability.js';
import { pick, seededRng } from '../../src/core/rand.js';
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

const TITLES = { dismantle: 'Take it apart.', assemble: 'Put it together.', free: 'What comes out?', keep: 'Keep it up.', test: 'Stands or falls?' };
const TASK_TAGS = { dismantle: 'take apart', assemble: 'put together', free: 'what comes out', keep: 'keep it up', test: 'stands or falls' };
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const ARROW = { '+z': '↑', '-z': '↓', '+x': '→', '-x': '←', '+y': '↗', '-y': '↙' };
const vec = d => new THREE.Vector3(...DIRS[d]);
const away = d => vec(d).multiplyScalar(6).toArray();

function parOf(l) {
  const n = buildModel(l.build, l.opts).parts.length;
  const p = l.task === 'free' ? 15 + n * 2 : l.task === 'dismantle' ? 8 + n * 3.5 : l.task === 'keep' ? 20 + (l.target || 4) * 8
    : l.task === 'test' ? 45 : 12 + n * 5;
  return Math.round(p / 5) * 5;
}
const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: parOf(l) })),
}));

// names, as a sentence: "the lintel", "Column 2 and Architrave 1", "Column 2, Architrave 1 and 3 more"
function namesOf(m, ids) {
  const n = ids.map(id => m.byId.get(id).name);
  if (n.length <= 2) return n.join(' and ');
  return `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
}

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
const padOf = () => { const r = stage.rect; return Math.max(16, Math.min(70, Math.min(r.w, r.h) * .1)); };
function frameView(v, all = false) { stage.frame(v.box(all), { padding: padOf() }); }
// the end of a level: one glide that turns a step and frames the first and the
// last state of the site together, centred
function finaleView(box) { return stage.frameTurn(box, -1, { padding: padOf() }); }
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
  if (r.why === 'keep') return 'That one has to stay up.';
  if (r.why === 'falls') return `${namesOf(m, r.falling)} would come down.`;
  if (r.why === 'rests') return `${m.byId.get(r.by).name} rests on it.`;
  if (r.by === 'ground') return 'It cannot go down into the ground.';
  return `${m.byId.get(r.by).name} is in the way.`;
}
const fellNote = (m, what, falling) => `${what}: ${namesOf(m, falling)} came down.`;

// where a part waits off the building, on the line it travels along d: parts
// that drop in rise with their height, parts that slide in stand off
function standOff(p, d) {
  const ext = [p.bbox[3] - p.bbox[0], p.bbox[4] - p.bbox[1], p.bbox[5] - p.bbox[2]];
  const v = DIRS[d], k = v[0] ? 0 : v[1] ? 1 : 2;
  const dist = d === '+z' ? p.centre[2] * .7 + 1.8 : ext[k] + (p.temp ? 3.2 : 2.2);
  return vec(d).multiplyScalar(dist).toArray();
}

// The physics, played for the eye: the parts in `ids` start where they stand
// and what falls, falls (under the lean it fell under). Then everything goes
// back: each part to its offset in `back` (home when not given).
async function collapse(v, m, ids, verdict, back = new Map()) {
  for (const id of verdict.falling) v.setState(id, 'error');
  sfx.crash();
  if (!reducedMotion()) {
    const run = runWorld(m, ids, { lean: verdict.lean });
    await new Promise(done => {
      let n = 0;
      const stop = every(() => {
        run.step(1);
        n++;
        for (const p of run.poses()) v.pose(p.id, p.c, p.q);
        if (n >= 170 || (n > 45 && run.asleep())) { stop(); done(); }
      });
    });
    run.free();
    await wait(500, { essential: true });
  }
  sfx.slide();
  await Promise.all(ids.map(id => v.settleTo(id, back.get(id) || [0, 0, 0], { duration: 800 })));
  for (const id of verdict.falling) v.setState(id, 'normal');
  stage.invalidate();
}

// the whole thing flies back together: from the parts still standing when it
// can, else from nothing; each part lands before the last one is done
async function rebuild(m, v, from = new Set(), { fast = true } = {}) {
  let seq = assemblyFrom(m, from);
  if (!seq) { for (const p of m.parts) v.show(p.id, false); seq = assemblyFrom(m, new Set()) || []; }
  const flights = [];
  for (const mv of seq) {
    const far = vec(mv.dir).multiplyScalar(5);
    if (mv.op === 'in') {
      v.place(mv.id, far.toArray());
      v.show(mv.id, true);
      flights.push(v.fly(mv.id, far.toArray(), [0, 0, 0], { duration: fast ? 380 : 650 }));
    } else flights.push(v.fly(mv.id, [0, 0, 0], far.toArray(), { duration: fast ? 380 : 650, out: true }));
    sfx.tick();
    await wait(fast ? 110 : 420, { essential: true });
  }
  await Promise.all(flights);
  await wait(300, { essential: true });
  sfx.thud();
}

// ------------------------------------------------------------------
// task: take it apart (and the workshop's free site)
// ------------------------------------------------------------------

function dismantleTask(item, m, V, { free = false } = {}) {
  const v = addView(m);
  // temporary works (an arch's centering) wait beside the site: an arch comes
  // down only once its centering is back under it
  const temps = m.parts.filter(p => p.temp).map(p => p.id);
  const parked = new Map(temps.map(id => [id, standOff(m.byId.get(id), m.byId.get(id).slide[0])]));
  const park = () => { for (const id of temps) { v.show(id, true); v.place(id, parked.get(id)); } };
  park();
  const first = v.box(true);
  stage.frame(first, { padding: padOf() });
  const present = new Set(m.goal);
  const log = createLog(free ? 'Site' : 'Order');
  const total = m.goal.size;
  let lastHint = null, busy = false;

  function refresh() {
    const left = [...present].filter(id => m.goal.has(id)).length;
    log.note(`${total - left} of ${total} out`);
    const tmp = temps.length ? ' The centering waits beside the site: tap it in when the stones need it, and strike it at the end.' : '';
    frame.sub(free
      ? `A free site. Tap a part to take it out; what loses its support comes down. Rebuild puts everything back.${tmp} <em>${plural(present.size, 'part')}</em> standing.`
      : `Tap the parts out one by one, along a way that is clear. Take out one that carries something and what it carried comes down.${tmp} <em>${plural(present.size, 'part')}</em> to go.`, true);
  }
  function refuse(id, r, way) {
    ptr.clear();
    v.shake(id, way);
    if (r.by && r.by !== 'ground') { v.setState(r.by, 'error'); setTimeout(() => { v.setState(r.by, 'normal'); stage.invalidate(); }, 1200); }
    if (free) { frame.say(whyNot(m, r), { ms: 2200 }); sfx.error(); return; }
    session.miss({ note: whyNot(m, r), culprits: r.by && r.by !== 'ground' ? [{ at: at(v, r.by), r: 26 }] : [] });
  }
  function unhint() { if (lastHint) { for (const id of [].concat(lastHint)) v.setState(id, 'normal'); lastHint = null; } }
  async function take(id) {
    if (busy) return;
    red.clear();
    const p = m.byId.get(id);
    if (!present.has(id)) {
      // the centering goes back under
      if (!p.temp) return;
      const r = slideIn(m, present, id);
      if (!r.ok) return refuse(id, r, DIRS[r.dir || p.slide[0]]);
      present.add(id);
      ptr.clear(); unhint(); frame.say('');
      log.push(`${p.name} in`, { mark: ARROW[r.dir], cls: 'is-temp' });
      sfx.snap();
      refresh();
      busy = true;
      await v.fly(id, v.offset(id).toArray(), [0, 0, 0], { duration: 560 });
      busy = false;
      return;
    }
    const r = slideOut(m, present, id);
    if (!r.ok) return refuse(id, r, DIRS[r.dir]);
    const rest = [...present].filter(x => x !== id);
    const verdict = V.check(rest);
    present.delete(id);
    ptr.clear(); unhint(); frame.say('');
    log.push(p.temp ? `${p.name} struck` : p.name, { mark: ARROW[r.dir], cls: p.temp ? 'is-temp' : '' });
    sfx.slide();
    refresh();
    busy = true;
    const to = p.temp ? parked.get(id) : away(r.dir);
    if (verdict.stands) {
      await v.fly(id, [0, 0, 0], to, { out: !p.temp, duration: p.temp ? 560 : 650 });
      busy = false;
      if (!present.size && !free) session.check();
      return;
    }
    // it comes down, then everything goes back as it was
    await v.fly(id, [0, 0, 0], to, { duration: 520 });
    const note = fellNote(m, `Without ${p.name}`, verdict.falling);
    if (free) { frame.say(note, { ms: 3200 }); sfx.error(); } else session.miss({ note, label: 'Collapse' });
    await collapse(v, m, rest, verdict);
    present.add(id);
    log.pop();
    refresh();
    await v.fly(id, to, [0, 0, 0], { duration: 520 });
    busy = false;
  }
  const ptr = partPointer(v, { can: id => !busy && (present.has(id) || temps.includes(id)), onTap: take });

  frame.title(free ? 'Workshop.' : TITLES.dismantle, item.name);
  frame.tools(free ? [] : [{ id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() }]);
  viewKeys();
  refresh();

  return {
    v, take, present,
    get busy() { return busy; },
    _order: () => (dismantleOrder(m, present, { stable: V.stable }) || []).map(x => x.id),
    check: () => ({ ok: !present.size }),
    hint(k) {
      if (k === 1) return { text: `Start at the top. A part can come out when one way out (up, or along a side) is clear and nothing it carries would lose its support.${temps.length ? ' An arch without its keystone falls: give it back its centering first.' : ''}` };
      unhint();
      const next = dismantleOrder(m, present, { stable: V.stable });
      const mv = next?.[0];
      if (!mv) return { text: 'Nothing can come out safely from here.' };
      if (mv.op === 'in') {
        lastHint = mv.id;
        v.setState(mv.id, 'selected');
        return { text: `Nothing comes out safely as it stands: put ${m.byId.get(mv.id).name} back in first.`, culprits: [{ at: at(v, mv.id), r: 30 }] };
      }
      if (k === 2) {
        lastHint = mv.id;
        v.setState(mv.id, 'selected');
        return { text: `${m.byId.get(mv.id).name} can come out now.`, culprits: [{ at: at(v, mv.id), r: 26 }] };
      }
      const ids = next.slice(0, 3).filter(x => x.op === 'out').map(x => x.id);
      lastHint = ids;
      ids.forEach(id => v.setState(id, 'selected'));
      return { text: `Next: ${ids.map(id => m.byId.get(id).name).join(', then ')}.`, culprits: ids.map(id => ({ at: at(v, id), r: 22 })) };
    },
    rebuild: async () => {
      if (busy) return;
      busy = true;
      unhint();
      for (const id of temps) if (!present.has(id)) v.show(id, false);
      await rebuild(m, v, present);
      park();
      present.clear();
      for (const id of m.goal) present.add(id);
      refresh();
      log.note('rebuilt');
      busy = false;
    },
    solved: async () => {
      ptr.clear();
      await wait(300, { essential: true });
      for (const id of temps) v.show(id, false);
      await rebuild(m, v);
      park();
      finaleView(first);
      await wait(1100, { essential: true });
    },
    dispose() { ptr.dispose(); log.close(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: put it together
// ------------------------------------------------------------------

function assembleTask(item, m, V) {
  const v = addView(m);
  const seq = assemblyFrom(m, new Set(), { stable: V.stable }) || assemblyFrom(m, new Set());
  // each part waits on the line it travels in, as in an exploded axonometric
  const home = new Map();
  for (const mv of seq) {
    if (mv.op !== 'in' || home.has(mv.id)) continue;
    home.set(mv.id, { dir: mv.dir, off: standOff(m.byId.get(mv.id), mv.dir) });
  }
  for (const p of m.parts) if (!home.has(p.id)) home.set(p.id, { dir: '+z', off: standOff(p, '+z') });
  for (const p of m.parts) v.place(p.id, home.get(p.id).off);
  const first = v.box(true);
  stage.frame(first, { padding: padOf() });
  const present = new Set();
  const done = [];                                 // [{ op, id, from }] for undo
  const log = createLog('Order');
  let lastHint = null, busy = false;

  const finished = () => [...m.goal].every(id => present.has(id)) && [...present].every(id => m.goal.has(id));
  function refresh() {
    const temps = m.parts.filter(p => p.temp);
    const left = [...m.goal].filter(id => !present.has(id)).length;
    log.note(`${m.goal.size - left} of ${m.goal.size} in`);
    frame.sub(`Tap the parts in, in an order that stands: a part set where nothing carries it comes down. ${temps.length ? 'Temporary works go in first and come out last: tap the centering again to strike it. ' : ''}<em>${plural(left, 'part')}</em> to go.`, true);
    frame.tool('undo', { off: !done.length });
  }
  // the way in: along the part's own line if that is clear, else any clear one
  function wayIn(id) {
    const p = m.byId.get(id), h = home.get(id);
    const rest = new Set(present);
    rest.delete(id);
    const by = blocker(m, rest, p, DIRS[h.dir]);
    if (!by) return { ok: true, dir: h.dir };
    const r = slideIn(m, present, id);
    return r.ok ? r : { ok: false, why: 'blocked', by, dir: h.dir };
  }
  async function tap(id) {
    if (busy) return;
    red.clear();
    const p = m.byId.get(id);
    if (lastHint) { for (const x of [].concat(lastHint)) v.setState(x, 'normal'); lastHint = null; }
    const h = home.get(id);
    if (present.has(id)) {
      // striking temporary works
      if (!p.temp) return;
      const r = slideOut(m, present, id);
      if (!r.ok) { v.shake(id, DIRS[r.dir]); session.miss({ note: `Not yet: ${whyNot(m, r)}`, culprits: r.by && r.by !== 'ground' ? [{ at: at(v, r.by), r: 26 }] : [] }); return; }
      const rest = [...present].filter(x => x !== id);
      const verdict = V.check(rest);
      present.delete(id);
      done.push({ op: 'out', id });
      ptr.clear(); frame.say('');
      log.push(`${p.name} struck`, { mark: ARROW[r.dir], cls: 'is-temp' });
      sfx.slide();
      refresh();
      busy = true;
      if (verdict.stands) {
        await v.fly(id, [0, 0, 0], away(r.dir), { out: true });
        busy = false;
        if (finished()) session.check();
        return;
      }
      await v.fly(id, [0, 0, 0], away(r.dir), { duration: 520 });
      session.miss({ note: fellNote(m, `Struck too soon`, verdict.falling), label: 'Collapse' });
      await collapse(v, m, rest, verdict);
      present.add(id); done.pop(); log.pop(); refresh();
      await v.fly(id, away(r.dir), [0, 0, 0], { duration: 520 });
      busy = false;
      return;
    }
    const r = wayIn(id);
    if (!r.ok) {
      v.shake(id, DIRS[h.dir]);
      session.miss({ note: whyNot(m, r), culprits: r.by && r.by !== 'ground' ? [{ at: at(v, r.by), r: 26 }] : [] });
      return;
    }
    const from = r.dir === h.dir ? h.off : standOff(p, r.dir);
    const after = [...present, id];
    const verdict = V.check(after);
    present.add(id);
    done.push({ op: 'in', id });
    ptr.clear(); frame.say('');
    log.push(p.name, { mark: ARROW[r.dir], cls: p.temp ? 'is-temp' : '' });
    sfx.snap();
    refresh();
    busy = true;
    await v.fly(id, v.offset(id).toArray(), [0, 0, 0], { duration: 560 });
    if (verdict.stands) {
      sfx.tick();
      busy = false;
      if (finished()) session.check();
      return;
    }
    session.miss({ note: fellNote(m, `${p.name} in`, verdict.falling), label: 'Collapse' });
    await collapse(v, m, after, verdict, new Map([[id, from]]));
    v.place(id, from);
    present.delete(id); done.pop(); log.pop(); refresh();
    busy = false;
  }
  async function undo() {
    if (busy) return;
    const last = done.pop();
    if (!last) return;
    red.clear();
    log.pop();
    const h = home.get(last.id);
    busy = true;
    if (last.op === 'in') {
      present.delete(last.id);
      await v.fly(last.id, [0, 0, 0], h.off, { duration: 420 });
    } else {
      present.add(last.id);
      v.show(last.id, true);
      v.place(last.id, [0, 0, 0]);
    }
    busy = false;
    sfx.tick();
    refresh();
  }
  const ptr = partPointer(v, { can: id => !busy && (!present.has(id) || m.byId.get(id).temp), onTap: tap });

  frame.title(TITLES.assemble, item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  return {
    v, tap, present,
    get busy() { return busy; },
    _order: () => (assemblyFrom(m, present, { stable: V.stable }) || []).map(x => x.id),
    check: () => ({ ok: finished() }),
    hint(k) {
      if (k === 1) return { text: 'Build from the ground up. A part goes in when its way in is clear, and it stays only if what it lands on can carry it. Watch for a part that would close the way for another.' };
      const next = assemblyFrom(m, present, { stable: V.stable });
      if (!next) {
        const back = [...done].reverse().find(d => d.op === 'in' && assemblyFrom(m, new Set([...present].filter(x => x !== d.id)), { stable: V.stable }));
        return { text: back ? `This cannot be finished from here: take back ${m.byId.get(back.id).name} (Undo).` : 'This cannot be finished from here: undo a few steps.' };
      }
      const mv = next[0];
      lastHint = mv.id;
      v.setState(mv.id, 'selected');
      const what = mv.op === 'out' ? `Strike ${m.byId.get(mv.id).name}.` : `${m.byId.get(mv.id).name} can go in next.`;
      return { text: k === 2 ? what : `${what} Then ${next.slice(1, 3).map(x => m.byId.get(x.id).name).join(', then ')}.`, culprits: [{ at: at(v, mv.id), r: 26 }] };
    },
    solved: async () => { ptr.clear(); await wait(350, { essential: true }); sfx.thud(); finaleView(first); await wait(1300, { essential: true }); },
    dispose() { ptr.dispose(); log.close(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: what comes out
// ------------------------------------------------------------------

function freeTask(item, m, V) {
  const v = addView(m);
  frameView(v);
  const present = new Set(m.goal);
  // the physics' answer: a clear way out, and nothing comes down after
  const verdictOf = id => { const r = slideOut(m, present, id); return r.ok ? { ...r, ...V.check([...present].filter(x => x !== id)) } : r; };
  const answer = new Set([...present].filter(id => { const r = verdictOf(id); return r.ok && r.stands; }));
  const marked = new Set();
  frame.card(false);

  function refresh() {
    frame.sub(`Mark every part that could come out right now: one way out is clear, and nothing comes down without it. <em>${plural(marked.size, 'part')}</em> marked.`, true);
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
      if (extra.length) {
        const r = verdictOf(extra[0]);
        const why = r.ok ? `${namesOf(m, r.falling)} would come down` : whyNot(m, r).replace(/\.$/, '').toLowerCase();
        parts.push(`${m.byId.get(extra[0]).name} cannot: ${why}`);
      }
      if (missing.length) parts.push(`${plural(missing.length, 'part')} that could ${missing.length === 1 ? 'is' : 'are'} not marked`);
      return { ok: false, note: parts.join('; ') + '.', culprits: extra.slice(0, 3).map(id => ({ at: at(v, id), r: 24 })) };
    },
    hint(k) {
      if (k === 1) return { text: 'Look at each part from above and from the sides: is there one direction it can slide without touching anything, and would what it carries still stand without it?' };
      if (k === 2) return { text: `${plural(answer.size, 'part')} can come out now.` };
      const id = [...answer].find(x => !marked.has(x)) || [...answer][0];
      return { text: `${m.byId.get(id).name} can.`, culprits: [{ at: at(v, id), r: 26 }] };
    },
    async solved() {
      ptr.clear();
      sfx.slide();
      await Promise.all([...answer].map(id => v.fly(id, [0, 0, 0], vec(slideOut(m, present, id).dir).multiplyScalar(5).toArray(), { out: true, duration: 900 })));
      await wait(400, { essential: true });
    },
    dispose() { ptr.dispose(); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: keep it up
// ------------------------------------------------------------------

function keepTask(item, m, V) {
  const v = addView(m);
  const re = new RegExp(item.keep);
  const keep = new Set([...m.goal].filter(id => re.test(id)));
  for (const id of keep) v.keep(id, true);
  const first = v.box();
  stage.frame(first, { padding: padOf() });
  const present = new Set(m.goal);
  const target = item.target;
  const taken = [];                                // [{ id, to }] for undo
  const log = createLog('Taken out');
  let lastHint = null, busy = false;

  function refresh() {
    log.note(`${taken.length} of ${target}`);
    frame.sub(`Take out as many parts as you can while the parts outlined in orange stay up. A part leaves along a clear way; take one that carries something and what it carried comes down. <em>${taken.length} of ${target}</em> out.`, true);
    frame.tool('undo', { off: !taken.length });
    frame.rule(Math.min(1, taken.length / target));
  }
  function unhint() { if (lastHint) { for (const id of [].concat(lastHint)) v.setState(id, 'normal'); lastHint = null; } }
  async function take(id) {
    if (busy || !present.has(id)) return;
    red.clear();
    const p = m.byId.get(id);
    if (keep.has(id)) { v.shake(id, [0, 0, 1]); frame.say('That one has to stay up.', { ms: 2000 }); sfx.error(); return; }
    const r = slideOut(m, present, id);
    if (!r.ok) {
      ptr.clear(); v.shake(id, DIRS[r.dir]);
      session.miss({ note: whyNot(m, r), culprits: r.by && r.by !== 'ground' ? [{ at: at(v, r.by), r: 26 }] : [] });
      return;
    }
    const rest = [...present].filter(x => x !== id);
    const verdict = V.check(rest);
    present.delete(id);
    ptr.clear(); unhint(); frame.say('');
    sfx.slide();
    busy = true;
    const to = away(r.dir);
    if (verdict.stands) {
      taken.push({ id, to });
      log.push(p.name, { mark: ARROW[r.dir] });
      refresh();
      await v.fly(id, [0, 0, 0], to, { out: true });
      busy = false;
      if (taken.length >= target) session.check();
      return;
    }
    await v.fly(id, [0, 0, 0], to, { duration: 520 });
    session.miss({ note: fellNote(m, `Without ${p.name}`, verdict.falling), label: 'Collapse' });
    await collapse(v, m, rest, verdict);
    present.add(id);
    await v.fly(id, to, [0, 0, 0], { duration: 520 });
    busy = false;
  }
  async function undo() {
    if (busy) return;
    const last = taken.pop();
    if (!last) return;
    red.clear(); log.pop();
    present.add(last.id);
    v.show(last.id, true);
    busy = true;
    await v.fly(last.id, last.to, [0, 0, 0], { duration: 420 });
    busy = false;
    sfx.tick();
    refresh();
  }
  const ptr = partPointer(v, { can: id => !busy && present.has(id), onTap: take });

  frame.title(TITLES.keep, item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  refresh();

  // a known way: the level's order while the player is on it, else a search from here
  const known = (item.order || '').split(' ').filter(Boolean);
  function plan() {
    const onTrack = taken.every((t, i) => t.id === known[i]);
    if (onTrack && known.length >= target) return known.slice(taken.length);
    const more = keepSearch(m, V, keep, seededRng('hint:' + [...present].sort().join()), { runs: 2, from: present });
    return more;
  }

  return {
    v, take, present,
    get busy() { return busy; },
    _order: () => plan().slice(0, Math.max(0, target - taken.length)),
    check: () => ({ ok: taken.length >= target }),
    hint(k) {
      if (k === 1) return { text: 'Look for parts that carry nothing the orange parts need: a beam carries on past a missing post as long as its weight stays between the posts that are left.' };
      unhint();
      const next = plan();
      if (taken.length + next.length < target) return { text: `From here only ${plural(taken.length + next.length, 'part')} can come out: undo a few and try another way.` };
      const ids = k === 2 ? next.slice(0, 1) : next.slice(0, 3);
      lastHint = ids;
      ids.forEach(id => v.setState(id, 'selected'));
      return { text: k === 2 ? `${m.byId.get(ids[0]).name} can come out.` : `Next: ${ids.map(id => m.byId.get(id).name).join(', then ')}.`, culprits: ids.map(id => ({ at: at(v, id), r: 24 })) };
    },
    solved: async () => { ptr.clear(); unhint(); await wait(300, { essential: true }); sfx.thud(); finaleView(first); await wait(1300, { essential: true }); },
    dispose() { ptr.dispose(); log.close(); frame.rule(0); v.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: stands or falls?
// ------------------------------------------------------------------

function testTask(item, m, V) {
  const v = addView(m);
  const cases = testCases(m, V, seededRng('test:' + item.id + ':' + (item.seed ?? '')));
  const temps = m.parts.filter(p => p.temp).map(p => p.id);
  stage.frame(v.box(), { padding: padOf() });
  frame.card(false);
  let round = 0, busy = false, wins = 0;

  function show() {
    const c = cases[round];
    for (const p of m.parts) v.show(p.id, m.goal.has(p.id) || c.with.includes(p.id));
    for (const id of c.without) v.ghostOnly(id, true);
    for (const id of temps) if (!c.with.includes(id)) v.show(id, false);
    stage.invalidate();
    const gone = namesOf(m, c.without), w = c.with.length ? ` The ${namesOf(m, c.with).toLowerCase()} is still under it.` : '';
    frame.sub(`Version ${round + 1} of ${cases.length}: without ${gone} (dashed).${w} Does what is left stand? Press S or F.`, true);
  }
  async function answer(stands) {
    if (busy || round >= cases.length) return;
    busy = true;
    red.clear();
    const c = cases[round];
    const ids = [...m.goal].filter(id => !c.without.includes(id)).concat(c.with);
    const right = stands === c.stands;
    if (c.stands) {
      frame.say(right ? 'It stands.' : 'It stands: what is left still carries itself.', { label: right ? 'Right' : 'Stands' });
      if (right) { sfx.snap(); wins++; } else session.miss({ note: 'It stands: what is left still carries itself.', label: 'Stands' });
      await wait(1400, { essential: true });
    } else {
      if (right) { frame.say(`Right: ${namesOf(m, c.falling)} came down.`, { label: 'Falls' }); wins++; }
      else session.miss({ note: `It falls: ${namesOf(m, c.falling)} came down.`, label: 'Falls' });
      await collapse(v, m, ids, c);
    }
    round++;
    busy = false;
    if (round < cases.length) show();
    else session.check();
  }

  frame.title(TITLES.test, item.name);
  frame.tools([
    { id: 'stands', label: 'It stands', key: 'S', run: () => answer(true) },
    { id: 'falls', label: 'It falls', key: 'F', run: () => answer(false) },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  show();

  return {
    v, answer,
    get busy() { return busy; },
    _answer: () => cases[round]?.stands,
    check: () => ({ ok: round >= cases.length }),
    hint(k) {
      const c = cases[round];
      if (!c) return null;
      if (k === 1) return { text: 'Find what the missing part carried, and follow the weight down: does it still reach the ground inside what is left under it?' };
      const carried = [...m.goal].filter(q => !c.without.includes(q) && m.byId.get(q).on.some(alt => alt.some(x => c.without.includes(x))));
      if (k === 2) return { text: `It carried ${namesOf(m, carried) || 'nothing'}.`, culprits: carried.slice(0, 3).map(id => ({ at: at(v, id), r: 24 })) };
      return { text: c.stands ? 'It stands.' : `It falls: ${namesOf(m, c.falling)}.` };
    },
    solved: async () => { await wait(300, { essential: true }); for (const p of m.parts) v.show(p.id, m.goal.has(p.id)); finaleView(v.box()); await wait(1100, { essential: true }); },
    dispose() { v.dispose(); },
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
  frame.rule(0);
}
function load(item) {
  reset();
  frame.primaryEl.style.display = item.task === 'free' ? '' : 'none';
  const m = buildModel(item.build, item.opts || {});
  const V = createVerdicts(m);
  task = item.task === 'assemble' ? assembleTask(item, m, V) : item.task === 'free' ? freeTask(item, m, V)
    : item.task === 'keep' ? keepTask(item, m, V) : item.task === 'test' ? testTask(item, m, V) : dismantleTask(item, m, V);
}

// workshop: any structure, take it apart freely, rebuild it
const SITES = [
  ['Temple front', 'temple', { n: 4 }], ['Arcade', 'arcade', { count: 3 }], ['Gable roof', 'gableRoof', {}], ['Log crib', 'logCrib', { courses: 6 }],
  ['Keyed tenons', 'keyedFrame', { posts: 3 }], ['Lattice', 'halfLap', { n: 3 }], ['Steel, two storeys', 'steelFrame', { bays: 2, storeys: 2 }], ['Dom-ino', 'domino', { storeys: 3, cladding: true }],
  ['Wall', 'wall', { courses: 6, len: 4 }], ['Corbelled opening', 'corbel', { courses: 5 }],
];
let site = 0;
function openWorkshop() {
  reset();
  frame.primaryEl.style.display = '';
  const [name, build, opts] = SITES[site];
  const m = buildModel(build, opts);
  task = dismantleTask({ name }, m, createVerdicts(m), { free: true });
  const go = d => { site = (site + d + SITES.length) % SITES.length; openWorkshop(); };
  frame.tools([
    { id: 'prev', label: 'Previous', key: '[', run: () => go(-1) },
    { id: 'next', label: 'Next', key: ']', run: () => go(1) },
  ]);
  frame.primary({ label: 'Rebuild', run: () => task.rebuild() });
}

// generated puzzles
const GEN_NAMES = { trilithon: 'Trilithon', wall: 'Wall', deck: 'Deck', halfLap: 'Half lap', steelFrame: 'Steel frame', colonnade: 'Colonnade',
  arch: 'Round arch', pergola: 'Pergola', logCrib: 'Log crib', keyedFrame: 'Keyed tenons', domino: 'Dom-ino', corbel: 'Corbelled opening', temple: 'Temple front',
  arcade: 'Arcade', gableRoof: 'Gable roof' };
function generate(rng, d) {
  const pool = d <= 2 ? [['trilithon', {}], ['wall', { courses: 3, len: 3 }], ['deck', {}], ['halfLap', { n: 2 }], ['steelFrame', { bays: 1, braced: false, deckOn: false }]]
    : d <= 5 ? [['colonnade', { n: 3 }], ['arch', { m: 5 }], ['pergola', {}], ['logCrib', { courses: 4 }], ['keyedFrame', { posts: 2 }], ['steelFrame', { bays: 1 }], ['domino', { storeys: 1 }], ['corbel', { courses: 3 }]]
    : [['temple', { n: 4 }], ['arcade', { count: 2 }], ['gableRoof', {}], ['halfLap', { n: 3 }], ['keyedFrame', { posts: 3 }], ['steelFrame', { bays: 2, storeys: 2 }], ['domino', { storeys: 2, cladding: true }], ['arch', { m: 7 }]];
  const [build, opts] = pick(rng, pool);
  // an arch has nothing free to mark until its centering is back
  const hasTemp = build === 'arch' || build === 'arcade';
  const kind = pick(rng, hasTemp ? ['assemble', 'dismantle', 'test'] : ['dismantle', 'assemble', 'free', 'test']);
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = { id: 'g' + seed, seed, task: kind, name: GEN_NAMES[build], build, opts };
  return { ...item, label: `${GEN_NAMES[build]} · ${TASK_TAGS[kind]}`, par: parOf(item) };
}

const def = {
  id: 'buildorder', prefix: 'B', name: 'Build Order',
  lead: 'Take it apart. Put it together.',
  sub: 'Real construction systems, part by part, under real gravity: a block leaves only along a clear way, and what it carried stays up only if the rest can hold it.',
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
loadPhysics().then(() => session.start());

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
