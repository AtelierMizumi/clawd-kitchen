// Revamped High-Fidelity Quadrant Clawd Mascot and Easing System
// Renders Clawd with 2x horizontal resolution using Unicode quadrants.

import { DATA } from '../gen/data'
import { DEFAULT, createSubCanvas } from './quadrant'
import type { Canvas } from './quadrant'

export type EyeState =
  | 'center'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'blink'
  | 'squint'
  | 'closed'

export type ArmState = 'rest' | 'up' | 'reach' | 'toss' | 'phone' | 'shake'
export type LegState = 'stand' | 'tap_left' | 'tap_right' | 'jump'

export type EasedPose = {
  eyes: EyeState
  arms: ArmState
  legs: LegState
  bodyDy: number    // vertical sub-pixel offset
  hatDy: number     // secondary motion follow-through offset
  glow: number      // 0..1 breath glow intensity
  reach?: number    // knife reach
  flipEyes?: boolean
}

// Clawd palette
export const PALETTE = {
  body: 0xd77757,       // terracotta
  bodyLight: 0xe08f73,  // breath highlight
  bodyDark: 0xb55a3c,   // shadow
  eye: 0x221b18,        // deep charcoal
  hat: 0xf2f4f7,        // chef hat white
  hatShade: 0xd5d9e0,   // chef hat pleat shadow
  hatBand: 0x1f1a17,    // black band
}

/**
 * High-res Clawd body map (18 sub-pixels wide x 7 sub-pixels tall).
 * Coordinates:
 * x: 0..17
 * y: 0..6
 *
 * Eyes occupy x=4..5 and x=12..13 (left and right eye columns).
 * Arms extend at x=0..1 and x=16..17.
 * Legs are at columns x=3, 5, 12, 14.
 */

// Easing functions for animations
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t)

export const easeInQuad = (t: number): number => t * t

/**
 * Anticipation easing: dips down before launching upwards
 */
export const anticipateLaunch = (t: number): number => {
  if (t < 0.2) {
    // 0..0.2: crouch down (positive dy)
    return Math.sin((t / 0.2) * Math.PI) * 1.5
  }
  // 0.2..1.0: parabolic arc upward and landing
  const u = (t - 0.2) / 0.8
  return -Math.sin(u * Math.PI) * 4
}

/**
 * Draws the high-resolution Clawd onto a sub-pixel Canvas.
 * canvas: sub-pixel canvas (2 subpixels per cell)
 * ox, oy: sub-pixel anchor (top-left of Clawd)
 */
export const drawHighResClawd = (
  c: Canvas,
  ox: number,
  oy: number,
  pose: EasedPose,
  withHat = true
): void => {
  const setPx = (x: number, y: number, color: number) => {
    const px = ox + x
    const py = oy + y
    if (px >= 0 && px < c.width && py >= 0 && py < c.height) {
      c.px[py * c.width + px] = color
    }
  }

  const bodyColor = pose.glow > 0.5 ? PALETTE.bodyLight : PALETTE.body
  const dy = Math.round(pose.bodyDy)
  const hatDy = Math.round(pose.hatDy)

  // 1. Chef Hat (with secondary motion lag)
  if (withHat) {
    const hy = oy + dy + hatDy - 4
    const hx = ox + 4 // centered on 18px body (width 10)
    // Hat top puffs
    for (let x = 1; x <= 8; x++) {
      if (hx + x >= 0 && hx + x < c.width && hy >= 0 && hy < c.height) {
        c.px[hy * c.width + (hx + x)] = PALETTE.hat
      }
    }
    // Hat body
    for (let y = 1; y <= 3; y++) {
      for (let x = 0; x <= 9; x++) {
        const px = hx + x
        const py = hy + y
        if (px >= 0 && px < c.width && py >= 0 && py < c.height) {
          const isShadow = (x === 2 || x === 7) && y < 3
          c.px[py * c.width + px] = isShadow ? PALETTE.hatShade : PALETTE.hat
        }
      }
    }
    // Hat band
    for (let x = 1; x <= 8; x++) {
      const px = hx + x
      const py = hy + 3
      if (px >= 0 && px < c.width && py >= 0 && py < c.height) {
        c.px[py * c.width + px] = PALETTE.hatBand
      }
    }
  }

  // 2. Body shape (18 sub-pixels wide, 5 sub-pixels tall)
  // Row 0: Top edge (rounded corners: x=3..14)
  for (let x = 3; x <= 14; x++) {
    setPx(x, dy + 0, bodyColor)
  }

  // Row 1: Upper torso / Eyes level
  for (let x = 2; x <= 15; x++) {
    setPx(x, dy + 1, bodyColor)
  }

  // Row 2: Mid torso / Claws level
  for (let x = 1; x <= 16; x++) {
    setPx(x, dy + 2, bodyColor)
  }

  // Row 3: Lower torso
  for (let x = 2; x <= 15; x++) {
    setPx(x, dy + 3, bodyColor)
  }

  // Row 4: Base edge
  for (let x = 3; x <= 14; x++) {
    setPx(x, dy + 4, bodyColor)
  }

  // 3. Arms / Claws
  if (pose.arms === 'up') {
    // Both arms raised high
    setPx(0, dy + 0, bodyColor)
    setPx(1, dy + 0, bodyColor)
    setPx(16, dy + 0, bodyColor)
    setPx(17, dy + 0, bodyColor)
    setPx(0, dy + 1, bodyColor)
    setPx(17, dy + 1, bodyColor)
  } else if (pose.arms === 'reach') {
    // Left arm reaching forward for knife
    setPx(0, dy + 2, bodyColor)
    setPx(1, dy + 2, bodyColor)
    setPx(16, dy + 2, bodyColor)
  } else if (pose.arms === 'shake') {
    // Right arm raised holding salt shaker
    setPx(1, dy + 2, bodyColor)
    setPx(16, dy + 1, bodyColor)
    setPx(17, dy + 0, bodyColor)
  } else {
    // Default rest arms
    setPx(0, dy + 2, bodyColor)
    setPx(1, dy + 2, bodyColor)
    setPx(16, dy + 2, bodyColor)
    setPx(17, dy + 2, bodyColor)
  }

  // 4. Eyes (sub-pixel precision!)
  // Left eye baseline: x=5, y=dy+1
  // Right eye baseline: x=12, y=dy+1
  let [lx, ly] = [5, dy + 1]
  let [rx, ry] = [12, dy + 1]

  if (pose.eyes === 'left') {
    lx -= 1
    rx -= 1
  } else if (pose.eyes === 'right') {
    lx += 1
    rx += 1
  } else if (pose.eyes === 'up') {
    ly -= 1
    ry -= 1
  } else if (pose.eyes === 'down') {
    ly += 1
    ry += 1
  }

  if (pose.eyes === 'blink' || pose.eyes === 'closed') {
    // Eyelid slit line
    setPx(lx, ly, PALETTE.eye)
    setPx(rx, ry, PALETTE.eye)
  } else if (pose.eyes === 'squint') {
    // Soft curved squint
    setPx(lx, ly, PALETTE.eye)
    setPx(rx, ry, PALETTE.eye)
    setPx(lx + 1, ly, PALETTE.bodyDark)
    setPx(rx + 1, ry, PALETTE.bodyDark)
  } else {
    // Full round vertical eye slit (2 sub-pixels high)
    setPx(lx, ly, PALETTE.eye)
    setPx(lx, ly + 1, PALETTE.eye)
    setPx(rx, ry, PALETTE.eye)
    setPx(rx, ry + 1, PALETTE.eye)
  }

  // 5. Four Legs (columns 3, 5, 12, 14)
  const legYs = [dy + 5, dy + 5, dy + 5, dy + 5]
  if (pose.legs === 'tap_left') {
    legYs[0] -= 1 // left leg lifted
  } else if (pose.legs === 'tap_right') {
    legYs[3] -= 1 // right leg lifted
  } else if (pose.legs === 'jump') {
    legYs[0] -= 1
    legYs[1] -= 1
    legYs[2] -= 1
    legYs[3] -= 1
  }

  setPx(3, legYs[0]!, bodyColor)
  setPx(5, legYs[1]!, bodyColor)
  setPx(12, legYs[2]!, bodyColor)
  setPx(14, legYs[3]!, bodyColor)
}

/**
 * Calculates high-res idle pose with smooth breath and blinks.
 */
export const highResIdlePose = (t: number): EasedPose => {
  // Breath cycle: 3200ms
  const breathPhase = (t % 3200) / 3200
  // Sine curve normalized to 0..1
  const breath = (Math.sin(breathPhase * Math.PI * 2 - Math.PI / 2) + 1) / 2

  // Blink cycle: 4700ms, blink duration: 160ms
  const blinkPhase = t % 4700
  let eyes: EyeState = 'center'
  if (blinkPhase < 120) {
    eyes = 'blink'
  } else if (blinkPhase < 160) {
    eyes = 'squint'
  }

  // Fidget cycle: 9000ms
  const fidgetPhase = t % 9000
  if (fidgetPhase > 3000 && fidgetPhase < 4500) {
    eyes = 'left'
  } else if (fidgetPhase > 6000 && fidgetPhase < 7500) {
    eyes = 'right'
  }

  // Follow-through hat lag
  const bodyDy = breath > 0.7 ? -1 : 0
  const hatDy = breath > 0.85 ? -1 : 0

  return {
    eyes,
    arms: breath > 0.6 ? 'up' : 'rest',
    legs: 'stand',
    bodyDy,
    hatDy,
    glow: breath,
  }
}

/**
 * Calculates high-res pan toss (stir) pose with anticipation and follow-through.
 */
export const highResStirPose = (t: number): { pose: EasedPose; panDy: number; flame: boolean } => {
  const STIR_CYCLE = 1200
  const phase = (t % STIR_CYCLE) / STIR_CYCLE

  let panDy = 0
  let bodyDy = 0
  let hatDy = 0
  let arms: ArmState = 'rest'
  let eyes: EyeState = 'right'

  if (phase < 0.15) {
    // Anticipation: crouch down slightly before tossing
    bodyDy = 0.5
    hatDy = 0
    panDy = 0
    arms = 'rest'
  } else if (phase < 0.35) {
    // Explosive launch upwards
    bodyDy = -1
    hatDy = 0.5 // hat lags downward due to inertia!
    panDy = -2
    arms = 'up'
    eyes = 'up'
  } else if (phase < 0.65) {
    // Apex hang time: food flies high, Clawd watches upward
    bodyDy = -0.5
    hatDy = -1 // hat catches up to apex
    panDy = -2
    arms = 'up'
    eyes = 'up'
  } else if (phase < 0.85) {
    // Fall back to stove
    bodyDy = 0
    hatDy = 0
    panDy = -1
    arms = 'rest'
    eyes = 'right'
  } else {
    // Settle
    bodyDy = 0
    hatDy = 0
    panDy = 0
    arms = 'rest'
    eyes = 'right'
  }

  return {
    pose: {
      eyes,
      arms,
      legs: arms === 'up' ? 'jump' : 'stand',
      bodyDy,
      hatDy,
      glow: 0.3,
    },
    panDy: Math.round(panDy),
    flame: panDy < 0,
  }
}
