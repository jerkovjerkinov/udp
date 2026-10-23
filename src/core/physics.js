// Build Order physics: does what is left standing stand?
//
// The parts of a tectonics.js model become rigid bodies in a Rapier world, each
// piece a convex hull, on a fixed ground, under gravity with dry friction: dry
// stone, timber laid on timber. The world runs for a little over a second; a
// part that has moved or turned more than a hair in that time is falling.
// The same world, run on, is the collapse the player sees.
//
// Geometry still decides whether a part can move at all (tectonics.js sweeps);
// this decides whether the building survives the move.

import RAPIER from '@dimforge/rapier3d-compat';

let ready = null;
export const loadPhysics = () => ready || (ready = RAPIER.init().then(() => RAPIER));

const GAP = .004;
const DENSITY = { stone: 2.4, timber: .6, steel: 7.8, concrete: 2.4, glass: 2.5 };
const FRICTION = { stone: .7, timber: .55, steel: .45, concrete: .7, glass: .5 };

// a world with these parts in it (at rest where the model has them)
export function createWorld(m, ids, { gravity = 9.81, lean = [0, 0] } = {}) {
  const R = RAPIER;
  const world = new R.World({ x: lean[0] * gravity, y: lean[1] * gravity, z: -gravity });
  world.integrationParameters.numSolverIterations = 8;
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  world.createCollider(R.ColliderDesc.cuboid(200, 200, .5).setTranslation(0, 0, -.5).setFriction(.8), ground);
  const bodies = new Map();
  for (const id of ids) {
    const p = m.byId.get(id);
    const c = p.centre;
    const desc = p.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic();
    const body = world.createRigidBody(desc.setTranslation(c[0], c[1], c[2]).setCanSleep(true));
    for (const pc of p.pieces) {
      // a hair smaller than drawn, so faces that touch start apart and do not kick
      const b = pc.bbox, k = [0, 1, 2].map(a => { const h = (b[a + 3] - b[a]) / 2; return h > GAP * 4 ? 1 - GAP / h : 1; });
      const mid = [0, 1, 2].map(a => (b[a] + b[a + 3]) / 2);
      const pts = new Float32Array(pc.verts.flatMap(v => [0, 1, 2].map(a => mid[a] + (v[a] - mid[a]) * k[a] - c[a])));
      const cd = R.ColliderDesc.convexHull(pts);
      if (!cd) continue;
      cd.setDensity(DENSITY[p.mat] || 1).setFriction(FRICTION[p.mat] || .6).setRestitution(0);
      world.createCollider(cd, body);
    }
    bodies.set(id, body);
  }
  // fixings: a part nailed, bolted or hung on another holds to it while both are there
  const I = { x: 0, y: 0, z: 0, w: 1 };
  for (const id of ids) for (const to of m.byId.get(id).fix || []) {
    if (!bodies.has(to)) continue;
    const a = m.byId.get(id).centre, b = m.byId.get(to).centre;
    world.createImpulseJoint(R.JointData.fixed({ x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] }, I, { x: 0, y: 0, z: 0 }, I), bodies.get(id), bodies.get(to), true);
  }
  return { world, bodies, start: new Map([...bodies].map(([id, b]) => [id, { t: { ...b.translation() }, r: { ...b.rotation() } }])) };
}

// how far each body has gone from where it started: [moved, turned (radians)]
export function drift(W, id, s = W.start.get(id)) {
  const b = W.bodies.get(id);
  const t = b.translation(), r = b.rotation();
  const moved = Math.hypot(t.x - s.t.x, t.y - s.t.y, t.z - s.t.z);
  const d = Math.abs(r.x * s.r.x + r.y * s.r.y + r.z * s.r.z + r.w * s.r.w);
  return [moved, 2 * Math.acos(Math.min(1, d))];
}

// Does it stand? Runs the world for `seconds`; returns { stands, falling: ids }
// A body that is falling keeps moving; one that only settles onto its seat
// stops within a few frames. So: a short settling, then a second of watching.
// It is watched twice, with gravity leaning a little one way and then the
// other, so nothing passes that only balances on a knife edge: what stands
// has a margin, as a building must.
// (two directions at right angles, so no knife edge can lie along both)
export const LEANS = [[.019, .007], [-.007, .019]];
// Returns { stands, falling: ids, lean }: lean is the one it fell under (for runWorld).
export function settle(m, ids, o = {}) {
  const falling = new Set();
  let lean = null;
  for (const l of LEANS) {
    const f = settleOnce(m, ids, { ...o, lean: l }).falling.filter(id => !(o.ignore || []).includes(id));
    if (f.length && !lean) lean = l;
    for (const id of f) falling.add(id);
  }
  return { stands: !falling.size, falling: [...falling], lean: lean || LEANS[0] };
}
function settleOnce(m, ids, { seconds = 1, move = .015, turn = .015, far = .2, lean = [0, 0] } = {}) {
  const W = createWorld(m, ids, { lean });
  for (let i = 0; i < 12; i++) W.world.step();
  const mid = new Map([...W.bodies].map(([id, b]) => [id, { t: { ...b.translation() }, r: { ...b.rotation() } }]));
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) W.world.step();
  const falling = [...W.bodies.keys()].filter(id => {
    const [a0, b0] = drift(W, id), [a, b] = drift(W, id, mid.get(id));
    return a0 > far || b0 > far || a > move || b > turn;
  });
  W.world.free();
  return { stands: !falling.length, falling };
}

// The same world, run for the eye: step(n) moves it on n frames; poses() gives
// each part's centre and turn. Free it when done.
export function runWorld(m, ids, { lean = LEANS[0] } = {}) {
  const W = createWorld(m, ids, { lean });
  return {
    step(n = 1) { for (let i = 0; i < n; i++) W.world.step(); },
    poses() { return [...W.bodies].map(([id, b]) => ({ id, c: b.translation(), q: b.rotation() })); },
    asleep() { return [...W.bodies.values()].every(b => b.isSleeping() || b.isFixed()); },
    free() { W.world.free(); },
  };
}

// stable(set) for the sequence searches in tectonics.js, remembered per set
export function stableOracle(m) {
  const memo = new Map();
  const f = set => {
    const k = [...set].sort().join(',');
    if (!memo.has(k)) memo.set(k, settle(m, [...set]).stands);
    return memo.get(k);
  };
  f.memo = memo;
  return f;
}
