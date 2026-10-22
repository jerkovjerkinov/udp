// Developments: six packs of eight sheets, easy to hard. Each level names a
// task and a form (src/core/forms.js); the net itself comes from the level's
// seed, so a level is the same on every machine.
//
// Tasks
//   cut     Cut it open: cut edges on the solid until it lies flat in one piece
//   match   Match the edge: three cut edges on a net, find where each glues
//   which   Which solid: the net folds into one of four solids
//   fold    Will it fold: three nets, some with a face in the wrong place
// opts.paper [w, h]: the net must fit on a sheet of this size (either way round)

const L = (id, task, form, opts = {}) => ({ id, task, form, ...opts });

export const PACKS = [
  { id: 'A', name: 'Blocks', brief: 'Unit cubes on squared paper. Find the hinges a box needs.', levels: [
    L('A1', 'cut', 'cube'),
    L('A2', 'match', 'cube'),
    L('A3', 'cut', 'domino'),
    L('A4', 'fold', 'cube'),
    L('A5', 'which', 'ell'),
    L('A6', 'match', 'step'),
    L('A7', 'fold', 'tee'),
    L('A8', 'cut', 'stair3', { paper: [9.5, 6.5] }),
  ] },
  { id: 'B', name: 'Prisms', brief: 'The first triangles: right prisms, a gable house, plans raised into blocks.', levels: [
    L('B1', 'cut', 'tri-iso'),
    L('B2', 'match', 'gable'),
    L('B3', 'cut', 'gable'),
    L('B4', 'which', 'tri-345'),
    L('B5', 'fold', 'ell-prism'),
    L('B6', 'cut', 'hex'),
    L('B7', 'match', 'tee-prism'),
    L('B8', 'cut', 'u-prism', { paper: [9.5, 6.75] }),
  ] },
  { id: 'C', name: 'Wedges and ramps', brief: 'Right triangles and slanted rectangles: where does the slope go?', levels: [
    L('C1', 'cut', 'wedge'),
    L('C2', 'match', 'shed'),
    L('C3', 'fold', 'ramp'),
    L('C4', 'which', 'chamfer'),
    L('C5', 'cut', 'saw-2'),
    L('C6', 'match', 'ramp-landing'),
    L('C7', 'fold', 'double-wedge'),
    L('C8', 'cut', 'saw-3', { paper: [14.5, 10.25] }),
  ] },
  { id: 'D', name: 'Pyramids and roofs', brief: 'Fans of triangles. Nets that overlap themselves if you are careless.', levels: [
    L('D1', 'cut', 'pyramid'),
    L('D2', 'match', 'tetra-corner'),
    L('D3', 'which', 'yangma'),
    L('D4', 'cut', 'hip-roof'),
    L('D5', 'fold', 'frustum'),
    L('D6', 'match', 'tri-pyramid'),
    L('D7', 'cut', 'hex-pyramid'),
    L('D8', 'cut', 'octahedron', { paper: [6.75, 4.75] }),
  ] },
  { id: 'E', name: 'Buildings', brief: 'Sections and massings from the studio: saltbox, gambrel, basilica.', levels: [
    L('E1', 'cut', 'hip-house'),
    L('E2', 'match', 'spire-tower'),
    L('E3', 'which', 'saltbox'),
    L('E4', 'cut', 'gambrel'),
    L('E5', 'fold', 'basilica'),
    L('E6', 'match', 'mansard'),
    L('E7', 'cut', 'stair-block'),
    L('E8', 'cut', 'porch-house', { paper: [12, 8.5] }),
  ] },
  { id: 'F', name: 'Cut and carved', brief: 'Corners cut away, a slanted cut, a box with a hole through it.', levels: [
    L('F1', 'cut', 'corner-cut'),
    L('F2', 'match', 'two-corners'),
    L('F3', 'which', 'slant-cut'),
    L('F4', 'cut', 'notched'),
    L('F5', 'fold', 'cut-pyramid'),
    L('F6', 'match', 'truncated-cube'),
    L('F7', 'cut', 'frame'),
    L('F8', 'cut', 'twisted-wedge', { paper: [7.5, 5.25] }),
  ] },
];
