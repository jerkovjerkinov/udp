// The game page chrome, as on the MONOLIT reference sheet: a brand line and a
// large light title with the object's name in bold at the top left, the sheet
// number, timer, par and marks at the top right, text buttons along the bottom
// with a thin progress rule and the one primary action, and a side card for a
// 2D drawing. No boxes: rules, tracked capitals and the signal colour.
//
// The 3D view fills the page behind all this. The frame works out which part
// of the screen its own text leaves free and hands that rect to the stage, so
// models are framed where nothing covers them.
//
//   const frame = createFrame({ game: 'developments', name: 'Developments', stage });
//   frame.title('Cut it open.', 'Gable house');
//   frame.tools([{ id: 'undo', label: 'Undo', key: 'Z', run: undo }]);
//   frame.primary({ label: 'Unfold', run: check });

import { sfx } from '../fx/sfx.js';
import { guardTouch } from './touchguard.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a tool's label, with a shorter one for the phone bar if it has one
const labelHTML = (label, short) => short ? `<span class="udp-l">${esc(label)}</span><span class="udp-s">${esc(short)}</span>` : esc(label);

// ◆◆◇: n earned of total, the ones in fresh (indices) drawn in the signal colour;
// star: true / false for a level with a master goal (★ / ☆, fresh index 3), undefined for none
export function marksHTML(earned = [], fresh = [], star) {
  return [0, 1, 2].map(i => `<i class="${earned[i] ? '' : 'is-open'}${fresh.includes(i) ? ' is-new' : ''}">${earned[i] ? '◆' : '◇'}</i>`).join('')
    + (star === undefined ? '' : `<i class="is-star${star ? '' : ' is-open'}${fresh.includes(3) ? ' is-new' : ''}">${star ? '★' : '☆'}</i>`);
}

export const clock = s => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/**
 * createFrame({ game, name, stage, hubHref })
 *   game: id ('developments'), name: shown in the brand line, stage: from createStage
 */
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// the verb follows the device: tap on a touch screen, click with a mouse
export const touchWords = t => touch
  ? t.replace(/,? or press [A-Z] to [A-Z]/g, '').replace(/\bClick\b/g, 'Tap').replace(/\bclick(s?)\b/g, 'tap$1')
  : t.replace(/\bTap\b/g, 'Click').replace(/\btap(s?)\b/g, 'click$1');

export function createFrame({ game, name, stage, hubHref = '../../index.html' }) {
  document.body.classList.add('udp-app-page');
  guardTouch();
  const root = h('div', 'udp-frame');

  const head = h('header', 'udp-head');
  head.innerHTML = `<nav class="udp-brand"><a href="${hubHref}"><span class="udp-long">Unnamed Drawing Project</span><span class="udp-short">← All games</span></a><span class="udp-sep">·</span><a href="#map" data-act="map">${esc(name)}</a></nav>
    <h1 class="udp-title"></h1><p class="udp-sub"></p><p class="udp-msg" aria-live="polite"></p>`;
  const elTitle = head.querySelector('.udp-title'), elSub = head.querySelector('.udp-sub'), elMsg = head.querySelector('.udp-msg');

  const stat = h('div', 'udp-stat');
  stat.innerHTML = `<div class="udp-stat-top"><span class="udp-sheet-no"></span><span class="st-label"></span></div>
    <div class="udp-timer" aria-label="time">00:00</div>
    <div class="udp-stat-bot"><span class="st-par"></span><span class="udp-dot">·</span><span class="udp-marks"></span></div>
    <span class="udp-delta"></span>`;
  const elSheet = stat.querySelector('.udp-sheet-no'), elLabel = stat.querySelector('.st-label');
  const elTimer = stat.querySelector('.udp-timer'), elPar = stat.querySelector('.st-par');
  const elMarks = stat.querySelector('.udp-marks'), elDelta = stat.querySelector('.udp-delta');
  const elDot = stat.querySelector('.udp-dot');

  const card = h('section', 'udp-card');
  card.hidden = true;
  card.innerHTML = `<div class="udp-card-k"><span class="udp-k ck-title"></span><span class="udp-k ck-note"></span></div><div class="udp-card-body"></div>`;

  const bar = h('nav', 'udp-bar');
  bar.innerHTML = `<div class="udp-bar-tools"></div><div class="udp-rule" hidden><i></i><b></b></div>
    <div class="udp-run" hidden><span class="rn-text"></span><span class="udp-strikes"></span></div>
    <div class="udp-bar-end"><button class="udp-btn udp-more" data-act="more" aria-expanded="false" aria-label="More">•••</button><div class="udp-util">
      <button class="udp-btn" data-act="sound" aria-pressed="false"></button>
      <button class="udp-btn" data-act="keys" title="Keyboard (?)">?</button>
      <button class="udp-btn" data-act="map">Levels</button>
    </div><button class="udp-primary"></button></div>`;
  const elTools = bar.querySelector('.udp-bar-tools'), elRule = bar.querySelector('.udp-rule');
  const elRun = bar.querySelector('.udp-run'), elPrimary = bar.querySelector('.udp-primary');
  const elSound = bar.querySelector('[data-act=sound]');

  root.append(head, stat, card, bar);
  document.body.appendChild(root);

  const legend = h('aside', 'udp-legend');
  const veil = h('div', 'udp-legend-veil');
  document.body.append(veil, legend);

  // ------------------------------------------------------------------
  // the free rect for 3D content
  // ------------------------------------------------------------------

  let reserve = { left: 0, right: 0 };                   // extra px a game keeps free at the sides
  let stacked = false;                                   // true: the model sits under the title, never beside it
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight;
    // a phone on its side lays out in three columns (title, model, card), like a wide screen
    const side = H <= 500 && W > H && matchMedia('(pointer: coarse)').matches;
    const phone = W <= 820 && !side;
    const hb = head.getBoundingClientRect(), sb = stat.getBoundingClientRect(), bb = bar.getBoundingClientRect();
    const top = Math.max(hb.bottom, sb.bottom) + (phone ? 4 : 8);
    let bottom = bb.top - (phone ? 4 : 12);
    let left = phone ? 0 : 0, right = W;
    const cb = card.hidden ? null : card.getBoundingClientRect();
    if (cb && cb.height > 0) {                      // a card can be hidden by CSS on a phone
      if (phone) bottom = Math.min(bottom, cb.top - 4);
      else right = Math.min(right, cb.left - (side ? 12 : 24));
    }
    // the summary sheet, when it is up, keeps its corner too
    const sheet = document.querySelector('.udp-sheetwrap.is-on');
    const shb = sheet ? sheet.getBoundingClientRect() : null;
    if (shb && shb.height > 0) {
      if (phone) bottom = Math.min(bottom, shb.top - 4);
      else right = Math.min(right, shb.left - (side ? 12 : 24));
    }
    // on a wide screen (and a phone on its side) the title column sits beside
    // the model, not above it
    let y0 = top;
    if (side) {
      y0 = 6;
      if (!root.classList.contains('is-hidden')) left = Math.max(left, hb.right + 8);
    } else if (!phone && W > 1100 && !stacked) {
      y0 = Math.max(sb.bottom + 8, 72);
      left = Math.max(left, hb.right + 16);
      if (left > W * .42) { left = 0; y0 = top; }
    }
    left += reserve.left; right -= reserve.right;
    return { x: left, y: y0, w: Math.max(80, right - left), h: Math.max(80, bottom - y0) };
  }
  // cards and overlays on a phone stand just above the bar, whatever its height
  function layout(animate = false) {
    document.documentElement.style.setProperty('--bar-h', Math.round(window.innerHeight - bar.getBoundingClientRect().top) + 'px');
    stage?.setRect(freeRect(), { animate });
  }
  document.addEventListener('pointerdown', ev => { if (ev.target instanceof Node && !bar.contains(ev.target)) bar.classList.remove('is-more'); });

  // On a phone the instructions fold to two lines once the player starts on the
  // model or the sheet, so the model gets the room; a tap on them opens them again
  const narrow = () => window.innerWidth <= 820 && !(window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
  elSub.addEventListener('click', ev => {
    if (!narrow() || ev.target.closest('a, button')) return;
    elSub.classList.toggle('is-short');
    layout();
  });
  const fold = ev => {
    if (!narrow() || !(ev.target instanceof Node) || elSub.classList.contains('is-short') || head.contains(ev.target) || bar.contains(ev.target)) return;
    if (!elSub.querySelector('.udp-sub-text')?.textContent.trim()) return;
    elSub.classList.add('is-short');
    layout();
  };
  window.addEventListener('pointerdown', fold, true);

  // On a phone the card's label row is a handle: drag it to give the sheet or the
  // model more of the screen. The height holds for the rest of the visit.
  let cardH = null;
  const cardBody = () => card.querySelector('.udp-card-body');
  const handle = card.querySelector('.udp-card-k');
  handle.addEventListener('pointerdown', ev => {
    if (!narrow()) return;
    ev.preventDefault();
    const body = cardBody(), y0 = ev.clientY, h0 = body.getBoundingClientRect().height;
    handle.setPointerCapture(ev.pointerId);
    card.classList.add('is-sizing');
    const move = e => {
      const lo = window.innerHeight * .16, hi = window.innerHeight * .6;
      cardH = Math.round(Math.max(lo, Math.min(hi, h0 - (e.clientY - y0))));
      body.style.height = cardH + 'px';
      layout();
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); card.classList.remove('is-sizing'); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  const ro = new ResizeObserver(() => layout());
  for (const el of [head, stat, card, bar]) ro.observe(el);
  window.addEventListener('resize', layout);

  // ------------------------------------------------------------------
  // keys
  // ------------------------------------------------------------------

  let keys = [];                                          // [{ key, label, run }]
  const fixedKeys = [
    { key: '?', label: 'Show or hide this legend' },
    { key: 'M', label: 'Sound on or off' },
    { key: 'Esc', label: 'Level map' },
    { key: 'PgDn / PgUp', label: 'Next or previous level (while every level is open)' },
  ];
  function renderLegend() {
    const rows = [...keys, ...fixedKeys].filter(k => k.key && k.label);
    legend.innerHTML = `<span class="udp-k">Keyboard</span><dl>${rows.map(k => `<dt>${esc(k.key)}</dt><dd>${esc(k.label)}</dd>`).join('')}</dl>`;
  }
  function toggleLegend(on) {
    const v = on ?? !legend.classList.contains('is-on');
    renderLegend();
    legend.classList.toggle('is-on', v); veil.classList.toggle('is-on', v);
  }
  veil.addEventListener('click', () => toggleLegend(false));

  const handlers = { map: () => {}, primary: null };
  document.addEventListener('keydown', ev => {
    if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
    if (ev.metaKey || ev.altKey) return;
    if (ev.key === '?') { toggleLegend(); ev.preventDefault(); return; }
    if (ev.key === 'Escape') {
      if (legend.classList.contains('is-on')) { toggleLegend(false); return; }
      handlers.map(); return;
    }
    if (ev.ctrlKey && ev.key.toLowerCase() !== 'z') return;
    if (ev.key.toLowerCase() === 'm' && !ev.ctrlKey) { setSound(!sfx.muted); return; }
    if (ev.key === 'Enter' && handlers.primary && !elPrimary.disabled) { ev.preventDefault(); handlers.primary(); return; }
    const k = ev.ctrlKey ? 'Ctrl+' + ev.key.toUpperCase() : ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
    const hit = keys.find(x => x.run && (x.key === k || (x.keys && x.keys.includes(k))));
    if (hit) { ev.preventDefault(); hit.run(ev); }
  });

  function setSound(on) {
    sfx.setMuted(!on);
    renderSound();
    if (on) sfx.snap();
  }
  function renderSound() {
    elSound.textContent = sfx.muted ? 'Sound off' : 'Sound on';
    elSound.setAttribute('aria-pressed', String(!sfx.muted));
    elSound.classList.toggle('is-on', !sfx.muted);
  }
  renderSound();

  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    // on a phone, sound, keys and levels sit behind one button
    if (act === 'more') { const on = !bar.classList.contains('is-more'); bar.classList.toggle('is-more', on); b.setAttribute('aria-expanded', on); return; }
    bar.classList.remove('is-more');
    if (act === 'sound') setSound(sfx.muted);
    else if (act === 'keys') toggleLegend();
    else if (act === 'map') { ev.preventDefault(); handlers.map(); }
  });
  elPrimary.addEventListener('click', () => handlers.primary?.());

  // ------------------------------------------------------------------
  // public
  // ------------------------------------------------------------------

  let msgTimer = 0;
  const frame = {
    root, head, stat, card, bar, legend,
    // title: a light lead line and a bold object name
    title(lead, name) {
      const html = `${esc(lead)}${name ? `<b>${esc(name)}</b>` : ''}`;
      // a new sheet opens with its instructions in full
      if (html !== elTitle.innerHTML) elSub.classList.remove('is-short');
      elTitle.innerHTML = html;
      layout();
    },
    // sub text: plain text, or HTML when html is true (use <em> for the signal colour)
    // on a touch screen the instructions say tap, not click
    // the count (a .udp-count span) stays on its own line when the sentence folds
    sub(text, html = false) {
      elSub[html ? 'innerHTML' : 'textContent'] = touchWords(text || '');
      const words = h('span', 'udp-sub-text');
      for (const n of [...elSub.childNodes]) if (!(n.classList?.contains('udp-count'))) words.appendChild(n);
      elSub.prepend(words);
      layout();
    },
    // a short italic message under the sub text; kind 'k' prefix label; clears after ms
    say(text, { label = '', ms = 0 } = {}) {
      clearTimeout(msgTimer);
      elMsg.innerHTML = text ? (label ? `<span class="udp-k">${esc(label)}</span>` : '') + esc(touchWords(text)) : '';
      elMsg.classList.toggle('is-on', !!text);
      if (text && ms) msgTimer = setTimeout(() => frame.say(''), ms);
    },
    // top right: { sheet: 'D.04', label: 'PACK D · LEVEL 4 / 8', par: 'PAR 01:10', marks: [true,false,false], fresh: [] }
    status({ sheet, label, par, marks, fresh, star } = {}) {
      if (sheet !== undefined) elSheet.textContent = sheet;
      if (label !== undefined) elLabel.textContent = label;
      if (par !== undefined) { elPar.textContent = par || ''; elDot.hidden = !par || !marks; }
      if (marks !== undefined) { elMarks.innerHTML = marks ? marksHTML(marks, fresh || [], star) : ''; elDot.hidden = !marks || !elPar.textContent; }
    },
    timer(secs, { over = false, hidden = false } = {}) {
      elTimer.hidden = hidden;
      if (!hidden) elTimer.textContent = typeof secs === 'string' ? secs : clock(secs);
      elTimer.classList.toggle('is-over', over);
    },
    // under the timer: a split against the personal best ('−00:04' ahead)
    delta(text, ahead = false) {
      elDelta.textContent = text || '';
      elDelta.classList.toggle('is-on', !!text);
      elDelta.classList.toggle('is-ahead', ahead);
    },
    // bottom tools: [{ id, label, key, keys, run, count, active, off, title }]
    tools(list) {
      elTools.replaceChildren();
      bar.querySelectorAll('.udp-util .udp-spare').forEach(b => b.remove());
      keys = [];
      for (const t of list) {
        if (t.key || t.keys) keys.push({ key: t.key, keys: t.keys, label: t.legend || t.label, run: t.run });
        if (t.hidden) continue;
        const b = h('button', 'udp-btn');
        b.type = 'button';
        b.dataset.tool = t.id;
        b.dataset.label = t.label;
        if (t.short) b.dataset.short = t.short;
        b.innerHTML = labelHTML(t.label, t.short) + (t.count !== undefined ? `<span class="udp-count">${esc(t.count)}</span>` : '');
        if (t.title || t.key) b.title = (t.title || t.label) + (t.key ? ` (${t.key})` : '');
        b.classList.toggle('is-active', !!t.active);
        b.classList.toggle('is-off', !!t.off);
        b.addEventListener('click', ev => { if (!b.classList.contains('is-off')) t.run?.(ev); });
        elTools.appendChild(b);
        // a spare tool moves into the "more" menu on a phone, where the bar is short
        if (t.spare) {
          b.classList.add('is-spare');
          const m = h('button', 'udp-btn udp-spare');
          m.type = 'button';
          m.textContent = t.label;
          m.addEventListener('click', ev => { if (!b.classList.contains('is-off')) t.run?.(ev); });
          bar.querySelector('.udp-util').prepend(m);
        }
      }
      layout();
    },
    // patch one tool button: { label, count, active, off }
    tool(id, patch) {
      const b = elTools.querySelector(`[data-tool="${id}"]`);
      if (!b) return;
      if (patch.label !== undefined || patch.count !== undefined) {
        const label = patch.label ?? b.dataset.label;
        b.innerHTML = labelHTML(label, patch.label !== undefined ? patch.short : b.dataset.short) + (patch.count !== undefined && patch.count !== null ? `<span class="udp-count">${esc(patch.count)}</span>` : '');
      }
      if (patch.label !== undefined) { b.dataset.label = patch.label; if (patch.short) b.dataset.short = patch.short; else delete b.dataset.short; }
      if (patch.active !== undefined) b.classList.toggle('is-active', patch.active);
      if (patch.off !== undefined) b.classList.toggle('is-off', patch.off);
    },
    // extra legend rows that are not buttons: [{ key, label }]
    keys(list) { keys.push(...list); },
    primary({ label, run, disabled = false, ready = false } = {}) {
      if (label !== undefined) elPrimary.textContent = label;
      if (run !== undefined) handlers.primary = run;
      elPrimary.disabled = disabled;
      elPrimary.classList.toggle('is-ready', ready);
    },
    get primaryEl() { return elPrimary; },
    // the thin rule: progress 0..1 in the signal colour, and a marker (personal best) 0..1 or null
    rule(progress, marker = null) {
      elRule.hidden = progress === null || progress === undefined;
      elRule.querySelector('i').style.width = (Math.max(0, Math.min(1, progress || 0)) * 100) + '%';
      const b = elRule.querySelector('b');
      b.classList.toggle('is-on', marker !== null && marker !== undefined);
      if (marker !== null && marker !== undefined) b.style.left = (Math.max(0, Math.min(1, marker)) * 100) + '%';
    },
    // 'RUN 6 / 10' and strikes: { text, strikes: [total, used] } or null to hide
    run(r) {
      elRun.hidden = !r;
      if (!r) return;
      elRun.querySelector('.rn-text').textContent = r.text || '';
      const s = elRun.querySelector('.udp-strikes');
      s.innerHTML = r.strikes ? Array.from({ length: r.strikes[0] }, (_, i) => `<i class="${i < r.strikes[1] ? 'is-hit' : ''}">×</i>`).join('') : '';
      s.title = r.strikes ? `${r.strikes[1]} of ${r.strikes[0]} strikes` : '';
    },
    // the side card for a 2D drawing: returns its body element
    card(on, title = '', note = '') {
      card.hidden = !on;
      if (!on) cardBody().style.height = '';
      if (on && cardH && narrow()) cardBody().style.height = cardH + 'px';
      card.querySelector('.ck-title').textContent = title;
      card.querySelector('.ck-note').textContent = note;
      layout();
      return card.querySelector('.udp-card-body');
    },
    cardNote(note) { card.querySelector('.ck-note').textContent = note; },
    // keep extra space free beside the model (px)
    reserve(r) { reserve = { left: 0, right: 0, ...r }; layout(); },
    // keep the model under the title column instead of beside it (a wide side card)
    stack(v = true) { stacked = v; layout(); },
    freeRect, layout,
    // On a phone, give the card only the height its board needs at full width,
    // between lo and hi of the screen, so a wide, low sheet leaves the model room.
    // The player's own height (the handle) wins.
    fitSheet(board, { lo = .2, hi = .36 } = {}) {
      const body = cardBody();
      if (!narrow() || card.hidden) return;
      if (cardH) { body.style.height = cardH + 'px'; layout(); return; }
      const r = board.el.getBoundingClientRect(), br = body.getBoundingClientRect();
      const chrome = Math.max(0, br.height - r.height);
      const want = board.heightFor(r.width || br.width) + chrome;
      body.style.height = Math.round(Math.max(window.innerHeight * lo, Math.min(window.innerHeight * hi, want))) + 'px';
      layout();
    },
    // the card height the player chose with the handle (phone), or null
    get cardHeight() { return narrow() ? cardH : null; },
    hide(v = true) { root.classList.toggle('is-hidden', v); },
    onMap(fn) { handlers.map = fn; },
    legend: toggleLegend,
  };
  requestAnimationFrame(layout);
  return frame;
}
