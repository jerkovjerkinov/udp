// A challenge run: a fixed list of questions, a clock per question, scoring and
// a log for the summary. Pure state plus a tick callback; the page paints it.

export const clockStr = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export function createRun({ length, passes, scoring }) {
  return {
    length, passes, passesTotal: passes, scoring,
    index: 0, score: 0, bonus: 0, log: [], spent: 0,
    firstTry: true, target: 0, startedAt: 0, timer: null, done: false,
  };
}

export const elapsed = run => run.startedAt ? (Date.now() - run.startedAt) / 1000 : 0;
export const totalSeconds = run => run.spent + elapsed(run);

export function startQuestion(run, targetSecs, onTick) {
  stopClock(run);
  run.firstTry = true;
  run.target = targetSecs;
  run.startedAt = Date.now();
  run.timer = setInterval(() => onTick(run), 200);
  onTick(run);
}

export function stopClock(run) {
  if (run.timer) { clearInterval(run.timer); run.timer = null; }
}

// close the current question. outcome: 'first' | 'again' | 'passed'.
// returns { points, bonus } so the page can say what was earned.
export function finishQuestion(run, outcome, label) {
  const secs = elapsed(run);
  stopClock(run);
  run.spent += secs;
  run.startedAt = 0;
  const { first, again, bonus: bonusMax } = run.scoring;
  const points = outcome === 'first' ? first : outcome === 'again' ? again : 0;
  const bonus = points && run.target ? Math.round(bonusMax * Math.max(0, run.target - secs) / run.target) : 0;
  run.score += points + bonus;
  run.bonus += bonus;
  if (outcome === 'passed') run.passes--;
  run.log.push({ label, outcome, secs, points: points + bonus });
  return { points, bonus };
}

// advance; true when the run is over
export function nextQuestion(run) {
  run.index++;
  run.done = run.index >= run.length;
  return run.done;
}

// per-task tallies for the summary
export function breakdown(run) {
  const g = {};
  for (const r of run.log) {
    const x = g[r.label] || (g[r.label] = { n: 0, ok: 0, first: 0 });
    x.n++;
    if (r.outcome !== 'passed') x.ok++;
    if (r.outcome === 'first') x.first++;
  }
  return g;
}
