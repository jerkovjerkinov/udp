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
//
// Read and draw come in pairs: see a card first, then make one like it. The
// torn cards (tear) are the twist in the middle of a pack, and a pack ends on
// a hand-made building. `learn` is what the summary tells the player.

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
    // see, then make: one box
    L('A1', 'read', 'A block', { build: 'block', learn: 'A strip cut free across the crease stands up as a box when the card opens.' }),
    L('A2', 'draw', 'A tower', { build: 'tower', learn: 'Moving the folds sets the box’s height and how far it stands out.' }),
    // see, then make: two boxes side by side
    L('A3', 'read', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3], learn: 'Each strip is its own box: read them one at a time.' }),
    L('A4', 'draw', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3], learn: 'Two strips, two boxes, each with its own folds.' }),
    // twist: cards that won't stand
    L('A5', 'tear', 'Two strips', { strips: [2, 2], steps: [1, 1], width: [2, 3], broken: 1, learn: 'A box stands only when its pieces close: the walls add up to where it meets the card’s wall, and the roofs to how far out it leaves the floor.' }),
    L('A6', 'tear', 'Three strips', { strips: [3, 3], steps: [1, 1], width: [1, 2], broken: 1, learn: 'Checking each strip’s pieces against each other found the one that can’t close.' }),
    // breather: a gate of three boxes
    L('A7', 'draw', 'The gate', { build: 'gate', learn: 'A gate is just boxes with gaps between them.' }),
    // showpiece: a colonnade
    L('A8', 'draw', 'Colonnade', { build: 'colonnade', learn: 'Four columns, four strips, cut in a row: a colonnade from one card.' }),
  ] },
  { id: 'B', name: 'Setbacks', brief: 'Two walls and two roofs make a step back. From the floor up, the folds take turns: valley, mountain, valley, mountain, valley.', levels: [
    // see, then make: one step
    L('B1', 'read', 'Steps', { build: 'steps', learn: 'A step back is two boxes in one strip, one standing on the other.' }),
    L('B2', 'draw', 'A step', { strips: [1, 1], steps: [2, 2], width: [3, 4], learn: 'From the floor up, the folds take turns: valley, mountain, valley, mountain, valley.' }),
    // see, then make: two strips with steps
    L('B3', 'read', 'Two setbacks', { strips: [2, 2], steps: [2, 2], width: [2, 3], learn: 'Two setbacks side by side, each read from the floor up.' }),
    L('B4', 'draw', 'Step and tower', { strips: [2, 2], steps: [2, 2], width: [1, 3], learn: 'One strip steps back and the other stands straight: their folds don’t have to line up.' }),
    // twist: broken steps
    L('B5', 'tear', 'A broken step', { strips: [2, 2], steps: [2, 2], width: [2, 3], broken: 1, learn: 'In a step that stands, the two walls together reach the height where the strip meets the wall.' }),
    L('B6', 'tear', 'Two broken', { strips: [3, 3], steps: [1, 2], width: [1, 2], broken: 2, learn: 'Two broken strips, each with pieces that don’t add up.' }),
    // breather: a box beside a step
    L('B7', 'draw', 'Box and step', { strips: [2, 2], steps: [1, 2], width: [2, 3], learn: 'A box and a step on one card: one fold pattern each.' }),
    // showpiece: a setback tower
    L('B8', 'draw', 'Setback tower', { build: 'setback', learn: 'A tower that steps back as it rises, folded from one card.' }),
  ] },
  { id: 'C', name: 'Rows', brief: 'Strips side by side with different sections make a facade in relief. Read it one column at a time.', levels: [
    // see, then make: a row
    L('C1', 'read', 'A row', { strips: [3, 3], steps: [1, 1], width: [1, 2], learn: 'A facade in relief is just strips read one column at a time.' }),
    L('C2', 'draw', 'Wide row', { strips: [2, 3], steps: [1, 1], width: [2, 3], learn: 'Each column of the facade gets its own strip.' }),
    // see, then make: relief with steps
    L('C3', 'read', 'Relief', { strips: [3, 4], steps: [1, 2], width: [1, 2], learn: 'Steps and boxes mixed in one row, read column by column.' }),
    L('C4', 'draw', 'Relief', { strips: [3, 3], steps: [1, 2], width: [1, 2], learn: 'A relief facade, one strip at a time.' }),
    // twist: torn rows
    L('C5', 'tear', 'Row check', { strips: [3, 4], steps: [1, 2], width: [1, 2], broken: 1, learn: 'One strip in the row couldn’t close, and its pieces showed why.' }),
    L('C6', 'tear', 'Townhouse check', { strips: [4, 4], steps: [1, 2], width: [1, 2], broken: 2, learn: 'Two strips out of four were broken, and checking each one found them.' }),
    // breather: townhouses to read
    L('C7', 'read', 'Townhouses', { strips: [4, 4], steps: [1, 2], width: [1, 2], learn: 'A street of townhouses, read one house at a time.' }),
    // showpiece: a ziggurat
    L('C8', 'draw', 'Ziggurat', { build: 'ziggurat', learn: 'A ziggurat climbs in steps from both sides, and every step is a pair of folds.' }),
  ] },
  { id: 'D', name: 'From drawings', brief: 'This time there is no model, only a plan and a front view. The floor half of the card lies under the plan, and the wall half sits behind the front view.', levels: [
    L('D1', 'plans', 'A box', { strips: [1, 1], steps: [1, 1], width: [3, 4], learn: 'The plan gives how far the box comes out, and the front view how high it stands.' }),
    L('D2', 'plans', 'A step', { strips: [1, 1], steps: [2, 2], width: [2, 3], learn: 'Each step shows as a line in the plan and a line in the front view.' }),
    L('D3', 'plans', 'Twin boxes', { strips: [2, 2], steps: [1, 1], width: [1, 2], learn: 'Two boxes, read across from the plan to the front view.' }),
    L('D4', 'plans', 'Two boxes', { strips: [2, 2], steps: [1, 1], width: [2, 3], learn: 'Width comes from both drawings, depth from the plan, height from the front.' }),
    L('D5', 'plans', 'Setbacks', { strips: [2, 2], steps: [1, 2], width: [2, 3], learn: 'Setbacks in the drawings: each step back is a new line in both.' }),
    L('D6', 'plans', 'A row', { strips: [3, 3], steps: [1, 2], width: [1, 2], learn: 'A whole row from two drawings, column by column.' }),
    L('D7', 'plans', 'Relief', { strips: [3, 4], steps: [1, 2], width: [1, 2], learn: 'A relief facade drawn from a plan and an elevation, the way an architect works.' }),
    // showpiece: a portico from its drawings
    L('D8', 'plans', 'The portico', { build: 'portico', learn: 'A portico from its plan and front view, with no model to look at.' }),
  ] },
  { id: 'E', name: 'Terraces', brief: 'Three steps in one strip on a deeper card, as in auditoriums, stepped housing and hillside terraces.', levels: [
    // see, then make: three steps
    L('E1', 'read', 'Auditorium', { build: 'terrace', learn: 'Rows of seats are steps, each a pair of folds.' }),
    L('E2', 'draw', 'Grandstand', { ...BIG, strips: [1, 1], steps: [3, 3], width: [4, 6], learn: 'Three steps in one strip: seven folds, taking turns from valley to mountain.' }),
    // see, then make: terraced
    L('E3', 'read', 'Terraced', { ...BIG, strips: [2, 3], steps: [2, 3], width: [2, 3], learn: 'Terraced housing, one strip of steps per block.' }),
    L('E4', 'draw', 'Terraced', { ...BIG, strips: [2, 2], steps: [2, 3], width: [2, 3], learn: 'Steps of different sizes still have to add up: walls to the height, roofs to the depth.' }),
    // twist: a torn terrace, then a hall from its drawings
    L('E5', 'tear', 'Terrace check', { ...BIG, strips: [3, 3], steps: [2, 3], width: [1, 3], broken: 1, learn: 'In a long strip of steps, one wrong piece is enough to stop it closing.' }),
    L('E6', 'plans', 'The hall', { build: 'hall', learn: 'A hall with a raised nave, from its plan and front view.' }),
    // breather: a hillside to read
    L('E7', 'read', 'Hillside', { ...BIG, strips: [3, 4], steps: [1, 3], width: [1, 3], learn: 'A hillside of terraces, read strip by strip.' }),
    // showpiece: the hillside, drawn
    L('E8', 'draw', 'Hillside', { ...BIG, strips: [3, 3], steps: [1, 3], width: [1, 3], learn: 'A whole hillside of terraces from one card.' }),
  ] },
  { id: 'F', name: 'Masters', brief: 'Many strips and many steps, with nothing repeated. One sheet becomes a whole city block.', levels: [
    // see, then make: a city block
    L('F1', 'read', 'City block', { ...BIG, strips: [4, 5], steps: [1, 3], width: [1, 2], learn: 'A city block is many strips, each read on its own.' }),
    L('F2', 'draw', 'City block', { ...BIG, strips: [3, 4], steps: [1, 3], width: [1, 3], learn: 'Every building in the block got its own fold pattern.' }),
    // develop: a city block from drawings, then a skyline
    L('F3', 'plans', 'City block', { ...BIG, strips: [3, 4], steps: [1, 2], width: [1, 3], learn: 'A city block from its plan and front view alone.' }),
    L('F4', 'draw', 'Skyline', { ...BIG, strips: [4, 5], steps: [1, 3], width: [1, 2], learn: 'A skyline of towers and setbacks from one card.' }),
    // twist: inspections
    L('F5', 'tear', 'Three broken', { ...BIG, strips: [5, 5], steps: [1, 3], width: [1, 2], broken: 3, learn: 'Three broken strips among five, each found by checking its pieces.' }),
    L('F6', 'tear', 'Inspection', { ...BIG, strips: [5, 6], steps: [1, 3], width: [1, 2], broken: 2, learn: 'A full inspection: every strip checked, two of them failed.' }),
    // breather: the skyline from drawings
    L('F7', 'plans', 'Skyline', { ...BIG, strips: [4, 4], steps: [1, 3], width: [1, 2], learn: 'A skyline from its drawings, the way it would come to you from an architect.' }),
    // showpiece: the last card
    L('F8', 'draw', 'The last card', { ...BIG, strips: [5, 5], steps: [2, 3], width: [1, 2], learn: 'Five strips, every one stepped: the whole city on one card.' }),
  ] },
];
