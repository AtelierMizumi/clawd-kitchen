# Sextant revamp: higher-resolution kitchen and hand-drawn Clawd


> **Amendment 2026-10-17 (supersedes every sextant / 2x3 mention below).** `RasterProps.cells` in the Claude
> Code plugin types says a code point must be "one printable width-1 BMP character", or the whole tree is
> refused. Sextants (U+1FB00..) and octants are outside the BMP, so the grid is **quadrant, 2x2 pixels per
> cell** (U+2596..U+259F plus the half blocks). Sub-pixels are about 1:1.8 (tall), measured from the user's
> terminal (10.3 px per column, 18.8 px per line). Vertical resolution is unchanged from the half-block scene;
> horizontal doubles. Consequences: scene = 104 x 16 px (+ `FX_ROWS * 2` px on top); `CELL_W = CELL_H = 2`;
> `pxToDots(x, y) = [x, 2 * y]`; the two-colour rule applies to 2x2 cells; old art maps by doubling x.
> The art-constraint test is strict for Clawd over the whole rig and for static props, and a budget plus a
> behavioural "eyes survive encoding" test for whole scenes (moving bits cannot always avoid a third colour).

## Why

The quadrant revamp (`9a5c994`) looked worse than the shipped half-block scene and was never wired into
`scene.ts`/`register.tsx`. Two root causes:

1. Quadrant sub-pixels are 1:2 tall rectangles (cells are ~1:2, 2x2 per cell), but `clawd_v2.ts` drew its art
   as if they were square, so Clawd came out distorted.
2. `toQuadrantCells` silently drops colours when a cell needs more than two (transparency counts as one),
   which eats eyes and outlines.

Goal: keep the idea of a higher-resolution scene, redo all art and animation so it looks better than the
half-block version, and keep the behaviour the shipped state machine already has.

## Decisions (agreed with the user)

- Scope: all poses (idle, typing/chopping, thinking/phone, simmering, bash/pan toss, seasoning, serving,
  burnt, sleeping).
- Grid: **sextant**, 2x3 sub-pixels per cell (U+1FB00..1FB3B plus space, `▌`, `▐`, `█` for the four
  patterns the block omits). Sub-pixels are ~3:4, near square. Chosen over octant (2x4, square) for wider
  font support. The user's font (Adwaita Mono, Noto Sans Symbols 2) covers both.
- Keep the pipeline `sprites/*.txt` -> `tools/build.py` -> `hooks/gen/data.ts`, the part-assembled Clawd, and
  the state machine and timings in `mood.ts` / `actions.ts` / `table.ts`.
- Remove `hooks/lib/quadrant.ts`, `hooks/lib/clawd_v2.ts` and their tests, `tools/live_preview.ts`,
  `tools/preview_revamp.py`.

## Design

### Rasterizer (`hooks/lib/raster.ts`)
- `toCells` encodes a pixel canvas, 2 wide x 3 tall per cell, into `[codepoint, fg, bg]` cells.
- Every cell has at most two colours, where "terminal default" (transparent) is a colour. Encoder picks the
  glyph from the sub-pixel mask for the foreground colour; background is the other colour (or default).
- Over the limit (3+ distinct values) the encoder still degrades deterministically (majority colours), but
  that case must never occur for shipped art (see tests).
- Braille FX overlay (steam, sparkles, zzz) is unchanged in behaviour; its coordinates are rescaled to the
  new grid (a cell is 2x3 pixels, so FX placement uses cell coordinates).
- Codepoints above 0xFFFF are handled everywhere they are turned into strings (`String.fromCodePoint`).

### Art (`sprites/*.txt`, `sprites/scenes.json`)
- Redrawn by hand on the 2x3 grid, in the existing text-sheet format; same palette family.
- Scene stays 52 columns wide (104 px) and about 8 cell rows plus the FX row, so it fits the current
  >= 57-column requirement.
- Clawd: same silhouette and colours (terracotta body, white chef hat), with shading, outline, richer eyes,
  separate arm/leg parts so poses need no new drawings. Props (stove, shelf, jars, pan, pot, phone, bubble,
  prep table, knife, food, dishes, plate, shaker, flames) are redrawn in the same style.

### Animation (the main part of this work)

The mood state machine (`mood.ts`) and its triggers do not change. What changes is everything `actions.ts`
and `clawd.ts` produce: a richer `Pose`/`Action`, more keyframes per motion, and every motion redesigned
using classic animation principles instead of "toggle between two states".

#### Principles
- **Held keyframes, not continuous easing.** The shell redraws every `TICK_MS` = 80 ms (12.5 fps) while a
  mood is active, and every 4th tick (~3 fps) when idle or asleep. Eased sub-pixel offsets rounded to a
  grid only jitter at that rate, so each motion is a short list of authored keyframes with a hold length
  per keyframe (in ticks), chosen so the stroke reads at 12.5 fps.
- **Anticipation, action, settle.** Every action has a wind-up frame (crouch before a toss, knife up and
  back before a chop, lean before pulling the table), the fast action frames, and a settle (small
  overshoot and return).
- **Follow-through and overlap.** The chef hat lags the head by one keyframe, so it dips after Clawd
  crouches and rises after he straightens. The right arm leads the left in two-handed moves.
- **Squash and stretch at pixel scale.** On the 2x3 grid the body can compress by one pixel row on landings
  and chops and stretch by one on jumps, with the feet staying planted.
- **Secondary motion.** Steam, bits of food, sparkles and the lid react to the main action with their own
  offset timing, never in lock-step with Clawd.
- **Variety.** Idle fidgets are chosen from a longer list on irregular periods so the loop is not obviously
  periodic.

#### The rig (replaces the small `Pose` type)
`Pose` stays a plain data object produced by pure functions of time. New fields:
- `eyes`: `open | half | closed | left | right | up | down | wide | happy` (half = mid-blink lid frame,
  wide = surprise, happy = `^ ^` for serving).
- `lean`: -1..1 pixel columns the body shifts toward the table or the stove; head and hat shift with it.
- `squash`: -1 (stretch) / 0 / +1 (squash) body rows.
- `hat`: lag offset in pixel rows, derived from the previous keyframe.
- `armL` / `armR`: each one of `rest | lift | high | out | forward | hold` (hold is used with a prop),
  each with its own forearm and hand pixel so props can be gripped.
- `legs`: `stand | tapL | tapR | step | hop`.
- `glow`: unchanged, 0..1 breath light on the top rows.
Props (knife, phone, shaker, pan, lid) are positioned from the hand pixels of the pose, so a hand and what
it holds cannot drift apart (today they are positioned independently, which is the source of small jitters).

#### Idle (~3 fps)
- Breath: 3.2 s cycle, glow plus the arm lift on the inhale as now, plus a one-row squash on the exhale.
- Blink: close, half, open over three keyframes (not an instant swap), occasionally a double blink.
- Fidgets, one every ~6-12 s from a rotating list: look left, look right, look at the pan then the pot,
  foot tap, a small stretch (arms lift, body stretches, settle), a hat adjust (right hand touches the hat,
  hat dips one row), a tiny hop.
- Flames and steam keep running independently at their own rates.

#### Typing (table pulled over, then chopping), 12.5 fps
- **Pull:** anticipation (lean away from the table, arm out), then 4-5 alternating tug steps with the body
  rocking and the table advancing one pixel per step (it eases: the last two steps are shorter), then a
  settle: Clawd straightens, hat dips and recovers.
- **Chop** (per 240 ms cycle today, becomes 5 keyframes): knife up with wrist cocked, knife to
  mid-stroke, impact with a one-row squash and eyes `down`, the slice kicks off, recovery. The slice flies on
  a real arc (rise, hang one frame at the top, fall) and lands onto the pile with a one-row bounce. The
  pile fans cleanly; the next ingredient slides up to the knife with a small ease.
- Each new ingredient triggers a different tiny beat (nod), so meat, cucumber and carrot do not feel
  identical.

#### Thinking (phone, cooking from a dish bubble), 12.5 fps
- Clawd holds the phone with a hand pixel on it; the head tilts a pixel toward the screen.
- **Swipe:** thumb flick with a two-frame overshoot, the screen content scrolls by two rows, the bubble
  empties and the new dish pops in with a squash-and-stretch pop (small, big, normal).
- Eyes follow the screen, then flick up to the bubble, then to the stove: attention is visible.
- **Toss:** wind-up (right arm back, body leans away), release (arm forward, lean into it), the bit flies a
  true parabola, and the landing reacts: the pan splashes in three drops of staggered timing, or the pot lid
  pops with steam puffs left and right and settles with a double rattle.

#### Stir (Bash)
- Anticipation: crouch one row, pan handle gripped (left hand `hold` on the handle pixel).
- Toss: stretch up, pan rises in three steps with the hat lagging, flames flare for the toss and shrink
  after, each of the three food bits follows its own arc (different apex and spin frames), and they land back
  in the pan in a staggered order with a one-row pan dip on catch.
- Eyes follow the bits up and down.

#### Simmer (answer streaming)
- Lid rattle with irregular timing (not a strict 2-step toggle), steam puffs both sides, bubbles popping at
  the pot rim, Clawd leans in and watches with eyes `right`, occasional stir with the right arm.

#### Season (Edit/Write)
- Right arm lifts to `high`, hand holds the shaker. Shaker tilts (two tilt frames) with a held beat, grains
  fall at different speeds and scatter as they hit the pan, Clawd's eyes follow the grains, small satisfied
  nod when the shake ends.

#### Serve (answer)
- Pull the table in (same eased pull as typing), plate on the table, the dish drops with squash on landing
  and a two-bounce settle, sparkles twinkle in staggered pairs, eyes switch to `happy`, both arms go `high`
  with a small hop (anticipation crouch, jump, land, repeat). The dish changes with each answer.

#### Smoke (error/refusal)
- Burnt lump in the pan, dark smoke with a heavier rise and a wider sway than steam. Clawd reacts in order:
  startle (`wide`, hop back), then cough (eyes `closed`, body shakes one column) while the arm fans the smoke
  away in a wave, then droop (shoulders low, hat dips).

#### Sleep
- Breathing at half rate with a deeper squash, hat slips down one row over time, a nose bubble that grows and
  shrinks, `zzz` rising with sway (small then big), and an occasional twitch of a leg or an eye flutter.

#### How animation is verified
- Pure function tests: for each mood, sample `actionAt` over a full loop and assert the keyframe order,
  hold lengths, that the loop closes (last frame leads into first), that props stay on the hand pixels, and
  that nothing leaves the canvas.
- A frame strip per mood (every tick of one loop in a row, rendered to HTML with the real font and
  screenshotted) is reviewed against the above before a mood is considered done.
- A live preview script plays any mood in the terminal at the real tick rate for a final feel check.

### Testing (test-first)
- New tests derived from behaviour, written and seen failing before the code:
  - rasterizer: each of the 64 sextant masks maps to the right glyph; two-colour cells; transparent cells;
    wide codepoints survive `encodeCells`.
  - **art constraint:** render every scene and pose over time; fail on any cell with more than two
    distinct values.
  - existing behaviour tests (`scene`, `actions`, `mood`, `table`, `steam`) keep their intent, with
    coordinates updated. The number of changed tests and why is reported to the user; none are deleted,
    skipped or loosened.
- Visual check: render poses to HTML with the real font and screenshot via browser; run a live terminal
  preview. `tools/gif.py` is only used if it is verified to draw sextants.
- Final: `claude plugin test` and `pytest tests/`, with real pass/fail counts.

## Out of scope
Sound, petting, compact mode, any change to the mood state machine's behaviour.
