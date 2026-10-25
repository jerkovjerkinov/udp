// Sun Study: the sun is the thing you move, and the shadow is a drawing.
// One pack per verb (see the design doc, 2026-10-25):
//
//   A  Cast   sciagraphy: the drawing-school sun, 45° in plan and elevation.
//             Draw the shadow on the plan; then the sun comes on and shows it.
//   B  Hour   the real sun over Istanbul (41° N). The card shows a shadow plan;
//             drag the sun through the day, and change the season, until the
//             shadows on the site are the ones on the card.
//   C  Shadow fence  Ralph Knowles's solar envelope: build floors on a lot, but
//             no shadow may reach the neighbours' gardens in the hours they are
//             owed sun. Floors are one module; the envelope is the answer.
//   D  Light in  the shadow turned inside out: open cells in a wall or the
//             roof of a closed room until the sun patch lands on its mark.
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
const F = (id, name, o) => ({ id, name, task: 'fence', zf: 0, season: 'equinox', from: 9, to: 15, ...o });
const I = (id, name, o) => ({ id, name, task: 'light', room: [4, 4, 3], cell: .5, ...o });
// plots of a lot: c x r plots, each w x d modules
const plots = (x, y, c, r, w = 1, d = w) => Array.from({ length: c * r }, (_, k) => [x + (k % c) * w, y + Math.floor(k / c) * d, w, d]);

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
  { id: 'C', name: 'Shadow fence', brief: 'Build as high as you like, but the neighbours are owed their sun. In the hours on the card no shadow of yours may land in their gardens. Tap a plot to add a floor, hold it to take one off.', levels: [
    // the toy: one tower, a street, a garden
    F('C1', 'One tower', { plots: [[0, 0, 2, 2]], gardens: [[-3, 5, 5, 8]],
      learn: 'At the equinox every shadow reaches 0.87 of its height to the north, all day long. Three modules of street buy three floors.' }),
    // a row of three plots: the building steps up away from the garden
    F('C2', 'A row', { plots: plots(0, 0, 1, 3, 3, 1), gardens: [[-2, 5, 5, 8]],
      learn: 'Each module further from the garden buys about one more floor. The envelope is a slope, and the building steps down toward the neighbour.' }),
    // develop: a garden to the north-east, and a longer day
    F('C3', 'Longer hours', { plots: plots(0, 0, 3, 3), gardens: [[4, 3, 8, 7]], from: 8, to: 16,
      learn: 'A garden to the north-east is reached by the long shadows of the afternoon. Owe it sun from 8 to 16 and the lot loses three floors it could keep from 9 to 15.' }),
    // develop: the fence lifts
    F('C4', 'A fence', { plots: plots(0, 0, 1, 3, 3, 1), gardens: [[-2, 5, 5, 8]], zf: 1,
      learn: 'The neighbour’s own wall shades the foot of the garden anyway, so the rule only protects it above the wall. Lift the shadow fence one module and every plot gains a floor.' }),
    // twist: two neighbours
    F('C5', 'Two neighbours', { plots: plots(0, 0, 3, 3), gardens: [[-1, 5, 4, 8], [5, -1, 8, 4]],
      learn: 'Owe sun to the north and to the east and the envelope slopes two ways: it peaks in the corner furthest from both gardens.' }),
    // twist, harder: the winter sun
    F('C6', 'Winter sun', { plots: plots(0, 0, 1, 6, 3, 1), gardens: [[-2, 9, 5, 12]], season: 'winter', from: 10, to: 14,
      learn: 'The midwinter sun is so low that every floor throws its shadow almost two and a half modules. Knowles set his envelopes by the winter, when sun is worth most.' }),
    // breather: a corner lot, the garden away to the north-west
    F('C7', 'Corner lot', { plots: plots(0, 0, 2, 2, 2), gardens: [[-5, 5, 0, 8]],
      learn: 'Only the plots nearest the garden are held down. A corner lot with its neighbour off to one side can build high where the shadows fall on the street.' }),
    // showpiece: four lots, each with its garden to the north
    F('C8', 'Four lots', { plots: [...plots(0, 0, 1, 2, 3, 1), ...plots(5, 0, 1, 2, 3, 1), ...plots(0, 7, 1, 2, 3, 1), ...plots(5, 7, 1, 2, 3, 1)],
      gardens: [[0, 4, 3, 7], [5, 4, 8, 7], [0, 11, 3, 14], [5, 11, 8, 14]],
      learn: 'Knowles’s students in Los Angeles built whole neighbourhoods this way: every house high at the south of its lot, low toward the next garden, and every garden in sun.' }),
  ] },
  { id: 'D', name: 'Light in', brief: 'A closed room, and a mark on its floor. Open cells in the wall or the roof, folded out beside the plan, until the sun falls on the mark at the hour given. Every opening you don’t need is light in the wrong place.', levels: [
    // the toy: a south window at noon, onto a table
    I('D1', 'A window', { plane: 'south', goals: [{ season: 'equinox', hour: 12, rect: [1.5, .9, 2.5, 1.7], name: 'table' }],
      learn: 'At noon the sun is due south, so a south window throws its patch straight in. The patch lies 0.87 of the window’s height into the room for every module it is up the wall.' }),
    // the same room, the morning sun through the east wall
    I('D2', 'Morning', { plane: 'east', goals: [{ season: 'equinox', hour: 9, cells: [[3, 2], [4, 2], [3, 3], [4, 3]], name: 'rug' }],
      learn: 'The morning sun comes in from the east and south, so the patch from an east window slides north-west across the floor, and leans.' }),
    // develop: an oculus, the patch straight down and pushed north
    I('D3', 'An oculus', { plane: 'roof', goals: [{ season: 'equinox', hour: 12, cells: [[3, 0], [4, 0], [3, 1], [4, 1]], name: 'mark' }],
      learn: 'Light from a hole in the roof lands north of the hole, by the room’s height times 0.87 at the equinox noon. In the Pantheon the disc of the oculus crosses the floor and climbs the walls through the day.' }),
    // develop: one opening, two hours
    I('D4', 'Two hours', { plane: 'south', goals: [{ season: 'equinox', hour: 10, cells: [[4, 2], [5, 2], [4, 3], [5, 3]], name: '10:00' }, { season: 'equinox', hour: 14, cells: [[4, 2], [5, 2], [4, 3], [5, 3]], name: '14:00' }],
      learn: 'One window, two patches: at ten the light leans one way across the floor, at two the other. The window sits between the two marks.' }),
    // twist: a slot, a line of light
    I('D5', 'A slot', { plane: 'south', room: [6, 5, 3], goals: [{ season: 'equinox', hour: 15, cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]], name: 'line' }],
      learn: 'A tall thin slot throws a long thin line. In the afternoon the sun is in the south-west, so the line runs in from the slot toward the north-east.' }),
    // twist, harder: an eave that keeps the summer out
    I('D6', 'Keep it out', { plane: 'south', room: [4, 6, 3], eaves: [[0, -.8, 2.9, 4, .8, .15]], goals: [{ season: 'winter', hour: 12, rect: [1, 3.2, 3, 5.4], name: 'desk' }], avoid: [{ season: 'summer', hour: 12 }],
      learn: 'The eave shades a south window from the high summer sun and lets the low winter sun under it, deep into the room. It is the oldest way to keep a house cool in July and warm in January.' }),
    // breather: a skylight in winter
    I('D7', 'A skylight', { plane: 'roof', goals: [{ season: 'winter', hour: 12, rect: [1, 3.6, 3, 5], name: 'bed' }], room: [4, 6, 1.5],
      learn: 'In a low room the winter sun still lands well north of a skylight: three modules for every one and a half of height. A skylight is placed by its patch, not by the bed under it.' }),
    // showpiece: a cross of light
    I('D8', 'A cross of light', { plane: 'east', room: [6, 5, 3], goals: [{ season: 'equinox', hour: 8.5, cells: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 3], [5, 3]], name: 'cross' }],
      learn: 'In Tadao Ando’s Church of the Light, near Osaka, a cross is cut clean through the concrete wall behind the altar. The sun lays the same cross on the floor and walls, and moves it as the morning goes.' }),
  ] },
];
