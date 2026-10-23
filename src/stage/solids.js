// A poly.js solid as a three.js Group: one mesh per face, so faces can move on
// their own (hinges, unfolding), and its edges as drafting lines on top.
//
// Each face mesh keeps the triangulation of its own polygon (non-convex faces,
// such as the L-shaped end of a prism, triangulate correctly) and only its
// vertex positions change when the face moves. setFacePolys takes the 3D
// polygons of every face, for instance unfold(...).pose(t), and the edges are
// rebuilt from them: an edge whose two faces still meet is drawn once, an edge
// whose faces came apart (a cut, opened) is drawn on both faces.
//
// Face states use the plaster and the signal colour only: hover and selected
// are warm signal tints, error is a strong tint, ghost is a pale see-through
// plaster that casts no shadow.
//
//   const view = createSolidView(solid);  stage.content.add(view.group);
//   view.setEdgeStyle(e.id, 'signal');     view.setFaceState(f, 'selected');
//   view.setFacePolys(net.pose(t));        // [{ f, pts: [[x,y,z], ...] }]

import * as THREE from 'three';
import { triangulate } from '../core/poly.js';
import { createLines } from './lines.js';
import { plasterMaterial, MONOLIT } from './stage.js';
import { animate, ease } from '../fx/tween.js';

const SIGNAL = new THREE.Color('#ff5a1f');
const PLASTER = new THREE.Color(MONOLIT.plaster);

// colour mix toward the signal, and a little self-light so the tint reads on shadow sides too
export const FACE_STATES = {
  normal:   { tint: 0, glow: 0 },
  hover:    { tint: .1, glow: .045 },
  selected: { tint: .28, glow: .08 },
  marked:   { tint: .16, glow: .05 },
  error:    { tint: .62, glow: .2 },
  ghost:    { tint: 0, glow: 0, opacity: .2 },
};

function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

// the face polygon in its own plane, for triangulation
function flatten(pts, n) {
  const o = pts[0];
  let u = [pts[1][0] - o[0], pts[1][1] - o[1], pts[1][2] - o[2]];
  const ul = Math.hypot(...u) || 1; u = u.map(x => x / ul);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return pts.map(p => {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]];
  });
}

/**
 * createSolidView(solid, opts)
 *   solid: poly.js solid { verts, faces: [{ id, loop, n }], edges: [{ id, a, b, f: [f0, f1] }] }
 *   opts.edgeStyle   default style for every edge ('visible')
 *   opts.on          line ink: 'model' (default)
 *   opts.castShadow / opts.receiveShadow (true)
 *   opts.hiddenLines draw occluded edges fine dashed (x-ray), default false
 *   opts.material    a base material to clone per face (default plaster)
 */
export function createSolidView(solid, opts = {}) {
  const group = new THREE.Group();
  group.name = 'solid';
  const base = opts.material || plasterMaterial();
  const castShadow = opts.castShadow ?? true, receiveShadow = opts.receiveShadow ?? true;

  // current polygons, as arrays of [x, y, z], indexed by face id
  const polys = solid.faces.map(f => f.loop.map(i => solid.verts[i].slice()));
  const states = solid.faces.map(() => 'normal');
  // a little self-light for paper lying flat, which the low sun barely reaches
  const liftColor = new THREE.Color(0, 0, 0);
  const edgeStyles = solid.edges.map(() => opts.edgeStyle || 'visible');
  let hoverEdgeId = null;

  const faces = solid.faces.map((f, fid) => {
    const pts = polys[fid];
    const tris = triangulate(flatten(pts, f.n));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
    g.setIndex(tris.flat());
    const mesh = new THREE.Mesh(g, base.clone());
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    mesh.userData.faceId = fid;
    mesh.name = 'face-' + fid;
    group.add(mesh);
    return mesh;
  });

  function writeFace(fid) {
    const g = faces[fid].geometry, pts = polys[fid];
    const P = g.attributes.position.array, N = g.attributes.normal.array, n = newell(pts);
    for (let i = 0; i < pts.length; i++) {
      P[i * 3] = pts[i][0]; P[i * 3 + 1] = pts[i][1]; P[i * 3 + 2] = pts[i][2];
      N[i * 3] = n[0]; N[i * 3 + 1] = n[1]; N[i * 3 + 2] = n[2];
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }

  // ------------------------------------------------------------------
  // edges
  // ------------------------------------------------------------------

  const lines = new Map();                              // style -> LineSegments2
  const lineOpts = { on: opts.on || 'model' };
  const xray = opts.hiddenLines ? createLines([], 'hidden', { ...lineOpts, xray: true, renderOrder: 1 }) : null;
  if (xray) group.add(xray);
  const hoverLine = createLines([], 'hover', { ...lineOpts, renderOrder: 3 });
  group.add(hoverLine);

  // where edge e lies on face fid, as [a, b] points
  const at = (e, fid) => {
    const loop = solid.faces[fid].loop;
    return [polys[fid][loop.indexOf(e.a)], polys[fid][loop.indexOf(e.b)]];
  };
  const apart = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-5;

  // every edge as drawn now: one copy, or two when its faces have come apart
  function edgeSegments() {
    const out = [];
    for (const e of solid.edges) {
      const [a0, b0] = at(e, e.f[0]), [a1, b1] = at(e, e.f[1]);
      out.push({ id: e.id, f: e.f[0], a: a0, b: b0 });
      if (apart(a0, a1) || apart(b0, b1)) out.push({ id: e.id, f: e.f[1], a: a1, b: b1 });
    }
    return out;
  }

  function rebuildEdges() {
    const byStyle = new Map();
    const segs = edgeSegments();
    for (const s of segs) {
      const st = edgeStyles[s.id];
      if (st === 'none') continue;
      if (!byStyle.has(st)) byStyle.set(st, []);
      byStyle.get(st).push([s.a, s.b]);
    }
    for (const [st, l] of lines) if (!byStyle.has(st)) l.setSegments([]);
    for (const [st, list] of byStyle) {
      let l = lines.get(st);
      if (!l) { l = createLines([], st, lineOpts); lines.set(st, l); group.add(l); }
      l.setSegments(list);
    }
    if (xray) xray.setSegments(segs.map(s => [s.a, s.b]));
    hoverLine.setSegments(hoverEdgeId === null ? [] : segs.filter(s => s.id === hoverEdgeId).map(s => [s.a, s.b]));
  }

  // ------------------------------------------------------------------
  // face states
  // ------------------------------------------------------------------

  function paint(fid) {
    const m = faces[fid].material, s = FACE_STATES[states[fid]] || FACE_STATES.normal;
    const k = faces[fid].userData.flash ?? 0;
    const tint = Math.min(1, s.tint + k * .6), glow = s.glow + k * .2;
    m.color.copy(PLASTER).lerp(SIGNAL, tint);
    m.emissive.copy(SIGNAL).multiplyScalar(glow).add(liftColor);
    const ghost = s.opacity !== undefined;
    m.transparent = ghost;
    m.opacity = ghost ? s.opacity : 1;
    m.depthWrite = !ghost;
    faces[fid].castShadow = castShadow && !ghost;
  }

  for (let i = 0; i < faces.length; i++) { writeFace(i); paint(i); }
  rebuildEdges();

  const view = {
    group, solid, faces,
    // current 3D polygon of a face ([x, y, z] points)
    facePoly: fid => polys[fid],
    // move faces: an array of { f, pts } (as unfold().pose(t) returns) or of point lists by face id
    setFacePolys(list) {
      list.forEach((q, i) => {
        const fid = q && q.pts ? q.f : i, pts = q && q.pts ? q.pts : q;
        if (!pts) return;
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k], d = polys[fid][k];
          d[0] = p[0]; d[1] = p[1]; d[2] = p[2] ?? 0;
        }
        writeFace(fid);
      });
      rebuildEdges();
    },
    // back to the closed solid
    reset() { view.setFacePolys(solid.faces.map(f => f.loop.map(i => solid.verts[i]))); },
    setFaceState(fid, state) { states[fid] = state; paint(fid); },
    // 0..1: how much the faces light themselves (flat nets read as paper, not shadow)
    setLift(k) { liftColor.copy(PLASTER).multiplyScalar(k * .5); for (let i = 0; i < faces.length; i++) paint(i); opts.invalidate?.(); },
    faceState: fid => states[fid],
    setAllFaces(state) { for (let i = 0; i < faces.length; i++) { states[i] = state; paint(i); } },
    // pulse faces in the signal colour (overlaps, culprits); resolves when done
    flashFaces(fids, { times = 3, period = 360 } = {}) {
      return animate({
        duration: times * period, ease: ease.linear, essential: true,
        update: (v) => {
          const k = .5 - .5 * Math.cos(v * times * Math.PI * 2);
          for (const f of fids) { faces[f].userData.flash = k; paint(f); }
          opts.invalidate?.();
        },
        done: () => { for (const f of fids) { faces[f].userData.flash = 0; paint(f); } opts.invalidate?.(); },
      }).promise;
    },
    setEdgeStyle(eid, style) { edgeStyles[eid] = style; rebuildEdges(); },
    // many at once: { [edgeId]: style } or an array of styles by edge id
    setEdgeStyles(map) {
      if (Array.isArray(map)) map.forEach((s, i) => { if (s) edgeStyles[i] = s; });
      else for (const k in map) edgeStyles[k] = map[k];
      rebuildEdges();
    },
    edgeStyle: eid => edgeStyles[eid],
    hoverEdge(eid) { if (hoverEdgeId !== eid) { hoverEdgeId = eid ?? null; rebuildEdges(); } },
    // current edge segments for picking: [{ id, f, a, b }] (cut edges that opened appear twice)
    edgeSegments,
    // midpoint of an edge as drawn on face f (default its first face)
    edgeMid(eid, f) {
      const e = solid.edges[eid], [a, b] = at(e, f ?? e.f[0]);
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    },
    faceCentre(fid) {
      const p = polys[fid], c = [0, 0, 0];
      for (const q of p) { c[0] += q[0] / p.length; c[1] += q[1] / p.length; c[2] += q[2] / p.length; }
      return c;
    },
    dispose() {
      for (const f of faces) { f.geometry.dispose(); f.material.dispose(); }
      for (const l of lines.values()) l.dispose();
      hoverLine.dispose(); xray?.dispose();
      if (!opts.material) base.dispose();
      group.removeFromParent();
    },
  };
  return view;
}
