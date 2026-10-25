// Sun Study: the sun is the thing you move, and the shadow is a drawing.
//
//   cast    Pack A, sciagraphy: the drawing-school sun, 45° in plan and in
//           elevation. The card is the site plan on dots; the player draws the
//           shadow as closed outlines, tapping dot to dot. Cast compares it with
//           the real shadow, and on a pass the sun comes on over the model.
//   hour    Pack B, the real sun over Istanbul: the card shows a shadow plan,
//           the player drags the sun through the day and picks the season until
//           the shadows on the site are the ones on the card.
//
// Both grade by plan masks (sun.js): which plan points are dark, sampled on a
// grid, compared as intersection over union.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { createLines } from '../../src/stage/lines.js';
import { createSolidView } from '../../src/stage/solids.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { animate, ease, wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { PARTS } from '../../src/core/drawforms.js';
import { LAT, CLASSIC, SEASONS, sunDir, dayOf, altitude, clock, partOf, darkMask, polyMask, overlap, runsOf, missOf, siteBox } from '../../src/core/sun.js';
import { PACKS } from './levels.js';
import './sunstudy.css';

const D2R = Math.PI / 180;
const stage = createStage(document.getElementById('stage'), { longShadows: true });
const frame = createFrame({ game: 'sunstudy', name: 'Sun Study', stage });
const red = createRedlines(stage);
frame.stack(true);

const PASS = .9;                       // a drawn shadow this close counts
const LOCK = .95;                      // an hour this close settles on the answer
const SIGNAL = '#ff5a1f';
const SEASON_NAMES = { winter: 'Midwinter', equinox: 'Equinox', summer: 'Midsummer' };

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${l.task === 'cast' ? 'draw the shadow' : 'find the hour'}`, par: l.par ?? (l.task === 'cast' ? 40 + l.parts.length * 10 : 50), note: l.learn })),
}));

// ------------------------------------------------------------------
// the scene
// ------------------------------------------------------------------

function buildScene(specs) {
  const solids = specs.map(([kind, ...a]) => PARTS[kind](...a));
  const parts = solids.map(partOf);
  const group = new THREE.Group();
  const views = solids.map(s => createSolidView(s, { invalidate: stage.invalidate }));
  for (const v of views) group.add(v.group);
  const box = new THREE.Box3();
  for (const s of solids) for (const p of s.verts) box.expandByPoint(new THREE.Vector3(...p));
  stage.content.add(group);
  return { solids, parts, group, box, dispose() { views.forEach(v => v.dispose()); group.removeFromParent(); } };
}

// frame the model and the ground its shadows fall on
function frameSite(site, plan) {
  const [[x0, y0], [x1, y1]] = plan;
  stage.frame(new THREE.Box3(new THREE.Vector3(x0 + .5, y0 + .5, 0), new THREE.Vector3(x1 - .5, y1 - .5, site.box.max.z)), { padding: 18 });
}

// ------------------------------------------------------------------
// the card: the site plan
// ------------------------------------------------------------------

let card = null;
function openCard(title, note, { interactive = false } = {}) {
  const body = frame.card(true, title, note);
  const el = document.querySelector('.udp-card');
  el.classList.add('is-plan', 'ss-card');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  body.append(holder);
  card = createBoard(holder, { unit: 1, sub: 2, grid: 'dots', padding: 16, interactive });
  return { board: card, body };
}
function closeCard() {
  card?.dispose(); card = null;
  const body = document.querySelector('.udp-card.is-plan .udp-card-body');
  if (body) body.style.height = '';
  frame.card(false);
  document.querySelector('.udp-card')?.classList.remove('is-plan', 'ss-card');
}

// the roof plan: every edge seen from above, vertical ones vanish to points
function drawPlan(board, solids) {
  let n = 0;
  for (const s of solids) for (const e of s.edges) {
    const a = s.verts[e.a], b = s.verts[e.b];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) continue;
    if (e.flat) continue;
    board.line([a[0], a[1]], [b[0], b[1]], 'visible', { id: 'pl' + n++, hit: false });
  }
}

// north, and (for the classic sun) the light in plan
function drawNorth(board, [[x0, y0], [x1, y1]], { classic = false } = {}) {
  const p = [x1 - .5, y1 - 1.4];
  board.line(p, [p[0], p[1] + .9], 'guide', { id: 'n-arrow', hit: false, noFit: true });
  board.text([p[0], p[1] + 1.25], 'N', { id: 'n-label', noFit: true });
  if (classic) {
    const q = [x0 + .4, y0 + .4];
    board.line(q, [q[0] + 1, q[1] + 1], 'signalThin', { id: 'sun-ray', hit: false, noFit: true });
    board.text([q[0] + .25, q[1] - .3], 'light', { id: 'sun-label', signal: true, noFit: true });
  }
}

const shadeRuns = (board, mask, prefix, fill) => runsOf(mask).forEach(([[a, b], [c, d]], i) => board.polygon([[a, b], [c, b], [c, d], [a, d]], { id: prefix + i, fill, stroke: null, hit: false, noFit: true }));
const clearRuns = (board, prefix) => { for (const it of board.items()) if (String(it.id).startsWith(prefix)) board.remove(it.id); };
const SHADE = 'rgba(12, 11, 10, .55)', DRAWN = 'rgba(255, 90, 31, .22)', NOW = 'rgba(255, 90, 31, .30)';

// ------------------------------------------------------------------
// task: cast the shadow
// ------------------------------------------------------------------

function castTask(item) {
  const site = buildScene(item.parts);
  const plan = siteBox(site.parts, [CLASSIC], 1);
  stage.setSun(CLASSIC);
  stage.sun.castShadow = false;          // the drawing comes first
  stage.rig.setView(-112.5 * D2R, 30 * D2R, false);
  frameSite(site, plan);

  const { board } = openCard('Site plan', 'draw the shadow', { interactive: true });
  const [[x0, y0], [x1, y1]] = plan;
  board.setGrid('dots', { x0, y0, x1, y1 });
  board.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { id: 'site', fill: 'none', stroke: null, hit: false });
  drawPlan(board, site.solids);
  drawNorth(board, plan, { classic: true });
  board.fit();
  frame.fitSheet(board, { lo: .3, hi: .46 });

  const target = darkMask(site.parts, CLASSIC, plan, .05);
  const closed = [], undoStack = [];
  let cur = [], done = false;

  function draw() {
    clearRuns(board, 'dr');
    closed.forEach((p, i) => board.polygon(p, { id: 'dr' + i, fill: DRAWN, stroke: 'signal', hit: false }));
    if (cur.length) {
      board.polyline(cur, 'signal', { id: 'drc', hit: false });
      cur.forEach((p, i) => board.dot(p, { id: 'drd' + i, r: i === 0 ? 5 : 3, signal: true }));
    }
    frame.tool('undo', { off: !closed.length && !cur.length || done });
    frame.tool('clear', { off: !closed.length && !cur.length || done });
    frame.primary({ disabled: !closed.length || done });
  }
  const inside = q => q[0] >= x0 - 1e-9 && q[0] <= x1 + 1e-9 && q[1] >= y0 - 1e-9 && q[1] <= y1 + 1e-9;
  const off = board.onPointer({
    up(ev, p, q) {
      if (done || !inside(q)) return;
      clearRuns(board, 'df');
      red.clear();
      const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
      if (cur.length >= 3 && same(q, cur[0])) {
        closed.push(cur); undoStack.push('close'); cur = []; sfx.tick(); navigator.vibrate?.(8);
      } else if (cur.some(c => same(c, q))) return;
      else { cur.push(q); undoStack.push('point'); sfx.tick?.(); }
      draw();
    },
  });
  function undo() {
    if (done) return;
    clearRuns(board, 'df');
    const what = undoStack.pop();
    if (what === 'close') cur = closed.pop();
    else if (what === 'point') cur.pop();
    draw();
  }
  function clear() { if (done) return; closed.length = 0; cur = []; undoStack.length = 0; clearRuns(board, 'df'); draw(); }

  frame.title('Can you draw its shadow?', item.name);
  frame.sub('The light comes over your left shoulder at 45°, as on a drawing board, so every shadow falls north-east by the height that casts it. Tap from dot to dot round the shadow on the plan, and tap the first dot again to close it. Then press Cast.');
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'clear', label: 'Clear', key: 'X', run: clear, spare: true },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primary({ label: 'Cast', run: () => session.check(), disabled: true });
  frame.primaryEl.style.display = '';
  draw();

  let hintDots = 0;
  return {
    check() {
      const drawn = polyMask(closed, plan, .05);
      const o = overlap(target, drawn);
      if (o >= PASS) return { ok: true };
      // show where the drawing and the shadow part ways
      clearRuns(board, 'df');
      const missing = { ...target, bits: target.bits.map((v, k) => v & !drawn.bits[k]) };
      const extra = { ...target, bits: target.bits.map((v, k) => !v & drawn.bits[k]) };
      shadeRuns(board, missing, 'dfm', 'rgba(255, 90, 31, .55)');
      shadeRuns(board, extra, 'dfx', 'rgba(233, 230, 223, .28)');
      const left = missOf(target, drawn).length, over = missOf(drawn, target).length;
      const note = left > over * 1.5 ? 'Some of the shadow is missing: the strong orange is shadow your outline leaves out.'
        : over > left * 1.5 ? 'Your outline takes in ground (or roof) that is in the sun: the pale patches are lit.'
        : 'Close, but not yet: the strong orange is shadow you left out, the pale patches are in the sun.';
      return { ok: false, note: `${note} (${Math.round(o * 100)}% matches.)` };
    },
    hint(n) {
      if (n === 1) return { text: 'Push every top corner north-east by its own height: one module up, one module north and one east. Then join those points to the foot of the walls that throw them.' };
      if (n === 2) {
        // the shadow of every top corner, on the ground
        let k = 0;
        for (const s of site.solids) for (const v of s.verts) if (v[2] > 0) board.dot([v[0] + v[2], v[1] + v[2]], { id: 'hd' + k++, r: 3.5, color: '#e9e6df' });
        hintDots = k;
        return { text: 'The pale dots are where the top corners throw their shadows on the ground. Your outline runs through the ones on its edge.' };
      }
      session.peek();
      shadeRuns(board, target, 'pk', SHADE);
      return { text: 'This is the shadow. Trace round it.' };
    },
    async solved() {
      done = true;
      clearRuns(board, 'df'); clearRuns(board, 'hd');
      shadeRuns(board, target, 'tr', SHADE);
      draw();
      // the sun comes on
      stage.sun.castShadow = true;
      stage.invalidate();
      sfx.thud?.();
      await wait(1400, { essential: true });
    },
    dispose() { off(); site.dispose(); closeCard(); stage.sun.castShadow = true; frame.primaryEl.style.display = ''; },
  };
}

// ------------------------------------------------------------------
// task: find the hour
// ------------------------------------------------------------------

function hourTask(item) {
  const site = buildScene(item.parts);
  const goal = sunDir(LAT, item.season, item.hour);
  const plan = siteBox(site.parts, [goal], 1);
  const seasons = item.seasons || Object.keys(SEASONS);
  let season = item.startSeason || (seasons.includes('equinox') ? 'equinox' : seasons[0]);
  let hour = item.start, done = false;
  stage.sun.castShadow = true;
  stage.rig.setView(-112.5 * D2R, 34 * D2R, false);
  frameSite(site, plan);

  // the sun in the model: a disc on the day's arc
  const c = site.box.getCenter(new THREE.Vector3());
  const R = Math.max(4, site.box.getSize(new THREE.Vector3()).length() * .9);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 12), new THREE.MeshBasicMaterial({ color: SIGNAL }));
  disc.userData.noFrame = true;
  stage.content.add(disc);
  let arc = null;
  function drawArc() {
    arc?.dispose(); arc?.removeFromParent?.();
    const [r0, r1] = dayOf(LAT, season), segs = [];
    let prev = null;
    for (let i = 0; i <= 48; i++) {
      const s = sunDir(LAT, season, r0 + (r1 - r0) * i / 48);
      const p = [c.x + s[0] * R, c.y + s[1] * R, Math.max(0, s[2] * R)];
      if (prev) segs.push([prev, p]);
      prev = p;
    }
    arc = createLines(segs, 'guide', { on: 'model', renderOrder: 2 });
    arc.userData.noFrame = true;
    stage.content.add(arc);
  }

  // the card: the shadows as they should be, and as they are now
  const { board, body } = openCard('Shadow plan', 'at one moment');
  const [[x0, y0], [x1, y1]] = plan;
  board.setGrid('dots', { x0, y0, x1, y1 });
  board.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { id: 'site', fill: 'none', stroke: null, hit: false });
  const goalMask = darkMask(site.parts, goal, plan, .1);
  shadeRuns(board, goalMask, 'g', SHADE);
  drawPlan(board, site.solids);
  drawNorth(board, plan);

  // the controls: a day bar to drag the sun along, and the seasons
  const ctl = document.createElement('div');
  ctl.className = 'ss-ctl';
  ctl.innerHTML = `<div class="ss-read"><span class="ss-clock"></span><span class="ss-match"></span></div>
    <div class="ss-day${item.fixed ? ' is-fixed' : ''}"><div class="ss-track"><i class="ss-noon"></i><b class="ss-knob"></b></div><div class="ss-ends"><span class="ss-rise"></span><span>noon</span><span class="ss-set"></span></div></div>
    <div class="ss-seasons">${Object.keys(SEASONS).map(s => `<button type="button" class="ss-season" data-s="${s}"${seasons.includes(s) ? '' : ' disabled'}>${SEASON_NAMES[s]}</button>`).join('')}</div>`;
  body.append(ctl);
  const track = ctl.querySelector('.ss-track'), knob = ctl.querySelector('.ss-knob');
  board.fit();
  frame.fitSheet(board, { lo: .3, hi: .44 });

  const coarse = darkMask(site.parts, goal, plan, .2);
  let match = 0;
  const day = () => dayOf(LAT, season);
  function show() {
    const [r0, r1] = day();
    hour = Math.max(r0 + .1, Math.min(r1 - .1, hour));
    const s = sunDir(LAT, season, hour);
    stage.setSun(s);
    disc.position.set(c.x + s[0] * R, c.y + s[1] * R, s[2] * R);
    const now = darkMask(site.parts, s, plan, .2);
    match = overlap(coarse, now);
    clearRuns(board, 'nw');
    shadeRuns(board, now, 'nw', NOW);
    const t = (hour - r0) / (r1 - r0);
    knob.style.left = (t * 100) + '%';
    ctl.querySelector('.ss-noon').style.left = ((12 - r0) / (r1 - r0) * 100) + '%';
    ctl.querySelector('.ss-rise').textContent = clock(r0);
    ctl.querySelector('.ss-set').textContent = clock(r1);
    ctl.querySelector('.ss-clock').innerHTML = `${clock(hour)} <em>${SEASON_NAMES[season]} · sun ${Math.round(altitude(s))}° up</em>`;
    ctl.querySelector('.ss-match').textContent = `${Math.round(match * 100)}% alike`;
    ctl.querySelector('.ss-match').classList.toggle('is-near', match > .8);
    ctl.querySelectorAll('.ss-season').forEach(b => b.classList.toggle('is-on', b.dataset.s === season));
    stage.invalidate();
  }
  drawArc();
  show();

  // dragging the day
  let dragging = false;
  const setFrom = ev => {
    const r = track.getBoundingClientRect(), [r0, r1] = day();
    const t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    hour = r0 + (r1 - r0) * t;
    show();
  };
  const onDown = ev => { if (done || item.fixed) return; dragging = true; track.setPointerCapture?.(ev.pointerId); setFrom(ev); };
  const onMove = ev => { if (dragging) setFrom(ev); };
  const onUp = () => { if (!dragging) return; dragging = false; settle(); };
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);
  ctl.querySelector('.ss-seasons').addEventListener('click', ev => {
    const b = ev.target.closest('.ss-season');
    if (!b || b.disabled || done) return;
    season = b.dataset.s; sfx.tick?.();
    drawArc(); show(); settle();
  });
  // the keyboard: arrows move a quarter of an hour
  const onKey = ev => {
    if (done || item.fixed) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); hour += ev.key === 'ArrowRight' ? .25 : -.25; show(); settle(); }
  };
  window.addEventListener('keydown', onKey);

  // close enough, the sun settles on the moment the card shows
  async function settle() {
    if (done || season !== item.season || match < LOCK) return;
    done = true;
    const from = hour;
    await animate({ duration: 500, ease: ease.cubicInOut, essential: true, update: t => { hour = from + (item.hour - from) * t; show(); } }).promise;
    sfx.thud?.();
    session.check();
  }

  frame.title('Can you find the hour?', item.name);
  frame.sub(item.fixed
    ? `The clock says ${clock(item.hour)}. Pick the season in which the shadows fall the way the card shows.`
    : `The card shows the shadows at one moment, over Istanbul. Drag along the day bar to move the sun${seasons.length > 1 ? ', and pick the season,' : ''} until the orange shadows lie on the dark ones.`);
  frame.tools([
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primaryEl.style.display = 'none';

  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const toward = v => COMPASS[(Math.round(Math.atan2(v[0], v[1]) / (Math.PI / 4)) + 8) % 8];
  return {
    check: () => done || (season === item.season && match >= LOCK) ? { ok: true } : { ok: false, note: 'Not yet: the shadows don’t lie on the card’s.' },
    hint(n) {
      if (n === 1) return { text: `The shadows on the card point ${toward([-goal[0], -goal[1]])}, so the sun is in the ${toward(goal)}.${seasons.length > 1 && !item.fixed ? ` Their length tells the season: the sun is ${Math.round(altitude(goal))}° up.` : ''}` };
      if (n === 2) return { text: item.fixed ? `It is ${SEASON_NAMES[item.season].toLowerCase()}.` : `It is about ${clock(Math.round(item.hour))}${seasons.length > 1 ? `, at ${SEASON_NAMES[item.season].toLowerCase()}` : ''}.` };
      session.peek();
      season = item.season; hour = item.hour; drawArc(); show(); settle();
      return { text: 'This is the moment on the card.' };
    },
    async solved() {
      done = true;
      ctl.querySelector('.ss-match').textContent = clock(item.hour) + ' · ' + SEASON_NAMES[item.season].toLowerCase();
      await wait(1200, { essential: true });
    },
    dispose() {
      track.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey);
      arc?.dispose(); disc.geometry.dispose(); disc.material.dispose(); site.dispose(); closeCard();
      frame.primaryEl.style.display = '';
    },
  };
}

// ------------------------------------------------------------------
// the game definition
// ------------------------------------------------------------------

let task = null;
function reset() { task?.dispose(); task = null; red.clear(); stage.clear(); }
function load(item) { reset(); task = item.task === 'hour' ? hourTask(item) : castTask(item); }

// generated: a few blocks of whole-module heights, to draw the shadow of
function generate(rng, d) {
  const n = 1 + Math.min(3, Math.floor(d / 2));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rng() * 4), y = Math.floor(rng() * 4), w = 1 + Math.floor(rng() * 2), dd = 1 + Math.floor(rng() * 2), h = 1 + Math.floor(rng() * (d >= 4 ? 3 : 2));
    parts.push(['box', x, y, 0, w, dd, h]);
  }
  const seed = Math.floor(rng() * 1e9).toString(36);
  return { id: 'g' + seed, seed, task: 'cast', name: 'Generated site', parts, label: 'Generated site · draw the shadow', par: 40 + n * 12 };
}

const def = {
  id: 'sunstudy', prefix: 'L', name: 'Sun Study',
  lead: 'Move the sun, read the shadow.',
  sub: 'Draw a shadow the way architects learn to, then find the hour and season a shadow plan was drawn for, under the real sun over Istanbul.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  modes: ['challenge', 'daily'],
  dailyDifficulty: 3,
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
window.__udp = { stage, session, get task() { return task; }, get board() { return card; } };
