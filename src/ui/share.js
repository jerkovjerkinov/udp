// Share codes: a puzzle in the URL hash, so a teacher can set work and students
// can challenge each other without a server.
//   #l=B3                    a pack level
//   #gen=3&seed=k2f9         a generated puzzle: difficulty and seed
//   #daily=2026-10-22        that day's daily
//   #map                     the level map
// The game is the page itself, so the hash never names it.

export function parseHash(hash = '') {
  const s = hash.replace(/^#/, '');
  if (!s) return null;
  if (s === 'map') return { kind: 'map' };
  const q = Object.fromEntries(s.split('&').map(kv => kv.split('=').map(decodeURIComponent)));
  if (q.l) return { kind: 'level', id: q.l };
  if (q.daily) return { kind: 'daily', date: q.daily };
  if (q.gen !== undefined) return { kind: 'gen', difficulty: Math.max(0, Math.min(9, parseInt(q.gen, 10) || 0)), seed: q.seed || '0' };
  if (q.mode === 'challenge') return { kind: 'challenge' };
  if (q.mode === 'workshop') return { kind: 'workshop' };
  return null;
}

export function formatHash(h) {
  if (!h) return '';
  if (h.kind === 'map') return '#map';
  if (h.kind === 'level') return '#l=' + encodeURIComponent(h.id);
  if (h.kind === 'daily') return '#daily=' + h.date;
  if (h.kind === 'gen') return '#gen=' + h.difficulty + '&seed=' + encodeURIComponent(h.seed);
  if (h.kind === 'challenge') return '#mode=challenge';
  if (h.kind === 'workshop') return '#mode=workshop';
  return '';
}

// a short random seed for a new generated puzzle (not for logic: only to name it)
export const newSeed = () => Math.random().toString(36).slice(2, 7);

// the spoiler-free line a player can paste: "UDP Daily · 2026-10-22 · D · ◆◆◇ · 00:41"
export function shareLine({ date, prefix, marks, time }) {
  return ['UDP Daily', date, prefix, marks.map(m => m ? '◆' : '◇').join(''), time].join(' · ');
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* not allowed */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove();
    return ok;
  } catch (e) { return false; }
}
