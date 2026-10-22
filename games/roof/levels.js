// Roof Plans: hand-made levels in packs named after building types. A plan is
// drawn as rows of '#' (a module under the roof) and '.' (open), north up.
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

export const PACKS = [
  { id: 'A', name: 'House', brief: 'One rectangle, then an L. Hips leave every outside corner at 45 degrees.', levels: [
    L('A1', 'name', 'Pavilion', RECT),
    L('A2', 'which', 'Long house', LONG),
    L('A3', 'error', 'Pavilion', RECT, { errors: 1 }),
    L('A4', 'name', 'L-house', ELL),
    L('A5', 'draw', 'Hall', HALL),
    L('A6', 'which', 'L-house', ELL2),
    L('A7', 'draw', 'L-house', ELL),
    L('A8', 'construct', 'Long house', LONG),
  ] },
  { id: 'B', name: 'L and T', brief: 'Inside corners bring valleys. A lower wing’s ridge stops on the main roof.', levels: [
    L('B1', 'name', 'T-school', TEE),
    L('B2', 'error', 'L-house', ELL2, { errors: 1 }),
    L('B3', 'which', 'T-school', TEE2),
    L('B4', 'draw', 'T-school', TEE),
    L('B5', 'name', 'Stepped house', STEP, { model: false }),
    L('B6', 'error', 'T-school', TEE2, { errors: 2 }),
    L('B7', 'construct', 'L-house', ELL2),
    L('B8', 'brief', 'Two valleys', null, { brief: { valleys: 2, ridges: 1, maxModules: 18 }, size: [8, 6] }),
  ] },
  { id: 'C', name: 'U and H', brief: 'Two wings and a body: ridges meet, valleys pair up.', levels: [
    L('C1', 'which', 'U-plan', YOU),
    L('C2', 'name', 'H-plan', AITCH),
    L('C3', 'error', 'U-plan', YOU2, { errors: 2 }),
    L('C4', 'draw', 'H-plan', AITCH),
    L('C5', 'construct', 'U-plan', YOU),
    L('C6', 'name', 'Z-plan', ZED, { model: false }),
    L('C7', 'error', 'Z-plan', ZED, { errors: 2 }),
    L('C8', 'brief', 'Four valleys', null, { brief: { valleys: 4, maxModules: 22 }, size: [8, 6] }),
  ] },
  { id: 'D', name: 'Courtyards', brief: 'A roof round a void: valleys on the inside corners, the ridge goes all the way round.', levels: [
    L('D1', 'which', 'Courtyard house', COURT),
    L('D2', 'name', 'Courtyard house', COURT),
    L('D3', 'draw', 'Courtyard house', COURT2),
    L('D4', 'error', 'Konak', KONAK, { errors: 2 }),
    L('D5', 'construct', 'Courtyard house', COURT),
    L('D6', 'name', 'Konak', KONAK, { model: false }),
    L('D7', 'draw', 'Konak', KONAK),
    L('D8', 'brief', 'A courtyard', null, { brief: { courtyard: true, maxModules: 24 }, size: [7, 7] }),
  ] },
  { id: 'E', name: 'Cross plans', brief: 'Churches and winged buildings: many valleys meeting a long ridge.', levels: [
    L('E1', 'which', 'Cross church', CROSS),
    L('E2', 'name', 'Basilica with transept', CHURCH),
    L('E3', 'error', 'Cross church', CROSS, { errors: 3 }),
    L('E4', 'draw', 'Winged villa', WINGS),
    L('E5', 'construct', 'Cross church', CROSS),
    L('E6', 'name', 'Winged villa', WINGS, { model: false }),
    L('E7', 'error', 'Basilica with transept', CHURCH, { errors: 3 }),
    L('E8', 'construct', 'Basilica with transept', CHURCH),
  ] },
  { id: 'F', name: 'Terraces and schools', brief: 'Long buildings that step and branch. The plan does not care how steep the roof is.', levels: [
    L('F1', 'which', 'Terrace', TERRACE),
    L('F2', 'name', 'School', SCHOOL, { model: false }),
    L('F3', 'error', 'Terrace', TERRACE, { errors: 3 }),
    L('F4', 'draw', 'School', SCHOOL),
    L('F5', 'construct', 'Terrace', TERRACE),
    L('F6', 'brief', 'High ridge', null, { brief: { height: 2, valleys: 2, maxModules: 30 }, size: [9, 7] }),
    L('F7', 'construct', 'School', SCHOOL),
    L('F8', 'brief', 'Three wings', null, { brief: { valleys: 4, ridges: 1, minModules: 24 }, size: [10, 8] }),
  ] },
];
