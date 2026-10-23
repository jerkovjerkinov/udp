// Drawing Set: three packs, one idea each, on the four beats of the other games:
// introduce the idea (1-2), develop it (3-4), twist it (5-6), a short breather
// (7) and a showpiece that uses everything (8).
//
// Each level names a task, a building (src/core/drawforms.js) and a view
// (src/core/views.js). The comment on each line says why the level is there;
// `learn` is what the summary tells the player.
//
// Tasks
//   complete   most of the view is drawn; draw the lines that are missing (missing: n)
//   draw       draw the whole view from the model
//   error      a drawn view with mistakes in it; tap them (errors: n, kinds)
//   which      four drawings, one is the view of this model (options: other forms)
//   third      no model: two views are given, draw the third (given: [views])
//
// hidden: true puts the second pen in the player's hand: edges you can't see
// from this side are drawn too, dashed (pack D)

const L = (id, task, form, view, opts = {}) => ({ id, task, form, view, ...opts });

export const PACKS = [
  { id: 'A', name: 'Front and side', brief: 'An elevation is the building seen from straight in front of one side, every edge at its true size. Nothing leans and nothing gets smaller further away.', levels: [
    // the toy: a step block, two lines to add
    L('A1', 'complete', 'step', 'front', { missing: 2, learn: 'Seen straight from the front, the step is just its outline. Every edge you can see is a line on the drawing.' }),
    // the same move on a house: the gable end
    L('A2', 'complete', 'gable', 'front', { missing: 2, learn: 'The front of a gable house is a pentagon: two walls, the eaves and two roof slopes meeting at the ridge.' }),
    // develop: the whole gable end, from nothing
    L('A3', 'draw', 'gable', 'front', { learn: 'You drew a whole elevation. Corners on the model land on points of the sheet, half a module apart.' }),
    // develop: the same house from the side, where the roof shows as a band
    L('A4', 'draw', 'gable', 'right', { learn: 'From the side, the sloping roof is a band between two lines: the eaves below and the ridge on top.' }),
    // twist: nothing leans, yet a line appears where the wall steps back
    L('A5', 'draw', 'ell-prism', 'right', { learn: 'A wall that steps back still draws a line, even though nothing on the model slopes. A line marks any change in the surface.' }),
    // twist, harder: a wing in front of the main roof
    L('A6', 'draw', 'cross-house', 'front', { learn: 'The wing stands in front of the main house and hides part of its eaves. Only what you can see gets drawn.' }),
    // breather: someone else’s drawing, with edges from round the back
    L('A7', 'error', 'stair3', 'right', { errors: 2, kinds: ['back'], learn: 'The edges behind the steps are real, but you can’t see them from this side, so they don’t belong in this view.' }),
    // showpiece: the front of a basilica, nave and aisles
    L('A8', 'draw', 'basilica', 'front', { learn: 'The basilica front shows the tall nave and the lower aisles leaning on it, all in one flat drawing.' }),
  ] },
  { id: 'B', name: 'From above', brief: 'A top view is the building seen from straight overhead. Heights disappear: a ridge, a hip or a valley is just a line, wherever two slopes meet.', levels: [
    // introduce: a gable roof from above, two lines to add
    L('B1', 'complete', 'gable', 'top', { missing: 2, learn: 'From above, the ridge of a gable roof is a line down the middle, between the two eaves.' }),
    // develop: a step seen from above
    L('B2', 'draw', 'step', 'top', { learn: 'From above, the step shows as two rectangles side by side. The drawing can’t tell you which one is higher.' }),
    // develop: a hipped roof, the first diagonals
    L('B3', 'draw', 'hip-roof', 'top', { learn: 'Seen from above, the hips run in from the corners at 45 degrees and meet the ridge.' }),
    // develop: an L-shaped house, its valley
    L('B4', 'draw', 'ell-house', 'top', { learn: 'Where two roofs meet in an inside corner, a valley runs between them. From above it is a diagonal too.' }),
    // twist: four roofs on one footprint; the lines tell them apart
    L('B5', 'which', 'long-house', 'top', { options: ['hip-house', 'cross-ridge', 'shed-block'], learn: 'Four roofs on the same footprint give four different top views. The lines show where the slopes meet.' }),
    // twist, harder: a T-shaped house with two valleys
    L('B6', 'draw', 'tee-house', 'top', { learn: 'The wing of the T makes two valleys, one on each side, where its roof runs into the main roof.' }),
    // breather: a drawing with a line out of place
    L('B7', 'error', 'hip-house', 'top', { errors: 1, kinds: ['shift'], learn: 'A line one step out of place is easy to miss. Checking each corner against the model finds it.' }),
    // showpiece: a chapel and its spire from above
    L('B8', 'draw', 'chapel', 'top', { learn: 'From above, the spire is a square with its hips crossing at the tip, in front of the long chapel roof.' }),
  ] },
  { id: 'C', name: 'The third view', brief: 'This time the model stays hidden. Two views of a building are on the sheet; work out its shape from them and draw the third. When you get it right, the model appears.', levels: [
    // introduce: an L block, front and top given
    L('C1', 'third', 'ell', 'right', { given: ['front', 'top'], learn: 'The top view gave you the L, and the front gave you its height. Together they fix the side view.' }),
    // the gable house, its side from the front and top
    L('C2', 'third', 'gable', 'right', { given: ['front', 'top'], learn: 'The ridge line in the top view and the point of the gable in the front are the same edge, seen two ways.' }),
    // develop: a shed, where the slope only shows from one side
    L('C3', 'third', 'shed', 'right', { given: ['front', 'top'], learn: 'The front showed the slope edge-on, so from the side the roof is a band between the low and the high wall.' }),
    // develop: a top view to work out
    L('C4', 'third', 'chamfer', 'top', { given: ['front', 'right'], learn: 'The cut corner showed in the front as a slope, so from above it shows as a strip along that edge.' }),
    // twist: a triangle on the side and a trapezoid in front: a hip roof
    L('C5', 'third', 'hip-roof', 'top', { given: ['front', 'right'], learn: 'A trapezoid in front and a triangle on the side can only be a hipped roof. From above, its hips run in from the corners.' }),
    // twist, harder: a cross-gabled house
    L('C6', 'third', 'cross-house', 'right', { given: ['front', 'top'], learn: 'The wing stands out in front, so from the side it reaches further than the main house.' }),
    // breather: a chimney, partly hidden behind the roof
    L('C7', 'error', 'chimney-house', 'front', { errors: 1, kinds: ['back'], learn: 'The chimney stands on the back slope, so its lower part is hidden behind the front of the roof. Only the top of it shows from the front.' }),
    // showpiece: a chapel, its side from the front and the top
    L('C8', 'third', 'chapel', 'right', { given: ['front', 'top'], learn: 'From two views you worked out a whole chapel: the long roof, the tower in front and the spire on top.' }),
  ] },
  { id: 'D', name: 'Hidden lines', brief: 'Some edges are there but out of sight, behind a wall or round a corner. Draftspeople still draw them, as dashed lines, so that one view tells the whole truth about a building.', levels: [
    // introduce: the step from the side; the one line to add is the dashed one
    L('D1', 'complete', 'step', 'right', { hidden: true, missing: 1, learn: 'The lower step is behind the tall one, so its edge is hidden. It still gets drawn, dashed, so you know it is there.' }),
    // the same idea on an L block from the front
    L('D2', 'complete', 'ell', 'front', { hidden: true, missing: 1, learn: 'The inside corner of the L is round the back. A dashed line shows where it is without pretending you can see it.' }),
    // develop: a whole view with its hidden line
    L('D3', 'draw', 'ell-prism', 'front', { hidden: true, learn: 'Draw what you see with the solid pen first, then ask what is behind it. Each edge out of sight is one dashed line.' }),
    // develop: two hidden walls
    L('D4', 'draw', 'u-prism', 'front', { hidden: true, learn: 'The court is open at the back, so both of its inside walls are hidden from the front. Two dashed lines tell you the block is hollow.' }),
    // twist: four drawings with the same outline; only the dashes differ
    L('D5', 'which', 'ell-prism', 'front', { hidden: true, options: ['ell-prism-r', 'u-prism', 'slab'], learn: 'From the front all four outlines are the same box. Only the dashed lines told you what was behind it, and on which side.' }),
    // twist, harder: a corner block, two hidden edges at once
    L('D6', 'draw', 'corner', 'front', { hidden: true, learn: 'Behind the front corner, two edges meet out of sight. Hidden lines can meet and turn corners like any others.' }),
    // breather: a drawing with one line in the wrong pen
    L('D7', 'error', 'tee-prism', 'front', { hidden: true, errors: 1, kinds: ['pen'], learn: 'The place was right but the pen was wrong. Solid means you can see it from here; dashed means it is there, out of sight.' }),
    // showpiece: the chimney, most of it hidden behind the roof
    L('D8', 'draw', 'chimney-house', 'front', { hidden: true, learn: 'Most of the chimney stands behind the front slope. The dashed lines show how far down it goes before it meets the roof.' }),
  ] },
];
