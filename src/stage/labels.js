// Small HTML labels pinned to 3D points: "CUT", "HINGE", a dimension, a part
// name. IBM Plex Mono in tracked capitals; the signal option marks what is
// active. They are moved after every render, so they stay put on the model as
// the camera orbits, glides and zooms.
//
//   const labels = createLabels(stage);
//   const l = labels.add([0, -2.6, 2.8], 'Hinge', { signal: true });
//   l.set({ at: [x, y, z], text: 'Cut' });  l.remove();  labels.clear();

const xyz = p => p.isVector3 ? [p.x, p.y, p.z] : [p[0], p[1], p[2] ?? 0];

export function createLabels(stage) {
  const layer = document.createElement('div');
  layer.className = 'udp-labels';
  stage.container.appendChild(layer);
  const items = new Set();

  function place(l) {
    const [x, y, z] = stage.project(l.at);
    const off = l.offset;
    const show = z <= 1 && !l.hidden;
    l.el.classList.toggle('is-hidden', !show);
    l.el.style.transform = `translate(${(x + off[0]).toFixed(1)}px, ${(y + off[1]).toFixed(1)}px) translate(-50%, -50%)`;
  }
  const off = stage.onRender(() => { for (const l of items) place(l); });

  /**
   * add(at, text, opts) -> label
   *   opts.signal (signal colour), opts.ink (warm white), opts.offset [dx, dy] px,
   *   opts.className
   */
  function add(at, text, opts = {}) {
    const el = document.createElement('div');
    el.className = 'udp-label' + (opts.signal ? ' is-signal' : '') + (opts.ink ? ' is-ink' : '') + (opts.className ? ' ' + opts.className : '');
    el.textContent = text;
    layer.appendChild(el);
    const l = {
      el, at: xyz(at), offset: opts.offset || [0, 0], hidden: false,
      set({ at: p, text: t, signal, hidden } = {}) {
        if (p) l.at = xyz(p);
        if (t !== undefined) el.textContent = t;
        if (signal !== undefined) el.classList.toggle('is-signal', signal);
        if (hidden !== undefined) l.hidden = hidden;
        place(l);
        return l;
      },
      remove() { el.remove(); items.delete(l); },
    };
    items.add(l);
    place(l);
    stage.invalidate();
    return l;
  }

  return {
    add,
    clear() { for (const l of [...items]) l.remove(); },
    get layer() { return layer; },
    dispose() { off(); layer.remove(); items.clear(); },
  };
}
