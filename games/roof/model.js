// The roof in 3D: plaster walls, the roof surface over them, its creases in
// the plan's line types, and rain that runs off it.
//
// Sheet points (roof.js: x right, y down, S units per module) map to the world
// one module to one unit, y flipped, centred on `centre`. The roof's height is
// scaled by k (rise per module of run): k = 0 is a flat lid at the eaves, which
// is how a roof waits to rise in Construct the plan.
//
//   const m = createRoofModel(roof, { pitch: .75 });  stage.content.add(m.group);
//   m.setK(0);  m.overlay('hover', [[a, b]], 'hover');  m.creaseStyle('kind');
//   const rain = createRain(m);  rain.start();  rain.stop();

import * as THREE from 'three';
import { plasterMaterial } from '../../src/stage/stage.js';
import { createLines, defineLineStyle } from '../../src/stage/lines.js';
import { S } from '../../src/core/roof.js';
import { stepKey, stepsOf, mergeSteps } from '../../src/core/lattice.js';
import { descent } from '../../src/core/rooftasks.js';
import { every } from '../../src/fx/tween.js';

// the roof plan's line types: ridge solid, hip dashed, valley dash-dot
defineLineStyle('ridge', { width: 1.7, tone: 'strong' });
defineLineStyle('signalMountain', { width: 1.6, dash: [10, 3, 1.5, 3], tone: 'signal' });
export const KIND_STYLE = { ridge: 'ridge', hip: 'fold', valley: 'mountain' };
export const KIND_SIGNAL = { ridge: 'signal', hip: 'signalFold', valley: 'signalMountain' };

export const WALL_H = .9;

/**
 * createRoofModel(roof, opts)
 *   pitch (.75)   rise per module of run when fully up
 *   rise (1)      0..1 of the pitch to start at
 *   centre        sheet point at the world origin (default: the roof's middle)
 *   creases       'kind' (line types), 'plain' (all alike: Name the lines) or 'none'
 */
export function createRoofModel(roof, opts = {}) {
  const wallH = opts.wallH ?? WALL_H;
  let pitch = opts.pitch ?? .75;
  let k = pitch * (opts.rise ?? 1);
  const [cx, cy] = opts.centre || [roof.at[0] + roof.w * S / 2, roof.at[1] + roof.h * S / 2];
  const group = new THREE.Group();
  group.name = 'roof';

  const world = (x, y, h) => [(x - cx) / S, -(y - cy) / S, wallH + h / S * k];
  const onRoof = (x, y, lift = 0) => { const p = world(x, y, roof.height(x, y)); p[2] += lift; return p; };

  // ------------------------------------------------------------------
  // the roof surface
  // ------------------------------------------------------------------

  const tris = roof.tris;
  const rpos = new Float32Array(tris.length * 9);
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const roofMesh = new THREE.Mesh(rgeo, plasterMaterial());
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  roofMesh.name = 'roof-surface';

  function fillRoof() {
    let i = 0;
    for (const t of tris) {
      const P = t.pts.map(p => world(p[0], p[1], p[2]));
      const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1];
      const order = ux * vy - uy * vx >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const j of order) { rpos[i++] = P[j][0]; rpos[i++] = P[j][1]; rpos[i++] = P[j][2]; }
    }
    rgeo.attributes.position.needsUpdate = true;
    rgeo.computeVertexNormals();
    rgeo.computeBoundingBox(); rgeo.computeBoundingSphere();
  }

  // ------------------------------------------------------------------
  // walls: one quad per eave step, faces outward
  // ------------------------------------------------------------------

  const wpos = [];
  for (const [a, b] of roof.eaves) {
    const A = world(a[0], a[1], 0), B = world(b[0], b[1], 0);
    const q = [[A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], wallH], [A[0], A[1], wallH]];
    for (const j of [0, 1, 2, 0, 2, 3]) wpos.push(...q[j]);
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wgeo.computeVertexNormals();
  const wallMesh = new THREE.Mesh(wgeo, plasterMaterial());
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  wallMesh.name = 'walls';
  group.add(wallMesh, roofMesh);

  // ------------------------------------------------------------------
  // lines: eaves, wall corners, ground line, creases
  // ------------------------------------------------------------------

  const eaveLines = mergeSteps(new Map(roof.eaves.map(([a, b]) => [stepKey(a, b), 'e'])));
  const corners = [...roof.corners.convex, ...roof.corners.reflex];
  const outline = createLines([], 'visible', { on: 'model' });
  const creases = { ridge: createLines([], 'ridge'), hip: createLines([], 'fold'), valley: createLines([], 'mountain') };
  group.add(outline, ...Object.values(creases));
  let creaseMode = opts.creases || 'kind';

  function fillLines() {
    const segs = [];
    for (const l of eaveLines) {
      const a = world(l.a[0], l.a[1], 0), b = world(l.b[0], l.b[1], 0);
      segs.push([a, b], [[a[0], a[1], 0], [b[0], b[1], 0]]);
    }
    for (const c of corners) { const p = world(c[0], c[1], 0); segs.push([[p[0], p[1], 0], [p[0], p[1], wallH]]); }
    outline.setSegments(segs);
    for (const kind in creases) {
      const on = creaseMode !== 'none' && k > 1e-3;
      creases[kind].setSegments(on ? roof.lines.filter(l => l.kind === kind).map(l => [onRoof(...l.a, .004), onRoof(...l.b, .004)]) : []);
      creases[kind].setStyle(creaseMode === 'plain' ? 'visible' : KIND_STYLE[kind]);
    }
  }

  // ------------------------------------------------------------------
  // overlays: sheet segments laid on the roof (hover, drawn lines, marks)
  // ------------------------------------------------------------------

  const overlays = new Map();                       // name -> { lines, segs }
  // a sheet line as world segments, one per lattice step, so it follows the roof
  const drape = (a, b) => stepsOf(a, b).map(s => { const [p, q] = s.split('|').map(t => t.split(',').map(Number)); return [onRoof(...p, .012), onRoof(...q, .012)]; });
  function overlay(name, segs, style = 'signal') {
    let o = overlays.get(name);
    if (!o) { o = { lines: createLines([], style, { renderOrder: 5 }), segs: [] }; overlays.set(name, o); group.add(o.lines); }
    o.segs = segs || [];
    o.lines.setStyle(style);
    o.lines.setSegments(o.segs.flatMap(([a, b]) => drape(a, b)));
  }
  const refillOverlays = () => { for (const o of overlays.values()) o.lines.setSegments(o.segs.flatMap(([a, b]) => drape(a, b))); };

  function refresh() { fillRoof(); fillLines(); refillOverlays(); }
  refresh();

  let topZ = 0;
  for (const t of tris) for (const p of t.pts) topZ = Math.max(topZ, p[2]);

  return {
    group, roof, wallH,
    get k() { return k; },
    get pitch() { return pitch; },
    setK(v) { k = v; refresh(); },
    setPitch(p) { pitch = p; },
    creaseStyle(mode) { creaseMode = mode; fillLines(); },
    overlay,
    // world point on the roof over a sheet point; world z of a sheet point's roof
    onRoof, world,
    zAt: (x, y) => wallH + roof.height(x, y) / S * k,
    // world bounds of the roof when fully up
    box() {
      const b = new THREE.Box3();
      for (const t of tris) for (const p of t.pts) { const w = world(p[0], p[1], 0); b.expandByPoint(new THREE.Vector3(w[0], w[1], 0)); }
      b.max.z = wallH + topZ / S * pitch;
      return b;
    },
    topZ: () => wallH + topZ / S * k,
    dispose() {
      for (const l of [outline, ...Object.values(creases), ...[...overlays.values()].map(o => o.lines)]) l.dispose();
      rgeo.dispose(); wgeo.dispose(); roofMesh.material.dispose(); wallMesh.material.dispose();
      group.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------
// rain: drops fall on the roof, run down its planes, gather in the
// valleys and drip off the eaves. Drawn as short signal-coloured streaks.
// ------------------------------------------------------------------

export function createRain(model, { count = 240 } = {}) {
  const roof = model.roof;
  const squares = [...roof.squares].map(s => s.split(',').map(Number));
  const pos = new Float32Array(count * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: .85, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  lines.visible = false;
  model.group.add(lines);

  const drops = Array.from({ length: count }, () => ({}));
  let stop = null, last = 0, spawning = true;

  function spawn(d, spread = 4) {
    const s = squares[Math.floor(Math.random() * squares.length)];
    d.x = s[0] + Math.random(); d.y = s[1] + Math.random();
    d.z = model.topZ() + 1.2 + Math.random() * spread;
    d.ph = spawning ? 0 : 3; d.dx = 0; d.dy = 0;
  }

  function step(dt) {
    const k = Math.max(.15, model.k);
    let i = 0, alive = 0;
    for (const d of drops) {
      let a, b;
      if (d.ph === 0) {                                  // falling
        d.z -= 9 * dt;
        const rz = model.zAt(d.x, d.y);
        if (d.z <= rz) { d.z = rz; d.ph = 1; }
        const w = model.world(d.x, d.y, 0);
        a = [w[0], w[1], d.z]; b = [w[0], w[1], d.z + .22];
      } else if (d.ph === 1) {                           // running down the roof
        const dir = descent(roof, d.x, d.y);
        if (!dir) { d.x += (Math.random() - .5) * .05; d.y += (Math.random() - .5) * .05; }
        else {
          const v = (1.4 + 3.2 * k) * dt;
          d.x += dir[0] * v; d.y += dir[1] * v; d.dx = dir[0]; d.dy = dir[1];
        }
        if (roof.height(d.x, d.y) <= 1e-3) { d.ph = 2; d.z = model.wallH; }
        else d.z = model.zAt(d.x, d.y) + .015;
        const w = model.world(d.x, d.y, 0), t = model.world(d.x - d.dx * .35, d.y - d.dy * .35, 0);
        a = [w[0], w[1], d.z]; b = [t[0], t[1], model.zAt(d.x - d.dx * .35, d.y - d.dy * .35) + .015];
      } else if (d.ph === 2) {                           // dripping off the eave
        d.z -= 5 * dt; d.x += d.dx * .5 * dt; d.y += d.dy * .5 * dt;
        if (d.z <= 0) spawn(d);
        const w = model.world(d.x, d.y, 0);
        a = [w[0], w[1], Math.max(0, d.z)]; b = [w[0], w[1], Math.max(0, d.z) + .12];
      }
      if (d.ph === 3 || !a) { pos.fill(0, i, i + 6); i += 6; continue; }
      alive++;
      pos[i++] = a[0]; pos[i++] = a[1]; pos[i++] = a[2]; pos[i++] = b[0]; pos[i++] = b[1]; pos[i++] = b[2];
    }
    geo.attributes.position.needsUpdate = true;
    return alive;
  }

  return {
    get running() { return !!stop; },
    start() {
      if (stop) { spawning = true; return; }
      spawning = true;
      for (const d of drops) spawn(d, 6);
      lines.visible = true;
      last = 0;
      stop = every(t => {
        const dt = last ? Math.min(.05, (t - last) / 1000) : 0;
        last = t;
        const alive = step(dt);
        if (!spawning && !alive) { this.stop(true); return false; }
      });
    },
    // let the drops in the air finish, or cut it off now
    stop(now = false) {
      if (!stop) return;
      if (!now) { spawning = false; return; }
      stop(); stop = null; lines.visible = false;
    },
    dispose() { stop?.(); stop = null; geo.dispose(); mat.dispose(); lines.removeFromParent(); },
  };
}
