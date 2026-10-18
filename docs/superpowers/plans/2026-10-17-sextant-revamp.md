# Sextant Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.


> **Amendment 2026-10-17 (supersedes every sextant / 2x3 mention below).** `RasterProps.cells` in the Claude
> Code plugin types says a code point must be "one printable width-1 BMP character", or the whole tree is
> refused. Sextants (U+1FB00..) and octants are outside the BMP, so the grid is **quadrant, 2x2 pixels per
> cell** (U+2596..U+259F plus the half blocks). Sub-pixels are about 1:1.8 (tall), measured from the user's
> terminal (10.3 px per column, 18.8 px per line). Vertical resolution is unchanged from the half-block scene;
> horizontal doubles. Consequences: scene = 104 x 16 px (+ `FX_ROWS * 2` px on top); `CELL_W = CELL_H = 2`;
> `pxToDots(x, y) = [x, 2 * y]`; the two-colour rule applies to 2x2 cells; old art maps by doubling x.
> The art-constraint test is strict for Clawd over the whole rig and for static props, and a budget plus a
> behavioural "eyes survive encoding" test for whole scenes (moving bits cannot always avoid a third colour).

**Goal:** Replace the half-block scene with a sextant (2x3 per cell) scene and hand-redrawn art, and rebuild every Clawd animation as authored keyframes with a richer pose rig.

**Architecture:** `raster.ts` gets a sextant encoder; the pixel `Canvas` stays the shared abstraction, but a cell is now 2 px wide and 3 px tall. Sprites stay plain-text sheets compiled by `tools/build.py`. Motion moves out of `actions.ts` into one file per mood under `hooks/lib/motion/`, all built on a small keyframe sampler. `mood.ts`, `table.ts` and the event wiring in `register.tsx` keep their behaviour.

**Tech Stack:** TypeScript on the Claude Code plugin runtime (`claude plugin test`, `claude-code/testing`), Python 3 + Pillow + pytest via `uv` for the sprite tools.

**Spec:** `docs/superpowers/specs/2026-10-17-sextant-revamp-design.md`

## Global Constraints

- Grid: sextant, 2x3 px per cell. Sextant glyphs U+1FB00..U+1FB3B, plus space, `▌` (U+258C, left column), `▐` (U+2590, right column), `█` (U+2588) for the four patterns the block omits.
- At most two distinct values per cell, where transparent (DEFAULT) counts as a value. Shipped art and every animation frame must satisfy this.
- Scene stays 52 columns wide (104 px) and 8 cell rows tall (24 px) plus `FX_ROWS = 1` (3 px) of braille effects on top.
- Redraw cadence: `TICK_MS = 80` while a mood is active; every 4th tick (`IDLE_EVERY = 4`) when idle or asleep. Keyframe holds are multiples of `TICK_MS`.
- Motion is held keyframes, never continuous easing.
- `mood.ts` events, triggers and constants do not change. `table.ts` behaviour does not change.
- Test-first (CLAUDE.md): write the test, see it fail for the stated reason, then implement. Never edit, skip, delete or loosen a test to make it pass. Baseline before this work: `claude plugin test` = 206 pass / 0 fail over 11 files; `pytest tests` = 12 pass. Report final counts and every test that changed or was removed, with the reason.
- Commits only when the user has asked for them. When they have, end the message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `*.docx *.pdf *.xlsx *.pptx *.zip` or secrets.
- Verification commands: `claude plugin test`, `uv run --with pytest --with pillow pytest tests -q`, `python3 tools/build.py`.

## Review Focus

Inputs and conditions the spec implies but no feature task exercises on its own; each has its test in the task named.

1. A canvas whose width or height is not a multiple of the cell (2 or 3) must pad with transparent pixels, not crash or shift (Task 2).
2. A cell that needs three or more colours must degrade deterministically and never throw; shipped art never triggers it (Tasks 2, 4).
3. `actionAt` at `t = 0` and at a very large `t` (a session open for days) returns finite coordinates inside the canvas (Task 7).
4. The table is at a fractional `tableX` mid-slide: everything on it draws on whole pixels with no gaps or doubled columns (Task 6).
5. Every combination of `armL`, `armR`, `legs` and `eyes` keeps held props on the hand pixel and inside the canvas (Task 5).

---

## File structure

- `hooks/lib/raster.ts` (modify): sextant `toCells`, `overColoured`, `pxToDots`, grid constants.
- `hooks/lib/steam.ts` (modify): unchanged behaviour; only the caller's coordinate conversion changes.
- `hooks/lib/clawd.ts` (rewrite): new `Pose` rig, `drawClawd`, `handAnchor`.
- `hooks/lib/motion/keyframes.ts` (create): `TICK_MS`, `Keyframe<T>`, `sampleTrack`.
- `hooks/lib/motion/{idle,typing,thinking,stir,simmer,season,serve,smoke,sleep}.ts` (create): one pure function per mood returning `{ pose, action }`.
- `hooks/lib/actions.ts` (modify): `Action` type, `NONE`, dispatcher `actionAt` that delegates to `motion/*`.
- `hooks/lib/scene.ts` (modify): composition on the new grid; props follow hand anchors.
- `hooks/register.tsx` (modify): `COLUMNS = width / CELL_W`, import `TICK_MS`.
- `sprites/{palette,clawd,kitchen}.txt`, `sprites/scenes.json` (rewrite): hand-drawn art on the new grid.
- `tools/{frames.ts,gif.py,strip.py,live_preview.ts}` (modify/create): previews that understand sextants.
- Remove: `hooks/lib/quadrant.ts`, `hooks/lib/clawd_v2.ts`, `hooks/quadrant.test.ts`, `hooks/clawd_v2.test.ts`, `tools/preview_revamp.py`.
- Tests: `hooks/{raster,art,clawd,keyframes,scene,actions}.test.ts` plus one `hooks/motion.<mood>.test.ts` per mood file; `tests/test_sprites.py`.

---

### Task 1: Remove the quadrant experiment

**Files:** Delete the five files listed under "Remove". Modify `tools/gif.py` only if it imports nothing removed.

**Interfaces:** Produces a tree where the only rasterizer is `raster.ts`.

- [ ] **Step 1:** Run `claude plugin test`; note the count (206) so the drop from deleting `quadrant.test.ts` and `clawd_v2.test.ts` is explained in the final report.
- [ ] **Step 2:** `git rm` the five files; `rg "quadrant|clawd_v2" hooks tools tests` must return nothing except `tools/gif.py` quadrant tables (replaced in Task 8).
- [ ] **Step 3:** Run `claude plugin test`. Expected: all remaining tests pass; count = 206 minus the removed tests.

### Task 2: Sextant encoder

**Files:** Modify `hooks/lib/raster.ts`, `hooks/raster.test.ts`.

**Interfaces:**
- Produces: `CELL_W = 2`, `CELL_H = 3`; `toCells(c: Canvas): Uint32Array` (cells of `[codepoint, fg, bg]`, `Math.ceil(width/2)` columns by `Math.ceil(height/3)` rows); `sextantGlyph(mask: number): number` for mask 0..63 (bit0 top-left, bit1 top-right, bit2 mid-left, bit3 mid-right, bit4 bottom-left, bit5 bottom-right); `overColoured(c: Canvas): { col: number; row: number }[]`; `pxToDots(x: number, y: number): [dotX: number, dotY: number]` = `[x, Math.round((y * 4) / 3)]`.
- Consumes: existing `Canvas`, `DEFAULT`, `braille`, `overlayFx`, `encodeCells`.

- [ ] **Step 1: Write failing tests** replacing the half-block expectations in `raster.test.ts` (kept intent, new grid), named:
  - `sextantGlyph maps all 64 masks`: 0 -> space, 21 -> 0x258C, 42 -> 0x2590, 63 -> 0x2588, 1 -> 0x1FB00, 62 -> 0x1FB3B, 22 -> 0x1FB14, 43 -> 0x1FB28; all 60 remaining masks are distinct and inside 0x1FB00..0x1FB3B.
  - `empty cell is a space on default colours`.
  - `one colour fills the mask`: pixels (0,0),(1,0),(0,1) in colour A on a 2x3 canvas -> mask 7 glyph, fg A, bg DEFAULT.
  - `two opaque colours: fg is the colour of the top-left sub-pixel, bg the other`.
  - `all six the same colour is a full block`.
  - `a canvas of odd size pads with transparent pixels`: 3x4 canvas -> 2 columns x 2 rows of cells.
  - `three colours in one cell degrade without throwing`: the two most frequent values win; ties go to the value of the earlier sub-pixel in row-major order; `overColoured` reports that cell.
  - `encodeCells keeps codepoints above 0xFFFF`: round-trip through base64 and `Uint32Array`.
  - existing `draw`, `braille`, `overlayFx` tests unchanged.
- [ ] **Step 2:** Run `claude plugin test hooks/raster.test.ts`. Expected: FAIL (`sextantGlyph` / `overColoured` / `pxToDots` not defined, old half-block cell assertions fail).
- [ ] **Step 3:** Implement. Glyph index for masks other than 0, 21, 42, 63 is `0x1FB00 + mask - 1 - (mask > 21 ? 1 : 0) - (mask > 42 ? 1 : 0)`. A cell with exactly one opaque colour and transparent pixels uses that colour as fg on DEFAULT; two opaque colours use fg = top-left's colour.
- [ ] **Step 4:** Run the file again. Expected: PASS.
- [ ] **Step 5 (gate, needs the user):** With a throwaway `claude --plugin-dir .` run, the band must show a small sextant test pattern correctly in Claude Code's real terminal. Ask the user to confirm once; if astral codepoints do not render, stop and report before Task 3.

### Task 3: Scene geometry and effects coordinates

**Files:** Modify `sprites/scenes.json` (new `width: 104`, `height: 24`, coordinates rescaled as placeholders to be refined in Tasks 6-7), `hooks/lib/scene.ts`, `hooks/register.tsx`, `hooks/scene.test.ts`.

**Interfaces:**
- Produces: `renderScene` returns a canvas of `scene.width` by `scene.height + FX_ROWS * CELL_H`; `sceneCells` converts each steam source with `pxToDots`; `register.tsx` uses `COLUMNS = DATA.scenes[SCENE].width / CELL_W`.
- Consumes: Task 2 exports.

- [ ] **Step 1: Write failing tests** in `scene.test.ts`: `canvas has the scene size plus the effects rows on top` now asserts `height + FX_ROWS * 3`; `steam rises above every steam source within a cell of it` uses cell coordinates derived from `pxToDots`; `sceneCells has exactly width/2 columns`. Existing prop and Clawd-offset tests keep their intent.
- [ ] **Step 2:** Run `claude plugin test hooks/scene.test.ts`. Expected: FAIL on canvas height and column count.
- [ ] **Step 3:** Implement the geometry change; steam and smoke sources pass through `pxToDots(x, y + FX_ROWS * CELL_H)`.
- [ ] **Step 4:** Run `claude plugin test`. Expected: all pass (art is still old half-block data at this point; acceptable because `build.py` is not rerun).

### Task 4: Art-constraint harness and sprite-sheet checks

**Files:** Create `hooks/art.test.ts`; modify `tests/test_sprites.py`, `tools/sprites.py`.

**Interfaces:**
- Produces: `hooks/art.test.ts` rendering, for every mood and for the sampled times `t = 0, TICK_MS, 2*TICK_MS ... 12 s`, the full scene canvas and failing when `overColoured` is non-empty; every frame in `DATA.frames` has width and height in the 2x3 grid's budget (Clawd body 18 wide x 8 tall max).
- Consumes: Tasks 2-3, `actionAt`, `renderScene`.

- [ ] **Step 1: Write the test** `no cell needs more than two colours in any mood at any sampled time`, one `test` per mood, failure message names mood, time, column and row. Add pytest `every frame row uses only palette keys` already exists; add `no frame is wider than the scene`.
- [ ] **Step 2:** Run `claude plugin test hooks/art.test.ts`. Expected: FAIL (old art drawn on the new grid collides) which proves the harness detects violations. If it unexpectedly passes, assert the harness by building a canvas with a three-colour cell and expecting it to be flagged.
- [ ] **Step 3:** No implementation here: the test goes green only when Tasks 5-7 finish. Mark the file's mood tests `test` as written; do not skip them.

### Task 5: Clawd rig and art

**Files:** Rewrite `sprites/clawd.txt`, rewrite `hooks/lib/clawd.ts`, rewrite `hooks/clawd.test.ts`; adjust `sprites/palette.txt` (add outline and blush keys if needed, keep existing keys stable).

**Interfaces:**
- Produces:
  - `type Pose = { eyes: 'open'|'half'|'closed'|'left'|'right'|'up'|'down'|'wide'|'happy'; armL: Arm; armR: Arm; legs: 'stand'|'tapL'|'tapR'|'step'|'hop'; lean: -1|0|1; squash: -1|0|1; hat: number; glow: number }` where `Arm = 'rest'|'lift'|'high'|'out'|'forward'|'hold'`.
  - `drawClawd(c: Canvas, x: number, y: number, pose: Pose): void`.
  - `handAnchor(pose: Pose, side: 'L'|'R'): [dx: number, dy: number]`, pixel offsets from Clawd's origin of the hand's grip pixel.
  - `CLAWD_WIDTH`, `CLAWD_HEIGHT`, `HAT_HEIGHT`, `idlePose(t)` removed (moved to `motion/idle.ts`).
- Art: body about 18 x 8 px with highlight row, base, shadow row and a darker outline; chef hat with pleat shading and band; separate arm, forearm, hand, leg and eye sprites per state so poses need no new drawings. Same silhouette and colours as the current Clawd (terracotta, white hat).

- [ ] **Step 1: Write failing tests** in `clawd.test.ts`: `each eye state paints a distinct pixel pattern`; `blink states close monotonically`: open, half, closed have strictly fewer eye pixels; `lean shifts head and hat together`; `squash +1 lowers the head by one row and keeps the feet row fixed`; `hat offset moves only the hat`; `glow lights the top rows from base towards highlight`; `handAnchor stays inside the canvas for every arm x leg x eye combination` (review focus 5); `drawClawd draws nothing outside the canvas at the edges`.
- [ ] **Step 2:** Run `claude plugin test hooks/clawd.test.ts`. Expected: FAIL (new types and functions missing).
- [ ] **Step 3:** Draw the sprites in `sprites/clawd.txt`, run `python3 tools/build.py`, implement `clawd.ts`. Review the result with `tools/strip.py` (Task 8) as soon as it exists; until then use `tools/frames.ts` plus a pose dump.
- [ ] **Step 4:** Run `claude plugin test hooks/clawd.test.ts`. Expected: PASS.

### Task 6: Props, scene composition and the kitchen art

**Files:** Rewrite `sprites/kitchen.txt`, `sprites/scenes.json`; modify `hooks/lib/scene.ts`, `hooks/scene.test.ts`.

**Interfaces:**
- Produces: all existing frame names keep their names (stove, shelf, jars, rail, ladle, spatula, whisk, pan, pot_lid, pot_body, flame_a, flame_b, knife, knife_v, prep_back, prep_front, plate, meat/cucumber/carrot and their `_slice`/`_cut`, phone and `phone_ink_a|b`, bubble, dish_burger|egg|ramen, zee_small|zee_big, shaker, burnt), redrawn at 2x width and 1.5x height of the old sizes. Props that Clawd holds (knife_v, phone, shaker, pan handle) are placed by `scene.ts` from `handAnchor`, not from fixed scene coordinates.
- Consumes: Task 5 `handAnchor`, `drawClawd`.

- [ ] **Step 1: Write failing tests** in `scene.test.ts`: `held knife sits on the right-hand anchor of the pose`; `phone sits on the left-hand anchor`; `shaker sits on the right-hand anchor`; `everything on the table draws on whole pixels at a fractional tableX` (render at `tableX = -4.5` and `-4`; the non-null pixel columns of the food must be identical or differ by exactly one whole column, no empty column inside a sprite); `table front is drawn after Clawd and hides his feet`; existing prop-presence tests.
- [ ] **Step 2:** Run `claude plugin test hooks/scene.test.ts`. Expected: FAIL on anchor placement.
- [ ] **Step 3:** Redraw props in `kitchen.txt` (group by group: stove/shelf/jars/rail; pan/pot/flames; table and knife; foods and slices; phone and bubble; dishes and plate; zzz, shaker, burnt), refine coordinates in `scenes.json`, implement anchor placement in `scene.ts`. Run `python3 tools/build.py`.
- [ ] **Step 4:** Run `claude plugin test hooks/scene.test.ts hooks/art.test.ts`. Expected: scene tests PASS; art test passes for the frames drawn so far (it is fully green after Task 7).

### Task 7: Keyframe sampler and the motion modules

Split into the sub-tasks below. Shared interface (this sub-task first):

**Files:** Create `hooks/lib/motion/keyframes.ts`, `hooks/keyframes.test.ts`.

**Interfaces:**
- Produces: `TICK_MS = 80`; `type Keyframe<T> = { ms: number; value: T }` (`ms` = hold length, a positive multiple of `TICK_MS`); `trackLength(track): number`; `sampleTrack<T>(track: readonly Keyframe<T>[], t: number, opts?: { loop?: boolean }): T` (loop by default; clamps to the last value when `loop` is false).

- [ ] **Step 1: Write failing tests**: `returns the keyframe whose hold contains t`; `loops past the end`; `clamps when loop is false`; `t = 0 and t = trackLength give the first value when looping`; `very large t (1e12) stays finite and returns a keyframe value`; `rejects holds that are not multiples of TICK_MS` (throws at construction through a `track(...)` helper).
- [ ] **Step 2:** Run `claude plugin test hooks/keyframes.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement, then PASS.

Every mood below follows the same cycle: **tests first** (`hooks/motion.<mood>.test.ts`), run to see FAIL, implement `hooks/lib/motion/<mood>.ts` as a pure `(t: number, kitchen?: Kitchen) => { pose: Pose; action: Action }`, run to see PASS, then render a frame strip (Task 8) and review it. Every mood test file includes: `loop closes` (pose and action at `t` and `t + cycle` are equal), `finite and inside the canvas` at `t = 0` and `t = 1e9` (review focus 3), `holds are multiples of TICK_MS`, and `art test for this mood passes`.

#### 7a: Idle and sleep (`motion/idle.ts`, `motion/sleep.ts`)
- Idle: breath 3200 ms with the arm lift on the inhale and `squash: 1` on the exhale; blink as keyframes `open -> half -> closed -> half -> open` (every 4700 ms, every third blink doubled); fidgets from the list `look-left, look-right, look-pan-then-pot, foot-tap, stretch, hat-adjust, hop` at irregular gaps `FIDGET_GAPS_MS = [7200, 9600, 6800, 11200]` (cycled), each at most 1600 ms.
- Sleep: breath at half rate with `squash` held longer, hat offset sliding one row down over the cycle, a nose bubble (an `Action` field `bubble: { size: 0|1|2 } | null`) growing and shrinking, `zee` rising with sway as now, an occasional leg twitch and eye flutter.
- Tests: `blink is open, half, closed, half, open in order`; `a double blink happens once every three blinks`; `fidget gaps are not all equal`; `no fidget longer than 1600 ms`; `sleep zee rises over four steps then restarts`; `nose bubble size sequence 0,1,2,1`.

#### 7b: Typing and serve (`motion/typing.ts`, `motion/serve.ts`)
- Typing pull: anticipation (lean away, arm `out`), 4 to 5 alternating tug steps with `lean` rocking, the table advancing with the shorter final steps via `table.ts`, then settle (hat dip and recover). Chop: `CHOP_MS = 400` (5 ticks), keyframes `up, mid, impact (squash +1, eyes down), kick, recover`; the slice flies a parabola (rise, one frame hang at the top, fall) and bounces one pixel on the pile; a different small nod for each of meat, cucumber, carrot. Note: the previous `CHOP_MS` was 240; this change is deliberate to fit 5 keyframes at 80 ms.
- Serve: same pull, then the dish drops with `squash` on landing and a two-bounce settle, sparkles in staggered pairs, eyes `happy`, `armL`/`armR` `high`, hop with anticipation crouch.
- Tests: `knife positions follow the five keyframes in order`; `slice apex is held for exactly one tick`; `the slice lands on the pile column for its cut index`; `each ingredient has a different nod keyframe`; `serve dish drop has two bounces`; `serve eyes are happy only after landing`; `table arrival still counts from sinceArrived`.

#### 7c: Thinking (`motion/thinking.ts`)
- Phone in `armL: 'hold'`; head tilts one pixel; swipe with a two-frame thumb overshoot and a two-row scroll; new dish pops with sizes small, big, normal; eyes sequence screen, bubble, stove; toss wind-up, release, parabola, and a landing reaction (three staggered splash drops, or lid pop with a double rattle).
- Tests: `thumb overshoots then settles`; `bubble is empty while swiping`; `dish pop sizes go small, big, normal`; `eyes visit screen, bubble, stove in order`; `the tossed bit is on the right hand anchor on release and on a parabola afterwards`; `splash drops start at different ticks`.

#### 7d: Stir, simmer, season, smoke (`motion/stir.ts`, `motion/simmer.ts`, `motion/season.ts`, `motion/smoke.ts`)
- Stir: crouch, grip the pan handle with `armL: 'hold'`, pan rises in three steps with the hat lagging, flames flare during the toss and shrink after, three bits on different arcs landing in staggered order with a one-row pan dip, eyes following the bits.
- Simmer: lid rattle with an irregular pattern, steam puffs both sides, bubbles popping at the rim, Clawd leans in with eyes `right`, an occasional stir with the right arm.
- Season: `armR: 'high'` holding the shaker, two tilt frames with a held beat, grains with different fall speeds scattering at the pan, eyes follow grains, a satisfied nod at the end.
- Smoke: burnt lump, heavier and wider smoke, then in order startle (`wide`, hop back), cough (eyes closed, body shakes one column) with the arm fanning, droop (hat down one row).
- Tests: `pan rises -1, -2, -3 then returns`; `three bits land in different ticks`; `flame is larger during the toss`; `lid rattle intervals are not constant`; `shaker tilt has a held keyframe`; `grains fall at three different speeds`; `smoke reactions occur in order startle, cough, droop`; `the held props stay on the hand anchors in every keyframe`.

#### 7e: Dispatcher
**Files:** Modify `hooks/lib/actions.ts`, `hooks/actions.test.ts`.
- `actionAt(mood, t, k)` delegates to the mood modules; `Action` gains `bubble`. Existing `actions.test.ts` expectations keep their intent with updated values; report which changed.
- [ ] Run `claude plugin test` after 7a to 7e. Expected: all motion tests and the art test PASS.

### Task 8: Preview and review tools

**Files:** Modify `tools/frames.ts`, `tools/gif.py`; create `tools/strip.py`, rewrite `tools/live_preview.ts`; modify `tests/test_sprites.py`.

**Interfaces:**
- Produces: `python3 tools/strip.py <mood> [--ms 3000] [--out preview/out/<mood>.png]` writing a contact sheet of one loop with one scene per tick, labelled by `t`; `tools/gif.py` glyph tables built from the same `sextantGlyph` mask rule (one source of truth: a pytest asserts that the Python table equals `sextantGlyph` output for all 64 masks via a node call); `tools/live_preview.ts <mood>` plays a mood in the real terminal at `TICK_MS`; all use `String.fromCodePoint`.

- [ ] **Step 1: Write failing tests** `tests/test_sprites.py::test_sextant_mask_table_matches_ts` and `test_strip_renders_every_mood` (runs `strip.py` per mood into a temp dir and asserts a non-empty PNG).
- [ ] **Step 2:** Run pytest. Expected: FAIL.
- [ ] **Step 3:** Implement, then PASS. Spend this task early (before the art in Tasks 5-7 is judged) if executing in order is inconvenient: tasks 5 to 7 use these tools to review.

### Task 9: Visual review and README

**Files:** Modify `README.md` (status line, a short "Fonts" note that sextant glyphs are needed, remove references to the old look), `NOTICE.md` if it mentions the grid.

- [ ] **Step 1:** For each mood, generate the strip, read the PNG, and check the spec's principles: anticipation and settle visible, hat lag, props on hands, no clipped colours. Fix art or keyframes (test-first for behaviour changes) until each mood reads well.
- [ ] **Step 2:** Render two frames with the real font in a browser: write the cells to a small HTML page (monospace font Adwaita Mono, per-cell fg/bg) and screenshot with the browser tool; compare to the PNG strip for glyph fidelity.
- [ ] **Step 3 (needs the user):** Run `claude --plugin-dir .` and have the user judge idle, typing, thinking and serve in the real band; collect adjustments.
- [ ] **Step 4:** Final verification: `claude plugin test`, `uv run --with pytest --with pillow pytest tests -q`, `python3 tools/build.py && git diff --stat hooks/gen/data.ts`. Report real pass, fail and skip counts, the count change versus the baseline (206 / 12), and the list of changed tests with reasons.
