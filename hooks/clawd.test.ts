// Spec for Clawd built from parts (hooks/lib/clawd.ts).
// The rig: eyes, two arms (each at rest, lifted, high, out, or holding at a hand row), four legs,
// a lean toward the table or the stove, a crouch or stretch, the chef hat's own offset, and the breath glow.
// Sizes are in quadrant pixels (2 per cell across, 2 down), so Clawd is 26 wide: arms 4, body 18, arms 4.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import {
  CLAWD_HEIGHT,
  CLAWD_WIDTH,
  HAT_HEIGHT,
  drawClawd,
  handAnchor,
  poseOf,
} from './lib/clawd'
import type { Arm, Eyes, Legs, Pose } from './lib/clawd'
import { CELL_W, createCanvas, overColoured, toCells } from './lib/raster'

const LIGHT = 0xe8936f
const BASE = 0xd97757
const EYE = 0x2b1f1a
const SHADOW = 0xb35a3d

// Room around Clawd for arms held out, a forearm raised, the hat and a stretch; the origin is even in both
// directions, as Clawd stands in the scene, so cell boundaries fall where the art expects them.
const OX = 12
const OY = 8
const W = CLAWD_WIDTH + 2 * OX
const H = CLAWD_HEIGHT + OY + 4

const EYES: Eyes[] = ['open', 'half', 'closed', 'left', 'right', 'up', 'down', 'wide', 'happy']
const ARMS: Arm[] = ['rest', 'lift', 'high', 'out', 'hold']
const LEGS: Legs[] = ['stand', 'tapL', 'tapR', 'step', 'hop']

const at = (c: ReturnType<typeof createCanvas>, x: number, y: number) => c.px[(y + OY) * c.width + x + OX]
const drawn = (pose: Pose) => {
  const c = createCanvas(W, H)
  drawClawd(c, OX, OY, pose)
  return c
}
const where = (c: ReturnType<typeof createCanvas>, color: number) => {
  const out: [number, number][] = []
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.px[y * c.width + x] === color) out.push([x - OX, y - OY])
  return out
}
const rows = (pts: [number, number][]) => [...new Set(pts.map(p => p[1]))].sort((a, b) => a - b)
const cols = (pts: [number, number][]) => [...new Set(pts.map(p => p[0]))].sort((a, b) => a - b)

describe('the shape', () => {
  test('is 26 wide and 7 tall: an 18×5 body, 4px arms each side, legs 2 rows below; the hat adds 4 rows', () => {
    expect([CLAWD_WIDTH, CLAWD_HEIGHT, HAT_HEIGHT]).toEqual([26, 7, 4])
    const c = drawn(poseOf())
    expect(at(c, 4, 0)).not.toBeNull()
    expect(at(c, 3, 0)).toBeNull()
    expect(at(c, 21, 0)).not.toBeNull()
    expect(at(c, 22, 0)).toBeNull()
    expect(at(c, 0, 2)).toBe(BASE)
    expect(at(c, 25, 2)).toBe(BASE)
  })

  test('has four legs, each two pixels wide, on the bottom two rows', () => {
    const c = drawn(poseOf())
    for (const y of [5, 6]) expect(cols(where(c, SHADOW).filter(p => p[1] === y))).toHaveLength(8)
    expect(at(c, 2 + 4, 6)).toBe(SHADOW)
    expect(at(c, 4 + 4, 6)).toBeNull()
  })

  test('the body keeps its full height: a light top row, base, a shadow row', () => {
    const c = drawn(poseOf({ glow: 1 }))
    expect(at(c, 10, 0)).toBe(LIGHT)
    for (let y = 1; y < 4; y++) expect([BASE, EYE]).toContain(at(c, 10, y))
    expect(at(c, 10, 4)).toBe(SHADOW)
  })

  test('uses the palette colours from the sprite data', () => {
    expect(DATA.frames.clawd_body.pixels[0]).toBe(LIGHT)
    expect(DATA.frames.clawd_eye.pixels[0]).toBe(EYE)
  })
})

describe('the breath glow', () => {
  test('glow 1 paints the top row in the light tone, glow 0 in the base tone', () => {
    expect(at(drawn(poseOf({ glow: 1 })), 10, 0)).toBe(LIGHT)
    expect(at(drawn(poseOf({ glow: 0 })), 10, 0)).toBe(BASE)
  })

  test('glow in between is a colour between the two', () => {
    const mid = at(drawn(poseOf({ glow: 0.5 })), 10, 0)!
    expect(mid).toBeGreaterThan(BASE)
    expect(mid).toBeLessThan(LIGHT)
  })
})

describe('the eyes', () => {
  test('open eyes are two pixels wide and two tall each, on body rows 1 and 2', () => {
    const pts = where(drawn(poseOf()), EYE)
    expect(pts).toHaveLength(8)
    expect(rows(pts)).toEqual([1, 2])
    expect(cols(pts)).toEqual([8, 9, 16, 17])
  })

  test('looking left or right shifts them one cell (two pixels)', () => {
    const open = cols(where(drawn(poseOf()), EYE))
    expect(cols(where(drawn(poseOf({ eyes: 'left' })), EYE))).toEqual(open.map(x => x - 2))
    expect(cols(where(drawn(poseOf({ eyes: 'right' })), EYE))).toEqual(open.map(x => x + 2))
  })

  test('looking up or down shifts them one row', () => {
    expect(rows(where(drawn(poseOf({ eyes: 'up' })), EYE))).toEqual([0, 1])
    expect(rows(where(drawn(poseOf({ eyes: 'down' })), EYE))).toEqual([2, 3])
  })

  test('a blink closes monotonically: open, then half, then a four-pixel shadow lid line with no eye colour', () => {
    const count = (eyes: Eyes) => where(drawn(poseOf({ eyes })), EYE).length
    expect(count('open')).toBeGreaterThan(count('half'))
    expect(count('half')).toBeGreaterThan(count('closed'))
    expect(count('closed')).toBe(0)
    const lid = where(drawn(poseOf({ eyes: 'closed' })), SHADOW).filter(p => p[1] === 2)
    expect(lid).toHaveLength(8)
  })

  test('half-closed keeps the lower eye row only', () => {
    expect(rows(where(drawn(poseOf({ eyes: 'half' })), EYE))).toEqual([2])
  })

  test('wide eyes are a row taller than open ones; happy eyes are arches with no full eye block', () => {
    expect(rows(where(drawn(poseOf({ eyes: 'wide' })), EYE))).toEqual([1, 2, 3])
    const happy = where(drawn(poseOf({ eyes: 'happy' })), EYE)
    expect(rows(happy)).toEqual([2, 3])
    expect(cols(happy.filter(p => p[1] === 3))).toEqual([8, 11, 16, 19])
    expect(cols(happy.filter(p => p[1] === 2))).toEqual([9, 10, 17, 18])
  })

  test('every eye state paints a different pattern', () => {
    const key = (eyes: Eyes) => JSON.stringify(drawn(poseOf({ eyes })).px)
    expect(new Set(EYES.map(key)).size).toBe(EYES.length)
  })
})

describe('the arms', () => {
  const arm = (side: 'L' | 'R', a: Arm) => drawn(poseOf(side === 'L' ? { armL: a } : { armR: a }))

  test('at rest an arm is a stub on body row 2; lifted it is on row 1; high it reaches row 0 with a forearm above', () => {
    expect(at(arm('L', 'rest'), 0, 2)).toBe(BASE)
    expect(at(arm('L', 'lift'), 0, 1)).toBe(BASE)
    expect(at(arm('L', 'lift'), 0, 2)).toBeNull()
    const high = arm('L', 'high')
    expect(at(high, 0, 0)).toBe(BASE)
    expect(at(high, 0, -2)).toBe(BASE)
    expect(at(high, 0, -3)).toBeNull()
  })

  test('out stretches the arm two pixels past its usual end, on both sides', () => {
    expect(at(arm('L', 'out'), -2, 2)).toBe(BASE)
    expect(at(arm('R', 'out'), 27, 2)).toBe(BASE)
  })

  test('the other arm does not move when one does', () => {
    const rest = drawn(poseOf())
    const right = drawn(poseOf({ armL: 'high' }))
    for (let y = -4; y < 7; y++) for (let x = 22; x < 30; x++) expect(at(right, x, y)).toBe(at(rest, x, y))
  })

  test('holding: a forearm runs between the shoulder row and the hand row, with the hand beyond it', () => {
    for (const handL of [-2, 0, 2]) {
      const c = drawn(poseOf({ armL: 'hold', handL }))
      const shoulder = handL <= -2 ? 0 : 1
      const lo = Math.min(handL, shoulder)
      const hi = Math.max(handL, shoulder)
      for (let y = lo; y <= hi; y++) expect(at(c, -2, y)).toBe(BASE)
      expect(at(c, -2, lo - 1)).toBeNull()
      expect(at(c, -2, hi + 1)).toBeNull()
      expect(at(c, -4, handL)).toBe(BASE)
    }
  })

  test('without holding there is nothing beside the arm', () => {
    const c = drawn(poseOf())
    for (let y = -4; y < 8; y++) expect(at(c, -1, y)).toBeNull()
  })
})

describe('handAnchor: where a held prop sits', () => {
  test('is the end of the arm: the outer pixel of the stub, the top of a raised forearm, the hand when holding', () => {
    expect(handAnchor(poseOf(), 'L')).toEqual([0, 2])
    expect(handAnchor(poseOf(), 'R')).toEqual([25, 2])
    expect(handAnchor(poseOf({ armL: 'lift' }), 'L')).toEqual([0, 1])
    expect(handAnchor(poseOf({ armR: 'high' }), 'R')).toEqual([25, -2])
    expect(handAnchor(poseOf({ armL: 'out' }), 'L')).toEqual([-2, 2])
    expect(handAnchor(poseOf({ armL: 'hold', handL: -1 }), 'L')).toEqual([-4, -1])
    expect(handAnchor(poseOf({ armR: 'hold', handR: 3 }), 'R')).toEqual([29, 3])
  })

  test('moves with the lean one cell at a time, and with a crouch or stretch one row', () => {
    expect(handAnchor(poseOf({ lean: 1 }), 'L')).toEqual([2, 2])
    expect(handAnchor(poseOf({ lean: -1 }), 'R')).toEqual([23, 2])
    expect(handAnchor(poseOf({ squash: 1 }), 'L')).toEqual([0, 3])
    expect(handAnchor(poseOf({ squash: -1 }), 'R')).toEqual([25, 1])
  })

  test('is a pixel Clawd really draws, for every arm state, lean and squash', () => {
    for (const a of ARMS) {
      for (const lean of [-1, 0, 1] as const) {
        for (const squash of [-1, 0, 1] as const) {
          for (const side of ['L', 'R'] as const) {
            const pose = poseOf({ [side === 'L' ? 'armL' : 'armR']: a, lean, squash })
            const [gx, gy] = handAnchor(pose, side)
            expect(`${a} ${lean} ${squash} ${side} ${at(drawn(pose), gx, gy) === BASE}`).toBe(`${a} ${lean} ${squash} ${side} true`)
          }
        }
      }
    }
  })
})

describe('the legs', () => {
  test('a tapping foot lifts one leg a row, a step two, a hop all four', () => {
    const count = (legs: Legs) => where(drawn(poseOf({ legs })), SHADOW).length
    const stand = count('stand')
    expect(count('tapL')).toBe(stand - 2)
    expect(count('tapR')).toBe(stand - 2)
    expect(count('step')).toBe(stand - 4)
    expect(count('hop')).toBe(stand - 8)
  })
})

describe('lean, crouch and stretch', () => {
  test('leaning moves the body, hat and arms one cell (two pixels) and leaves the legs', () => {
    const base = drawn(poseOf())
    const lean = drawn(poseOf({ lean: 1 }))
    expect(at(lean, 6, 0)).not.toBeNull()
    expect(at(lean, 4, 0)).toBeNull()
    expect(at(lean, 23, 0)).not.toBeNull()
    expect(at(lean, 2, 2)).toBe(BASE)
    for (const x of [6, 10, 14, 18]) expect(at(lean, x, 6)).toBe(at(base, x, 6))
    expect(at(lean, 6 + 2, -3)).toBe(at(base, 6, -3))
  })

  test('a crouch lowers body and hat one row and keeps the feet on the floor row', () => {
    const c = drawn(poseOf({ squash: 1 }))
    expect(at(c, 4, 0)).toBeNull()
    expect(at(c, 4, 1)).not.toBeNull()
    expect(at(c, 6, 6)).toBe(SHADOW)
    expect(at(c, 8, 6)).toBeNull()
    expect(at(c, 6, 7)).toBeNull()
  })

  test('a stretch raises body and hat one row and lengthens the legs to keep the feet down', () => {
    const c = drawn(poseOf({ squash: -1 }))
    expect(at(c, 10, -1)).not.toBeNull()
    expect(at(c, 10, 0)).not.toBeNull()
    for (const y of [4, 5, 6]) expect(at(c, 6, y)).toBe(SHADOW)
    expect(at(c, 6, 7)).toBeNull()
  })
})

describe('the chef hat', () => {
  const hat = DATA.frames.chef_hat

  test('is four rows tall and narrower than the head, sitting centred on top of it', () => {
    expect(hat.height).toBe(HAT_HEIGHT)
    expect(hat.width).toBeLessThan(18)
    const c = drawn(poseOf())
    const x0 = 4 + (18 - hat.width) / 2
    for (let row = 0; row < hat.height; row++) {
      for (let col = 0; col < hat.width; col++) expect(at(c, x0 + col, row - HAT_HEIGHT)).toBe(hat.pixels[row * hat.width + col])
    }
  })

  test('nothing is above the head but the hat', () => {
    const c = drawn(poseOf())
    for (let x = 0; x < CLAWD_WIDTH; x++) {
      const inHat = x >= 4 + (18 - hat.width) / 2 && x < 4 + (18 + hat.width) / 2
      if (!inHat) for (let y = -HAT_HEIGHT; y < 0; y++) expect(at(c, x, y)).toBeNull()
    }
  })

  test('its own offset moves only the hat: a dip of one row covers the top of the head', () => {
    const base = drawn(poseOf())
    const dip = drawn(poseOf({ hat: 1 }))
    expect(at(dip, 10, -4)).toBeNull()
    expect(at(dip, 10, -3)).toBe(at(base, 10, -4))
    expect(at(dip, 10, 0)).toBe(at(base, 10, -1))
    for (let y = 1; y < 5; y++) for (let x = 4; x < 22; x++) expect(at(dip, x, y)).toBe(at(base, x, y))
  })
})

describe('clipping', () => {
  test('drawing at the canvas edge clips instead of throwing', () => {
    const c = createCanvas(6, 6)
    drawClawd(c, -10, -3, poseOf({ armL: 'hold', handL: -2, eyes: 'wide', squash: -1 }))
    drawClawd(c, 3, 3, poseOf({ armR: 'high', lean: 1 }))
    expect(c.px.length).toBe(36)
  })
})

describe('the art: two colours at most in every cell (transparent counts), over the whole rig', () => {
  test('Clawd alone, at his cell-aligned origin, in every combination, never needs a third colour', () => {
    const bad: string[] = []
    const c = createCanvas(W, H)
    for (const eyes of EYES) {
      for (const armL of ARMS) {
        for (const armR of ARMS) {
          for (const legs of LEGS) {
            for (const lean of [-1, 0, 1] as const) {
              for (const squash of [-1, 0, 1] as const) {
                for (const hat of [-1, 0, 1]) {
                  c.px.fill(null)
                  const pose = poseOf({ eyes, armL, armR, handL: armL === 'hold' ? -1 : 2, handR: armR === 'hold' ? 3 : 2, legs, lean, squash, hat, glow: 0.5 })
                  drawClawd(c, OX, OY, pose)
                  const offenders = overColoured(c)
                  if (offenders.length > 0 && bad.length < 5) bad.push(`${JSON.stringify(pose)} ${JSON.stringify(offenders.slice(0, 2))}`)
                }
              }
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  test('the eyes survive encoding in every open-eyed pose: the eye colour is in the cell at each eye', () => {
    for (const eyes of ['open', 'left', 'right', 'up', 'down', 'wide'] as const) {
      for (const squash of [-1, 0, 1] as const) {
        const c = createCanvas(W, H)
        drawClawd(c, OX, OY, poseOf({ eyes, squash }))
        const cells = toCells(c)
        const cols = W / CELL_W
        const eyeCells = new Set<number>()
        for (const [x, y] of where(c, EYE)) eyeCells.add(Math.floor((y + OY) / 2) * cols + Math.floor((x + OX) / 2))
        expect(eyeCells.size).toBeGreaterThanOrEqual(2)
        for (const cell of eyeCells) expect(`${eyes} ${squash} ${[cells[cell * 3 + 1], cells[cell * 3 + 2]].includes(EYE)}`).toBe(`${eyes} ${squash} true`)
      }
    }
  })
})
