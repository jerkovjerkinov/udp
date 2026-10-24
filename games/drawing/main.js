// Drawing Set: draw elevations and top views of plaster buildings, point to
// point on a dotted sheet, and have them checked line by line.
//
// The screen has the model and the sheet side by side. A signal arrow at the
// model shows which way the view looks. A correct drawing is lifted back onto
// the model: its lines light up on the edges they stand for, and the camera
// turns to look the same way the drawing does.
//
// Five tasks (levels.js):
//   complete   most of the view is drawn; add the missing lines
//   draw       draw the whole view from the model
//   error      a drawn view with mistakes; tap them
//   which      four drawings, one is the view of this model
//   third      no model: two views given, draw the third; then the model appears

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
import { mergeSteps } from '../../src/core/lattice.js';
import { VIEWS, STEP, viewOf, stepsAny, moduleLines } from '../../src/core/views.js';
import { DRAW_FORMS, drawForm } from '../../src/core/drawforms.js';
import { compareDrawing, hiddenForComplete, mistake, signature, levelSheet, layout, answerSteps, pocheOf } from '../../src/core/drawtasks.js';
import { triangulate } from '../../src/core/poly.js';
import { seededRng, pick, shuffle } from '../../src/core/rand.js';
import { PACKS } from './levels.js';

// elevations are looked at dead level, and the top view from straight above
const stage = createStage(document.getElementById('stage'), { camera: { minPitch: 0, maxPitch: 89.5 * Math.PI / 180 } });
const frame = createFrame({ game: 'drawing', name: 'Drawing Set', stage });
const red = createRedlines(stage);
frame.stack(true);

// ------------------------------------------------------------------
// small helpers
// ------------------------------------------------------------------

const TITLES = {
  complete: 'Can you finish the drawing?', draw: 'Can you draw this view?', error: 'Can you spot the mistakes?',
  which: 'Which drawing is right?', third: 'Can you draw the third view?',
};
// how each kind of line looks on the sheet: given (grey) and drawn by the player
const GIVEN_STYLE = { seen: 'visible', hidden: 'fold', cut: 'cutGiven' };
const DRAWN_STYLE = { seen: 'profile', hidden: 'hiddenPen', cut: 'cutPen' };
const PEN_LABEL = { seen: 'Pen: thin', hidden: 'Pen: dashed', cut: 'Pen: cut' };
// the phone bar has room for the pen's name only
const PEN_SHORT = { seen: 'Thin', hidden: 'Dashed', cut: 'Cut' };
const POCHE = 'rgba(233, 230, 223, .2)';
// the depth of a section's plane along its view: levels name it in modules,
// across the building from the side the view looks from
const cutDepth = item => item.cut * (VIEWS[item.view].d[0] + VIEWS[item.view].d[1] + VIEWS[item.view].d[2]);
const TASK_TAGS = { complete: 'finish', draw: 'draw', error: 'spot the error', which: 'which view', third: 'third view' };
const VIEW_TAGS = { front: 'front', back: 'back', right: 'side', left: 'side', top: 'top' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const D2R = Math.PI / 180;
const viewName = v => VIEWS[v].name;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

// the par time in seconds
function parOf(item) {
  const n = viewOf(drawForm(item.form), item.view, { hidden: false }).lines.length;
  const p = item.task === 'complete' ? 15 + 6 * (item.missing || 2)
    : item.task === 'draw' ? 20 + 6 * n
    : item.task === 'third' ? 40 + 8 * n
    : item.task === 'error' ? 20 + 12 * (item.errors || 1) : 30;
  return Math.round(p / 5) * 5;
}

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, name: DRAW_FORMS[l.form].name, label: `${DRAW_FORMS[l.form].name} · ${VIEW_TAGS[l.view]} · ${TASK_TAGS[l.task]}`, par: parOf(l), note: l.learn })),
}));

// ------------------------------------------------------------------
// the sheet: a large drafting board beside the model
// ------------------------------------------------------------------

function openCard(title, note, { interactive = false } = {}) {
  const body = frame.card(true, title, note);
  document.querySelector('.udp-card').classList.add('is-plan');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  body.append(holder);
  const board = createBoard(holder, { unit: 2, sub: 2, grid: 'dots', padding: 24, interactive, maxScale: 56 });
  frame.layout();
  return board;
}
function closeCard() {
  const body = document.querySelector('.udp-card.is-plan .udp-card-body');
  if (body) body.style.height = '';
  frame.card(false);
  document.querySelector('.udp-card').classList.remove('is-plan');
}

const grow = (b, k) => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k });

// On a phone the sheet sits under the model and takes only the height its
// drawing needs; with the model hidden (a third view) it may take more
function fitCard(board, { roomy = false } = {}) {
  frame.fitSheet(board, { lo: .2, hi: roomy ? .56 : .32 });
}

// the name of a view under it on the sheet
function viewLabel(board, box, text, { signal = false, id } = {}) {
  board.text([(box.x0 + box.x1) / 2, box.y0 - 1.1], text.toUpperCase(), { id, signal, hit: false, noFit: false });
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

// ------------------------------------------------------------------
// the model, its view arrow and the lines lifted onto it
// ------------------------------------------------------------------

function boxOf(solids) {
  const b = new THREE.Box3();
  for (const s of solids) for (const v of s.verts) b.expandByPoint(new THREE.Vector3(...v));
  return b;
}

function addModel(solids, view, { hidden = false } = {}) {
  const group = new THREE.Group();
  const views = solids.map(s => createSolidView(s, { invalidate: stage.invalidate }));
  for (const v of views) group.add(v.group);
  const bb = boxOf(solids);
  const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  // the arrow: which way the drawing looks
  const V = VIEWS[view], d = V.d;
  let arrow = [];
  if (view === 'top') {
    const z0 = bb.max.z + .35, z1 = z0 + 1;
    arrow = [[[c.x, c.y, z1], [c.x, c.y, z0]], [[c.x - .22, c.y, z0 + .3], [c.x, c.y, z0]], [[c.x + .22, c.y, z0 + .3], [c.x, c.y, z0]]];
  } else {
    const reach = Math.abs(d[0]) ? size.x / 2 : size.y / 2;
    const tip = [c.x - d[0] * (reach + .5), c.y - d[1] * (reach + .5), .02];
    const tail = [tip[0] - d[0] * 1.4, tip[1] - d[1] * 1.4, .02];
    const side = [-d[1], d[0], 0];
    const back = (k) => [tip[0] - d[0] * .3 + side[0] * .22 * k, tip[1] - d[1] * .3 + side[1] * .22 * k, .02];
    arrow = [[tail, tip], [back(1), tip], [back(-1), tip]];
  }
  const arrowLine = createLines(arrow, 'signal', { on: 'model', renderOrder: 4 });
  const lifted = createLines([], 'signal', { on: 'model', renderOrder: 5 });
  // faint module lines on the plaster: walls count off like the crosses on the sheet
  const mods = createLines(moduleLines(solids), 'module', { on: 'model', renderOrder: 1 });
  group.add(mods, arrowLine, lifted);
  group.visible = !hidden;
  stage.content.add(group);
  stage.invalidate();
  return {
    group, views, box: bb,
    lift(segs) { lifted.setSegments(segs); stage.invalidate(); },
    dispose() { views.forEach(v => v.dispose()); mods.dispose(); arrowLine.dispose(); lifted.dispose(); group.removeFromParent(); stage.invalidate(); },
  };
}

// The picture plane: a pane of glass between the arrow and the model, where the
// drawing lands line by line as it is drawn. It is the glass box every drafting
// course starts from: the view is what the building leaves on the glass.
// v is the view as laid out on the sheet (its off maps sheet points back).
// A section's glass stands at the cut itself (depth: the cut along the view),
// its rim in the signal colour: it is the plane the building is cut on.
function addGlass(m, solids, view, v, { depth = null } = {}) {
  const V = VIEWS[view];
  const U = new THREE.Vector3(...V.u), Wv = new THREE.Vector3(...V.w), Dv = new THREE.Vector3(...V.d);
  let t0 = Infinity;
  for (const s of solids) for (const p of s.verts) t0 = Math.min(t0, p[0] * V.d[0] + p[1] * V.d[1] + p[2] * V.d[2]);
  let t1 = -Infinity;
  for (const s of solids) for (const p of s.verts) t1 = Math.max(t1, p[0] * V.d[0] + p[1] * V.d[1] + p[2] * V.d[2]);
  t0 = depth !== null ? depth - .004 : t0 - .3;
  const at = ([x, y]) => U.clone().multiplyScalar((x - v.off[0]) * STEP).addScaledVector(Wv, (y - v.off[1]) * STEP).addScaledVector(Dv, t0).toArray();
  const b = grow(v.box, .6);
  const c = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(at);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3]], 3));
  const mat = new THREE.MeshBasicMaterial({ color: '#e9e6df', transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false });
  const pane = new THREE.Mesh(geo, mat);
  pane.renderOrder = 3;
  const rim = createLines(c.map((p, i) => [p, c[(i + 1) % 4]]), depth !== null ? 'signalFold' : 'fold', { on: 'sheet', renderOrder: 4 });
  const seen = createLines([], 'profile', { on: 'sheet', renderOrder: 6 });
  const hidden = createLines([], 'hiddenPen', { on: 'sheet', renderOrder: 6 });
  const cut = createLines([], 'cutPen', { on: 'sheet', renderOrder: 6 });
  // where the pen is on the sheet, found on the glass and on the model: a
  // crosshair across the pane and a ray along the view that stops where it
  // meets the plaster, so the sheet always has the model to measure against
  const caster = new THREE.Raycaster();
  const cross = createLines([], 'signalThin', { on: 'sheet', renderOrder: 7 });
  const ray = createLines([], 'signalThin', { on: 'model', renderOrder: 7 });
  const glass = new THREE.Group();
  glass.add(pane, rim, seen, hidden, cut, cross, ray);
  m.group.add(glass);
  let cap = null;
  return {
    at,
    // lines on the sheet: [{ a, b, kind }]
    draw(lines) {
      seen.setSegments(lines.filter(l => l.kind === 'seen').map(l => [at(l.a), at(l.b)]));
      hidden.setSegments(lines.filter(l => l.kind === 'hidden').map(l => [at(l.a), at(l.b)]));
      cut.setSegments(lines.filter(l => l.kind === 'cut').map(l => [at(l.a), at(l.b)]));
      stage.invalidate();
    },
    // a section solved: everything in front of the cut goes, and the cut
    // faces (the poché, polys on the sheet) close it in the signal colour
    open(polys) {
      const plane = new THREE.Plane(Dv.clone(), -(t0 + .004));
      stage.renderer.localClippingEnabled = true;
      m.group.traverse(o => { if (o.material && o !== pane && !glass.children.includes(o)) { o.material.clippingPlanes = [plane]; o.material.clipShadows = true; o.material.needsUpdate = true; } });
      const pos = [], idx = [];
      for (const poly of polys) {
        const base = pos.length / 3;
        for (const q of poly) pos.push(...at(q));
        for (const t of triangulate(poly)) idx.push(...t.map(i => base + i));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      cap = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ff5a1f', side: THREE.DoubleSide }));
      cap.renderOrder = 2;
      pane.visible = false;
      glass.add(cap);
      stage.invalidate();
    },
    // q: a point on the sheet, or null to clear
    point(q) {
      if (!q) { cross.setSegments([]); ray.setSegments([]); stage.invalidate(); return; }
      cross.setSegments([[at([b.x0, q[1]]), at([b.x1, q[1]])], [at([q[0], b.y0]), at([q[0], b.y1])]]);
      const p = new THREE.Vector3(...at(q));
      caster.set(p, Dv);
      const faces = [];
      for (const v of m.views) v.group.traverse(o => { if (o.isMesh && !o.isLineSegments2) faces.push(o); });
      const hit = caster.intersectObjects(faces, false)[0];
      ray.setSegments([[p.toArray(), p.clone().addScaledVector(Dv, hit ? hit.distance : t1 - t0 + .6).toArray()]]);
      stage.invalidate();
    },
    set visible(on) { glass.visible = on; stage.invalidate(); },
    dispose() { geo.dispose(); mat.dispose(); rim.dispose(); seen.dispose(); hidden.dispose(); cut.dispose(); cross.dispose(); ray.dispose(); cap?.geometry.dispose(); cap?.material.dispose(); glass.removeFromParent(); },
  };
}

function frameModel(m) {
  const r = stage.rect;
  stage.frame(m.box, { padding: Math.max(8, Math.min(64, Math.min(r.w, r.h) * .12)) });
}

// look along the view, or back to the usual three-quarter view
let looking = false;
function look(view, on = !looking) {
  if (on) session.turned();
  looking = on;
  const V = VIEWS[view];
  frame.tool('look', { active: on });
  return on ? stage.rig.setView(V.yaw * D2R, V.pitch * D2R) : stage.rig.setView(-112.5 * D2R, 28 * D2R);
}

// a third-view model is cast once the drawing is right: it rises out of the ground
async function cast(m) {
  m.group.visible = true;
  m.group.scale.set(1, 1, .001);
  sfx.slide();
  await animate({ duration: 1100, ease: ease.backOut, essential: true, update: v => { m.group.scale.z = Math.max(.001, v); stage.invalidate(); } }).promise;
  sfx.thud();
}

// what every solved sheet ends with: the drawing lifted onto the model, seen its way
async function finale(m, segs, view) {
  if (!m) return;
  m.lift(segs);
  await look(view, true);
  await wait(1500, { essential: true });
  await look(view, false);
  await wait(500, { essential: true });
}

// ------------------------------------------------------------------
// task: draw a view (complete, draw, third)
// ------------------------------------------------------------------

function drawingTask(item) {
  const third = item.task === 'third';
  const sheet = levelSheet(item);
  const target = sheet.views[item.view];
  const hid = { hidden: !!item.hidden };
  // a section: the model cut on a plane at depth item.cut, drawn with the cut pen and the seen pen
  const section = item.cut !== undefined;
  const answer = answerSteps(target, hid);
  const model = addModel(sheet.solids, item.view, { hidden: third });
  const glass = addGlass(model, sheet.solids, item.view, target, { depth: section ? cutDepth(item) : null });
  const region = third ? target.box : grow(target.box, 1);

  const board = openCard(third ? 'Sheet' : section ? 'Section' : viewName(item.view), third ? `draw the ${lower(viewName(item.view))}` : section ? 'cut on the orange plane' : VIEWS[item.view].seen, { interactive: true });
  board.setGrid('dots', grow(sheet.bounds, third ? 0 : 1));

  // the lines a level gives: most of the view (complete), or two other views (third)
  const given = new Map();
  if (item.task === 'complete') {
    const rng = seededRng('complete:' + item.id + ':' + (item.seed ?? ''));
    const hide = new Set(hiddenForComplete(target, rng, item.missing || 2, hid).flatMap(l => l.steps));
    for (const [k, v] of answer) if (!hide.has(k)) given.set(k, v);
  }
  if (third) {
    for (const g of item.given) {
      const v = sheet.views[g];
      mergeSteps(answerSteps(v, hid)).forEach((l, i) => board.line(l.a, l.b, l.kind === 'hidden' ? 'fold' : 'visible', { id: `gv${g}${i}`, hit: false }));
      viewLabel(board, v.box, VIEWS[g].short, { id: 'lab' + g });
    }
    board.polygon([[region.x0, region.y0], [region.x1, region.y0], [region.x1, region.y1], [region.x0, region.y1]], { id: 'frame', fill: 'none', stroke: 'guide', hit: false });
    viewLabel(board, target.box, 'Draw: ' + VIEWS[item.view].short, { signal: true, id: 'labT' });
  } else {
    // the sheet fits the region with room for its label
    board.polygon([[region.x0, region.y0], [region.x1, region.y0], [region.x1, region.y1], [region.x0, region.y1]], { id: 'frame', fill: 'none', stroke: null, hit: false });
  }
  mergeSteps(given).forEach((l, i) => board.line(l.a, l.b, GIVEN_STYLE[l.kind], { id: 'gc' + i, hit: false }));
  board.fit();

  // the pen: 'seen' (solid) and, on a hidden-line sheet, 'hidden' (dashed);
  // a section starts with the cut pen, since a drafter draws the cut first
  const pens = section ? ['cut', 'seen'] : item.hidden ? ['seen', 'hidden'] : ['seen'];
  let pen = pens[0];
  const penLabel = k => k === 'seen' && !section ? 'Pen: solid' : PEN_LABEL[k];
  const penShort = k => '✎ ' + (k === 'seen' && !section ? 'Solid' : PEN_SHORT[k]);
  let drawn = new Map();
  const history = [];
  let guides = 0;
  const all = () => new Map([...given, ...drawn]);

  function render() {
    for (const it of board.items()) if (/^(d|pc)\d/.test(String(it.id))) board.remove(it.id);
    const lines = mergeSteps(drawn);
    // a closed cut outline fills in as soon as it closes: the poché
    if (section) pocheOf(all()).forEach((poly, i) => board.polygon(poly, { id: 'pc' + i, fill: POCHE, stroke: null, hit: false, noFit: true }));
    lines.forEach((l, i) => board.line(l.a, l.b, DRAWN_STYLE[l.kind], { id: 'd' + i, line: l }));
    glass.draw([...mergeSteps(given), ...lines]);
    const n = lines.length;
    // how to draw, on the first sheets only
    const how = /^(A[1-3]|B1|C1)$/.test(item.id) ? 'Drag between points to draw; tap a line to take it away.' : '';
    let text = item.task === 'complete'
      ? `Most of this ${lower(viewName(item.view))} is drawn, but ${plural(item.missing || 2, 'line')} ${item.missing === 1 ? 'is' : 'are'} missing. Look at the model ${VIEWS[item.view].seen}, where the arrow points, and add ${item.missing === 1 ? 'it' : 'them'}. ${how}`
      : third
        ? `The model is hidden. From its ${item.given.map(g => lower(viewName(g))).join(' and ')}, work out its shape and draw the ${lower(viewName(item.view))}.${/^C[12]$/.test(item.id) ? ' The Guides button draws a drafter’s projection lines.' : ''} ${how}`
        : section
          ? `This is a section: the building cut on the orange plane, seen the way the arrow points, with the part in front taken away. Draw the outline of the cut with the heavy cut pen, then what you see beyond it with the thin pen. The Pen button switches.`
        : item.hidden
          ? `Draw the building ${VIEWS[item.view].seen}, where the arrow points. Edges you can see are solid; edges that are there but out of sight are dashed: switch pens with the Pen button.`
          : `Draw the building ${VIEWS[item.view].seen}, where the arrow points: every edge you can see, and nothing you can’t. ${how}`;
    if (item.hidden && item.task === 'complete') text += ' Use the Pen button for a dashed line.';
    if (section && item.task === 'complete') text = `Most of this section is drawn: the building cut on the orange plane, seen the way the arrow points. The heavy lines are the cut, the thin ones what lies beyond. Add the ${plural(item.missing || 2, 'line')} that ${item.missing === 1 ? 'is' : 'are'} missing; the Pen button switches between cut and thin.`;
    text = text.trim();
    frame.sub(`${text}<span class="udp-count">${plural(n, 'line')} drawn</span>`, true);
    frame.primary({ label: 'Check', run: () => session.check(), disabled: !drawn.size, ready: false });
    frame.tool('undo', { off: !history.length });
    frame.tool('pen', { label: penLabel(pen), short: penShort(pen), active: pen !== pens[0] });
    stage.invalidate();
  }

  const clamp = p => [Math.max(region.x0, Math.min(region.x1, Math.round(p[0]))), Math.max(region.y0, Math.min(region.y1, Math.round(p[1])))];
  function commit(a0, b0) {
    const a = clamp(a0), b = clamp(b0);
    if (a[0] === b[0] && a[1] === b[1]) return;
    // drawing over a line in the other pen redraws it in this one
    const add = stepsAny(a, b).filter(k => drawn.get(k) !== pen && !given.has(k));
    if (!add.length) { sfx.tick(); return; }
    history.push({ add, was: add.map(k => drawn.get(k)) });
    for (const k of add) drawn.set(k, pen);
    sfx.pencil();
    red.clear();
    clearGuides();
    render();
  }
  function erase(ev) {
    const h = board.hit(ev, { kinds: ['seg'], filter: it => /^d\d/.test(String(it.id)), tol: 10 });
    if (!h) return;
    const del = h.item.line.steps;
    history.push({ del, was: del.map(k => drawn.get(k)) });
    for (const k of del) drawn.delete(k);
    sfx.tick();
    render();
  }
  function undo() {
    const last = history.pop();
    if (!last) return;
    if (last.add) last.add.forEach((k, i) => last.was?.[i] ? drawn.set(k, last.was[i]) : drawn.delete(k));
    if (last.del) last.del.forEach((k, i) => drawn.set(k, last.was?.[i] || 'seen'));
    sfx.tick();
    render();
  }
  // Projection guides (third view): the drafter's construction lines. Heights
  // carry straight across from the front, widths straight up, and depth turns
  // the corner between the top and the side on a 45 degree miter line.
  let projOn = false, projN = 0;
  function projectors() {
    const V = sheet.views, T = V.top, R = V.right, F = V.front, segs = [];
    const pts = v => { const xs = new Set(), ys = new Set(); for (const l of v.lines) for (const p of [l.a, l.b]) { xs.add(p[0]); ys.add(p[1]); } return { xs: [...xs], ys: [...ys] }; };
    if (!T || !R || !F) return { segs, miter: null };
    // the miter: right-view x and top-view y measure the same depth
    const x0 = R.box.x0, y0 = T.box.y0, k = Math.max(R.box.x1 - x0, T.box.y1 - y0);
    const miter = [[x0, y0], [x0 + k, y0 + k]];
    if (item.view === 'right') {
      for (const y of pts(F).ys) segs.push([[F.box.x1, y], [R.box.x1, y]]);
      for (const y of pts(T).ys) { const mx = x0 + (y - y0); segs.push([[T.box.x1, y], [mx, y]], [[mx, y], [mx, R.box.y0]]); }
    } else if (item.view === 'top') {
      for (const x of pts(F).xs) segs.push([[x, F.box.y1], [x, T.box.y1]]);
      for (const x of pts(R).xs) { const my = y0 + (x - x0); segs.push([[x, R.box.y1], [x, my]], [[x, my], [T.box.x0, my]]); }
    }
    return { segs, miter };
  }
  function showProjectors(on) {
    projOn = on;
    for (let i = 0; i < projN; i++) board.remove('pj' + i);
    projN = 0;
    if (on) {
      const { segs, miter } = projectors();
      segs.forEach(([a, b]) => board.line(a, b, 'guide', { id: 'pj' + projN++, hit: false, noFit: true }));
      if (miter) board.line(miter[0], miter[1], 'fold', { id: 'pj' + projN++, hit: false, noFit: true });
    }
    frame.tool('guides', { active: on });
    sfx.tick();
  }

  function clearGuides() { for (let i = 0; i < guides; i++) board.remove('g' + i); guides = 0; }
  function showGuides(lines) {
    clearGuides();
    lines.forEach((l, i) => board.line(l.a, l.b, l.kind === 'hidden' ? 'signalFold' : l.kind === 'cut' ? 'signal' : 'signalThin', { id: 'g' + i, hit: false }));
    guides = lines.length;
  }

  const offDraw = board.drawSegments({ commit, constrain: (a, p) => clamp(p), readout: false, onSnap: () => sfx.tick?.() });
  // the pen's place on the model: while a finger draws, or wherever the mouse is
  const offPoint = third ? () => {} : board.onPointer({
    down: (ev, p) => glass.point(clamp(p)),
    move: (ev, p, q, dragging) => { if (dragging || ev.pointerType === 'mouse') glass.point(clamp(p)); },
    up: ev => { if (ev.pointerType !== 'mouse') glass.point(null); },
  });
  const unpoint = () => glass.point(null);
  board.el.addEventListener('pointerleave', unpoint);
  // the very first sheet shows the gesture once, along a line already drawn
  const firstLine = item.id === 'A1' && !item.seed ? mergeSteps(given)[0] : null;
  let demoStop = null;
  const demoTimer = firstLine && setTimeout(() => { demoStop = board.demo(firstLine.a, firstLine.b); }, 900);
  const stopDemo = () => { clearTimeout(demoTimer); demoStop?.(); };
  const offTap = onBoardTap(board, erase);

  frame.title(TITLES[item.task], item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'reset', label: 'Clear', key: 'R', spare: pens.length > 1, run: () => { if (drawn.size) { history.push({ del: [...drawn.keys()], was: [...drawn.values()] }); drawn = new Map(); sfx.slide(); render(); } } },
    ...(pens.length > 1 ? [{ id: 'pen', label: penLabel(pen), short: penShort(pen), key: 'P', title: 'Switch pens', run: () => { pen = pens[(pens.indexOf(pen) + 1) % pens.length]; sfx.tick(); render(); } }] : []),
    ...(third ? [{ id: 'guides', label: 'Guides', key: 'G', title: 'Projection lines from the two views', run: () => showProjectors(!projOn) }] : [{ id: 'look', label: 'Look', key: 'L', run: () => look(item.view) }]),
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();
  render();

  const raw = target.raw;
  const isBack = l => l.steps.every(k => target.steps.get(k) === 'hidden');

  return {
    model, board, commit, fitBounds: grow(sheet.bounds, third ? 0 : 1), roomy: third,
    _answer: () => mergeSteps(answer).filter(l => !l.steps.every(k => given.has(k))).map(l => [l.a, l.b, l.kind]),
    setPen(k) { pen = k; render(); },
    check() {
      const r = compareDrawing(all(), answer);
      if (r.ok) return { ok: true };
      const extra = r.extraLines, miss = r.missingLines;
      for (const l of extra) board.line(l.a, l.b, 'signalThin', { id: 'x' + l.steps[0], hit: false });
      setTimeout(() => { for (const l of extra) board.remove('x' + l.steps[0]); }, 1800);
      const back = item.hidden ? [] : extra.filter(isBack);
      const pens = r.wrongKindLines;
      for (const l of pens) board.line(l.a, l.b, 'signalFold', { id: 'x' + l.steps[0], hit: false });
      setTimeout(() => { for (const l of pens) board.remove('x' + l.steps[0]); }, 1800);
      const parts = [];
      if (miss.length) parts.push(`${miss.length === 1 ? 'one line is' : `${miss.length} lines are`} still missing`);
      if (extra.length) parts.push(`${extra.length === 1 ? 'one line isn’t' : `${extra.length} lines aren’t`} part of this view`);
      if (pens.length) parts.push(`${pens.length === 1 ? 'one line is' : `${pens.length} lines are`} in the right place but drawn with the wrong pen`);
      let note = 'Not quite: ' + parts.join(', and ') + '.';
      if (back.length) note += ` ${back.length === 1 ? 'The circled edge is real' : 'The circled edges are real'}, but ${back.length === 1 ? 'it is' : 'they are'} behind what you can see ${VIEWS[item.view].seen}.`;
      const culprits = [...extra.slice(0, 2).map(l => ({ at: () => board.toClient(mid(l.a, l.b)), r: 16, note: !item.hidden && isBack(l) ? 'round the back' : 'not in this view' })),
        ...pens.slice(0, 2).map(l => ({ at: () => board.toClient(mid(l.a, l.b)), r: 16, note: answer.get(l.steps[0]) === 'hidden' ? 'out of sight: dashed' : 'in sight: solid' }))];
      return { ok: false, note, culprits };
    },
    hint(n) {
      if (n === 1) {
        if (section) return { text: 'Imagine slicing the model along the orange plane and lifting the front part away. Wherever the knife went through plaster, the outline of the cut is a heavy line. Everything you see behind the cut is a thin line.' };
        if (item.hidden) return { text: `First draw everything you can see ${VIEWS[item.view].seen}. Then turn the model and look for edges behind walls or round corners: each of them is a dashed line, at the place it would be if the walls were glass.` };
        if (third) {
          if (!projOn) showProjectors(true);
          return { text: item.view === 'top'
            ? 'The guides are on: every width on the front carries straight up, and every depth on the side turns the corner on the 45 degree line. Your corners sit where the guides cross.'
            : 'The guides are on: every height on the front carries straight across, and every depth on the top view turns the corner on the 45 degree line. Your corners sit where the guides cross.' };
        }
        return { text: item.view === 'top'
          ? 'From above, every place where two slopes meet is a line: ridges, hips and valleys. Heights don’t show at all. Try the Look button to see the model from overhead.'
          : `Draw only what faces you ${VIEWS[item.view].seen}. A line goes wherever the surface changes: an edge, a crease, or a wall that steps back. Try the Look button to see the model straight on.` };
      }
      const r = compareDrawing(all(), answer);
      if (n === 2) {
        for (const k of r.extra) drawn.delete(k);
        for (const k of r.wrongKind) drawn.set(k, answer.get(k));
        render();
        const one = r.missingLines.slice(0, 1);
        showGuides(one);
        return { text: (r.extra.length ? 'The lines that don’t belong have gone' : r.wrongKind.length ? 'Lines in the wrong pen are fixed' : '') + (r.extra.length || r.wrongKind.length ? ', and one' : 'One') + ' missing line is marked in orange for you.' };
      }
      showGuides(mergeSteps(answer));
      setTimeout(clearGuides, 3500);
      return { text: 'Here is the whole view for a moment. Trace over it while it lasts.' };
    },
    async solved() {
      glass.point(null);
      clearGuides();
      for (const it of board.items()) if (/^(d\d|gc)/.test(String(it.id))) board.remove(it.id);
      mergeSteps(answer).forEach((l, i) => board.line(l.a, l.b, DRAWN_STYLE[l.kind], { id: 'ok' + i, hit: false }));
      glass.draw(mergeSteps(answer));
      if (section) glass.open(pocheOf(answer).map(poly => poly.map(q => q)));
      if (third) { frameModel(model); await cast(model); }
      await finale(model, raw.lines.filter(l => item.hidden || l.kind === 'seen').flatMap(l => l.parts3), item.view);
    },
    dispose() { stopDemo(); offDraw(); offPoint(); board.el.removeEventListener('pointerleave', unpoint); offTap(); board.dispose(); closeCard(); glass.dispose(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: spot the error
// ------------------------------------------------------------------

function errorTask(item) {
  const rng = seededRng('error:' + item.id + ':' + (item.seed ?? ''));
  const n = item.errors || 1;
  const sheet = levelSheet(item);
  const target = sheet.views[item.view];
  const model = addModel(sheet.solids, item.view);
  let m = null;
  const hid = { hidden: !!item.hidden };
  for (let t = 0; t < 20 && !m; t++) m = mistake(target, rng, { kinds: item.kinds || ['back', 'shift'], n, ...hid });
  const wrongSteps = new Set(m.wrong.flatMap(w => w.steps));
  const board = openCard(viewName(item.view), plural(n, 'mistake'));
  board.setGrid('dots', grow(target.box, 1));
  const right = new Map([...m.steps].filter(([k]) => !wrongSteps.has(k)));
  const pen = k => GIVEN_STYLE[k];
  mergeSteps(right).forEach((l, i) => board.line(l.a, l.b, pen(l.kind), { id: 'r' + i, line: l }));
  m.wrong.forEach((w, i) => board.line(w.a, w.b, pen(w.kind), { id: 'w' + i, wrong: i }));
  const box = grow(target.box, 1);
  board.polygon([[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]], { id: 'frame', fill: 'none', stroke: null, hit: false });
  board.fit();
  const found = new Set();
  const WHY = { back: 'round the back', shift: 'out of place', solid: 'should be dashed', dashed: 'should be solid', thin: 'cut: should be heavy', heavy: 'beyond: should be thin' };

  function sub() {
    if (item.hidden) return frame.sub(`Someone drew this ${lower(viewName(item.view))} with both pens and made <em>${n === 1 ? 'one mistake' : `${n} mistakes`}</em>: a line in the right place but in the wrong pen. Solid is for edges you can see, dashed for edges out of sight. Tap what is wrong.<span class="udp-count"><em>${found.size}</em> / ${n} found</span>`, true);
    frame.sub(`Someone drew this ${lower(viewName(item.view))} and made <em>${n === 1 ? 'one mistake' : `${n} mistakes`}</em>: a line for an edge you can’t see from here, or a line a step out of place. Compare it with the model and tap what is wrong.<span class="udp-count"><em>${found.size}</em> / ${n} found</span>`, true);
  }

  const offTap = onBoardTap(board, ev => {
    const h = board.hit(ev, { kinds: ['seg'], filter: it => it.line || it.wrong !== undefined, tol: 12 });
    if (!h) return;
    if (h.item.wrong !== undefined) {
      const i = h.item.wrong, w = m.wrong[i];
      if (found.has(i)) return;
      found.add(i);
      sfx.step(found.size - 1);
      board.update('w' + i, { style: w.kind === 'hidden' ? 'signalFold' : 'signalThin' });
      board.text(mid(w.a, w.b), WHY[w.why], { id: 'why' + i, signal: true, dy: -12, hit: false });
      if (w.from) board.line(w.from.a, w.from.b, 'signalFold', { id: 'fix' + i, hit: false });
      sub();
      if (found.size >= n) session.check();
      return;
    }
    const l = h.item.line;
    session.miss({ note: l.kind === 'hidden' ? `That line is right: the edge is there but out of sight ${VIEWS[item.view].seen}, so it is dashed.` : `That line is right: it is an edge you can see ${VIEWS[item.view].seen}.`, culprits: [{ at: () => board.toClient(mid(l.a, l.b)), r: 16 }] });
  });

  frame.title(TITLES.error, item.name);
  sub();
  frame.tools([
    { id: 'look', label: 'Look', key: 'L', run: () => look(item.view) },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  viewKeys();

  const left = () => m.wrong.map((w, i) => ({ w, i })).filter(x => !found.has(x.i));
  return {
    model, board, fitBounds: box,
    _answer: () => left().map(x => x.i),
    tapWrong: i => { const w = m.wrong[i]; return w && mid(w.a, w.b); },
    check: () => ({ ok: found.size >= n }),
    hint(k) {
      const x = left()[0];
      if (!x) return null;
      if (k === 1) return { text: item.hidden ? `For each line, find its edge on the model. If you can see it ${VIEWS[item.view].seen}, it should be solid; if a wall is in the way, dashed.` : `Check each line against the model ${VIEWS[item.view].seen}. Is that edge in front where you can see it, and is it exactly where the drawing puts it?` };
      if (k === 2) return { text: 'Have a look around here.', culprits: [{ at: () => board.toClient(mid(x.w.a, x.w.b)), r: 46 }] };
      return { text: 'This one is ' + WHY[x.w.why] + '.', culprits: [{ at: () => board.toClient(mid(x.w.a, x.w.b)), r: 16 }] };
    },
    solved: () => finale(model, target.raw.lines.filter(l => item.hidden || l.kind === 'seen').flatMap(l => l.parts3), item.view),
    dispose() { offTap(); board.dispose(); closeCard(); model.dispose(); },
  };
}

// ------------------------------------------------------------------
// task: which drawing
// ------------------------------------------------------------------

function whichTask(item) {
  const rng = seededRng('which:' + item.id + ':' + (item.seed ?? ''));
  const solids = drawForm(item.form);
  const model = addModel(solids, item.view);
  const keys = shuffle(rng, [item.form, ...item.options]);
  const opts = keys.map(k => ({ key: k, ok: k === item.form, v: layout(drawForm(k), [item.view]).views[item.view] }));
  const W = Math.max(...opts.map(o => o.v.box.x1 - o.v.box.x0)), H = Math.max(...opts.map(o => o.v.box.y1 - o.v.box.y0));
  const off = i => [(i % 2) * (W + 3), -Math.floor(i / 2) * (H + 3.4)];
  const board = openCard('Four drawings', 'one is right');
  board.setGrid('none');
  opts.forEach((o, i) => {
    o.off = off(i);
    const [ox, oy] = o.off;
    board.polygon([[ox - .8, oy - .8], [ox + W + .8, oy - .8], [ox + W + .8, oy + H + .8], [ox - .8, oy + H + .8]], { fill: 'none', stroke: null, id: 'opt' + i, opt: i });
    mergeSteps(answerSteps(o.v, { hidden: !!item.hidden })).forEach((l, n) => board.line([l.a[0] + ox, l.a[1] + oy], [l.b[0] + ox, l.b[1] + oy], l.kind === 'hidden' ? 'fold' : 'visible', { id: `o${i}l${n}`, hit: false, dashed: l.kind === 'hidden' }));
    board.text([ox - 1.6, oy + H / 2], String.fromCharCode(65 + i), { id: 'tag' + i, color: '#e9e6df' });
  });
  board.fit();
  let chosen = -1;
  const setOpt = (i, fill) => board.update('opt' + i, { fill });
  function choose(i) {
    const o = opts[i];
    if (!o || o.out || chosen >= 0) return;
    if (o.ok) { chosen = i; setOpt(i, 'signal'); session.check(); return; }
    o.out = true;
    setOpt(i, 'none');
    board.items().filter(it => String(it.id).startsWith(`o${i}l`)).forEach(it => board.update(it.id, { style: it.dashed ? 'hidden' : 'guide' }));
    session.miss({ note: `Not ${String.fromCharCode(65 + i)}. That is the ${lower(viewName(item.view))} of a ${lower(DRAW_FORMS[o.key].name)}.` });
  }
  const offTap = onBoardTap(board, ev => { const h = board.hit(ev, { kinds: ['poly'], filter: it => it.opt !== undefined }); if (h) choose(h.item.opt); });

  frame.title(TITLES.which, item.name);
  frame.sub(item.hidden
    ? `Four blocks with the same outline from the front. The dashed lines show what is behind it. Only one drawing is the ${lower(viewName(item.view))} of this model. Tap the one you think it is.`
    : `Four buildings on the same footprint, so the outlines match. Only one drawing is the ${lower(viewName(item.view))} of this model. Tap the one you think it is.`);
  frame.tools([
    { id: 'look', label: 'Look', key: 'L', run: () => look(item.view) },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
    ...opts.map((_, i) => ({ id: 'c' + i, label: String.fromCharCode(65 + i), key: String.fromCharCode(65 + i), hidden: true, run: () => choose(i) })),
  ]);
  viewKeys();

  return {
    model, board, choose, fitBounds: { x0: -2.4, y0: off(3)[1] - .8, x1: W * 2 + 3.8, y1: H + .8 },
    _answer: () => opts.findIndex(o => o.ok),
    check: () => ({ ok: chosen >= 0 }),
    hint(n) {
      if (n === 1) return { text: item.hidden ? 'Turn the model and look behind the front wall. Where does a wall inside the block run back? Each one is a dashed line, at the same place across the drawing.' : 'Follow the roof slopes on the model. Wherever two of them meet there is a line in the top view, and a slope that runs down to an eave has no line across it.' };
      if (n === 2) {
        const o = opts.find(x => !x.ok && !x.out);
        if (o) { o.out = true; board.items().filter(it => String(it.id).startsWith(`o${opts.indexOf(o)}l`)).forEach(it => board.update(it.id, { style: it.dashed ? 'hidden' : 'guide' })); }
        return { text: 'One of the wrong drawings is greyed out for you.' };
      }
      const i = opts.findIndex(o => o.ok);
      return { text: 'It is this one.', culprits: [{ at: () => board.toClient([opts[i].off[0] + W / 2, opts[i].off[1] + H / 2]), r: 40 }] };
    },
    solved: () => finale(model, viewOf(solids, item.view).lines.filter(l => item.hidden || l.kind === 'seen').flatMap(l => l.parts3), item.view),
    dispose() { offTap(); board.dispose(); closeCard(); model.dispose(); },
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
  looking = false;
  frame.primaryEl.style.display = ['complete', 'draw', 'third'].includes(item.task) ? '' : 'none';
  task = item.task === 'error' ? errorTask(item) : item.task === 'which' ? whichTask(item) : drawingTask(item);
  // sized and framed once the texts have taken their room, so a phone keeps its padding small
  if (task.board) fitCard(task.board, { roomy: task.roomy });
  frameModel(task.model);
}

// generated sheets: bigger buildings and harder tasks as the difficulty grows
const POOL = {
  easy: ['step', 'ell', 'gable', 'shed', 'chamfer', 'wedge', 'stair3', 'corner', 'ell-prism', 'long-house'],
  mid: ['hip-roof', 'hip-house', 'house-shed', 'chimney-house', 'step-house', 'u-prism', 'tee-prism', 'saw-2', 'notched'],
  hard: ['cross-house', 'ell-house', 'tee-house', 'chapel', 'basilica', 'tower-house', 'mansard'],
};
function generate(rng, difficulty) {
  const d = difficulty;
  const pool = d <= 2 ? POOL.easy : d <= 5 ? [...POOL.easy, ...POOL.mid] : [...POOL.mid, ...POOL.hard];
  const tasks = d <= 2 ? ['complete', 'draw'] : d <= 5 ? ['draw', 'draw', 'error', 'third'] : ['draw', 'third', 'third', 'error'];
  const form = pick(rng, pool), t = pick(rng, tasks);
  const view = pick(rng, t === 'third' ? ['right', 'top'] : ['front', 'right', 'top']);
  const seed = Math.floor(rng() * 1e9).toString(36);
  const item = { id: 'g' + seed, task: t, form, view, seed, missing: 2 + Math.floor(d / 3), errors: 1 + Math.floor(d / 5), kinds: ['back', 'shift'] };
  if (t === 'third') item.given = view === 'top' ? ['front', 'right'] : ['front', 'top'];
  if (t === 'error' && !mistake(levelSheet(item).views[view], seededRng('error:' + item.id + ':' + seed), { kinds: item.kinds, n: item.errors })) { item.task = 'draw'; }
  const name = DRAW_FORMS[form].name;
  return { ...item, name, label: `${name} · ${VIEW_TAGS[view]} · ${TASK_TAGS[item.task]}`, par: parOf(item) };
}

const def = {
  id: 'drawing', prefix: 'A', name: 'Drawing Set',
  lead: 'How a building becomes a drawing.',
  sub: 'Elevations and top views are how architects put a building on paper. Look at a plaster model, draw what you see from one side, and learn to read a building from its drawings alone.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  dailyDifficulty: 5,
  // the star: see the view in your head, without turning the model or using Look
  master: { name: 'no turning', says: 'drew it without turning the model', still: true, applies: it => it.task !== 'third' },
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
// for tests and screenshots
window.__udp = { stage, session, get task() { return task; } };
