// Spec for Clawd built from parts (hooks/lib/clawd.ts).
// The body never changes shape; life comes from a light "breath" on the top
// row, arms lifting 1px on the inhale, eyes, and small fidgets.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import {
  BLINK_MS,
  BLINK_PERIOD_MS,
  BREATH_MS,
  CLAWD_HEIGHT,
  HAT_HEIGHT,
  CLAWD_WIDTH,
  FIDGET_MS,
  FIDGET_PERIOD_MS,
  FIDGETS,
  drawClawd,
  idlePose,
} from './lib/clawd'
import type { Pose } from './lib/clawd'
import { createCanvas } from './lib/raster'

const LIGHT = 0xe8936f
const BASE = 0xd97757
const EYE = 0x2b1f1a
const SHADOW = 0xb35a3d
const rest: Pose = { eyes: 'open', arms: 'rest', legs: 'stand', glow: 1 }

const at = (c: ReturnType<typeof createCanvas>, x: number, y: number) => c.px[y * c.width + x]
const drawn = (pose: Pose) => {
  const c = createCanvas(CLAWD_WIDTH, CLAWD_HEIGHT)
  drawClawd(c, 0, 0, pose)
  return c
}
const opaqueCount = (c: ReturnType<typeof createCanvas>) => c.px.filter(p => p !== null).length

describe('drawClawd', () => {
  test('is 13×7: a 9×5 body, arms out 2px each side, legs 2px below', () => {
    expect([CLAWD_WIDTH, CLAWD_HEIGHT]).toEqual([13, 7])
    const c = drawn(rest)
    expect(at(c, 2, 0)).not.toBeNull()
    expect(at(c, 1, 0)).toBeNull()
    expect(at(c, 0, 2)).toBe(BASE)
    expect(at(c, 12, 2)).toBe(BASE)
  })

  test('has four legs', () => {
    const c = drawn(rest)
    const legs = [...Array(CLAWD_WIDTH).keys()].filter(x => at(c, x, 6) !== null)
    expect(legs).toHaveLength(4)
  })

  test('the body keeps its full height in every pose', () => {
    for (const pose of [rest, { ...rest, arms: 'up' }, { ...rest, legs: 'tap' }, { ...rest, eyes: 'closed' }] as Pose[]) {
      const c = drawn(pose)
      expect(at(c, 6, 0)).toBe(LIGHT)
      for (let y = 1; y < 4; y++) expect([BASE, EYE]).toContain(at(c, 6, y))
      expect(at(c, 6, 4)).toBe(SHADOW)
    }
  })

  test('glow 1 paints the top row in the light tone, glow 0 in the base tone', () => {
    expect(at(drawn({ ...rest, glow: 1 }), 6, 0)).toBe(LIGHT)
    expect(at(drawn({ ...rest, glow: 0 }), 6, 0)).toBe(BASE)
  })

  test('arms up lift each arm one row', () => {
    const c = drawn({ ...rest, arms: 'up' })
    expect(at(c, 0, 1)).toBe(BASE)
    expect(at(c, 0, 2)).toBeNull()
  })

  test('open eyes are two pixels tall; looking left shifts them one pixel', () => {
    const open = drawn(rest)
    const eyeXs = (c: ReturnType<typeof createCanvas>) =>
      [...Array(CLAWD_WIDTH).keys()].filter(x => at(c, x, 1) === EYE)
    expect(eyeXs(open)).toHaveLength(2)
    expect(eyeXs(open).every(x => at(open, x, 2) === EYE)).toBe(true)
    expect(eyeXs(drawn({ ...rest, eyes: 'left' }))).toEqual(eyeXs(open).map(x => x - 1))
    expect(eyeXs(drawn({ ...rest, eyes: 'right' }))).toEqual(eyeXs(open).map(x => x + 1))
  })

  test('closed eyes are a shadow lid line on the lower eye row only', () => {
    const c = drawn({ ...rest, eyes: 'closed' })
    const row = (y: number, color: number) => [...Array(CLAWD_WIDTH).keys()].filter(x => at(c, x, y) === color)
    expect(row(1, EYE)).toHaveLength(0)
    expect(row(2, EYE)).toHaveLength(0)
    expect(row(2, SHADOW)).toHaveLength(2)
  })

  test('a tapping foot lifts one leg, so one pixel fewer is drawn', () => {
    expect(opaqueCount(drawn({ ...rest, legs: 'tap' }))).toBe(opaqueCount(drawn(rest)) - 1)
  })

  test('uses the palette colours from the sprite data', () => {
    expect(DATA.frames.clawd_body.pixels[0]).toBe(LIGHT)
  })
})

describe('idlePose', () => {
  test('glow follows a smooth breath: dark at the start, brightest mid-breath', () => {
    expect(idlePose(BREATH_MS).glow).toBeLessThan(0.001)
    expect(idlePose(BREATH_MS * 1.5).glow).toBeGreaterThan(0.999)
    const g = idlePose(BREATH_MS * 1.25).glow
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.7)
  })

  test('arms are up exactly while the breath glow is at least half', () => {
    for (let t = 0; t < BREATH_MS; t += 50) {
      const p = idlePose(BREATH_MS * 10 + t)
      expect(p.arms).toBe(p.glow >= 0.5 ? 'up' : 'rest')
    }
  })

  test('blinks briefly once per blink period', () => {
    expect(idlePose(BLINK_PERIOD_MS * 3 + 1).eyes).toBe('closed')
    expect(idlePose(BLINK_PERIOD_MS * 3 + BLINK_MS + 1).eyes).not.toBe('closed')
  })

  test('each fidget period plays the next fidget in turn, then rests', () => {
    // Pick a time inside the fidget that is not on a blink.
    const t = (n: number) => FIDGET_PERIOD_MS * n + FIDGET_MS / 2
    const seen = [0, 1, 2, 3].map(n => idlePose(t(n)))
    expect(seen.map(p => p.eyes === 'left' || p.eyes === 'right' || p.legs === 'tap' || p.eyes === 'closed')).toEqual([true, true, true, true])
    expect(FIDGETS.length).toBe(4)
    expect(idlePose(FIDGET_PERIOD_MS + FIDGET_MS + 300).eyes).toBe('open')
  })
})

describe('looking up and down', () => {
  const eyeRows = (c: ReturnType<typeof createCanvas>) =>
    [...Array(CLAWD_HEIGHT).keys()].filter(y => [...Array(CLAWD_WIDTH).keys()].some(x => at(c, x, y) === EYE))

  test('looking down moves the eyes one row lower, to rows 2 and 3', () => {
    expect(eyeRows(drawn(rest))).toEqual([1, 2])
    expect(eyeRows(drawn({ ...rest, eyes: 'down' }))).toEqual([2, 3])
  })

  test('looking up moves the eyes one row higher, to rows 0 and 1', () => {
    expect(eyeRows(drawn({ ...rest, eyes: 'up' }))).toEqual([0, 1])
  })
})

describe('reaching with the knife', () => {
  const OX = 2 // room left of the arm for the forearm and the hand
  const OY = 5 // room above for a raised forearm
  const reaching = (reach: number) => {
    const c = createCanvas(CLAWD_WIDTH + OX, CLAWD_HEIGHT + OY)
    drawClawd(c, OX, OY, { ...rest, reach })
    return c
  }

  test('the left arm is raised and the right one rests', () => {
    const c = reaching(-2)
    expect(at(c, OX, OY + 1)).toBe(BASE)
    expect(at(c, OX, OY + 2)).toBeNull()
    expect(at(c, OX + 11, OY + 2)).toBe(BASE)
    expect(at(c, OX + 11, OY + 1)).toBeNull()
  })

  test('a forearm runs up from the raised arm to the hand row, with the hand one pixel further out', () => {
    for (const reach of [-4, -2, 0]) {
      const c = reaching(reach)
      for (let y = reach; y <= 1; y++) expect(at(c, OX - 1, OY + y)).toBe(BASE)
      expect(at(c, OX - 1, OY + reach - 1)).toBeNull()
      expect(at(c, OX - 2, OY + reach)).toBe(BASE)
      expect(at(c, OX - 2, OY + reach + 1)).toBeNull()
    }
  })

  test('without reach there is nothing beside the left arm', () => {
    const c = createCanvas(CLAWD_WIDTH + OX, CLAWD_HEIGHT + OY)
    drawClawd(c, OX, OY, rest)
    for (let y = 0; y < CLAWD_HEIGHT + OY; y++) expect(at(c, OX - 1, y)).toBeNull()
  })
})

describe('the chef hat', () => {
  const hat = DATA.frames.chef_hat
  const OY = HAT_HEIGHT
  const hatted = (pose: Pose) => {
    const c = createCanvas(CLAWD_WIDTH, CLAWD_HEIGHT + OY)
    drawClawd(c, 0, OY, pose)
    return c
  }
  const BODY_X = 2
  const HEAD_W = 9

  test('is four rows tall and narrower than the head', () => {
    expect(HAT_HEIGHT).toBe(4)
    expect(hat.height).toBe(HAT_HEIGHT)
    expect(hat.width).toBeLessThan(HEAD_W)
  })

  test('sits on top of the head, centred, resting right on the body', () => {
    const c = hatted(rest)
    const x0 = BODY_X + (HEAD_W - hat.width) / 2
    for (let row = 0; row < hat.height; row++) {
      for (let col = 0; col < hat.width; col++) {
        expect(at(c, x0 + col, row)).toBe(hat.pixels[row * hat.width + col])
      }
    }
    expect(at(c, BODY_X + 4, OY)).toBe(LIGHT)
  })

  test('is not part of the body: nothing above the head but the hat', () => {
    const c = hatted(rest)
    for (let x = 0; x < CLAWD_WIDTH; x++) {
      const inHat = x >= BODY_X + (HEAD_W - hat.width) / 2 && x < BODY_X + (HEAD_W + hat.width) / 2
      if (!inHat) for (let y = 0; y < OY; y++) expect(at(c, x, y)).toBeNull()
    }
  })

  test('stays the same in every pose, and does not change the body', () => {
    const base = hatted(rest)
    for (const pose of [{ ...rest, eyes: 'down' }, { ...rest, arms: 'up' }, { ...rest, legs: 'tap' }, { ...rest, reach: -1 }] as Pose[]) {
      const c = hatted(pose)
      for (let y = 0; y < OY; y++) {
        for (let x = BODY_X + 1; x < BODY_X + HEAD_W - 1; x++) expect(at(c, x, y)).toBe(at(base, x, y))
      }
    }
  })
})
