// Fat lines in drafting styles, shared by the 3D stage and the 2D board.
//
// A drafting style is a weight and a dash pattern in screen pixels, after the
// line-type convention: profile lines heavy, visible edges medium, folds
// dashed, mountain folds dash-dot, hidden lines fine dashed, guides faint, and
// the signal colour (#FF5A1F) for what is active, cut or wrong. The pattern is
// the same everywhere; only the ink changes with what the line is drawn on:
//   'model'  dark ink on the plaster models
//   'sheet'  warm white and warm greys on the dark ground (boards, plans)
//
// Lines are three's LineSegments2 / LineMaterial (screen-space width; the
// resolution uniform follows the viewport on its own). Dashes are measured in
// pixels: the stage sets dashScale to its pixels-per-unit before each render
// (syncLines), and each segment's dash pattern is centred on its midpoint, so
// short edges stay symmetric. LineMaterial only knows dash-gap, so its fragment
// shader is patched for two-dash patterns (dash-dot).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { InstancedInterleavedBuffer, InterleavedBufferAttribute } from 'three';

// ------------------------------------------------------------------
// styles
// ------------------------------------------------------------------

// width in px; dash = [dash, gap] or [dash, gap, dot, gap] in px; tone picks the ink
export const DRAFT = {
  profile:    { width: 2.4, tone: 'strong' },
  visible:    { width: 1.2, tone: 'line' },
  fold:       { width: 1, dash: [6, 4], tone: 'soft' },
  mountain:   { width: 1, dash: [10, 3, 1.5, 3], tone: 'soft' },
  hidden:     { width: .8, dash: [3, 3], tone: 'faint' },
  hiddenPen:  { width: 1.6, dash: [5, 4], tone: 'strong' },
  guide:      { width: .75, tone: 'guide' },
  signal:     { width: 3, tone: 'signal' },
  signalFold: { width: 1.6, dash: [6, 4], tone: 'signal' },
  signalThin: { width: 1.2, tone: 'signal' },
  hover:      { width: 2.4, tone: 'signal', opacity: .55 },
};

// inks: [colour, opacity] per tone, per surface
export const INK = {
  model: {
    strong: ['#0f0f0e', 1], line: ['#0f0f0e', 1], soft: ['#1d1c1b', 1], faint: ['#1d1c1b', .55],
    guide: ['#1d1c1b', .35], signal: ['#ff5a1f', 1],
  },
  sheet: {
    strong: ['#e9e6df', 1], line: ['#a29e96', 1], soft: ['#8d8a83', 1], faint: ['#5a5852', 1],
    guide: ['#4a4843', 1], signal: ['#ff5a1f', 1],
  },
};

// a resolved style: { width, dash, color, opacity }
export function lineStyle(name, on = 'model') {
  const s = DRAFT[name];
  if (!s) throw new Error('unknown line style ' + name);
  const [color, op] = (INK[on] || INK.model)[s.tone];
  return { width: s.width, dash: s.dash || null, color, opacity: (s.opacity ?? 1) * op };
}

// add or replace a style (a game may need, say, a 'ridge' weight)
export function defineLineStyle(name, spec) { DRAFT[name] = { tone: 'line', width: 1, ...spec }; }

// ------------------------------------------------------------------
// material: LineMaterial with a two-dash pattern
// ------------------------------------------------------------------

const DASH_LINE = /if\s*\(\s*mod\(\s*vLineDistance\s*\+\s*dashOffset\s*,\s*dashSize\s*\+\s*gapSize\s*\)\s*>\s*dashSize\s*\)\s*discard;[^\n]*/;
const DASH_GLSL = `{
          float period = dashSize + gapSize + dashPattern.x + dashPattern.y;
          float ph = mod( vLineDistance + dashOffset, period );
          bool on = ph <= dashSize || ( dashPattern.x > 0.0 && ph > dashSize + gapSize && ph <= dashSize + gapSize + dashPattern.x );
          if ( !on ) discard;
        }`;

function makeMaterial(style) {
  const m = new LineMaterial({
    color: new THREE.Color(style.color),
    linewidth: style.width,
    transparent: style.opacity < 1,
    opacity: style.opacity,
    dashed: !!style.dash,
    worldUnits: false,
  });
  if (DASH_LINE.test(m.fragmentShader)) {
    m.uniforms.dashPattern = { value: new THREE.Vector2(0, 0) };
    m.fragmentShader = m.fragmentShader
      .replace('uniform float gapSize;', 'uniform float gapSize;\n\t\t\tuniform vec2 dashPattern;')
      .replace(DASH_LINE, DASH_GLSL);
  }
  applyDash(m, style.dash);
  m.userData.udpStyle = style;
  return m;
}

function applyDash(m, dash) {
  m.dashed = !!dash;
  if (!dash) return;
  m.dashSize = dash[0];
  m.gapSize = dash[1];
  if (m.uniforms.dashPattern) m.uniforms.dashPattern.value.set(dash[2] || 0, dash[3] || 0);
  m.dashOffset = dash[0] / 2;                           // segments are centred on a dash
  m.dashScale = m.userData.pxPerUnit || 1;
}

// ------------------------------------------------------------------
// line objects
// ------------------------------------------------------------------

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
const xyz = (p, out) => p.isVector3 ? out.copy(p) : out.set(p[0], p[1], p[2] ?? 0);

// segs: [[a, b], ...] with points as Vector3 or [x, y, z] (z defaults to 0)
function fill(geo, segs) {
  const n = segs.length;
  if (!n) { geo.instanceCount = 0; return true; }
  let pos = geo.userData.pos, dist = geo.userData.dist;
  const grow = !pos || pos.length !== n * 6;
  if (grow && pos) return false;                         // a new count needs a new geometry (see setSegments)
  if (grow) { pos = new Float32Array(n * 6); dist = new Float32Array(n * 2); }
  for (let i = 0; i < n; i++) {
    xyz(segs[i][0], tmpA); xyz(segs[i][1], tmpB);
    tmpA.toArray(pos, i * 6); tmpB.toArray(pos, i * 6 + 3);
    const L = tmpA.distanceTo(tmpB);
    dist[i * 2] = -L / 2; dist[i * 2 + 1] = L / 2;      // centred: the pattern is symmetric
  }
  if (grow) {
    geo.setPositions(pos);
    const db = new InstancedInterleavedBuffer(dist, 2, 1);
    geo.setAttribute('instanceDistanceStart', new InterleavedBufferAttribute(db, 1, 0));
    geo.setAttribute('instanceDistanceEnd', new InterleavedBufferAttribute(db, 1, 1));
    geo.userData.pos = pos; geo.userData.dist = dist;
  } else {
    geo.attributes.instanceStart.data.needsUpdate = true;
    geo.attributes.instanceDistanceStart.data.needsUpdate = true;
  }
  geo.instanceCount = n;
  return true;
}

// A LineSegments2 in a drafting style.
//   const l = createLines(segs, 'fold', { on: 'model' });  group.add(l);
//   l.setSegments(segs)   cheap when the count is unchanged (animation)
//   l.setStyle('signal')
//   opts: on ('model' | 'sheet'), depthTest (true), renderOrder, xray (draw only
//   where hidden behind something: hidden-line passes)
export function createLines(segs = [], styleName = 'visible', opts = {}) {
  const on = opts.on || 'model';
  const geo = new LineSegmentsGeometry();
  const mat = makeMaterial(lineStyle(styleName, on));
  if (opts.depthTest === false) mat.depthTest = false;
  if (opts.xray) { mat.depthFunc = THREE.GreaterDepth; mat.depthWrite = false; mat.transparent = true; }
  const line = new LineSegments2(geo, mat);
  line.frustumCulled = false;                           // positions move every frame during animations
  line.renderOrder = opts.renderOrder ?? 2;
  line.userData.udpLine = { style: styleName, on };
  // swapping the instanced buffers of a live geometry leaves WebGL drawing the
  // old ones, so a change of segment count gets a fresh geometry
  line.setSegments = s => {
    if (!fill(line.geometry, s)) {
      line.geometry.dispose();
      line.geometry = new LineSegmentsGeometry();
      fill(line.geometry, s);
    }
    line.visible = s.length > 0;
    return line;
  };
  line.setStyle = (name) => {
    if (line.userData.udpLine.style === name) return line;
    const st = lineStyle(name, line.userData.udpLine.on);
    mat.color.set(st.color); mat.linewidth = st.width; mat.opacity = st.opacity;
    mat.transparent = st.opacity < 1 || !!opts.xray;
    applyDash(mat, st.dash);
    mat.needsUpdate = true;
    line.userData.udpLine.style = name;
    return line;
  };
  line.dispose = () => { line.geometry.dispose(); mat.dispose(); line.removeFromParent(); };
  line.setSegments(segs);
  return line;
}

// The stage calls this before each render: dash patterns stay in screen pixels
// whatever the zoom. (Resolution is kept by LineSegments2.onBeforeRender.)
export function syncLines(root, pxPerUnit) {
  root.traverse(o => {
    const m = o.isLineSegments2 && o.material;
    if (!m || !m.userData.udpStyle) return;
    m.userData.pxPerUnit = pxPerUnit;
    if (m.dashed) m.dashScale = pxPerUnit;
  });
}

// ------------------------------------------------------------------
// edges of poly.js solids
// ------------------------------------------------------------------

// [[a, b], ...] for the given edge ids (default: every edge) of a solid
// (src/core/poly.js shape: { verts, edges: [{ id, a, b }] })
export function edgesOf(solid, ids = null) {
  const list = ids ? ids.map(i => solid.edges[i]) : solid.edges;
  return list.map(e => [solid.verts[e.a], solid.verts[e.b]]);
}
