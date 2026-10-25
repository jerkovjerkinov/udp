// Sun Study: the sun is the thing you move, and the shadow is a drawing.
//
//   cast    Pack A, sciagraphy: the drawing-school sun, 45° in plan and in
//           elevation. The card is the site plan on dots; the player draws the
//           shadow as closed outlines, tapping dot to dot. Cast compares it with
//           the real shadow, and on a pass the sun comes on over the model.
//   hour    Pack B, the real sun over Istanbul: the card shows a shadow plan,
//           the player drags the sun through the day and picks the season until
//           the shadows on the site are the ones on the card.
//   fence   Pack C, the solar envelope: tap plots on the plan to add floors;
//           the shadows swept through the owed hours must stay out of every
//           garden. The most floors the light allows is the answer.
//
// Both grade by plan masks (sun.js): which plan points are dark, sampled on a
// grid, compared as intersection over union.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { createLines } from '../../src/stage/lines.js';
import { createLabels } from '../../src/stage/labels.js';
import { createSolidView } from '../../src/stage/solids.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { animate, ease, wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { PARTS } from '../../src/core/drawforms.js';
import { LAT, CLASSIC, SEASONS, sunDir, dayOf, altitude, clock, partOf, topAt, darkMask, polyMask, overlap, runsOf, missOf, siteBox, windowSuns, envelopeOf, shadesAt, columnShadow, unionMask, PLANES, planeCells, lightMap, litMask, coverOf, fewestCells, outlineOf, inPoly } from '../../src/core/sun.js';
import { moduleLines } from '../../src/core/views.js';
import { PACKS } from './levels.js';
import './sunstudy.css';

const D2R = Math.PI / 180;
const stage = createStage(document.getElementById('stage'), { longShadows: true });
const frame = createFrame({ game: 'sunstudy', name: 'Sun Study', stage });
const red = createRedlines(stage);
const labels = createLabels(stage);
frame.stack(true);

const PASS = .9;                       // a drawn shadow this close counts
const LOCK = .95;                      // an hour this close settles on the answer
const NEED = .9;                       // a mark this well lit counts
const SIGNAL = '#ff5a1f';
const SEASON_NAMES = { winter: 'Midwinter', equinox: 'Equinox', summer: 'Midsummer' };

const TASK_TAGS = { cast: 'draw the shadow', hour: 'find the hour', fence: 'build to the light', light: 'let the light in' };
const rect = ([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]];
const envelope = l => envelopeOf(l.plots, l.zf, l.gardens.map(rect), windowSuns(l.season, l.from, l.to));
const parOf = l => l.task === 'cast' ? 40 + l.parts.length * 10 : l.task === 'fence' ? 30 + envelope(l).reduce((a, b) => a + b, 0) * 4 : l.task === 'light' ? 30 + lightOf(l).best.length * 6 : 50;
const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${TASK_TAGS[l.task]}`, par: l.par ?? parOf(l), note: l.learn })),
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
  // module lines on the walls, so heights can be counted on the model
  const mods = createLines(moduleLines(solids), 'module', { on: 'model', renderOrder: 1 });
  group.add(mods);
  const box = new THREE.Box3();
  for (const s of solids) for (const p of s.verts) box.expandByPoint(new THREE.Vector3(...p));
  stage.content.add(group);
  return { solids, parts, group, box, dispose() { views.forEach(v => v.dispose()); mods.dispose(); group.removeFromParent(); } };
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

// spot heights, as on a roof plan: every level of every part, in modules,
// where it can be seen from above (a post under a canopy is not)
const heightText = z => '+' + (Math.abs(z - Math.round(z)) < 1e-6 ? Math.round(z) : z.toFixed(1));
function drawHeights(board, solids, parts) {
  let n = 0;
  solids.forEach(s => {
    const zs = [...new Set(s.verts.map(v => Math.round(v[2] * 1000) / 1000))].filter(z => z > 0).sort((a, b) => b - a);
    const bottom = Math.min(...s.verts.map(v => v[2]));
    zs.forEach((z, k) => {
      const at = s.verts.filter(v => Math.abs(v[2] - z) < 1e-3);
      let p = [at.reduce((a, v) => a + v[0], 0) / at.length, at.reduce((a, v) => a + v[1], 0) / at.length];
      // a lower level (the eaves under a ridge): on its southern edge, just inside
      if (k > 0) {
        const y = Math.min(...at.map(v => v[1])), xs = at.filter(v => Math.abs(v[1] - y) < 1e-3).map(v => v[0]);
        p = [(Math.min(...xs) + Math.max(...xs)) / 2, y + .28];
        if (Math.abs(topAt(parts, p[0], p[1]).z - z) > .5) return;
      } else if (Math.abs(topAt(parts, p[0], p[1]).z - z) > .05) return;
      const label = k === 0 && bottom > 1e-6 ? `${heightText(bottom)}–${heightText(z).slice(1)}` : heightText(z);
      board.text(p, label, { id: 'ht' + n++, color: '#e9e6df', noFit: true });
    });
  });
}

// north, and (for the classic sun) the light in plan
// and a scale bar: one square of the plan is one module, the unit of every height
function drawScale(board, at, above = false) {
  board.line(at, [at[0] + 1, at[1]], 'visible', { id: 'sb', hit: false, noFit: true });
  board.line([at[0], at[1] - .12], [at[0], at[1] + .12], 'visible', { id: 'sb0', hit: false, noFit: true });
  board.line([at[0] + 1, at[1] - .12], [at[0] + 1, at[1] + .12], 'visible', { id: 'sb1', hit: false, noFit: true });
  board.text([at[0] + .5, at[1] + (above ? .3 : -.35)], '1 module', { id: 'sbl', noFit: true });
}
function drawNorth(board, [[x0, y0], [x1, y1]], { classic = false, scale = 'right' } = {}) {
  if (scale === 'left') drawScale(board, [x0 + .4, y1 - .45], true); else drawScale(board, [x1 - 1.5, y0 + .5]);
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
  board.setGrid('modules', { x0, y0, x1, y1 });
  board.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { id: 'site', fill: 'none', stroke: null, hit: false });
  drawPlan(board, site.solids);
  drawHeights(board, site.solids, site.parts);
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
  frame.sub('The light comes over your left shoulder at 45°, as on a drawing board, so every shadow falls north-east by the height that casts it. The numbers on the plan are heights in modules: one square of the plan is one module, and the model has a line at every module. A block +1 high throws its shadow one square north and one square east. Tap from dot to dot round the shadow on the plan, and tap the first dot again to close it. Then press Cast.');
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
      if (n === 1) return { text: 'Read the heights on the plan, then push every top corner north-east by its own height: one module up, one square north and one square east (two dots, not one). Then join those points to the foot of the walls that throw them.' };
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
  board.setGrid('modules', { x0, y0, x1, y1 });
  board.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { id: 'site', fill: 'none', stroke: null, hit: false });
  const goalMask = darkMask(site.parts, goal, plan, .1);
  shadeRuns(board, goalMask, 'g', SHADE);
  drawPlan(board, site.solids);
  drawHeights(board, site.solids, site.parts);
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
// task: build to the shadow fence
// ------------------------------------------------------------------

const MOST = 12;                       // floors a plot can take at all
const HOLD = 450;                      // ms: holding a plot takes a floor off

function fenceTask(item) {
  const gardens = item.gardens.map(rect), zf = item.zf;
  const suns = windowSuns(item.season, item.from, item.to);
  const caps = envelope(item), goal = caps.reduce((a, b) => a + b, 0);
  const floors = item.plots.map(() => 0), history = [];
  let hour = item.from, done = false, clean = true, bad = false;
  stage.sun.castShadow = true;
  stage.rig.setView(-112.5 * D2R, 34 * D2R, false);

  // the plan: the lot and the gardens, and a module round them
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, w, d] of [...item.plots, ...item.gardens.map(([a, b, c, e]) => [a, b, c - a, e - b])]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + d);
  }
  const plan = [[Math.floor(x0 - 1), Math.floor(y0 - 1)], [Math.ceil(x1 + 1), Math.ceil(y1 + 1)]];
  const top = Math.max(2, ...caps) + 1;
  frameSite({ box: new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(0, 0, top)) }, plan);

  // the ground: plots drawn fine, gardens outlined and hatched in signal
  const ground = [], hatch = [];
  for (const [x, y, w, d] of item.plots) ground.push([[x, y, 0], [x + w, y, 0]], [[x + w, y, 0], [x + w, y + d, 0]], [[x + w, y + d, 0], [x, y + d, 0]], [[x, y + d, 0], [x, y, 0]]);
  for (const [a, b, c, e] of item.gardens) {
    const z = zf + .01;
    hatch.push([[a, b, z], [c, b, z]], [[c, b, z], [c, e, z]], [[c, e, z], [a, e, z]], [[a, e, z], [a, b, z]]);
    // 45° hatch, clipped to the garden
    for (let k = a + b + .5; k < c + e; k += .5) {
      const p = [Math.max(a, k - e), 0], q = [Math.min(c, k - b), 0];
      p[1] = k - p[0]; q[1] = k - q[0];
      if (q[0] - p[0] > 1e-6) hatch.push([[p[0], p[1], z], [q[0], q[1], z]]);
    }
    labels.add([(a + c) / 2, (b + e) / 2, zf + .05], 'Garden', { signal: true });
  }
  const groundLines = createLines(ground, 'guide', { on: 'model' });
  const hatchLines = createLines(hatch, 'signalThin', { on: 'model' });
  stage.content.add(groundLines, hatchLines);
  // the neighbour's wall, when the fence is lifted off the ground
  const walls = zf > 0 ? item.gardens.flatMap(([a, b, c, e]) => [PARTS.box(a, b - .15, 0, c - a, .15, zf), PARTS.box(a, e, 0, c - a, .15, zf), PARTS.box(a - .15, b - .15, 0, .15, e - b + .3, zf), PARTS.box(c, b - .15, 0, .15, e - b + .3, zf)]).map(s => createSolidView(s, { invalidate: stage.invalidate })) : [];
  for (const w of walls) stage.content.add(w.group);

  // the columns, one solid per floor so the floors read
  let views = [];
  function build3d() {
    for (const v of views) { v.dispose(); v.group.removeFromParent(); }
    views = [];
    item.plots.forEach(([x, y, w, d], i) => {
      for (let k = 0; k < floors[i]; k++) {
        const solid = PARTS.box(x, y, k, w, d, 1), v = createSolidView(solid, { invalidate: stage.invalidate });
        if (k >= caps[i]) solid.faces.forEach((f, fid) => v.setFaceState(fid, 'error'));
        stage.content.add(v.group);
        views.push(v);
      }
    });
    stage.invalidate();
  }

  // the sun in the model, on the owed part of the day
  const c = new THREE.Vector3((plan[0][0] + plan[1][0]) / 2, (plan[0][1] + plan[1][1]) / 2, 0);
  const R = Math.max(5, Math.hypot(plan[1][0] - plan[0][0], plan[1][1] - plan[0][1]) * .55);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(.24, 20, 12), new THREE.MeshBasicMaterial({ color: SIGNAL }));
  disc.userData.noFrame = true;
  stage.content.add(disc);
  const arcSegs = [];
  for (let i = 0; i < suns.length - 1; i++) arcSegs.push([suns[i], suns[i + 1]].map(({ sun: s }) => [c.x + s[0] * R, c.y + s[1] * R, s[2] * R]));
  const arc = createLines(arcSegs, 'guide', { on: 'model', renderOrder: 2 });
  arc.userData.noFrame = true;
  stage.content.add(arc);

  // the card: the plan, the swept shadows, the floors
  const { board, body } = openCard('Site plan', `sun owed ${clock(item.from)}–${clock(item.to)}`, { interactive: true });
  board.setGrid('modules', { x0: plan[0][0], y0: plan[0][1], x1: plan[1][0], y1: plan[1][1] });
  board.polygon(rect([plan[0][0], plan[0][1], plan[1][0], plan[1][1]]), { id: 'site', fill: 'none', stroke: null, hit: false });
  gardens.forEach((g, i) => board.polygon(g, { id: 'gd' + i, fill: 'rgba(255, 90, 31, .07)', stroke: 'signalThin', hit: false }));
  const gardenMask = unionMask(gardens, plan, .1);
  drawNorth(board, plan);

  const ctl = document.createElement('div');
  ctl.className = 'ss-ctl';
  ctl.innerHTML = `<div class="ss-read"><span class="ss-clock"></span><span class="ss-match"></span></div>
    <div class="ss-day"><div class="ss-track"><b class="ss-knob"></b></div><div class="ss-ends"><span>${clock(item.from)}</span><span>${SEASON_NAMES[item.season]}</span><span>${clock(item.to)}</span></div></div>`;
  body.append(ctl);
  const track = ctl.querySelector('.ss-track'), knob = ctl.querySelector('.ss-knob');

  const total = () => floors.reduce((a, b) => a + b, 0);
  function drawCard() {
    clearRuns(board, 'sw'); clearRuns(board, 'sx'); clearRuns(board, 'pl');
    const polys = [];
    item.plots.forEach((p, i) => { for (const { sun } of suns) { const s = columnShadow(p, floors[i], zf, sun); if (s) polys.push(s); } });
    const sweep = unionMask(polys, plan, .1);
    shadeRuns(board, sweep, 'sw', SHADE);
    shadeRuns(board, { ...sweep, bits: sweep.bits.map((v, k) => v & gardenMask.bits[k]) }, 'sx', 'rgba(255, 90, 31, .7)');
    item.plots.forEach(([x, y, w, d], i) => {
      const over = floors[i] > caps[i];
      // the more floors, the lighter the plot, as on a massing plan
      board.polygon(rect([x, y, x + w, y + d]), { id: 'pl' + i, fill: `rgba(233, 230, 223, ${Math.min(.5, .06 + floors[i] * .07).toFixed(2)})`, stroke: over ? 'signal' : 'visible', hit: false });
      board.text([x + w / 2, y + d / 2], floors[i] ? String(floors[i]) : '+', { id: 'plt' + i, signal: over, color: floors[i] ? '#f4f1ea' : '#8d8a83' });
    });
  }
  function show() {
    hour = Math.max(item.from, Math.min(item.to, hour));
    const s = sunDir(LAT, item.season, hour);
    stage.setSun(s);
    disc.position.set(c.x + s[0] * R, c.y + s[1] * R, s[2] * R);
    knob.style.left = ((hour - item.from) / (item.to - item.from) * 100) + '%';
    const when = item.plots.map((p, i) => floors[i] > caps[i] ? shadesAt(p, floors[i], zf, gardens, suns) : null).filter(h => h !== null);
    ctl.querySelector('.ss-clock').innerHTML = `${total()} <em>of ${goal} · ${clock(hour)}</em>`;
    const m = ctl.querySelector('.ss-match');
    m.textContent = when.length ? `garden shaded ${clock(Math.min(...when))}` : 'gardens in sun';
    m.classList.toggle('is-near', !!when.length);
    stage.invalidate();
  }
  function update() {
    bad = floors.some((n, i) => n > caps[i]);
    if (bad) clean = false;
    build3d(); drawCard(); show();
    frame.tool('undo', { off: !history.length || done });
    frame.tool('clear', { off: !total() || done });
    if (!bad && total() === goal && !done) { done = true; sfx.thud?.(); session.check(); }
  }
  function change(i, delta) {
    if (done) return;
    const n = floors[i] + delta;
    if (n < 0 || n > MOST) return;
    floors[i] = n; history.push([i, delta]);
    sfx.tick?.(); navigator.vibrate?.(delta > 0 ? 6 : 12);
    update();
  }

  // a tap adds a floor, a hold takes one off
  const plotAt = p => item.plots.findIndex(([x, y, w, d]) => p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + d);
  let held = null, timer = 0;
  const off = board.onPointer({
    down(ev, p) {
      const i = plotAt(p);
      held = i >= 0 ? { i, used: false } : null;
      clearTimeout(timer);
      if (held) timer = setTimeout(() => { if (held) { held.used = true; change(held.i, -1); } }, HOLD);
    },
    up(ev, p) {
      clearTimeout(timer);
      if (held && !held.used && plotAt(p) === held.i) change(held.i, +1);
      held = null;
    },
  });
  board.el.addEventListener('contextmenu', ev => ev.preventDefault());

  // looking through the owed hours
  let dragging = false;
  const setFrom = ev => { const r = track.getBoundingClientRect(); hour = item.from + (item.to - item.from) * Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); show(); };
  const onDown = ev => { dragging = true; track.setPointerCapture?.(ev.pointerId); setFrom(ev); };
  const onMove = ev => { if (dragging) setFrom(ev); };
  const onUp = () => { dragging = false; };
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);
  const onKey = ev => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); hour += ev.key === 'ArrowRight' ? .25 : -.25; show(); } };
  window.addEventListener('keydown', onKey);

  function undo() { if (done || !history.length) return; const [i, d] = history.pop(); floors[i] -= d; update(); }
  function clear() { if (done) return; floors.fill(0); history.length = 0; update(); }

  board.fit();
  frame.fitSheet(board, { lo: .3, hi: .44 });
  const owed = `from ${clock(item.from)} to ${clock(item.to)}${item.season === 'equinox' ? ' at the equinox' : item.season === 'winter' ? ' at midwinter' : ' at midsummer'}`;
  frame.title('How high can you build?', item.name);
  frame.sub(`The neighbours are owed sun in their gardens ${owed}${zf ? `, above their ${zf * 3} m wall` : ''}. Tap a plot on the plan to add a floor, hold it to take one off. Build ${goal} floors and keep every garden in sun.`);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'clear', label: 'Clear', key: 'X', run: clear, spare: true },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primaryEl.style.display = 'none';
  update();

  const reach = h => { const s = sunDir(LAT, item.season, h); return Math.hypot(s[0], s[1]) / s[2]; };
  return {
    get clean() { return clean; },
    get floors() { return floors.slice(); },
    caps,
    check: () => !bad && total() >= goal ? { ok: true } : { ok: false, note: bad ? 'A shadow lands in a garden: take the orange floors off.' : `${goal - total()} more floors fit in the light.` },
    hint(n) {
      if (n === 1) return { text: `A floor one module high throws a shadow ${reach(item.from).toFixed(1)} modules long at ${clock(item.from)} and ${reach(12).toFixed(1)} at noon. One square of the plan is one module and one floor is one module high. Count the squares from each plot to the garden, along the shadows: that is how high it can go.` };
      if (n === 2) {
        // build one plot, the tallest, to its limit
        const i = caps.indexOf(Math.max(...caps));
        while (floors[i] < caps[i]) { floors[i]++; history.push([i, 1]); }
        while (floors[i] > caps[i]) { floors[i]--; history.push([i, -1]); }
        update();
        return { text: `That plot is built to its limit, ${caps[i]} floors. One more and its shadow reaches a garden${shadesAt(item.plots[i], caps[i] + 1, zf, gardens, suns) !== null ? ` at ${clock(shadesAt(item.plots[i], caps[i] + 1, zf, gardens, suns))}` : ''}.` };
      }
      session.peek();
      caps.forEach((n, i) => { floors[i] = n; });
      update();
      return { text: 'This is the envelope: every plot as high as the light allows.' };
    },
    async solved() {
      done = true;
      ctl.querySelector('.ss-match').textContent = 'gardens in sun';
      // sweep the sun through the owed hours over the finished envelope
      await animate({ duration: 1600, ease: ease.cubicInOut, essential: true, update: t => { hour = item.from + (item.to - item.from) * t; show(); } }).promise;
    },
    dispose() {
      off(); clearTimeout(timer);
      track.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey);
      for (const v of [...views, ...walls]) { v.dispose(); v.group.removeFromParent(); }
      groundLines.dispose(); hatchLines.dispose(); arc.dispose();
      [groundLines, hatchLines, arc].forEach(l => l.removeFromParent?.());
      disc.geometry.dispose(); disc.material.dispose(); disc.removeFromParent();
      labels.clear(); closeCard();
      frame.primaryEl.style.display = '';
    },
  };
}

// ------------------------------------------------------------------
// task: let the light in
// ------------------------------------------------------------------

const WALL = .12;                       // wall thickness, outside the room
const CUT = .35;                        // near walls, cut down so the room can be seen into
const GAP = 0;                          // the folded-out plane hinges on the plan's edge, on the module grid
// the camera looks at the opening from inside the room, over the near walls
const LOOK = { south: { yaw: 67.5, near: ['north', 'east'] }, east: { yaw: 202.5, near: ['west', 'south'] }, west: { yaw: -22.5, near: ['east', 'south'] }, roof: { yaw: -112.5, near: ['south', 'west'] } };
const PLANE_NAMES = { south: 'south wall', east: 'east wall', west: 'west wall', roof: 'roof' };
const momentName = m => `${SEASON_NAMES[m.season]} ${clock(m.hour)}`;

// a box from its two corners
const boxOf = ([x0, y0, z0], [x1, y1, z1]) => PARTS.box(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0);
// a run of cells u0..u1 on row v0..v1 of a plane, as the solid that closes it
function cellBox([W, D, H], plane, u0, u1, v0, v1) {
  if (plane === 'south') return boxOf([u0, -WALL, v0], [u1, 0, v1]);
  if (plane === 'north') return boxOf([u0, D, v0], [u1, D + WALL, v1]);
  if (plane === 'east') return boxOf([W, u0, v0], [W + WALL, u1, v1]);
  if (plane === 'west') return boxOf([-WALL, u0, v0], [0, u1, v1]);
  return boxOf([u0, v0, H], [u1, v1, H + WALL]);
}
// a whole plane, its corners included
function planeBox([W, D, H], plane, z1 = H) {
  if (plane === 'south') return boxOf([-WALL, -WALL, 0], [W + WALL, 0, z1]);
  if (plane === 'north') return boxOf([-WALL, D, 0], [W + WALL, D + WALL, z1]);
  if (plane === 'east') return boxOf([W, 0, 0], [W + WALL, D, z1]);
  if (plane === 'west') return boxOf([-WALL, 0, 0], [0, D, z1]);
  return boxOf([-WALL, -WALL, H], [W + WALL, D + WALL, H + WALL]);
}
// the opening plane on the card: walls folded out about their foot, the roof beside the plan
function foldOut([W, D], plane) {
  if (plane === 'south') return (u, v) => [u, -GAP - v];
  if (plane === 'east') return (u, v) => [W + GAP + v, u];
  if (plane === 'west') return (u, v) => [-GAP - v, u];
  return (u, v) => [W + 1 + u, v];
}

// what a level's goals and keep-outs are, as light maps and masks (cached: the par needs them too)
function lightOf(l) {
  const lightCache = lightOf.cache ??= new Map();
  if (lightCache.has(l.id)) return lightCache.get(l.id);
  const [nu, nv] = planeCells(l.room, l.plane, l.cell);
  const blockers = (l.eaves || []).map(a => partOf(PARTS.box(...a)));
  const floor = [[0, 0], [l.room[0], l.room[1]]];
  const goals = l.goals.map(g => {
    const map = lightMap(l.room, l.plane, l.cell, sunDir(LAT, g.season, g.hour), .05, blockers);
    const target = g.rect ? polyMask([rect(g.rect)], floor, .05) : litMask(map, g.cells.map(([a, b]) => b * nu + a));
    return { ...g, map, target };
  });
  const avoid = (l.avoid || []).map(m => ({ ...m, map: lightMap(l.room, l.plane, l.cell, sunDir(LAT, m.season, m.hour), .05, blockers) }));
  const best = fewestCells(goals, avoid.map(a => a.map), NEED);
  const out = { nu, nv, goals, avoid, best, budget: best.length + Math.max(1, Math.round(best.length * .25)) };
  lightCache.set(l.id, out);
  return out;
}

function lightTask(item) {
  const room = item.room, [W, D, H] = room, cell = item.cell;
  const { nu, nv, goals, avoid, best, budget } = lightOf(item);
  const moments = [...goals.map(g => ({ ...g, keep: false })), ...avoid.map(a => ({ ...a, keep: true }))];
  const open = new Set(), history = [];
  let shown = 0, done = false, cover = goals.map(() => 0), leaks = avoid.map(() => 0);
  stage.sun.castShadow = true;
  const look = LOOK[item.plane];
  stage.rig.setView(look.yaw * D2R, (item.plane === 'roof' ? 30 : 36) * D2R, false);
  frameSite({ box: new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(0, 0, H)) }, [[-.6, -.6], [W + .6, D + .6]]);

  // shadow casters that the camera does not see: the whole room, exactly
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const casters = new THREE.Group();
  stage.content.add(casters);
  const addCaster = s => {
    const g = new THREE.BufferGeometry();
    const pos = [];
    for (const f of s.faces) { const p = f.loop.map(i => s.verts[i]); for (let k = 1; k + 1 < p.length; k++) pos.push(...p[0], ...p[k], ...p[k + 1]); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, shadowMat);
    m.castShadow = true; m.userData.noFrame = true;
    casters.add(m);
  };
  // what is seen: the far walls whole, the near ones cut down, the opening plane in cells
  const seen = [];
  const addSeen = (s, opts = {}) => { const v = createSolidView(s, { invalidate: stage.invalidate, castShadow: false, ...opts }); stage.content.add(v.group); seen.push(v); return v; };
  for (const w of ['south', 'north', 'east', 'west', 'roof']) {
    if (w === item.plane) continue;
    addCaster(planeBox(room, w));
    if (w !== 'roof') addSeen(planeBox(room, w, look.near.includes(w) ? CUT : H));
  }
  for (const e of item.eaves || []) { const s = PARTS.box(...e); addCaster(s); addSeen(s); }
  // the opening plane's frame: corner posts, or the roof's rim
  const rim = item.plane === 'roof'
    ? [boxOf([-WALL, -WALL, H], [W + WALL, 0, H + WALL]), boxOf([-WALL, D, H], [W + WALL, D + WALL, H + WALL]), boxOf([-WALL, 0, H], [0, D, H + WALL]), boxOf([W, 0, H], [W + WALL, D, H + WALL])]
    : item.plane === 'south' ? [boxOf([-WALL, -WALL, 0], [0, 0, H]), boxOf([W, -WALL, 0], [W + WALL, 0, H])] : [];
  for (const s of rim) { addCaster(s); addSeen(s); }
  let planeViews = [], planeCasters = [];
  function buildPlane() {
    for (const v of planeViews) { v.dispose(); v.group.removeFromParent(); }
    for (const m of planeCasters) { m.geometry.dispose(); m.removeFromParent(); }
    planeViews = []; planeCasters = [];
    const before = casters.children.length;
    for (let b = 0; b < nv; b++) for (let a = 0; a < nu;) {
      if (open.has(b * nu + a)) { a++; continue; }
      const a0 = a;
      while (a < nu && !open.has(b * nu + a)) a++;
      const s = cellBox(room, item.plane, a0 * cell, a * cell, b * cell, (b + 1) * cell);
      addCaster(s);
      const v = createSolidView(s, { invalidate: stage.invalidate, castShadow: false });
      if (item.plane === 'roof') s.faces.forEach((f, fid) => v.setFaceState(fid, 'ghost'));
      stage.content.add(v.group);
      planeViews.push(v);
    }
    planeCasters = casters.children.slice(before);
    stage.invalidate();
  }

  // the sun, at the moment being looked at
  const c = new THREE.Vector3(W / 2, D / 2, 0), R = Math.max(5, Math.hypot(W, D, H) * .9);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 12), new THREE.MeshBasicMaterial({ color: SIGNAL }));
  disc.userData.noFrame = true;
  stage.content.add(disc);

  // the card: the floor plan, the marks and the patches; the plane folded out
  const { board, body } = openCard('Plan', `${PLANE_NAMES[item.plane]} folded out`, { interactive: true });
  const fold = foldOut(room, item.plane), [pu, pv] = PLANES[item.plane].size(room);
  const corners = [fold(0, 0), fold(pu, 0), fold(pu, pv), fold(0, pv)];
  const xs = [0, W, ...corners.map(p => p[0])], ys = [0, D, ...corners.map(p => p[1])];
  const sheet = [[Math.floor(Math.min(...xs) - .5), Math.floor(Math.min(...ys) - .5)], [Math.ceil(Math.max(...xs) + .5), Math.ceil(Math.max(...ys) + .5)]];
  board.setGrid('modules', { x0: sheet[0][0], y0: sheet[0][1], x1: sheet[1][0], y1: sheet[1][1] });
  board.polygon(rect([sheet[0][0], sheet[0][1], sheet[1][0], sheet[1][1]]), { id: 'site', fill: 'none', stroke: null, hit: false });
  goals.forEach((g, i) => {
    const loops = g.rect ? [rect(g.rect)] : outlineOf(g.target, { tol: .04 });
    loops.forEach((p, k) => board.polygon(p, { id: `tg${i}-${k}`, fill: 'rgba(255, 90, 31, .08)', stroke: 'signalFold', hit: false }));
    const all = loops.flat(), mid = [all.reduce((a, p) => a + p[0], 0) / all.length, all.reduce((a, p) => a + p[1], 0) / all.length];
    board.text(mid, goals.length > 1 ? clock(g.hour) : g.name, { id: 'tgl' + i, signal: true, noFit: true });
  });
  [[[0, 0], [W, 0]], [[W, 0], [W, D]], [[W, D], [0, D]], [[0, D], [0, 0]]].forEach(([a, b], i) => board.line(a, b, 'profile', { id: 'wl' + i, hit: false }));
  // the plane's eaves, dashed where they hang over it
  for (const [ex, ey, ez, ew, ed, eh] of item.eaves || []) if (item.plane === 'south') board.line(fold(ex, ez), fold(ex + ew, ez), 'hidden', { id: 'eave', hit: false });
  // the plane's name: under a folded wall's top, or over the roof (east and west walls: past their north end)
  board.text(item.plane === 'east' || item.plane === 'west' ? fold(pu + .35, pv / 2) : fold(pu / 2, pv + .35), PLANE_NAMES[item.plane], { id: 'pln', noFit: true });
  drawNorth(board, sheet, { scale: 'left' });
  // the folded wall's heights, a mark at every module, and module lines across its cells
  if (item.plane !== 'roof') for (let v = 1; v <= pv + 1e-9; v++) {
    board.text(fold(-.32, v), heightText(v), { id: 'pv' + v, noFit: true });
  }
  for (let u = 1; u < pu - 1e-9; u++) board.line(fold(u, 0), fold(u, pv), 'visible', { id: 'pmu' + u, hit: false, noFit: true });
  for (let v = 1; v < pv - 1e-9; v++) board.line(fold(0, v), fold(pu, v), 'visible', { id: 'pmv' + v, hit: false, noFit: true });
  const cellPoly = k => { const a = k % nu, b = Math.floor(k / nu); return [fold(a * cell, b * cell), fold((a + 1) * cell, b * cell), fold((a + 1) * cell, (b + 1) * cell), fold(a * cell, (b + 1) * cell)]; };

  // the moments, if more than one: which one the model shows
  const ctl = document.createElement('div');
  ctl.className = 'ss-ctl';
  ctl.innerHTML = `<div class="ss-read"><span class="ss-clock"></span><span class="ss-match"></span></div>
    ${moments.length > 1 ? `<div class="ss-seasons">${moments.map((m, i) => `<button type="button" class="ss-season" data-m="${i}">${m.keep ? 'Keep out · ' : ''}${momentName(m)}</button>`).join('')}</div>` : `<div class="ss-ends"><span>${momentName(moments[0])}</span></div>`}`;
  body.append(ctl);

  function drawCard() {
    clearRuns(board, 'lt'); clearRuns(board, 'lk');
    goals.forEach((g, i) => shadeRuns(board, litMask(g.map, open), `lt${i}-`, NOW));
    avoid.forEach((a, i) => shadeRuns(board, litMask(a.map, open), `lk${i}-`, 'rgba(255, 90, 31, .7)'));
    for (let k = 0; k < nu * nv; k++) board.polygon(cellPoly(k), { id: 'cl' + k, fill: open.has(k) ? 'rgba(255, 214, 170, .9)' : 'rgba(233, 230, 223, .1)', stroke: open.has(k) ? 'signalThin' : 'guide', hit: false });
  }
  function show() {
    const m = moments[shown], s = sunDir(LAT, m.season, m.hour);
    stage.setSun(s);
    disc.position.set(c.x + s[0] * R, c.y + s[1] * R, s[2] * R);
    ctl.querySelectorAll('.ss-season').forEach(b => b.classList.toggle('is-on', +b.dataset.m === shown));
    stage.invalidate();
  }
  function update() {
    cover = goals.map(g => coverOf(g.map, g.target, open));
    leaks = avoid.map(a => litMask(a.map, open).bits.reduce((x, y) => x + y, 0));
    buildPlane(); drawCard(); show();
    const over = open.size > budget, low = Math.min(...cover);
    ctl.querySelector('.ss-clock').innerHTML = `${open.size} <em>of ${budget} openings</em>`;
    const mt = ctl.querySelector('.ss-match');
    mt.textContent = over ? 'too many openings' : leaks.some(n => n > 0) ? 'the summer sun gets in' : goals.length > 1 ? `marks ${Math.round(low * 100)}% lit` : `${goals[0].name} ${Math.round(low * 100)}% lit`;
    mt.classList.toggle('is-near', over || leaks.some(n => n > 0) || low >= NEED);
    frame.tool('undo', { off: !history.length || done });
    frame.tool('clear', { off: !open.size || done });
    if (!done && ok()) { done = true; sfx.thud?.(); session.check(); }
  }
  const ok = () => open.size <= budget && cover.every(v => v >= NEED - 1e-9) && leaks.every(n => n === 0);
  function toggle(k) {
    if (done) return;
    if (open.has(k)) open.delete(k); else open.add(k);
    history.push(k); sfx.tick?.(); navigator.vibrate?.(6);
    update();
  }
  const off = board.onPointer({
    up(ev, p) {
      for (let k = 0; k < nu * nv; k++) if (inPoly(cellPoly(k), p[0], p[1])) { toggle(k); return; }
    },
  });
  ctl.querySelector('.ss-seasons')?.addEventListener('click', ev => { const b = ev.target.closest('.ss-season'); if (!b) return; shown = +b.dataset.m; sfx.tick?.(); show(); });
  function undo() { if (done || !history.length) return; const k = history.pop(); if (open.has(k)) open.delete(k); else open.add(k); update(); }
  function clear() { if (done) return; open.clear(); history.length = 0; update(); }

  board.fit();
  frame.fitSheet(board, { lo: .3, hi: .48 });
  const first = goals[0];
  frame.title('Can you let the light in?', item.name);
  frame.sub(goals.length > 1
    ? `One opening, two marks: the sun must fall on each at its own hour. Tap cells of the ${PLANE_NAMES[item.plane]}, folded out beside the plan, to open them.`
    : `The sun must fall on the ${first.name} at ${clock(first.hour)}, ${SEASON_NAMES[first.season].toLowerCase()}${avoid.length ? ', and stay out of the room at midsummer noon' : ''}. Tap cells of the ${PLANE_NAMES[item.plane]}, folded out beside the plan, to open them, ${budget} at most.`);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'clear', label: 'Clear', key: 'X', run: clear, spare: true },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primaryEl.style.display = 'none';
  update();

  return {
    kind: 'light',
    get star() { return open.size <= best.length; },
    best, budget,
    check: () => ok() ? { ok: true } : { ok: false, note: 'The mark is not lit yet.' },
    hint(n) {
      const s = sunDir(LAT, first.season, first.hour), up = altitude(s), k = 1 / Math.tan(up * D2R);
      if (n === 1) return { text: item.plane === 'roof'
        ? `At ${clock(first.hour)} the sun is ${Math.round(up)}° up, so light through the roof lands ${(k * H).toFixed(1)} squares away from the sun. Find the mark, and look back toward the sun from it.`
        : `At ${clock(first.hour)} the sun is ${Math.round(up)}° up: light through a cell one module up the wall (the +1 mark) lands ${k.toFixed(1)} squares into the room. The higher the cell, the deeper its patch.` };
      if (n === 2) {
        const k0 = best.find(c => !open.has(c));
        if (k0 !== undefined) toggle(k0);
        return { text: 'One of the cells you need is open now. Its patch shows where its neighbours’ light will fall.' };
      }
      session.peek();
      open.clear(); best.forEach(c => open.add(c)); update();
      return { text: 'These are the fewest cells that light the mark.' };
    },
    async solved() {
      done = true;
      // the model shows each moment in turn
      for (let i = 0; i < moments.length; i++) { shown = i; show(); await wait(moments.length > 1 ? 700 : 1200, { essential: true }); }
    },
    dispose() {
      off();
      for (const v of [...seen, ...planeViews]) { v.dispose(); v.group.removeFromParent(); }
      casters.children.forEach(m => m.geometry.dispose()); casters.removeFromParent(); shadowMat.dispose();
      disc.geometry.dispose(); disc.material.dispose(); disc.removeFromParent();
      closeCard();
      frame.primaryEl.style.display = '';
    },
  };
}

// ------------------------------------------------------------------
// the game definition
// ------------------------------------------------------------------

let task = null;
const TASKS = { cast: castTask, hour: hourTask, fence: fenceTask, light: lightTask };
function reset() { task?.dispose(); task = null; red.clear(); labels.clear(); stage.clear(); }
function load(item) { reset(); task = TASKS[item.task](item); }

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
  sub: 'Draw a shadow the way architects learn to, find the hour and season a shadow plan was drawn for, build as high as the neighbours’ sun allows, and cut the openings that let it into a room, under the real sun over Istanbul.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  // the star: a clean build (fence), or the fewest openings (light)
  master: {
    get name() { return task?.kind === 'light' ? 'fewest openings' : 'clean build'; },
    get says() { return task?.kind === 'light' ? 'lit the mark with the fewest openings' : 'built it without ever shading a garden'; },
    applies: it => it.task === 'fence' || it.task === 'light',
    test: () => task?.kind === 'light' ? task.star : task?.clean,
  },
  modes: ['challenge', 'daily'],
  dailyDifficulty: 3,
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
window.__udp = { stage, session, get task() { return task; }, get board() { return card; } };
