// The 3D stage: one WebGL2 renderer, the MONOLIT scene and the camera rig.
//
// The light is the mockup's: a warm hemisphere fill, so shadow sides are dark
// grey and never black, and one low raking key light from the front-left
// throwing long real shadows (4096 map, soft PCF). The key light follows the
// content: before each render its shadow camera is fitted to the bounds of
// stage.content, so the shadow map is always as sharp as it can be.
//
// The ground is a matte plane (#4a4744) that receives the shadows and fades out
// with distance from the content, so the CSS vignette behind the transparent
// canvas shows at the edges of the screen, as in a gallery.
//
// Nothing draws until something calls invalidate(): tweens, the camera rig
// and the game do; the render runs once at the end of that animation frame.
//
//   const stage = createStage(document.querySelector('.udp-stage'));
//   stage.content.add(mesh);  stage.frame(stage.content);  stage.invalidate();

import * as THREE from 'three';
import { createCameraRig } from './camera.js';
import { syncLines } from './lines.js';
import { onFrameEnd, requestFrame } from '../fx/tween.js';

export const MONOLIT = {
  plaster: 0xd8d2c7,
  ground: 0x4a4744,
  hemiSky: 0xb4afa6, hemiGround: 0x2a2826, hemiIntensity: 1.25,
  sunColor: 0xfff1dc, sunIntensity: 3.4,
  sunDir: [-12, -6.5, 5.6],     // toward the light: low, front-left
  shadowMap: 4096, shadowRadius: 3, shadowBias: -.0004, shadowNormalBias: .03,
};

// the plaster material every model uses (one per call: states tint copies)
export function plasterMaterial(opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: MONOLIT.plaster, roughness: .92, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    ...opts,
  });
}

// a matte ground whose alpha falls off with distance from a centre (uniforms
// fadeCentre, fadeR0, fadeR1 in world units). It is drawn first, in the opaque
// pass, blended by hand and writing no depth, so it can never cover a model
// lying on it (zoomed far out, a model's polygon offset reaches below z = -.03)
function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: MONOLIT.ground, roughness: 1, metalness: 0, transparent: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const u = { fadeCentre: { value: new THREE.Vector2() }, fadeR0: { value: 8 }, fadeR1: { value: 22 } };
  m.userData.fade = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXY = ( modelMatrix * vec4( position, 1.0 ) ).xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXY;\nuniform vec2 fadeCentre;\nuniform float fadeR0;\nuniform float fadeR1;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep( fadeR0, fadeR1, length( vGroundXY - fadeCentre ) );');
  };
  m.customProgramCacheKey = () => 'udp-ground';
  return m;
}

/**
 * createStage(container, opts)
 *   opts.camera    options for the camera rig (yaw, pitch, snap, ...)
 *   opts.ground    false to drop the ground plane
 *   opts.maxPixelRatio (2), opts.shadowMap (4096), opts.preserveDrawingBuffer (false), opts.longShadows (false)
 */
export function createStage(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was folded into PCFShadowMap in r18x: radius gives the soft edge
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D view: drag to orbit, scroll or pinch to zoom');
  canvas.tabIndex = -1;
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const content = new THREE.Group();
  content.name = 'content';
  scene.add(content);

  const hemi = new THREE.HemisphereLight(MONOLIT.hemiSky, MONOLIT.hemiGround, MONOLIT.hemiIntensity);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(MONOLIT.sunColor, MONOLIT.sunIntensity);
  const sunDir = new THREE.Vector3(...MONOLIT.sunDir).normalize();
  sun.castShadow = true;
  const sm = opts.shadowMap ?? MONOLIT.shadowMap;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.radius = MONOLIT.shadowRadius;
  sun.shadow.bias = MONOLIT.shadowBias;
  sun.shadow.normalBias = MONOLIT.shadowNormalBias;
  scene.add(sun, sun.target);

  let ground = null;
  if (opts.ground !== false) {
    ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMaterial());
    ground.position.z = -.03;                          // below polygon-offset reach: nets lie flat at z = 0
    ground.receiveShadow = true;
    ground.renderOrder = -10;
    ground.userData.noFrame = true;
    ground.name = 'ground';
    scene.add(ground);
  }

  // ------------------------------------------------------------------
  // size, free rect, camera
  // ------------------------------------------------------------------

  let W = 0, H = 0;
  let freeRect = null;                                 // set by the UI frame; default: whole canvas
  const size = () => ({ w: W, h: H });
  const rect = () => freeRect || { x: 0, y: 0, w: W, h: H };

  let dirty = true;
  const invalidate = () => { dirty = true; requestFrame(); };

  const rig = createCameraRig({ dom: canvas, size, rect, invalidate }, opts.camera);

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    rig.reframe();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ------------------------------------------------------------------
  // shadows and ground fitted to the content
  // ------------------------------------------------------------------

  const box = new THREE.Box3(), sphere = new THREE.Sphere(), tmp = new THREE.Box3();
  function contentBounds() {
    box.makeEmpty();
    content.updateWorldMatrix(true, true);
    content.traverseVisible(o => {
      if (!(o.isMesh && o.castShadow)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    return box;
  }

  function fitLight() {
    const b = contentBounds();
    if (b.isEmpty()) { b.set(new THREE.Vector3(-2, -2, 0), new THREE.Vector3(2, 2, 2)); }
    b.getBoundingSphere(sphere);
    const r = Math.max(.5, sphere.radius), c = sphere.center;
    const top = Math.max(.1, b.max.z);
    const elev = Math.asin(Math.max(.08, sunDir.z));
    const throwLen = top / Math.tan(elev);             // how far the longest shadow reaches
    sun.position.copy(c).addScaledVector(sunDir, r + 2);
    sun.target.position.copy(c);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    // a low sun throws shadows far past the content: widen the map to hold them
    const m = r * 1.04 + .1 + (opts.longShadows ? throwLen * Math.cos(elev) : 0);
    cam.left = -m; cam.right = m; cam.top = m; cam.bottom = -m;
    cam.near = .1; cam.far = 2 * r + 4 + throwLen * 1.2;
    cam.updateProjectionMatrix();
    if (ground) {
      const u = ground.material.userData.fade;
      u.fadeCentre.value.set(c.x + sunDir.x * -throwLen * .35, c.y + sunDir.y * -throwLen * .35);
      const R = Math.max(5, r + throwLen * .9);
      u.fadeR0.value = R * (opts.groundFade?.[0] ?? 1.05);
      u.fadeR1.value = R * (opts.groundFade?.[1] ?? 2.6);
    }
  }

  // ------------------------------------------------------------------
  // render on demand
  // ------------------------------------------------------------------

  const renderHooks = new Set();
  let frozen = false;
  function render() {
    dirty = false;
    if (!W || !H) return;
    rig.update();
    fitLight();
    syncLines(scene, rig.pxPerUnit());
    renderer.render(scene, rig.camera);
    for (const fn of renderHooks) fn();
  }
  const offEnd = onFrameEnd((t, animating) => { if ((dirty || animating) && !frozen) render(); });

  const stage = {
    renderer, scene, content, camera: rig, rig, sun, hemi, ground, canvas, container,
    get width() { return W; },
    get height() { return H; },
    invalidate,
    // render now (tests, screenshots); normally invalidate() is enough
    renderNow: render,
    // the screen rect (canvas px) the UI leaves free for 3D content
    setRect(r, { animate = false } = {}) {
      const same = freeRect && r && ['x', 'y', 'w', 'h'].every(k => Math.abs(freeRect[k] - r[k]) < .5);
      freeRect = r ? { ...r } : null;
      if (!same) rig.reframe({ animate });
    },
    get rect() { return rect(); },
    // turn the key light: d points toward the sun (z up)
    setSun(d) { sunDir.set(d[0], d[1], d[2]).normalize(); invalidate(); },
    get sunDir() { return sunDir.toArray(); },
    frame: (what, o) => rig.frame(what ?? content, o),
    frameTurn: (what, n, o) => rig.frameTurn(what, n, o),
    victoryOrbit: o => rig.victoryOrbit(o),
    // fn() after every render: labels and redlines follow the camera with it
    onRender(fn) { renderHooks.add(fn); return () => renderHooks.delete(fn); },
    // project a world point to canvas px: [x, y, depth] (depth > 1 is behind the camera)
    project(p) {
      const v = (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2] ?? 0)).project(rig.camera);
      return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z];
    },
    // stop drawing while hidden behind a full-page view (the level map)
    freeze(v = true) { frozen = v; if (!v) invalidate(); },
    contentBounds: () => contentBounds().clone(),
    // remove and dispose everything in stage.content
    clear() {
      for (const c of [...content.children]) disposeTree(c);
      invalidate();
    },
    dispose() {
      offEnd(); ro.disconnect(); rig.dispose();
      disposeTree(content);
      ground?.geometry.dispose(); ground?.material.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
  return stage;
}

// remove an object and free its geometry and materials
export function disposeTree(obj) {
  obj.removeFromParent();
  obj.traverse(o => {
    if (o.dispose && o !== obj && o.isLineSegments2) { o.dispose(); return; }
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose?.();
  });
}
