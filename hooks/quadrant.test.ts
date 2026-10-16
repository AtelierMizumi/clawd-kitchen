import { describe, expect, test } from 'claude-code/testing'
import {
  DEFAULT,
  QUAD_GLYPHS,
  createSubCanvas,
  toQuadrantCells,
  upscaleHalfBlockCanvas,
} from './lib/quadrant'
import { createCanvas, toCells } from './lib/raster'

describe('toQuadrantCells', () => {
  test('encodes empty 2x2 cells as space with default colors', () => {
    const c = createSubCanvas(1, 1)
    const cells = toQuadrantCells(c)
    expect(Array.from(cells)).toEqual([0x0020, DEFAULT, DEFAULT])
  })

  test('encodes full solid 2x2 cells as full block', () => {
    const c = createSubCanvas(1, 1)
    c.px.fill(0xff0000)
    const cells = toQuadrantCells(c)
    expect(Array.from(cells)).toEqual([0x2588, 0xff0000, DEFAULT])
  })

  test('encodes all 16 quadrant masks with single foreground color', () => {
    for (let mask = 0; mask < 16; mask++) {
      const c = createSubCanvas(1, 1)
      if (mask & 1) c.px[0] = 0xd77757 // UL
      if (mask & 2) c.px[1] = 0xd77757 // UR
      if (mask & 4) c.px[2] = 0xd77757 // LL
      if (mask & 8) c.px[3] = 0xd77757 // LR

      const cells = toQuadrantCells(c)
      const expectedChar = QUAD_GLYPHS[mask]!
      if (mask === 0) {
        expect(cells[0]).toBe(0x0020)
      } else if (mask === 15) {
        expect(cells[0]).toBe(0x2588)
        expect(cells[1]).toBe(0xd77757)
      } else {
        expect(cells[0]).toBe(expectedChar)
        expect(cells[1]).toBe(0xd77757)
      }
    }
  })

  test('encodes two colors with foreground and background correctly', () => {
    const c = createSubCanvas(1, 1)
    const COLOR_A = 0x112233
    const COLOR_B = 0x445566

    // UL, UR are COLOR_A (upper half), LL, LR are COLOR_B (lower half)
    c.px[0] = COLOR_A
    c.px[1] = COLOR_A
    c.px[2] = COLOR_B
    c.px[3] = COLOR_B

    const cells = toQuadrantCells(c)
    // One will be fg, one will be bg, matching a half block.
    expect([0x2580, 0x2584]).toContain(cells[0])
    expect([COLOR_A, COLOR_B]).toContain(cells[1])
    expect([COLOR_A, COLOR_B]).toContain(cells[2])
  })

  test('is 100% equivalent to half-block toCells when pixels are horizontally doubled', () => {
    const classic = createCanvas(3, 4)
    // fill some pattern
    classic.px[0 * 3 + 0] = 0x123456
    classic.px[1 * 3 + 0] = 0x654321
    classic.px[0 * 3 + 1] = 0xaabbcc
    classic.px[1 * 3 + 1] = null
    classic.px[2 * 3 + 2] = 0xddeeff

    const classicCells = toCells(classic)
    const upscaled = upscaleHalfBlockCanvas(classic)
    const quadrantCells = toQuadrantCells(upscaled)

    expect(quadrantCells.length).toBe(classicCells.length)
    for (let i = 0; i < classicCells.length; i += 3) {
      expect(quadrantCells[i]).toBe(classicCells[i])
      expect(quadrantCells[i + 1]).toBe(classicCells[i + 1])
      expect(quadrantCells[i + 2]).toBe(classicCells[i + 2])
    }
  })
})
