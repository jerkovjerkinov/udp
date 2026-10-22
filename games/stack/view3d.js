// Stack in 3D: the site (a cell grid, the street, the height limit, the cores)
// and the modules on it, each a plaster polycube with its windows and roof
// gardens drawn on; a ghost for the module in hand; the massing to fill as a
// signal wireframe.
//
// Cell (x, y, z) is the unit box at world X = x - W/2, Y = y - D/2, Z = z, so
// the street side (y = 0) faces the camera's front, as in the site plan.

import * as THREE from 'three';
import { createLines } from '../../src/stage/lines.js';
import { MONOLIT } from '../../src/stage/stage.js';
import { animate, ease } from '../../src/fx/tween.js';
import { K, limitAt } from '../../src/core/stack.js';

const SIGNAL = new THREE.Color('#ff5a1f');
const CONCRETE = 0x9d998f;
const GLASS = 0x5f6a6c;
// a slight shade per module, so neighbours read apart in plaster
const SHADES = [0xd8d2c7, 0xd2ccc0, 0xdcd6cc, 0xcfc9bd, 0xd5cfc3, 0xdad3c6];

const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// a polycube's outer faces as triangles and its outline as segments (no seams
// between its own cells), in cell coordinates
export function polycube(cells) {
  const set = new Set(cells.map(c => K(...c)));
  const has = (c, d, s = 1) => set.has(K(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s));
  const tri = [], edges = new Map();
  for (const c of cells) for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const n = AX[k].map(v => v * s);
    if (has(c, n)) continue;
    const i = (k + 1) % 3, j = (k + 2) % 3;
    const corner = (u, v) => { const p = c.slice(); p[k] += s > 0 ? 1 : 0; p[i] += u; p[j] += v; return p; };
    const q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
    if (s < 0) q.reverse();
    tri.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    // an edge is drawn unless the surface runs on, flat, into the next cell
    const sides = [[corner(0, 0), corner(1, 0), AX[j].map(v => -v)], [corner(0, 1), corner(1, 1), AX[j]],
      [corner(0, 0), corner(0, 1), AX[i].map(v => -v)], [corner(1, 0), corner(1, 1), AX[i]]];
    for (const [a, b, t] of sides) {
      const across = [c[0] + t[0], c[1] + t[1], c[2] + t[2]];
      if (set.has(K(...across)) && !has(across, n)) continue;
      const key = [a.join(','), b.join(',')].sort().join('|');
      edges.set(key, [a, b]);
    }
  }
  return { tri, edges: [...edges.values()] };
}

export function createStackView(site, { invalidate = () => {} } = {}) {
  const { W, D, H } = site;
  const group = new THREE.Group();
  group.name = 'stack';
  const w = p => [p[0] - W / 2, p[1] - D / 2, p[2]];          // cell coords -> world
  const seg = ([a, b], lift = 0) => { const A = w(a), B = w(b); return [[A[0], A[1], A[2] + lift], [B[0], B[1], B[2] + lift]]; };

  // ---- the site ---------------------------------------------------
  const ground = [], line = [];
  for (let x = 0; x <= W; x++) ground.push([[x, 0, 0], [x, D, 0]]);
  for (let y = 0; y <= D; y++) ground.push([[0, y, 0], [W, y, 0]]);
  const grid = createLines(ground.map(s => seg(s, .004)), 'guide');
  line.push([[0, 0, 0], [W, 0, 0]], [[W, 0, 0], [W, D, 0]], [[W, D, 0], [0, D, 0]], [[0, D, 0], [0, 0, 0]]);
  const outline = createLines(line.map(s => seg(s, .006)), 'visible');
  // the street: a hatched band along the front
  const street = [];
  if (site.street !== false) {
    street.push([[-.6, -1.4, 0], [W + .6, -1.4, 0]], [[-.6, -.25, 0], [W + .6, -.25, 0]]);
    for (let x = -.4; x < W + .6; x += .5) street.push([[x, -1.4, 0], [x + .35, -.25, 0]]);
  }
  const streetLines = createLines(street.map(s => seg(s, .004)), 'guide');
  // the height limit: dashed, stepping back with the setbacks
  const env = [];
  const lim = y => limitAt(site, y);
  for (const x of [0, W]) {
    env.push([[x, 0, 0], [x, 0, lim(0)]], [[x, D, 0], [x, D, lim(D - 1)]]);
    for (let y = 0; y < D; y++) {
      env.push([[x, y, lim(y)], [x, y + 1, lim(y)]]);
      if (y > 0 && lim(y) !== lim(y - 1)) env.push([[x, y, lim(y - 1)], [x, y, lim(y)]]);
    }
  }
  for (let y = 0; y < D; y++) env.push([[0, y, lim(y)], [W, y, lim(y)]], [[0, y + 1, lim(y)], [W, y + 1, lim(y)]]);
  const envelope = createLines(env.map(s => seg(s)), 'hidden');
  group.add(grid, outline, streetLines, envelope);

  // the cores: concrete shafts the full height
  const coreMat = new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: .95, metalness: 0, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const coreMeshes = [], coreLines = [];
  for (const [x, y] of site.cores || []) {
    const cells = Array.from({ length: H }, (_, z) => [x, y, z]);
    const { tri, edges } = polycube(cells);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(w), 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, coreMat);
    m.castShadow = m.receiveShadow = true;
    m.userData.core = [x, y];
    const e = createLines(edges.map(s => seg(s)), 'visible');
    // floor lines on the shaft: it serves every level
    const fl = [];
    for (let z = 1; z < H; z++) fl.push([[x, y, z], [x + 1, y, z]], [[x + 1, y, z], [x + 1, y + 1, z]], [[x + 1, y + 1, z], [x, y + 1, z]], [[x, y + 1, z], [x, y, z]]);
    const f = createLines(fl.map(s => seg(s)), 'guide');
    group.add(m, e, f);
    coreMeshes.push(m); coreLines.push(e, f);
  }

  // ---- modules ----------------------------------------------------
  const modGroup = new THREE.Group();
  group.add(modGroup);
  const byId = new Map();          // id -> { group, mesh, mat, base, state }
  let shadeOf = new Map(), shadeN = 0;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS, roughness: .35, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  function paint(r) {
    const k = { normal: 0, hint: .3, error: .42, lifted: 0 }[r.state] ?? 0;
    r.mat.color.copy(r.base).lerp(SIGNAL, k);
    r.mat.emissive.copy(SIGNAL).multiplyScalar(k * .22);
  }

  function clearMods() {
    for (const r of byId.values()) {
      r.mesh.geometry.dispose(); r.mat.dispose(); r.glass?.geometry.dispose();
      for (const l of r.lines) l.dispose();
    }
    byId.clear();
    modGroup.clear();
  }

  // mods: [{ id, type, cells }]; ev: evaluate() for windows and gardens (or null)
  function setMods(mods, ev = null, { details = true } = {}) {
    const keep = new Map([...byId].map(([id, r]) => [id, r.state]));
    clearMods();
    for (const m of mods) {
      if (!shadeOf.has(m.id)) shadeOf.set(m.id, SHADES[shadeN++ % SHADES.length]);
      const base = new THREE.Color(shadeOf.get(m.id));
      const { tri, edges } = polycube(m.cells);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(w), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: .92, metalness: 0, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.modId = m.id;
      const g = new THREE.Group();
      const lines = [createLines(edges.map(s => seg(s)), 'visible')];
      g.add(mesh, lines[0]);
      let glass = null;
      if (details && ev) {
        // windows on the faces that see out; a garden on every roof open to the sky
        const quads = [], win = [], garden = [];
        for (const { c, d } of ev.lit.get(m.id) || []) {
          const k = d[0] ? 0 : 1, off = (d[0] || d[1]) > 0 ? 1 : 0, o = .006 * (d[0] || d[1]);
          const P = (u, v) => { const p = c.slice(); p[k] += off; p[1 - k] += u; p[2] += v; p[k] += o; return p; };
          const q = [P(.2, .28), P(.8, .28), P(.8, .78), P(.2, .78)];
          quads.push(q[0], q[1], q[2], q[0], q[2], q[3]);
          win.push([q[0], q[1]], [q[1], q[2]], [q[2], q[3]], [q[3], q[0]], [P(.5, .28), P(.5, .78)]);
        }
        for (const c of ev.sky.get(m.id) || []) {
          const z = c[2] + 1;
          const P = (u, v) => [c[0] + u, c[1] + v, z];
          garden.push([P(.14, .14), P(.86, .14)], [P(.86, .14), P(.86, .86)], [P(.86, .86), P(.14, .86)], [P(.14, .86), P(.14, .14)]);
          garden.push([P(.3, .14), P(.14, .3)], [P(.55, .14), P(.14, .55)], [P(.86, .3), P(.3, .86)], [P(.86, .55), P(.55, .86)]);
        }
        if (quads.length) {
          const gg = new THREE.BufferGeometry();
          gg.setAttribute('position', new THREE.Float32BufferAttribute(quads.flatMap(w), 3));
          gg.computeVertexNormals();
          glass = new THREE.Mesh(gg, glassMat);
          glass.userData.noPick = true;
          g.add(glass);
        }
        const wl = createLines(win.map(s => seg(s)), 'visible'), gl = createLines(garden.map(s => seg(s, .006)), 'guide');
        g.add(wl, gl);
        lines.push(wl, gl);
      }
      modGroup.add(g);
      const r = { group: g, mesh, mat, base, glass, lines, state: keep.get(m.id) || 'normal', cells: m.cells };
      paint(r);
      byId.set(m.id, r);
    }
    invalidate();
  }

  // ---- the ghost: the module in hand where it would land -----------
  const ghostMat = new THREE.MeshStandardMaterial({ color: MONOLIT.plaster, roughness: .9, metalness: 0, transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide });
  const ghostMesh = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat);
  ghostMesh.userData.noPick = true;
  ghostMesh.renderOrder = 3;
  const ghostLines = createLines([], 'visible', { renderOrder: 4 });
  const ghostDrop = createLines([], 'hidden', { renderOrder: 4 });
  group.add(ghostMesh, ghostLines, ghostDrop);
  function setGhost(cells, ok = true) {
    if (!cells) { ghostMesh.visible = false; ghostLines.setSegments([]); ghostDrop.setSegments([]); invalidate(); return; }
    const { tri, edges } = polycube(cells);
    ghostMesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(w), 3));
    ghostMesh.geometry = geo;
    ghostMesh.visible = true;
    ghostMat.color.set(ok ? MONOLIT.plaster : SIGNAL);
    ghostMat.opacity = ok ? .42 : .3;
    ghostLines.setStyle(ok ? 'visible' : 'signal');
    ghostLines.setSegments(edges.map(s => seg(s)));
    // where it stands: dashed lines down to the ground from the bottom corners
    const drops = [];
    for (const c of cells) if (c[2] > 0 && !cells.some(o => o[0] === c[0] && o[1] === c[1] && o[2] < c[2])) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) drops.push([[c[0] + u, c[1] + v, 0], [c[0] + u, c[1] + v, c[2]]]);
    ghostDrop.setSegments(drops.map(s => seg(s)));
    invalidate();
  }

  // ---- the massing to fill ----------------------------------------
  const targetLines = createLines([], 'signalThin', { renderOrder: 2 });
  const targetMat = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide });
  const targetMesh = new THREE.Mesh(new THREE.BufferGeometry(), targetMat);
  targetMesh.userData.noPick = true;
  group.add(targetMesh, targetLines);
  function setTarget(cells) {
    targetMesh.geometry.dispose();
    targetMesh.geometry = new THREE.BufferGeometry();
    if (!cells) { targetLines.setSegments([]); targetMesh.visible = false; invalidate(); return; }
    const { tri, edges } = polycube(cells);
    targetMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(w), 3));
    targetMesh.visible = true;
    targetLines.setSegments(edges.map(s => seg(s)));
    invalidate();
  }

  // ---- picking ----------------------------------------------------
  // the column a hit points at: on a roof, that column; on a wall, the one in front
  function columnOf(hit) {
    if (!hit) return null;
    const n = hit.normal || new THREE.Vector3(0, 0, 1);
    const p = hit.point.clone().addScaledVector(n, -.01);
    const c = [Math.floor(p.x + W / 2), Math.floor(p.y + D / 2), Math.floor(p.z)];
    if (Math.abs(n.z) > .5) return [c[0], c[1]];
    return [c[0] + Math.round(n.x), c[1] + Math.round(n.y)];
  }
  const groundColumn = P => P ? [Math.floor(P.x + W / 2), Math.floor(P.y + D / 2)] : null;

  // a module's drop: from a little above to where it rests
  function land(id, from = 1.2) {
    const r = byId.get(id);
    if (!r) return Promise.resolve();
    return animate({ duration: 260, ease: ease.cubicIn, essential: true, update: (v, k) => { r.group.position.z = from * (1 - k); } }).promise.then(() => { r.group.position.z = 0; invalidate(); });
  }

  return {
    group, coreMeshes,
    get meshes() { return [...byId.values()].map(r => r.mesh); },
    idOf: obj => obj?.userData.modId ?? null,
    setMods, setGhost, setTarget, columnOf, groundColumn, land,
    setState(id, s) { const r = byId.get(id); if (!r || r.state === s) return; r.state = s; paint(r); invalidate(); },
    clearStates() { for (const r of byId.values()) if (r.state !== 'normal') { r.state = 'normal'; paint(r); } invalidate(); },
    // a module's centre in world coordinates (for redlines and labels)
    centre(id) {
      const r = byId.get(id);
      if (!r) return null;
      const n = r.cells.length, s = r.cells.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
      return w([s[0] / n + .5, s[1] / n + .5, s[2] / n + .5]);
    },
    cellCentre: c => w([c[0] + .5, c[1] + .5, c[2] + .5]),
    box: () => new THREE.Box3(new THREE.Vector3(-W / 2 - .3, -D / 2 - 1.5, 0), new THREE.Vector3(W / 2 + .3, D / 2 + .3, H)),
    dispose() {
      clearMods();
      for (const o of [grid, outline, streetLines, envelope, ghostLines, ghostDrop, targetLines, ...coreLines]) o.dispose();
      ghostMesh.geometry.dispose(); ghostMat.dispose(); targetMesh.geometry.dispose(); targetMat.dispose(); coreMat.dispose(); glassMat.dispose();
      for (const m of coreMeshes) m.geometry.dispose();
      group.removeFromParent();
    },
  };
}
