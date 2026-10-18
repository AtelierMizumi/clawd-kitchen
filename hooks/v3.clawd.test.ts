// Spec for the v3 Clawd rig (hooks/v3/clawd.ts): Claude Code's own Clawd, on model, at twice its size. The model is
// the one Claude Code draws in its header (quadrant glyphs, decoded below from its source): a 13x4 body, eyes that are
// one-pixel holes, 2x1 arms low on the sides, legs in two pairs. At 2x every model pixel is 2x2 quadrant pixels, which
// leaves half-model-pixel steps for the animation. Clawd wears a flat chef hat; the rest is the animator's: squash and
// stretch drawings, a blink through a lid, and holding every terminal cell to two colours.
import { describe, expect, test } from 'claude-code/testing'

import { V3 } from './gen/v3'
import { createCanvas } from './lib/raster'
import type { Canvas } from './lib/raster'
import { drawClawd, pose } from './v3/clawd'
import type { Pose } from './v3/clawd'

const W = 80
const H = 34
const FLOOR = 32
/** The middle of the body: 13 model pixels are 26 quadrant pixels, so the body's left edge is CX - 13, a cell edge. */
const CX = 25

// Claude Code's Clawd, as its source spells it: three rows of quadrant glyphs, eyes as holes in the body colour.
const QUADRANT: Record<string, number> = {
  ' ': 0, '▘': 1, '▝': 2, '▀': 3, '▖': 4, '▌': 5, '▞': 6, '▛': 7, '▗': 8, '▚': 9, '▐': 10, '▜': 11, '▄': 12, '▙': 13, '▟': 14, '█': 15,
}
/** Model pixels ('o' body, 'k' eye hole, '.' nothing) of three glyph rows, the eyes spanning columns 2 to 7 of row 0. */
const decode = (rows: string[]): string[] => {
  const g = Array.from({ length: 6 }, () => Array<string>(18).fill('.'))
  rows.forEach((s, r) =>
    [...s].forEach((ch, c) => {
      for (let bit = 0; bit < 4; bit++) {
        const [x, y] = [2 * c + (bit % 2), 2 * r + Math.floor(bit / 2)]
        if ((QUADRANT[ch]! >> bit) & 1) g[y]![x] = 'o'
        else if (r === 0 && c >= 2 && c <= 7) g[y]![x] = 'k'
      }
    }),
  )
  return g.slice(0, 5).map(r => r.join(''))
}
const OFFICIAL = {
  down: decode([' ▐▛███▛█ ', '▝▜██████▀', ' ▝▝   ▝▝ ']),
  up: decode(['▗▟▛███▛█▄', ' ▜██████▘', ' ▝▝   ▝▝ ']),
}

const paint = (p: Partial<Pose> = {}): Canvas => {
  const c = createCanvas(W, H)
  drawClawd(c, CX, FLOOR, pose(p))
  return c
}
const at = (c: Canvas, x: number, y: number) => c.px[y * c.width + x] ?? null
const row = (c: Canvas, y: number) => c.px.slice(y * c.width, (y + 1) * c.width)
const colorsOf = (frame: keyof typeof V3.frames) =>
  new Set<number>((V3.frames[frame].pixels as readonly (number | null)[]).filter((p): p is number => p !== null))
const BODY_COLOR = 0xd77757
const EYE = [...colorsOf('eye_open')].find(v => v !== BODY_COLOR)!
const HAT = colorsOf('hat')
const bodyFrame = (b: Pose['body']) => V3.frames[b === 'neutral' ? 'body' : (`body_${b}` as const)]
const LEGS = V3.frames.leg.height
const bodyTop = (b: Pose['body']) => FLOOR - LEGS - bodyFrame(b).height

const topOf = (c: Canvas, inSet: (v: number) => boolean) => {
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (inSet(at(c, x, y) as number)) return y
  return -1
}
const bottomOf = (c: Canvas, inSet: (v: number) => boolean) => {
  for (let y = c.height - 1; y >= 0; y--) for (let x = 0; x < c.width; x++) if (inSet(at(c, x, y) as number)) return y
  return -1
}
const widthOfRow = (c: Canvas, y: number) => row(c, y).filter(v => v !== null).length
const pixelsOf = (c: Canvas, color: number) => {
  const out: [number, number][] = []
  c.px.forEach((v, i) => v === color && out.push([i % c.width, Math.floor(i / c.width)]))
  return out
}
const leftEye = (c: Canvas) => pixelsOf(c, EYE).filter(([x]) => x < CX)

/** The drawing scaled back down to model pixels (each 2x2 block must be one colour), hat left out. */
const toModel = (c: Canvas): string[] => {
  const x0 = CX - 13 - 6
  const y0 = bodyTop('neutral')
  return Array.from({ length: 5 }, (_, my) =>
    Array.from({ length: 18 }, (_, mx) => {
      const block = [0, 1, 2, 3].map(i => at(c, x0 + 2 * mx + (i % 2), y0 + 2 * my + Math.floor(i / 2)))
      if (new Set(block).size !== 1) return '?'
      const v = block[0]
      return v === BODY_COLOR ? 'o' : v === EYE ? 'k' : '.'
    }).join(''),
  )
}

describe('on model', () => {
  test('at rest he is Claude Code\'s own Clawd, pixel for pixel, at twice the size', () => {
    expect(toModel(paint())).toEqual(OFFICIAL.down)
  })

  test('with his arms up too', () => {
    expect(toModel(paint({ arms: 'up' }))).toEqual(OFFICIAL.up)
  })

  test('the body is the official colour and nothing else', () => {
    expect([...colorsOf('body')]).toEqual([BODY_COLOR])
  })
})

describe('the body', () => {
  test('the feet stay planted whatever the body does', () => {
    const feet = (b: Pose['body']) => Array.from({ length: LEGS }, (_, d) => row(paint({ body: b }), FLOOR - 1 - d))
    expect(feet('squash')).toEqual(feet('neutral'))
    expect(feet('stretch')).toEqual(feet('neutral'))
  })

  test('lift raises the whole of him, feet and hat too, by whole pixels', () => {
    const still = paint()
    const up = paint({ lift: 3 })
    for (let y = 3; y < H; y++) expect(row(up, y - 3)).toEqual(row(still, y))
    expect(() => pose({ lift: 0.5 })).toThrow()
  })

  test('nothing is drawn on or below the floor row', () => {
    const c = paint()
    for (let y = FLOOR; y < H; y++) expect(widthOfRow(c, y)).toBe(0)
  })

  // Stretch keeps the model's width: a model pixel narrower would leave the outer pair of legs outside the body.
  test('a breath in raises the head half a model pixel, at the same width', () => {
    const top = (b: Pose['body']) => topOf(paint({ body: b }), v => v === BODY_COLOR)
    expect(top('inhale')).toBe(top('neutral') - 1)
    expect(widthOfRow(paint({ body: 'inhale' }), FLOOR - LEGS - 1)).toBe(widthOfRow(paint(), FLOOR - LEGS - 1))
  })

  test('squash is lower and wider, stretch taller and never wider', () => {
    const top = (b: Pose['body']) => topOf(paint({ body: b }), v => v === BODY_COLOR)
    const wide = (b: Pose['body']) => widthOfRow(paint({ body: b }), FLOOR - LEGS - 1)
    expect(top('squash')).toBeGreaterThan(top('neutral'))
    expect(top('stretch')).toBeLessThan(top('neutral'))
    expect(wide('squash')).toBeGreaterThan(wide('neutral'))
    expect(wide('stretch')).toBeLessThanOrEqual(wide('neutral'))
  })
})

describe('the hat', () => {
  test('sits right on top of the head for every body', () => {
    for (const body of ['neutral', 'inhale', 'squash', 'stretch'] as const) {
      expect(bottomOf(paint({ body }), v => HAT.has(v))).toBe(bodyTop(body) - 1)
    }
  })

  test('its own offset moves only the hat: across a model pixel at a time, up and down by a model pixel too', () => {
    const still = paint()
    const moved = paint({ hat: { x: 2, y: -2 } })
    expect(topOf(moved, v => HAT.has(v))).toBe(topOf(still, v => HAT.has(v)) - 2)
    expect(pixelsOf(moved, EYE)).toEqual(pixelsOf(still, EYE))
    // Across, half a model pixel would split the hat's edges inside cells and need a third colour; so would a
    // half pixel up or down, which cuts its shaded rows across the cell rows.
    expect(() => pose({ hat: { x: 1, y: 0 } })).toThrow()
    expect(() => pose({ hat: { x: 0, y: -1 } })).toThrow()
    expect(() => pose({ hat: { x: 0, y: -3 } })).toThrow()
  })

  test('the hat floats up in model pixels, never down into the head', () => {
    const bodyOf = (y: number) => pixelsOf(paint({ hat: { x: 0, y } }), BODY_COLOR)
    for (const y of [-4, -2, 0, 1, 2]) expect([y, bodyOf(y)]).toEqual([y, bodyOf(0)])
  })

  test('a positive offset is a pressed hat: a squashed drawing, shorter and wider, sitting on the head', () => {
    const still = paint()
    const pressed = paint({ hat: { x: 0, y: 1 } })
    const height = (c: Canvas) => bottomOf(c, v => HAT.has(v)) - topOf(c, v => HAT.has(v)) + 1
    const width = (c: Canvas) => Math.max(...Array.from({ length: H }, (_, y) => row(c, y).filter(v => v !== null && HAT.has(v)).length))
    expect(height(pressed)).toBeLessThan(height(still))
    expect(width(pressed)).toBeGreaterThan(width(still))
    expect(bottomOf(pressed, v => HAT.has(v))).toBe(bottomOf(still, v => HAT.has(v)))
    // every pressed level is the one drawing
    expect(paint({ hat: { x: 0, y: 2 } }).px).toEqual(pressed.px)
  })

  test('the hat has pleats and a shaded band: more than one tone', () => {
    expect(HAT.size).toBeGreaterThanOrEqual(4)
  })
})

describe('the eyes', () => {
  test('a blink lowers a lid: open is two pixels tall, half is one, closed is a thin line wider than the eye', () => {
    const height = (eyes: Pose['eyes']) => new Set(leftEye(paint({ eyes })).map(([, y]) => y)).size
    const width = (eyes: Pose['eyes']) => new Set(leftEye(paint({ eyes })).map(([x]) => x)).size
    expect(height('open')).toBe(2)
    expect(height('half')).toBe(1)
    expect(height('closed')).toBe(1)
    expect(width('closed')).toBeGreaterThan(width('open'))
  })

  test('looking left or right moves both eyes a model pixel that way and up, as on the original', () => {
    const still = pixelsOf(paint(), EYE)
    expect(pixelsOf(paint({ look: -1 }), EYE)).toEqual(still.map(([x, y]) => [x - 2, y - 2]))
    expect(pixelsOf(paint({ look: 1 }), EYE)).toEqual(still.map(([x, y]) => [x + 2, y - 2]))
  })

  test('only an open eye looks: closed lids and happy carets stay put', () => {
    for (const eyes of ['closed', 'happy'] as const) {
      expect(pixelsOf(paint({ eyes, look: 1 }), EYE)).toEqual(pixelsOf(paint({ eyes }), EYE))
    }
  })

  test('a wink closes one eye and leaves the other open', () => {
    const c = paint({ eyes: 'wink' })
    expect(leftEye(c)).toEqual(leftEye(paint()))
    const right = (k: Canvas) => pixelsOf(k, EYE).filter(([x]) => x >= CX)
    expect(right(c)).toEqual(right(paint({ eyes: 'closed' })))
  })

  test('happy eyes are carets: the middle higher than the sides', () => {
    const eye = leftEye(paint({ eyes: 'happy' }))
    const xs = eye.map(([x]) => x)
    const top = Math.min(...eye.map(([, y]) => y))
    const middle = eye.filter(([x]) => x !== Math.min(...xs) && x !== Math.max(...xs))
    expect(middle.every(([, y]) => y === top)).toBe(true)
    expect(eye.some(([x, y]) => x === Math.min(...xs) && y > top)).toBe(true)
  })
})

describe('two colours a cell', () => {
  test('holds for every body, eyes, look, arms and hat offset', () => {
    const bad: string[] = []
    for (const body of ['neutral', 'inhale', 'squash', 'stretch'] as const)
      for (const eyes of ['open', 'half', 'closed', 'wink', 'happy'] as const)
        for (const look of [-1, 0, 1] as const)
          for (const arms of ['down', 'up'] as const)
            for (const [hx, hy, lift] of [[0, 0, 0], [2, 0, 1], [-2, 0, 0], [0, -2, 3], [0, -4, 0], [0, 1, 5], [2, 2, 0]] as const) {
              const c = paint({ body, eyes, look, arms, hat: { x: hx, y: hy }, lift })
              for (let cy = 0; cy < H; cy += 2)
                for (let cx = 0; cx < W; cx += 2) {
                  const vals = new Set([at(c, cx, cy), at(c, cx + 1, cy), at(c, cx, cy + 1), at(c, cx + 1, cy + 1)])
                  if (vals.size > 2) bad.push(`${body}/${eyes}/look ${look}/${arms}/hat ${hx},${hy}: cell ${cx / 2},${cy / 2}`)
                }
            }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

const KNIVES = ['rest', 'ready', 'raise1', 'raise2', 'raise3', 'hang', 'smear', 'impact', 'pull'] as const
/** The shoulder row: where the left arm leaves the body, whatever the body does (a block is two pixels tall). */
const SHOULDER = FLOOR - 6
const BX = CX - 13
const BLADE = [...colorsOf('knife_impact')].filter(v => v !== BODY_COLOR)

describe('the knife in hand', () => {
  test('every drawing holds the knife by the arm, joined to the body at the shoulder', () => {
    for (const knife of KNIVES) {
      const c = paint({ knife })
      expect([knife, at(c, BX - 1, SHOULDER), at(c, BX - 1, SHOULDER + 1)]).toEqual([knife, BODY_COLOR, BODY_COLOR])
      expect([knife, pixelsOf(c, BLADE[0]!).length > 0 || pixelsOf(c, BLADE[1]!).length > 0]).toEqual([knife, true])
    }
  })

  test('it takes the place of the left arm, which now slants up to the hand; the right side is as before', () => {
    const plain = paint()
    const withKnife = paint({ knife: 'impact' })
    // the right side of the body, from the middle across, is untouched
    for (let y = 0; y < H; y++) for (let x = CX; x < W; x++) expect(at(withKnife, x, y)).toEqual(at(plain, x, y))
    // the impact drawing's hand is four blocks (eight pixels) up and out; the plain stub is not
    expect(at(withKnife, BX - 8, SHOULDER - 4)).toBe(BODY_COLOR)
    expect(at(plain, BX - 8, SHOULDER - 4)).toBeNull()
  })

  test('the knife keeps its place whatever the body does: a stretch or a squash does not move it', () => {
    for (const knife of KNIVES) {
      const knifeOnly = (body: Pose['body']) => paint({ knife, body }).px.map((v, i) => (BLADE.includes(v as number) ? i : -1)).filter(i => i >= 0)
      expect(knifeOnly('stretch')).toEqual(knifeOnly('neutral'))
      expect(knifeOnly('squash')).toEqual(knifeOnly('neutral'))
    }
  })

  test('lifted on his toes, the knife stays over the food and the arm gets shorter: the shoulder is what rises', () => {
    const still = paint({ knife: 'ready' })
    const up = paint({ knife: 'ready', lift: 4 })
    const knifeOf = (c: Canvas) => c.px.map((v, i) => (BLADE.includes(v as number) ? i : -1)).filter(i => i >= 0)
    expect(knifeOf(up)).toEqual(knifeOf(still))
    const armPixels = (c: Canvas) => pixelsOf(c, BODY_COLOR).filter(([x]) => x < BX).length
    expect(armPixels(up)).toBeLessThan(armPixels(still))
    // joined to the body at the lifted shoulder, and nothing hangs below it on that side
    expect([at(up, BX - 1, SHOULDER - 4), at(up, BX - 1, SHOULDER - 3)]).toEqual([BODY_COLOR, BODY_COLOR])
    expect(pixelsOf(up, BODY_COLOR).filter(([x, y]) => x < BX && y >= SHOULDER - 4 + 2)).toEqual([])
  })

  test('the whole of him lifts with the knife only where the arm can follow: the drawings that stand on the board cannot', () => {
    expect(() => pose({ knife: 'impact', lift: 2 })).toThrow()
    expect(() => pose({ knife: 'pull', lift: 2 })).toThrow()
    expect(() => pose({ knife: 'rest', lift: 2 })).toThrow()
    expect(() => pose({ knife: 'ready', lift: 3 })).toThrow() // a block (two pixels) at a time
    expect(() => pose({ knife: 'ready', lift: 6 })).toThrow() // the arm would not reach the shoulder
    expect(() => pose({ knife: 'hang', lift: 12 })).not.toThrow()
    expect(() => pose({ knife: 'ready', lift: 4 })).not.toThrow()
  })

  test('every drawing keeps every cell to two colours, for every body and lift', () => {
    const bad: string[] = []
    for (const knife of KNIVES)
      for (const body of ['neutral', 'inhale', 'squash', 'stretch'] as const)
        for (const lift of [0, 2, 4])
          for (const dx of [0, -4, -12]) {
            if (lift > 0 && ['rest', 'pull', 'impact'].includes(knife)) continue // these cannot be lifted
            const c = paint({ knife, body, lift, dx })
            for (let cy = 0; cy < H; cy += 2)
              for (let cx = 0; cx < W; cx += 2) {
                const vals = new Set([at(c, cx, cy), at(c, cx + 1, cy), at(c, cx, cy + 1), at(c, cx + 1, cy + 1)])
                if (vals.size > 2) bad.push(`${knife}/${body}/lift ${lift}/dx ${dx}: cell ${cx / 2},${cy / 2}`)
              }
          }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('reach and step', () => {
  test('the arm reaches out to a longer length: a bar from the body, as thick as the stub', () => {
    const c = paint({ reach: 10 })
    for (let x = BX - 10; x < BX; x++) expect([x, at(c, x, SHOULDER), at(c, x, SHOULDER + 1)]).toEqual([x, BODY_COLOR, BODY_COLOR])
    expect(at(c, BX - 11, SHOULDER)).toBeNull()
    expect(at(c, BX - 5, SHOULDER - 1)).toBeNull()
    expect(at(c, BX - 5, SHOULDER + 2)).toBeNull()
  })

  test('the default length is the model\'s stub', () => {
    expect(paint({ reach: 4 }).px).toEqual(paint().px)
  })

  test('the arm is an even number of pixels, at least the stub\'s four', () => {
    expect(() => pose({ reach: 3 })).toThrow()
    expect(() => pose({ reach: 2 })).toThrow()
    expect(() => pose({ reach: 7 })).toThrow()
  })

  test('stepping across moves the whole of him, whole model pixels at a time', () => {
    const still = paint()
    const stepped = paint({ dx: -6 })
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 6; x++) expect(at(stepped, x, y)).toEqual(at(still, x + 6, y))
    expect(() => pose({ dx: 3 })).toThrow()
  })
})

const TOOLS = ['spoon_a', 'spoon_b', 'spoon_c', 'shaker_hold', 'shaker_up', 'shaker_down', 'plate_hold', 'plate_up', 'phone_0', 'phone_1', 'phone_2', 'phone_3'] as const
const TOOL_COLOURS = new Set<number>(TOOLS.flatMap(t => [...colorsOf(t)]).filter(v => v !== BODY_COLOR))
/** The body's right edge: where the right arm leaves it. */
const BR = CX + 13

describe('a tool in the right hand', () => {
  test('every drawing joins the body at the right shoulder and holds something that is not the body', () => {
    for (const tool of TOOLS) {
      const c = paint({ tool })
      expect([tool, at(c, BR, SHOULDER), at(c, BR, SHOULDER + 1)]).toEqual([tool, BODY_COLOR, BODY_COLOR])
      expect([tool, c.px.some(v => v !== null && TOOL_COLOURS.has(v))]).toEqual([tool, true])
    }
  })

  test('it takes the place of the right arm; the left side of the body is as before', () => {
    const plain = paint()
    const held = paint({ tool: 'spoon_a' })
    for (let y = 0; y < H; y++) for (let x = 0; x < CX; x++) expect(at(held, x, y)).toEqual(at(plain, x, y))
    // the elbow is raised: a pixel of the arm well above the stub's row
    expect(at(held, BR + 2, SHOULDER - 6)).toBe(BODY_COLOR)
    expect(at(plain, BR + 2, SHOULDER - 6)).toBeNull()
  })

  test('the tool keeps its place whatever the body does', () => {
    for (const tool of TOOLS) {
      const only = (body: Pose['body']) => paint({ tool, body }).px.map((v, i) => (v !== null && TOOL_COLOURS.has(v) ? i : -1)).filter(i => i >= 0)
      expect(only('stretch')).toEqual(only('neutral'))
      expect(only('squash')).toEqual(only('neutral'))
    }
  })

  test('it stays over the pot, and goes with him if he steps across', () => {
    const only = (dx: number) => paint({ tool: 'spoon_b', dx }).px.map((v, i) => (v !== null && TOOL_COLOURS.has(v) ? i % W : -1)).filter(i => i >= 0)
    expect(only(-4)).toEqual(only(0).map(x => x - 4))
  })

  test('a tool and a lifted body do not go together: the arm would have to stretch', () => {
    expect(() => pose({ tool: 'spoon_a', lift: 2 })).toThrow()
  })

  test('every drawing keeps every cell to two colours, with every body', () => {
    const bad: string[] = []
    for (const tool of TOOLS)
      for (const body of ['neutral', 'inhale', 'squash', 'stretch'] as const)
        for (const dx of [0, -4]) {
          const c = paint({ tool, body, dx })
          for (let cy = 0; cy < H; cy += 2)
            for (let cx = 0; cx < W; cx += 2) {
              const vals = new Set([at(c, cx, cy), at(c, cx + 1, cy), at(c, cx, cy + 1), at(c, cx + 1, cy + 1)])
              if (vals.size > 2) bad.push(`${tool}/${body}/dx ${dx}: cell ${cx / 2},${cy / 2}`)
            }
        }
    expect(bad.slice(0, 5)).toEqual([])
  })
})
