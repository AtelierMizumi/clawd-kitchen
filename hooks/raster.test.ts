// Spec for the pixel → terminal cell encoder (hooks/lib/raster.ts).
// Each terminal cell shows two square pixels with `▀`/`▄`: the foreground
// paints one half and the background the other. Empty pixels keep the
// terminal's own colour (DEFAULT) so the scene stays transparent.
import { describe, expect, test } from 'claude-code/testing'

import {
  DEFAULT,
  braille,
  createCanvas,
  draw,
  encodeCells,
  overlayFx,
  toCells,
} from './lib/raster'

const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const SPACE = 0x20
const A = 0xd97757
const B = 0x1f1a17

const cellAt = (cells: Uint32Array, i: number) => Array.from(cells.slice(i * 3, i * 3 + 3))

describe('toCells', () => {
  test('empty top and bottom is a space on the default colours', () => {
    const c = createCanvas(1, 2)
    expect(cellAt(toCells(c), 0)).toEqual([SPACE, DEFAULT, DEFAULT])
  })

  test('top only is an upper half block on the default background', () => {
    const c = createCanvas(1, 2)
    c.px[0] = A
    expect(cellAt(toCells(c), 0)).toEqual([UPPER, A, DEFAULT])
  })

  test('bottom only is a lower half block on the default background', () => {
    const c = createCanvas(1, 2)
    c.px[1] = B
    expect(cellAt(toCells(c), 0)).toEqual([LOWER, B, DEFAULT])
  })

  test('both halves are an upper half block, top as fg and bottom as bg', () => {
    const c = createCanvas(1, 2)
    c.px[0] = A
    c.px[1] = B
    expect(cellAt(toCells(c), 0)).toEqual([UPPER, A, B])
  })

  test('an odd height pads the last row with transparent pixels', () => {
    const c = createCanvas(2, 3)
    c.px[2 * 2 + 1] = A // bottom-right pixel, third row
    const cells = toCells(c)
    expect(cells.length).toBe(2 * 2 * 3)
    expect(cellAt(cells, 3)).toEqual([UPPER, A, DEFAULT])
  })
})

describe('draw', () => {
  const sprite = { width: 2, height: 2, pixels: [A, null, null, B] }

  test('copies opaque pixels and leaves transparent ones untouched', () => {
    const c = createCanvas(2, 2)
    c.px[1] = B
    draw(c, sprite, 0, 0)
    expect(c.px).toEqual([A, B, null, B])
  })

  test('clips pixels that fall outside the canvas', () => {
    const c = createCanvas(2, 2)
    draw(c, sprite, 1, 1)
    expect(c.px).toEqual([null, null, null, A])
    // Only the sprite's bottom-right pixel (B) lands inside, at (0, 0).
    draw(c, sprite, -1, -1)
    expect(c.px).toEqual([B, null, null, A])
  })

  test('mirrors horizontally when flipped', () => {
    const c = createCanvas(2, 2)
    draw(c, sprite, 0, 0, { flip: true })
    expect(c.px).toEqual([null, A, B, null])
  })
})

describe('braille', () => {
  test('no dots is the blank braille pattern', () => {
    expect(braille([])).toBe(0x2800)
  })

  test('dot positions follow the Unicode braille bit order', () => {
    expect(braille([[0, 0]])).toBe(0x2801)
    expect(braille([[0, 3]])).toBe(0x2840)
    expect(braille([[1, 0]])).toBe(0x2808)
    expect(braille([[1, 3]])).toBe(0x2880)
    expect(braille([[0, 0], [1, 1], [0, 2]])).toBe(0x2800 + 0x01 + 0x10 + 0x04)
  })

  test('ignores dots outside the 2×4 cell', () => {
    expect(braille([[2, 0], [0, 4], [-1, 0]])).toBe(0x2800)
  })
})

describe('overlayFx', () => {
  test('puts braille in an empty cell with its colour', () => {
    const cells = toCells(createCanvas(2, 2))
    overlayFx(cells, 2, [{ col: 1, row: 0, dots: [[0, 0]], color: A }])
    expect(cellAt(cells, 1)).toEqual([0x2801, A, DEFAULT])
  })

  test('never covers a cell that already shows pixels', () => {
    const c = createCanvas(1, 2)
    c.px[0] = B
    const cells = toCells(c)
    overlayFx(cells, 1, [{ col: 0, row: 0, dots: [[0, 0]], color: A }])
    expect(cellAt(cells, 0)).toEqual([UPPER, B, DEFAULT])
  })

  test('merges dots of two effects in the same cell', () => {
    const cells = toCells(createCanvas(1, 2))
    overlayFx(cells, 1, [
      { col: 0, row: 0, dots: [[0, 0]], color: A },
      { col: 0, row: 0, dots: [[1, 3]], color: B },
    ])
    expect(cellAt(cells, 0)[0]).toBe(0x2881)
  })
})

describe('encodeCells', () => {
  test('is padded base64 of little-endian u32 triplets', () => {
    const cells = Uint32Array.of(0x2588, 0xff8800, DEFAULT)
    const bytes = Uint8Array.fromBase64(encodeCells(cells))
    expect(Array.from(bytes)).toEqual([
      0x88, 0x25, 0, 0, 0x00, 0x88, 0xff, 0, 0, 0, 0, 0x01,
    ])
  })
})
