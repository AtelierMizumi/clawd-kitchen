# Anime timing revamp, part 1: the v3 core and the typing mood

> **Amendment 2 (2026-10-18, supersedes amendment 1 and the style sections below).** The flat half-block Clawd read as
> too fat. Claude Code's own Clawd was decoded from its source (/opt/claude-code/bin/claude): quadrant glyphs, body
> rgb(215,119,87), eyes as holes showing black. Its model in quadrant pixels:
>
>     ...ooooooooooooo..
>     ...ookoooooookoo..
>     .ooooooooooooooooo
>     ...ooooooooooooo..
>     ...o.o.......o.o..
>
> It also has arms `down`/`up`/`one-up`, eyes `open`/`left`/`right`/`closed` (a `▂` lid)/`wink`, and turnaround
> drawings (`left-12` ... `back` ... `right-12`). Decided with the user:
> - **Grid: quadrants, as Claude Code draws Clawd.** The canvas is 160x32 quadrant pixels (80 columns, 16 rows);
>   the two-colours-a-cell rule and its test are back.
> - **Clawd is the official model at 2x**: every model pixel is 2x2 quadrant pixels (26x8 body, 2x2 eye holes, 4x2
>   arms, 2x2 legs in two pairs), only a flat chef hat added. A test scales him back down and compares him pixel for
>   pixel with the decoded model, arms down and up.
> - The animator adds what the model lacks, on model: squash (30x6) and stretch (26x10, taller at the same width so
>   the legs stay under the body), a half lid between open and closed, a happy caret, the hat's follow-through by
>   whole model pixels, and later the official turnaround drawings to turn toward the table or the stove.

> **Amendment 2026-10-18 (milestone 1 review; supersedes the grid and the style below).** The first model sheet,
> drawn on quadrants with outlines, rim light and shading, read as uncanny: quadrant pixels are about 1:1.8 tall, so
> pixel art on them looks like a high-resolution picture scaled down, and the extra layers became noise at this
> size. Decided with the user:
> - **Grid: half blocks** (`▀ ▄ █`), two square pixels per cell. The canvas is 80x32 pixels (80 columns, 16 rows).
>   Every cell holds two pixels, so the two-colours-a-cell rule holds by construction and its checks are dropped.
>   Eighth blocks stay for smooth edges.
> - **Style: flat, like Undertale.** One colour per thing, no outlines, no shading; dot eyes like Claude Code's own
>   Clawd. Clawd reads by his shape and expresses himself by how he moves.
> - Clawd: body 18x9 (squash 20x8, stretch 16x10), 2x2 arm stubs, four 1x2 legs, a 12x7 hat on top of the head;
>   20 px tall. Eyes are 3x2 cels: a 1x2 dot (open), a 1 px dot (half, focus), a 3 px line (closed), a caret (happy).
> - The rig moves parts a whole pixel at a time; look moves the eyes across by pixels; the hat may move either way.
> Sections below that speak of quadrants, outlines, ramps, rim light or the two-colour rule describe the rejected
> first attempt.

Supersedes the animation parts of `2026-10-17-sextant-revamp-design.md` for the moods it covers. That spec and its
code (the "v2" kitchen now in the working tree) stay as they are and keep running; v3 is built beside them.

## Why

The v2 animation (written by Gemini) shows almost none of the principles its spec lists:

- Timing is locked to even 80 ms ticks (12.5 fps, "twos" only). No ones, no thirds, no contrast between fast and
  slow, so a chop is five equal holds: mechanical, never snappy. The engine shows ~60 blits a second, so the limit
  was self-imposed.
- Clawd is a rigid 18x5 block. `squash` moves the block a row and lengthens the legs; arms are 1 px bent lines.
  There are no designed key poses, no silhouettes.
- No anticipation (the table pull: Clawd is identical for 7 frames while the table slides), no real
  follow-through, dead holds (stir is frozen for 640 ms), linear spacing everywhere, no smears.
- Staging bugs: flying slices cross the spice shelf; the served dish falls from above the shelf; `happy` eyes
  read as sad.

## Decisions (agreed with the user, 2026-10-18)

- Unicode text only (no Image renderer). Quadrant 2x2 glyphs plus eighth blocks (`▁..▇`, `▏..▉`), all BMP.
  Claude Code's own Clawd uses the same family (quadrants, and `▂` for its eyelid).
- Canvas 160x32 px = 80 columns x 16 rows. Sub-pixels are ~1:1.8 tall; art is authored in tall pixels.
- Style: bright colours like today, slightly cartoony anime outlines, fantasy video-game pixel art.
- Work order: one reference mood first, **typing**, built to the full standard, then the other eight follow it.
- Chops are driven by key presses (a behaviour change for the typing mood only).

## 1. Time core (24 fps)

- `frame = floor(ms * 24 / 1000)`, from real elapsed time, never from a tick count. The timer runs at ~20 ms and a
  blit is sent only when the encoded cells change, so holds cost nothing and lag drops frames instead of slowing
  the animation.
- **Exposure**: an X-sheet is a list of `[drawing, frames]`, frames a whole number >= 1 (ones = 1, twos = 2,
  threes = 3, fours = 4, eights = 8). Character, props and FX each have their own sheet.
- **Spacing charts**: inbetweens between two keys placed by halving toward the favoured key (1/2, 1/4, 1/8 ...),
  giving slow-in / slow-out. Positions are real numbers in canvas pixels; the encoder quantises.
- The real redraw interval is measured live with `$.clock.now` and reported before timings are final.

## 2. Drawings, rig and style

- A model sheet comes first (stand, eye set, resting arms, hat) and is approved by the user before any key is drawn.
  The working arm cels (reach, raise, smear, impact, hold, pull), the knife and the hat's squash cels come with
  milestone 2.
- Built at milestone 1: hat 10 px (8 above the head, its band covering the head's top 2 rows), body 28x12 (squash
  32x10, stretch 24x14), legs 4, so Clawd stands 24 px tall; eyes 4x6. Official silhouette (wide body, two eyes,
  short side arms, four legs) plus the chef hat, chibi proportions. No mouth except brief moments (cough, surprise).
- The rig moves parts by whole cells only. Eyes move across by a cell (`look`); looking up or down is an eye drawing.
  The hat may lift or slide by whole cells but is never pushed down into the head (its transparent edges would
  uncover the head and need a third colour in a cell): a hat falling onto the head is a squashed hat drawing.
- Palette: each hue is a 4-step ramp (highlight, base, shade, outline). Outline is a dark of the same hue
  (selective outline), never pure black. Hat cream with lavender shade. Anime eyes: dark, two cells tall, one
  white highlight pixel; `happy` is `^ ^` with blush.
- **Two colours per cell**: silhouette edges sit on cell boundaries with the 1 px outline on the inner side, so
  an edge cell is outline + body and the cell outside is background only. At curves the corner cell is outline +
  background (the outline thickens to 2 px, which reads round). `tools/build.py` reports offending cells; a test
  checks every cel and every typing frame.
- Rig = layered hand-drawn cels, back to front: back arm, legs, body, face, hat, front arm + held prop, FX.
  Body cels (neutral, squash, stretch, lean L/R) share anchors (neck, shoulders, hips, eye centre). Arm cels (rest,
  reach, raise, smear, impact, hold, pull) carry a hand anchor and grip angle. Knife cels at 0/30/60/90 degrees and
  a smear cel. The hat follows the neck anchor 1-2 frames late with an overshoot (automatic follow-through). Eyes
  run on their own sheet (blinks on ones while the body is on twos).
- Sheets extend `sprites/*.txt`: ramp declarations and `@anchor name x,y` in frames; `build.py` emits generated data.

## 3. Renderer and the typing mood

### Renderer
- Layout (80 x 16): wall shelf top-left, prep-table zone, Clawd, stove with pan and pot on the right.
- Depth, back to front: wall/shelf, stove, back arm, Clawd, table (hides his feet), food on the board, front arm
  and knife, FX. Flying slices never overlap the shelf rows (tested).
- Encoder, two passes: quadrants for all detail; eighth blocks for cells crossed by exactly one edge of a
  "smooth" object (table, pan, lid, eyelid, board) holding two colours: the glyph follows the real fractional edge,
  fg/bg swapped when the solid side is right or top. The table's wood grain is horizontal stripes so its interior
  does not shimmer while it slides. The default colour as fg is the terminal's default *foreground*, so the swap is
  impossible against the empty background: a right or top edge facing it uses only `▕ ▐ █` / `▔ ▀ █` (0, 1/8,
  1/2, 1), rounded to the nearest.
- Narrow terminals: >= 80 columns full scene; 48-79 cropped around Clawd and the board; < 48 hidden.

### Typing X-sheet (f = frames at 24 fps)

A. Pull the table, ~27 f:

| Beat | f | Exposure | Action |
|---|---|---|---|
| Notice | 3 | 1 + hold 2 | eyes snap left, hat bounces |
| Anticipation | 6 | twos | lean right (stretch), both arms reach left, slow-in to the extreme |
| Tension | 2 | hold | extreme held |
| Tug 1 | 3 | ones | body snaps; middle frame is a smear; table ~60 % of the way, spacing favouring the end |
| Recoil | 4 | twos | overshoot, hat lags and overshoots |
| Tug 2 | 3 | ones | smaller; table to ~95 % |
| Settle | 6 | twos/threes | table eases the last eighths and bumps in; food jiggles 1 f; Clawd straightens |

B. One chop, 14 f:

| Beat | f | Exposure | Action |
|---|---|---|---|
| Raise | 4 | twos | knife up and back, body stretch, eyes `focus` |
| Hang | 2 | hold | top of the stroke |
| Strike | 1 | ones | smear cel |
| Impact | 1 | ones | body squash, knife in the food, 2-3 px white spark, board dips an eighth |
| Hit-stop | 2 | hold | frozen on the impact |
| Kick | 1 | ones | slice leaves |
| Recover | 3 | threes | ease out, hat follow-through |

- The slice flies on its own sheet on ones (~8 f), slowing near the apex, lands on the pile next to the knife with a
  1 f squash and a 2 f bounce.
- Raise drawings A and B alternate; Recover varies +-1 f by a fixed sequence (deterministic).
- Every 4th chop is a power chop: 6 f anticipation, longer smear, 3 f hit-stop.
- Changing ingredient (meat, cucumber, carrot), ~16 f: the knife sweeps the pile right (smooth eighths), the new one
  pops in on ones (small, too big, right size). Meat sinks heavily, cucumber rolls, carrot bounces.

### Key-driven chops
- Every `prompt.edit` that inserts text (`inputText !== ''`) asks for one chop, whatever its length. With an IME
  in preedit mode (fcitx5 Lotus) a word arrives on commit (space), so that is one chop. A paste (an edit with no
  `key`) asks for a power chop.
- Deletions and cursor moves do not chop.
- A queue of at most 2; further requests while full are dropped. A request arriving before the current chop
  ends cuts its Recover, and the next chop plays the **quick chop**, 8 f: raise 2 (ones), strike 1, impact 1,
  hit-stop 1, kick 1, recover 2.
- Every 4th chop actually played is a power chop.
- No keys: Clawd holds the knife ready (low raise, breathing, eyes on the board); after ~1.5 s without a request
  he lowers it to rest.
- Requests during the pull queue (still at most 2) and play once the table has arrived.
- This is a pure state machine `(state, event, ms) -> state`; drawing is `f(state, ms)`.

### Running beside v2
`/clawd v3` switches the whole band to the v3 scene (80 x 16) and the typing mood; `/clawd v2` switches back. The
v2 kitchen and its tests stay untouched until all nine moods exist in v3.

## 4. Verification

Tests written first and seen failing for the right reason:
1. Time: exposure frames are whole numbers >= 1; frame from ms including very large ms; spacing charts land on
   the halving positions and favour the right end.
2. Encoder: all 16 quadrant masks; eighth glyphs follow the fractional edge with fg/bg swapped when needed; a cell
   needing three colours degrades deterministically and is reported.
3. Art: no cel of the model sheet and no typing frame has a cell over two colours; flying items never overlap the
   shelf rows; the knife sits on the hand anchor.
4. Typing X-sheet: beat order and frame counts as in the tables; every 4th chop is a power chop; the slice slows
   near its apex.
5. Key chops: insert chops, delete and move do not, paste is a power chop, queue max 2, an early request leads to
   a quick chop, 1.5 s without keys lowers the knife, requests during the pull wait.

Visual: frame strips (model sheet, pull, chop, power chop, quick chop, ingredient change), each frame labelled with
its frame number and exposure; live check on Konsole through `/clawd v3` with hot reload, typing Vietnamese through
Lotus; the measured redraw interval reported.

Milestones, each approved by the user before the next: (1) model sheet and palette, (2) chop key poses
(anticipation and impact), (3) the whole typing mood live.

## Out of scope
The other eight moods, sound, petting, compact mode.

## Idle (done ahead of the typing mood, at the user's request)

`hooks/v3/idle.ts`, three layers on their own 24 fps sheets, looping every 720 frames (30 s); every sheet divides the
loop:
- Breath: long rests; the in-breath body (`inhale`, the head half a model pixel higher) held 32 or 44 frames. The hat
  keeps its place for 2 frames as the head rises, then catches up; on the way down it hangs 2 frames and lands 1 px
  into the head for 2 frames.
- Blink: half 1, closed 2, half 1, after open holds of 70, 96, 52 and 126 frames.
- Fidgets at gaps of 150, 200, 140 and 230 frames, the first 90 frames in: an eye dart to the pan (30 f), a hop
  (crouch 3 f, launch stretched on ones, lift 2, 4, 5, a 4-frame hang with arms up, fall, a squash landing, the hat
  lagging throughout), a double take toward the table (24 f, back 8 f, again 14 f), and a stretch (crouch 4 f, up
  with the hat 2 px behind, 14 f held with eyes closed, settle through a squash). A hat adjust was tried first and
  dropped: the model's arms-up drawing does not reach the hat, so the hat seemed to lift itself.
- Only an open eye looks: closed lids and happy carets stay put. Clawd can be lifted off the floor by whole pixels.

## Typing mood as built, the hat rule and the detail pass

- `hooks/v3/chop.ts`: the pull (27 f), chop (14 f, recover 3/4/3/2 by a fixed sequence, raise drawings alternating),
  quick chop (8 f), power chop (24 f) and the key-driven state machine exactly as in section 3; a request that starts the
  pull counts in the queue of two; a quick chop is cut after its kick, so a burst runs 6 frames apart; the 4th chop played
  is power even inside a burst. `classifyEdit`: typed text (with a key) is a chop; with no key a short insertion is an IME
  commit (a chop) and a long one (>= 20 chars) or one with a newline is a paste (power). The table waits parked at the
  left (16 px away), and Clawd steps toward it and holds its edge while it comes.
- **The hat never sinks into the head.** A positive `hat.y` is a *pressed* hat (the `hat_squash` drawing: shorter, wider,
  in place on top of the head); a negative one floats the hat up by whole model pixels (even), never a half pixel. The
  chop presses it as the head shoots up, floats it through the hang, the strike and the hit-stop (inertia), and lands
  it pressed in the recover; the breath and the hop follow the same rule.
- **Detail without a third colour.** The room is painted (a wall of quiet tiles, a window, floor boards, a shadow under
  Clawd that shrinks as he lifts off, steam over the pan). Props are drawn in 2x2 blocks (`@scale 2`) and `@shade` lights
  the top edge and darkens the bottom edge of each block, so a cell keeps two colours. The hat has a bright top,
  pleats, a shaded underside and a two-tone band. Clawd himself stays on model and flat.
- Not built: ingredient change (the pile wraps instead), board dip, body smears, narrow-terminal crop.

## The moods of the turn (v3)

Added after the typing mood, at the user's request: `hooks/v3/moods.ts`, one pure function of the frames since the mood
began, for the seven moods Claude Code's events drive (`moodOf`): thinking (a phone held up beside his face in the right hand, seen from the side: its lit screen faces him and scrolls on threes,
we see the slate back with the camera; his eyes on it, a glance away to think, a blink; a comic thought bubble grows over the
hat: a small bubble, a bigger one, a growing cloud, then the cloud with its dots coming one at a time; a 96 f loop), simmer (a slow stir, a
spoon a, b, c, b of 6 f each, bubbles popping, content eyes), stir (the same in 8 f, leaning into it, the soup spitting),
season (a shaker jerked four times on twos, flakes falling a block per two frames into the soup, a happy flourish),
serve (crouch, spring, the plate held high 24 f with sparkles and a floating hat, a bow, held at the chest; one of three
dishes by the answers served), smoke (the burnt pot, plumes of two sizes, three coughs, fanning with the arms) and
sleep (a yawn and stretch, then a 72 f breath, Zs floating up and left over the bare wall). The kitchen was re-laid so
the stove stands right by his right arm (columns 44..60, the pot on its left burner), as the table does by his left:
no walking between stations. New rig parts: `tool` (the right arm holding a spoon, shaker or plate, set from the
neutral body's right edge like the knife, never with a lifted body). While the table is going back after typing the
mood waits for it (the stage starts its clock when the table is away). Keys pressed outside the typing mood chop
nothing. The knife arm lifts with him now: on his toes the shoulder rises, the arm gets shorter and the knife stays over
the food (`MAX_LIFT` per drawing).
