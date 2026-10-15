// Clawd, assembled from parts so one body can take many poses without
// changing shape: a breath that lights the top row, arms that lift on the
// inhale, eyes that blink and glance, and a foot that taps.
import { DATA } from '../gen/data'
import type { Canvas, Color } from './raster'
import { draw } from './raster'

export type Eyes = 'open' | 'closed' | 'left' | 'right' | 'up' | 'down'
export type Pose = { eyes: Eyes; arms: 'rest' | 'up'; legs: 'stand' | 'tap'; glow: number; reach?: number }

export const CLAWD_WIDTH = 13
export const CLAWD_HEIGHT = 7
/** Rows the chef hat adds above the body. */
export const HAT_HEIGHT = 4

export const BREATH_MS = 3200
export const BLINK_PERIOD_MS = 4700
export const BLINK_MS = 140
export const FIDGET_PERIOD_MS = 9000
export const FIDGET_MS = 1400
export const FIDGETS = ['look-left', 'look-right', 'tap', 'flutter'] as const

const BODY_X = 2
const ARM_Y = 2
const EYE_XS = [4, 8]
const LEG_XS = [3, 5, 7, 9]
const LEG_Y = 5

const { clawd_body: body, clawd_arm: arm, clawd_leg: leg, clawd_eye: eye, chef_hat: hat } = DATA.frames
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

export const drawClawd = (c: Canvas, x: number, y: number, pose: Pose): void => {
  draw(c, body, x + BODY_X, y)
  draw(c, hat, x + BODY_X + (body.width - hat.width) / 2, y - HAT_HEIGHT)
  const top = mix(BASE, LIGHT, pose.glow)
  for (let i = 0; i < body.width; i++) set(c, x + BODY_X + i, y, top)

  // Reaching with a knife: the left arm is raised, with a forearm up beside it and
  // the hand one pixel further out; the right arm rests.
  const raised = pose.arms === 'up'
  const leftY = y + ARM_Y - (raised || pose.reach !== undefined ? 1 : 0)
  const rightY = y + ARM_Y - (raised && pose.reach === undefined ? 1 : 0)
  draw(c, arm, x, leftY)
  draw(c, arm, x + BODY_X + body.width, rightY)
  if (pose.reach !== undefined) {
    for (let dy = pose.reach; dy <= ARM_Y - 1; dy++) set(c, x - 1, y + dy, BASE)
    set(c, x - 2, y + pose.reach, BASE)
  }

  LEG_XS.forEach((lx, i) => {
    const lifted = pose.legs === 'tap' && i === LEG_XS.length - 1
    if (lifted) set(c, x + lx, y + LEG_Y, SHADOW)
    else draw(c, leg, x + lx, y + LEG_Y)
  })

  const shift = pose.eyes === 'left' ? -1 : pose.eyes === 'right' ? 1 : 0
  const lift = pose.eyes === 'up' ? -1 : pose.eyes === 'down' ? 1 : 0
  for (const ex of EYE_XS) {
    if (pose.eyes === 'closed') set(c, x + ex, y + 2, SHADOW)
    else for (let dy = 1; dy <= 2; dy++) set(c, x + ex + shift, y + dy + lift, EYE)
  }
}

/** Clawd at rest, `t` ms into the idle loop. */
export const idlePose = (t: number): Pose => {
  const phase = (t % BREATH_MS) / BREATH_MS
  const glow = (1 - Math.cos(2 * Math.PI * phase)) / 2
  const pose: Pose = { eyes: 'open', arms: glow >= 0.5 ? 'up' : 'rest', legs: 'stand', glow }

  const within = t % FIDGET_PERIOD_MS
  if (within < FIDGET_MS) {
    const fidget = FIDGETS[Math.floor(t / FIDGET_PERIOD_MS) % FIDGETS.length]
    if (fidget === 'look-left') pose.eyes = 'left'
    else if (fidget === 'look-right') pose.eyes = 'right'
    else if (fidget === 'tap') pose.legs = Math.floor(within / 175) % 2 === 0 ? 'tap' : 'stand'
    else if (Math.floor(within / 140) % 4 === 1) pose.eyes = 'closed'
  }
  if (t % BLINK_PERIOD_MS < BLINK_MS) pose.eyes = 'closed'
  return pose
}
