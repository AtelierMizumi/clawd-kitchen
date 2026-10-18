// Clawd, assembled from parts so one body can take many poses without changing shape. Sizes are in
// quadrant pixels: two to a cell across, two down. The art is drawn on the cell grid (see sprites/clawd.txt),
// so poses move whole parts and keep every cell to two colours at most.
//
// Coordinates are relative to Clawd's origin: the left edge of his left arm, and the top row of his body.
import { DATA } from '../gen/data'
import type { Canvas, Color } from './raster'
import { draw } from './raster'

export type Eyes = 'open' | 'half' | 'closed' | 'left' | 'right' | 'up' | 'down' | 'wide' | 'happy'
/** An arm at rest, lifted a row, high with a forearm up, stretched out, or holding something at a hand row. */
export type Arm = 'rest' | 'lift' | 'high' | 'out' | 'hold'
export type Legs = 'stand' | 'tapL' | 'tapR' | 'step' | 'hop'
export type Pose = {
  eyes: Eyes
  armL: Arm
  armR: Arm
  /** The hand's row when that arm is `hold`, relative to the top of the body. */
  handL: number
  handR: number
  legs: Legs
  /** Toward the table or the stove, one cell (two pixels) at a time; body, hat and arms move, legs stay. */
  lean: -1 | 0 | 1
  /** 1 crouches (body and hat a row lower, legs shorter), -1 stretches (a row higher, legs longer). */
  squash: -1 | 0 | 1
  /** The hat's own offset in rows, positive lower: it lags the head. */
  hat: number
  /** 0 to 1: how much the breath lights the body's top row. */
  glow: number
}

export const poseOf = (p: Partial<Pose> = {}): Pose => ({
  eyes: 'open',
  armL: 'rest',
  armR: 'rest',
  handL: 2,
  handR: 2,
  legs: 'stand',
  lean: 0,
  squash: 0,
  hat: 0,
  glow: 0,
  ...p,
})

const { clawd_body: body, clawd_arm: arm, clawd_leg: leg, clawd_eye: eye, chef_hat: hat } = DATA.frames

export const CLAWD_WIDTH = 26
export const CLAWD_HEIGHT = 7
/** Rows the chef hat adds above the body. */
export const HAT_HEIGHT = 4

const ARM_W = arm.width
const BODY_X = ARM_W
const RIGHT_ARM_X = BODY_X + body.width
const ARM_Y = 2
const LEG_XS = [2, 6, 10, 14]
const LEG_Y = body.height
const FLOOR = CLAWD_HEIGHT - 1
const EYE_XS = [4, 12]
const LIFTED: Record<Legs, readonly number[]> = { stand: [], tapL: [0], tapR: [3], step: [0, 2], hop: [0, 1, 2, 3] }

const LIGHT = body.pixels[0] as Color
const BASE = body.pixels[body.width] as Color
const SHADOW = body.pixels[body.pixels.length - 1] as Color
const EYE = eye.pixels[0] as Color

const mix = (a: Color, b: Color, t: number): Color => {
  const k = Math.min(1, Math.max(0, t))
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * k) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

const set = (c: Canvas, x: number, y: number, color: Color) => {
  if (x >= 0 && x < c.width && y >= 0 && y < c.height) c.px[y * c.width + x] = color
}
const rect = (c: Canvas, x: number, y: number, w: number, h: number, color: Color) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(c, x + dx, y + dy, color)
}

/** The row an arm hangs from: a holding arm's shoulder lifts when the hand is high. */
const shoulderRow = (arm: Arm, hand: number): number =>
  arm === 'rest' || arm === 'out' ? ARM_Y : arm === 'lift' ? 1 : arm === 'high' ? 0 : hand <= -2 ? 0 : 1

const drawArm = (c: Canvas, x: number, y: number, side: 'L' | 'R', kind: Arm, hand: number): void => {
  const left = side === 'L'
  const row = y + shoulderRow(kind, hand)
  draw(c, arm, x + (left ? 0 : RIGHT_ARM_X), row)
  const outer = left ? x : x + RIGHT_ARM_X + ARM_W - 2
  const beyond = left ? x - 2 : x + RIGHT_ARM_X + ARM_W
  if (kind === 'out') rect(c, beyond, row, 2, 1, BASE)
  if (kind === 'high') rect(c, outer, row - 2, 2, 2, BASE)
  if (kind === 'hold') {
    const lo = Math.min(hand, shoulderRow(kind, hand))
    const hi = Math.max(hand, shoulderRow(kind, hand))
    rect(c, beyond, y + lo, 2, hi - lo + 1, BASE)
    rect(c, left ? beyond - 2 : beyond + 2, y + hand, 2, 1, BASE)
  }
}

/** Where a held prop sits: the end of the arm, in the same coordinates as the pose is drawn in. */
export const handAnchor = (pose: Pose, side: 'L' | 'R'): [number, number] => {
  const left = side === 'L'
  const kind = left ? pose.armL : pose.armR
  const hand = left ? pose.handL : pose.handR
  const shift = pose.lean * 2
  const outerX = left ? 0 : RIGHT_ARM_X + ARM_W - 1
  const [dx, dy] =
    kind === 'out'
      ? [left ? -2 : outerX + 2, ARM_Y]
      : kind === 'high'
        ? [outerX, -2]
        : kind === 'hold'
          ? [left ? -4 : outerX + 4, hand]
          : [outerX, shoulderRow(kind, hand)]
  return [dx + shift, dy + pose.squash]
}

export const drawClawd = (c: Canvas, x: number, y: number, pose: Pose): void => {
  const by = y + pose.squash
  const bx = x + pose.lean * 2
  const floor = y + FLOOR

  draw(c, body, bx + BODY_X, by)
  for (let i = 0; i < body.width; i++) set(c, bx + BODY_X + i, by, mix(BASE, LIGHT, pose.glow))

  // Eyes: the sprite's two-pixel block, shifted for a glance, shortened for a blink.
  const shiftX = pose.eyes === 'left' ? -2 : pose.eyes === 'right' ? 2 : 0
  const shiftY = pose.eyes === 'up' ? -1 : pose.eyes === 'down' ? 1 : 0
  for (const ex of EYE_XS) {
    const x0 = bx + BODY_X + ex
    if (pose.eyes === 'closed') rect(c, x0 - 1, by + 2, 4, 1, SHADOW)
    else if (pose.eyes === 'half') rect(c, x0, by + 2, 2, 1, EYE)
    else if (pose.eyes === 'wide') rect(c, x0, by + 1, 2, 3, EYE)
    else if (pose.eyes === 'happy') {
      // The arch sits in the cell-aligned pair of rows inside the body, so a crouch or stretch moves it up a row.
      const top = by + (pose.squash === 0 ? 2 : 1)
      rect(c, x0 + 1, top, 2, 1, EYE)
      set(c, x0, top + 1, EYE)
      set(c, x0 + 3, top + 1, EYE)
    } else draw(c, eye, x0 + shiftX, by + 1 + shiftY)
  }

  drawArm(c, bx, by, 'L', pose.armL, pose.handL)
  drawArm(c, bx, by, 'R', pose.armR, pose.handR)
  draw(c, hat, bx + BODY_X + (body.width - hat.width) / 2, by - HAT_HEIGHT + pose.hat)

  // Legs run from the body's foot to the floor, so a crouch shortens them and a stretch lengthens them;
  // a lifted leg stops a row short.
  const top = by + LEG_Y
  LEG_XS.forEach((lx, i) => {
    const bottom = LIFTED[pose.legs].includes(i) ? floor - 1 : floor
    for (let row = top; row <= bottom; row++) rect(c, x + BODY_X + lx, row, leg.width, 1, SHADOW)
  })
}
