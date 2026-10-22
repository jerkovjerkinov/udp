// The title block of a drawing sheet, restyled for MONOLIT: a thin-ruled grid
// that names the project, the drawing (the level), the sheet number, scale,
// attempt, time against par and the grade. Compact as a level header, full as
// the summary sheet at the end of a level or a run.

import { esc } from './frame.js';

/**
 * titleBlock(f, { compact })
 *   f: { project, drawing, sheet, scale, attempt, time, par, grade, note,
 *        rows: [[label, value, { mono, signal, wide }]] extra cells }
 * Returns an element.
 */
export function titleBlock(f, { compact = false } = {}) {
  const el = document.createElement('div');
  el.className = 'udp-tb' + (compact ? ' is-compact' : '');
  const cell = (label, value, o = {}) =>
    `<div class="${o.cls || ''}${o.wide ? ' tb-wide' : ''}"><small>${esc(label)}</small><div class="tb-v${o.mono ? ' tb-mono' : ''}${o.signal ? ' is-signal' : ''}">${o.html ? value : esc(value)}</div></div>`;
  const time = f.time !== undefined ? `${f.time}${f.par ? ' / ' + f.par : ''}` : '';
  if (compact) {
    el.innerHTML = [
      cell('Drawing', f.drawing),
      cell('Sheet', f.sheet, { cls: 'tb-sheet' }),
      f.scale ? cell('Scale', f.scale, { mono: true }) : '',
      time ? cell('Time / par', time, { mono: true }) : '',
      f.grade ? cell('Grade', f.grade, { cls: 'tb-grade' }) : '',
    ].join('');
    return el;
  }
  el.innerHTML = [
    cell('Project', f.project || 'Unnamed Drawing Project', { cls: 'tb-proj' }),
    cell('Sheet', f.sheet || '—', { cls: 'tb-sheet' }),
    cell('Drawing', f.drawing || ''),
    cell('Scale', f.scale || '1:50', { mono: true }),
    cell('Attempt', f.attempt ?? '1', { mono: true }),
    cell('Time / par', time || '—', { mono: true }),
    ...(f.rows || []).map(([l, v, o]) => cell(l, v, o || {})),
    cell('Grade', f.grade || '—', { cls: 'tb-grade', signal: f.gradeSignal }),
    f.note ? `<div class="tb-note">${esc(f.note)}</div>` : '',
  ].join('');
  return el;
}

// the section/callout marker: a circle split by a line, letter over sheet number
export function callout(top, bottom, { size = 40, signal = false, dim = false } = {}) {
  const c = size / 2, r = c - 1;
  return `<svg class="udp-callout${signal ? ' is-signal' : ''}${dim ? ' is-dim' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}"/><line x1="${c - r}" y1="${c}" x2="${c + r}" y2="${c}"/>
    <text class="co-top" x="${c}" y="${c - 4}">${esc(top)}</text><text class="co-bot" x="${c}" y="${c + 10}">${esc(bottom)}</text></svg>`;
}
