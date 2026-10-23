// The hub: seven games in three families, each with a small plaster model that
// turns slowly under the pointer, today's daily sheet and the streak.
//
// One WebGL renderer draws every card's model into its own scissor rect on a
// fixed canvas behind the page, so seven models cost one context.

import * as THREE from 'three';
import { createSolidView } from '../stage/solids.js';
import { syncLines } from '../stage/lines.js';
import { MONOLIT } from '../stage/stage.js';
import { FORMS, blocks } from '../core/forms.js';
import { drawForm } from '../core/drawforms.js';
import { prism, hull, mapSolid } from '../core/poly.js';
import { opening, baseFace } from '../core/nettasks.js';
import { rotateAbout } from '../core/vec.js';
import { animate, ease, reducedMotion } from '../fx/tween.js';
import { esc } from './frame.js';
import { callout } from './titleblock.js';
import { loadProgress, loadSuite, today, currentStreak, dailyGame } from './progress.js';

export const GAMES = [
  { id: 'fold', prefix: 'F', family: 'Sheet', name: 'Fold & Punch', blurb: 'Fold a sheet, punch or cut it, and say where the holes land when it opens.', ready: true },
  { id: 'origamic', prefix: 'O', family: 'Sheet', name: 'Origamic', blurb: 'Cut and crease one sheet so that it stands up as a building when the card opens.', ready: true },
  { id: 'developments', prefix: 'D', family: 'Solid', name: 'Developments', blurb: 'Cut solids open into flat nets, find the edges that glue together, and fold nets in your head.', ready: true },
  { id: 'stack', prefix: 'S', family: 'Solid', name: 'Stack', blurb: 'Stack housing on a site so every home is held up, gets daylight, keeps some open roof and has a way in.', ready: true },
  { id: 'drawing', prefix: 'A', family: 'Building', name: 'Drawing Set', blurb: 'Draw a building as it looks from the front, the side and above, and work out a building from its drawings.', ready: true },
  { id: 'roof', prefix: 'R', family: 'Building', name: 'Roof Plans', blurb: 'Grow roofs from footprints, read hips and valleys, and drain the rain.', ready: true },
  { id: 'buildorder', prefix: 'B', family: 'Building', name: 'Build Order', blurb: 'Take a building apart and put it back together under real gravity. Pull the wrong block and it comes down.', ready: true },
];
const FAMILIES = [
  { id: 'Sheet', note: 'paper: folds, cuts, creases' },
  { id: 'Solid', note: 'volumes: nets, views, blocks' },
  { id: 'Building', note: 'architecture: drawn and built' },
];

// ------------------------------------------------------------------
// the models
// ------------------------------------------------------------------

const box = (x, y, z, w, d, h) => hull([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
const thin = .04;

const MODELS = {
  // a sheet folded in half on its diagonal, the top half lifting
  fold: () => {
    const sheet = prism([[0, 0], [2.4, 0], [0, 2.4]], thin);
    const flap = mapSolid(prism([[2.4, 0], [2.4, 2.4], [0, 2.4]], thin), p => rotateAbout(p, [2.4, 0, thin], [-Math.SQRT1_2, Math.SQRT1_2, 0], -1.75));
    return [sheet, flap];
  },
  // a pop-up card open at ninety degrees, a stepped block standing out of the fold
  origamic: () => [
    box(0, 0, 0, 3, 2, thin), box(0, 2, 0, 3, thin, 2),
    box(.6, 1, 0, .8, 1, 1.1), box(1.6, 1.4, 0, .8, .6, 1.6),
  ],
  // a gable house with its roof slopes and its front gable swung open
  developments: () => {
    const s = FORMS.gable.make();
    const kind = f => { const n = s.faces[f].n; return n[2] > .3 ? 'roof' : n[1] < -.9 ? 'front' : n[1] > .9 ? 'back' : n[2] < -.9 ? 'base' : 'wall'; };
    const cuts = s.edges.filter(e => {
      const k = e.f.map(kind).sort().join(' ');
      return k === 'roof roof' || k === 'back roof' || k === 'front roof' || k === 'front wall';
    }).map(e => e.id);
    return [{ solid: s, polys: opening(s, cuts, baseFace(s)).pose(.5) }];
  },
  stack: () => [blocks([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [0, 0, 2], [2, 1, 0]])],
  roof: () => [FORMS['hip-house'].make()],
  // a house with a cross gable, the way the first drawings see it
  drawing: () => drawForm('cross-house'),
  // a two-storey frame: columns, slabs and a stair core
  buildorder: () => {
    const out = [box(0, 0, 0, 3, 2, .12), box(0, 0, 1.2, 3, 2, .12), box(0, 0, 2.4, 3, 2, .12)];
    for (const [x, y] of [[0, 0], [2.8, 0], [0, 1.8], [2.8, 1.8]]) out.push(box(x, y, .12, .2, .2, 1.08), box(x, y, 1.32, .2, .2, 1.08));
    return out;
  },
};

function cardScene(id) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const views = [];
  for (const m of MODELS[id]()) {
    const solid = m.solid || m;
    const v = createSolidView(solid);
    if (m.polys) v.setFacePolys(m.polys);
    group.add(v.group);
    views.push(v);
  }
  // centre on the ground
  const b = new THREE.Box3().setFromObject(group);
  const c = b.getCenter(new THREE.Vector3());
  group.position.set(-c.x, -c.y, -b.min.z);
  const radius = b.getSize(new THREE.Vector3()).length() / 2;

  scene.add(new THREE.HemisphereLight(MONOLIT.hemiSky, MONOLIT.hemiGround, MONOLIT.hemiIntensity));
  const sun = new THREE.DirectionalLight(MONOLIT.sunColor, MONOLIT.sunIntensity);
  const d = new THREE.Vector3(...MONOLIT.sunDir).normalize();
  sun.position.copy(d).multiplyScalar(radius * 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -.0012; sun.shadow.normalBias = .06;
  const sc = sun.shadow.camera;
  sc.left = -radius * 1.8; sc.right = radius * 1.8; sc.top = radius * 1.8; sc.bottom = -radius * 1.8; sc.near = .1; sc.far = radius * 10;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .42 }));
  ground.position.z = -.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 200);
  cam.up.set(0, 0, 1);
  return { scene, group, cam, radius, yaw: -112.5 * Math.PI / 180, pitch: 26 * Math.PI / 180, views };
}

// ------------------------------------------------------------------
// the page
// ------------------------------------------------------------------

export function createHub(root) {
  const date = today();
  const suite = loadSuite();
  const ready = GAMES.filter(g => g.ready);
  const daily = dailyGame(date, ready.map(g => g.id));
  const dailyDone = !!suite.daily[date + ':' + daily];
  const streak = currentStreak(suite, date);

  const stateOf = g => {
    if (!g.ready) return '<span>In preparation</span>';
    const p = loadProgress(g.id);
    const ids = Object.keys(p.levels);
    const solvedN = ids.filter(id => p.levels[id].marks[0]).length;
    const marks = ids.reduce((n, id) => n + p.levels[id].marks.filter(Boolean).length, 0);
    return solvedN ? `<span><em>${solvedN}</em> sheets drawn</span><span><em>${marks}</em> marks</span>${p.challenge.best ? `<span>Run best <em>${p.challenge.best}</em></span>` : ''}`
      : '<span class="is-signal">Start here</span>';
  };

  root.innerHTML = `<div class="udp-hub">
    <div class="udp-hub-top">
      <div><nav class="udp-brand"><span class="udp-long">Unnamed Drawing Project</span><span class="udp-sep">·</span><span>Index of sheets</span></nav>
        <h1 class="udp-hub-title">Seven drawings to think in.<b>Unnamed Drawing Project</b></h1>
        <p class="udp-hub-sub">Spatial puzzles for architects: nets, elevations, roofs, pop-ups and the order things are built in. Every sheet asks you to see a form before you touch it.</p></div>
      <a class="udp-hub-daily" href="games/${daily}/index.html#daily=${date}">
        <span>Daily sheet · ${date}</span>
        <div class="udp-big" style="text-transform:none">${dailyDone ? 'Drawn' : GAMES.find(g => g.id === daily).name}</div>
        <span>${dailyDone ? 'Come back tomorrow' : 'Open today’s sheet'} · streak <em style="font-style:normal;color:var(--ink)">${streak}</em></span>
      </a>
    </div>
    <div class="udp-families">${FAMILIES.map(f => `<section class="udp-family"><span class="udp-k"><span>${f.id}</span><span>${f.note}</span></span>
      ${GAMES.filter(g => g.family === f.id).map(g => `<a class="udp-gcard${g.ready ? '' : ' is-prep'}" data-game="${g.id}" ${g.ready ? `href="games/${g.id}/index.html"` : 'aria-disabled="true"'}>
        <div class="udp-gcard-model" data-model="${g.id}"></div>
        <div class="udp-gcard-head">${callout(g.prefix, g.ready ? '01' : '··', { size: 44, dim: !g.ready })}<div><div class="udp-gcard-name">${esc(g.name)}</div><p class="udp-gcard-blurb">${esc(g.blurb)}</p></div></div>
        <div class="udp-gcard-state">${stateOf(g)}</div>
      </a>`).join('')}</section>`).join('')}</div>
    <footer class="udp-hub-foot"><span class="udp-k">Progress stays in this browser</span><span class="udp-k">Plaster, one light, one signal colour</span></footer>
  </div>`;

  // ------------------------------------------------------------------
  // one renderer, a scissor rect per card
  // ------------------------------------------------------------------

  const canvas = document.createElement('canvas');
  canvas.className = 'udp-hub-canvas';
  document.body.prepend(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;

  const cards = [...root.querySelectorAll('[data-model]')].map(el => ({ el, id: el.dataset.model, ...cardScene(el.dataset.model), spin: 0 }));
  let queued = false;
  const draw = () => {
    queued = false;
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setSize(W, H, false);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const c of cards) {
      const r = c.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width < 2) continue;
      const aspect = r.width / r.height, R = c.radius * 1.12;
      const halfH = Math.max(R, R / aspect);
      c.cam.left = -halfH * aspect; c.cam.right = halfH * aspect; c.cam.top = halfH; c.cam.bottom = -halfH;
      const yaw = c.yaw + c.spin;
      c.cam.position.set(Math.cos(c.pitch) * Math.cos(yaw), Math.cos(c.pitch) * Math.sin(yaw), Math.sin(c.pitch)).multiplyScalar(40);
      c.cam.position.z += c.radius * .45;
      c.cam.lookAt(0, 0, c.radius * .45);
      c.cam.updateProjectionMatrix();
      syncLines(c.scene, r.height / (2 * halfH));
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.render(c.scene, c.cam);
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  new ResizeObserver(queue).observe(root);
  document.fonts?.ready.then(queue);
  queue();

  // a slow half turn while the pointer rests on a card
  for (const c of cards) {
    const card = c.el.closest('.udp-gcard');
    let tw = null;
    const turn = to => {
      tw?.cancel();
      if (reducedMotion()) return;
      const from = c.spin;
      tw = animate({ duration: 1600, ease: ease.cubicInOut, update: v => { c.spin = from + (to - from) * v; queue(); } });
    };
    card.addEventListener('pointerenter', () => turn(Math.PI / 4));
    card.addEventListener('pointerleave', () => turn(0));
  }
}
