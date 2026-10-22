// The card in 3D: every piece of paper as a thin slab, posed by poseCard at an
// opening angle. At 180 degrees the card lies flat on the table; at 90 the
// wall half stands up and the cut strips stand out of the fold as a building.
// A strip that cannot stand stays in the sheet, torn, in a warm tint.
//
// Card coordinates: x across, y out from the gutter along the floor, z up.
// World: X = x - W/2, Y = -y (the floor comes toward the camera), Z = z.
//
// The paper carries a faint unit grid, like graph paper, so depths and heights
// can be counted in 3D; cut edges and folds are drawn in ink.

import * as THREE from 'three';
import { createLines } from '../../src/stage/lines.js';
import { animate, ease } from '../../src/fx/tween.js';
import { poseCard, massOf, profileOf, sameCol } from '../../src/core/origamic.js';

const TH = .03;
const PAPER = 0xe8e3d9;

const material = (opts = {}) => new THREE.MeshStandardMaterial({ color: PAPER, emissive: 0x4a4740, roughness: .95, metalness: 0, flatShading: true, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...opts });

// a column's section at angle theta, in card (y, z): floor edge, folds, wall top
export function sectionOf(card, col, theta = Math.PI / 2) {
  const wd = [Math.cos(theta), Math.sin(theta)];
  const p = profileOf(card.cols[col]);
  const pts = [[card.D, 0]];
  if (p.plain || !p.ok) { pts.push([0, 0], [card.H * wd[0], card.H * wd[1]]); return pts; }
  let at = [-p.a, 0];
  pts.push(at);
  for (const pc of p.pieces) {
    const L = pc.s1 - pc.s0, d = pc.t === 'W' ? wd : [-1, 0];
    at = [at[0] + d[0] * L, at[1] + d[1] * L];
    pts.push(at);
  }
  pts.push([card.H * wd[0], card.H * wd[1]]);
  return pts;
}

export function createCardView(card, { theta = Math.PI / 2 } = {}) {
  const group = new THREE.Group();
  group.name = 'card';
  // three tints (paper, torn, marked), each as two meshes: the floor and the
  // pieces cast shadows; the wall half does not (its long shadow would fall
  // behind the card, on nothing)
  const mats = { good: material(), torn: material({ color: 0xe9b39c, emissive: 0x5a2a18 }), hi: material({ color: 0xf3c9b4, emissive: 0x6a3a22 }) };
  const meshes = [];
  for (const tint in mats) for (const cast of [true, false]) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mats[tint]);
    m.castShadow = cast; m.receiveShadow = true;
    m.userData.bucket = tint + (cast ? '' : ':wall');
    meshes.push(m); group.add(m);
  }
  group.position.z = .005;
  const grid = createLines([], 'guide');
  const edges = createLines([], 'visible');
  const ghost = createLines([], 'signalThin', { renderOrder: 4 });
  const mark = createLines([], 'signal', { renderOrder: 5 });
  group.add(grid, edges, ghost, mark);
  let th = theta, cur = card, marked = new Set(), showTorn = true;

  const W = v => new THREE.Vector3(v[0] - cur.W / 2, -v[1], v[2]);
  const lerp = (a, b, t) => a.clone().lerp(b, t);

  // the front of the paper faces into the card: (dx x ds) points to the front
  // (world y is flipped); the ink lies on the front, the slab grows behind it
  function slab(q, out) {
    const P = q.map(W);
    const dx = P[1].clone().sub(P[0]), ds = P[3].clone().sub(P[0]);
    const n = new THREE.Vector3().crossVectors(dx, ds).normalize().multiplyScalar(-TH);
    const B = P.map(p => p.clone().add(n));
    const quad = (a, b, c, d) => out.push(a, b, c, a, c, d);
    quad(P[0], P[1], P[2], P[3]); quad(B[0], B[3], B[2], B[1]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(P[i], B[i], B[j], P[j]); }
    return P;
  }

  function build() {
    const rects = poseCard(cur, th);
    const buckets = Object.fromEntries(meshes.map(m => [m.userData.bucket, []]));
    const E = [], G = [];
    const same = (a, b) => a >= 0 && b >= 0 && a < cur.W && b < cur.W && sameCol(cur.cols[a], cur.cols[b]);
    for (const r of rects) {
      const tint = marked.has(r.col) ? 'hi' : r.ok || !showTorn ? 'good' : 'torn';
      const P = slab(r.quad, buckets[tint + (r.kind === 'wall' ? ':wall' : '')]);
      // across: the fold or end edges of this piece
      E.push([P[0], P[1]], [P[3], P[2]]);
      // along: cut edges are ink; a piece's sides are always cut, the floor and
      // wall only at the card's edge; inside a strip or a plain run, a grid line
      const side = (x, a, b) => {
        const edge = x === 0 || x === cur.W;
        const inner = r.kind === 'piece' ? same(r.col, x === r.col ? r.col - 1 : r.col + 1) : !edge;
        (inner ? G : E).push([a, b]);
      };
      side(r.col, P[0], P[3]);
      side(r.col + 1, P[1], P[2]);
      // the unit rows across the piece
      for (let s = Math.floor(r.s0) + 1; s < r.s1; s++) {
        const k = (s - r.s0) / (r.s1 - r.s0);
        G.push([lerp(P[0], P[3], k), lerp(P[1], P[2], k)]);
      }
    }
    for (const mesh of meshes) {
      const pts = buckets[mesh.userData.bucket];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(v => [v.x, v.y, v.z]), 3));
      geo.computeVertexNormals();
      mesh.geometry.dispose();
      mesh.geometry = geo;
      mesh.visible = pts.length > 0;
    }
    const seg = ([a, b]) => [[a.x, a.y, a.z], [b.x, b.y, b.z]];
    edges.setSegments(E.map(seg));
    grid.setSegments(G.map(seg));
    drawMark();
  }

  // the marked columns' sections, in signal, on both sides of each column
  function drawMark() {
    const segs = [];
    for (const i of marked) {
      if (i < 0 || i >= cur.W) continue;
      const pts = sectionOf(cur, i, th);
      for (const x of [i, i + 1]) for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        segs.push([[x - cur.W / 2, -a[0], a[1] + .002], [x - cur.W / 2, -b[0], b[1] + .002]]);
      }
    }
    mark.setSegments(segs);
  }

  // the target building as a thin signal wireframe (the masses under the roofs)
  function setGhost(target) {
    if (!target) { ghost.setSegments([]); return; }
    const segs = [];
    for (const m of massOf(target)) {
      const x0 = m.col - target.W / 2, x1 = x0 + 1;
      const c = [[x0, -m.y0], [x1, -m.y0], [x1, -m.y1], [x0, -m.y1]];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        segs.push([[a[0], a[1], m.z1 + .01], [b[0], b[1], m.z1 + .01]]);
        segs.push([[a[0], a[1], 0], [a[0], a[1], m.z1]]);
      }
    }
    ghost.setSegments(segs);
  }

  build();

  return {
    group,
    get theta() { return th; },
    get card() { return cur; },
    set(cardNext) { cur = cardNext; build(); },
    setTheta(v) { th = v; build(); },
    open(to = Math.PI / 2, duration = 1400) {
      const from = th;
      return animate({ duration, ease: ease.cubicInOut, essential: true, update: v => { th = from + (to - from) * v; build(); } }).promise;
    },
    setGhost,
    markColumn(cols) { marked = new Set(cols || []); build(); },
    // strips that cannot stand: tinted (true), or plain paper until the card opens
    showTorn(v) { showTorn = v; build(); },
    // the open card's bounds (flat: the wall half lies on the table behind)
    box(flat = false) {
      const r = cur.W / 2 + .3;
      return flat
        ? new THREE.Box3(new THREE.Vector3(-r, -cur.D - .2, 0), new THREE.Vector3(r, cur.H + .2, .4))
        : new THREE.Box3(new THREE.Vector3(-r, -cur.D - .2, 0), new THREE.Vector3(r, .3, cur.H + .2));
    },
    dispose() {
      for (const l of [grid, edges, ghost, mark]) l.dispose();
      for (const m of meshes) m.geometry.dispose();
      for (const k in mats) mats[k].dispose();
      group.removeFromParent();
    },
  };
}
