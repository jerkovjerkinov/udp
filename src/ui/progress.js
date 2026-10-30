// What a player has done, kept in this browser: marks per level, best times,
// attempts, which packs are open, the daily streak and challenge bests. Pure
// functions over a plain record, plus load/save that survive blocked storage
// (a private window just forgets at the end of the visit).

const KEY = game => 'udp.progress.' + game;
const SUITE = 'udp.suite';
const memory = new Map();                                 // fallback when storage is blocked

function read(key) {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch (e) { /* blocked */ }
  return memory.get(key) ?? null;
}
function write(key, v) {
  memory.set(key, v);
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* blocked */ }
}

export const emptyProgress = () => ({ levels: {}, challenge: { best: 0, bestSplits: null, runs: 0 }, workshop: 0 });
export const loadProgress = game => ({ ...emptyProgress(), ...(read(KEY(game)) || {}) });
export const saveProgress = (game, p) => write(KEY(game), p);

// merge a finished attempt into a level record: marks are kept once earned
// star: the level's master goal met (index 3 in fresh when it is new)
export function recordLevel(p, id, { marks, secs, star = false }) {
  const r = p.levels[id] || { marks: [false, false, false], best: null, attempts: 0 };
  const before = r.marks.slice(), starBefore = !!r.star;
  r.marks = r.marks.map((m, i) => m || !!marks[i]);
  if (star) r.star = true;
  r.attempts++;
  if (marks[0] && (r.best === null || secs < r.best)) r.best = secs;
  p.levels[id] = r;
  const fresh = [0, 1, 2].filter(i => r.marks[i] && !before[i]);
  if (r.star && !starBefore) fresh.push(3);
  return { record: r, fresh };
}

export const marksOf = (p, id) => p.levels[id]?.marks || [false, false, false];
export const solved = (p, id) => !!p.levels[id]?.marks?.[0];

// A..C from the share of possible marks
export function grade(earned, possible) {
  if (!possible) return '—';
  const k = earned / possible;
  return k >= .9 ? 'A' : k >= .6 ? 'B' : 'C';
}

// While the suite is in development every pack is open, so any level can be
// played straight away. Set to false to bring back the unlocking order.
export const ALL_OPEN = true;

// per pack: { open, done, solved, marks, grade, next } — a pack opens when the
// one before it is finished (every level solved); the first is always open
export function packStates(p, packs, { allOpen = ALL_OPEN } = {}) {
  const out = [];
  let prevDone = true;
  for (const pk of packs) {
    const ids = pk.levels.map(l => l.id);
    const nSolved = ids.filter(id => solved(p, id)).length;
    const marks = ids.reduce((n, id) => n + marksOf(p, id).filter(Boolean).length, 0);
    const done = nSolved === ids.length;
    const open = allOpen || prevDone || nSolved > 0;
    out.push({ id: pk.id, open, done, solved: nSolved, total: ids.length, marks, grade: nSolved ? grade(marks, ids.length * 3) : null, next: ids.find(id => !solved(p, id)) || null });
    prevDone = done;
  }
  return out;
}

// the level after this one, in order across the packs, if its pack is open;
// past the last level (or into a closed pack), the next unsolved one
export function levelAfter(p, packs, id) {
  const st = packStates(p, packs);
  const all = packs.flatMap((pk, i) => pk.levels.map(l => ({ pack: pk, id: l.id, open: st[i].open })));
  const k = all.findIndex(l => l.id === id);
  const after = k >= 0 ? all[k + 1] : null;
  if (after?.open) return { pack: after.pack, id: after.id };
  const nxt = nextLevel(p, packs);
  return nxt && nxt.id !== id ? nxt : null;
}

// the level to play next: the first unsolved level of the first open pack that has one
export function nextLevel(p, packs) {
  const st = packStates(p, packs);
  for (let i = 0; i < packs.length; i++) if (st[i].open && st[i].next) return { pack: packs[i], id: st[i].next };
  return null;
}

// ------------------------------------------------------------------
// the suite: daily streak
// ------------------------------------------------------------------

export const loadSuite = () => ({ daily: {}, streak: 0, lastDaily: null, ...(read(SUITE) || {}) });
export const saveSuite = s => write(SUITE, s);

// today as YYYY-MM-DD in local time (a date can be passed in for tests)
export function today(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const dayNo = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);

// record today's daily; the streak grows on consecutive days and restarts after a gap
export function recordDaily(s, date, entry) {
  if (s.daily[date]) return s;
  s.daily[date] = entry;
  const gap = s.lastDaily ? dayNo(date) - dayNo(s.lastDaily) : null;
  s.streak = gap === 1 ? s.streak + 1 : gap === 0 ? s.streak : 1;
  s.lastDaily = date;
  return s;
}

// the streak as of a date: broken if yesterday's daily was missed
export function currentStreak(s, date) {
  if (!s.lastDaily) return 0;
  const gap = dayNo(date) - dayNo(s.lastDaily);
  return gap <= 1 ? s.streak : 0;
}

// which game hosts the suite's daily puzzle on a date (rotates through the list)
export function dailyGame(date, games) {
  return games[((dayNo(date) % games.length) + games.length) % games.length];
}
