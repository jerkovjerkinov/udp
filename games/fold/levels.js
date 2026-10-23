// Fold & Punch: hand-placed levels. Each one names its task and the kind of
// folding; the folds themselves come from a generator seeded with the level id,
// so a level is the same everywhere and every one is checked by the tests.
//
// Tasks
//   holes    Where are the holes? Watch the folds and the punch; mark the holes on the open sheet
//   mirror   Which way round? An L, an F, a triangle or a half-moon punch; pick the open sheet
//   cut      Snip. Scissors cut against a folded edge; pick the lace that opens out
//   reverse  Fold it yourself. A sheet with holes; fold the paper and punch it to make it
// opts: n (sheet size), folds, diagonals, punches, shape

const L = (id, task, name, opts = {}) => ({ id, task, name, n: 4, folds: 1, ...opts });

export const PACKS = [
  { id: 'A', name: 'Halves', brief: 'One fold, one punch. Every hole has a twin across the crease.', levels: [
    L('A1', 'holes', 'In half'),
    L('A2', 'holes', 'In half again', { punches: 2 }),
    L('A3', 'mirror', 'The L', { shape: 'ell' }),
    L('A4', 'holes', 'Odd sheet', { n: 5, punches: 2 }),
    L('A5', 'cut', 'A notch', { shape: 'notch' }),
    L('A6', 'reverse', 'Make the twins'),
    L('A7', 'mirror', 'The triangle', { shape: 'tri', folds: 2 }),
    L('A8', 'holes', 'Off centre', { n: 5, folds: 2 }),
  ] },
  { id: 'B', name: 'Quarters', brief: 'Two folds make four layers, and four copies of the punch.', levels: [
    L('B1', 'holes', 'Quarters', { folds: 2 }),
    L('B2', 'mirror', 'The F', { shape: 'eff', folds: 2 }),
    L('B3', 'cut', 'Two houses', { shape: 'house', folds: 1 }),
    L('B4', 'holes', 'Two punches', { n: 5, folds: 2, punches: 2 }),
    L('B5', 'reverse', 'Four holes', { folds: 2 }),
    L('B6', 'mirror', 'Half-moons', { shape: 'moon', folds: 2, n: 5 }),
    L('B7', 'cut', 'Steps', { shape: 'step', folds: 2 }),
    L('B8', 'holes', 'Six by six', { n: 6, folds: 2, punches: 2 }),
  ] },
  { id: 'C', name: 'Diagonals', brief: 'A fold at 45 degrees turns the punch a quarter turn and mirrors it.', levels: [
    L('C1', 'holes', 'Corner to corner', { diagonals: true }),
    L('C2', 'holes', 'Triangle fold', { diagonals: true, folds: 2 }),
    L('C3', 'mirror', 'L on the slant', { shape: 'ell', diagonals: true, folds: 1 }),
    L('C4', 'cut', 'Diamond', { shape: 'notch', diagonals: true, folds: 2 }),
    L('C5', 'holes', 'Kite', { diagonals: true, folds: 2, n: 5 }),
    L('C6', 'reverse', 'Across the corner', { diagonals: true }),
    L('C7', 'mirror', 'F on the slant', { shape: 'eff', diagonals: true, folds: 2 }),
    L('C8', 'cut', 'Flags', { shape: 'flag', diagonals: true, folds: 2 }),
  ] },
  { id: 'D', name: 'Three folds', brief: 'Eight layers. Count them by orbiting the stack before you answer.', levels: [
    L('D1', 'holes', 'Eighths', { folds: 3 }),
    L('D2', 'mirror', 'Eight Ls', { shape: 'ell', folds: 3 }),
    L('D3', 'holes', 'Eighths, two punches', { folds: 3, punches: 2, n: 6 }),
    L('D4', 'cut', 'A row of houses', { shape: 'house', folds: 3, n: 6 }),
    L('D5', 'mirror', 'Eight Fs', { shape: 'eff', folds: 3, n: 6 }),
    L('D6', 'reverse', 'Eight holes', { folds: 3 }),
    L('D7', 'holes', 'Folded slant', { folds: 3, diagonals: true, n: 6 }),
    L('D8', 'cut', 'Arches', { shape: 'arch', folds: 3, n: 6 }),
  ] },
  { id: 'E', name: 'Lace', brief: 'Cuts against folded edges open into lace: snowflakes and chains of paper houses.', levels: [
    L('E1', 'cut', 'House chain', { shape: 'house', folds: 2, n: 6 }),
    L('E2', 'cut', 'Snowflake', { shape: 'notch', folds: 3, diagonals: true, n: 6 }),
    L('E3', 'mirror', 'Triangles on the slant', { shape: 'tri', folds: 3, diagonals: true, n: 6 }),
    L('E4', 'cut', 'Stepped lace', { shape: 'step', folds: 3, n: 6 }),
    L('E5', 'holes', 'Lace of holes', { folds: 3, diagonals: true, punches: 2, n: 6 }),
    L('E6', 'cut', 'Flag chain', { shape: 'flag', folds: 3, n: 6 }),
    L('E7', 'reverse', 'Slanted pair', { diagonals: true, folds: 2 }),
    L('E8', 'cut', 'Arcade', { shape: 'arch', folds: 3, diagonals: true, n: 6 }),
  ] },
  { id: 'F', name: 'Expert', brief: 'Four folds, off centre, slanted. One punch, sixteen holes.', levels: [
    L('F1', 'holes', 'Sixteenths', { folds: 4, n: 8 }),
    L('F2', 'mirror', 'Sixteen Fs', { shape: 'eff', folds: 4, n: 8 }),
    L('F3', 'cut', 'Village', { shape: 'house', folds: 4, n: 8 }),
    L('F4', 'holes', 'Everything at once', { folds: 4, diagonals: true, punches: 2, n: 8 }),
    L('F5', 'reverse', 'Make it', { folds: 3, n: 5 }),
    L('F6', 'mirror', 'Moons on the slant', { shape: 'moon', folds: 4, diagonals: true, n: 8 }),
    L('F7', 'cut', 'Snow', { shape: 'notch', folds: 4, diagonals: true, n: 8 }),
    L('F8', 'reverse', 'The last sheet', { folds: 3, diagonals: true, n: 6, punches: 2 }),
  ] },
];
