// Build Order: hand-placed levels. Each names its task and a structure from
// src/core/tectonics.js with its options; every one is checked by the tests.
//
// Tasks
//   dismantle  Take it apart: tap the parts out, one by one, in an order that works
//   assemble   Put it together: the parts wait in an exploded axonometric; tap
//              them in, temporary works too, and strike the centering at the end
//   free       What comes out? Mark every part that could come out now

const L = (id, task, name, build, opts = {}) => ({ id, task, name, build, opts });

export const PACKS = [
  { id: 'A', name: 'Stone', brief: 'Posts and lintels, a colonnade, walls in running bond. A block comes out only when nothing rests on it and nothing is in its way.', levels: [
    L('A1', 'dismantle', 'Trilithon', 'trilithon'),
    L('A2', 'free', 'Colonnade', 'colonnade', { n: 3 }),
    L('A3', 'dismantle', 'Colonnade', 'colonnade', { n: 3 }),
    L('A4', 'assemble', 'Trilithon', 'trilithon', { span: 3 }),
    L('A5', 'dismantle', 'Running bond', 'wall', { courses: 3, len: 3 }),
    L('A6', 'free', 'Running bond', 'wall', { courses: 4, len: 3 }),
    L('A7', 'assemble', 'Corbelled opening', 'corbel', { courses: 3 }),
    L('A8', 'dismantle', 'Temple front', 'temple', { n: 4 }),
  ] },
  { id: 'B', name: 'Arches', brief: 'Voussoirs stand only on the centering until the keystone locks them. The centering goes in first and comes out last; to take an arch down, it goes back under.', levels: [
    L('B1', 'assemble', 'Round arch', 'arch', { m: 5 }),
    L('B2', 'assemble', 'Seven stones', 'arch', { m: 7 }),
    L('B3', 'free', 'Corbelled opening', 'corbel', { courses: 4 }),
    L('B4', 'assemble', 'Arcade', 'arcade', { count: 2 }),
    L('B5', 'assemble', 'Low arch', 'arch', { m: 5, r: 2.2, t: .7, h: 1.4 }),
    L('B6', 'dismantle', 'Taking down an arch', 'arch', { m: 7 }),
    L('B7', 'assemble', 'Arcade of three', 'arcade', { count: 3 }),
    L('B8', 'assemble', 'Nine stones', 'arch', { m: 9, r: 2, t: .8 }),
  ] },
  { id: 'C', name: 'Timber', brief: 'Posts, beams, joists, boards; plates, a ridge, rafters and purlins. Every member rests on the ones below it.', levels: [
    L('C1', 'dismantle', 'Deck', 'deck'),
    L('C2', 'free', 'Deck', 'deck', { joists: 4 }),
    L('C3', 'assemble', 'Deck', 'deck', { joists: 3, boards: 3 }),
    L('C4', 'dismantle', 'Pergola', 'pergola'),
    L('C5', 'assemble', 'Pergola', 'pergola', { n: 3 }),
    L('C6', 'dismantle', 'Gable roof', 'gableRoof'),
    L('C7', 'free', 'Gable roof', 'gableRoof', { rafters: 4 }),
    L('C8', 'assemble', 'Gable roof', 'gableRoof'),
  ] },
  { id: 'D', name: 'Joinery', brief: 'Halved joints, notched logs and keyed tenons hold by their shape: a piece leaves only along the way it went in.', levels: [
    L('D1', 'dismantle', 'Half lap', 'halfLap', { n: 1 }),
    L('D2', 'assemble', 'Half lap', 'halfLap', { n: 2 }),
    L('D3', 'dismantle', 'Lattice', 'halfLap', { n: 3 }),
    L('D4', 'dismantle', 'Log crib', 'logCrib', { courses: 4 }),
    L('D5', 'assemble', 'Keyed tenons', 'keyedFrame', { posts: 2 }),
    L('D6', 'free', 'Keyed tenons', 'keyedFrame', { posts: 3 }),
    L('D7', 'assemble', 'Log crib', 'logCrib', { courses: 5 }),
    L('D8', 'assemble', 'Lattice', 'halfLap', { n: 3 }),
  ] },
  { id: 'E', name: 'Steel', brief: 'Columns, edge beams, cross beams, braces and a deck. A brace slides out sideways; a beam lifts off its columns.', levels: [
    L('E1', 'dismantle', 'Portal', 'steelFrame', { bays: 1, braced: false, deckOn: false }),
    L('E2', 'free', 'Braced bay', 'steelFrame', { bays: 1 }),
    L('E3', 'dismantle', 'Braced frame', 'steelFrame', { bays: 2 }),
    L('E4', 'assemble', 'Braced bay', 'steelFrame', { bays: 1 }),
    L('E5', 'free', 'Two storeys', 'steelFrame', { bays: 1, storeys: 2 }),
    L('E6', 'dismantle', 'Two storeys', 'steelFrame', { bays: 1, storeys: 2 }),
    L('E7', 'assemble', 'Two storeys', 'steelFrame', { bays: 1, storeys: 2 }),
    L('E8', 'assemble', 'Braced frame', 'steelFrame', { bays: 2 }),
  ] },
  { id: 'F', name: 'Dom-ino', brief: 'Slabs on columns, a stair beside, and a skin hung on the slab edges: the free plan, part by part.', levels: [
    L('F1', 'dismantle', 'Dom-ino', 'domino', { storeys: 1 }),
    L('F2', 'free', 'Dom-ino', 'domino', { storeys: 2 }),
    L('F3', 'assemble', 'Dom-ino', 'domino', { storeys: 2 }),
    L('F4', 'dismantle', 'Skin', 'domino', { storeys: 1, cladding: true }),
    L('F5', 'free', 'Skin', 'domino', { storeys: 2, cladding: true }),
    L('F6', 'assemble', 'Three storeys', 'domino', { storeys: 3, stair: false }),
    L('F7', 'dismantle', 'Skin and stair', 'domino', { storeys: 2, cladding: true }),
    L('F8', 'assemble', 'Skin, two storeys', 'domino', { storeys: 2, cladding: true }),
  ] },
];
