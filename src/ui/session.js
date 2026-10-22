// The flow round a game: which puzzle is on the table, the clock, the marks,
// hints, strikes, the summary sheet, the level map, progress and share codes.
// A game only knows how to build a puzzle, check it and give a hint; the
// session decides what happens around that, the same way in all six games.
//
// Modes
//   pack       the hand-made levels, in packs of about eight
//   challenge  ten generated items getting harder, three strikes, personal-best splits
//   daily      one date-seeded puzzle a day, with a spoiler-free share line and a streak
//   gen        a generated puzzle named by difficulty and seed (a share code)
//   workshop   free play: the game's own sandbox, no clock and no marks
//
// The game definition:
//   {
//     id, prefix, name, lead, sub,          // 'developments', 'D', 'Developments', map title lines
//     packs: [{ id, name, brief, levels: [{ id, name, par, ... }] }],
//     load(item),                           // build the puzzle; item = { kind, id, sheet, name, par, difficulty, ...data }
//     check() → { ok, culprits, note, strike = true },
//     hint(n) → { text, culprits } | null,  // n = 1 nudge, 2 partial, 3 show
//     generate(rng, difficulty, i) → item data   (challenge, daily, gen)
//     onSolved(item) → promise                     (optional: a fold-up or orbit before the summary)
//     workshop()                                   (optional: enter free play)
//     modes: ['challenge', 'daily', 'workshop']    (optional: which modes the map offers)
//     dailyDifficulty, challengeLength             (optional)
//   }

import { sfx } from '../fx/sfx.js';
import { clock, esc } from './frame.js';
import { titleBlock } from './titleblock.js';
import { createLevelMap, sheetNo } from './levelmap.js';
import { parseHash, formatHash, newSeed, shareLine, copyText } from './share.js';
import { loadProgress, saveProgress, recordLevel, marksOf, nextLevel, packStates,
  loadSuite, saveSuite, today, recordDaily, currentStreak } from './progress.js';
import { seededRng } from '../core/rand.js';

const STRIKES = 3;

export function createSession({ def, frame, stage, redlines }) {
  let progress = loadProgress(def.id);
  const runLength = def.challengeLength || 10;

  // ------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------

  let item = null;          // what is on the table
  let mode = 'pack';
  let playing = false;      // clock running and input live
  let secs = 0, t0 = 0;     // time spent on this item; t0 = when the clock last started
  let hints = 0, peeked = false, misses = 0;
  let run = null;           // challenge: { i, strikes, splits, total, rng }
  let ticker = 0;

  const now = () => performance.now() / 1000;
  const spent = () => secs + (playing && t0 ? now() - t0 : 0);

  function startClock() { if (!playing) { playing = true; t0 = now(); } }
  function stopClock() { if (playing) { secs += now() - t0; playing = false; t0 = 0; } }

  function tick() {
    if (!item) return;
    if (mode === 'workshop') { frame.timer(0, { hidden: true }); return; }
    if (mode === 'challenge' && run) {
      const total = run.total + spent();
      frame.timer(total);
      const best = progress.challenge.bestSplits;
      if (best && best[run.i] !== undefined) {
        const d = total - best[run.i];
        frame.delta((d < 0 ? '−' : '+') + clock(Math.abs(d)), d < 0);
      } else frame.delta('');
      return;
    }
    const s = spent();
    frame.timer(s, { over: !!item.par && s > item.par });
  }

  // ------------------------------------------------------------------
  // the summary sheet
  // ------------------------------------------------------------------

  const wrap = document.createElement('section');
  wrap.className = 'udp-sheetwrap';
  wrap.setAttribute('aria-live', 'polite');
  document.body.appendChild(wrap);
  let summaryPrimary = null;

  function summary({ headline, note, block, share, actions }) {
    wrap.replaceChildren();
    const hl = document.createElement('h2');
    hl.className = 'udp-headline';
    hl.innerHTML = headline;
    wrap.appendChild(hl);
    if (note) {
      const n = document.createElement('p');
      n.className = 'udp-note';
      n.textContent = note;
      wrap.appendChild(n);
    }
    wrap.appendChild(titleBlock(block));
    if (share) {
      const s = document.createElement('p');
      s.className = 'udp-share-line';
      s.textContent = share;
      s.style.marginTop = '12px';
      wrap.appendChild(s);
    }
    const bar = document.createElement('div');
    bar.className = 'udp-actions';
    summaryPrimary = null;
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'udp-primary is-ready' : 'udp-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => a.run(b));
      bar.appendChild(b);
      if (a.primary) summaryPrimary = a.run;
    }
    wrap.appendChild(bar);
    requestAnimationFrame(() => wrap.classList.add('is-on'));
    frame.hide(true);
  }
  function closeSummary() {
    wrap.classList.remove('is-on');
    summaryPrimary = null;
    frame.hide(false);
  }
  // while the sheet is up, Enter takes its primary action, not the game's
  document.addEventListener('keydown', ev => {
    if (!wrap.classList.contains('is-on') || map.isOn) return;
    if (ev.key === 'Enter' && summaryPrimary) { ev.preventDefault(); ev.stopImmediatePropagation(); summaryPrimary(); }
  }, true);

  // ------------------------------------------------------------------
  // the level map
  // ------------------------------------------------------------------

  const modeInfo = {
    challenge: { id: 'challenge', name: 'Challenge', mark: 'C', tag: String(runLength),
      info: p => p.challenge.best ? `Best <em>${p.challenge.best}/${runLength}</em>${p.challenge.bestTime ? ' · ' + clock(p.challenge.bestTime) : ''}` : `${runLength} items · ${STRIKES} strikes` },
    daily: { id: 'daily', name: 'Daily sheet', mark: 'Q', tag: today().slice(8),
      info: () => {
        const s = loadSuite(), d = today(), done = s.daily[d + ':' + def.id];
        return (done ? '<em>Drawn today</em>' : 'Not drawn yet') + ` · streak <em>${currentStreak(s, d)}</em>`;
      } },
    workshop: { id: 'workshop', name: 'Workshop', mark: 'W', tag: '∞', info: () => 'Free play · no clock' },
  };
  const map = createLevelMap({
    name: def.name, lead: def.lead, sub: def.sub, packs: def.packs,
    modes: (def.modes || ['challenge', 'daily', 'workshop']).filter(m => m !== 'workshop' || def.workshop).map(m => modeInfo[m]),
    onLevel: id => { map.hide(); playLevel(id); },
    onContinue: id => { map.hide(); playLevel(id); },
    onClose: () => { map.hide(); if (item) resume(); },
    onMode: m => { map.hide(); startMode(m); },
  });

  function showMap() {
    stopClock();
    redlines?.clear();
    closeSummary();
    map.show(progress);
    setHash({ kind: 'map' });
  }
  function resume() {
    setHash(hashOf());
    if (item && mode !== 'workshop' && !item.solved) startClock();
  }
  frame.onMap(() => {
    if (map.isOn) { if (item) { map.hide(); resume(); } }
    else showMap();
  });

  // ------------------------------------------------------------------
  // loading puzzles
  // ------------------------------------------------------------------

  function findLevel(id) {
    for (const pk of def.packs) {
      const i = pk.levels.findIndex(l => l.id === id);
      if (i >= 0) return { pack: pk, i, level: pk.levels[i] };
    }
    return null;
  }

  function begin(next) {
    redlines?.clear();
    closeSummary();
    map.hide();
    stopClock();
    item = next;
    secs = 0; hints = 0; peeked = false; misses = 0;
    frame.say('');
    frame.delta('');
    def.load(item);
    setHash(hashOf());
    status();
    tick();
    if (mode !== 'workshop') startClock();
  }

  function status() {
    if (!item) return;
    if (mode === 'pack') {
      const f = findLevel(item.id);
      const st = packStates(progress, def.packs).find(s => s.id === f.pack.id);
      frame.status({ sheet: item.sheet, label: `Pack ${f.pack.id} · ${f.i + 1} / ${f.pack.levels.length}`,
        par: item.par ? 'Par ' + clock(item.par) : '', marks: marksOf(progress, item.id) });
      frame.rule(st.solved / st.total);
      frame.run(null);
    } else if (mode === 'challenge') {
      frame.status({ sheet: item.sheet, label: `Challenge · ${run.i + 1} / ${runLength}`, par: '', marks: null });
      const bestAt = progress.challenge.best ? progress.challenge.best / runLength : null;
      frame.rule(run.i / runLength, bestAt);
      frame.run({ text: `Run ${run.i + 1} / ${runLength}`, strikes: [STRIKES, run.strikes] });
    } else if (mode === 'daily') {
      frame.status({ sheet: item.sheet, label: 'Daily sheet · ' + item.date, par: item.par ? 'Par ' + clock(item.par) : '', marks: [false, false, false] });
      frame.rule(null); frame.run(null);
    } else if (mode === 'gen') {
      frame.status({ sheet: item.sheet, label: `Generated · level ${item.difficulty} · ${item.seed}`, par: item.par ? 'Par ' + clock(item.par) : '', marks: [false, false, false] });
      frame.rule(null); frame.run(null);
    } else {
      frame.status({ sheet: item.sheet, label: 'Workshop · free play', par: '', marks: null });
      frame.rule(null); frame.run(null);
    }
  }

  function playLevel(id) {
    const f = findLevel(id);
    if (!f) return showMap();
    mode = 'pack';
    run = null;
    begin({ ...f.level, kind: 'level', sheet: sheetNo(f.pack.id, f.i), pack: f.pack.id, index: f.i });
  }

  function generated(kind, rng, difficulty, extra) {
    return { ...def.generate(rng, difficulty, extra.i ?? 0), kind, difficulty, ...extra };
  }

  function playGen(difficulty, seed) {
    mode = 'gen'; run = null;
    begin(generated('gen', seededRng(def.id + ':' + difficulty + ':' + seed), difficulty,
      { seed, sheet: 'G.' + String(difficulty).padStart(2, '0') }));
  }

  function playDaily(date = today()) {
    mode = 'daily'; run = null;
    begin(generated('daily', seededRng('daily:' + date + ':' + def.id), def.dailyDifficulty ?? 5,
      { date, sheet: def.prefix + '.Q' }));
  }

  function startChallenge() {
    mode = 'challenge';
    run = { i: 0, strikes: 0, splits: [], total: 0, rng: seededRng('run:' + def.id + ':' + newSeed() + Date.now()) };
    nextInRun();
  }
  // difficulty climbs from 1 to about 8 over the run
  function nextInRun() {
    const d = Math.min(9, 1 + Math.floor(run.i * 8 / runLength));
    begin(generated('challenge', run.rng, d, { i: run.i, sheet: 'C.' + String(run.i + 1).padStart(2, '0') }));
  }

  function startWorkshop() {
    mode = 'workshop'; run = null;
    stopClock();
    redlines?.clear(); closeSummary(); map.hide();
    item = { kind: 'workshop', sheet: def.prefix + '.W', name: 'Workshop' };
    def.workshop();
    setHash({ kind: 'workshop' });
    status(); tick();
  }

  function startMode(m) {
    if (m === 'challenge') startChallenge();
    else if (m === 'daily') playDaily();
    else if (m === 'workshop') startWorkshop();
  }

  // ------------------------------------------------------------------
  // checking
  // ------------------------------------------------------------------

  let checking = false;
  async function check() {
    if (!item || item.solved || checking || mode === 'workshop') return null;
    const r = def.check() || { ok: false };
    redlines?.clear();
    if (!r.ok) { miss(r); return r; }
    checking = true;
    stopClock();
    item.solved = true;
    frame.say('');
    sfx.done();
    try { await def.onSolved?.(item); } catch (e) { console.error(e); }
    checking = false;
    if (mode === 'challenge') {
      run.total += secs;
      run.splits.push(run.total);
      run.i++;
      if (run.i >= runLength) endRun(true);
      else { status(); setTimeout(nextInRun, 250); }
    } else solvedSheet();
    return r;
  }

  // a wrong answer: redlines on the culprits, a note, and a strike in a challenge run
  function miss(r = {}) {
    if (!item || item.solved || mode === 'workshop') return;
    sfx.error();
    misses++;
    if (r.culprits?.length) redlines?.show(r.culprits);
    if (r.note) frame.say(r.note, { label: r.label || 'Check' });
    if (mode === 'challenge' && r.strike !== false) {
      run.strikes++;
      status();
      if (run.strikes >= STRIKES) { stopClock(); item.solved = true; setTimeout(() => endRun(false), 1400); }
    }
  }

  function marksNow() {
    return [true, !item.par || secs <= item.par, hints === 0 && !peeked && misses === 0];
  }

  function solvedSheet() {
    const marks = marksNow();
    const time = clock(secs), par = item.par ? clock(item.par) : '';
    const rows = [['Hints / misses', `${hints} / ${misses}`, { mono: true }], ['Marks', marks.map(m => m ? '◆' : '◇').join(' '), { mono: true }]];

    if (mode === 'pack') {
      const { record, fresh } = recordLevel(progress, item.id, { marks, secs });
      saveProgress(def.id, progress);
      frame.status({ marks: record.marks, fresh });
      const f = findLevel(item.id);
      const st = packStates(progress, def.packs).find(s => s.id === f.pack.id);
      const nxt = nextLevel(progress, def.packs);
      const lastInPack = f.i === f.pack.levels.length - 1;
      summary({
        headline: `<b>Drawn.</b> ${esc(item.name)}`,
        note: item.note || (fresh.length ? freshNote(fresh) : null),
        block: { drawing: item.name, sheet: item.sheet, scale: item.scale || '1:50', attempt: String(record.attempts),
          time, par, grade: st.done ? st.grade : (marks.filter(Boolean).length === 3 ? 'A' : marks.filter(Boolean).length === 2 ? 'B' : 'C'),
          gradeSignal: fresh.length > 0, rows: [...rows, ['Pack', `${f.pack.id} · ${st.solved}/${st.total}${st.done ? ' · grade ' + st.grade : ''}`, { mono: true }],
            ['Best', record.best !== null ? clock(record.best) : '—', { mono: true }]] },
        actions: [
          { label: 'Levels', run: showMap },
          { label: 'Again', run: () => playLevel(item.id) },
          nxt ? { label: lastInPack && nxt.pack.id !== f.pack.id ? `Pack ${nxt.pack.id}` : 'Next sheet', primary: true, run: () => playLevel(nxt.id) }
            : { label: 'All drawn', primary: true, run: showMap },
        ],
      });
      return;
    }

    if (mode === 'daily') {
      const s = loadSuite();
      const key = item.date + ':' + def.id;
      const first = !s.daily[key];
      // the suite streak counts days, so record the day once and the game under its own key
      if (first) { s.daily[key] = { marks, secs }; recordDaily(s, item.date, { game: def.id }); saveSuite(s); }
      const line = shareLine({ date: item.date, prefix: def.prefix, marks, time });
      summary({
        headline: `<b>Daily sheet drawn.</b> ${esc(item.date)}`,
        note: first ? `Streak: ${currentStreak(s, item.date)} day${currentStreak(s, item.date) === 1 ? '' : 's'}.` : 'Already drawn today; this attempt is practice.',
        block: { drawing: item.name, sheet: item.sheet, scale: '1:50', attempt: first ? '1' : 'Practice', time, par, grade: marks.filter(Boolean).length === 3 ? 'A' : 'B', rows },
        share: line,
        actions: [
          { label: 'Levels', run: showMap },
          { label: 'Copy result', run: async b => { b.textContent = (await copyText(line)) ? 'Copied' : 'Copy failed'; } },
          { label: 'Challenge', primary: true, run: startChallenge },
        ],
      });
      return;
    }

    // a generated puzzle from a share code
    summary({
      headline: `<b>Drawn.</b> ${esc(item.name)}`,
      block: { drawing: item.name, sheet: item.sheet, scale: '1:50', attempt: '1', time, par, grade: marks.filter(Boolean).length === 3 ? 'A' : 'B', rows },
      actions: [
        { label: 'Levels', run: showMap },
        { label: 'Copy link', run: async b => { b.textContent = (await copyText(location.href)) ? 'Copied' : 'Copy failed'; } },
        { label: 'Another', primary: true, run: () => playGen(item.difficulty, newSeed()) },
      ],
    });
  }

  function endRun(complete) {
    const c = progress.challenge;
    const solvedN = run.i;
    const better = solvedN > c.best || (solvedN === c.best && complete && (!c.bestTime || run.total < c.bestTime));
    c.runs++;
    if (better) { c.best = solvedN; c.bestTime = complete ? run.total : null; c.bestSplits = run.splits.slice(); }
    saveProgress(def.id, progress);
    frame.delta('');
    summary({
      headline: complete ? `<b>Run complete.</b> ${solvedN} of ${runLength}` : `<b>Three strikes.</b> ${solvedN} of ${runLength}`,
      note: better ? 'A new personal best.' : c.best ? `Personal best: ${c.best} of ${runLength}${c.bestTime ? ' in ' + clock(c.bestTime) : ''}.` : null,
      block: { drawing: 'Challenge run', sheet: 'C.' + String(solvedN).padStart(2, '0'), scale: 'Run ' + c.runs, attempt: String(c.runs),
        time: clock(run.total), grade: solvedN >= runLength ? (run.strikes === 0 ? 'A' : 'B') : solvedN >= runLength / 2 ? 'C' : '—', gradeSignal: better,
        rows: [['Solved', `${solvedN} / ${runLength}`, { mono: true }], ['Strikes', `${run.strikes} / ${STRIKES}`, { mono: true }]] },
      actions: [
        { label: 'Levels', run: showMap },
        { label: 'Run again', primary: true, run: startChallenge },
      ],
    });
  }

  // ------------------------------------------------------------------
  // hints and peeks
  // ------------------------------------------------------------------

  function hint() {
    if (!item || item.solved || mode === 'workshop' || !def.hint) return null;
    const n = Math.min(3, hints + 1);
    const h = def.hint(n);
    if (!h) { frame.say('No more hints for this sheet.', { ms: 2500 }); return null; }
    hints = n;
    redlines?.clear();
    if (h.culprits?.length) redlines?.show(h.culprits);
    if (h.text) frame.say(h.text, { label: `Hint ${n} / 3` });
    sfx.tick();
    return h;
  }

  // ------------------------------------------------------------------
  // the address bar
  // ------------------------------------------------------------------

  function hashOf() {
    if (!item) return { kind: 'map' };
    if (mode === 'pack') return { kind: 'level', id: item.id };
    if (mode === 'daily') return { kind: 'daily', date: item.date };
    if (mode === 'gen') return { kind: 'gen', difficulty: item.difficulty, seed: item.seed };
    if (mode === 'challenge') return { kind: 'challenge' };
    return { kind: 'workshop' };
  }
  let ownHash = '';
  function setHash(h) {
    ownHash = formatHash(h);
    if (location.hash !== ownHash) history.replaceState(null, '', ownHash || location.pathname);
  }
  window.addEventListener('hashchange', () => { if (location.hash !== ownHash) route(); });

  function route() {
    const h = parseHash(location.hash);
    if (!h) {
      const nxt = nextLevel(progress, def.packs);
      // a first visit goes straight to the first sheet; after that, the map
      if (!Object.keys(progress.levels).length && nxt) return playLevel(nxt.id);
      return showMap();
    }
    if (h.kind === 'map') return showMap();
    if (h.kind === 'level') return findLevel(h.id) ? playLevel(h.id) : showMap();
    if (h.kind === 'daily') return playDaily(h.date);
    if (h.kind === 'gen') return def.generate ? playGen(h.difficulty, h.seed) : showMap();
    if (h.kind === 'challenge') return def.generate ? startChallenge() : showMap();
    if (h.kind === 'workshop') return def.workshop ? startWorkshop() : showMap();
  }

  // ------------------------------------------------------------------

  return {
    start() {
      ticker = setInterval(tick, 250);
      route();
    },
    check, hint, miss,
    // a peek (x-ray, show-the-answer, look underneath) costs the third mark like a hint
    peek() { peeked = true; },
    reset() { if (item && mode !== 'workshop') begin({ ...item, solved: false }); },
    showMap, playLevel, startChallenge, playDaily, playGen, startWorkshop,
    // pause and resume the clock (for a game's own modal moments)
    pause: stopClock,
    resume: () => { if (item && !item.solved && mode !== 'workshop') startClock(); },
    get item() { return item; },
    get mode() { return mode; },
    get hints() { return hints; },
    get seconds() { return spent(); },
    get progress() { return progress; },
    dispose() { clearInterval(ticker); wrap.remove(); map.el.remove(); },
  };
}


function freshNote(fresh) {
  const names = ['drawn', 'under par', 'clean (no hint, no miss)'];
  return 'New mark' + (fresh.length > 1 ? 's' : '') + ': ' + fresh.map(i => names[i]).join(', ') + '.';
}
