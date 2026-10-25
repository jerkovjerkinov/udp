// node tests/core/sun.test.mjs — Sun Study: the sun, and the shadows it leaves
import { sunDir, dayOf, altitude, CLASSIC, partOf, darkAt, darkMask, polyMask, overlap, runsOf, siteBox, topAt, SEASONS, columnShadow, convexMeet, windowSuns, envelopeOf, shadesAt, unionMask, hullOf } from '../../src/core/sun.js';
import { PARTS } from '../../src/core/drawforms.js';
import { PACKS } from '../../games/sunstudy/levels.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const build = parts => parts.map(([k, ...a]) => partOf(PARTS[k](...a)));

// the sun over Istanbul
const noonEq = sunDir(41, 'equinox', 12);
ok(near(altitude(noonEq), 49, 1e-6), 'equinox noon at 41° N: 49° up');
ok(near(noonEq[0], 0) && noonEq[1] < 0, 'at noon the sun is due south');
ok(near(altitude(sunDir(41, 'summer', 12)), 72.44, .01), 'midsummer noon: 72.4° up');
ok(near(altitude(sunDir(41, 'winter', 12)), 25.56, .01), 'midwinter noon: 25.6° up');
ok(sunDir(41, 'equinox', 9)[0] > 0 && sunDir(41, 'equinox', 15)[0] < 0, 'morning sun in the east, afternoon in the west');
const [rise, set] = dayOf(41, 'equinox');
ok(near(rise, 6, 1e-6) && near(set, 18, 1e-6), 'the equinox day runs 6 to 18');
ok(dayOf(41, 'winter')[1] - dayOf(41, 'winter')[0] < 9.5 && dayOf(41, 'summer')[1] - dayOf(41, 'summer')[0] > 14.5, 'short winter days, long summer days');
ok(near(altitude(sunDir(41, 'equinox', set)), 0, 1e-6), 'the sun sets on the horizon');
ok(near(CLASSIC[0], CLASSIC[1]) && near(CLASSIC[2], -CLASSIC[0]) && near(Math.hypot(...CLASSIC), 1), 'the classic sun is a cube diagonal');

// a block one high: a shadow offset one north and one east
const block = build([['box', 0, 0, 0, 2, 2, 1]]);
ok(darkAt(block, CLASSIC, 2.5, 2.5), 'the corner of the shadow, north-east of the block');
ok(darkAt(block, CLASSIC, 2.9, 1.1) && !darkAt(block, CLASSIC, 2.9, .7), 'the shadow edge runs at 45° off the corner');
ok(!darkAt(block, CLASSIC, 1, 1), 'the block’s own top is lit');
ok(!darkAt(block, CLASSIC, -.5, 1) && !darkAt(block, CLASSIC, 3.2, 3.2), 'lit ground to the south-west and beyond the shadow');
ok(near(topAt(block, 1, 1).z, 1) && topAt(block, 5, 5).z === 0, 'the top surface over the plan');

// shadows on a roof: offset by the height difference
const tower = build([['box', 0, 0, 0, 1, 1, 3], ['box', 1, 1, 0, 3, 3, 1]]);
ok(darkAt(tower, CLASSIC, 2.5, 2.5) && !darkAt(tower, CLASSIC, 3.3, 3.3), 'the tower’s shadow on the low roof stops two modules out');

// a roof turned away from a low sun is in shade
const gable = build([['gableX', 0, 0, 3, 2, 1, 2]]);
ok(darkAt(gable, [0, -.3, .2].map(v => v / Math.hypot(0, .3, .2)), 1.5, 1.7), 'the north slope, in shade from a low southern sun');

// masks and overlap
const box = siteBox(block, [CLASSIC]);
const m = darkMask(block, CLASSIC, box, .05);
const drawn = polyMask([[[2, 0], [3, 1], [3, 3], [1, 3], [0, 2], [2, 2]]], box, .05);
ok(overlap(m, drawn) > .99, `drawing the L of the shadow scores ${overlap(m, drawn).toFixed(3)}`);
const over = polyMask([[[0, 0], [2, 0], [3, 1], [3, 3], [1, 3], [0, 2]]], box, .05);
ok(overlap(m, over) < .6, 'shading the lit roof as well is wrong: the roof is in the sun');
ok(overlap(m, polyMask([[[2, 0], [3, 1], [3, 3]]], box, .05)) < .5, 'half a shadow scores low');
const back = polyMask(runsOf(m).map(([[a, b], [c, d]]) => [[a, b], [c, b], [c, d], [a, d]]), box, .05);
ok(overlap(m, back) === 1, 'a mask’s own runs draw it exactly');

// the solar envelope
const sq = hullOf([[0, 0], [1, 0], [1, 1], [0, 1], [.5, .5]]);
ok(sq.length === 4, 'a hull drops inner points');
const noonCol = columnShadow([0, 0, 1, 1], 2, 0, noonEq);
ok(noonCol && near(Math.max(...noonCol.map(p => p[1])), 1 + 2 / Math.tan(49 * Math.PI / 180), 1e-6), 'a column’s noon shadow reaches h / tan(alt) north');
ok(columnShadow([0, 0, 1, 1], 1, 1, noonEq) === null, 'a column below the fence throws nothing on it');
ok(convexMeet([[0, 0], [2, 0], [2, 2], [0, 2]], [[1, 1], [3, 1], [3, 3], [1, 3]]) && !convexMeet([[0, 0], [1, 0], [1, 1], [0, 1]], [[1, 0], [2, 0], [2, 1], [1, 1]]), 'polygons meet by area, not by a shared edge');
ok(windowSuns('equinox', 9, 15).length === 25, 'the owed hours, every quarter hour');
const rectOf = ([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]];

// the levels
for (const pk of PACKS) for (const l of pk.levels) {
  if (l.task === 'fence') {
    const gardens = l.gardens.map(rectOf), suns = windowSuns(l.season, l.from, l.to);
    const caps = envelopeOf(l.plots, l.zf, gardens, suns);
    ok(caps.reduce((a, b) => a + b, 0) >= 3, `${l.id}: floors to build (${caps})`);
    ok(caps.every(c => c < 12), `${l.id}: every plot is held down by the light (${caps})`);
    // the cap is exact: one floor more shades a garden, and nothing below it does
    l.plots.forEach((p, i) => {
      ok(shadesAt(p, caps[i] + 1, l.zf, gardens, suns) !== null, `${l.id}: plot ${i} one floor over its cap shades a garden`);
      ok(caps[i] === 0 || shadesAt(p, caps[i], l.zf, gardens, suns) === null, `${l.id}: plot ${i} at its cap keeps the gardens in sun`);
    });
    // and the sampled sweep agrees: at the caps no swept shadow lies in a garden
    const box = [[-8, -4], [16, 18]];
    const sweep = unionMask(l.plots.flatMap((p, i) => suns.map(({ sun }) => columnShadow(p, caps[i], l.zf, sun))), box, .1);
    const gm = unionMask(gardens, box, .1);
    ok(!sweep.bits.some((v, k) => v && gm.bits[k]), `${l.id}: the swept shadow stays out of the gardens`);
    ok(new Set(l.plots.map(p => p.join())).size === l.plots.length && l.plots.every(p => gardens.every(g => !convexMeet(rectOf([p[0], p[1], p[0] + p[2], p[1] + p[3]]), g))), `${l.id}: plots are distinct and off the gardens`);
    continue;
  }
  const parts = build(l.parts);
  if (l.task === 'cast') {
    const b = siteBox(parts, [CLASSIC]);
    const mk = darkMask(parts, CLASSIC, b, .05);
    const n = mk.bits.reduce((s, v) => s + v, 0);
    ok(n > 40, `${l.id}: a shadow to draw (${n} cells)`);
    // every corner of every part's ground shadow sits on the half-module dots
    for (const [k, ...a] of l.parts) for (const v of PARTS[k](...a).verts) {
      const g = [v[0] + v[2], v[1] + v[2]];
      ok(g.every(x => near(x * 2, Math.round(x * 2))), `${l.id}: a shadow corner on the dots (${g})`);
    }
  }
  if (l.task === 'hour') {
    const seasons = l.fixed ? Object.keys(SEASONS) : l.seasons || Object.keys(SEASONS);
    const goal = sunDir(41, l.season, l.hour);
    ok(altitude(goal) > 8, `${l.id}: the sun is up (${altitude(goal).toFixed(1)}°)`);
    const b = siteBox(parts, [goal]);
    const target = darkMask(parts, goal, b, .1);
    ok(seasons.includes(l.season), `${l.id}: the answer's season is on offer`);
    // only the answer matches: nothing else within the day of any season on offer
    let rivals = [];
    for (const s of seasons) {
      const [r0, r1] = dayOf(41, s);
      for (let h = Math.ceil(r0 * 4) / 4; h <= r1; h += .25) {
        if (l.fixed && Math.abs(h - l.hour) > 1e-9) continue;
        if (s === l.season && Math.abs(h - l.hour) < .5 + 1e-9) continue;
        if (altitude(sunDir(41, s, h)) < 4) continue;
        const o = overlap(target, darkMask(parts, sunDir(41, s, h), b, .1));
        if (o > .85) rivals.push(`${s} ${h} ${o.toFixed(2)}`);
      }
    }
    ok(!rivals.length, `${l.id}: no other moment looks like the card (${rivals.slice(0, 3).join('; ')})`);
    ok(l.start !== l.hour || (l.startSeason && l.startSeason !== l.season), `${l.id}: it does not start solved`);
  }
}

console.log(fails ? fails + ' failures' : 'sun: all pass');
process.exit(fails ? 1 : 0);
