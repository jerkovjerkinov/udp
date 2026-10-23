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
//
// Inside a pack: introduce (1-2), develop (3-4), twist (5-6), a breather (7),
// and a showpiece cut to end on (a house chain, a snowflake, lace). Holes and
// mirror levels climb with the number of layers. The comment on each level
// says why it is there; `learn` is what the summary tells the player.

const L = (id, task, name, opts = {}) => ({ id, task, name, n: 4, folds: 1, ...opts });

export const PACKS = [
  { id: 'A', name: 'Halves', brief: 'Fold the paper once and punch it once. When it opens, every hole has a twin on the other side of the crease.', levels: [
    // introduce: one fold, one punch, two holes
    L('A1', 'holes', 'In half', { learn: 'One fold makes two layers, so one punch makes two holes, mirrored across the crease.' }),
    // develop: two punches, four holes
    L('A2', 'holes', 'In half again', { punches: 2, learn: 'Each punch makes its own pair of twins.' }),
    // develop: a shape that shows which way it faces
    L('A3', 'mirror', 'The L', { shape: 'ell', learn: 'The twin of an L is mirrored, like a reflection across the crease.' }),
    // develop: an odd sheet, where the crease is off centre
    L('A4', 'holes', 'Odd sheet', { n: 5, punches: 2, learn: 'On an odd sheet the crease is off centre, but the twins still sit at the same distance from it.' }),
    // twist: now you fold and punch
    L('A5', 'reverse', 'Make the twins', { learn: 'Working backwards: the crease goes exactly halfway between the two twins.' }),
    // twist: a second fold sneaks in
    L('A6', 'holes', 'Off centre', { n: 5, folds: 2, learn: 'A second fold doubles everything again: two layers became four.' }),
    // breather: the first snip of the scissors
    L('A7', 'cut', 'A notch', { shape: 'notch', learn: 'A snip into the folded edge opens into a shape twice as wide.' }),
    // showpiece: two houses joined at the crease
    L('A8', 'cut', 'Two houses', { shape: 'house', folds: 1, learn: 'Cut half a house against the fold, and a whole one opens out.' }),
  ] },
  { id: 'B', name: 'Quarters', brief: 'Two folds make four layers, so one punch leaves four holes.', levels: [
    // introduce: four layers
    L('B1', 'holes', 'Quarters', { folds: 2, learn: 'Two folds, four layers, four holes: one in each quarter.' }),
    // develop: an F, mirrored twice
    L('B2', 'mirror', 'The F', { shape: 'eff', folds: 2, learn: 'Mirrored twice, the F in the far corner is turned right round.' }),
    // develop: two punches on four layers
    L('B3', 'holes', 'Two punches', { n: 5, folds: 2, punches: 2, learn: 'Two punches on four layers make eight holes.' }),
    // develop: a triangle, which only flips across some creases
    L('B4', 'mirror', 'The triangle', { shape: 'tri', folds: 2, learn: 'A triangle’s point shows which way each copy was flipped.' }),
    // twist: you fold it, for four holes
    L('B5', 'reverse', 'Four holes', { folds: 2, learn: 'Each crease lies halfway between a pair of holes.' }),
    // twist: half-moons on an odd sheet
    L('B6', 'mirror', 'Half-moons', { shape: 'moon', folds: 2, n: 5, learn: 'A half-moon shows a flip as clearly as an L does.' }),
    // breather: steps, snipped
    L('B7', 'cut', 'Steps', { shape: 'step', folds: 2, learn: 'Steps cut on four layers open into a stepped frame.' }),
    // showpiece: a chain of paper houses
    L('B8', 'cut', 'House chain', { shape: 'house', folds: 2, n: 6, learn: 'A row of paper houses, holding hands at the creases.' }),
  ] },
  { id: 'C', name: 'Diagonals', brief: 'Folding corner to corner, at 45 degrees, mirrors the punch and also turns it a quarter turn.', levels: [
    // introduce: one fold across the corner
    L('C1', 'holes', 'Corner to corner', { diagonals: true, learn: 'Across a diagonal crease, a hole’s twin swaps its row and its column.' }),
    // develop: an L on the slant
    L('C2', 'mirror', 'L on the slant', { shape: 'ell', diagonals: true, folds: 1, learn: 'Mirrored on the slant, the L also turns a quarter.' }),
    // develop: two diagonal folds
    L('C3', 'holes', 'Triangle fold', { diagonals: true, folds: 2, learn: 'Two diagonal folds make a triangle of four layers.' }),
    // develop: the first slanted snip
    L('C4', 'cut', 'Diamond', { shape: 'notch', diagonals: true, folds: 2, learn: 'A notch on a slanted fold opens into a diamond.' }),
    // twist: fold it yourself, on the slant
    L('C5', 'reverse', 'Across the corner', { diagonals: true, learn: 'Twins across a diagonal sit at mirror places on either side of the corner-to-corner line.' }),
    // twist: an F on two slanted folds
    L('C6', 'mirror', 'F on the slant', { shape: 'eff', diagonals: true, folds: 2, learn: 'Each slanted crease flips the F and turns it, and you kept track of both.' }),
    // breather: a kite of holes
    L('C7', 'holes', 'Kite', { diagonals: true, folds: 2, n: 5, learn: 'Two slanted folds on an odd sheet still make four layers, and four holes.' }),
    // showpiece: flags on the slant
    L('C8', 'cut', 'Flags', { shape: 'flag', diagonals: true, folds: 2, learn: 'Flags cut on the slant fly in four directions when the paper opens.' }),
  ] },
  { id: 'D', name: 'Three folds', brief: 'Three folds make eight layers. Turn the folded stack and count them before you answer.', levels: [
    // introduce: eight layers
    L('D1', 'holes', 'Eighths', { folds: 3, learn: 'Three folds, eight layers: one punch makes eight holes.' }),
    // develop: eight Ls
    L('D2', 'mirror', 'Eight Ls', { shape: 'ell', folds: 3, learn: 'With eight Ls, every other one is mirrored.' }),
    // develop: two punches on eight layers
    L('D3', 'holes', 'Eighths, two punches', { folds: 3, punches: 2, n: 6, learn: 'Sixteen holes from two punches: counting the layers first made it simple.' }),
    // develop: eight Fs
    L('D4', 'mirror', 'Eight Fs', { shape: 'eff', folds: 3, n: 6, learn: 'An F shows every flip, so eight Fs show every layer’s history.' }),
    // twist: you fold three times
    L('D5', 'reverse', 'Eight holes', { folds: 3, learn: 'Three creases, found one at a time.' }),
    // twist: a slanted fold among three
    L('D6', 'holes', 'Folded slant', { folds: 3, diagonals: true, n: 6, learn: 'One slanted fold among straight ones sends some of the holes onto a slant.' }),
    // breather: a row of houses
    L('D7', 'cut', 'A row of houses', { shape: 'house', folds: 3, n: 6, learn: 'Eight layers, a row of houses.' }),
    // showpiece: a snowflake
    L('D8', 'cut', 'Snowflake', { shape: 'notch', folds: 3, diagonals: true, n: 6, learn: 'Folded on the slant and snipped, the paper opened into a snowflake.' }),
  ] },
  { id: 'E', name: 'Lace', brief: 'Snip into the folded edges and the paper opens into lace, like snowflakes and chains of paper houses.', levels: [
    // introduce: arches on eight layers
    L('E1', 'cut', 'Arches', { shape: 'arch', folds: 3, n: 6, learn: 'Half an arch against the fold opens into a whole one, repeated.' }),
    // develop: stepped lace
    L('E2', 'cut', 'Stepped lace', { shape: 'step', folds: 3, n: 6, learn: 'Steps repeated on every layer make lace.' }),
    // develop: triangles on the slant
    L('E3', 'mirror', 'Triangles on the slant', { shape: 'tri', folds: 3, diagonals: true, n: 6, learn: 'On slanted folds the triangles spin round the centre.' }),
    // develop: a chain of flags
    L('E4', 'cut', 'Flag chain', { shape: 'flag', folds: 3, n: 6, learn: 'Each flag is the mirror of the one across the crease.' }),
    // twist: holes among the lace
    L('E5', 'holes', 'Lace of holes', { folds: 3, diagonals: true, punches: 2, n: 6, learn: 'Two punches through eight slanted layers, counted layer by layer.' }),
    // twist: fold a slanted pair yourself
    L('E6', 'reverse', 'Slanted pair', { diagonals: true, folds: 2, learn: 'Two slanted creases, found from the pattern of holes.' }),
    // showpiece: an arcade on the slant
    L('E7', 'cut', 'Arcade', { shape: 'arch', folds: 3, diagonals: true, n: 6, learn: 'Arches on slanted folds open out in every direction.' }),
  ] },
  { id: 'F', name: 'Expert', brief: 'Four folds, some slanted and some off centre, so a single punch makes sixteen holes.', levels: [
    // introduce: sixteen layers
    L('F1', 'holes', 'Sixteenths', { folds: 4, n: 8, learn: 'Four folds, sixteen layers: one punch makes sixteen holes.' }),
    // develop: sixteen Fs
    L('F2', 'mirror', 'Sixteen Fs', { shape: 'eff', folds: 4, n: 8, learn: 'Sixteen Fs, each with its own way of facing.' }),
    // develop: you fold three times on an odd sheet
    L('F3', 'reverse', 'Make it', { folds: 3, n: 5, learn: 'On an odd sheet the creases fall off centre, and the holes still told you where.' }),
    // develop: everything at once
    L('F4', 'holes', 'Everything at once', { folds: 4, diagonals: true, punches: 2, n: 8, learn: 'Straight and slanted folds together, and you kept count of every layer.' }),
    // twist: half-moons on the slant
    L('F5', 'mirror', 'Moons on the slant', { shape: 'moon', folds: 4, diagonals: true, n: 8, learn: 'Sixteen half-moons, turned and flipped by four creases.' }),
    // twist: the hardest sheet to fold yourself
    L('F6', 'reverse', 'The last sheet', { folds: 3, diagonals: true, n: 6, punches: 2, learn: 'Three creases, one of them slanted, found from the holes alone.' }),
    // breather: a village of houses
    L('F7', 'cut', 'Village', { shape: 'house', folds: 4, n: 8, learn: 'Sixteen layers, a whole village of houses.' }),
    // showpiece: snow
    L('F8', 'cut', 'Snow', { shape: 'notch', folds: 4, diagonals: true, n: 8, learn: 'Four folds and one snip: a snowflake of sixteen layers.' }),
  ] },
];
