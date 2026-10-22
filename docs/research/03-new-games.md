# Three new, more 3D games (plus three runners-up)

Project: **Unnamed Drawing Project**. Tone: advanced and professional, aimed at architecture students and practitioners, nothing childish. Depth comes from real architectural rules, not from cute rewards.

Constraints followed:
- No overlap with Projection Studio (orthographic, perspective, shadow and section/poche games).
- No repeat of earlier pitches (see memory game-idea-backlog): Kesit Avcısı, Arakesit, Gerçek Uzunluk, Topografya Kesiti, Döndür ve Çiz, Çizgi Hiyerarşisi, Nereden Bakıyorum, Görüş Alanı, Aynı mı Ayna mı, Ölçek Gözü, Merdiven Kur, dice nets.

## Ranking

| # | Game | 3D-ness | Novelty (no market equivalent found) | Architecture value | Proven fun pattern | Build cost |
|---|---|---|---|---|---|---|
| 1 | **Origamic** (90° pop-up card) | ●●●●● | ●●●●● | ●●●●● section thinking, plan/elevation in one sheet | Fold & Punch (liked), Paper Fold 343K ratings | M |
| 2 | **Build Order** (tectonics: take apart and assemble) | ●●●●● | ●●●●● | ●●●●○ load path, exploded axo, object composition | Tap Away 50M+, Screwdom ~17% D30 est. | M |
| 3 | **Stack** (Habitat-style module packing under daylight/terrace/access rules) | ●●●●● | ●●●●○ | ●●●●○ object composition, massing | Block Blast verb, Soma/Picross 3D | M–L |
| 4 | Drawing → Space (drawing cards extrude into a diorama) | ●●●●○ | ●●●●○ | ●●●○○ | Viewfinder (BAFTA 2024), Gorogoa | L |
| 5 | Floors (multi-storey circulation drafting) | ●●●●○ | ●●●○○ | ●●●●○ | Blue Prince (2M+ players) | L |
| 6 | Roll (polyhedra roll and print their faces) | ●●●○○ | ●●●○○ | ●●○○○ | Bloxorz (still 8.9 on CrazyGames) | S |

Not pitched, and why:
- **Keyhole**: rotate a mass through an opening. It is the DAT PAT task, but it overlaps the shadow/projection games, and mental rotation alone does not separate architects from beginners (Berkowitz 2021).
- **Pure mental cutting**: the strongest predictor of architectural skill (g = 0.68), but already pitched as Kesit Avcısı and present as section mode in Projection Studio. Origamic trains section thinking indirectly.

---

## 1. Origamic: cut and crease a 90° card; a building stands up

### Idea
Origamic architecture (Masahiro Chatani, architect, 1980s) builds a building out of one sheet with cuts and folds only, and it stands up when the card opens to 90°. No game or app was found for it, only research tools (Mitani/Iizuka popup papers) and craft books.

The architectural insight: **every vertical strip of the card is a section of the building**. The floor half of the sheet reads as a plan and the back half as an elevation. Players learn to think in sections while designing a 3D object.

### Geometry (exact and simple: give this to coding)
- The card is a lattice W × (D + H): the floor half has y ∈ [0, D] measured from the gutter, and the wall half has z ∈ [0, H].
- Paper coordinate s: s < 0 on the floor half (y = −s), s > 0 on the wall half (z = s).
- **Cuts** run perpendicular to the gutter (paper direction s) and split the card into **strips** [x0, x1].
- **Folds** run parallel to the gutter at lattice rows inside a strip, each marked valley or mountain.
- In a strip whose cut runs from s = a (a < 0) to s = b (b > 0), the paper between the folds forms a chain of pieces from the floor attachment (s = a) to the wall attachment (s = b).
- Rule for 90° parallel-fold origamic architecture: **each piece stays parallel to either the wall (type W) or the floor (type F) at every opening angle θ.** The chain starts with W (rising from the floor) and ends with F (meeting the wall), and the types alternate.
- **Closure**: Σ|W pieces| = b and Σ|F pieces| = −a. If that fails, the strip cannot stand. Show it straining or tearing in red at the fold that breaks it.
- Each **box** is a parallelogram linkage, so the motion is well defined for all θ from 180° (flat) to 90° (open) and down to 0° (closed). Animate by chaining the piece directions:
  - W pieces follow the wall's direction (cos θ, sin θ) in the y–z section;
  - F pieces lie along the floor.
- Real paper with several steps in one strip has extra freedom of movement. The game fixes it with this parallel rule, which matches how the card looks at 90°.
- Valley and mountain alternate along the chain. Starting from the floor fold: valley, mountain, valley, …, valley at the wall.
- Example, one box of depth d and height h: folds at s = −d, s = h − d and s = h, with the cut running from −d to h.
- **Windows and openings** are holes cut inside a piece. **Setbacks, stairs and ziggurats** are longer W/F chains. **Facade relief** comes from neighbouring strips with different profiles.
- The 3D result is 2.5D: each x-strip has a staircase profile in y–z. This is enough for terraces, arcades, colonnades (thin strips), towers with setbacks and stepped auditoria.
- **Checking**: compute each strip's profile from the player's pattern and compare it with the target profile. The pattern is unique for a given profile on the lattice, but accept equivalent patterns, for example a split cut that changes nothing.

### Tasks (advanced ladder)
1. **Read**: a card pattern is given. Choose the building it opens into (1 of 4, orbiting). Then open it.
2. **Complete**: one fold or one cut is missing. Place it, including mountain or valley.
3. **Draw**: a target building is shown in 3D (orbitable). Draw the cut and fold pattern. Open the card to verify; strips that match turn quietly valid one by one.
4. **From drawings**: only a plan and a section of the target are given (no 3D). Draw the card. This is hard and very architectural, and it uses drawings as input to a design, not as a quiz.
5. **Elevation features**: openings (windows, arcades) cut into the W pieces. Count and place them correctly.
6. **Two-level pop-ups**: a box on a box, using the second generation of folds on a piece. This is the expert pack.
7. **Constraint design** (many answers): "a building with 3 setbacks, whose roof terraces total 12 cells, with no strip wider than 2". The rule checker plus opening is the judge.
8. **Workshop**: a free designer that exports **SVG/PDF with standard line types** (cut solid, mountain dash-dot, valley dashed) for printing or a laser cutter. This is real studio value.

### Stars
- ★ correct
- ★ par time
- ★ no opening preview before submitting (scrubbing the opening slider before submitting is a "peek")

### Presentation
- The opening slider is the hero moment: θ from 180° to 90°, with paper thickness, self-shadowing and a soft paper sound.
- Wrong strips strain, then tear at the exact fold.
- Section mode: tap a strip to see its profile drawn as a section beside the card.

---

## 2. Build Order (Tectonics): take it apart, put it together

### Idea
The Tap Away and Screwdom grammar (orbit, tap a part, it leaves if nothing blocks it) is the strongest 3D retention pattern in mobile puzzles: Screwdom holds about 45% of a $206M subgenre, with about 17% estimated US D30 versus about 4–8% for leading 2D titles (Naavik, Feb 2026).

Here it is applied to **real construction systems**. The constraints are physical and architectural:
- **support**: nothing may rest on a removed part;
- **access**: a part can only slide out along its free directions, which is joinery.

The reward is a clean **exploded axonometric** forming around the model. Object composition is one of the abilities that separates experienced architecture students from beginners (Berkowitz et al. 2021: g = 0.32, and it rises during year 1).

### Model
- Parts are oriented boxes or prisms with a type: footing, post, beam, joist, deck board, stud, plate, rafter, purlin, batten, tile row, brace, voussoir, keystone, centering, and so on.
- Relations:
  - `supports[p]`: the parts p rests on. Derive it from contact plus gravity, or hand-author it.
  - `slide[p]`: the allowed removal directions (±x, ±y, ±z). Joinery parts have exactly one.
- **Removable** if:
  1. no present part is supported by p (or, in **Risky** levels, it is allowed, but its dependents collapse with a scripted fall and you take a strike); and
  2. a sweep of p's bounding box along some allowed direction hits no present part.
- **Assemble** is the reverse. A part can be placed if all its supports are present and the reverse sweep path is free.

### Tasks
1. **Dismantle**: remove everything in a valid order, within a move budget and 3 strikes.
2. **Assemble**: parts lie in an exploded axo. Tap them in a valid order and each flies into place. Hard mode: drag each part to its location (snap ghost).
3. **First and last**: "which part went in last?" / "which can come out first?". Quick, for warm-ups.
4. **Read the exploded axo**: an exploded axo *drawing* with displacement arrows is shown. Assemble the model accordingly. This tests drawing reading.
5. **X-ray**: cladding hides the frame. Orbit, and reason about what holds what.
6. **Sequence a site**: the order includes temporary works, for example an arch's centering that must go in first and come out last, after the keystone.

### Packs (advanced, real systems)
1. Trabeated stone: trilithon, colonnade, corbel.
2. Arch and vault: voussoirs, keystone, centering, buttress.
3. Timber frame: posts, beams, joists, deck, rafters, purlins, battens, tiles.
4. Japanese joinery and burr assemblies: single-direction slides. This is the hardest spatial pack.
5. Steel frame with bracing and a composite deck.
6. Dom-ino slab-column frame, then a cladding pass.
7. Pavilions simplified as free-plan walls and roof planes. These are recognisable, but use generic names.

### Stars
- ★ no strikes
- ★ par moves or time
- ★ no X-ray or hint

---

## 3. Stack: modules, daylight, terraces, access

### Idea
Habitat-67 logic: "each unit's roof is another's garden". A 3D packing puzzle where validity is architectural, not just geometric.

The verb is as light as Block Blast: pick a module, see the ghost, rotate it, drop it. The puzzle is constraint satisfaction in 3D. Its skills are object composition and massing, with mental rotation as a side effect.

### Rules (combined per level)
- **Support**: a module rests on the ground or on modules below. Cantilevers are allowed up to k cells (k = 1 at first).
- **Daylight**: each module needs at least one unobstructed facade cell. Expert levels use a sun direction, for example the south facade must be unshaded.
- **Terrace**: each module needs ≥ n exposed roof cells.
- **Access**: every module must touch a circulation core or street cell, and the cores connect.
- **Envelope**: stay inside the site volume, under the height limit and behind the setbacks.
- **Fill target**: Soma-style. Exactly fill a target massing (pure composition).
- **Program mix**: given counts of the module types (1×1×2, L, 1×3 and so on).

### Tasks
1. **Fill the massing**: a pure packing warm-up.
2. **Habitat**: place the given modules so every rule holds.
3. **Match the drawings**: the stack must match a given plan and one elevation silhouette. This is design under constraints, not a projection quiz.
4. **Fix the stack**: one module violates a rule. Find it and move it.
5. **Optimise**: maximise terrace area or daylight score. Leaderboards and par.

### Input
- One-finger orbit.
- Tray of modules.
- Ghost follows the pointer and drops to the top of the column under it (3D Tetris logic).
- Rotation: buttons or keys Q/E (yaw), R (tip).
- Undo is free.
- Rule violations show live on the ghost (which rule fails), so mistakes are never silent.

### Stars
- ★ valid
- ★ par score (terrace or daylight)
- ★ no hints

---

## 4–6 Runners-up (short)

### 4. Drawing → Space
A small diorama with a figure. The player has drawing cards (a plan of a bridge, a section of a stair, an elevation of a wall with a door). Placing a card on a surface extrudes it into geometry and opens a path. Choosing the right card and orientation trains reading drawings as space. Viewfinder (BAFTA 2024 British Game and New IP) and Gorogoa prove the wow, but it is expensive to make well.

### 5. Floors
Draft 3–4 stacked floor plans on a grid. Stairs, shafts and doors must align vertically, and headroom must hold. The building rises in 3D and a figure walks the route. Blue Prince (Metacritic 92, 2M+ players including subscriptions) proves floor-plan drafting sells. Check for overlap with the Merdiven Kur pitch.

### 6. Roll
Cuboids, tetrahedra and octahedra roll edge over edge across a tile board and print each face they land on. The trail is a "rolling net". Goals: reach a tile with a given face down, or print a target pattern. Cheap to build, and it bridges to Developments, but it is the least architectural.
