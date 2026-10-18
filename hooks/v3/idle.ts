// Clawd v3 at rest, on 24 fps exposure sheets. Three layers play over each other, each on its own sheet:
//
// - The breath: long holds, the head rising half a model pixel on the in-breath. The hat follows a beat late (it keeps
//   its place for two frames as the head rises, then catches up), and when the head settles the hat hangs in the air
//   for two frames and lands with a small bounce into the head. Two breaths of different lengths, so it never ticks.
// - The blink: half, closed, closed, half, on ones, after open holds of uneven length.
// - The fidgets, at uneven gaps: eye darts toward the pan and the table (one-frame snaps, held), a little hop
//   (crouch, launch stretched on ones, a hang at the top with the model's arms-up drawing, a stretched fall, a squash
//   landing, the hat lagging all the way), and a stretch with an anticipation squash, a long held stretch and a settle.
//
// Every sheet's length divides the loop's, so the whole idle loops seamlessly every IDLE_LOOP_FRAMES.
import { pose } from './clawd'
import type { Pose } from './clawd'
import { sampleSheet, sheet, sheetLength } from './time'
import type { Sheet } from './time'

type Beat = Partial<Pose>

/** One breath: a rest of `rest` frames, the in-breath held `hold` frames, the hat lagging on the way up and down. */
const breath = (rest: number, hold: number): [Beat, number][] => [
  [{ body: 'neutral', hat: { x: 0, y: 0 } }, rest],
  [{ body: 'inhale', hat: { x: 0, y: 1 } }, 2], // the head rises and presses the hat: the squashed drawing
  [{ body: 'inhale', hat: { x: 0, y: 0 } }, hold],
  [{ body: 'neutral', hat: { x: 0, y: -2 } }, 2], // the head settles; the hat floats on, a model pixel up
  [{ body: 'neutral', hat: { x: 0, y: 1 } }, 2], // and lands, pressed a moment
]
const BREATH = sheet<Beat>(...breath(42, 32), ...breath(50, 44))

const blink = (open: number): [Pose['eyes'], number][] => [['open', open], ['half', 1], ['closed', 2], ['half', 1]]
const BLINK = sheet<Pose['eyes']>(...blink(70), ...blink(96), ...blink(52), ...blink(126))

export const FIDGETS = ['look-pan', 'hop', 'look-table', 'stretch'] as const
export type Fidget = (typeof FIDGETS)[number]

const FIDGET_SHEETS: Record<Fidget, Sheet<Beat>> = {
  // A dart to the pan on the right, held, and back.
  'look-pan': sheet<Beat>([{ look: 1 }, 30]),
  // A glance to the table on the left, a quick look back, and a second, shorter glance: a double take.
  'look-table': sheet<Beat>([{ look: -1 }, 24], [{ look: 0 }, 8], [{ look: -1 }, 14]),
  // Spacing up: 2, 4, 5, 5: fast off the ground, slowing into the hang. Down mirrors it, and lands on ones.
  hop: sheet<Beat>(
    [{ body: 'squash', hat: { x: 0, y: 0 } }, 3], // anticipation: crouch
    [{ body: 'stretch', lift: 2, hat: { x: 0, y: 2 } }, 1], // launch, stretched; the hat stays behind
    [{ body: 'neutral', lift: 4, hat: { x: 0, y: 1 } }, 2],
    [{ body: 'neutral', lift: 5, arms: 'up', hat: { x: 0, y: -2 } }, 4], // the hang at the top, arms up, the hat floating on
    [{ body: 'neutral', lift: 4, hat: { x: 0, y: -2 } }, 2], // falling; now the hat floats above
    [{ body: 'stretch', lift: 2, hat: { x: 0, y: -4 } }, 1],
    [{ body: 'squash', lift: 0, hat: { x: 0, y: -2 } }, 2], // landing
    [{ body: 'neutral', hat: { x: 0, y: 1 } }, 2], // the hat lands on the head
    [{ body: 'neutral', hat: { x: 0, y: 0 } }, 2],
  ),
  stretch: sheet<Beat>(
    [{ body: 'squash', hat: { x: 0, y: 0 } }, 4], // anticipation: crouch
    [{ body: 'stretch', arms: 'up', eyes: 'closed', hat: { x: 0, y: 2 } }, 2], // up fast; the hat lags behind
    [{ body: 'stretch', arms: 'up', eyes: 'closed', hat: { x: 0, y: 0 } }, 14], // the big held stretch
    [{ body: 'squash', arms: 'down', eyes: 'closed', hat: { x: 0, y: -2 } }, 2], // drop past rest: settle
    [{ body: 'neutral', hat: { x: 0, y: 1 } }, 2],
    [{ body: 'neutral', hat: { x: 0, y: 0 } }, 2],
  ),
}

/** Frames from one fidget's start to the next one's, in FIDGETS order; they add up to the loop. */
const GAPS = [150, 200, 140, 230]
/** The first fidget waits a few seconds into the idle, so Clawd does not stretch the moment he is left alone. */
const FIRST_FIDGET = 90
export const IDLE_LOOP_FRAMES = GAPS.reduce((a, b) => a + b, 0)

for (const s of [BREATH, BLINK] as Sheet<unknown>[]) {
  if (IDLE_LOOP_FRAMES % sheetLength(s) !== 0) throw new Error('every idle sheet must divide the loop')
}

/** The fidget playing on frame `f`, with the beat it asks for, or null. */
export const fidgetAt = (f: number): { name: Fidget; beat: Beat } | null => {
  const at = ((f % IDLE_LOOP_FRAMES) + IDLE_LOOP_FRAMES) % IDLE_LOOP_FRAMES
  let from = FIRST_FIDGET
  for (let i = 0; i < FIDGETS.length; i++) {
    const name = FIDGETS[i]!
    const s = FIDGET_SHEETS[name]
    if (at >= from && at < from + sheetLength(s)) return { name, beat: sampleSheet(s, at - from, { loop: false }) }
    from += GAPS[i]!
  }
  return null
}

/** Clawd at rest on frame `f`. */
export const idleAt = (f: number): Pose => {
  const at = ((f % IDLE_LOOP_FRAMES) + IDLE_LOOP_FRAMES) % IDLE_LOOP_FRAMES
  const fidget = fidgetAt(at)
  return pose({ ...sampleSheet(BREATH, at), eyes: sampleSheet(BLINK, at), ...fidget?.beat })
}

/** The breath alone on frame `f`: the body and the hat's lag. */
export const breathAt = (f: number): Beat => sampleSheet(BREATH, ((f % IDLE_LOOP_FRAMES) + IDLE_LOOP_FRAMES) % IDLE_LOOP_FRAMES)

/** The blink alone on frame `f`. */
export const blinkAt = (f: number): Pose['eyes'] => sampleSheet(BLINK, ((f % IDLE_LOOP_FRAMES) + IDLE_LOOP_FRAMES) % IDLE_LOOP_FRAMES)
