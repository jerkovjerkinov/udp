// Small 3d vector helpers. Vectors are plain [x, y, z] arrays; nothing here mutates.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const neg = a => [-a[0], -a[1], -a[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// rotate point p about the line through P with unit direction a, by th radians (Rodrigues)
export function rotateAbout(p, P, a, th) {
  const v = sub(p, P), c = Math.cos(th), s = Math.sin(th);
  const k = dot(a, v) * (1 - c), w = cross(a, v);
  return [
    P[0] + v[0] * c + w[0] * s + a[0] * k,
    P[1] + v[1] * c + w[1] * s + a[1] * k,
    P[2] + v[2] * c + w[2] * s + a[2] * k];
}
