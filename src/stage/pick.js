// Picking on the stage: faces by raycast, edges in screen space, planes for
// dragging.
//
// Edges are thin, so they are picked the way a draughtsman points at a line:
// the nearest projected edge within about 10 px of the pointer. Edges behind
// the model are skipped in favour of visible ones: a ray toward the closest
// point of each candidate checks whether a face is in the way.
//
//   const pick = createPicker(stage);
//   const hit = pick.edge(ev, view.edgeSegments(), { occluders: view.faces });
//   const f = pick.face(ev, view.faces);          // { object, faceId, point }
//   const p = pick.plane(ev, 'ground');           // Vector3 on z = 0
//   const h = createHover(stage, ev => pick.edge(ev, ...), (hit, prev) => ...);

import * as THREE from 'three';

const v3 = p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2] ?? 0);

export function createPicker(stage) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // pointer event (or { clientX, clientY }) -> the stage's ray
  function aim(ev) {
    const r = stage.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.rig.camera);
    return ray;
  }
  // canvas-local pointer position
  const local = ev => {
    const r = stage.canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  // the nearest mesh under the pointer: { object, faceId, point, distance } | null
  function face(ev, objects, { recursive = true } = {}) {
    aim(ev);
    const hits = ray.intersectObjects(objects, recursive).filter(h => h.object.visible && !h.object.userData.noPick);
    const h = hits[0];
    if (!h) return null;
    let o = h.object;
    while (o && o.userData.faceId === undefined && o.parent) o = o.parent;
    return { object: h.object, faceId: o?.userData.faceId, point: h.point, distance: h.distance, normal: h.face?.normal };
  }

  // is the world point p hidden behind any occluder (meshes)?
  function hidden(p, occluders) {
    if (!occluders || !occluders.length) return false;
    const cam = stage.rig.camera, P = v3(p);
    const s = P.clone().project(cam);
    ndc.set(s.x, s.y);
    ray.setFromCamera(ndc, cam);
    const dist = ray.ray.origin.distanceTo(P);
    const hit = ray.intersectObjects(occluders, false).find(h => h.object.visible && !(h.object.material.transparent && h.object.material.opacity < .5));
    const tol = Math.max(.01, dist * 1e-3, 2 / stage.rig.pxPerUnit());
    return !!hit && hit.distance < dist - tol;
  }

  // The edge nearest the pointer in screen space.
  //   edges: [{ id, a, b, ... }] with world points (Vector3 or [x, y, z])
  //   opts: px (10) search radius; occluders (meshes) to prefer visible edges;
  //         allowHidden (false) to fall back on a hidden edge when no visible one is near
  // -> { edge, id, dist (px), t (0..1 along a-b), point (Vector3), visible } | null
  function edge(ev, edges, { px = 10, occluders = null, allowHidden = false } = {}) {
    if (ev.pointerType === 'touch') px = Math.max(px, 24);      // a fingertip, not a cursor
    const [mx, my] = local(ev);
    const cands = [];
    for (const e of edges) {
      const A = stage.project(e.a), B = stage.project(e.b);
      if (A[2] > 1 || B[2] > 1) continue;
      const vx = B[0] - A[0], vy = B[1] - A[1], l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((mx - A[0]) * vx + (my - A[1]) * vy) / l2)) : 0;
      const d = Math.hypot(mx - A[0] - t * vx, my - A[1] - t * vy);
      if (d <= px) cands.push({ edge: e, id: e.id, dist: d, t });
    }
    cands.sort((a, b) => a.dist - b.dist);
    let fallback = null;
    for (const c of cands) {
      // keep off the end points a little: corners are shared by several edges
      const t = Math.max(.08, Math.min(.92, c.t));
      c.point = v3(c.edge.a).clone().lerp(v3(c.edge.b), t);
      c.visible = !hidden(c.point, occluders);
      if (c.visible) return c;
      fallback ??= c;
    }
    return allowHidden ? fallback : null;
  }

  // the pointer on a plane: 'ground' (z = 0), a THREE.Plane, or { normal, point }
  function plane(ev, pl = 'ground') {
    aim(ev);
    let P = pl;
    if (pl === 'ground') P = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    else if (!pl.isPlane) P = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(pl.normal).clone().normalize(), v3(pl.point));
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(P, out) ? out : null;
  }

  return { aim, face, edge, plane, hidden, local, ray };
}

// Hover with a mouse: pick(ev) -> target | null runs at most once per frame;
// change(target, prev) fires when the target changes (compare by key(target),
// default target.id ?? target.faceId). Touch has no hover, so it is ignored.
// The canvas cursor becomes a pointer over a target.
export function createHover(stage, pick, change, { key = t => t?.id ?? t?.faceId ?? t } = {}) {
  let cur = null, curKey = undefined, pending = null, raf = 0, enabled = true;
  const el = stage.canvas;
  const run = () => {
    raf = 0;
    const ev = pending; pending = null;
    if (!ev || !enabled) return;
    const t = (ev.buttons && ev.pointerType === 'mouse') ? null : pick(ev);
    const k = t ? key(t) : undefined;
    if (k === curKey) { cur = t; return; }
    const prev = cur; cur = t; curKey = k;
    el.style.cursor = t ? 'pointer' : '';
    change(t, prev);
  };
  const move = ev => {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    pending = ev;
    if (!raf) raf = requestAnimationFrame(run);
  };
  const leave = () => { if (cur) { const prev = cur; cur = null; curKey = undefined; el.style.cursor = ''; change(null, prev); } };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return {
    get current() { return cur; },
    // re-run the pick at the last pointer position (after the scene changed)
    refresh(ev) { if (ev) move(ev); },
    clear: leave,
    set enabled(v) { enabled = v; if (!v) leave(); },
    dispose() { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); },
  };
}
