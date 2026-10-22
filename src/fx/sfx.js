// A small WebAudio synth: every sound is made from a sine, a triangle or a burst
// of filtered noise, so there are no asset files. Sounds are short and low in
// the mix; they confirm a touch, they never celebrate.
//
//   import { sfx } from '../../src/fx/sfx.js';
//   sfx.snap();  sfx.step(3);  sfx.play('thud');  sfx.toggle();
//
// Sound is off on the very first visit and the choice is remembered
// ('udp.sfx' in localStorage, wrapped in try/catch). Browsers only let an
// AudioContext start after a user gesture, so the context is created lazily on
// the first pointer or key press (or when the player turns sound on, which is
// itself a gesture). Nothing is created while muted.

const KEY = 'udp.sfx';
const NAMES = ['snap', 'tick', 'flap', 'punch', 'snip', 'slide', 'thud', 'error', 'done', 'pencil'];

function loadMuted() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v.muted === 'boolean' ? v.muted : true;
  } catch (e) { return true; }
}
function saveMuted(m) {
  try { localStorage.setItem(KEY, JSON.stringify({ muted: m })); } catch (e) { /* storage blocked */ }
}

let muted = loadMuted();
let ctx = null, out = null, noise = null, gestured = false;
const listeners = new Set();

function ensure() {
  if (muted || !gestured) return null;
  if (!ctx) {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    // master: quiet, a soft top cut, a gentle compressor so stacked sounds never clip
    const master = ctx.createGain(); master.gain.value = .34;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 7200; tone.Q.value = .5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = .003; comp.release.value = .2;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
    out = master;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

if (typeof window !== 'undefined') {
  const first = () => {
    gestured = true;
    ensure();
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
}

// ------------------------------------------------------------------
// voices
// ------------------------------------------------------------------

const vary = (x, k = .03) => x * (1 + (Math.random() * 2 - 1) * k);

// an enveloped oscillator; glide bends the pitch toward glideTo over glide seconds
function tone(c, t0, { f, type = 'sine', gain = .2, attack = .004, decay = .12, glideTo, glide = .08, filter }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + glide);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + attack + decay);
  let node = o;
  if (filter) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
  node.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + attack + decay + .05);
}

// a burst of filtered noise; sweepTo moves the filter over the burst
function hiss(c, t0, { type = 'bandpass', f = 2000, Q = 1, gain = .2, attack = .002, decay = .03, sweepTo }) {
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise;
  fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = Q;
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + attack + decay);
  s.connect(fl); fl.connect(g); g.connect(out);
  const off = Math.random() * .5;
  s.start(t0, off); s.stop(t0 + attack + decay + .05);
}

// the major pentatonic from G4, rising: correct sub-steps climb it
const PENTA = [0, 2, 4, 7, 9];
const stepFreq = i => {
  const k = Math.max(0, Math.min(14, i | 0));
  return 392 * Math.pow(2, (PENTA[k % 5] + 12 * Math.floor(k / 5)) / 12);
};

const VOICES = {
  // a soft click: something snapped to the lattice or an edge
  snap(c, t) {
    hiss(c, t, { f: vary(3400), Q: 2.2, gain: .32, decay: .014 });
    tone(c, t, { f: vary(1500), glideTo: 1050, glide: .03, gain: .05, decay: .03 });
  },
  // paper or card bending at a fold or hinge
  tick(c, t) {
    hiss(c, t, { f: vary(2300), Q: .9, gain: .22, decay: .028 });
    tone(c, t, { f: vary(240), gain: .05, decay: .035, type: 'triangle' });
  },
  // a sheet swinging through the air
  flap(c, t) {
    hiss(c, t, { type: 'lowpass', f: vary(2400), sweepTo: 380, Q: .8, gain: .2, attack: .014, decay: .16 });
  },
  // a hole punch: a low knock with a short bite
  punch(c, t) {
    tone(c, t, { f: vary(150), glideTo: 52, glide: .09, gain: .42, decay: .17 });
    hiss(c, t, { type: 'highpass', f: 1800, gain: .16, decay: .012 });
    hiss(c, t + .004, { type: 'lowpass', f: 650, gain: .18, decay: .05 });
  },
  // scissors: two quick blade clicks
  snip(c, t) {
    hiss(c, t, { f: vary(5200), Q: 3, gain: .2, decay: .014 });
    hiss(c, t + .048, { f: vary(4700), Q: 3, gain: .17, decay: .018 });
    tone(c, t + .048, { f: vary(3100), type: 'triangle', gain: .018, decay: .05 });
  },
  // a part sliding out of its seat
  slide(c, t) {
    hiss(c, t, { f: vary(950), sweepTo: 560, Q: .7, gain: .12, attack: .06, decay: .26 });
  },
  // something heavy coming down: collapse, a model landing
  thud(c, t) {
    tone(c, t, { f: vary(88), glideTo: 40, glide: .16, gain: .5, attack: .006, decay: .32 });
    hiss(c, t, { type: 'lowpass', f: 320, gain: .22, decay: .14 });
  },
  // a low, soft tone; never a buzzer
  error(c, t) {
    tone(c, t, { f: 196, glideTo: 182, glide: .3, type: 'triangle', gain: .13, attack: .02, decay: .36, filter: 900 });
    tone(c, t, { f: 98, gain: .06, attack: .02, decay: .3 });
  },
  // a short, restrained resolution: a fourth settling into a fifth
  done(c, t) {
    tone(c, t, { f: 392, type: 'triangle', gain: .07, attack: .008, decay: .32, filter: 2400 });
    tone(c, t + .11, { f: 523.25, type: 'triangle', gain: .08, attack: .008, decay: .9, filter: 2400 });
    tone(c, t + .11, { f: 783.99, gain: .035, attack: .03, decay: 1.1 });
  },
  // a graphite stroke
  pencil(c, t) {
    hiss(c, t, { type: 'highpass', f: vary(3800), Q: .6, gain: .07, attack: .02, decay: .09 });
  },
};

function play(name, i) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + .005;
  if (name === 'step') {
    const f = stepFreq(i);
    tone(c, t, { f, gain: .085, attack: .006, decay: .24 });
    tone(c, t, { f: f * 2, type: 'triangle', gain: .012, attack: .006, decay: .12 });
    return;
  }
  VOICES[name]?.(c, t);
}

export const sfx = {
  NAMES: [...NAMES, 'step'],
  play(name, i = 0) { play(name, i); },
  // a quiet rising pentatonic note for the i-th correct sub-step (0-based)
  step(i = 0) { play('step', i); },
  get muted() { return muted; },
  setMuted(m) {
    muted = !!m;
    saveMuted(muted);
    if (!muted) { gestured = true; ensure(); }
    else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    for (const fn of listeners) fn(muted);
  },
  toggle() { this.setMuted(!muted); return muted; },
  // fn(muted) after every change; returns an unsubscribe
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
for (const n of NAMES) sfx[n] = () => play(n);
