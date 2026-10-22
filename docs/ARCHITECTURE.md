# Unnamed Drawing Project: architecture and conventions

Six advanced spatial games for architecture students and practitioners. Professional tone:
precision, responsive motion, real stakes, beautiful 3D. Nothing childish (no confetti, no
cartoon icons, no rounded "app" cards, no rainbow colours). UI language: English.

Specs (read the ones for your task; they are the source of truth for game design):
- `docs/research/00-stack-decision.md`  stack, MONOLIT art direction, borrowed "Çizim Seti" elements
- `docs/research/01-existing-games.md`  Developments (D), Roof Plans (R), Fold & Punch (F)
- `docs/research/02-ui-juice.md`        motion, sound, progression, hub, input, accessibility
- `docs/research/03-new-games.md`       Origamic (O), Build Order (B), Stack (S)
- `docs/research/1-monolit.png`, `2-cizim-seti.png`, `mockup-source.html`  the look, with a working three.js setup

Where a spec conflicts with 00-stack-decision.md, 00 wins (e.g. Roof Plans line colours: under
Monolit, ridge/hip/valley differ by line type and grey, the signal colour is reserved for
selection and errors).

## Stack

- three.js 0.186 (WebGL2), Vite 8, plain JavaScript ES modules with JSDoc. No TypeScript, no UI
  framework: plain DOM for the overlay, three.js for 3D, SVG where 2D linework is crisper.
- Fonts are bundled from `@fontsource/*` (Inter Tight, IBM Plex Mono, Newsreader): the build
  works offline. No network access at runtime.
- `npm run build` writes `dist/`; `python serve.py` serves `dist/` on http://localhost:8642.
  The player's machine has Python but maybe not Node, so `dist/` ships with the project.
- `npm test` (`node tests/run.mjs`) runs every node test in `tests/core/`.
- Browser tests use Playwright 1.56.1 with the preinstalled Chromium (WebGL2 via SwiftShader
  works headless). Launch with `chromium.launch()`; do not run `playwright install`.

## Folder layout

```
index.html                 hub
games/<id>/index.html      one page per game (Vite entry, discovered automatically)
games/<id>/main.js         the game: UI, input, 3D presentation
games/<id>/levels.js       hand-made level data (packs), validated by tests
src/core/                  pure logic: no DOM, no three.js, no timers. Node-testable.
src/stage/                 three.js scene, camera, lights, lines, meshes, picking
src/ui/                    the DOM shell: frame, level map, title block, redlines, progress, runs
src/fx/                    sfx (WebAudio synth), tweens
tests/core/*.test.mjs      node tests, one file per core module (run by tests/run.mjs)
tests/ui/*.ui.mjs          Playwright tests against `vite preview` or dist
docs/                      this file, FOUNDATION.md (the shell/stage API), research specs
```

Game ids and sheet prefixes: `developments` D, `roof` R, `fold` F, `origamic` O,
`buildorder` B, `stack` S. Levels are named like drawing sheets: `D.04` is Developments,
level 4 of the current pack; packs are lettered (pack A, B, ...).

## Code conventions

- Match the existing core modules (`src/core/net.js`, `roof.js`, `paper.js`): a header comment
  that explains the module's idea, comments that say why rather than what, small pure functions,
  plain objects and arrays, no classes unless they genuinely help. 2-space indent, semicolons,
  single quotes.
- Every random generator takes an `rng` argument (`src/core/rand.js`: `seededRng(string)`,
  `mathRng`), so daily puzzles, share codes and tests are reproducible.
- Core modules never touch the DOM, three.js, `Date.now()` or `Math.random()` directly.
- Geometry: z is up in 3D; units are plan modules. 2D sheet coordinates: x right, y up unless a
  module says otherwise; document it in the module header.
- localStorage access always in try/catch; the game must work with storage blocked.
- Accessibility: every colour code has a second channel (line type, label or icon); hit targets
  ≥ 40 px; respect `prefers-reduced-motion`.

## Rules for parallel work

Several agents work in this folder at the same time.
- Write only the files your task owns. Never edit another task's files; if you need a change
  there, write it down in `docs/NEEDS.md` (append a dated line naming the file and the change).
- Do not change `package.json` or install packages unless your task says so. If you need a
  package, note it in `docs/NEEDS.md`.
- Do not run git.
- Test files: name them after your module (`tests/core/<module>.test.mjs`).
- Long-running servers you start for tests must be stopped when you finish.
