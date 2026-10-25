// Sun Study: the sun is the thing you move, and the shadow is a drawing.
// One pack per verb (see the design doc, 2026-10-25):
//
//   A  Cast   sciagraphy: the drawing-school sun, 45° in plan and elevation.
//             Draw the shadow on the plan; then the sun comes on and shows it.
//   B  Hour   the real sun over Istanbul (41° N). The card shows a shadow plan;
//             drag the sun through the day, and change the season, until the
//             shadows on the site are the ones on the card.
//
// Levels follow the ladder of the other games: introduce (1-2), develop
// (3-4), twist (5-6), a breather (7) and a showpiece (8).
//
// parts: [builder, ...args] from drawforms.js PARTS, in modules, y north.
// With the classic sun a shadow is offset north-east by the height that casts
// it, so whole and half-module heights keep every corner on the plan's dots.

const B = (...a) => ['box', ...a];
const P = (...a) => ['pyramidOn', ...a];
const C = (id, name, o) => ({ id, name, task: 'cast', ...o });
const H = (id, name, o) => ({ id, name, task: 'hour', ...o });

// a stepped pyramid of n terraces, each one module high, centred on (cx, cy)
const terraces = (cx, cy, n, w0) => Array.from({ length: n }, (_, i) => B(cx - (w0 - i) / 2, cy - (w0 - i) / 2, i, w0 - i, w0 - i, 1));
// an obelisk on its own
const obelisk = [B(0, 0, 0, .6, .6, 4), P(0, 0, .6, .6, 4, .6)];
// four wings round a court
const court = (hS, hN, hW, hE) => [B(0, 0, 0, 5, 1, hS), B(0, 4, 0, 5, 1, hN), B(0, 1, 0, 1, 3, hW), B(4, 1, 0, 1, 3, hE)];

export const PACKS = [
  { id: 'A', name: 'Cast', brief: 'The drawing-school sun comes over your left shoulder, 45° in plan and in elevation. Every shadow is pushed north-east by the height that casts it. Draw the shadow on the plan, then let the sun show you.', levels: [
    // the toy: one block, one module high
    C('A1', 'A block', { parts: [B(0, 0, 0, 2, 2, 1)],
      learn: 'A block one module high throws its shadow one module north and one east. The shadow is the top of the block, slid along the sun and joined back to the foot.' }),
    // a tall thin thing: the shadow of a line is a line
    C('A2', 'A pole', { parts: [B(0, 0, 0, .5, .5, 3)],
      learn: 'Three modules high, three modules over. A pole’s shadow is a long thin strip, and its end is the shadow of the top.' }),
    // develop: two heights, so two offsets
    C('A3', 'Two heights', { parts: [B(0, 0, 0, 3, 1, 1), B(0, 0, 0, 1, 3, 2)],
      learn: 'Each part throws its own shadow, offset by its own height. The shadow of the whole is the two laid over each other.' }),
    // develop: a gable, the ridge throws the furthest point
    C('A4', 'A gable', { parts: [['gableX', 0, 0, 3, 2, 1, 1.5]],
      learn: 'The ridge is the highest line, so its shadow lies furthest out. The eaves throw the shadow’s near edge.' }),
    // twist: the shadow lands on another roof, and is shorter there
    C('A5', 'On the roof', { parts: [B(0, 0, 0, 1, 1, 3), B(1, 1, 0, 3, 3, 1)],
      learn: 'Where the tower’s shadow falls on the low roof it is cut short: the roof is a module up, so the shadow there is offset by two, not three.' }),
    // twist, harder: a canopy, the shadow comes away from the thing that throws it
    C('A6', 'A canopy', { parts: [B(0, 0, 1.5, 3, 2, .5), B(0, 0, 0, .5, .5, 1.5), B(2.5, 0, 0, .5, .5, 1.5), B(0, 1.5, 0, .5, .5, 1.5), B(2.5, 1.5, 0, .5, .5, 1.5)],
      learn: 'A roof held up on posts throws its shadow away from its own feet. Between them the ground stays lit, and the thin posts tie the two together.' }),
    // breather: a wall
    C('A7', 'A wall', { parts: [B(0, 0, 0, 4, .5, 2)],
      learn: 'A long wall throws a long band, two modules over. A garden wall on a plan is drawn with exactly this band.' }),
    // showpiece: a court, shadows falling into it
    C('A8', 'Courtyard house', { parts: court(1, 2, 1, 1),
      learn: 'The south and west wings throw their shadows into the court, the tall north wing throws its own out beyond. A court is a room the sun moves round.' }),
  ] },
  { id: 'B', name: 'Hour', brief: 'This is the real sun over Istanbul. The card shows where the shadows lay at one moment. Drag the sun through the day, and change the season, until the site looks like the card.', levels: [
    // the toy: a sundial, one season
    H('B1', 'Sundial', { parts: obelisk, season: 'equinox', hour: 15, seasons: ['equinox'], start: 9,
      learn: 'In the morning the shadow points west, at noon due north, in the afternoon east. A sundial is just this, read the other way round.' }),
    // the seasons: the same stone in winter
    H('B2', 'Winter', { parts: obelisk, season: 'winter', hour: 10, start: 12,
      learn: 'In winter the sun stays low, so the same stone throws a shadow far longer than at the equinox, and the day is short.' }),
    // develop: two towers
    H('B3', 'Two towers', { parts: [B(0, 0, 0, 1, 1, 4), B(3, 2, 0, 1, 1, 2)], season: 'equinox', hour: 9, start: 14,
      learn: 'Two shadows turn together like two hands of one clock. Their length tells the season, their direction the hour.' }),
    // develop: a court at noon
    H('B4', 'Court at noon', { parts: court(2, 1, 1, 1), season: 'winter', hour: 12, start: 9,
      learn: 'At midwinter noon the sun is only 25° up, and the south wing fills most of the court with shadow. In summer the same court is almost all in sun.' }),
    // twist: the hour is given, the season is not
    H('B5', 'Same hour', { parts: [B(0, 0, 0, 3, 1, 2), B(0, 0, 0, 1, 3, 3)], season: 'summer', hour: 16, fixed: true, start: 16, startSeason: 'winter',
      learn: 'At four in the afternoon the summer sun is still high and well round to the west; in winter it is about to set. Same clock, another sky.' }),
    // twist, harder: a street running north
    H('B6', 'A street', { parts: [['gableY', 0, 0, 2, 6, 2, 3], ['gableY', 4, 0, 2, 6, 2, 3]], season: 'equinox', hour: 10.5, start: 15,
      learn: 'A street running north gets the sun on its floor only around noon. In the morning the eastern houses shade it, in the afternoon the western ones.' }),
    // breather: a long wall in summer
    H('B7', 'A long wall', { parts: [B(0, 0, 0, 6, .4, 2)], season: 'summer', hour: 6.5, start: 13,
      learn: 'Early on a midsummer morning the sun is north of east, so the wall throws its shadow to the south, onto the side that is in sun for the rest of the day.' }),
    // showpiece: a stepped pyramid, after El Castillo at Chichén Itzá
    H('B8', 'The serpent', { parts: terraces(0, 0, 5, 7), season: 'equinox', hour: 16.5, start: 11,
      learn: 'At Chichén Itzá the stepped corners of the pyramid throw a row of triangles down the stair rail at the equinox, a serpent sliding down to its stone head. The same steps throw this saw-tooth here.' }),
  ] },
];
