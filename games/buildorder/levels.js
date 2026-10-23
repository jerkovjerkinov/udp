// Build Order: hand-placed levels. Each names its task and a structure from
// src/core/tectonics.js with its options; every one is checked by the tests,
// against the physics as well as the geometry.
//
// Geometry decides whether a part can move at all: it slides out (or in) only
// along a way nothing blocks. The physics (src/core/physics.js) decides whether
// what is left stands. Take out the wrong part and the building comes down.
//
// Tasks
//   dismantle  Take it apart: tap the parts out, one by one, in an order that stands
//   assemble   Put it together: the parts wait in an exploded axonometric; tap
//              them in, temporary works too, and strike the centering at the end
//   free       What comes out? Mark every part that could come out now without
//              bringing anything down
//   keep       Keep it up: take out as many parts as you can while the parts
//              outlined in orange stay up (task.target, a known order in task.order)
//   test       Stands or falls? Three versions of the building, each missing a
//              part or two: say whether it stands, then watch

const L = (id, task, name, build, opts = {}, extra = {}) => ({ id, task, name, build, opts, ...extra });

export const PACKS = [
  { id: 'A', name: 'Stone', brief: 'Posts and beams of stone, a row of columns, and walls with overlapping blocks. Dry stone is held up by its own weight alone, so pull out the wrong block and what it carried comes down.', levels: [
    L('A1', 'dismantle', 'Trilithon', 'trilithon'),
    L('A2', 'free', 'Colonnade', 'colonnade', { n: 3 }),
    L('A3', 'assemble', 'Trilithon', 'trilithon', { span: 3 }),
    L('A4', 'keep', 'Open wall', 'wall', { courses: 5, len: 3 }, { keep: '^w4_', target: 6, order: 'w2_1 w1_2 w3_0 w1_0 w3_2 w0_1' }),
    // twist: the balcony stone can't stand until the wall above holds its tail, so a prop goes in first
    L('A5', 'assemble', 'Stone balcony', 'balcony', { out: 1.6, prop: true }, { learn: 'A stone that juts out stays up only while the wall above presses its tail down. Until then, the prop held it.' }),
    // twist: the blocks that look freest, on top, are the ones holding the balcony
    L('A6', 'keep', 'Balcony', 'balcony', { out: 1.6 }, { keep: '^bal$', target: 7, order: 'w3_3 w1_2 w3_0 w0_1 w3_1 w2_0 w1_0', learn: 'The top blocks looked free, but they were the counterweight. Take them away and the balcony tips forward.' }),
    // breather: read the temple, part by part
    L('A7', 'free', 'Temple front', 'temple', { n: 4 }, { learn: 'Only parts with nothing resting on them, and a clear way out, can come away.' }),
    L('A8', 'dismantle', 'Temple front', 'temple', { n: 4 }),
  ] },
  { id: 'B', name: 'Arches', brief: 'An arch’s wedge-shaped stones can’t stand on their own. They rest on a timber frame, the centering, until the keystone goes in at the top. Then the arch holds itself up and pushes outward on its supports.', levels: [
    L('B1', 'assemble', 'Round arch', 'arch', { m: 5 }),
    // an experiment, in order: the arch on its own, without its keystone, and on its centering again
    L('B2', 'test', 'Without the keystone', 'arch', { m: 5 }, { cases: [
      { without: [], say: 'Here is the arch with its centering already taken away, so only the stones are left. Will it stand on its own?' },
      { without: ['v2'], say: 'Now the keystone, the stone at the very top, is left out, and there is still no centering. Will it stand?' },
      { without: ['v2'], with: ['c'], say: 'The keystone is still missing, but the centering is back under the stones. Will it stand?' },
    ], learn: 'An arch stands on its own only when the keystone locks it. Until then, the centering does the work.' }),
    L('B3', 'dismantle', 'Taking down an arch', 'arch', { m: 7 }),
    L('B4', 'assemble', 'Arcade', 'arcade', { count: 2 }),
    L('B5', 'assemble', 'Low arch', 'arch', { m: 5, r: 2.2, t: .7, h: 1.4 }),
    L('B6', 'free', 'Corbelled opening', 'corbel', { courses: 4 }),
    L('B7', 'assemble', 'Arcade of three', 'arcade', { count: 3 }),
    L('B8', 'test', 'Arcade', 'arcade', { count: 3 }),
  ] },
  { id: 'C', name: 'Timber', brief: 'Posts, beams, joists and boards, with a ridge and rafters nailed on top. A beam can lose a post, as long as its weight still sits between the posts that are left.', levels: [
    L('C1', 'dismantle', 'Deck', 'deck'),
    L('C2', 'free', 'Deck', 'deck', { joists: 4 }),
    L('C3', 'assemble', 'Pergola', 'pergola', { n: 3 }),
    L('C4', 'keep', 'Fewest posts', 'pergola', {}, { keep: '^t', target: 7, order: 'p01 p12 r4 r1 p10 r0 r3' }),
    L('C5', 'dismantle', 'Gable roof', 'gableRoof'),
    L('C6', 'assemble', 'Gable roof', 'gableRoof'),
  ] },
  { id: 'D', name: 'Joinery', brief: 'Joints cut into the wood itself, like halved joints, notched logs and pegged tenons, hold by their shape. A piece can only come out the way it went in.', levels: [
    L('D1', 'dismantle', 'Half lap', 'halfLap', { n: 1 }),
    L('D2', 'assemble', 'Half lap', 'halfLap', { n: 2 }),
    L('D3', 'dismantle', 'Log crib', 'logCrib', { courses: 4 }),
    L('D4', 'assemble', 'Keyed tenons', 'keyedFrame', { posts: 2 }),
    L('D5', 'free', 'Keyed tenons', 'keyedFrame', { posts: 3 }),
    L('D6', 'test', 'Log crib', 'logCrib', { courses: 5 }),
    L('D7', 'assemble', 'Lattice', 'halfLap', { n: 3 }),
  ] },
  { id: 'E', name: 'Steel', brief: 'Columns, beams, bolted braces and a floor deck. A brace slides out sideways, and a beam lifts off its columns.', levels: [
    L('E1', 'dismantle', 'Portal', 'steelFrame', { bays: 1, braced: false, deckOn: false }),
    L('E2', 'free', 'Braced bay', 'steelFrame', { bays: 1 }),
    L('E3', 'assemble', 'Braced bay', 'steelFrame', { bays: 1 }),
    L('E4', 'test', 'Two bays', 'steelFrame', { bays: 2 }),
    L('E5', 'keep', 'Fewest columns', 'steelFrame', { bays: 2 }, { keep: '^d', target: 7, order: 'x0_0 x0_1 c0_2_1 c0_0_0 c0_0_1 c0_2_0 t0_1' }),
    L('E6', 'assemble', 'Two storeys', 'steelFrame', { bays: 1, storeys: 2 }),
  ] },
  { id: 'F', name: 'Dom-ino', brief: 'Le Corbusier’s Dom-ino: floor slabs on columns, a stair to the side, and a skin hung on the slab edges. How few columns can a slab stand on?', levels: [
    L('F1', 'dismantle', 'Dom-ino', 'domino', { storeys: 1 }),
    L('F2', 'keep', 'Free plan', 'domino', { storeys: 1 }, { keep: '^(f|s\\d)$', target: 5, order: 'st c0_01 c0_20 c0_10 c0_11' }),
    L('F3', 'assemble', 'Dom-ino', 'domino', { storeys: 2 }),
    L('F4', 'test', 'Two storeys', 'domino', { storeys: 2 }),
    L('F5', 'free', 'Skin', 'domino', { storeys: 2, cladding: true }),
    L('F6', 'keep', 'Three slabs', 'domino', { storeys: 3, stair: false }, { keep: '^(f|s\\d)$', target: 8, order: 'c2_10 c1_11 c1_20 c2_01 c0_11 c0_00 c2_21 c1_00' }),
    L('F7', 'assemble', 'Skin, two storeys', 'domino', { storeys: 2, cladding: true }),
  ] },
];
