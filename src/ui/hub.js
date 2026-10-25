// The hub: nine games in three families, each with a small plaster model that
// turns slowly under the pointer, today's daily sheet and the streak.
//
// One WebGL renderer, off screen, draws every card's model and copies it into
// the card's own canvas, so nine models cost one context.

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
import { BUILD } from './fresh.js';
import { callout } from './titleblock.js';
import { loadProgress, loadSuite, today, currentStreak, dailyGame } from './progress.js';

export const GAMES = [
  { id: 'fold', prefix: 'F', family: 'Sheet', name: 'Fold & Punch', blurb: 'Fold a sheet, punch or cut it, and say where the holes land when it opens.', ready: true },
  { id: 'origamic', prefix: 'O', family: 'Sheet', name: 'Origamic', blurb: 'Cut and crease one sheet so that it stands up as a building when the card opens.', ready: true },
  { id: 'developments', prefix: 'D', family: 'Sheet', name: 'Developments', blurb: 'Cut solids open into flat nets, find the edges that glue together, and fold nets in your head.', ready: true },
  { id: 'drawing', prefix: 'A', family: 'Drawing', name: 'Drawing Set', blurb: 'Draw a building as it looks from the front, the side and above, and work out a building from its drawings.', ready: true },
  { id: 'oblique', prefix: 'V', family: 'Drawing', name: 'Oblique', blurb: 'Other ways of showing a building: find the one view a figure was painted for, and the moves that turn a block into a house.', ready: true },
  { id: 'sunstudy', prefix: 'L', family: 'Drawing', name: 'Sun Study', blurb: 'Move the sun and read the shadow: draw a shadow, find the hour a shadow plan shows, build to the neighbours’ sun, and let light into a room.', ready: true },
  { id: 'stack', prefix: 'S', family: 'Building', name: 'Stack', blurb: 'Stack housing on a site so every home is held up, gets daylight, keeps some open roof and has a way in.', ready: true },
  { id: 'roof', prefix: 'R', family: 'Building', name: 'Roof Plans', blurb: 'Grow roofs from footprints, read hips and valleys, and drain the rain.', ready: true },
  { id: 'buildorder', prefix: 'B', family: 'Building', name: 'Build Order', blurb: 'Take a building apart and put it back together under real gravity. Pull the wrong block and it comes down.', ready: true },
];
const FAMILIES = [
  { id: 'Sheet', note: 'paper: folds, cuts, nets' },
  { id: 'Drawing', note: 'ways of showing: views, light' },
  { id: 'Building', note: 'architecture: built and stacked' },
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
  // two walls at two depths: an anamorphic figure lives across them
  oblique: () => [box(0, 0, 0, 2.4, .3, 1.8), box(.6, 1.6, 0, 2.4, .3, 2.6)],
  // an obelisk and a low block: a sundial's shadow
  sunstudy: () => [box(0, 0, 0, .5, .5, 3), box(1.2, -.6, 0, 1.6, 1.6, .8)],
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
      <div><nav class="udp-brand"><span class="udp-long">Unnamed Drawing Project</span><span class="udp-sep udp-long">·</span><span>Index of sheets</span></nav>
        <h1 class="udp-hub-title">Nine drawings to think in.<b>Unnamed Drawing Project</b></h1>
        <p class="udp-hub-sub">Spatial puzzles for architects: nets, elevations, roofs, pop-ups, the order things are built in, the views a figure is painted for and the shadows the sun throws. Every sheet asks you to see a form before you touch it.</p></div>
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
    <footer class="udp-hub-foot"><span class="udp-k">Progress stays in this browser</span><span class="udp-k">Plaster, one light, one signal colour</span><span class="udp-k">Build ${esc(BUILD.split('-')[0])}</span></footer>
  </div>`;

  // ------------------------------------------------------------------
  // one renderer, drawn off screen and copied into each card's own canvas, so
  // a model scrolls with its card instead of being chased by a fixed layer
  // ------------------------------------------------------------------

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const cards = [...root.querySelectorAll('[data-model]')].map(el => {
    const cv = document.createElement('canvas');
    cv.className = 'udp-gcard-canvas';
    el.append(cv);
    return { el, cv, ctx: cv.getContext('2d'), id: el.dataset.model, ...cardScene(el.dataset.model), spin: 0, w: 0, h: 0 };
  });
  const dirty = new Set();
  let queued = false;
  const draw = () => {
    queued = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const todo = [...dirty]; dirty.clear();
    for (const c of todo) { c.w = c.el.clientWidth; c.h = c.el.clientHeight; }
    const live = todo.filter(c => c.w >= 2 && c.h >= 2);
    if (!live.length) return;
    // the renderer big enough for the largest card; each card uses its corner
    const MW = Math.max(...live.map(c => c.w)), MH = Math.max(...live.map(c => c.h));
    renderer.setPixelRatio(dpr);
    const have = renderer.getSize(new THREE.Vector2());
    if (have.x < MW || have.y < MH) renderer.setSize(Math.max(MW, have.x), Math.max(MH, have.y), false);
    const full = renderer.getSize(new THREE.Vector2());
    for (const c of live) {
      // the low sun throws shadows to the right: the window sits a little right
      // of the model, so model and shadow together are centred and uncut
      const aspect = c.w / c.h, R = c.radius * 1.12, sh = R * .28;
      const halfH = Math.max(R, (R + sh) / aspect);
      c.cam.left = -halfH * aspect + sh; c.cam.right = halfH * aspect + sh; c.cam.top = halfH; c.cam.bottom = -halfH;
      const yaw = c.yaw + c.spin;
      c.cam.position.set(Math.cos(c.pitch) * Math.cos(yaw), Math.cos(c.pitch) * Math.sin(yaw), Math.sin(c.pitch)).multiplyScalar(40);
      c.cam.position.z += c.radius * .45;
      c.cam.lookAt(0, 0, c.radius * .45);
      c.cam.updateProjectionMatrix();
      syncLines(c.scene, c.h / (2 * halfH));
      renderer.setViewport(0, 0, c.w, c.h);
      renderer.setScissor(0, 0, c.w, c.h);
      renderer.setScissorTest(true);
      renderer.clear();
      renderer.render(c.scene, c.cam);
      const pw = Math.round(c.w * dpr), ph = Math.round(c.h * dpr);
      if (c.cv.width !== pw || c.cv.height !== ph) { c.cv.width = pw; c.cv.height = ph; }
      c.ctx.clearRect(0, 0, pw, ph);
      c.ctx.drawImage(renderer.domElement, 0, Math.round(full.y * dpr) - ph, pw, ph, 0, 0, pw, ph);
    }
  };
  const queue = c => { for (const x of c ? [c] : cards) dirty.add(x); if (!queued) { queued = true; requestAnimationFrame(draw); } };
  window.addEventListener('resize', () => queue());
  new ResizeObserver(() => queue()).observe(root);
  document.fonts?.ready.then(() => queue());
  queue();

  // a slow half turn while the pointer rests on a card
  for (const c of cards) {
    const card = c.el.closest('.udp-gcard');
    let tw = null;
    const turn = to => {
      tw?.cancel();
      if (reducedMotion()) return;
      const from = c.spin;
      tw = animate({ duration: 1600, ease: ease.cubicInOut, update: v => { c.spin = from + (to - from) * v; queue(c); } });
    };
    card.addEventListener('pointerenter', () => turn(Math.PI / 4));
    card.addEventListener('pointerleave', () => turn(0));
  }
}
