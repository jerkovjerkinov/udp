// Straight lines on a square lattice: the player draws between lattice points,
// along the grid or at 45 degrees. A line is stored as its two end points and
// compared as a set of unit steps, so it does not matter how the player split
// a line into strokes, which way it was drawn, or whether strokes overlap.

export const pointKey = (x, y) => x + ',' + y;

// the unit step between two neighbouring lattice points (8-neighbourhood), either way round
export function stepKey(a, b) {
  return (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]))
    ? a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1]
    : b[0] + ',' + b[1] + '|' + a[0] + ',' + a[1];
}
export const parseStep = k => k.split('|').map(p => p.split(',').map(Number));

// is a -> b horizontal, vertical or diagonal?
export function straight(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return (dx || dy) && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
}

// the unit steps of a straight line, as keys
export function stepsOf(a, b) {
  const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  const out = [];
  for (let i = 0; i < n; i++) out.push(stepKey([a[0] + dx * i, a[1] + dy * i], [a[0] + dx * (i + 1), a[1] + dy * (i + 1)]));
  return out;
}

export function stepSet(lines) {
  const s = new Set();
  for (const l of lines) for (const k of stepsOf(l.a, l.b)) s.add(k);
  return s;
}

// From an anchor lattice point and a free pointer position (both in lattice units),
// the lattice point that makes the nearest allowed line: one of 8 directions,
// rounded to a whole number of steps.
export function snapLine(a, p) {
  const dx = p[0] - a[0], dy = p[1] - a[1];
  const ang = Math.atan2(dy, dx);
  const k = Math.round(ang / (Math.PI / 4));
  const ux = Math.round(Math.cos(k * Math.PI / 4)), uy = Math.round(Math.sin(k * Math.PI / 4));
  // project onto the direction, in steps (a diagonal step is one unit in x and in y)
  const along = (dx * ux + dy * uy) / (ux * ux + uy * uy);
  const n = Math.max(0, Math.round(along));
  return [a[0] + ux * n, a[1] + uy * n];
}

// merge unit steps into maximal straight lines; steps of different `kind` never merge,
// and a line never runs through a point in `breaks` (a Set of point keys).
// steps: Map stepKey -> kind (any value). Returns [{ a, b, kind, steps: [keys] }]
export function mergeSteps(steps, breaks = null) {
  const left = new Map(steps), lines = [];
  for (const [k0, kind] of steps) {
    if (!left.has(k0)) continue;
    left.delete(k0);
    let [a, b] = parseStep(k0);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const keys = [k0];
    // grow forward from b, then backward from a
    const stop = p => breaks && breaks.has(pointKey(p[0], p[1]));
    for (;;) {
      const nb = [b[0] + dx, b[1] + dy], k = stepKey(b, nb);
      if (stop(b) || !left.has(k) || left.get(k) !== kind) break;
      left.delete(k); keys.push(k); b = nb;
    }
    for (;;) {
      const na = [a[0] - dx, a[1] - dy], k = stepKey(na, a);
      if (stop(a) || !left.has(k) || left.get(k) !== kind) break;
      left.delete(k); keys.unshift(k); a = na;
    }
    lines.push({ a, b, kind, steps: keys });
  }
  return lines;
}

// distance from point p to segment a-b (any units)
export function distToSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}
