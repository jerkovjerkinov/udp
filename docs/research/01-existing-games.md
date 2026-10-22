# Upgrades for the three existing games

utku's feedback (2026-10-22):
- Developments should get harder, with more forms and maybe right triangles.
- Roof Plans is very boring.
- Fold & Punch is good.
- Push all three much further.
- The UI is dull.

Shared shell, juice and progression are in 02-ui-juice.md. Stack and art direction are in 00-stack-decision.md.

Evidence behind the choices below is in 04-market-research.md. Short version:
- Commit-then-reveal is the best-validated training loop (Cohen & Hegarty; Sorby; Spatial Vis).
- Non-cube flat patterns are what Sorby, the DAT PAT and Spatial Vis train, and cube-net apps stop at cubes.
- "Toy first, then challenge" and "simulate the consequence" (Tiny Glade, Poly Bridge) are the strongest fixes for "boring".

---

## 1. Developments (Açınım), the hard version

### 1.1 Solid families: six packs, easy to hard
Each pack has 8 hand-made levels with 3 stars each, plus a generator for Free mode.

| Pack | Solids | Why |
|---|---|---|
| A. Blocks | polycubes, 1–6 cubes (today's game) | warm-up; squared paper |
| B. Prisms | right triangular prism (isosceles right, 3-4-5), **gable house** (pentagonal prism), L-, T- and U-prisms, hexagonal prism | first triangles; a recognisable "house" |
| C. Wedges & ramps | cube or box cut by one plane, ramps, sawtooth roof (3 wedges) | right-triangle faces and a slanted rectangle |
| D. Pyramids & roofs | square pyramid, **hip-roof solid** (links to Roof Plans), frustum, tetrahedron corner | all-triangle fans; nets that are easy to overlap |
| E. Composite buildings | house = box + gable prism; church = box + tower + pyramid spire; sawtooth factory; stair block; house with dormer | recognisable targets (the Shadowmatic and Picross "reveal" reward); concave edges |
| F. Cut & carved | cube with a corner cut off, notched blocks, a box with a hole through it (inner faces) | hardest visualisation; triangle + pentagon faces |

Use recognisable buildings over random blobs wherever possible. The reveal is part of the fun.

### 1.2 Inputs
- **Squared paper (cutting-mat grid)**: packs A, and B/D where the solid is lattice-friendly. Examples:
  - a square pyramid with base 2 and slant height 2 on the x2 lattice;
  - a 3-4-5 gable house whose faces attach along lattice edges.
  Painting cells (as now) becomes drawing polygon faces whose vertices snap to lattice points. The fold check works on the polygon net.
- **Cut the solid (new, main input for B–F)**:
  - Orbit the 3D model and click edges to cut them. A cut edge turns into a red dashed line, with a scissors sound.
  - When a face hangs on a single hinge path, it **swings open live**. When the cuts form a spanning tree, the whole solid lies flat on the mat.
  - Overlapping faces flash red and the net jams in mid-air (simulate the consequence).
  - A cut that splits the solid into two pieces is refused with a "snip, falls apart" animation and counts as a strike.
- **Net cards**: an exact-geometry net is shown flat on the mat. Tasks are below.

### 1.3 Tasks (old ones kept, new ones marked *)
1. **Missing face**: now with triangles. Drag the face tile from the tray to the edge where it belongs; it snaps and hinges.
2. **Find the face**: kept. Add **find the edge*** (which solid edge does this net edge become).
3. ***Match the edge***: click an edge of the net, then the edge it glues to. This is the classic Sorby/PAT task: cheap to build and very effective. Do 3 in a row.
4. ***Will it fold?***: yes/no, and if no, click the two faces that collide. The reveal folds the net and shows the collision.
5. ***Which solid?*** (PAT Pattern Folding): pick 1 of 4 slowly rotating solids for a given net.
6. ***Fix the net***: one face is attached to the wrong edge. Drag it to a correct edge.
7. ***Cut it open***: cut the 3D solid into a net. Variants:
   - any valid net;
   - a net that fits the sheet (an A4 outline on the mat), which is a real model-making constraint;
   - a net that matches a given silhouette (only one spanning tree works).
8. ***Facade on the net***: the solid has windows, a door and a roof stripe drawn on its faces. Place the stamps on the net in the right spot and **right orientation** (rotating a stamp is part of the task). This is hard, architectural, and trains face-orientation tracking.
9. **Draw the development**: kept for lattice solids.
10. ***Glue tabs*** (bonus, pack E+): add a tab to every other edge so each seam has exactly one tab. The result can be printed as a real model (PDF/SVG export), so teachers can bring it into the studio.

### 1.4 Difficulty and scoring
- Stars per level:
  - ★ solved;
  - ★ under par time;
  - ★ no peek (the fold-preview slider and hints cost the third star, as in Click the Cube and Spatial Vis).
- Strikes: 3 per level in Challenge (Picross 3D style); unlimited in Free mode.
- Challenge (10 questions), suggested ramp:
  1. match edge (B)
  2. missing face (B)
  3. find the face (C)
  4. will it fold (C)
  5. which solid (D)
  6. fix the net (D)
  7. cut it open (D)
  8. facade on net (E)
  9. cut to fit the sheet (E)
  10. draw development (F lattice)
- Feedback is graded, not just "wrong": say which face lands where ("this triangle ends up inside the box").

### 1.5 Juice specific to the game
- Faces hinge with a slight overshoot and settle, with a soft paper "flap" for each face.
- On success: the net folds up, the seams "zip" closed one after another (rising notes), and the finished model drops onto the table with a soft shadow bounce.
- Optional colour-coded fold axes as a hint (Manifold Garden idea): each face is tinted by the direction it faces once folded.

---

## 2. Roof Plans (Çatı Planı), a redesign: toy first, then puzzles

Why it is boring today:
- It is a static quiz: draw lines, then press Done.
- The building is generic.
- Nothing happens as a consequence.
- Every question looks the same.

### 2.1 Sandbox ("Tiny Glade for roofs") is the new landing mode
- Drag on the plan grid to add or remove modules of the footprint; drag a wall to push or pull it.
- **The roof regrows live** in 3D with eased animation, roof tiles, walls with windows, a door, a chimney and a few trees.
- The plan lines update live in the colour code: ridge yellow, hip blue, valley pink. Also use dash patterns so the colours work for colour-blind players.
- Pitch slider: the roof gets steeper but **the plan lines do not move**. This is a key lesson: for equal pitch, the plan does not depend on the pitch.
- Toggles:
  - courtyard (an inner hole gives inner valleys);
  - gable ends (later pack; needs a weighted skeleton with gable edge weight 0);
  - rain.
- **Rain**: drops slide down the steepest descent of each plane, gather along valleys, run off the eaves into gutters and downpipes. Ridges visibly split the water. It is pure joy and teaches what a valley is.

### 2.2 Puzzles (hand-made packs named after building types)
Packs: L-house, T-school, U-courtyard, cross-plan church, konak with courtyard, terrace row, then gables and dormers.

1. **Which roof?** (warm-up, 10 s): a plan and 3 roofs in 3D; pick the matching one. The reverse version is a roof and 3 plans.
2. **Spot the error**: a roof plan with 1–3 wrong lines (a valley drawn as a hip, a ridge too long, a missing hip). Tap them.
3. **Name the lines** (kept, faster): tap-to-cycle the line type instead of choosing from a menu.
4. **Missing lines** (kept).
5. **Draw the plan** (kept), now with a ghost line plus live snap and a length readout while dragging (Islanders-style preview).
6. **Roof to plan**: orbit an unfamiliar 3D roof (no plan shown), then draw its plan. This is more 3D.
7. **Lines to footprint (reverse)**: only the ridge, hip and valley lines are given. Draw the eave outline. It is a surprisingly good puzzle.
8. **Drain it**: place downpipes so every valley and every eave run drains, with the fewest pipes. Rain then tests the result: missed water overflows and splashes.
9. **Design to brief** (many answers are right): "make a footprint of 14 modules whose roof has exactly 2 valleys and one continuous ridge", "the highest ridge must be 3 modules high", "a courtyard with 4 valleys". Rain or a check runs on submit. This is open-ended play with constraints.

### 2.3 Feedback that is a consequence, not a red X
When the plan is wrong, build the roof the player's lines imply where possible. Otherwise show the true roof with the player's wrong lines as glowing red strings floating above it, and run rain: water "leaks" at the wrong spot. Let them see why.

### 2.4 Stars
- ★ solved
- ★ par time
- ★ no height-hint

Height-hint: hovering a lattice point shows its roof height number, which is the L∞ distance to the eaves. It is a great teaching aid, but it costs a star.

---

## 3. Fold & Punch: liked, push it further

### 3.1 New mechanics, in order of payoff
1. **Asymmetric punch shapes**: half-moon, triangle, L, and the letter **F**. Mirroring now matters: every unfold flips the shape. Hard, elegant, and trains reflection (a Sorby module).
2. **Scissor cuts** instead of punches: cut along a line or polyline on the folded paper. Opening it gives a snowflake, a lace pattern or a **paper-doll chain of little houses**. Draw the cut outline on the opened sheet. It is the most joyful reveal in the game.
3. **Two-colour paper**: one side coloured. "Which squares show colour when opened?" This tracks front and back through folds.
4. **Reverse**: given the opened sheet with its holes, give the fold sequence and the punch point. Euclidea-style stars go to the fewest folds.
5. **Off-centre folds**, where only part of the stack overlaps, plus **rectangular sheets** and **4 folds** for the expert pack.
6. **Fold it yourself**: drag a flap across a crease to fold, like the Paper Fold app (4.6★ from 343K ratings). It suits "make this folded shape" tasks.

### 3.2 Presentation
- Folding happens in **real 3D**: paper with thickness, self-shadowing and a slight perspective, viewed from above at an angle.
- A punch is a satisfying "chunk": the punched discs fall and bounce on the table.
- The unfold plays fold by fold with a paper sound. Holes light up as they appear.
- The folded stack can be orbited to count layers (more 3D).

### 3.3 Bridge to the new Pop-Up game
Pop-Up (03-new-games.md) uses the same cut + crease vocabulary. Put them next to each other in the hub as the "Paper" family.
