// Stack: hand-placed levels. Each names its task, a site and the modules; the
// stack itself is generated from the level id (src/core/stack.js makeLevel),
// so every level has a known solution. The tests build every one.
//
// Tasks
//   fill      fill the massing exactly with the given modules
//   habitat   place every module so every rule holds
//   match     place the modules so the stack matches the plan and the front elevation
//   fix       one module breaks a rule: move one module so every rule holds
//   optimise  every rule holds, and the terrace (or daylight) score reaches the goal
//
// Inside a pack: introduce, develop, then the mend-it levels (fix) as the twist
// at 5 and 6, a breather, and a real building to end on. `learn` is what the
// summary tells the player.

const T = s => s.split(' ');
const L = (id, task, name, spec) => ({ id, task, name, ...spec });
const M = (id, name, mass, pool) => L(id, 'fill', name, { mass, pool: pool && T(pool), site: { W: mass[0].length, D: mass.length, H: Math.max(...mass.flat()) } });

const S1 = { support: 1 }, S0 = { support: 0 };
const DAY = { support: 1, daylight: 'any' }, SUN = { support: 1, daylight: 'south' };
const TER = { support: 1, terrace: 1 }, DT = { support: 1, daylight: 'any', terrace: 1 };
const ALL = { support: 1, daylight: 'any', terrace: 1, access: true };

export const PACKS = [
  { id: 'A', name: 'Massing', brief: 'Fill a volume with housing modules. Each one drops from above and comes to rest on whatever is below it, so the order you place them in matters.', levels: [
    // the toy: tap, and a module drops into place
    { ...M('A1', 'Two rooms', [[2, 2]], 'studio'), say: 'Tap inside the orange volume to drop a module there. Fill it to finish.', learn: 'Each module drops from above and rests on whatever is below it.' },
    // introduce Tip
    { ...M('A2', 'Two storeys', [[2, 2, 2]], 'studio corner flat'), say: 'Lying flat, these modules won’t all fit. Use Tip to stand one on its end.', learn: 'Standing a module on its end let it fill a tall gap.' },
    // develop: four modules, one cube
    { ...M('A3', 'Cube', [[2, 2], [2, 2]], 'corner studio square family'), learn: 'A cube of modules fills from the bottom up, so the order matters.' },
    // develop: a slab and a tower
    { ...M('A4', 'Slab and tower', [[3, 1, 1], [1, 1, 1]], 'corner family tee studio'), learn: 'A slab and a tower from four modules, each one dropped where it fits.' },
    // twist: a hole in the middle
    { ...M('A5', 'Courtyard', [[2, 2, 2], [2, 0, 2], [2, 2, 2]], 'family tee step corner studio'), learn: 'Around a courtyard the modules have to turn the corners.' },
    // showpiece: the Soma cube
    { ...M('A6', 'Soma cube', [[3, 3, 3], [3, 3, 3], [3, 3, 3]], 'corner family tee step tripod twist'), learn: 'The classic Soma puzzle, a cube of 27 cells, built as housing.' },
  ] },
  { id: 'B', name: 'Support', brief: 'Every module stands on the ground or on another module. A part with nothing under it is an overhang, and an overhang can only reach so far.', levels: [
    // introduce support
    L('B1', 'habitat', 'First stack', { site: { W: 3, D: 2, H: 3 }, types: T('flat studio corner studio'), rules: S1, learn: 'A module can stand on the ground or on another module, and nowhere else.' }),
    // introduce the drawings
    L('B2', 'match', 'From the drawings', { site: { W: 3, D: 3, H: 3 }, types: T('flat corner studio studio'), rules: S1, learn: 'The plan and the front view together told you where every module goes.' }),
    // develop: a setback
    L('B3', 'habitat', 'Setback', { site: { W: 3, D: 3, H: 4, rows: [2, 3, 4] }, types: T('flat studio corner studio corner'), rules: S1, learn: 'A setback steps back as it rises, every module resting on the one below.' }),
    // develop: the rule gets stricter
    L('B4', 'habitat', 'No overhang', { site: { W: 3, D: 3, H: 4 }, types: T('flat studio corner studio corner flat'), rules: S0, learn: 'With no overhang allowed, every module sits fully on what is under it.' }),
    // twist: mend a stack
    L('B5', 'fix', 'One too far', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family'), rules: S1, learn: 'One module reached too far. Moving it back put every module on something solid.' }),
    // twist: a harder mend
    L('B6', 'fix', 'Hanging', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: S0, hard: true, learn: 'A hanging module needed something under it, or a new place altogether.' }),
    // breather: drawings again
    L('B7', 'match', 'Long section', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family studio'), rules: S1, learn: 'A long section, read from the drawings.' }),
    // showpiece: a tower house on a tight lot
    L('B8', 'habitat', 'Tight lot', { site: { W: 3, D: 2, H: 4 }, types: T('flat studio corner studio family'), rules: S0, learn: 'On a tight lot, every module had to sit squarely on another.' }),
  ] },
  { id: 'C', name: 'Daylight', brief: 'Every home needs a window, which means one side looking out over open ground to the edge of the site. Later the window has to face south, toward the street.', levels: [
    // introduce daylight
    L('C1', 'habitat', 'Windows', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: DAY, learn: 'A window needs open ground in front of it, all the way to the edge of the site.' }),
    // develop: more homes
    L('C2', 'habitat', 'Dense', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio corner flat'), rules: DAY, learn: 'In a dense stack, some homes have to look out over the roofs of others.' }),
    // develop: drawings with daylight
    L('C3', 'match', 'Lit section', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family studio'), rules: DAY, learn: 'The drawings and the daylight rule together left one answer.' }),
    // develop: south light
    L('C4', 'habitat', 'South light', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: SUN, learn: 'Facing south means the open side looks toward the street.' }),
    // twist: mend the shade
    L('C5', 'fix', 'In the shade', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DAY, hard: true, learn: 'One home was in the shade. Moving one module let it see out.' }),
    // twist: a harder mend
    L('C6', 'fix', 'Blocked view', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: SUN, hard: true, learn: 'A blocked south view, cleared by moving one module.' }),
    // breather
    L('C7', 'habitat', 'South front', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner flat'), rules: SUN, learn: 'South fronts on every home, on a deeper site.' }),
    // showpiece: the most light
    L('C8', 'optimise', 'Most light', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: SUN, goal: 'daylight', learn: 'The most light: homes that see over each other toward the south.' }),
  ] },
  { id: 'D', name: 'Terrace', brief: 'One home’s roof can be another home’s garden. Every module keeps some of its roof open to the sky, and still needs its window.', levels: [
    // introduce terraces
    L('D1', 'habitat', 'Roof garden', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: TER, learn: 'A roof garden is a piece of roof left open to the sky.' }),
    // develop: two rules at once
    L('D2', 'habitat', 'Light and air', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, learn: 'Every home kept its window and a piece of open roof.' }),
    // develop: a terraced section
    L('D3', 'match', 'Terraced section', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: DT, learn: 'The drawings showed where the terraces step.' }),
    // develop: more garden
    L('D4', 'habitat', 'Two cells of sky', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: { support: 1, terrace: 2 }, learn: 'Two cells of sky per home pushes the stack into steps.' }),
    // twist: mend the shade
    L('D5', 'fix', 'Overshadowed', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, hard: true, learn: 'One home was overshadowed. Moving one module opened its roof again.' }),
    // twist: a harder mend
    L('D6', 'fix', 'Built over', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner family tee studio corner'), rules: { support: 1, daylight: 'any', terrace: 2 }, hard: true, learn: 'Built over: freeing one roof without closing another.' }),
    // breather: the most garden
    L('D7', 'optimise', 'Most garden', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, goal: 'terrace', learn: 'The biggest gardens come from homes stepping back from each other.' }),
    // showpiece: a terraced hillside
    L('D8', 'habitat', 'Hillside', { site: { W: 5, D: 4, H: 5, rows: [2, 3, 4, 5] }, types: T('flat corner studio family studio corner tee flat'), rules: { support: 1, daylight: 'any', terrace: 2 }, learn: 'A hillside of terraced homes, each with its garden and its view.' }),
  ] },
  { id: 'E', name: 'Access', brief: 'Every home needs a way in. It has to touch a stair core, or the street at ground level. The cores run the full height of the building.', levels: [
    // introduce access
    L('E1', 'habitat', 'The core', { site: { W: 4, D: 3, H: 4, cores: [[1, 2]] }, types: T('flat corner studio family studio'), rules: { support: 1, access: true }, learn: 'Every home touches the stair core or the street.' }),
    // develop: every rule
    L('E2', 'habitat', 'Around the core', { site: { W: 4, D: 4, H: 5, cores: [[1, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, learn: 'Homes wrap round the core, and still keep their light and gardens.' }),
    // develop: drawings with a core
    L('E3', 'match', 'Core and drawings', { site: { W: 4, D: 3, H: 4, cores: [[2, 2]] }, types: T('flat corner studio family studio'), rules: { support: 1, access: true }, learn: 'The core shows in the drawings too.' }),
    // develop: two cores
    L('E4', 'habitat', 'Two cores', { site: { W: 5, D: 4, H: 5, cores: [[1, 2], [3, 1]] }, types: T('flat corner studio family studio corner flat'), rules: ALL, learn: 'Two cores let the stack spread across the site.' }),
    // twist: mend the access
    L('E5', 'fix', 'No way in', { site: { W: 4, D: 4, H: 4, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, hard: true, learn: 'One home had no way in. Moving one module put it against the core.' }),
    // twist: a harder mend
    L('E6', 'fix', 'Cut off', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner flat'), rules: ALL, hard: true, learn: 'A home cut off from its core, reconnected by a single move.' }),
    // breather: the most garden
    L('E7', 'optimise', 'Gardens on the core', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, goal: 'terrace', learn: 'Gardens on the core: the homes step up around it.' }),
    // showpiece: Habitat
    L('E8', 'habitat', 'Habitat', { site: { W: 5, D: 5, H: 5, cores: [[1, 3], [3, 1]] }, types: T('flat corner studio family studio corner flat tee'), rules: { support: 1, daylight: 'south', terrace: 2, access: true }, learn: 'Every rule at once, the way Moshe Safdie stacked Habitat 67.' }),
  ] },
  { id: 'F', name: 'Drawings', brief: 'Now the drawings come first. Build a stack that matches the plan and the front view while every rule still holds.', levels: [
    // introduce: drawings first
    L('F1', 'match', 'Plan and front', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: S1, learn: 'A plan and a front view, and a stack that matches both.' }),
    // develop: drawings with daylight
    L('F2', 'match', 'Lit from the drawings', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DAY, learn: 'The drawings and the windows together fixed every module.' }),
    // develop: drawings with terraces
    L('F3', 'match', 'Roofs from the drawings', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, learn: 'Terraces show in the front view as steps.' }),
    // develop: optimise
    L('F4', 'optimise', 'South gardens', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: { support: 1, daylight: 'south', terrace: 1, access: true }, goal: 'daylight', learn: 'South gardens around a core: light, sky and a way in for every home.' }),
    // twist: mend a whole building
    L('F5', 'fix', 'One wrong move', { site: { W: 5, D: 5, H: 5, cores: [[1, 3], [3, 1]] }, types: T('flat corner studio family studio corner flat tee'), rules: ALL, hard: true, learn: 'One wrong move in a full building, found and put right.' }),
    // twist: the hardest drawings
    L('F6', 'match', 'Drawn with a core', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, learn: 'A whole building from its drawings, core and all.' }),
    // breather: within the envelope
    L('F7', 'optimise', 'Zoning envelope', { site: { W: 5, D: 4, H: 5, rows: [3, 4, 5, 5], cores: [[2, 2]] }, types: T('flat corner studio family studio corner tee'), rules: ALL, goal: 'terrace', learn: 'A zoning envelope caps the height, and the gardens still found room.' }),
    // showpiece: Sixty-seven
    L('F8', 'habitat', 'Sixty-seven', { site: { W: 6, D: 5, H: 6, rows: [3, 4, 5, 6, 6], cores: [[1, 3], [4, 2]] }, types: T('flat corner studio family studio corner flat tee family studio'), rules: { support: 1, daylight: 'south', terrace: 2, access: true }, learn: 'Habitat 67 in Montreal: homes stacked so every one gets light, a garden and a way in.' }),
  ] },
];
