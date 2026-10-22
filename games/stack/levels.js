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

const T = s => s.split(' ');
const L = (id, task, name, spec) => ({ id, task, name, ...spec });
const M = (id, name, mass, pool) => L(id, 'fill', name, { mass, pool: pool && T(pool), site: { W: mass[0].length, D: mass.length, H: Math.max(...mass.flat()) } });

const S1 = { support: 1 }, S0 = { support: 0 };
const DAY = { support: 1, daylight: 'any' }, SUN = { support: 1, daylight: 'south' };
const TER = { support: 1, terrace: 1 }, DT = { support: 1, daylight: 'any', terrace: 1 };
const ALL = { support: 1, daylight: 'any', terrace: 1, access: true };

export const PACKS = [
  { id: 'A', name: 'Massing', brief: 'Fill the massing exactly. A module drops from above and stops on what is under it, so the order matters: what goes underneath goes first.', levels: [
    M('A1', 'Two storeys', [[2, 2, 2]], 'studio corner flat'),
    M('A2', 'Cube', [[2, 2], [2, 2]], 'corner studio square family'),
    M('A3', 'Slab and tower', [[3, 1, 1], [1, 1, 1]], 'corner family tee studio'),
    M('A4', 'Terraces', [[3, 2, 1], [3, 2, 1]], 'corner family tee step square'),
    M('A5', 'Courtyard', [[2, 2, 2], [2, 0, 2], [2, 2, 2]], 'family tee step corner studio'),
    M('A6', 'Stepped block', [[3, 3, 2, 1], [3, 2, 2, 1]], 'corner family tee step tripod twist'),
    M('A7', 'Box', [[2, 2, 2], [2, 2, 2]], 'tripod twist corner family tee step'),
    M('A8', 'Soma cube', [[3, 3, 3], [3, 3, 3], [3, 3, 3]], 'corner family tee step tripod twist'),
  ] },
  { id: 'B', name: 'Support', brief: 'A module rests on the ground or on another module. Where nothing carries a cell it overhangs, and an overhang has a limit.', levels: [
    L('B1', 'habitat', 'First stack', { site: { W: 3, D: 2, H: 3 }, types: T('flat studio corner studio'), rules: S1 }),
    L('B2', 'match', 'From the drawings', { site: { W: 3, D: 3, H: 3 }, types: T('flat corner studio studio'), rules: S1 }),
    L('B3', 'habitat', 'Setback', { site: { W: 3, D: 3, H: 4, rows: [2, 3, 4] }, types: T('flat studio corner studio corner'), rules: S1 }),
    L('B4', 'fix', 'One too far', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family'), rules: S1 }),
    L('B5', 'habitat', 'No overhang', { site: { W: 3, D: 3, H: 4 }, types: T('flat studio corner studio corner flat'), rules: S0 }),
    L('B6', 'match', 'Long section', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family studio'), rules: S1 }),
    L('B7', 'fix', 'Hanging', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: S0, hard: true }),
    L('B8', 'habitat', 'Tight lot', { site: { W: 3, D: 2, H: 4 }, types: T('flat studio corner studio family'), rules: S0 }),
  ] },
  { id: 'C', name: 'Daylight', brief: 'Every module needs a window: a side that looks out over open ground to the edge of the site. Later, it must face south, toward the street.', levels: [
    L('C1', 'habitat', 'Windows', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: DAY }),
    L('C2', 'habitat', 'Dense', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio corner flat'), rules: DAY }),
    L('C3', 'match', 'Lit section', { site: { W: 4, D: 3, H: 3 }, types: T('flat corner studio family studio'), rules: DAY }),
    L('C4', 'fix', 'In the shade', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DAY, hard: true }),
    L('C5', 'habitat', 'South light', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: SUN }),
    L('C6', 'fix', 'Blocked view', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: SUN, hard: true }),
    L('C7', 'habitat', 'South front', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner flat'), rules: SUN }),
    L('C8', 'optimise', 'Most light', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: SUN, goal: 'daylight' }),
  ] },
  { id: 'D', name: 'Terrace', brief: 'Each unit\'s roof is another\'s garden: every module keeps roof cells open to the sky, and every one still needs its window.', levels: [
    L('D1', 'habitat', 'Roof garden', { site: { W: 3, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: TER }),
    L('D2', 'habitat', 'Light and air', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT }),
    L('D3', 'fix', 'Overshadowed', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, hard: true }),
    L('D4', 'match', 'Terraced section', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio'), rules: DT }),
    L('D5', 'habitat', 'Two cells of sky', { site: { W: 4, D: 3, H: 4 }, types: T('flat corner studio family studio corner'), rules: { support: 1, terrace: 2 } }),
    L('D6', 'fix', 'Built over', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner family tee studio corner'), rules: { support: 1, daylight: 'any', terrace: 2 }, hard: true }),
    L('D7', 'optimise', 'Most garden', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT, goal: 'terrace' }),
    L('D8', 'habitat', 'Hillside', { site: { W: 5, D: 4, H: 5, rows: [2, 3, 4, 5] }, types: T('flat corner studio family studio corner tee flat'), rules: { support: 1, daylight: 'any', terrace: 2 } }),
  ] },
  { id: 'E', name: 'Access', brief: 'Every module needs a way in: it touches a circulation core, or the street at ground level. The cores run the full height.', levels: [
    L('E1', 'habitat', 'The core', { site: { W: 4, D: 3, H: 4, cores: [[1, 2]] }, types: T('flat corner studio family studio'), rules: { support: 1, access: true } }),
    L('E2', 'habitat', 'Around the core', { site: { W: 4, D: 4, H: 5, cores: [[1, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL }),
    L('E3', 'fix', 'No way in', { site: { W: 4, D: 4, H: 4, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, hard: true }),
    L('E4', 'match', 'Core and drawings', { site: { W: 4, D: 3, H: 4, cores: [[2, 2]] }, types: T('flat corner studio family studio'), rules: { support: 1, access: true } }),
    L('E5', 'habitat', 'Two cores', { site: { W: 5, D: 4, H: 5, cores: [[1, 2], [3, 1]] }, types: T('flat corner studio family studio corner flat'), rules: ALL }),
    L('E6', 'fix', 'Cut off', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner flat'), rules: ALL, hard: true }),
    L('E7', 'optimise', 'Gardens on the core', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL, goal: 'terrace' }),
    L('E8', 'habitat', 'Habitat', { site: { W: 5, D: 5, H: 5, cores: [[1, 3], [3, 1]] }, types: T('flat corner studio family studio corner flat tee'), rules: { support: 1, daylight: 'south', terrace: 2, access: true } }),
  ] },
  { id: 'F', name: 'Drawings', brief: 'Plan and front elevation fix the stack; the rules decide how. Match both drawings with every rule in force, and design for the score.', levels: [
    L('F1', 'match', 'Plan and front', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: S1 }),
    L('F2', 'match', 'Lit from the drawings', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DAY }),
    L('F3', 'optimise', 'South gardens', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: { support: 1, daylight: 'south', terrace: 1, access: true }, goal: 'daylight' }),
    L('F4', 'match', 'Roofs from the drawings', { site: { W: 4, D: 4, H: 4 }, types: T('flat corner studio family studio corner'), rules: DT }),
    L('F5', 'fix', 'One wrong move', { site: { W: 5, D: 5, H: 5, cores: [[1, 3], [3, 1]] }, types: T('flat corner studio family studio corner flat tee'), rules: ALL, hard: true }),
    L('F6', 'match', 'Drawn with a core', { site: { W: 5, D: 4, H: 5, cores: [[2, 2]] }, types: T('flat corner studio family studio corner'), rules: ALL }),
    L('F7', 'optimise', 'Zoning envelope', { site: { W: 5, D: 4, H: 5, rows: [3, 4, 5, 5], cores: [[2, 2]] }, types: T('flat corner studio family studio corner tee'), rules: ALL, goal: 'terrace' }),
    L('F8', 'habitat', 'Sixty-seven', { site: { W: 6, D: 5, H: 6, rows: [3, 4, 5, 6, 6], cores: [[1, 3], [4, 2]] }, types: T('flat corner studio family studio corner flat tee family studio'), rules: { support: 1, daylight: 'south', terrace: 2, access: true } }),
  ] },
];
