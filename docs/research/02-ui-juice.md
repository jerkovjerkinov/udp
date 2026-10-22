# UI, feel and progression for the whole suite (professional tone)

Project: **Unnamed Drawing Project**. utku said the old UI was dull and should be more enjoyable. They then rejected a playful "maket atölyesi" look: this is an advanced, professional project, not a kids' game.

So "more enjoyable" here means:
- satisfying precision;
- responsive motion;
- real stakes (grades, par, streaks);
- beautiful 3D.

It does not mean confetti and cute sounds.

## 0. Visual direction: chosen by utku from three options
The mockups are in `research/visual-options/`; the source is `mockup-source.html`.
1. **Monolit**: monochrome concrete or plaster models, one hard raking light, long real shadows, gallery typography, one signal colour (orange). My recommendation.
2. **Çizim Seti** (drawing set): vellum, ink line weights, title block, sheet numbers, section or callout markers as navigation, red critic redlines for errors.
3. **Enstrüman** (instrument): pro-software feel, with a graphite UI, inspector panel, numeric readouts, dimension strings and snap guides.

**Do not build any look until utku confirms one.** The sections below hold for any of the three.

## 1. Motion: everything responds, nothing is flashy
- No instant state changes. Cameras glide with easing; when the player releases an orbit it settles on 45° axo steps; parts move along their real kinematics (hinges, slides, the card opening).
- **The 3D consequence is the feedback.** A net jams where faces collide, a card strip tears at the fold that fails, water leaks at a wrong valley, a frame sags when a support is removed. Highlight only the exact culprit.
- On success, the model completes its motion (it folds shut, opens, or assembles), and then the camera makes one slow orbit. No particles.
- Respect `prefers-reduced-motion`.

## 2. Sound: restrained and tactile, optional
A WebAudio synth with no asset files. Every sound is short and low in the mix, with mute on by default on first visit:
- a soft click on snap;
- a paper or material tick on fold or hinge;
- a low tone for errors.

Correct sub-steps may step up a quiet scale. No jingles.

## 3. Progression and stakes
- **Packs as briefs.** Each game has 6–7 packs of about 8 hand-made levels. Each pack is presented as a brief or sheet set (e.g. "D.01–D.08 Pyramids & roofs"). Finishing a pack unlocks the next.
- **Three marks per level**: ◆ correct, ◆ under par (time or moves), ◆ no hint or peek. A per-pack grade (A–C) comes from the marks.
- **Hints are graduated**: nudge, then partial, then show. Each costs the third mark, never progress.
- **Challenge**: a 10-item timed run with strikes (3) and a streak counter. Your personal-best split is shown on the timer bar.
- **Workshop (free mode)**: generators plus sandboxes (the roof sandbox, the Origamic designer with SVG/PDF export).
- **Daily**: one puzzle a day across the suite, the same for everyone, with a spoiler-free share string and a streak (Wordle: 5.3B plays in 2024).
- **Share codes**: a level is encoded in the URL hash, so a teacher can set work and students can challenge each other. No server needed.
- **Optional skill index**: short PSVT:R- and MCT-style checks on first launch and every N sessions, giving a number to improve. Training transfers (Uttal 2013, g ≈ 0.47) and mental cutting is the strongest marker for architects (Berkowitz 2021, g = 0.68).

## 4. Hub
- A single page with the suite name.
- Each game shows a **live, slowly orbiting 3D model**, pack progress and the daily puzzle state.
- Families:
  - **Sheet**: Fold & Punch, Origamic;
  - **Solid**: Developments, Stack;
  - **Building**: Roof Plans, Build Order.
- First launch: a 3-step **wordless** tutorial per game (The Witness style). Puzzle 1 shows the rule trivially; text help sits behind the ? button.

## 5. Input
- One-finger orbit, tap to act, pinch to zoom; hit targets of at least 40 px.
- Snap everything (lattice, edges, faces, modules).
- A **ghost preview** always shows what an action will do before you commit.
- Undo is always free.
- On desktop, keyboard shortcuts with a visible legend.

## 6. Accessibility
- Colour coding always has a second channel (line type, icon or label). Ridge, hip and valley also differ by dash pattern.
- UI language: English. A TR/EN toggle is optional and cheap.
