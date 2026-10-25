// A 2D drafting board in SVG: nets, plans, card patterns, roof plans.
//
// Warm-white and warm-grey linework on the dark ground, in the same drafting
// line types as the 3D lines (lines.js DRAFT: profile, visible, fold dashed,
// mountain dash-dot, hidden, guide, signal), plus polygon fills (the signal
// colour at low alpha for active parts). SVG keeps hairlines crisp at any size.
//
// Coordinates are sheet units with y up (pass { yDown: true } for modules that
// use y down, such as roof.js and paper.js). The board keeps a display list of
// items and redraws it whenever the transform changes, so fit() and resizing
// never lose anything. It works as a static card ("NET SO FAR") or as an
// interactive surface: lattice snapping, hit testing and a ghost preview
// segment with a length readout while dragging.
//
//   const board = createBoard(el, { sub: 2, grid: 'dots', interactive: true });
//   board.polygon(pts, { fill: 'signal', stroke: 'visible', id: 'f3' });
//   board.line(a, b, 'fold');  board.fit();
//   board.drawSegments({ commit: (a, b) => ... });

import { lineStyle } from './lines.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
};

export const FILLS = {
  none: 'none',
  face: 'rgba(233, 230, 223, .035)',
  ghost: 'rgba(233, 230, 223, .07)',
  signal: 'rgba(255, 90, 31, .14)',
  signalStrong: 'rgba(255, 90, 31, .32)',
  error: 'rgba(255, 90, 31, .4)',
};

const fmt = n => (Math.round(n * 10) / 10).toString();

/**
 * createBoard(container, opts)
 *   unit (1)        lattice spacing in sheet units
 *   sub (1)         sub-lattice divisions (2 = the x2 lattice)
 *   grid ('dots')   'lines' | 'dots' | 'modules' (unit squares, dots between) | 'none'
 *   gridBounds      { x0, y0, x1, y1 } sheet units; default: the fitted view
 *   padding (16)    px around fitted content
 *   interactive     crosshair cursor and pointer handling
 *   yDown (false)
 *   width, height   px, if the container has no size of its own
 */
let boards = 0;

// On a touch screen the finger covers the point it is drawing to, so a loupe
// floats above it: the sheet under the finger at twice the size, with a ring on
// the point the line will snap to.
const LOUPE = 112, ZOOM = 2;
function createLoupe(uid) {
  const el = document.createElement('div');
  el.className = 'udp-loupe';
  const svg = mk('svg', { width: LOUPE, height: LOUPE }, el);
  for (let i = 0; i < 6; i++) { const u = mk('use', {}, svg); u.setAttribute('href', `#${uid}g${i}`); }
  const ring = mk('circle', { r: 7, fill: 'none', stroke: '#ff5a1f', 'stroke-width': 1.5 }, svg);
  document.body.appendChild(el);
  return {
    // at: the finger (client px); px, py: the finger and the snap point in board px
    show(cx, cy, fx, fy, sx, sy) {
      const half = LOUPE / 2 / ZOOM;
      svg.setAttribute('viewBox', `${fx - half} ${fy - half} ${2 * half} ${2 * half}`);
      ring.setAttribute('cx', sx); ring.setAttribute('cy', sy); ring.setAttribute('r', 7 / ZOOM);
      ring.setAttribute('stroke-width', 1.5 / ZOOM);
      const top = cy - LOUPE - 44 < 4 ? cy + 44 : cy - LOUPE - 44;
      el.style.transform = `translate(${Math.round(Math.max(4, Math.min(innerWidth - LOUPE - 4, cx - LOUPE / 2)))}px, ${Math.round(top)}px)`;
      el.classList.add('is-on');
    },
    hide() { el.classList.remove('is-on'); },
    dispose() { el.remove(); },
  };
}

export function createBoard(container, opts = {}) {
  const o = { unit: 1, sub: 1, grid: 'dots', padding: 16, interactive: false, yDown: false, ...opts };
  const root = document.createElement('div');
  root.className = 'udp-board' + (o.interactive ? ' is-interactive' : '');
  root.style.width = o.width ? o.width + 'px' : '100%';
  root.style.height = o.height ? o.height + 'px' : '100%';
  container.appendChild(root);
  const svg = mk('svg', { role: 'img' }, root);
  const gGrid = mk('g', {}, svg), gFill = mk('g', {}, svg), gLine = mk('g', {}, svg);
  const gPoint = mk('g', {}, svg), gText = mk('g', {}, svg), gOver = mk('g', {}, svg);
  const uid = 'udpb' + (++boards);
  [gGrid, gFill, gLine, gPoint, gText, gOver].forEach((g, i) => g.setAttribute('id', uid + 'g' + i));

  let W = 0, H = 0;
  let s = 30, ox = 0, oy = 0;                            // px per unit, origin in px
  let fitWhat = null, fitOpts = {};
  const items = new Map();
  let seq = 0;

  // ------------------------------------------------------------------
  // transform
  // ------------------------------------------------------------------

  const X = p => ox + p[0] * s;
  const Y = p => o.yDown ? oy + p[1] * s : oy - p[1] * s;
  const toPx = p => [X(p), Y(p)];
  const fromPx = (x, y) => [(x - ox) / s, o.yDown ? (y - oy) / s : (oy - y) / s];

  function measure() {
    const r = root.getBoundingClientRect();
    W = r.width || o.width || 300; H = r.height || o.height || 300;
  }

  function boundsOf(what) {
    if (what && what.x0 !== undefined) return what;
    let pts = [];
    if (Array.isArray(what)) pts = what;
    else for (const it of items.values()) {
      if (it.noFit) continue;
      if (it.pts) pts.push(...it.pts);
      if (it.a) pts.push(it.a, it.b);
      if (it.p) pts.push(it.p);
    }
    if (!pts.length) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  // fit content (default: every item) into the board, or into opts.rect (px)
  function fit(what = null, fopts = {}) {
    fitWhat = what; fitOpts = fopts;
    measure();
    const b = boundsOf(what);
    const pad = fopts.padding ?? o.padding;
    const r = fopts.rect || { x: 0, y: 0, w: W, h: H };
    const bw = Math.max(1e-6, b.x1 - b.x0), bh = Math.max(1e-6, b.y1 - b.y0);
    s = Math.min((r.w - 2 * pad) / bw, (r.h - 2 * pad) / bh, fopts.maxScale ?? o.maxScale ?? 80);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    ox = r.x + r.w / 2 - cx * s;
    oy = o.yDown ? r.y + r.h / 2 - cy * s : r.y + r.h / 2 + cy * s;
    redraw();
    return board;
  }

  // ------------------------------------------------------------------
  // drawing
  // ------------------------------------------------------------------

  function strokeAttrs(style, len) {
    const st = lineStyle(style, 'sheet');
    const a = { stroke: st.color, 'stroke-width': st.width, 'stroke-opacity': st.opacity < 1 ? st.opacity : null, fill: 'none' };
    if (st.dash) {
      a['stroke-dasharray'] = st.dash.join(' ');
      a['stroke-linecap'] = 'butt';
      if (len !== undefined) {                           // centre the pattern on the segment
        const P = st.dash.reduce((x, y) => x + y, 0);
        a['stroke-dashoffset'] = fmt((((st.dash[0] / 2 - len / 2) % P) + P) % P);
      }
    } else a['stroke-linecap'] = 'round';
    a['stroke-linejoin'] = 'round';
    return a;
  }

  function drawGrid() {
    gGrid.replaceChildren();
    if (o.grid === 'none') return;
    const b = o.gridBounds || (() => {
      const [x0, y1] = fromPx(0, 0), [x1, y0] = fromPx(W, H);
      return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
    })();
    const u = o.unit, step = u / o.sub;
    const i0 = Math.ceil(b.x0 / step - 1e-9), i1 = Math.floor(b.x1 / step + 1e-9);
    const j0 = Math.ceil(b.y0 / step - 1e-9), j1 = Math.floor(b.y1 / step + 1e-9);
    if ((i1 - i0) * (j1 - j0) > 40000) return;           // too dense to be useful
    const major = (k) => Math.abs(k * step / u - Math.round(k * step / u)) < 1e-9;
    if (o.grid === 'lines') {
      let dMaj = '', dMin = '';
      for (let i = i0; i <= i1; i++) { const x = fmt(X([i * step, 0])); const seg = `M${x} ${fmt(Y([0, b.y0]))}V${fmt(Y([0, b.y1]))}`; if (major(i)) dMaj += seg; else dMin += seg; }
      for (let j = j0; j <= j1; j++) { const y = fmt(Y([0, j * step])); const seg = `M${fmt(X([b.x0, 0]))} ${y}H${fmt(X([b.x1, 0]))}`; if (major(j)) dMaj += seg; else dMin += seg; }
      mk('path', { d: dMin, stroke: '#4a4843', 'stroke-width': .5, 'stroke-opacity': .45, fill: 'none' }, gGrid);
      mk('path', { d: dMaj, stroke: '#4a4843', 'stroke-width': .75, 'stroke-opacity': .8, fill: 'none' }, gGrid);
    } else if (o.grid === 'modules') {
      // the unit squares drawn, so a module reads at a glance; the sub-lattice as dots
      let dMaj = '', dMin = '';
      for (let i = i0; i <= i1; i++) if (major(i)) dMaj += `M${fmt(X([i * step, 0]))} ${fmt(Y([0, b.y0]))}V${fmt(Y([0, b.y1]))}`;
      for (let j = j0; j <= j1; j++) if (major(j)) dMaj += `M${fmt(X([b.x0, 0]))} ${fmt(Y([0, j * step]))}H${fmt(X([b.x1, 0]))}`;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!(major(i) && major(j))) dMin += `M${fmt(X([i * step, 0]))} ${fmt(Y([0, j * step]))}h.01`;
      mk('path', { d: dMaj, stroke: '#5a5852', 'stroke-width': .75, 'stroke-opacity': .9, fill: 'none' }, gGrid);
      mk('path', { d: dMin, stroke: '#5a5852', 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' }, gGrid);
    } else {
      // lattice points: small crosses on the unit lattice, dots on the sub-lattice
      let dMaj = '', dMin = '';
      const c = 2.2;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = X([i * step, 0]), y = Y([0, j * step]);
        if (major(i) && major(j)) dMaj += `M${fmt(x - c)} ${fmt(y)}h${c * 2}M${fmt(x)} ${fmt(y - c)}v${c * 2}`;
        else dMin += `M${fmt(x)} ${fmt(y)}h.01`;
      }
      mk('path', { d: dMin, stroke: '#5a5852', 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' }, gGrid);
      mk('path', { d: dMaj, stroke: '#5a5852', 'stroke-width': .9, fill: 'none' }, gGrid);
    }
  }

  function drawItem(it) {
    it.els?.forEach(e => e.remove());
    it.els = [];
    const add = (tag, attrs, g) => { const e = mk(tag, attrs, g); it.els.push(e); if (it.id !== undefined) e.dataset.id = it.id; return e; };
    if (it.kind === 'seg') {
      const [x1, y1] = toPx(it.a), [x2, y2] = toPx(it.b);
      add('line', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), ...strokeAttrs(it.style, Math.hypot(x2 - x1, y2 - y1)) }, gLine);
    } else if (it.kind === 'path' || it.kind === 'poly') {
      const d = it.pts.map((p, i) => (i ? 'L' : 'M') + fmt(X(p)) + ' ' + fmt(Y(p))).join('') + (it.kind === 'poly' || it.closed ? 'Z' : '');
      if (it.kind === 'poly') {
        const fill = FILLS[it.fill] ?? it.fill ?? FILLS.none;
        add('path', { d, fill, stroke: 'none' }, gFill);
        // stacked: the outline goes with the fill, so later polygons cover it (a painter's drawing)
        if (it.stroke) add('path', { d, ...strokeAttrs(it.stroke) }, it.stacked ? gFill : gLine);
      } else add('path', { d, ...strokeAttrs(it.style) }, gLine);
    } else if (it.kind === 'dot') {
      add('circle', { cx: fmt(X(it.p)), cy: fmt(Y(it.p)), r: it.r ?? 2.5, fill: it.signal ? '#ff5a1f' : (it.color || '#e9e6df') }, gPoint);
    } else if (it.kind === 'text') {
      const e = add('text', {
        x: fmt(X(it.p) + (it.dx || 0)), y: fmt(Y(it.p) + (it.dy || 0)),
        fill: it.signal ? '#ff5a1f' : (it.color || '#8d8a83'), 'text-anchor': it.anchor || 'middle', 'dominant-baseline': 'middle',
      }, gText);
      e.textContent = it.text;
    }
  }

  function redraw() {
    measure();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    drawGrid();
    for (const it of items.values()) drawItem(it);
    if (ghostState) drawGhost();
  }

  function put(it) {
    if (it.id === undefined || it.id === null) it.id = '_' + (seq++);
    const old = items.get(it.id);
    if (old) old.els?.forEach(e => e.remove());
    items.set(it.id, it);
    drawItem(it);
    return it.id;
  }

  // ------------------------------------------------------------------
  // ghost preview with a length readout
  // ------------------------------------------------------------------

  let ghostState = null;
  const gGhost = mk('g', {}, gOver);
  function drawGhost() {
    gGhost.replaceChildren();
    if (!ghostState) return;
    const { a, b, readout, style } = ghostState;
    const [x1, y1] = toPx(a), [x2, y2] = toPx(b);
    mk('line', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), ...strokeAttrs(style), 'stroke-dasharray': '5 4', 'stroke-linecap': 'butt' }, gGhost);
    mk('circle', { cx: fmt(x1), cy: fmt(y1), r: 3, fill: '#ff5a1f' }, gGhost);
    mk('circle', { cx: fmt(x2), cy: fmt(y2), r: 3.5, fill: 'none', stroke: '#ff5a1f', 'stroke-width': 1.2 }, gGhost);
    if (readout) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * (ghostState.unitScale ?? 1);
      const text = typeof readout === 'function' ? readout(L, a, b) : (Math.round(L * 100) / 100).toFixed(L % 1 ? 2 : 0);
      if (L > 1e-9) {
        // the readout sits beside the midpoint, on the side away from the line
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
        let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const t = mk('text', { x: fmt(mx + nx * 14), y: fmt(my + ny * 14), fill: '#ff5a1f', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, gGhost);
        t.textContent = text;
      }
    }
  }

  // A ghost finger draws from a to b, a few times over, to show the gesture
  // without words; it stops the moment the player touches the sheet.
  function demo(a, b, { times = 2, ms = 1300 } = {}) {
    let raf = 0, t0 = 0, done = false;
    const finger = mk('circle', { r: 13, fill: 'rgba(233,230,223,.16)', stroke: '#e9e6df', 'stroke-width': 1, 'stroke-opacity': .7 }, gOver);
    const stop = () => {
      if (done) return;
      done = true; cancelAnimationFrame(raf); finger.remove(); ghost(null);
      root.removeEventListener('pointerdown', stop, true);
    };
    root.addEventListener('pointerdown', stop, true);
    const frame = t => {
      if (done) return;
      t0 ||= t;
      const k = (t - t0) / (ms + 600), pass = Math.floor(k), f = Math.min(1, (k - pass) * (ms + 600) / ms);
      if (pass >= times) return stop();
      const e = f < .5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      const p = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
      const [x, y] = toPx(p);
      finger.setAttribute('cx', fmt(x)); finger.setAttribute('cy', fmt(y));
      finger.setAttribute('opacity', f >= 1 ? 0 : 1);
      ghost(a, f >= 1 ? a : p, { readout: false });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return stop;
  }

  // ------------------------------------------------------------------
  // hit testing
  // ------------------------------------------------------------------

  const distSeg = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  };
  const inside = (p, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };

  // client position -> sheet units
  function toWorld(ev) {
    const r = root.getBoundingClientRect();
    return fromPx(ev.clientX - r.left, ev.clientY - r.top);
  }
  // sheet units -> client px (for redlines and tutorials)
  function toClient(p) {
    const r = root.getBoundingClientRect();
    return [r.left + X(p), r.top + Y(p)];
  }
  // nearest lattice point (unit / sub spacing, or a custom step)
  function snap(p, step = o.unit / o.sub) {
    return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
  }

  // the item under the pointer: segments and points within tol px, polygons by inside
  //   opts: tol (10), kinds (['seg', 'path', 'poly', 'dot']), filter(item)
  function hit(ev, { tol = 10, kinds = ['seg', 'path', 'poly', 'dot'], filter } = {}) {
    if (ev.pointerType === 'touch') tol = Math.max(tol, 22);   // a fingertip, not a cursor
    const r = root.getBoundingClientRect();
    const m = [ev.clientX - r.left, ev.clientY - r.top];
    const w = fromPx(m[0], m[1]);
    let best = null;
    for (const it of items.values()) {
      if (it.hit === false || !kinds.includes(it.kind) || (filter && !filter(it))) continue;
      let d = Infinity;
      if (it.kind === 'seg') d = distSeg(m, toPx(it.a), toPx(it.b));
      else if (it.kind === 'dot') d = Math.hypot(m[0] - X(it.p), m[1] - Y(it.p));
      else if (it.kind === 'path' || it.kind === 'poly') {
        const P = it.pts.map(toPx), n = P.length, closed = it.kind === 'poly' || it.closed;
        for (let i = 0; i < (closed ? n : n - 1); i++) d = Math.min(d, distSeg(m, P[i], P[(i + 1) % n]));
        // inside a polygon counts as a hit, but edges and points nearby win
        if (it.kind === 'poly' && inside(w, it.pts)) d = Math.min(d, tol * .99);
      }
      if (d <= tol && (!best || d < best.dist)) best = { id: it.id, item: it, kind: it.kind, dist: d, point: w };
    }
    return best;
  }

  // ------------------------------------------------------------------
  // pointer input
  // ------------------------------------------------------------------

  // handlers: { down(ev, p, snapped), move(ev, p, snapped, dragging), up(ev, p, snapped) }
  function onPointer(h) {
    let drag = false;
    const pt = ev => { const p = toWorld(ev); return [p, snap(p)]; };
    const down = ev => { if (ev.button > 0) return; drag = true; root.setPointerCapture?.(ev.pointerId); const [p, q] = pt(ev); h.down?.(ev, p, q); };
    const move = ev => { const [p, q] = pt(ev); h.move?.(ev, p, q, drag); };
    const up = ev => { if (!drag) return; drag = false; const [p, q] = pt(ev); h.up?.(ev, p, q); };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up);
    };
  }

  // Draw straight segments between lattice points with a ghost preview.
  //   commit(a, b)          called on release with snapped end points
  //   constrain(a, p) -> q  optional: e.g. lattice.js snapLine for 8 directions
  //   readout               true (length), false, or fn(length, a, b) -> text
  //   onStart(a), onSnap(q) optional: sound hooks
  function drawSegments({ commit, constrain, readout = true, onStart, onSnap, unitScale = 1, style = 'signalThin' } = {}) {
    let a = null, last = null, loupe = null, touchDraw = false;
    const peek = (ev, b) => {
      touchDraw = ev.pointerType === 'touch';
      if (!touchDraw) return;
      loupe ??= createLoupe(uid);
      const r = root.getBoundingClientRect();
      const [sx, sy] = toPx(b);
      loupe.show(ev.clientX, ev.clientY, ev.clientX - r.left, ev.clientY - r.top, sx, sy);
    };
    const off = onPointer({
      down: (ev, p, q) => { a = q; last = q; onStart?.(a); ghost(a, a, { readout, unitScale, style }); peek(ev, q); },
      move: (ev, p, q, dragging) => {
        if (!dragging || !a) return;
        const b = constrain ? constrain(a, p) : q;
        if (!last || b[0] !== last[0] || b[1] !== last[1]) { last = b; onSnap?.(b); }
        ghost(a, b, { readout, unitScale, style });
        peek(ev, b);
      },
      up: () => {
        const b = last;
        loupe?.hide();
        ghost(null);
        if (a && b && (a[0] !== b[0] || a[1] !== b[1])) { commit?.(a, b); if (touchDraw) navigator.vibrate?.(8); }
        a = null; last = null;
      },
    });
    return () => { off(); loupe?.dispose(); loupe = null; };
  }

  function ghost(a, b, gopts = {}) {
    ghostState = a ? { a, b, readout: gopts.readout ?? true, unitScale: gopts.unitScale, style: gopts.style || 'signalThin' } : null;
    drawGhost();
  }

  const ro = new ResizeObserver(() => { const w = W, h = H; measure(); if (w !== W || h !== H) { if (fitWhat !== undefined) fit(fitWhat, fitOpts); else redraw(); } });
  ro.observe(root);
  measure();

  const board = {
    el: root, svg,
    get scale() { return s; },
    // items; every call returns the item id (pass opts.id to replace an item)
    line: (a, b, style = 'visible', io = {}) => put({ kind: 'seg', a, b, style, ...io }),
    polyline: (pts, style = 'visible', io = {}) => put({ kind: 'path', pts, style, ...io }),
    // polygon: opts.fill ('none' | 'face' | 'ghost' | 'signal' | 'signalStrong' | 'error' | a CSS colour), opts.stroke (a style or null), opts.stacked
    polygon: (pts, io = {}) => put({ kind: 'poly', pts, fill: 'face', stroke: 'visible', ...io }),
    dot: (p, io = {}) => put({ kind: 'dot', p, ...io }),
    text: (p, text, io = {}) => put({ kind: 'text', p, text, ...io }),
    get: id => items.get(id),
    update(id, patch) { const it = items.get(id); if (it) { Object.assign(it, patch); drawItem(it); } },
    remove(id) { const it = items.get(id); if (it) { it.els?.forEach(e => e.remove()); items.delete(id); } },
    clear() { for (const it of items.values()) it.els?.forEach(e => e.remove()); items.clear(); ghost(null); },
    items: () => [...items.values()],
    fit, redraw, snap, hit, toWorld, toClient, toPx, ghost, onPointer, drawSegments, demo,
    // what the last fit framed (sheet units), and the px it wants for a width w
    extent: () => boundsOf(fitWhat),
    heightFor(w) {
      const b = boundsOf(fitWhat), pad = fitOpts.padding ?? o.padding;
      const bw = Math.max(1e-6, b.x1 - b.x0), bh = Math.max(1e-6, b.y1 - b.y0);
      return bh * Math.min((w - 2 * pad) / bw, fitOpts.maxScale ?? o.maxScale ?? 80) + 2 * pad;
    },
    setGrid(grid, bounds) { o.grid = grid; if (bounds !== undefined) o.gridBounds = bounds; drawGrid(); },
    dispose() { ro.disconnect(); root.remove(); },
  };
  return board;
}
