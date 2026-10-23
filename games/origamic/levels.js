// Origamic: hand-placed levels. A level names its task and either a hand-made
// building (`build`) or the kind of card the generator makes from the level id,
// so a level is the same everywhere and every one is checked by the tests.
//
// Tasks
//   read    What opens? A building stands in 3D; pick the card that makes it
//   draw    Draw the card. A building stands in 3D; fold the card that makes it
//   tear    Will it stand? Find the strips whose folds do not close
//   plans   From drawings. Only a plan and an elevation; draw the card
// opts: W, D, H (card size), strips, width, steps ([min, max]), broken, build

const L = (id, task, name, opts = {}) => ({ id, task, name, ...opts });
const BIG = { W: 12, D: 6, H: 7 };

// hand-made buildings: columns as [width, folds | null] (cardFrom)
export const BUILDS = {
  block: { cols: [[3, null], [4, [-2, 1, 3]]] },
  tower: { cols: [[4, null], [2, [-2, 2, 4]]] },
  gate: { cols: [[2, null], [2, [-2, 2, 4]], [2, [-2, 0, 2]], [2, [-2, 2, 4]]] },
  steps: { cols: [[3, null], [4, [-3, -1, 0, 2, 4]]] },
  setback: { cols: [[3, null], [2, [-3, 1, 3, 4, 5]], [2, [-2, 1, 3]]] },
  ziggurat: { cols: [[3, null], [1, [-2, -1, 0, 1, 2]], [2, [-3, -2, -1, 0, 1, 2, 3]], [1, [-2, -1, 0, 1, 2]]] },
  colonnade: { cols: [[1, null], [1, [-3, 1, 4]], [1, null], [1, [-3, 1, 4]], [1, null], [1, [-3, 1, 4]], [1, null], [1, [-3, 1, 4]]] },
  terrace: { ...BIG, cols: [[3, null], [6, [-4, -3, -2, -1, 0, 1, 2, 3, 4]]] },
  hall: { ...BIG, cols: [[2, null], [1, [-4, 2, 6]], [4, [-4, -2, 0, 2, 4]], [1, [-4, 2, 6]]] },
  portico: { cols: [[2, null], [1, [-3, 1, 4]], [3, [-3, -1, 1, 3, 4]], [1, [-3, 1, 4]]] },
};

export const PACKS = [
  { id: 'A', name: 'One box', brief: 'Cut a strip free across the middle crease and it folds up into a box when the card opens. Its wall pieces add up to the height, and its roof to how far it comes out.', levels: [
    L('A1', 'read', 'A block', { build: 'block' }),
    L('A2', 'draw', 'A tower', { build: 'tower' }),
    L('A3', 'tear', 'Two strips', { strips: [2, 2], steps: [1, 1], width: [2, 3], broken: 1 }),
    L('A4', 'read', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3] }),
    L('A5', 'draw', 'The gate', { build: 'gate' }),
    L('A6', 'draw', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3] }),
    L('A7', 'tear', 'Three strips', { strips: [3, 3], steps: [1, 1], width: [1, 2], broken: 1 }),
    L('A8', 'draw', 'Colonnade', { build: 'colonnade' }),
  ] },
  { id: 'B', name: 'Setbacks', brief: 'Two walls and two roofs make a step back. From the floor up, the folds take turns: valley, mountain, valley, mountain, valley.', levels: [
    L('B1', 'read', 'Steps', { build: 'steps' }),
    L('B2', 'draw', 'A step', { strips: [1, 1], steps: [2, 2], width: [3, 4] }),
    L('B3', 'tear', 'A broken step', { strips: [2, 2], steps: [2, 2], width: [2, 3], broken: 1 }),
    L('B4', 'read', 'Setback tower', { build: 'setback' }),
    L('B5', 'draw', 'Step and tower', { strips: [2, 2], steps: [2, 2], width: [1, 3] }),
    L('B6', 'read', 'Two setbacks', { strips: [2, 2], steps: [2, 2], width: [2, 3] }),
    L('B7', 'draw', 'Box and step', { strips: [2, 2], steps: [1, 2], width: [2, 3] }),
    L('B8', 'tear', 'Two broken', { strips: [3, 3], steps: [1, 2], width: [1, 2], broken: 2 }),
  ] },
  { id: 'C', name: 'Rows', brief: 'Strips side by side with different sections make a facade in relief. Read it one column at a time.', levels: [
    L('C1', 'read', 'A row', { strips: [3, 3], steps: [1, 1], width: [1, 2] }),
    L('C2', 'draw', 'Wide row', { strips: [2, 3], steps: [1, 1], width: [2, 3] }),
    L('C3', 'tear', 'Row check', { strips: [3, 4], steps: [1, 2], width: [1, 2], broken: 1 }),
    L('C4', 'read', 'Relief', { strips: [3, 4], steps: [1, 2], width: [1, 2] }),
    L('C5', 'draw', 'Relief', { strips: [3, 3], steps: [1, 2], width: [1, 2] }),
    L('C6', 'draw', 'Ziggurat', { build: 'ziggurat' }),
    L('C7', 'read', 'Townhouses', { strips: [4, 4], steps: [1, 2], width: [1, 2] }),
    L('C8', 'tear', 'Townhouse check', { strips: [4, 4], steps: [1, 2], width: [1, 2], broken: 2 }),
  ] },
  { id: 'D', name: 'From drawings', brief: 'This time there is no model, only a plan and a front view. The floor half of the card lies under the plan, and the wall half sits behind the front view.', levels: [
    L('D1', 'plans', 'A box', { strips: [1, 1], steps: [1, 1], width: [3, 4] }),
    L('D2', 'plans', 'A step', { strips: [1, 1], steps: [2, 2], width: [2, 3] }),
    L('D3', 'plans', 'The portico', { build: 'portico' }),
    L('D4', 'plans', 'Twin boxes', { strips: [2, 2], steps: [1, 1], width: [1, 2] }),
    L('D5', 'plans', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3] }),
    L('D6', 'plans', 'Setbacks', { strips: [2, 2], steps: [1, 2], width: [2, 3] }),
    L('D7', 'plans', 'A row', { strips: [3, 3], steps: [1, 2], width: [1, 2] }),
    L('D8', 'plans', 'Relief', { strips: [3, 4], steps: [1, 2], width: [1, 2] }),
  ] },
  { id: 'E', name: 'Terraces', brief: 'Three steps in one strip on a deeper card, as in auditoriums, stepped housing and hillside terraces.', levels: [
    L('E1', 'read', 'Auditorium', { build: 'terrace' }),
    L('E2', 'draw', 'Grandstand', { ...BIG, strips: [1, 1], steps: [3, 3], width: [4, 6] }),
    L('E3', 'read', 'Terraced', { ...BIG, strips: [2, 3], steps: [2, 3], width: [2, 3] }),
    L('E4', 'tear', 'Terrace check', { ...BIG, strips: [3, 3], steps: [2, 3], width: [1, 3], broken: 1 }),
    L('E5', 'draw', 'Terraced', { ...BIG, strips: [2, 2], steps: [2, 3], width: [2, 3] }),
    L('E6', 'plans', 'The hall', { build: 'hall' }),
    L('E7', 'read', 'Hillside', { ...BIG, strips: [3, 4], steps: [1, 3], width: [1, 3] }),
    L('E8', 'draw', 'Hillside', { ...BIG, strips: [3, 3], steps: [1, 3], width: [1, 3] }),
  ] },
  { id: 'F', name: 'Masters', brief: 'Many strips and many steps, with nothing repeated. One sheet becomes a whole city block.', levels: [
    L('F1', 'read', 'City block', { ...BIG, strips: [4, 5], steps: [1, 3], width: [1, 2] }),
    L('F2', 'draw', 'City block', { ...BIG, strips: [3, 4], steps: [1, 3], width: [1, 3] }),
    L('F3', 'tear', 'Three broken', { ...BIG, strips: [5, 5], steps: [1, 3], width: [1, 2], broken: 3 }),
    L('F4', 'plans', 'City block', { ...BIG, strips: [3, 4], steps: [1, 2], width: [1, 3] }),
    L('F5', 'draw', 'Skyline', { ...BIG, strips: [4, 5], steps: [1, 3], width: [1, 2] }),
    L('F6', 'plans', 'Skyline', { ...BIG, strips: [4, 4], steps: [1, 3], width: [1, 2] }),
    L('F7', 'tear', 'Inspection', { ...BIG, strips: [5, 6], steps: [1, 3], width: [1, 2], broken: 2 }),
    L('F8', 'draw', 'The last card', { ...BIG, strips: [5, 5], steps: [2, 3], width: [1, 2] }),
  ] },
];
