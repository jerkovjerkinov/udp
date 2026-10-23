// Build Order in 3D: every part as its own group (a mesh and its edges) that
// can sit at home, wait in an exploded axonometric, fly in or out along its
// way, shake when it cannot move, and take a signal tint.
//
// A part away from home leaves a dashed ghost of its outline at home, and a
// leader line along the way it travels, as in an exploded axonometric.

import * as THREE from 'three';
import { createLines } from '../../src/stage/lines.js';
import { MONOLIT } from '../../src/stage/stage.js';
import { animate, ease } from '../../src/fx/tween.js';

const MATS = { stone: MONOLIT.plaster, timber: 0xdcc6a0, steel: 0xaeb2b7, concrete: 0xd6d2c9, glass: 0xa9bcc0 };
const TEMP = 0xb89c70;
const SIGNAL = new THREE.Color('#ff5a1f');

function geometryOf(pieces) {
  const pos = [];
  for (const pc of pieces) for (const f of pc.faces) {
    const v = f.map(i => pc.verts[i]);
    for (let k = 1; k + 1 < v.length; k++) pos.push(...v[0], ...v[k], ...v[k + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const segsOf = pieces => pieces.flatMap(pc => pc.lines.map(([a, b]) => [pc.verts[a], pc.verts[b]]));

export function createBuildView(model, { invalidate = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'build';
  const parts = new Map();
  const meshes = [];

  for (const p of model.parts) {
    const base = new THREE.Color(p.temp ? TEMP : MATS[p.mat] ?? MONOLIT.plaster);
    const mat = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: p.mat === 'steel' ? .6 : .92, metalness: 0, flatShading: true,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geometryOf(p.pieces), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.partId = p.id;
    const lines = createLines(segsOf(p.pieces), p.temp ? 'fold' : 'visible');
    const obj = new THREE.Group();
    obj.add(mesh, lines);
    const ghost = createLines(segsOf(p.pieces), 'hidden', { renderOrder: 1 });
    ghost.visible = false;
    const leader = createLines([], 'guide');
    group.add(obj, ghost, leader);
    meshes.push(mesh);
    parts.set(p.id, { p, obj, mesh, lines, ghost, leader, mat, base, at: new THREE.Vector3(), state: 'normal', hover: false, marked: false, shown: true });
  }

  const centre = p => new THREE.Vector3(...p.centre);

  // one motion per part at a time: a new one stops the last, and the last's
  // ending (a fade out, a hide) does not run after the part has moved on
  function halt(r) {
    if (r.tw) { r.tw.cancel(); r.tw = null; }
    const lm = r.lines.material;
    if (r.fading) { r.mat.opacity = 1; r.mat.transparent = false; lm.opacity = r.fading.lo; lm.transparent = r.fading.lt; r.mat.needsUpdate = lm.needsUpdate = true; r.fading = null; }
    r.obj.quaternion.identity();
  }

  // three layers of tint: a state (selected by a hint, error), a mark the
  // player set, and the pointer; the strongest wins
  function paint(r) {
    const k = Math.max({ normal: 0, selected: .42, error: .7 }[r.state] ?? 0, r.marked ? .5 : 0, r.hover ? .16 : 0, r.kept ? .1 : 0);
    r.mat.color.copy(r.base).lerp(SIGNAL, k);
    r.mat.emissive.copy(SIGNAL).multiplyScalar(k * .25);
    r.lines.setStyle(r.marked || r.kept ? 'signal' : r.p.temp ? 'fold' : 'visible');
    invalidate();
  }

  // where a part sits: an offset from home
  function place(id, v) {
    const r = parts.get(id);
    halt(r);
    r.at.set(v[0] ?? v.x, v[1] ?? v.y, v[2] ?? v.z);
    r.obj.position.copy(r.at);
    const away = r.at.lengthSq() > 1e-6 && r.shown;
    r.ghost.visible = away;
    if (away) {
      const c = centre(r.p);
      r.leader.setSegments([[c.toArray(), c.clone().add(r.at).toArray()]]);
    } else r.leader.setSegments([]);
  }

  return {
    group, meshes,
    // the part under a raycast hit
    idOf: obj => obj?.userData.partId ?? null,
    name: id => parts.get(id).p.name,
    centre: id => centre(parts.get(id).p).add(parts.get(id).at),
    offset: id => parts.get(id).at.clone(),
    place,
    show(id, v = true) {
      const r = parts.get(id);
      r.shown = v;
      r.obj.visible = v;
      r.mat.opacity = 1;
      place(id, r.at);
    },
    shown: id => parts.get(id).shown,
    setState(id, s) { const r = parts.get(id); if (!r || r.state === s) return; r.state = s; paint(r); },
    hover(id, on) { const r = parts.get(id); if (!r || r.hover === on) return; r.hover = on; paint(r); },
    mark(id, on) { const r = parts.get(id); if (!r || r.marked === on) return; r.marked = on; paint(r); },
    // a part that must stay up: outlined in the signal colour
    keep(id, on) { const r = parts.get(id); if (!r || !!r.kept === on) return; r.kept = on; paint(r); },
    // only the dashed outline where the part would be (a part that is missing)
    ghostOnly(id, on) {
      const r = parts.get(id);
      place(id, [0, 0, 0]);
      r.shown = !on; r.obj.visible = !on; r.ghost.visible = on;
    },
    clearStates() { for (const r of parts.values()) { r.state = 'normal'; r.hover = r.marked = false; paint(r); } },
    // fly from offset a to offset b; fade out on the way when `out`
    fly(id, a, b, { duration = 650, out = false, easing = out ? ease.cubicIn : ease.cubicOut } = {}) {
      const r = parts.get(id);
      halt(r);
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      r.leader.setSegments([]); r.ghost.visible = false;
      const lm = r.lines.material, lo = lm.opacity;
      if (out) { r.fading = { lo, lt: lm.transparent }; r.mat.transparent = lm.transparent = true; r.mat.needsUpdate = lm.needsUpdate = true; }
      const tw = r.tw = animate({ duration, ease: easing, essential: true, update: (v, k) => {
        r.obj.position.lerpVectors(A, B, v);
        if (out) { const f = 1 - Math.max(0, (k - .45) / .55); r.mat.opacity = f; lm.opacity = lo * f; }
      } });
      return tw.promise.then(done => {
        if (!done || r.tw !== tw) return;
        r.tw = null;
        if (out) {
          halt(r);
          r.at.copy(B);
          r.shown = false; r.obj.visible = false; r.ghost.visible = false;
        }
        else place(id, B.toArray());
      });
    },
    // a pose from the physics: the part's centre at c (world), turned by q
    pose(id, c, q) {
      const r = parts.get(id);
      if (r.tw) { r.tw.cancel(); r.tw = null; }
      r.ghost.visible = false; r.leader.setSegments([]);
      const home = centre(r.p), quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      r.obj.quaternion.copy(quat);
      r.obj.position.set(c.x, c.y, c.z).sub(home.applyQuaternion(quat));
    },
    // where the part is now, as the physics sees it: centre and turn
    now(id) {
      const r = parts.get(id);
      const c = centre(r.p).applyQuaternion(r.obj.quaternion).add(r.obj.position);
      return { c, q: r.obj.quaternion.clone() };
    },
    // back from wherever the physics left it to an offset from home
    settleTo(id, b = [0, 0, 0], { duration = 700 } = {}) {
      const r = parts.get(id);
      if (r.tw) { r.tw.cancel(); r.tw = null; }
      const P0 = r.obj.position.clone(), Q0 = r.obj.quaternion.clone(), B = new THREE.Vector3(...b), I = new THREE.Quaternion();
      const home = centre(r.p);
      const tw = r.tw = animate({ duration, ease: ease.cubicInOut, essential: true, update: v => {
        r.obj.quaternion.slerpQuaternions(Q0, I, v);
        // the centre travels straight; the turn is about the centre
        const c0 = home.clone().applyQuaternion(Q0).add(P0), c1 = home.clone().add(B);
        const c = c0.lerp(c1, v);
        r.obj.position.copy(c).sub(home.clone().applyQuaternion(r.obj.quaternion));
      } });
      return tw.promise.then(done => { if (done && r.tw === tw) { r.tw = null; place(id, b); } });
    },
    // a small refusal along the way it tried to go
    shake(id, dir = [0, 0, 1]) {
      const r = parts.get(id);
      halt(r);
      const home = r.at.clone(), d = new THREE.Vector3(...dir);
      const tw = r.tw = animate({ duration: 380, ease: ease.linear, essential: true, update: (v, k) => {
        const a = Math.sin(k * Math.PI * 6) * (1 - k) * .09;
        r.obj.position.copy(home).addScaledVector(d, a);
      } });
      return tw.promise.then(done => { if (done && r.tw === tw) { r.tw = null; r.obj.position.copy(home); } });
    },
    // the model's bounds at home (and, with offsets, wherever the parts are now)
    box(all = false) {
      const b = new THREE.Box3();
      for (const r of parts.values()) {
        if (!r.shown && all) continue;
        const pb = r.p.bbox;
        const off = all ? r.at : new THREE.Vector3();
        b.union(new THREE.Box3(new THREE.Vector3(pb[0], pb[1], pb[2]).add(off), new THREE.Vector3(pb[3], pb[4], pb[5]).add(off)));
      }
      return b;
    },
    dispose() {
      for (const r of parts.values()) { r.lines.dispose(); r.ghost.dispose(); r.leader.dispose(); r.mesh.geometry.dispose(); r.mat.dispose(); }
      group.removeFromParent();
    },
  };
}
