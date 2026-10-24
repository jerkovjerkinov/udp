// Oblique: the ways architects show a building other than plan, section and
// elevation. One pack per way of showing, one thing to do with your hands in
// each (see the research report, 2026-10-24).
//
//   A  Viewpoint   anamorphosis, after Felice Varini: a figure is painted
//                  across a street so that it is whole from one direction only.
//                  Turn the view until it comes together.
//
// Levels follow the ladder of the other games: introduce (1-2), develop
// (3-4), twist (5-6), a breather (7) and a showpiece (8).
//
//   B  House IV    transformation, after Peter Eisenman's House IV: a block
//                  becomes a building through a series of moves, and the order
//                  of the moves matters. Pick the moves, in order, that turn
//                  the block into the building drawn on the card.
//
// A find level names its scene (parts: [builder, ...args], from drawforms.js
// PARTS), the figure ({ kind, size, at: [u, w] } on the picture plane, see
// anamorph.js FIGURES), the view it is painted for (yaw, pitch in degrees, as
// the camera rig counts them) and the view the level starts from.

const B = (...a) => ['box', ...a];
const G = (...a) => ['gableX', ...a];
const GY = (...a) => ['gableY', ...a];
const L = (id, name, o) => ({ id, name, task: 'find', ...o });
// a moves level: start is a box of cells [[x0, x1], [y0, y1], [z0, z1]]; hand
// the moves on offer (houseiv.js, each with a label); answer the hand's
// indices in order; ordered: true when the reverse order makes another form
const M = (id, name, o) => ({ id, name, task: 'moves', slots: o.answer.length, ...o });
const cut = (label, sel) => ({ kind: 'cut', sel, label });
const slide = (label, sel, by) => ({ kind: 'slide', sel, by, label });
const add = (label, box) => ({ kind: 'add', box, label });
const turn = (label, q = 1) => ({ kind: 'turn', q, label });
const mirror = (label, axis) => ({ kind: 'mirror', axis, label });

export const PACKS = [
  { id: 'A', name: 'Viewpoint', brief: 'A figure is painted across walls, roofs and the ground, so that it is whole from one direction only. From anywhere else it falls apart. Turn the view until it comes together.', levels: [
    // the toy: two walls, one behind the other; a quarter turn away
    L('A1', 'Two walls', { parts: [B(0, 0, 0, 3, .5, 2.5), B(0, 3, 0, 4, .5, 4)], figure: { kind: 'disc', size: 1.2 }, view: [-70, 22], start: [-125, 30],
      learn: 'From the right direction the pieces on the near wall and the far wall close into one disc. The figure was painted for that view alone.' }),
    // the same on three walls at three depths, a frame this time
    L('A2', 'Three walls', { parts: [B(0, 0, 0, 1.5, .5, 3), B(2, 2, 0, 1.5, .5, 2.5), B(4, 4, 0, 1.5, .5, 3.5), B(-1, 6, 0, 7, .5, 4)], figure: { kind: 'frame', size: 1.7 }, view: [-110, 20], start: [-60, 34],
      learn: 'The square frame was spread over three walls and the ground between them. Its corners only meet when every wall stands where the painter stood.' }),
    // develop: a stair, a triangle; now the view also has to come down
    L('A3', 'Stairs', { parts: [B(0, 0, 0, 3, 1, .8), B(0, 1, 0, 3, 1, 1.6), B(0, 2, 0, 3, 1, 2.4), B(0, 3, 0, 3, 1, 3.2)], figure: { kind: 'triangle', size: 1.6, at: [0, .2] }, view: [-35, 40], start: [-110, 20],
      learn: 'Treads and risers break the triangle into strips. From the painted view they line up again, so the steps vanish into one flat figure.' }),
    // develop: houses in a row, a ring across their roofs
    L('A4', 'A row of houses', { parts: [G(0, 0, 3, 2, 1.5, 2.5), G(3.5, .8, 2.5, 2, 1, 2), G(6.5, 0, 3, 2, 2, 3)], figure: { kind: 'ring', size: 1.9, at: [0, .4] }, view: [-100, 32], start: [-150, 22],
      learn: 'A ring over gables and slopes: every roof plane carries a short arc, and they only meet in the one view.' }),
    // twist: looked at from high up, most of it lies on the ground
    L('A5', 'Courtyard from above', { parts: [GY(0, 0, 2, 5, 1, 2), GY(4, 0, 2, 5, 1, 2), G(0, 5, 6, 2, 1, 2)], figure: { kind: 'disc', size: 2.1, at: [0, 0] }, view: [-80, 66], start: [-120, 25],
      learn: 'Seen from high up, the disc lies mostly on the court floor and climbs the roofs at its edge. Pitch matters as much as the turn.' }),
    // twist, harder: a cross down a street, looked at along it
    L('A6', 'A street', { parts: [G(0, 0, 2, 2, 1.5, 2.5), G(0, 2.5, 2, 2, 1, 2), G(3.5, 0, 2, 2, 2, 3), G(3.5, 2.5, 2, 2, 1.5, 2.5), B(1.2, 5.5, 0, 3.1, 1, 3.8)], figure: { kind: 'cross', size: 1.7, at: [0, .4] }, view: [-82, 22], start: [-150, 36],
      learn: 'Looking along the street, the cross falls on the house fronts, the far wall and the road between. The street disappears into it.' }),
    // breather: one big block and a square, easy to find
    L('A7', 'One block', { parts: [B(0, 0, 0, 3, 3, 3)], figure: { kind: 'square', size: 1.2, at: [0, .3] }, view: [-160, 30], start: [-112.5, 28],
      learn: 'On a single block the square folds over a corner: two walls and the roof. The fold vanishes when you stand where the painter did.' }),
    // showpiece: a small town and two rings, after Varini's arcs
    L('A8', 'Town', { parts: [G(0, 0, 3, 2, 1.5, 2.5), B(3.5, 0, 0, 1.5, 1.5, 4), ['pyramidOn', 3.5, 0, 1.5, 1.5, 4, 1], G(0, 3, 2.5, 2, 1, 2), G(3, 3, 3, 2.5, 2, 3.2), B(6, 1, 0, 2, 4, 1.5)], figure: { kind: 'target', size: 2, at: [0, .5] }, view: [-145, 34], start: [-60, 22],
      learn: 'Two rings across a whole town: walls, a tower, roofs and the square. Every surface takes a part, and the figure is whole only from here.' }),
  ] },
  { id: 'B', name: 'House IV', brief: 'Peter Eisenman drew House IV as a row of drawings, a block changed one move at a time. Here the card shows the building; pick the moves, in order, that turn the block into it.', levels: [
    // the toy: one move, one cut
    M('B1', 'A corner cut', { start: [[0, 2], [0, 2], [0, 1]], hand: [cut('Cut out the front right corner', { x: [2, 2], y: [0, 0] })], answer: [0],
      learn: 'One move, and the block is a building with a porch. Every later sheet is a few of these in a row.' }),
    // two moves, in either order
    M('B2', 'Two moves', { start: [[0, 2], [0, 2], [0, 1]], hand: [cut('Cut the top off the back row', { y: [2, 2], z: [1, 1] }), slide('Lift the front row', { y: [0, 0] }, [0, 0, 1])], answer: [1, 0],
      learn: 'These two moves touch different parts of the block, so either order makes the same building.' }),
    // develop: the order matters
    M('B3', 'Order matters', { start: [[0, 2], [0, 2], [0, 2]], hand: [cut('Cut away the right third', { x: [2, 2] }), slide('Slide the top floor one to the right', { z: [2, 2] }, [1, 0, 0])], answer: [0, 1], ordered: true,
      learn: 'Cut first and the whole top floor slides out over the edge, a cantilever. Slide first and the cut splits the moved floor, leaving a piece in the air. Same two moves, two buildings.' }),
    // develop: a quarter turn changes what "left" means
    M('B4', 'A quarter turn', { start: [[0, 3], [0, 1], [0, 0]], hand: [turn('Turn the block a quarter turn'), add('Raise a tower on the left end', [[0, 0], [0, 1], [1, 2]])], answer: [1, 0], ordered: true,
      learn: 'The tower went up on the left end and then turned with the block. Raise it after the turn and it stands somewhere else.' }),
    // twist: one move in the hand is not needed
    M('B5', 'One too many', { start: [[0, 2], [0, 2], [0, 1]], hand: [cut('Cut a court into the top', { x: [1, 1], y: [1, 1], z: [1, 1] }), mirror('Mirror it to the right', 'x'), slide('Push the left side forward', { x: [0, 0] }, [0, -1, 0])], answer: [0, 2],
      learn: 'Reading the drawing tells you which moves are in it: a court and a side pushed forward, but no mirror copy.' }),
    // twist, harder: a mirror, and when to make it
    M('B6', 'Mirror', { start: [[0, 1], [0, 2], [0, 0]], hand: [mirror('Mirror it to the right', 'x'), add('Raise a tower on the front left corner', [[0, 0], [0, 0], [1, 2]])], answer: [1, 0], ordered: true,
      learn: 'Raise the tower and then mirror, and the copy brings a second tower. Mirror first and there is only one.' }),
    // breather: which one move
    M('B7', 'Which move', { start: [[0, 2], [0, 2], [0, 1]], hand: [cut('Cut the top off the front row', { y: [0, 0], z: [1, 1] }), cut('Cut the top off the back row', { y: [2, 2], z: [1, 1] }), cut('Cut the top off the left row', { x: [0, 0], z: [1, 1] })], answer: [1],
      learn: 'Three cuts that sound alike. The drawing shows where the step is, and so which one it was.' }),
    // showpiece: three moves from a cube, with a turn on offer that is not needed
    M('B8', 'House IV', { start: [[0, 2], [0, 2], [0, 2]], hand: [slide('Slide the top floor back', { z: [2, 2] }, [0, 1, 0]), turn('Turn the block a quarter turn'), cut('Cut a shaft down the middle', { x: [1, 1], y: [1, 1] }), cut('Cut a porch under the front right corner', { x: [2, 2], y: [0, 0], z: [0, 1] })], answer: [2, 0, 3], ordered: true,
      learn: 'A shaft, a floor slid back over it, a porch: three moves, and each answers the one before, the way Eisenman said a house is a game of chess.' }),
  ] },
];
