// Roof Plans: hand-made levels. A plan is drawn as rows of '#' (a module under
// the roof) and '.' (open), north up.
//
// Each pack works on one idea with at most three tasks, and a task new to the
// game first comes on an easy plan. Inside a pack: introduce (1-2), develop
// (3-4), twist (5-6), a breather (7) and a showpiece (8). The comment on each
// level says why it is there; `learn` is what the summary tells the player.
//
// Tasks
//   which      Which roof? A roof in 3D and three plans; one is its plan
//   error      Spot the error: a drafted plan with wrong lines; tap them
//   name       Name the lines: tap each line until it says ridge, hip or valley
//   draw       Roof to plan: orbit the roof, then draw its plan on the footprint
//   construct  Construct the plan: footprint only, no roof to look at
//   brief      Design to brief: draw a footprint whose roof meets the brief
// opts: errors (wrong lines in 'error'), model (false hides the 3D roof in 'name')

const L = (id, task, name, rows, opts = {}) => ({ id, task, name, rows, ...opts });

const RECT = ['#####', '#####', '#####'];
const LONG = ['#######', '#######'];
const ELL = ['##...', '##...', '#####', '#####'];
const ELL2 = ['###....', '###....', '#######', '#######', '#######'];
const TEE = ['######', '######', '..##..', '..##..'];
const TEE2 = ['########', '########', '...##...', '...##...', '...##...'];
const YOU = ['##..##', '##..##', '######', '######'];
const YOU2 = ['###...###', '###...###', '#########', '#########'];
const AITCH = ['##..##', '######', '######', '##..##'];
const CROSS = ['..##..', '..##..', '######', '######', '..##..', '..##..'];
const STEP = ['###....', '#######', '#######', '....###'];
const ZED = ['####..', '####..', '######', '..####', '..####'];
const COURT = ['######', '######', '##..##', '##..##', '######', '######'];
const COURT2 = ['#######', '#######', '##...##', '##...##', '#######', '#######'];
const KONAK = ['########', '########', '##....##', '##....##', '########', '########'];
const TERRACE = ['##......', '####....', '######..', '########'];
const WINGS = ['##....##', '##....##', '########', '########', '..####..', '..####..'];
const CHURCH = ['...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'];
const SCHOOL = ['##########', '##########', '##..##..##', '##..##..##'];
const HALL = ['####', '####', '####', '####', '####'];
const ELL3 = ['####...', '####...', '#######', '#######'];
const ELL4 = ['##.....', '##.....', '##.....', '#######', '#######'];
const LONG3 = ['########', '########', '########'];
const TEE3 = ['#######', '#######', '..###..', '..###..'];
const YOU3 = ['##...##', '##...##', '##...##', '#######', '#######'];
const COURT3 = ['#######', '#######', '##..###', '##..###', '#######', '#######'];
const COURT5 = ['######..', '######..', '##..####', '##..####', '########', '########'];
const KONAK2 = ['#########', '#########', '##.....##', '##.....##', '#########', '#########'];
const CROSS2 = ['...##...', '...##...', '########', '########', '...##...', '...##...'];
const CROSS3 = ['..##..', '..##..', '..##..', '######', '######', '..##..'];
const CHURCH2 = ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...', '...##...'];
const SCHOOL2 = ['##########', '##########', '##..##..##', '##..##..##', '##########'];
// a wing narrower than the body: its ridge is lower and stops on the main roof
const TEE4 = ['######', '######', '######', '..##..', '..##..'];
const ELL5 = ['##....', '##....', '######', '######', '######'];

// the same type again, seen another way: mirrored or turned a quarter, so no
// plan comes back as it was
const flipX = rows => rows.map(r => [...r].reverse().join(''));
const flipY = rows => [...rows].reverse();
const turn = rows => [...rows[0]].map((_, i) => rows.map(r => r[i]).reverse().join(''));

export const PACKS = [
  { id: 'A', name: 'Reading a roof', brief: 'A roof plan shows a roof from above. A ridge is the level line along the top, a hip runs up from an outside corner at 45 degrees, and a valley rises from an inside corner.', levels: [
    // introduce: one ridge, four hips
    L('A1', 'name', 'Pavilion', RECT, { learn: 'A rectangle under a hipped roof always has one ridge and four hips, one from each corner.' }),
    // develop: a longer ridge, the same four hips
    L('A2', 'name', 'Long house', LONG, { learn: 'However long the house, the hips stay at 45 degrees and only the ridge grows.' }),
    // introduce a second task on the same easy shape
    L('A3', 'which', 'Long house', LONG3, { learn: 'The length of the ridge told the plans apart: it is the house’s length minus its width.' }),
    // develop: read the 3D roof against three plans
    L('A4', 'which', 'Hall', HALL, { learn: 'On a deep hall the ridge is short, because the hips nearly meet.' }),
    // twist: the first inside corner, and so the first valley
    L('A5', 'name', 'L-house', ELL, { learn: 'An inside corner always brings a valley, where two slopes meet in a dip.' }),
    // twist: the third task, on a plan you now know
    L('A6', 'error', 'Pavilion', turn(RECT), { errors: 1, learn: 'Checking each line against the corner it starts from showed which one was wrong.' }),
    // breather: an L you can read at a glance
    L('A7', 'which', 'L-house', ELL2, { learn: 'One valley and five hips: the L gave itself away.' }),
    // showpiece: read the L without the 3D roof
    L('A8', 'name', 'L-house', flipX(ELL3), { model: false, learn: 'You read the roof from the plan alone, the way a builder reads a drawing.' }),
  ] },
  { id: 'B', name: 'Drawing the plan', brief: 'Now you draw. Look at the roof, then trace its ridges, hips and valleys on the footprint. Later there is no roof to look at, only the footprint.', levels: [
    // introduce drawing on the simplest roof
    L('B1', 'draw', 'Hall', HALL, { learn: 'A plan is just the roof’s fold lines, seen straight from above.' }),
    // develop: a longer ridge
    L('B2', 'draw', 'Long house', LONG, { learn: 'Draw the hips first from the corners, and the ridge joins their ends.' }),
    // develop: the first valley to draw
    L('B3', 'draw', 'L-house', ELL3, { learn: 'A valley runs up from the inside corner until it meets a ridge.' }),
    // introduce constructing: no roof to look at
    L('B4', 'construct', 'Pavilion', RECT, { learn: 'With only the footprint, the 45-degree rule is enough to find every line.' }),
    // twist: a narrow wing, whose ridge is lower and stops on the main roof
    L('B5', 'draw', 'T-house', TEE4, { learn: 'A narrower wing has a lower ridge. It runs into the main roof and stops there.' }),
    // twist: the same idea with nothing to look at
    L('B6', 'construct', 'L-house', ELL5, { learn: 'The wing’s ridge ends where its valleys meet the main roof.' }),
    // breather: a T you have seen before
    L('B7', 'draw', 'T-school', TEE, { learn: 'When the wing is as wide as the body, both ridges are the same height and join.' }),
    // showpiece: a stepped house, constructed
    L('B8', 'construct', 'Stepped house', STEP, { learn: 'Each step in the plan adds a valley on one side and a hip on the other.' }),
  ] },
  { id: 'C', name: 'Pairs of valleys', brief: 'A body with two wings. The valleys come in pairs, one at each inside corner, and the ridges meet between them.', levels: [
    // introduce: a U, two valleys
    L('C1', 'name', 'U-plan', YOU, { learn: 'Two inside corners, two valleys: one for each wing.' }),
    // develop: an H, four valleys
    L('C2', 'name', 'H-plan', AITCH, { learn: 'An H has four inside corners, so four valleys, two on each side of the body.' }),
    // develop: spot a wrong line on a U
    L('C3', 'error', 'U-plan', YOU2, { errors: 1, learn: 'Each line starts at a corner of its own kind: hips at outside corners, valleys at inside corners.' }),
    // develop: draw the H
    L('C4', 'draw', 'H-plan', turn(AITCH), { learn: 'The body’s ridge runs between the two pairs of valleys.' }),
    // twist: a Z, where the valleys sit on opposite sides
    L('C5', 'name', 'Z-plan', ZED, { model: false, learn: 'On a Z the two valleys sit on opposite sides, so the ridge turns twice.' }),
    // twist: two errors on the S
    L('C6', 'error', 'S-plan', flipX(ZED), { errors: 2, learn: 'Checking every line against the corners it starts from found both mistakes.' }),
    // breather: a deep U to draw
    L('C7', 'draw', 'U-plan', YOU, { learn: 'You knew where both valleys were before you drew a line.' }),
    // showpiece: a big U, from the plan
    L('C8', 'name', 'Deep U-plan', YOU3, { model: false, learn: 'Long wings: the valleys stay short, and the wing ridges run on out to their hips.' }),
  ] },
  { id: 'D', name: 'Courtyards', brief: 'A roof that wraps around an open yard. The ridge runs all the way round, and the valleys sit at the yard’s inside corners.', levels: [
    // introduce: a courtyard house, named with the roof to look at
    L('D1', 'name', 'Courtyard house', COURT, { learn: 'Around a courtyard, the ridge runs in a ring and there is a valley at each corner of the yard.' }),
    // develop: an uneven yard
    L('D2', 'name', 'Courtyard house', COURT3, { learn: 'An uneven yard pushes the ring of ridges off centre.' }),
    // introduce constructing here: a square court
    L('D3', 'construct', 'Courtyard house', COURT2, { learn: 'Four outside corners give hips; four yard corners give valleys.' }),
    // develop: the konak, wider
    L('D4', 'construct', 'Konak', KONAK, { learn: 'A wider yard only makes the ring of ridges longer.' }),
    // twist: no roof to look at, and the valleys face inward
    L('D5', 'name', 'Konak', KONAK2, { model: false, learn: 'The valleys all point into the yard, where the rain runs down.' }),
    // twist: a court with a wing
    L('D6', 'construct', 'Court and wing', COURT5, { learn: 'An extra wing on a courtyard roof joins the ring of ridges.' }),
    // breather: a turned konak to name
    L('D7', 'name', 'Konak', turn(KONAK), { learn: 'Turned a quarter, the same roof reads the same way.' }),
    // showpiece: the big konak, turned, from the footprint alone
    L('D8', 'construct', 'Konak', turn(KONAK2), { learn: 'You built the whole ring of a konak roof from the footprint alone.' }),
  ] },
  { id: 'E', name: 'Cross plans', brief: 'Churches and buildings with wings, where many valleys meet one long ridge.', levels: [
    // introduce: which plan is the cross church?
    L('E1', 'which', 'Cross church', CROSS, { learn: 'A cross has four inside corners, so four valleys meet at the crossing.' }),
    // develop: spot one wrong line
    L('E2', 'error', 'Cross church', CROSS2, { errors: 1, learn: 'At the crossing, four valleys meet the ridge in one point.' }),
    // develop: construct the Latin cross
    L('E3', 'construct', 'Latin cross', CROSS3, { learn: 'A longer nave makes a longer ridge, but the crossing stays the same.' }),
    // develop: which basilica?
    L('E4', 'which', 'Basilica with transept', CHURCH, { learn: 'The transept is as wide as the nave, so their ridges are the same height and cross.' }),
    // twist: three errors on a turned basilica
    L('E5', 'error', 'Basilica with transept', turn(CHURCH), { errors: 3, learn: 'Three mistakes, found by checking each line against the corners it joins.' }),
    // twist: a villa with wings, from the footprint
    L('E6', 'construct', 'Winged villa', WINGS, { learn: 'Wings on both sides add valleys in pairs, as on the H.' }),
    // breather: which villa?
    L('E7', 'which', 'Winged villa', flipY(WINGS), { learn: 'Counting the valleys found the right plan.' }),
    // showpiece: the long basilica
    L('E8', 'construct', 'Long basilica', CHURCH2, { learn: 'The whole basilica, from footprint to roof plan, with no roof to look at.' }),
  ] },
  { id: 'F', name: 'Design to brief', brief: 'Now you design. Draw a footprint whose roof meets the brief: a number of valleys, one ridge, a courtyard. There are many right answers.', levels: [
    // introduce: the easiest brief
    L('F1', 'brief', 'One valley', null, { brief: { valleys: 1, maxModules: 14 }, size: [6, 5], learn: 'One inside corner gives one valley, so an L is enough.' }),
    // develop: two valleys, one ridge
    L('F2', 'brief', 'Two valleys', null, { brief: { valleys: 2, ridges: 1, maxModules: 18 }, size: [8, 6], learn: 'Two valleys on one ridge: a T or a U does it.' }),
    // develop: draw a terrace, to see a long stepped roof
    L('F3', 'draw', 'Terrace', TERRACE, { learn: 'Each step of the terrace adds a valley and a hip.' }),
    // develop: four valleys
    L('F4', 'brief', 'Four valleys', null, { brief: { valleys: 4, maxModules: 22 }, size: [8, 6], learn: 'Four inside corners: an H, a cross, or a body with two wings.' }),
    // twist: a courtyard
    L('F5', 'brief', 'A courtyard', null, { brief: { courtyard: true, maxModules: 24 }, size: [7, 7], learn: 'A ring of modules round an open yard, and the roof takes care of itself.' }),
    // twist: the height of the ridge depends only on the width
    L('F6', 'brief', 'High ridge', null, { brief: { height: 2, valleys: 2, maxModules: 30 }, size: [9, 7], learn: 'The ridge’s height depends only on how wide the roof is: four modules wide makes it two high.' }),
    // breather: construct a school
    L('F7', 'construct', 'School', SCHOOL, { learn: 'A school with courts is just a long body with short wings.' }),
    // showpiece: three wings
    L('F8', 'brief', 'Three wings', null, { brief: { valleys: 4, ridges: 1, minModules: 24 }, size: [10, 8], learn: 'Three wings on one ridge, and the whole roof drains cleanly.' }),
  ] },
];
