// Oblique: the other ways of showing a building. Pack A is anamorphosis: a
// figure painted across a scene so that it is whole from one direction only.
// The player turns the view (free, no steps) until the pieces close; the card
// shows the figure and fills as the view comes near. Close enough, the camera
// settles on the painted view and the sheet is solved.

import '../../src/ui/theme.js';
import * as THREE from 'three';
import { createStage } from '../../src/stage/stage.js';
import { createBoard } from '../../src/stage/board.js';
import { createLines } from '../../src/stage/lines.js';
import { createSolidView } from '../../src/stage/solids.js';
import { createFrame } from '../../src/ui/frame.js';
import { createRedlines } from '../../src/ui/redline.js';
import { createSession } from '../../src/ui/session.js';
import { wait } from '../../src/fx/tween.js';
import { sfx } from '../../src/fx/sfx.js';
import { PARTS } from '../../src/core/drawforms.js';
import { viewBasis, viewAngle, paintFigure, figureOf, outlineOf } from '../../src/core/anamorph.js';
import { triangulate } from '../../src/core/poly.js';
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
  levels: pk.levels.map(l => ({ ...l, label: `${l.name} · find the view`, par: l.par ?? 45, note: l.learn })),
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
// the game definition
// ------------------------------------------------------------------

let task = null;
function reset() { task?.dispose(); task = null; red.clear(); stage.clear(); }
function load(item) { reset(); task = findTask(item); }

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
