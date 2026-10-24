// A game page is one screen and never scrolls or zooms: on a phone, a finger
// that slips off the model onto the title or the bar would otherwise pull the
// page, pinch it larger, or zoom it on a double tap, and from then on every
// drag moves the page instead of the model. iOS Safari ignores
// user-scalable=no and does not always honour touch-action on its own, so the
// page also turns down its gesture and touchmove events, except inside a box
// that really scrolls (the level map, a tray), and only along the way it scrolls.
// The double tap zoom is turned off in monolit.css (touch-action: manipulation).

const scrolls = (el, dx, dy) => {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (Math.abs(dy) >= Math.abs(dx) && /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) return true;
    if (Math.abs(dx) > Math.abs(dy) && /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
  }
  return false;
};

let on = false;
export function guardTouch() {
  if (on) return;
  on = true;
  const stop = ev => ev.preventDefault();
  // iOS pinch
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  let x0 = 0, y0 = 0;
  document.addEventListener('touchstart', ev => {
    const t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY;
    if (ev.touches.length > 1) ev.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', ev => {
    if (ev.touches.length > 1) return ev.preventDefault();
    const t = ev.touches[0];
    if (!scrolls(ev.target, t.clientX - x0, t.clientY - y0)) ev.preventDefault();
  }, { passive: false });
}
