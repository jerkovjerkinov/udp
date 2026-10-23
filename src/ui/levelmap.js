// The level map: a game's packs drawn as a set of drawing sheets. Each pack is
// a sheet set with a callout marker (letter over level count), its grade and a
// one-line brief; its levels are rows with the sheet number, name, best time
// and marks. Beside the packs, the modes: Challenge, Workshop and Daily.
//
//   const map = createLevelMap({ game, name, lead, sub, packs, modes, onLevel, onMode });
//   map.show(progress);   // re-renders from a progress record, then fades in
//   map.hide();

import { esc, marksHTML, clock } from './frame.js';
import { callout } from './titleblock.js';
import { packStates, marksOf } from './progress.js';

/**
 * createLevelMap(o)
 *   o.name: game name, o.lead: light title line, o.sub: one sentence under it
 *   o.packs: [{ id: 'A', name, brief, levels: [{ id: 'A1', name, par }] }]
 *   o.modes: [{ id: 'challenge'|'workshop'|'daily', name, info(progress) → html }]
 *   o.onLevel(id), o.onMode(id), o.hubHref
 */
export function createLevelMap(o) {
  const el = document.createElement('section');
  el.className = 'udp-map';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  let last = null;

  function render(p) {
    last = p;
    const st = packStates(p, o.packs);
    const allIds = o.packs.flatMap(pk => pk.levels.map(l => l.id));
    const earned = allIds.reduce((n, id) => n + marksOf(p, id).filter(Boolean).length, 0);
    const nSolved = allIds.filter(id => marksOf(p, id)[0]).length;
    const nextPack = st.find(s => s.open && s.next);

    const packs = o.packs.map((pk, i) => {
      const s = st[i];
      const rows = pk.levels.map((l, j) => {
        const lp = p.levels[l.id];
        const isNext = nextPack && s === nextPack && s.next === l.id;
        return `<li><button class="udp-level${isNext ? ' is-next' : ''}" data-level="${esc(l.id)}"${s.open ? '' : ' disabled'}>
          <span class="lv-no">${esc(sheetNo(pk.id, j))}</span>
          <span class="lv-name">${esc(l.label || l.name)}</span>
          <span class="udp-marks">${marksHTML(marksOf(p, l.id), [], l.master ? !!lp?.star : undefined)}</span>
          <span class="lv-best">${lp && lp.best !== null ? clock(lp.best) : l.par ? '<span title="par">' + clock(l.par) + '</span>' : ''}</span>
        </button></li>`;
      }).join('');
      return `<article class="udp-pack${s.open ? '' : ' is-locked'}">
        <div class="udp-pack-head">${callout(pk.id, String(pk.levels.length).padStart(2, '0'), { size: 44, signal: s === nextPack, dim: !s.open })}
          <div><span class="udp-pack-range">Sheets ${esc(sheetNo(pk.id, 0))}–${esc(sheetNo(pk.id, pk.levels.length - 1))} · ${s.solved}/${s.total}</span><span class="udp-pack-name">${esc(pk.name)}</span></div>
          <div class="udp-pack-grade"><small>Grade</small>${s.grade || '—'}</div></div>
        ${pk.brief ? `<p class="udp-pack-brief">${esc(pk.brief)}</p>` : ''}
        ${s.open ? '' : `<p class="udp-pack-lock">Opens when pack ${esc(o.packs[i - 1]?.id || '')} is finished</p>`}
        <ul class="udp-levels">${rows}</ul></article>`;
    }).join('');

    const modes = (o.modes || []).map(m => `<button class="udp-mode" data-mode="${esc(m.id)}">
        ${callout(m.mark || m.name[0], m.tag || '', { size: 44 })}
        <span><span class="md-name">${esc(m.name)}</span><span class="md-info">${m.info ? m.info(p) : ''}</span></span></button>`).join('');

    el.innerHTML = `<div class="udp-map-top">
        <div><nav class="udp-brand"><a href="${o.hubHref || '../../index.html'}"><span class="udp-long">Unnamed Drawing Project</span><span class="udp-short">← All games</span></a><span class="udp-sep">·</span><span>${esc(o.name)}</span></nav>
          <h1 class="udp-map-title">${esc(o.lead || 'Sheet index.')}<b>${esc(o.name)}</b></h1>
          ${o.sub ? `<p class="udp-map-sub">${esc(o.sub)}</p>` : ''}</div>
        <div class="udp-map-stat"><span>Marks</span><div class="udp-big">${earned}<span style="color:var(--grey3)">/${allIds.length * 3}</span></div>
          <span>${nSolved} of ${allIds.length} sheets drawn</span>
          <div style="margin-top:14px"><button class="udp-btn" data-act="close">${nextPack ? 'Continue ' + esc(nextPack.next) : 'Back'}</button></div></div>
      </div>
      <div class="udp-map-grid"><div class="udp-packs">${packs}</div><div class="udp-modes">${modes}</div></div>`;
  }

  el.addEventListener('click', ev => {
    const lv = ev.target.closest('[data-level]');
    if (lv && !lv.disabled) { o.onLevel?.(lv.dataset.level); return; }
    const md = ev.target.closest('[data-mode]');
    if (md) { o.onMode?.(md.dataset.mode); return; }
    if (ev.target.closest('[data-act=close]')) {
      const st = packStates(last, o.packs).find(s => s.open && s.next);
      if (st && o.onContinue) o.onContinue(st.next); else o.onClose?.();
    }
  });

  return {
    el,
    render,
    show(p) {
      render(p || last);
      el.classList.add('is-on');
      el.setAttribute('aria-hidden', 'false');
      el.scrollTop = 0;
    },
    hide() { el.classList.remove('is-on'); el.setAttribute('aria-hidden', 'true'); },
    get isOn() { return el.classList.contains('is-on'); },
  };
}

// the sheet number shown on the map and in the frame: pack A level 1 → "A.01"
export const sheetNo = (packId, i) => packId + '.' + String(i + 1).padStart(2, '0');
