// Redline critique: what a tutor does with a red pencil on a student's sheet.
// A thin circle round the exact culprit, a leader line, and a short italic
// note, all in the signal colour. It replaces a generic "wrong".
//
// A target is anything that can say where it is on screen now: a client
// point [x, y], or a function returning one (a projected 3D point that follows
// the camera, a board point that follows a refit). Redlines are re-placed after
// every stage render and on resize, and drawn on with a short stroke animation.
//
//   const red = createRedlines(stage);
//   red.show([{ at: () => stage.toClient(p), r: 28, note: 'this is a fold, not a cut' }]);
//   red.clear();

import { reducedMotion } from '../fx/tween.js';

const NS = 'http://www.w3.org/2000/svg';

export function createRedlines(stage = null) {
  const layer = document.createElement('div');
  layer.className = 'udp-redlines';
  const svg = document.createElementNS(NS, 'svg');
  layer.appendChild(svg);
  document.body.appendChild(layer);
  let marks = [];

  const where = at => {
    const p = typeof at === 'function' ? at() : at;
    return p && isFinite(p[0]) && isFinite(p[1]) ? p : null;
  };

  // the note goes to the emptier side, its leader leaves the circle at 45 degrees
  function place(m) {
    const p = where(m.at);
    if (!p) { m.g.style.display = 'none'; m.note && (m.note.style.display = 'none'); return; }
    m.g.style.display = ''; if (m.note) m.note.style.display = '';
    const W = window.innerWidth, H = window.innerHeight, r = m.r;
    const sx = m.side ? (m.side === 'left' ? -1 : 1) : (p[0] > W * .62 ? -1 : 1);
    const sy = m.up === false ? 1 : (p[1] < H * .3 ? 1 : -1);
    const a = [p[0] + sx * r * .7071, p[1] + sy * r * .7071];
    const len = m.leader ?? Math.max(56, Math.min(140, W * .08));
    let b = [a[0] + sx * len, a[1] + sy * len * .62];
    b = [Math.max(16, Math.min(W - 16, b[0])), Math.max(16, Math.min(H - 16, b[1]))];
    m.circle.setAttribute('cx', p[0]); m.circle.setAttribute('cy', p[1]); m.circle.setAttribute('r', r);
    m.path.setAttribute('d', m.note ? `M${a[0]} ${a[1]}L${b[0]} ${b[1]}` : '');
    if (m.note) {
      const nw = m.note.offsetWidth || 220, nh = m.note.offsetHeight || 40;
      let x = sx > 0 ? b[0] + 6 : b[0] - 6 - nw;
      let y = sy > 0 ? b[1] - 4 : b[1] - nh + 4;
      x = Math.max(12, Math.min(W - nw - 12, x));
      y = Math.max(12, Math.min(H - nh - 12, y));
      m.note.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
  const placeAll = () => { for (const m of marks) place(m); };
  const offRender = stage?.onRender(placeAll);
  window.addEventListener('resize', placeAll);

  function drawOn(el, delay) {
    if (reducedMotion()) return;
    const L = el.getTotalLength?.() || 300;
    el.style.strokeDasharray = L;
    el.style.strokeDashoffset = L;
    el.getBoundingClientRect();
    el.style.transition = `stroke-dashoffset .5s cubic-bezier(.2,.7,.1,1) ${delay}s`;
    el.style.strokeDashoffset = 0;
  }

  /**
   * show(list, { keep }) — list of { at, r = 26, note, side: 'left'|'right', up, width }
   * keep: add to the redlines already shown instead of replacing them
   */
  function show(list, { keep = false } = {}) {
    if (!keep) clear();
    for (const spec of [].concat(list)) {
      if (!spec) continue;
      const g = document.createElementNS(NS, 'g');
      const circle = document.createElementNS(NS, 'circle');
      const path = document.createElementNS(NS, 'path');
      circle.setAttribute('stroke-width', spec.width ?? 1.4);
      path.setAttribute('stroke-width', 1.1);
      g.append(circle, path);
      svg.appendChild(g);
      let note = null;
      if (spec.note) {
        note = document.createElement('div');
        note.className = 'udp-redline-note';
        note.textContent = spec.note;
        layer.appendChild(note);
      }
      const m = { ...spec, r: spec.r ?? 26, g, circle, path, note };
      marks.push(m);
      place(m);
      drawOn(circle, 0);
      if (spec.note) { drawOn(path, .32); requestAnimationFrame(() => note.classList.add('is-on')); }
    }
  }

  function clear() {
    for (const m of marks) { m.g.remove(); m.note?.remove(); }
    marks = [];
  }

  return {
    show, clear,
    get count() { return marks.length; },
    refresh: placeAll,
    dispose() { clear(); offRender?.(); window.removeEventListener('resize', placeAll); layer.remove(); },
  };
}
