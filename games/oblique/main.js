// Oblique: the other ways of showing a building.
//
//   find    Pack A, anamorphosis: a figure painted across a scene so that it is
//           whole from one direction only. The player turns the view (free, no
//           steps) until the pieces close; the card shows the figure and fills
//           as the view comes near. Close enough, the camera settles on it.
//   moves   Pack B, House IV: the card draws a building in axonometric; the
//           player picks moves, in order, that turn a block into it. Each move
//           plays out on the model, and a solved sheet ends with the whole
//           series drawn in a row, the way Eisenman drew House IV.

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
import { viewBasis, viewAngle, paintFigure, figureOf, outlineOf } from '../../src/core/anamorph.js';
import { mapSolid } from '../../src/core/poly.js';
import { applyMove, run, sameForm, boxCells, boundsOf, cellSolid, axonSquares } from '../../src/core/houseiv.js';
import './oblique.css';
import { seededRng, pick } from '../../src/core/rand.js';
import { PACKS } from './levels.js';

const D2R = Math.PI / 180;
const stage = createStage(document.getElementById('stage'), { camera: { free: true, minPitch: 6 * D2R, maxPitch: 80 * D2R } });
const frame = createFrame({ game: 'oblique', name: 'Oblique', stage });
const red = createRedlines(stage);
frame.stack(true);

// close enough to count, and the angle at which the card starts to fill
const LOCK = 3 * D2R, WARM = 40 * D2R;
const SIGNAL = '#ff5a1f';

const packs = PACKS.map(pk => ({
  ...pk,
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · ${l.task === 'find' ? 'find the view' : 'moves'}`, par: l.par ?? (l.task === 'find' ? 45 : 30 + l.slots * 20 + l.hand.length * 5), note: l.learn })),
}));

// ------------------------------------------------------------------
// the scene: plaster parts, and the paint on them
// ------------------------------------------------------------------

const facesOf = s => s.faces.map(f => ({ pts: f.loop.map(i => s.verts[i]), n: f.n }));
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

function buildScene(parts) {
  const solids = parts.map(([kind, ...a]) => PARTS[kind](...a));
  const group = new THREE.Group();
  const views = solids.map(s => createSolidView(s, { invalidate: stage.invalidate }));
  for (const v of views) group.add(v.group);
  const box = new THREE.Box3();
  for (const s of solids) for (const p of s.verts) box.expandByPoint(new THREE.Vector3(...p));
  stage.content.add(group);
  return { solids, group, views, box, dispose() { views.forEach(v => v.dispose()); group.removeFromParent(); } };
}

// the figure's pieces as one painted mesh, a hair off each face
function paintMesh(pieces, faces) {
  const pos = [], idx = [];
  for (const { face, pts3 } of pieces) {
    const n = faces[face].n, base = pos.length / 3;
    for (const p of pts3) pos.push(p[0] + n[0] * .004, p[1] + n[1] * .004, p[2] + n[2] * .004);
    for (let i = 1; i + 1 < pts3.length; i++) idx.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // paint takes the light like the plaster, with enough of its own glow to read in shadow
  const m = new THREE.MeshStandardMaterial({ color: SIGNAL, emissive: SIGNAL, emissiveIntensity: .38, roughness: .85, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.userData.noFrame = true;
  return mesh;
}

// ------------------------------------------------------------------
// the card: the figure as it should look, filling as the view comes near
// ------------------------------------------------------------------

let card = null;
function openCard(title, note) {
  const body = frame.card(true, title, note);
  document.querySelector('.udp-card').classList.add('is-plan');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  body.append(holder);
  card = createBoard(holder, { unit: 1, sub: 1, grid: 'none', padding: 18 });
  frame.layout();
  return card;
}
function closeCard() {
  card?.dispose(); card = null;
  const body = document.querySelector('.udp-card.is-plan .udp-card-body');
  if (body) body.style.height = '';
  frame.card(false);
  document.querySelector('.udp-card')?.classList.remove('is-plan');
}

// ------------------------------------------------------------------
// task: find the view
// ------------------------------------------------------------------

function findTask(item) {
  const scene = buildScene(item.parts);
  const c = scene.box.getCenter(new THREE.Vector3());
  const pivot = [c.x, c.y, scene.box.max.z * .45];
  const goal = viewBasis(item.view[0] * D2R, item.view[1] * D2R);
  const figure = figureOf(item.figure);
  const ground = { pts: [[c.x - 30, c.y - 30, 0], [c.x + 30, c.y - 30, 0], [c.x + 30, c.y + 30, 0], [c.x - 30, c.y + 30, 0]], n: [0, 0, 1] };
  const faces = [ground, ...scene.solids.flatMap(facesOf)];
  const paint = paintMesh(paintFigure(faces, figure, goal, pivot), faces);
  scene.group.add(paint);

  // the view starts away from the painted one, framed so any turn keeps it on screen
  stage.rig.setView(item.start[0] * D2R, item.start[1] * D2R, false);
  const reach = scene.box.clone().expandByVector(new THREE.Vector3(.6, .6, .3));
  const r = Math.max(reach.max.x - reach.min.x, reach.max.y - reach.min.y) / 2;
  const sphere = new THREE.Box3(new THREE.Vector3(c.x - r, c.y - r, 0), new THREE.Vector3(c.x + r, c.y + r, reach.max.z));
  stage.frame(sphere, { padding: 20 });

  // the card: the figure in outline, and a fill that grows as the view comes near
  const board = openCard('The figure', 'as it was painted');
  figure.forEach((p, i) => board.polygon(p, { id: 'o' + i, fill: 'none', stroke: null, hit: false }));
  outlineOf(item.figure).forEach((p, i) => board.polygon(p, { id: 'ol' + i, fill: 'none', stroke: 'visible', hit: false }));
  board.fit();
  frame.fitSheet(board, { lo: .12, hi: .17 });
  let warmth = -1;
  function show(k) {
    const step = Math.round(k * 20) / 20;
    if (step === warmth) return;
    warmth = step;
    figure.forEach((p, i) => board.update('o' + i, { fill: step >= 1 ? SIGNAL : `rgba(255, 90, 31, ${(step * .55).toFixed(3)})` }));
  }

  let done = false, locking = false, raf = 0, hintArrow = null;
  const angle = () => viewAngle(viewBasis(stage.rig.yaw, stage.rig.pitch), goal);
  function watch() {
    raf = requestAnimationFrame(watch);
    if (done) return;
    const a = angle();
    show(Math.max(0, Math.min(1, 1 - (a - LOCK) / (WARM - LOCK))));
    if (a < LOCK && !locking && !stage.rig.busy) lock();
  }
  async function lock() {
    locking = true;
    await stage.rig.setView(goal.yaw, goal.pitch);
    done = true;
    show(1);
    sfx.thud?.();
    session.check();
  }
  raf = requestAnimationFrame(watch);

  frame.title('Can you find the view?', item.name);
  frame.sub(`A ${item.figure.kind === 'disc' ? 'disc' : 'figure'} is painted across this scene so that it is whole from one direction only. Drag to turn the view, up and down as well as round, until the pieces close into the figure on the card.`);
  frame.tools([
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primaryEl.style.display = 'none';

  return {
    check: () => done || angle() < LOCK ? { ok: true } : { ok: false, note: 'Not yet: the pieces still don’t meet.' },
    hint(n) {
      if (n === 1) {
        const dy = wrapPi(goal.yaw - stage.rig.yaw), dp = goal.pitch - stage.rig.pitch;
        const turn = Math.abs(dy) < 6 * D2R ? '' : dy > 0 ? 'drag to the left' : 'drag to the right';
        const tilt = Math.abs(dp) < 5 * D2R ? '' : dp > 0 ? 'look from higher up' : 'look from lower down';
        return { text: `Getting there: ${[turn, tilt].filter(Boolean).join(', and ') || 'you are close, make small moves'}.` };
      }
      if (n === 2) {
        // the painter's line of sight, as an arrow into the scene
        const p0 = pivot, from = p0.map((x, i) => x - goal.d[i] * 6), to = p0.map((x, i) => x - goal.d[i] * 2.2);
        hintArrow = createLines([[from, to]], 'signal', { on: 'model', renderOrder: 6 });
        scene.group.add(hintArrow);
        stage.invalidate();
        return { text: 'The orange line is the painter’s line of sight. Turn until you look straight down it.' };
      }
      session.peek();
      stage.rig.setView(goal.yaw, goal.pitch);
      return { text: 'This is the view the figure was painted for.' };
    },
    async solved() {
      await wait(900, { essential: true });
      // a last look from elsewhere: the figure falls apart again
      await stage.rig.setView(goal.yaw - 35 * D2R, goal.pitch + 8 * D2R);
      await wait(600, { essential: true });
      await stage.rig.setView(goal.yaw, goal.pitch);
    },
    dispose() { cancelAnimationFrame(raf); hintArrow?.dispose(); paint.geometry.dispose(); paint.material.dispose(); scene.dispose(); closeCard(); frame.primaryEl.style.display = ''; },
  };
}

// ------------------------------------------------------------------
// task: the moves (House IV)
// ------------------------------------------------------------------

const AXON = { yaw: -112.5 * D2R, pitch: 28 * D2R };
const TONES = { top: '#e9e6df', left: '#aaa59c', right: '#78746d' };

// an axonometric of cells on a board, at offset [ox, oy] on the sheet
function drawAxon(board, cells, prefix, [ox, oy] = [0, 0], { ghost = false } = {}) {
  const v = viewBasis(AXON.yaw, AXON.pitch);
  const P = p => [ox + p[0] * v.right[0] + p[1] * v.right[1] + p[2] * v.right[2], oy + p[0] * v.up[0] + p[1] * v.up[1] + p[2] * v.up[2]];
  axonSquares(cells, v.d).forEach((sq, i) => {
    const fill = sq.n[2] > 0 ? TONES.top : (sq.n[0] * v.right[0] + sq.n[1] * v.right[1] < 0 ? TONES.left : TONES.right);
    board.polygon(sq.pts.map(P), { id: prefix + i, fill: ghost ? 'none' : fill, stroke: ghost ? 'guide' : 'visible', stacked: !ghost, hit: false });
  });
}

// a unit cell as a plaster block, centred on its own origin so it can turn
const cellBlock = () => mapSolid(cellSolid([[0, 0, 0]]), ([x, y, z]) => [x - .5, y - .5, z - .5]);

function movesTask(item) {
  stage.rig.free = false;
  const start = boxCells(item.start);
  const goal = run(start, item.answer.map(i => item.hand[i]));
  let cells = start;
  const played = [];                    // hand indices, in order
  const history = [start];              // the form before each move, and after the last
  let busy = false, done = false;

  // the model: one merged solid at rest
  let rest = null;
  function showRest() {
    rest?.dispose(); rest = null;
    if (!cells.length) return;
    rest = createSolidView(cellSolid(cells), { invalidate: stage.invalidate });
    stage.content.add(rest.group);
    stage.invalidate();
  }
  showRest();
  const frameAll = () => {
    const b = boundsOf([...start, ...goal]);
    stage.frame(new THREE.Box3(new THREE.Vector3(b.lo[0] - 1, b.lo[1] - 1, 0), new THREE.Vector3(b.hi[0] + 2, b.hi[1] + 2, b.hi[2] + 1.5)), { padding: 24 });
  };
  stage.rig.setView(AXON.yaw, AXON.pitch, false);
  frameAll();

  // one move, played out cell by cell
  async function play(m) {
    const r = applyMove(cells, m);
    const blocks = [];
    const put = (from, to, { fade = false } = {}) => {
      const v = createSolidView(cellBlock(), { invalidate: stage.invalidate });
      v.group.position.set(from[0] + .5, from[1] + .5, from[2] + .5);
      stage.content.add(v.group);
      blocks.push({ v, from, to, fade });
    };
    for (const mv of r.moves) put(mv.from, mv.to);
    for (const b of r.born) put(b.from, b.to);
    for (const g of r.gone) put(g, [g[0], g[1], g[2] - 1.2], { fade: true });
    rest?.dispose(); rest = null;
    // a turn swings round the old footprint's centre, then settles where the move puts it
    const { lo, hi } = boundsOf(cells);
    const C = [(lo[0] + hi[0] + 1) / 2, (lo[1] + hi[1] + 1) / 2];
    const ang = (r.turn || 0) * Math.PI / 2;
    const swing = (p, a) => { const x = p[0] + .5 - C[0], y = p[1] + .5 - C[1]; return [C[0] + x * Math.cos(a) - y * Math.sin(a) - .5, C[1] + x * Math.sin(a) + y * Math.cos(a) - .5, p[2]]; };
    sfx.slide();
    await animate({ duration: r.turn ? 900 : 620, ease: ease.cubicInOut, essential: true, update: t => {
      for (const b of blocks) {
        let p;
        if (r.turn) {
          const k = Math.min(1, t * 1.25), sw = swing(b.from, ang * k), end = swing(b.from, ang);
          const u = Math.max(0, (t - .8) / .2);
          p = [sw[0] + (b.to[0] - end[0]) * u, sw[1] + (b.to[1] - end[1]) * u, sw[2]];
          b.v.group.rotation.z = ang * k;
        } else p = b.from.map((x, i) => x + (b.to[i] - x) * t);
        b.v.group.position.set(p[0] + .5, p[1] + .5, p[2] + .5);
        if (b.fade) b.v.group.scale.setScalar(Math.max(.001, 1 - t));
      }
      stage.invalidate();
    } }).promise;
    for (const b of blocks) b.v.dispose();
    cells = r.cells;
    showRest();
    sfx.thud?.();
  }

  // the card: the goal drawn, the moves played so far, and the hand
  const body = frame.card(true, 'The building', 'drawn in axonometric');
  const cardEl = document.querySelector('.udp-card');
  cardEl.classList.add('is-plan', 'ob-moves');
  body.replaceChildren();
  const holder = document.createElement('div');
  holder.className = 'rf-board';
  const hand = document.createElement('div');
  hand.className = 'ob-hand';
  body.append(holder, hand);
  card = createBoard(holder, { unit: 1, sub: 1, grid: 'none', padding: 14 });
  drawAxon(card, goal, 'g');
  card.fit();
  frame.layout();

  function render() {
    const slots = Array.from({ length: item.slots }, (_, i) => {
      const m = played[i] !== undefined ? item.hand[played[i]] : null;
      return `<span class="ob-slot${m ? ' is-full' : ''}"><b>${i + 1}</b>${m ? m.label : '·'}</span>`;
    }).join('');
    hand.innerHTML = `<div class="ob-slots">${slots}</div><div class="ob-cards">${item.hand.map((m, i) =>
      `<button type="button" class="ob-move${played.includes(i) ? ' is-used' : ''}" data-i="${i}"${played.includes(i) || busy || done || played.length >= item.slots ? ' disabled' : ''}>${m.label}</button>`).join('')}</div>`;
    frame.tool('undo', { off: !played.length || busy || done });
    frame.sub(`Pick the moves that turn the block into the building on the card, in order. ${item.slots === 1 ? 'One move does it.' : `It takes ${item.slots} moves.`}${item.hand.length > item.slots ? ' Not every move on offer is needed.' : ''} Undo takes the last one back.`);
  }
  hand.addEventListener('click', async ev => {
    const b = ev.target.closest('.ob-move');
    if (!b || b.disabled || busy || done) return;
    const i = +b.dataset.i;
    busy = true; played.push(i); render();
    try { await play(item.hand[i]); } finally { history.push(cells); busy = false; render(); }
    if (sameForm(cells, goal)) { done = true; render(); session.check(); }
    else if (played.length >= item.slots) session.miss({ note: item.ordered ? 'Not this building yet. Try the same moves in another order: undo and play them again.' : 'Not this building yet. Undo a move and try another.' });
  });
  async function undo() {
    if (!played.length || busy || done) return;
    played.pop(); history.pop();
    cells = history[history.length - 1];
    sfx.tick(); showRest(); render();
  }
  frame.title('Can you build it?', item.name);
  frame.tools([
    { id: 'undo', label: 'Undo', key: 'Z', keys: ['Ctrl+Z'], run: undo },
    { id: 'hint', label: 'Hint', key: 'H', run: () => session.hint() },
  ]);
  frame.primaryEl.style.display = 'none';
  render();
  frame.fitSheet(card, { lo: .3, hi: .42 });

  return {
    check: () => sameForm(cells, goal) ? { ok: true } : { ok: false, note: 'Not this building yet.' },
    hint(n) {
      const first = item.hand[item.answer[0]].label;
      if (n === 1) return { text: item.slots === 1 ? 'Look at the drawing for the part of the block that is missing or has moved.' : `Start with: ${first.toLowerCase()}.` };
      if (n === 2) return { text: item.slots === 1 ? `It is: ${first.toLowerCase()}.` : `In order: ${item.answer.map(i => item.hand[i].label.toLowerCase()).join(', then ')}.` };
      return null;
    },
    async solved() {
      // the series, drawn in a row: the block, and the form after every move
      card.clear();
      let x = 0;
      history.forEach((cs, i) => {
        const b = boundsOf(cs);
        drawAxon(card, cs, 's' + i + '_', [x, 0]);
        card.text([x + 1, -2.2], i === 0 ? 'block' : String(i), { id: 'n' + i });
        x += (b.hi[0] - b.lo[0] + b.hi[1] - b.lo[1] + 2) * 1.05 + 1.2;
      });
      card.fit();
      frame.cardNote('your series');
      await wait(2600, { essential: true });
    },
    dispose() { rest?.dispose(); card?.dispose(); card = null; body.style.height = ''; cardEl.classList.remove('is-plan', 'ob-moves'); frame.card(false); frame.primaryEl.style.display = ''; stage.rig.free = true; },
  };
}

// ------------------------------------------------------------------
// the game definition
// ------------------------------------------------------------------

let task = null;
function reset() { task?.dispose(); task = null; red.clear(); stage.clear(); }
function load(item) { reset(); stage.rig.free = item.task === 'find'; task = item.task === 'moves' ? movesTask(item) : findTask(item); }

// generated: a few blocks and a figure, painted for a random view
function generate(rng, d) {
  const n = 2 + Math.min(4, Math.floor(d / 2));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rng() * 6), y = Math.floor(rng() * 6), w = 1 + Math.floor(rng() * 2), dd = 1 + Math.floor(rng() * 2);
    parts.push(rng() < .5 ? ['box', x, y, 0, w, dd, 1 + Math.floor(rng() * 3)] : ['gableX', x, y, w + 1, 2, 1 + Math.floor(rng() * 2) * .5, 2.5]);
  }
  const kind = pick(rng, d <= 2 ? ['disc', 'square'] : ['disc', 'ring', 'frame', 'triangle', 'cross', 'target']);
  const view = [-180 + rng() * 180, 15 + rng() * (d >= 5 ? 50 : 25)];
  const start = [view[0] + (rng() < .5 ? -1 : 1) * (40 + rng() * 50), 20 + rng() * 20];
  const seed = Math.floor(rng() * 1e9).toString(36);
  return { id: 'g' + seed, seed, task: 'find', name: 'Generated scene', parts, figure: { kind, size: 1.8 }, view, start, label: 'Generated scene · find the view', par: 45 + d * 5 };
}

const def = {
  id: 'oblique', prefix: 'V', name: 'Oblique',
  lead: 'Other ways of showing a building.',
  sub: 'Axonometrics, anamorphosis, collage, sequences: the ways architects draw beyond plan, section and elevation. Each pack is one of them, and something to do with your hands.',
  packs,
  load,
  check: () => task.check(),
  hint: n => task.hint(n),
  onSolved: () => task.solved?.(),
  generate,
  modes: ['challenge', 'daily'],
  dailyDifficulty: 4,
};

const session = createSession({ def, frame, stage, redlines: red });
session.start();
window.__udp = { stage, session, get task() { return task; } };
