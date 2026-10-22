// Random helpers. Every generator takes its rng as an argument, so a seeded one
// (for a daily puzzle, or a test) can be passed in without swapping Math.random.

export const mathRng = () => Math.random();

// mulberry32, seeded from a string
export function seededRng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let seed = (h ^ (h >>> 16)) >>> 0;
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, n) => Math.floor(rng() * n);
export const pick = (rng, a) => a[randInt(rng, a.length)];

// Fisher-Yates, so a seeded rng gives the same order in every browser
export function shuffle(rng, a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
