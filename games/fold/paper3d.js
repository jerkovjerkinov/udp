// The sheet in 3D: paper with a little thickness, folded for real.
//
// A paper.js state is a list of facets: a convex piece of the open sheet, the
// map M that puts it where it now lies, and its place z in the stack. Each
// facet is drawn as a thin slab (its pieces, after the holes, extruded), at the
// height of its rank in the stack. A fold turns the moving facets half a turn
// about the crease, at the height that lands each one exactly where the next
// state stacks it; a facet that turned over is drawn upside down.
//
// Sheet coordinates: x right, y down, one unit per cell; the world puts the
// sheet's centre at the origin, y flipped.
//
//   const pv = createPaperView(4);  stage.content.add(pv.group);
//   pv.show(state, holes);  await pv.fold(states[0], states[1], steps[0]);
//   await pv.chips(chipsOf(state, parts));  pv.clearChips();

import * as THREE from 'three';
import { createLines } from '../../src/stage/lines.js';
import { animate, ease } from '../../src/fx/tween.js';
import { piecesOf, apply, compose, det, centroid2, insideBy } from '../../src/core/foldpunch.js';

export const TH = .028;                     // one layer
const SLAB = TH * .78;                      // the paper itself, leaving a hair of air between layers

const PAPER = 0xe8e3d9;

function paperMaterial(opts = {}) {
  // a little self-light: flat paper under a low sun reads grey otherwise
  return new THREE.MeshStandardMaterial({ color: PAPER, emissive: 0x5a564f, roughness: .95, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...opts });
}

// ranks: z value -> height in the stack
function ranks(sheet) {
  const zs = [...new Set(sheet.facets.map(f => f.z))].sort((a, b) => a - b);
  const m = new Map(zs.map((z, i) => [z, i]));
  return z => m.get(z) * TH;
}

const onBorder = (a, b, n) => (a[0] === b[0] && (a[0] === 0 || a[0] === n)) || (a[1] === b[1] && (a[1] === 0 || a[1] === n));
const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

export function createPaperView(n) {
  const group = new THREE.Group();
  group.name = 'paper';
  const mat = paperMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  const edges = createLines([], 'visible');
  const creases = createLines([], 'fold');
  const holeLines = createLines([], 'visible');
  const mark = createLines([], 'signal', { renderOrder: 5 });
  const hover = createLines([], 'signalFold', { renderOrder: 5 });
  group.add(mesh, edges, creases, holeLines, mark, hover);

  let holes = [];
  let cache = new Map();                    // facet -> { pieces, border, crease, holes }

  // world point of a sheet point under pose { M, zb, flip(det<0), rot }
  const toWorld = (x, y, z) => new THREE.Vector3(x - n / 2, -(y - n / 2), z);

  function facetData(f) {
    let d = cache.get(f);
    if (d) return d;
    const pieces = piecesOf(f.poly, holes);
    const border = [], crease = [];
    for (let i = 0; i < f.poly.length; i++) {
      const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length];
      (onBorder(a, b, n) ? border : crease).push([a, b]);
    }
    const mine = holes.filter(h => insideBy(f.poly, centroid2(h)) > -1e-6);
    // hole outlines, minus their sides that run along this facet's edges (a cut across a crease)
    const hl = [];
    for (const h of mine) for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length];
      const onEdge = f.poly.some((p, k) => { const q = f.poly[(k + 1) % f.poly.length]; return Math.abs((q[0] - p[0]) * (a[1] - p[1]) - (q[1] - p[1]) * (a[0] - p[0])) < 1e-6 && Math.abs((q[0] - p[0]) * (b[1] - p[1]) - (q[1] - p[1]) * (b[0] - p[0])) < 1e-6; });
      if (onEdge) continue;
      // an edge between two parts of one cut (the wall and roof of a house) is inside the hole
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * .01, ny = (b[0] - a[0]) / L * .01;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const inHole = q => mine.some(o => insideBy(o, q) > 1e-6);
      if (inHole([m[0] + nx, m[1] + ny]) && inHole([m[0] - nx, m[1] - ny])) continue;
      hl.push([a, b]);
    }
    d = { pieces, border, crease, holes: hl };
    cache.set(f, d);
    return d;
  }

  // pose(f) -> fn(x, y, s) world point; s = 0 bottom of the slab, 1 top
  // poses: [{ f, M, zb, rot: { axisP, axisU, angle, h } | null }]
  function build(poses, { creaseLines = true } = {}) {
    const pos = [], E = [], C = [], H = [];
    for (const ps of poses) {
      const { f, M, zb, rot } = ps;
      const flip = det(M) < 0;
      const q = new THREE.Quaternion();
      if (rot) q.setFromAxisAngle(rot.axisU, rot.angle);
      const P = (x, y, s) => {
        const [u, v] = apply(M, [x, y]);
        const w = toWorld(u, v, zb + (flip ? 1 - s : s) * SLAB);
        if (rot) { w.sub(rot.axisP).applyQuaternion(q).add(rot.axisP); }
        return w;
      };
      const d = facetData(f);
      for (const pc of d.pieces) {
        const top = pc.map(p => P(p[0], p[1], 1)), bot = pc.map(p => P(p[0], p[1], 0));
        for (let i = 1; i < pc.length - 1; i++) {
          pos.push(top[0], top[i], top[i + 1]);
          pos.push(bot[0], bot[i + 1], bot[i]);
        }
        for (let i = 0; i < pc.length; i++) {
          const j = (i + 1) % pc.length;
          pos.push(bot[i], bot[j], top[j], bot[i], top[j], top[i]);
        }
      }
      // lines on the face that looks up (a turning flap swaps faces half way)
      const up = (rot ? Math.abs(rot.angle) > Math.PI / 2 : false) !== flip ? 0 : 1;
      for (const [a, b] of d.border) E.push([P(a[0], a[1], up), P(b[0], b[1], up)]);
      if (creaseLines) for (const [a, b] of d.crease) C.push([P(a[0], a[1], up), P(b[0], b[1], up)]);
      for (const [a, b] of d.holes) H.push([P(a[0], a[1], up), P(b[0], b[1], up)]);
    }
    const arr = new Float32Array(pos.length * 3);
    pos.forEach((v, i) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = g;
    const xyz = ([a, b]) => [[a.x, a.y, a.z], [b.x, b.y, b.z]];
    edges.setSegments(E.map(xyz));
    creases.setSegments(C.map(xyz));
    holeLines.setSegments(H.map(xyz));
  }

  let current = null;
  function show(sheet, h = holes) {
    if (h !== holes) { holes = h; cache = new Map(); }
    current = sheet;
    const zb = ranks(sheet);
    // creases show as dashed marks once the sheet lies open
    build(sheet.facets.map(f => ({ f, M: f.M, zb: zb(f.z), rot: null })), { creaseLines: new Set(sheet.facets.map(f => f.z)).size === 1 });
  }

  // the poses at fraction t of the fold from state A to state B
  function foldPoses(A, B, step, t) {
    const za = ranks(A), zb = ranks(B);
    const nStay = B.facets.length - step.moved;
    const ln = step.line;
    const axisU = new THREE.Vector3(ln.d[0], -ln.d[1], 0).normalize();
    // which way round lifts the flap
    const probe = (() => {
      const pts = B.facets.slice(nStay).flatMap(f => f.poly.map(p => apply(compose(step.R, f.M), p)));
      return pts.length ? centroid2(pts) : [ln.p[0] + ln.d[1], ln.p[1] - ln.d[0]];
    })();
    const w = toWorld(...probe, 0).sub(toWorld(...ln.p, 0));
    const sgn = new THREE.Vector3().crossVectors(axisU, w).z >= 0 ? 1 : -1;
    return B.facets.map((f, i) => {
      if (i < nStay) return { f, M: f.M, zb: za(f.z) + (zb(f.z) - za(f.z)) * t, rot: null };
      const MA = compose(step.R, f.M);
      const zA = za(f.zPre), zB = zb(f.z);
      const h = (zA + SLAB + zB) / 2;
      return { f, M: MA, zb: zA, rot: { axisP: toWorld(ln.p[0], ln.p[1], h), axisU, angle: sgn * Math.PI * t } };
    });
  }

  // fold A -> B (or back, with reverse) over duration ms
  function foldAnim(A, B, step, { reverse = false, duration = 900 } = {}) {
    const from = reverse ? 1 : 0, to = reverse ? 0 : 1;
    return animate({ from, to, duration, ease: ease.cubicInOut, essential: true, update: v => build(foldPoses(A, B, step, v), { creaseLines: false }) })
      .promise.then(() => show(reverse ? A : B));
  }

  // ------------------------------------------------------------------
  // chips: what a punch or a cut takes out, falling to the table
  // ------------------------------------------------------------------

  const chipGroup = new THREE.Group();
  group.add(chipGroup);
  function chips(list, sheet) {
    const zb = ranks(sheet);
    const meshes = [];
    for (const c of list) {
      const g = new THREE.BufferGeometry();
      const pos = [];
      const top = c.poly.map(p => toWorld(p[0], p[1], SLAB)), bot = c.poly.map(p => toWorld(p[0], p[1], 0));
      for (let i = 1; i < c.poly.length - 1; i++) pos.push(top[0], top[i], top[i + 1], bot[0], bot[i + 1], bot[i]);
      for (let i = 0; i < c.poly.length; i++) { const j = (i + 1) % c.poly.length; pos.push(bot[i], bot[j], top[j], bot[i], top[j], top[i]); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap(v => [v.x, v.y, v.z]), 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, paperMaterial());
      m.castShadow = m.receiveShadow = true;
      m.position.z = zb(c.z);
      chipGroup.add(m);
      meshes.push(m);
    }
    // they drop off the stack and scatter a little toward the viewer
    return Promise.all(meshes.map((m, i) => {
      const z0 = m.position.z, dx = (Math.random() - .5) * .5, dy = -.6 - Math.random() * .7, spin = (Math.random() - .5) * 1.2;
      return animate({ duration: 700 + i * 40, delay: 120 + i * 25, ease: ease.cubicIn, essential: true, update: (v, k) => {
        m.position.set(dx * k, dy * k, Math.max(i * .002, z0 * (1 - v)) + Math.sin(k * Math.PI) * .25);
        m.rotation.z = spin * k;
      } }).promise;
    }));
  }
  function clearChips() { for (const m of [...chipGroup.children]) { m.geometry.dispose(); m.material.dispose(); m.removeFromParent(); } }

  // ------------------------------------------------------------------
  // marks on the top of the stack: a fold line, a punch outline
  // ------------------------------------------------------------------

  const topZ = () => current ? Math.max(...current.facets.map(f => ranks(current)(f.z))) + SLAB + .002 : SLAB;
  const seg2 = (a, b, z) => [[a[0] - n / 2, -(a[1] - n / 2), z], [b[0] - n / 2, -(b[1] - n / 2), z]];
  function setMark(segs, style = 'signal') { mark.setStyle(style); mark.setSegments(segs.map(([a, b]) => seg2(a, b, topZ()))); }
  function setHover(segs, style = 'signalFold') { hover.setStyle(style); hover.setSegments(segs.map(([a, b]) => seg2(a, b, topZ()))); }
  const outline = polys => polys.flatMap(P => P.map((p, i) => [p, P[(i + 1) % P.length]]));

  return {
    group, n,
    show, foldAnim, chips, clearChips,
    setMark, setHover, outline,
    get state() { return current; },
    get holes() { return holes; },
    toWorld: (x, y, z = 0) => toWorld(x, y, z),
    topZ,
    // the sheet point under a world point on the table plane
    toSheet: v => [v.x + n / 2, -v.y + n / 2],
    box() {
      const r = n * .5 + .2;
      return new THREE.Box3(new THREE.Vector3(-r, -r, 0), new THREE.Vector3(r, r, .3));
    },
    dispose() {
      clearChips();
      for (const l of [edges, creases, holeLines, mark, hover]) l.dispose();
      mesh.geometry.dispose(); mat.dispose();
      group.removeFromParent();
    },
  };
}
