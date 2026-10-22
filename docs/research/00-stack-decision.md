# Stack, folder and art direction (decision from research)

## Stack
- **three.js (WebGL, r18x)**. Build with **Vite**, using plain JS ES modules with JSDoc and no TypeScript, so the tested pure-logic modules port as they are.
- Build in the coding container. Deliver `src/` and a built `dist/`. `serve.py` serves `dist/` as static files, so utku needs no Node.
- Libraries: `three`; from three/examples, OrbitControls, Line2/LineSegments2 (fat lines) and EdgesGeometry; `n8ao` (or postprocessing SSAO) for a soft model look. Add `three-bvh-csg` only if a game needs cutting.
- No physics engine at first. The "collapse" in Build Order can be scripted tweens, and Rapier can come later if needed.
- Audio: a small WebAudio synth module (`sfx.js`) with no asset files: pencil, paper fold, punch, click-snap, rising pentatonic notes for correct steps, and a soft thud for errors. Include a mute toggle.
- No Python in the games. Python stays only for `serve.py`.

## Folder
- Put the new suite in a **fresh sibling folder**. Name it after the project (Unnamed Drawing Project) and confirm the folder name with utku. ps2 stays untouched as a reference.
- Port only the pure-logic modules that ps2 wrote from scratch: net, roof skeleton, paper, polycube, rand, vec, run, scores. Drop view3d and the canvas painting.
- Port the shell flow (Free/Challenge, scoring) and extend it with level packs, stars, hints, a daily puzzle and a level map. See 02-ui-juice.md.

## Rendering and art: **MONOLIT** (chosen by utku, 2026-10-22)
Reference mockup: `visual-options/1-monolit.png`; its source is `visual-options/mockup-source.html?s=mono`, which shows a working three.js setup.

The "maket atölyesi" look is cancelled. This is an advanced, professional project.

**Scene**
- Monochrome models in a light plaster or concrete tone (#d8d2c7) on a matte ground (#4a4744).
- Background is a deep warm-grey vignette (#3a3936 to #0f0f0e).
- MeshStandardMaterial with flatShading and roughness of about 0.9.

**Light**
- One hard raking key light, low and from the front-left, giving **long real shadows**: DirectionalLight about 3.4, PCFSoft shadows, 4096 map, normalBias 0.03.
- A hemisphere fill of about 1.2, so shadow sides are dark grey and never black.
- Optional N8AO at low intensity.

**Lines**
- Thin dark edges (fat lines, about 1.2 px).

**Signal colour**
- One colour only: **#FF5A1F**. It means "active, selected, cut, error locus, progress".
- Everything else is greyscale and warm white (#e9e6df).

**Typography**
- Inter Tight 300/500 for titles: a large light headline plus a bold object name.
- IBM Plex Mono for numbers, timer and labels, in small caps with wide letter-spacing.
- Gallery-like layout: big margins (48 px), no boxes or panels. Use thin rules and text-buttons.
- The single primary action is a light filled block (e.g. "UNFOLD").

**Camera**
- Orthographic axonometric by default. Orbit settles on 45° steps.
- Cinematic glide and one slow orbit on success.

**2D drawings**
- Nets, plans and cards are thin warm-grey linework on the dark ground.
- Fold lines are dashed and the active part is tinted with the signal colour at low alpha.
- Drawing surfaces are planes in the same 3D scene.

**Not allowed**
- Confetti, cartoon icons, multiple bright colours or rounded "app" cards.

**Roof Plans colour code under Monolit**
- Ridge, hip and valley are distinguished by **line type plus greys**: ridge solid heavy, hip dashed, valley dash-dot.
- The signal colour is reserved for the selection or error.

### Borrowed from "Çizim Seti" (utku, 2026-10-22: Monolit may include parts of the drawing-set direction)
- **Line weights and types** on every 2D drawing (nets, plans, cards, roof plans), following drafting convention:
  - profile/cut lines heavy;
  - visible edges medium;
  - folds dashed;
  - mountain folds dash-dot;
  - hidden lines fine dashed.
  On the dark ground, use warm-white ink.
- **Sheet numbers** name levels: `D.04` is pack D, level 4 of Developments. Use one letter prefix per game, for example O = Origamic, R = Roof, B = Build Order, S = Stack, F = Fold.
- **Title block** as the level header and the end-of-level and run summary. It is a thin-ruled grid with these fields: project, drawing (level name), sheet, scale, attempt, time / par, grade (A–C). Mockup: `visual-options/2-cizim-seti.png`, bottom right; restyle it in Monolit colours.
- **Redline critique** for errors: a thin circle around the exact culprit, a leader line, and a short italic serif note (Newsreader italic), for example "this is a fold, not a cut — the gable must stay attached". Draw it in the signal colour #FF5A1F, not red. It replaces generic "wrong" messages.
- **Section and callout markers** (a circle split by a line: letter over sheet number) as navigation: on the level map, and inside Origamic, where tapping a strip opens its section.
- **Not borrowed**: the light vellum background and the double sheet frame. The background stays Monolit dark.

## Developments input (answer to coding's question)
Both input styles, chosen by tier:
- **Squared-paper drawing** stays for polycubes and lattice-friendly solids:
  - square pyramids whose slant height is an integer on the x2 lattice (base 2, slant 2, so the height is √3);
  - 3-4-5 gable houses, provided the faces attach along lattice edges.
- **Cutting edges on the 3D solid** is the main input for general polyhedra (prisms, wedges, pyramids, cut cubes, house forms). The player clicks edges, faces swing open live around the hinges that remain, and any overlap flashes red.
- **Exact-geometry net-card tasks**:
  - match the edge;
  - will it fold?;
  - which solid (pick 1 of 4);
  - fix the net by dragging one face to another edge;
  - put the window and door marks on the net.

poly.js therefore needs edge cutting, a spanning-tree unfold, an overlap test, a hinge animation and a fold check. Keep that work, but render it with three.js.
