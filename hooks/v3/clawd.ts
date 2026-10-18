// Clawd v3: Claude Code's own Clawd, on model, at twice its size (sprites/v3/clawd.txt), drawn from cels in layers
// (legs, arms, body, eyes, hat) placed by the anchors drawn into the sheet. A body is swapped as a whole drawing
// (squash, stretch) rather than moved, and the feet never move with it.
import { V3 } from '../gen/v3'
import { draw } from '../lib/raster'
import type { Canvas, Sprite } from '../lib/raster'

export type Body = 'neutral' | 'inhale' | 'squash' | 'stretch'
export type Eyes = 'open' | 'half' | 'closed' | 'wink' | 'happy'
export type Arms = 'down' | 'up'
/** Drawings of the left arm holding the knife; with one set, it takes the place of the left arm. */
export type Knife = 'rest' | 'ready' | 'raise1' | 'raise2' | 'raise3' | 'hang' | 'smear' | 'impact' | 'pull'
/** Drawings of the right arm holding a tool over the stove, or a phone; with one set, it takes the place of the right arm. */
export type Tool =
  | 'spoon_a' | 'spoon_b' | 'spoon_c' | 'shaker_hold' | 'shaker_up' | 'shaker_down' | 'plate_hold' | 'plate_up'
  | 'phone_0' | 'phone_1' | 'phone_2' | 'phone_3'
export type Pose = {
  body: Body
  eyes: Eyes
  /** Looking left (-1) or right (1): as on the original, the eyes move a model pixel that way and one up. */
  look: -1 | 0 | 1
  arms: Arms
  /**
   * The hat's own offset from the head, in quadrant pixels: follow-through. Across and up in whole model pixels (even:
   * a half pixel would cut its shaded rows and its sides across the cells and need a third colour); never down into
   * the head. A positive y is the hat pressed down by the head: the squashed hat drawing, in place on top of it.
   */
  hat: { x: number; y: number }
  /** How far the whole of him is off the floor, in whole pixels: a hop. */
  lift: number
  /** The right arm with a tool in its hand, in place of the plain arm; null for none. Not with a lifted body. */
  tool: Tool | null
  /** The left arm with a knife in its hand, in place of the plain arm; null for none. */
  knife: Knife | null
  /** How long the left arm is, in pixels: 4 is the model's stub; longer reaches out to the table. Even. */
  reach: number
  /** How far the whole of him has stepped across, in pixels (negative is left). Even, so the model stays on its grid. */
  dx: number
}

/**
 * How far he may be lifted with each drawing of the knife arm: on his toes the shoulder rises and the arm gets shorter,
 * while the knife stays over the food; so the drawing's arm must have a vertical stretch for the shoulder to rise
 * along. Whole blocks (two pixels) at a time. The drawings that stand on the board cannot be lifted.
 */
const MAX_LIFT: Record<Knife, number> = { rest: 0, pull: 0, impact: 0, ready: 4, raise1: 6, raise2: 8, raise3: 10, hang: 12, smear: 8 }

export const pose = (p: Partial<Pose> = {}): Pose => {
  const out: Pose = { body: 'neutral', eyes: 'open', look: 0, arms: 'down', hat: { x: 0, y: 0 }, lift: 0, knife: null, tool: null, reach: 4, dx: 0, ...p }
  if (!Number.isInteger(out.lift)) throw new Error(`Clawd lifts by whole pixels, not ${out.lift}`)
  if (!Number.isInteger(out.hat.y) || out.hat.x % 2 !== 0 || (out.hat.y < 0 && out.hat.y % 2 !== 0)) {
    throw new Error(`the hat moves across and up a model pixel at a time (a positive y only presses it), not (${out.hat.x}, ${out.hat.y})`)
  }
  if (out.knife && (out.lift % 2 !== 0 || out.lift > MAX_LIFT[out.knife])) {
    throw new Error(`with the knife arm '${out.knife}' he can be lifted by 0 to ${MAX_LIFT[out.knife]} pixels, in twos, not ${out.lift}`)
  }
  if (out.tool && out.lift !== 0) throw new Error(`a tool in the right hand and a lifted body do not go together (lift ${out.lift})`)
  if (!Number.isInteger(out.dx) || out.dx % 2 !== 0) throw new Error(`Clawd steps across a model pixel at a time, not ${out.dx}`)
  if (!Number.isInteger(out.reach) || out.reach % 2 !== 0 || out.reach < 4) throw new Error(`the arm is an even number of pixels, at least the model's 4, not ${out.reach}`)
  return out
}

type Frame = Sprite & { anchors?: Readonly<Record<string, readonly number[]>> }
const F = V3.frames as unknown as Record<string, Frame>
const anchor = (f: Frame, name: string): [number, number] => {
  const a = f.anchors?.[name]
  if (!a) throw new Error(`no anchor ${name}`)
  return [a[0]!, a[1]!]
}

const BODY: Record<Body, Frame> = { neutral: F.body!, inhale: F.body_inhale!, squash: F.body_squash!, stretch: F.body_stretch! }
const LEG_H = F.leg!.height
/** The legs' x from the middle of the body: the model's two pairs. */
const LEG_XS = [-13, -9, 7, 11]

/** The left arm reaching out: the model's stub drawn longer, a bar as thick as the stub, from its tip to the body. */
const drawReach = (c: Canvas, armL: Frame, x: number, y: number, reach: number): void => {
  const colour = armL.pixels[0]!
  const extra = reach - armL.width
  const bar: Sprite = { width: extra, height: armL.height, pixels: new Array<number | null>(extra * armL.height).fill(colour) }
  draw(c, bar, x - extra, y)
}

const shortened = new Map<string, Sprite>()
/** A knife arm for a body lifted by `lift` pixels: the arm's lower stretch cut off, its joint with the body moved up. */
const liftedArm = (name: string, cel: Frame, ky: number, lift: number): Sprite => {
  const key = `${name}:${lift}`
  const hit = shortened.get(key)
  if (hit) return hit
  const arm = cel.pixels[ky * cel.width + cel.width - 1]!
  const pixels = [...cel.pixels]
  for (let y = ky - lift + 2; y < cel.height; y++) for (let x = 0; x < cel.width; x++) if (pixels[y * cel.width + x] === arm) pixels[y * cel.width + x] = null
  // The joint: the arm's last block (two wide) on the lifted shoulder's rows.
  for (let y = ky - lift; y < ky - lift + 2; y++) for (let x = cel.width - 4; x < cel.width; x++) pixels[y * cel.width + x] = arm
  const out = { width: cel.width, height: cel.height, pixels }
  shortened.set(key, out)
  return out
}

/** The knife arms are drawn in blocks on the stage's cell grid, so they are placed from the shoulder's block, not a pixel. */
const BLOCK = 2

/** Draws Clawd with the middle of his body at `x` (an odd x puts the model on cell boundaries), standing on row `floor`. */
export const drawClawd = (c: Canvas, x0: number, ground: number, p: Pose): void => {
  const x = x0 + p.dx
  const floor = ground - p.lift
  const body = BODY[p.body]
  const bx = x - Math.floor(body.width / 2)
  const by = floor - LEG_H - body.height

  for (const lx of LEG_XS) draw(c, F.leg!, x + lx, floor - LEG_H)

  // Each arm's shoulder anchor sits just outside the body's.
  const armL = F[`arm_${p.arms}_l`]!
  const armR = F[`arm_${p.arms}_r`]!
  const [lax, lay] = anchor(armL, 'shoulder')
  const [rax, ray] = anchor(armR, 'shoulder')
  const [lsx, lsy] = anchor(body, 'shoulderL')
  const [rsx, rsy] = anchor(body, 'shoulderR')
  if (p.knife) {
    // The knife stays where the neutral body's shoulder is, whatever the body does (a squash is wider and covers the
    // end of the arm; a breath does not lift it), so it keeps its place over the food.
    const cel = F[`knife_${p.knife}`]!
    const [kx, ky] = anchor(cel, 'shoulder')
    const sprite = p.lift > 0 ? liftedArm(p.knife, cel, ky, p.lift) : cel
    draw(c, sprite, x - Math.floor(BODY.neutral.width / 2) - BLOCK - kx, ground - 6 - ky)
  } else {
    draw(c, armL, bx + lsx - 1 - lax, by + lsy - lay)
    if (p.reach > armL.width && p.arms === 'down') drawReach(c, armL, bx + lsx - 1 - lax, by + lsy - lay, p.reach)
  }
  if (p.tool) {
    // Like the knife, a tool keeps its place over the stove whatever the body does: set from the neutral body's right edge.
    const cel = F[p.tool]!
    const [tx, ty] = anchor(cel, 'shoulder')
    draw(c, cel, x + Math.floor(BODY.neutral.width / 2) - tx, ground - 6 - ty)
  } else {
    draw(c, armR, bx + rsx + 1 - rax, by + rsy - ray)
  }

  draw(c, body, bx, by)

  for (const side of ['eyeL', 'eyeR'] as const) {
    const name = p.eyes === 'wink' ? (side === 'eyeL' ? 'open' : 'closed') : p.eyes
    // Only an eye that is open can look: a lid line or a happy caret stays where it is.
    const looks = name === 'open' || name === 'half' ? p.look : 0
    const eye = F[`eye_${name}`]!
    const [ex, ey] = anchor(body, side)
    const [px, py] = anchor(eye, 'pupil')
    draw(c, eye, bx + ex - px + looks * 2, by + ey - py - (looks === 0 ? 0 : 2))
  }

  // The hat's base anchor is its bottom row's middle, set on the row above the head's neck anchor. Pressed by the head
  // (a positive offset) it is the squashed drawing in the same place; floating, the same drawing higher.
  const pressed = p.hat.y > 0
  const hat = pressed ? F.hat_squash! : F.hat!
  const [nx, ny] = anchor(body, 'neck')
  const [hx, hy] = anchor(hat, 'base')
  draw(c, hat, bx + nx - hx + p.hat.x, by + ny - 1 - hy + (pressed ? 0 : p.hat.y))
}
