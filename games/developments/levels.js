// Developments: six packs, one idea each. Inside a pack the levels follow
// the four beats of a good puzzle pack: introduce the idea (1-2), develop it
// (3-4), twist it so the move you learned is no longer enough (5-6), then a
// short breather (7) and a showpiece that uses everything (8). Older ideas come
// back once in later packs, so they are practised again after a gap.
//
// Each level names a task and a form (src/core/forms.js); the net comes from
// the level's seed, so a level is the same on every machine. The comment on each
// line says why the level is there; `learn` is what the summary tells the player.
//
// Tasks
//   cut     Cut it open: cut edges until it lies flat in one piece
//   match   Match the edge: three cut edges on a net, find where each glues
//   which   Which solid: the net folds into one of four solids
//   fold    Will it fold: three nets, some with a face in the wrong place
//   draw    Draw on the net: marks on the model, find their faces on the sheet
//   fix     Mend the net: one face hangs from the wrong edge, move it
// Rules for cut (src/core/netrules.js)
//   paper [w, h]   the net must fit on this sheet (either way round)
//   line           one unbroken scissor line
//   keep           'walls' | 'roof' stay joined in one piece
// Options: far (match: only partners far apart), twin (fold: one net, a face
// moved), hard (draw: faces far from the reference first)

const L = (id, task, form, opts = {}) => ({ id, task, form, ...opts });

export const PACKS = [
  { id: 'A', name: 'Open the box', brief: 'Cut along the edges until the form opens out flat in one piece. Every face has to stay joined to the rest by at least one edge.', levels: [
    // the toy: one action, and the box falls open
    L('A1', 'cut', 'cube', { learn: 'Seven cuts opened the cube. The five edges you left are the hinges that hold the net together.' }),
    // the same move on a longer box: the count rule shows itself
    L('A2', 'cut', 'domino', { learn: 'A net always keeps one hinge fewer than it has faces. Every other edge gets cut.' }),
    // the first triangles: the end faces hang like flaps
    L('A3', 'cut', 'tri-iso', { learn: 'Triangles open the same way squares do: each one swings out on a hinge.' }),
    // a house: more faces, but any honest net still works
    L('A4', 'cut', 'gable', { learn: 'A gable house opens like a box with two pointed ends.' }),
    // twist: an inside corner, where faces can swing onto each other
    L('A5', 'cut', 'ell', { learn: 'Around an inside corner, faces can swing onto each other. Hinging them to different neighbours lets them lie side by side.' }),
    // twist, harder: three arms that all want the same space
    L('A6', 'cut', 'tee', { learn: 'With three arms, each one has to unfold in its own direction, or two of them meet.' }),
    // breather: big, simple and good to look at
    L('A7', 'cut', 'hex', { learn: 'A ring of six walls can unroll as one long strip, with the roof and the floor hanging off it.' }),
    // showpiece: the steps have to fit a sheet
    L('A8', 'cut', 'stair3', { paper: [7.5, 5.5], learn: 'A tight sheet leaves no room for long arms, so the faces have to tuck in beside each other.' }),
  ] },
  { id: 'B', name: 'Where does it go?', brief: 'On a flat net, every cut edge has a partner it glues to when the net folds up. Then you draw on the sheet, the way a model maker does before folding.', levels: [
    // introduce: partners meet at the same corner of the cube
    L('B1', 'match', 'cube', { learn: 'Two edges that glue together meet at the same corner of the cube when it folds.' }),
    // develop: lengths are a clue
    L('B2', 'match', 'tri-345', { learn: 'Edges that glue together are always the same length, so length rules out most of the choices.' }),
    // develop: a house, with roof edges to find
    L('B3', 'match', 'gable', { learn: 'On a house, the sloping edges of the gable ends always glue to the roof.' }),
    // develop: the partner is round an inside corner
    L('B4', 'match', 'ell-prism', { learn: 'On the L, an edge’s partner is often round the inside corner, on the next wall along.' }),
    // twist: only partners far apart on the sheet
    L('B5', 'match', 'step', { far: true, learn: 'Some partners lie far apart on the sheet. Folding face by face in your head carries one edge round to meet the other.' }),
    // new idea in the same family: where does a drawing land?
    L('B6', 'draw', 'cube', { learn: 'A drawing made on the flat sheet ends up exactly where its face folds to.' }),
    // breather: a longer box, the same thinking
    L('B7', 'draw', 'domino', { learn: 'Once one window is in place, every other face can be found from it.' }),
    // showpiece: the door of a gable house, faces far from the clue first
    L('B8', 'draw', 'gable', { hard: true, learn: 'Model makers draw the elevations on the net before they cut it out. You just did the same.' }),
  ] },
  { id: 'C', name: 'Will it fold?', brief: 'Some nets fold up into their solid and some never will. Learn to tell them apart in your head, and then to mend a net that is wrong.', levels: [
    // introduce: a cube net, good or bad
    L('C1', 'fold', 'cube', { learn: 'A net folds when every face has its own place on the solid and no two faces fight over one.' }),
    // develop: a longer box
    L('C2', 'fold', 'domino', { learn: 'On a long box, the two small squares are easy to misplace. They have to end up at opposite ends.' }),
    // develop: which solid, by counting and shapes
    L('C3', 'which', 'tri-345', { learn: 'Counting the faces and looking at their shapes ruled out the wrong solids.' }),
    // develop: the counts match, so the shapes decide
    L('C4', 'which', 'chamfer', { learn: 'When the counts match, the shapes of the faces decide.' }),
    // twist: the same net again, with one face moved
    L('C5', 'fold', 'gable', { twin: true, learn: 'Moving a single face to the next edge is enough to stop a net from folding.' }),
    // twist, harder: twins on an L-shaped block
    L('C6', 'fold', 'ell-prism', { twin: true, learn: 'On the L, a moved face can look right on the sheet and still land on top of another wall.' }),
    // new idea: put the wrong face right
    L('C7', 'fix', 'cube', { learn: 'A face can only hang from an edge it really shares with its neighbour on the solid.' }),
    // showpiece: mend a house
    L('C8', 'fix', 'hip-house', { learn: 'Looking at the model told you which faces the stray one touches, and so where it could hang.' }),
  ] },
  { id: 'D', name: 'Fit the sheet', brief: 'A card model has to come out of one sheet of card. Find the net that fits, turned any way you like.', levels: [
    // introduce: a pyramid on a fair sheet
    L('D1', 'cut', 'pyramid', { paper: [5.5, 4.5], learn: 'Triangles hinged round the base keep a pyramid compact.' }),
    // develop: a hip roof on a tighter sheet
    L('D2', 'cut', 'hip-roof', { paper: [6, 5], learn: 'On a hip roof the long slopes take most of the room, and the short triangles can fill in at their ends.' }),
    // practice again: matching edges, from pack B
    L('D3', 'match', 'tetra-corner', { learn: 'The three right triangles meet at one corner, and the big triangle closes off their long edges.' }),
    // develop: a frustum, where the slopes fan out
    L('D4', 'cut', 'frustum', { paper: [8.5, 5.5], learn: 'Sloped sides fan out as they unfold, so they take more room on the sheet than they seem to.' }),
    // twist: a long narrow sheet wants a strip, not a star
    L('D5', 'cut', 'hex-pyramid', { paper: [7, 3.5], learn: 'A long, narrow sheet calls for a strip of triangles, not a star round the base.' }),
    // twist, harder: the yangma on a strip of card
    L('D6', 'cut', 'yangma', { paper: [6, 3.5], learn: 'On a narrow strip, the triangles have to lie against each other rather than round the base.' }),
    // breather: a little tetrahedron, three cuts
    L('D7', 'cut', 'tri-pyramid', { learn: 'A tetrahedron needs only three cuts, the fewest of any solid.' }),
    // showpiece: the octahedron on a long strip
    L('D8', 'cut', 'octahedron', { paper: [7, 3.5], learn: 'Eight triangles in a zigzag strip fit a sheet that a star could never fit.' }),
  ] },
  { id: 'E', name: 'One cut', brief: 'This time the scissors never leave the paper. One unbroken line of cuts, passing every corner once, opens the whole form.', levels: [
    // introduce: the cube in one line
    L('E1', 'cut', 'cube', { line: true, learn: 'Seven cuts in one line, through all eight corners, opened the cube.' }),
    // develop: a prism, six corners
    L('E2', 'cut', 'tri-iso', { line: true, learn: 'A line through all six corners opened the prism, just as one did the cube.' }),
    // develop: a ramp, where the slope is long
    L('E3', 'cut', 'ramp', { line: true, learn: 'A line can run down the long slope as easily as along the short edges.' }),
    // practice again: matching edges, from pack B
    L('E4', 'match', 'shed', { learn: 'The tall wall and the short wall have different heights, and that told their edges apart.' }),
    // twist: an inside corner, where a line can trap itself
    L('E5', 'cut', 'ell', { line: true, learn: 'Around the inside corner the line has to pick its way, or the faces it frees land on each other.' }),
    // twist, harder: a house in one line
    L('E6', 'cut', 'gable', { line: true, learn: 'A house in one line: the line has to visit every corner of the roof and the floor once.' }),
    // breather: a pyramid has only five corners
    L('E7', 'cut', 'pyramid', { line: true, learn: 'A pyramid has just five corners, so four cuts in a row open it.' }),
    // showpiece: a basilica in one line
    L('E8', 'cut', 'basilica', { line: true, learn: 'Seventeen cuts in one line opened the basilica, nave, clerestory and aisles.' }),
  ] },
  { id: 'F', name: 'Buildings', brief: 'Rules from the model workshop: walls that unroll as one elevation, and a roof cut from a single piece.', levels: [
    // introduce: keep the walls in one strip
    L('F1', 'cut', 'saltbox', { keep: 'walls', learn: 'With the walls in one strip, the floor and the roof hang off its bottom and top edges.' }),
    // develop: a tower whose spire has to hang off the walls
    L('F2', 'cut', 'spire-tower', { keep: 'walls', learn: 'The spire’s triangles can hang from the tops of the walls, or from each other.' }),
    // develop: now the roof stays whole
    L('F3', 'cut', 'hip-house', { keep: 'roof', learn: 'A hip roof comes out as one piece when its four slopes stay joined at the hips.' }),
    // practice again: drawing on the net, from pack B
    L('F4', 'draw', 'mansard', { learn: 'The steep lower slopes of a mansard look like walls on the sheet, but they fold up around the top.' }),
    // twist: a gambrel roof in one piece, where the slopes want to collide
    L('F5', 'cut', 'gambrel', { keep: 'roof', learn: 'The four slopes of a gambrel make one long strip, folded over the barn like a blanket.' }),
    // twist: the mansard walls in one strip
    L('F6', 'cut', 'mansard', { keep: 'walls', learn: 'With the walls in one band, the roof had to open out above it without its slopes running into each other.' }),
    // breather: which solid, one more time
    L('F7', 'which', 'saltbox', { learn: 'The one long roof slope gave the saltbox away.' }),
    // showpiece: the porch house, its walls as one elevation
    L('F8', 'cut', 'porch-house', { keep: 'walls', learn: 'The porch house unrolled as one elevation, the hardest net in the pack.' }),
  ] },
];
