// The axonometric camera: orthographic by default, z up, orbiting a pivot.
//
// State is four numbers and two points: yaw (azimuth of the camera around the
// pivot, radians from +x, counter-clockwise), pitch (elevation above the ground
// plane), scale (screen pixels per model unit), the pivot, and where on the
// canvas the pivot is drawn (cx, cy). Drawing the pivot off-centre is how
// content is placed inside the free rect the UI leaves, without moving the
// orbit centre: the frustum itself is shifted.
//
// Input: one finger or the mouse orbits, the wheel or a pinch zooms. On release
// the yaw settles on the nearest 45 degree step with a small overshoot (a flick
// carries on to the next step), pitch is clamped. A pointer that does not move
// is a tap, handed to onTap listeners. A game can claim a drag before it turns
// into an orbit with setDragHandler (dragging parts, drawing on a plane).
//
// The perspective toggle is a dolly zoom: a perspective camera whose field of
// view opens from about one degree (where it looks orthographic) to 30 degrees
// while it moves in, so the framing holds through the change.

import * as THREE from 'three';
import { animate, ease, reducedMotion } from '../fx/tween.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

const DEFAULTS = {
  yaw: -112.5 * D2R,          // a dimetric view from the front-left, like the mockup
  pitch: 26 * D2R,
  snap: 45 * D2R,             // yaw steps
  snapOffset: 22.5 * D2R,     // steps at 22.5 + k * 45 degrees: never dead-on, never symmetric
  minPitch: 8 * D2R,
  maxPitch: 86 * D2R,
  scale: 80,
  zoomRange: [.35, 4],        // user zoom, relative to the last framed scale
  fov: 30 * D2R,
  orbit: true,
  zoom: true,
  free: false,                // true: the yaw stays where it is let go, no steps
};

/**
 * @param {{ dom: HTMLElement, size: () => {w:number,h:number}, invalidate: () => void,
 *           rect: () => {x:number,y:number,w:number,h:number} }} host
 */
export function createCameraRig(host, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const st = {
    yaw: o.yaw, pitch: o.pitch, scale: o.scale,
    target: new THREE.Vector3(0, 0, 0),
    cx: null, cy: null,         // null: centre of the free rect
    persp: 0,                   // 0 orthographic .. 1 perspective
  };
  let fitScale = o.scale;
  let lastFrame = null;         // { what, opts } for re-framing on resize
  let motion = null;            // the running camera tween, if any
  let dragHandler = null;
  const tapFns = new Set(), turnFns = new Set();

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000);
  const persp = new THREE.PerspectiveCamera(30, 1, .1, 1000);
  ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);

  const dir = new THREE.Vector3();
  function dirOf(yaw, pitch, out = new THREE.Vector3()) {
    return out.set(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch));
  }
  const pivotPx = () => {
    const r = host.rect();
    return [st.cx ?? r.x + r.w / 2, st.cy ?? r.y + r.h / 2];
  };

  function update() {
    const { w, h } = host.size();
    if (!w || !h) return;
    const [cx, cy] = pivotPx();
    dirOf(st.yaw, st.pitch, dir);
    const R = Math.max(20, 2 * h / st.scale);           // generous depth range around the pivot
    if (st.persp <= .001) {
      ortho.left = -cx / st.scale; ortho.right = (w - cx) / st.scale;
      ortho.top = cy / st.scale; ortho.bottom = -(h - cy) / st.scale;
      ortho.position.copy(st.target).addScaledVector(dir, R * 2);
      ortho.near = .01; ortho.far = R * 4;
      ortho.lookAt(st.target);
      ortho.updateProjectionMatrix();
    } else {
      const k = ease.cubicInOut(st.persp);
      const fov = (1.2 * D2R) + (o.fov - 1.2 * D2R) * k;
      const d = h / (2 * st.scale * Math.tan(fov / 2));
      persp.fov = fov / D2R; persp.aspect = w / h;
      persp.position.copy(st.target).addScaledVector(dir, d);
      persp.near = Math.max(.05, d - R); persp.far = d + R * 2;
      persp.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
      persp.lookAt(st.target);
      persp.updateProjectionMatrix();
    }
    ortho.updateMatrixWorld(); persp.updateMatrixWorld();
  }

  const changed = () => { update(); host.invalidate(); };

  // ------------------------------------------------------------------
  // view changes
  // ------------------------------------------------------------------

  const stepOf = yaw => o.snapOffset + Math.round((yaw - o.snapOffset) / o.snap) * o.snap;

  function stop() { if (motion) { motion.cancel(); motion = null; } }

  // tween any subset of { yaw, pitch, scale, cx, cy, target, persp }
  function glide(to, { duration = 700, easing = ease.cubicInOut, essential = false } = {}) {
    stop();
    const from = { yaw: st.yaw, pitch: st.pitch, scale: st.scale, persp: st.persp, target: st.target.clone() };
    const [cx0, cy0] = pivotPx();
    from.cx = cx0; from.cy = cy0;
    const dyaw = to.yaw === undefined ? 0 : wrapPi(to.yaw - st.yaw) + (to.turns || 0) * TAU;
    const tgt = to.target ? to.target.clone() : null;
    const h = animate({
      duration, ease: easing, essential,
      update: (v) => {
        st.yaw = from.yaw + dyaw * v;
        if (to.pitch !== undefined) st.pitch = from.pitch + (to.pitch - from.pitch) * v;
        if (to.scale !== undefined) st.scale = from.scale * Math.pow(to.scale / from.scale, v);
        if (to.persp !== undefined) st.persp = from.persp + (to.persp - from.persp) * v;
        if (to.cx !== undefined) st.cx = from.cx + (to.cx - from.cx) * v;
        if (to.cy !== undefined) st.cy = from.cy + (to.cy - from.cy) * v;
        if (tgt) st.target.lerpVectors(from.target, tgt, v);
        changed();
      },
      done: () => { st.yaw = wrapPi(st.yaw); if (motion === h) motion = null; changed(); },
    });
    if (to.yaw !== undefined) h.goalYaw = wrapPi(to.yaw);
    motion = h;
    return h.promise;
  }

  function setView(yaw, pitch, anim = true) {
    const to = { yaw: yaw ?? st.yaw, pitch: clampPitch(pitch ?? st.pitch) };
    if (!anim) { stop(); st.yaw = wrapPi(to.yaw); st.pitch = to.pitch; changed(); return Promise.resolve(true); }
    return glide(to, { duration: 650 });
  }
  const clampPitch = p => Math.max(o.minPitch, Math.min(o.maxPitch, p));

  // settle the yaw on the nearest step (velocity in rad/s carries a flick on)
  function settle(vel = 0) {
    if (o.free) return Promise.resolve(true);
    const goal = stepOf(st.yaw + Math.max(-1, Math.min(1, vel * .14)) * o.snap * 1.2);
    const dist = Math.abs(wrapPi(goal - st.yaw));
    if (dist < 1e-4) { st.yaw = wrapPi(goal); changed(); return Promise.resolve(true); }
    return glide({ yaw: goal }, { duration: 360 + 520 * Math.min(1, dist / o.snap), easing: ease.backOut });
  }

  // ------------------------------------------------------------------
  // framing
  // ------------------------------------------------------------------

  const tmpBox = new THREE.Box3();
  function pointsOf(what) {
    if (!what) return [];
    if (what.isBox3) return corners(what);
    if (what.isObject3D) {
      const pts = [];
      what.updateWorldMatrix(true, true);
      what.traverseVisible(m => {
        if (!m.isMesh || m.userData.noFrame) return;
        const p = m.geometry.attributes.position;
        if (!p) return;
        // fat lines keep their points in instanceStart/End; `position` is only the unit quad
        if (m.geometry.isLineSegmentsGeometry || p.count > 4000) { tmpBox.setFromObject(m); pts.push(...corners(tmpBox)); return; }
        for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
      });
      return pts;
    }
    return what.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2] ?? 0));
  }
  function corners(b) {
    const out = [];
    for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    return out;
  }

  // Fit content into the free rect (or opts.rect), keeping it centred there.
  //   what: Box3 | Object3D | array of points ([x,y,z] or Vector3)
  //   opts: { animate = true, rect, padding = 28 px, yaw, pitch, duration = 900,
  //           maxScale = 220, pivot (Vector3: orbit centre, default the bounds' centre) }
  // the screen extent of points seen from (yaw, pitch), in world units
  function extent(pts, yaw, pitch) {
    const f = dirOf(yaw, pitch).negate();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, 1)).normalize();
    const up = new THREE.Vector3().crossVectors(right, f);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = p.dot(right), y = p.dot(up);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { right, up, x0, x1, y0, y1 };
  }
  const fitOf = (e, r, pad) => Math.min((r.w - 2 * pad) / Math.max(1e-3, e.x1 - e.x0), (r.h - 2 * pad) / Math.max(1e-3, e.y1 - e.y0));

  // opts.bestYaw: turn to the yaw step that shows the content largest (a tall phone
  // screen wants a long model end-on); the current yaw wins unless another is clearly bigger
  function frame(what, opts = {}) {
    const pts = pointsOf(what);
    if (!pts.length) return Promise.resolve(false);
    lastFrame = { what, opts: opts.bestYaw ? { ...opts, bestYaw: false } : opts };
    const r = opts.rect || host.rect();
    // padding asked for a whole screen must not eat a short strip (a phone with its card open)
    const pad = Math.min(opts.padding ?? 28, Math.min(r.w, r.h) * .12);
    let yaw = opts.yaw ?? motion?.goalYaw ?? st.yaw;
    const pitch = clampPitch(opts.pitch ?? st.pitch);
    if (opts.bestYaw && opts.yaw === undefined) {
      let best = fitOf(extent(pts, yaw, pitch), r, pad) * 1.12;
      for (let k = 0; k < Math.round(TAU / o.snap); k++) {
        const y = stepOf(yaw) + k * o.snap, s = fitOf(extent(pts, y, pitch), r, pad);
        if (s > best) { best = s; yaw = wrapPi(y); }
      }
    }
    const { right, up, x0, x1, y0, y1 } = extent(pts, yaw, pitch);
    const box = new THREE.Box3().setFromPoints(pts);
    const pivot = opts.pivot ? opts.pivot.clone() : box.getCenter(new THREE.Vector3());
    let scale = fitOf({ x0, x1, y0, y1 }, r, pad);
    scale = Math.max(4, Math.min(opts.maxScale ?? 220, scale));
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const cx = r.x + r.w / 2 + (pivot.dot(right) - mx) * scale;
    const cy = r.y + r.h / 2 - (pivot.dot(up) - my) * scale;
    fitScale = scale;
    const to = { yaw, pitch, scale, cx, cy, target: pivot };
    if (opts.animate === false) {
      stop();
      Object.assign(st, { yaw: wrapPi(yaw), pitch, scale, cx, cy });
      st.target.copy(pivot);
      changed();
      return Promise.resolve(true);
    }
    return glide(to, { duration: opts.duration ?? 900, easing: ease.cubicInOut, essential: !!opts.essential });
  }

  // re-fit the last framed content (on resize or a new free rect), without animation
  // (animated: glide there, toward the yaw a turn in progress is heading for)
  function reframe({ animate = false } = {}) {
    if (lastFrame) frame(lastFrame.what, { ...lastFrame.opts, animate, yaw: animate ? undefined : st.yaw, pitch: st.pitch, duration: 700 });
    else changed();
  }

  // the end of a level: turn by n yaw steps and frame `what` in one glide, so
  // the turn never leaves the framing half done (it shows the solved model from
  // a new side, so it plays with reduced motion too)
  // (what = null: what was framed last, as it was framed)
  function frameTurn(what, n = -1, opts = {}) {
    const base = what ? { what, opts: {} } : lastFrame;
    if (!base) return Promise.resolve(false);
    return frame(base.what, { ...base.opts, ...opts, animate: true, essential: true, yaw: stepOf(motion?.goalYaw ?? st.yaw) - n * o.snap, duration: opts.duration ?? 1100 });
  }

  // one slow orbit on success; any touch ends it early. Resolves when done.
  function victoryOrbit({ turns = 1, duration = 7500 } = {}) {
    if (reducedMotion()) return Promise.resolve(false);
    const home = stepOf(st.yaw);
    const p = glide({ yaw: home, turns, pitch: st.pitch }, { duration, easing: ease.sineInOut });
    return p;
  }

  function setPerspective(on, anim = true) {
    if (!anim) { stop(); st.persp = on ? 1 : 0; changed(); return Promise.resolve(true); }
    return glide({ persp: on ? 1 : 0 }, { duration: 750, easing: ease.linear });
  }

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------

  const dom = host.dom;
  const pointers = new Map();
  let gesture = null;           // { kind: 'pending' | 'orbit' | 'drag' | 'pinch', ... }

  function onDown(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    dom.setPointerCapture?.(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      if (gesture?.kind === 'drag') gesture.drag.cancel?.();
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: st.scale };
      return;
    }
    if (pointers.size > 2) return;
    stop();
    const drag = dragHandler ? dragHandler(ev) : null;
    gesture = drag
      ? { kind: 'drag', drag, x0: ev.clientX, y0: ev.clientY, moved: false }
      : { kind: 'pending', x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t: ev.timeStamp, vel: 0, touch: ev.pointerType !== 'mouse' };
  }

  function onMove(ev) {
    if (!pointers.has(ev.pointerId)) return;
    const p = pointers.get(ev.pointerId);
    p.x = ev.clientX; p.y = ev.clientY;
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      if (!o.zoom || pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      zoomTo(gesture.s0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0);
      return;
    }
    if (gesture.kind === 'drag') {
      if (Math.hypot(ev.clientX - gesture.x0, ev.clientY - gesture.y0) > 3) gesture.moved = true;
      gesture.drag.move?.(ev);
      return;
    }
    const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
    if (gesture.kind === 'pending') {
      const far = Math.hypot(ev.clientX - gesture.x0, ev.clientY - gesture.y0) > (gesture.touch ? 9 : 4);
      if (!far || !o.orbit) return;
      gesture.kind = 'orbit';
      host.dom.parentElement?.classList.add('is-orbiting');
      for (const fn of turnFns) fn();
    }
    const dt = Math.max(1, ev.timeStamp - gesture.t) / 1000;
    const dyaw = -dx * .0062, dpitch = dy * .0048;
    st.yaw += dyaw;
    st.pitch = clampPitch(st.pitch + dpitch);
    gesture.vel = gesture.vel * .6 + (dyaw / dt) * .4;
    gesture.x = ev.clientX; gesture.y = ev.clientY; gesture.t = ev.timeStamp;
    changed();
  }

  function onUp(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    const g = gesture;
    if (!g) return;
    if (g.kind === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    if (g.kind === 'drag') { if (ev.type === 'pointercancel') g.drag.cancel?.(ev); else g.drag.end?.(ev, g.moved); return; }
    if (g.kind === 'orbit') {
      host.dom.parentElement?.classList.remove('is-orbiting');
      // a flick that stopped before release carries no velocity
      const idle = ev.timeStamp - g.t > 90;
      settle(idle ? 0 : g.vel);
      return;
    }
    // a touch that interrupted a glide leaves the yaw between steps: put it back
    if (!motion && !o.free && Math.abs(wrapPi(st.yaw - stepOf(st.yaw))) > 1e-3) settle();
    if (ev.type !== 'pointercancel') for (const fn of tapFns) fn(ev);
  }

  function zoomTo(s) {
    const [lo, hi] = o.zoomRange;
    st.scale = Math.max(fitScale * lo, Math.min(fitScale * hi, s));
    changed();
  }

  function onWheel(ev) {
    if (!o.zoom) return;
    ev.preventDefault();
    stop();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    zoomTo(st.scale * Math.exp(-dy * (ev.ctrlKey ? .01 : .0014)));
  }

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('contextmenu', e => e.preventDefault());

  update();

  return {
    get camera() { return st.persp > .001 ? persp : ortho; },
    ortho, persp,
    get yaw() { return st.yaw; },
    get pitch() { return st.pitch; },
    get scale() { return st.scale; },
    get target() { return st.target; },
    get perspective() { return st.persp > .5; },
    get busy() { return !!motion || (gesture && gesture.kind !== 'pending'); },
    snap: o.snap, snapOffset: o.snapOffset,
    pxPerUnit: () => st.scale,
    update, frame, frameTurn, reframe, setView, settle, victoryOrbit, setPerspective, stop,
    togglePerspective(anim = true) { return setPerspective(st.persp < .5, anim); },
    // rotate by whole yaw steps (keyboard), or tilt by degrees
    step(n = 1) { for (const fn of turnFns) fn(); return glide({ yaw: stepOf(st.yaw) - n * o.snap }, { duration: 520, easing: ease.backOut }); },
    tilt(deg) { for (const fn of turnFns) fn(); return setView(st.yaw, st.pitch + deg * D2R); },
    zoomBy(f) { zoomTo(st.scale * f); },
    // the yaw step the camera rests on (or is gliding to), in degrees
    get yawDeg() { return wrapPi(st.yaw) / D2R; },
    onTap(fn) { tapFns.add(fn); return () => tapFns.delete(fn); },
    // fn() whenever the player turns the view: an orbit drag, or the turn and tilt keys
    onTurn(fn) { turnFns.add(fn); return () => turnFns.delete(fn); },
    // fn(pointerdown event) -> null (orbit as usual) or { move(ev), end(ev, moved), cancel() }
    setDragHandler(fn) { dragHandler = fn; },
    set orbitEnabled(v) { o.orbit = !!v; },
    set free(v) { o.free = !!v; },
    set zoomEnabled(v) { o.zoom = !!v; },
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      stop();
    },
  };
}
