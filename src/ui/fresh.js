// Keep an open page current. A phone browser can show a page it kept from an
// earlier visit, so a game added since then is missing. Each build writes
// version.json; a page from an older build reloads itself, once per build.
// Served from Vite's dev server there is no version.json and nothing happens.

export const BUILD = typeof __UDP_BUILD__ === 'undefined' ? 'dev' : __UDP_BUILD__;

async function check() {
  if (BUILD === 'dev') return;
  try {
    const r = await fetch(new URL('version.json', document.baseURI.replace(/games\/[^/]+\/[^/]*$/, '')), { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = await r.json();
    if (!build || build === BUILD) return;
    // never loop: one reload per new build
    const k = 'udp-reloaded-for';
    try { if (sessionStorage.getItem(k) === build) return; sessionStorage.setItem(k, build); } catch { return; }
    location.reload();
  } catch { /* offline: keep what we have */ }
}
check();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
