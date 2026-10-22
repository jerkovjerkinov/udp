// Tweens and the one animation-frame loop every page shares.
//
// Nothing renders on its own: a stage draws only when something asked for a
// frame (render on demand). So the loop here runs only while a tween is alive
// or someone called requestFrame(). Each frame steps every tween first, then
// calls the frame-end hooks (onFrameEnd), which is where a stage renders. A
// tween's update and the render it causes therefore land in the same frame, and
// a stage redraws on every frame in which any tween ran, so a tween's update
// never has to call stage.invalidate() itself.
//
// With prefers-reduced-motion the end state of every tween is applied on the
// next frame (the done callbacks still run, so flows do not stall). Motion a
// player asked for explicitly can pass { essential: true } to keep a short,
// plain fade instead.

// ------------------------------------------------------------------
// easings: f(0) = 0, f(1) = 1
// ------------------------------------------------------------------

const backS = 1.25;                                       // slight overshoot (about 6 %)
const springK = 6.5, springW = 2 * Math.PI * 1.15;
const springEnd = 1 - Math.exp(-springK) * Math.cos(springW);

export const ease = {
  linear: t => t,
  cubicIn: t => t * t * t,
  cubicOut: t => 1 - Math.pow(1 - t, 3),
  cubicInOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  quintInOut: t => t < .5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2,
  expoOut: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  expoInOut: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
  // overshoots a little and comes back: hinges, snaps
  backOut: t => 1 + (backS + 1) * Math.pow(t - 1, 3) + backS * Math.pow(t - 1, 2),
  // a damped spring that settles on 1: parts dropping into place
  spring: t => t >= 1 ? 1 : (1 - Math.exp(-springK * t) * Math.cos(springW * t)) / springEnd,
};

// ------------------------------------------------------------------
// reduced motion
// ------------------------------------------------------------------

let forcedMotion = null;
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => forcedMotion ?? !!(mq && mq.matches);
// tests and a settings toggle can override the media query (null restores it)
export function setReducedMotion(v) { forcedMotion = v; }

// ------------------------------------------------------------------
// the loop
// ------------------------------------------------------------------

const tweens = new Set();
const endHooks = new Set();
const tickers = new Set();
let raf = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hasRaf = typeof requestAnimationFrame === 'function';

// ask for one frame (a stage calls this from invalidate)
export function requestFrame() {
  if (raf || !hasRaf) return;
  raf = requestAnimationFrame(frame);
}

function frame(t) {
  raf = 0;
  const active = tweens.size > 0 || tickers.size > 0;
  for (const tw of [...tweens]) stepTween(tw, t);
  for (const k of [...tickers]) if (k(t) === false) tickers.delete(k);
  for (const h of [...endHooks]) h(t, active);
  if (tweens.size || tickers.size) requestFrame();
}

// fn(time, animating) runs at the end of every frame the loop runs; animating is
// true when a tween or ticker ran in it (stages then redraw without being asked).
// Returns an unsubscribe.
export function onFrameEnd(fn) {
  endHooks.add(fn);
  return () => endHooks.delete(fn);
}

// fn(time) runs every frame until it returns false or the returned stop() is called
export function every(fn) {
  tickers.add(fn);
  requestFrame();
  return () => tickers.delete(fn);
}

// ------------------------------------------------------------------
// tweens
// ------------------------------------------------------------------

// animate({ from = 0, to = 1, duration = 400, delay = 0, ease, update(v, k), done() })
// update gets the eased value (from..to; numbers or equal-length arrays) and the
// raw progress k. Returns { cancel(), finish(), promise } where promise resolves
// true when the tween completes and false when it is cancelled.
export function animate(opts) {
  const o = { from: 0, to: 1, duration: 400, delay: 0, ease: ease.cubicOut, ...opts };
  const reduce = reducedMotion() && !o.essential;
  let resolve;
  const tw = {
    o, start: null,
    duration: reduce ? 0 : Math.max(0, o.duration),
    delay: reduce ? 0 : Math.max(0, o.delay),
    promise: new Promise(r => { resolve = r; }),
    finished: false,
  };
  tw.resolve = resolve;
  const handle = {
    promise: tw.promise,
    cancel() { if (!tw.finished) { tw.finished = true; tweens.delete(tw); tw.resolve(false); } },
    finish() { if (!tw.finished) { apply(tw, 1); end(tw); } },
    get running() { return !tw.finished; },
  };
  if (!hasRaf) { handle.finish(); return handle; }        // node, tests: jump to the end
  tweens.add(tw);
  requestFrame();
  return handle;
}

function stepTween(tw, t) {
  if (tw.start === null) tw.start = t;
  const local = t - tw.start - tw.delay;
  if (local < 0) return;
  const k = tw.duration ? Math.min(1, local / tw.duration) : 1;
  apply(tw, k);
  if (k >= 1) end(tw);
}

function apply(tw, k) {
  const { from, to } = tw.o, e = tw.o.ease(k);
  const v = Array.isArray(from) ? from.map((f, i) => f + (to[i] - f) * e) : from + (to - from) * e;
  tw.o.update?.(v, k);
}

function end(tw) {
  tw.finished = true;
  tweens.delete(tw);
  tw.o.done?.();
  tw.resolve(true);
}

// ------------------------------------------------------------------
// helpers for choreography
// ------------------------------------------------------------------

// a promise that resolves after ms (instantly-ish with reduced motion)
export const wait = (ms, { essential = false } = {}) =>
  new Promise(r => setTimeout(r, reducedMotion() && !essential ? 0 : ms));

// run steps one after another; each step is a function returning a promise, a
// tween handle, or nothing. Resolves when the last one is done.
export async function sequence(steps) {
  for (const s of steps) {
    const r = typeof s === 'function' ? s() : s;
    if (r && r.promise) await r.promise; else await r;
  }
}

// start fn(item, i) for each item, gap ms apart; resolves when every tween is done
export function stagger(items, fn, gap = 60) {
  const all = items.map((item, i) => {
    const h = fn(item, i, reducedMotion() ? 0 : i * gap);
    return h && h.promise ? h.promise : h;
  });
  return Promise.all(all);
}

// interpolate a value toward a target with a time constant (for followers such
// as a camera easing onto a moving target): returns the new value
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
