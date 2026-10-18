// Spec for the art itself. A terminal cell holds two colours at most (transparent counts as one), so art that is
// still must never need a third, and art that moves can only lapse where moving objects share a cell with the scene.
// What may never be lost, whatever moves, is Clawd's face: v2 of the quadrant experiment ate his eyes at cell edges.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import type { Mood } from './lib/mood'
import { playback } from './lib/playback'
import { CELL_H, CELL_W, overColoured, toCells } from './lib/raster'
import { renderScene } from './lib/scene'

const MOODS: Mood[] = ['idle', 'typing', 'thinking', 'stir', 'season', 'serve', 'smoke', 'sleep', 'simmer']
const scene = DATA.scenes.comfy
const EYE = 0x2b1f1a

// Moods whose scene never moves but for Clawd, who is drawn on the cell grid: not one cell may need a third colour.
const STILL: Mood[] = ['idle', 'sleep', 'smoke']
// For the rest, how many cells in one frame may need a third colour. First set from the design (a flying bit touches a
// cell; a slice, the held knife, the shaker or the phone a few; a pan or a dish that moves by an odd row, about a dozen),
// before anything was measured; then lowered to the measured worst plus a little room, so a regression shows.
const BUDGET: Partial<Record<Mood, number>> = { typing: 8, thinking: 6, season: 3, simmer: 1, stir: 3, serve: 1 }

describe('still scenes never need a third colour in a cell', () => {
  for (const mood of STILL) {
    test(`${mood}, every tick of ninety seconds`, () => {
      for (const { t, pose, action } of playback(mood, 90_000, { warm: 1000 })) {
        const bad = overColoured(renderScene('comfy', pose, action, t))
        expect(`${mood} t=${t} ${JSON.stringify(bad.slice(0, 3))}`).toBe(`${mood} t=${t} []`)
      }
    })
  }
})

describe('moving scenes keep to a budget of lapses per frame', () => {
  for (const mood of MOODS.filter(m => !STILL.includes(m))) {
    test(`${mood}: at most ${BUDGET[mood]} cells in any frame of a minute`, () => {
      for (const { t, pose, action } of playback(mood, 60_000, { warm: 1000 })) {
        const n = overColoured(renderScene('comfy', pose, action, t)).length
        expect(`${mood} t=${t} ${n <= BUDGET[mood]!}`).toBe(`${mood} t=${t} true`)
      }
    })
  }
})

describe("Clawd's eyes survive the encoding, in every mood at every tick", () => {
  for (const mood of MOODS) {
    test(`${mood}: every cell with an eye pixel keeps the eye colour`, () => {
      const cols = scene.width / CELL_W
      for (const { t, pose, action } of playback(mood, 30_000, { warm: 1000 })) {
        const c = renderScene('comfy', pose, action, t)
        const cells = toCells(c)
        for (let i = 0; i < c.px.length; i++) {
          if (c.px[i] !== EYE) continue
          const x = i % c.width
          const y = Math.floor(i / c.width)
          const cell = Math.floor(y / CELL_H) * cols + Math.floor(x / CELL_W)
          const kept = cells[cell * 3 + 1] === EYE || cells[cell * 3 + 2] === EYE
          expect(`${mood} t=${t} (${x},${y}) ${kept}`).toBe(`${mood} t=${t} (${x},${y}) true`)
        }
      }
    })
  }
})

describe('the sprite sheets', () => {
  test('no frame is wider than the scene', () => {
    for (const [name, f] of Object.entries(DATA.frames)) expect(`${name} ${f.width <= scene.width}`).toBe(`${name} true`)
  })

  test('the scene is a whole number of cells', () => {
    expect(scene.width % CELL_W).toBe(0)
    expect(scene.height % CELL_H).toBe(0)
  })
})
