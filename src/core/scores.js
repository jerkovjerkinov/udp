// A scoreboard kept in this browser's localStorage, one list per board name.
// Kept behind three functions so a shared online board can replace it later
// without the pages changing.

const PREFIX = 'udp.scores.';
const MAX = 20;

export function readBoard(board) {
  try { return JSON.parse(localStorage.getItem(PREFIX + board)) || []; }
  catch (e) { return []; }
}

// saves and returns the entry's rank (1-based), or 0 if it did not make the list
export function saveScore(board, entry) {
  const rows = readBoard(board);
  const row = { ...entry, nick: String(entry.nick || '???').toUpperCase().slice(0, 3), at: Date.now() };
  rows.push(row);
  rows.sort((a, b) => b.score - a.score || a.secs - b.secs);
  const kept = rows.slice(0, MAX);
  try { localStorage.setItem(PREFIX + board, JSON.stringify(kept)); } catch (e) { /* storage blocked */ }
  return kept.indexOf(row) + 1;
}

export function bestScore(board) {
  const rows = readBoard(board);
  return rows.length ? rows[0].score : 0;
}
