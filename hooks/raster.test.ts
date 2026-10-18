// Spec for the pixel → terminal cell encoder (hooks/lib/raster.ts).
// Each terminal cell shows a 2×2 block of pixels with quadrant glyphs: the foreground
// paints the lit pixels and the background the rest. Empty pixels keep the terminal's
// own colour (DEFAULT) so the scene stays transparent. Claude Code refuses code points
// outside the BMP, so quadrants (U+2596..U+259F) are the finest blocks available.
import { describe, expect, test } from 'claude-code/testing'

import {
  CELL_H,
  CELL_W,
  DEFAULT,
  braille,
  createCanvas,
  draw,
  encodeCells,
  overColoured,
  overlayFx,
  pxToDots,
  quadrantGlyph,
  toCells,
} from './lib/raster'

const SPACE = 0x20
const A = 0xd97757
const B = 0x1f1a17
const C = 0x7cc456

const cellAt = (cells: Uint32Array, i: number) => Array.from(cells.slice(i * 3, i * 3 + 3))
/** Paint pixels of a 2×2 cell: bit0 top-left, bit1 top-right, bit2 bottom-left, bit3 bottom-right. */
const paint = (c: ReturnType<typeof createCanvas>, mask: number, color: number, ox = 0, oy = 0) => {
  for (let bit = 0; bit < 4; bit++) {
    if (mask & (1 << bit)) c.px[(oy + Math.floor(bit / 2)) * c.width + ox + (bit % 2)] = color
  }
}

describe('grid', () => {
  test('a cell is 2 pixels wide and 2 tall', () => {
    expect([CELL_W, CELL_H]).toEqual([2, 2])
  })

  test('pxToDots maps a pixel to braille dots: one dot across, two down', () => {
    expect(pxToDots(0, 0)).toEqual([0, 0])
    expect(pxToDots(5, 3)).toEqual([5, 6])
    expect(pxToDots(7, 1)).toEqual([7, 2])
  })
})

describe('quadrantGlyph', () => {
  test('names the Unicode quadrants and half blocks for the masks they light', () => {
    expect(quadrantGlyph(0)).toBe(SPACE)
    expect(quadrantGlyph(0b0001)).toBe(0x2598) // ▘ upper left
    expect(quadrantGlyph(0b0010)).toBe(0x259d) // ▝ upper right
    expect(quadrantGlyph(0b0011)).toBe(0x2580) // ▀ upper half
    expect(quadrantGlyph(0b0100)).toBe(0x2596) // ▖ lower left
    expect(quadrantGlyph(0b0101)).toBe(0x258c) // ▌ left half
    expect(quadrantGlyph(0b0110)).toBe(0x259e) // ▞ upper right and lower left
    expect(quadrantGlyph(0b0111)).toBe(0x259b) // ▛
    expect(quadrantGlyph(0b1000)).toBe(0x2597) // ▗ lower right
    expect(quadrantGlyph(0b1001)).toBe(0x259a) // ▚ upper left and lower right
    expect(quadrantGlyph(0b1010)).toBe(0x2590) // ▐ right half
    expect(quadrantGlyph(0b1011)).toBe(0x259c) // ▜
    expect(quadrantGlyph(0b1100)).toBe(0x2584) // ▄ lower half
    expect(quadrantGlyph(0b1101)).toBe(0x2599) // ▙
    expect(quadrantGlyph(0b1110)).toBe(0x259f) // ▟
    expect(quadrantGlyph(0b1111)).toBe(0x2588) // █
  })

  test('all 16 glyphs are distinct and inside the BMP, the only range Claude Code accepts', () => {
    const glyphs = Array.from({ length: 16 }, (_, m) => quadrantGlyph(m))
    expect(new Set(glyphs).size).toBe(16)
    for (const g of glyphs) expect(g).toBeLessThan(0x10000)
  })
})

describe('toCells', () => {
  test('an empty cell is a space on the default colours', () => {
    expect(cellAt(toCells(createCanvas(2, 2)), 0)).toEqual([SPACE, DEFAULT, DEFAULT])
  })

  test('one colour on transparent paints its mask on the default background', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b0111, A)
    expect(cellAt(toCells(c), 0)).toEqual([0x259b, A, DEFAULT])
  })

  test('all four pixels one colour is a full block', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b1111, A)
    expect(cellAt(toCells(c), 0)).toEqual([0x2588, A, DEFAULT])
  })

  test('two opaque colours: fg is the colour of the top-left pixel, bg the other', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b0011, A) // top row A
    paint(c, 0b1100, B) // bottom row B
    expect(cellAt(toCells(c), 0)).toEqual([0x2580, A, B])
  })

  test('two opaque colours split left and right use the half blocks', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b0101, A)
    paint(c, 0b1010, B)
    expect(cellAt(toCells(c), 0)).toEqual([0x258c, A, B])
  })

  test('a colour next to transparency keeps the colour as fg even from a lower pixel', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b1100, B)
    expect(cellAt(toCells(c), 0)).toEqual([0x2584, B, DEFAULT])
  })

  test('a canvas whose size is not a multiple of the cell pads with transparent pixels', () => {
    const c = createCanvas(3, 3)
    c.px[2 * 3 + 2] = A // last pixel: column 2, row 2
    const cells = toCells(c)
    expect(cells.length).toBe(2 * 2 * 3) // 2 columns x 2 rows
    expect(cellAt(cells, 3)).toEqual([0x2598, A, DEFAULT]) // top-left of the last cell
  })

  test('three colours in one cell degrade without throwing: the most frequent two win', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b0011, A) // two pixels A
    paint(c, 0b0100, B)
    paint(c, 0b1000, C)
    const cell = cellAt(toCells(c), 0)
    expect([cell[1], cell[2]]).toContain(A)
    expect(cell[0]).toBeGreaterThan(0)
    expect(cell[0]).toBeLessThan(0x10000)
  })

  test('every cell of a busy canvas uses a BMP glyph', () => {
    const c = createCanvas(8, 8)
    for (let i = 0; i < c.px.length; i++) c.px[i] = [A, B, C, null][(i * 7 + (i >> 3)) % 4]!
    for (let i = 0; i < toCells(c).length; i += 3) expect(toCells(c)[i]!).toBeLessThan(0x10000)
  })
})

describe('overColoured', () => {
  test('is empty when every cell has at most two values, transparent counting as one', () => {
    const c = createCanvas(4, 2)
    paint(c, 0b0011, A)
    paint(c, 0b1100, B, 2, 0) // second cell: B and transparent
    expect(overColoured(c)).toEqual([])
  })

  test('reports a cell with two colours plus transparency', () => {
    const c = createCanvas(4, 2)
    paint(c, 0b0001, A, 2, 0)
    paint(c, 0b0010, B, 2, 0)
    expect(overColoured(c)).toEqual([{ col: 1, row: 0 }])
  })

  test('reports a cell with three opaque colours', () => {
    const c = createCanvas(2, 2)
    paint(c, 0b0011, A)
    paint(c, 0b0100, B)
    paint(c, 0b1000, C)
    expect(overColoured(c)).toEqual([{ col: 0, row: 0 }])
  })

  test('a cell cut by the canvas edge does not count the missing pixels as a value', () => {
    const c = createCanvas(3, 2)
    paint(c, 0b0001, A, 2, 0) // the right cell has one pixel inside the canvas
    expect(overColoured(c)).toEqual([])
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
    const cells = toCells(createCanvas(4, 2))
    overlayFx(cells, 2, [{ col: 1, row: 0, dots: [[0, 0]], color: A }])
    expect(cellAt(cells, 1)).toEqual([0x2801, A, DEFAULT])
  })

  test('never covers a cell that already shows pixels', () => {
    const c = createCanvas(2, 2)
    c.px[0] = B
    const cells = toCells(c)
    overlayFx(cells, 1, [{ col: 0, row: 0, dots: [[0, 0]], color: A }])
    expect(cellAt(cells, 0)).toEqual([0x2598, B, DEFAULT])
  })

  test('merges dots of two effects in the same cell', () => {
    const cells = toCells(createCanvas(2, 2))
    overlayFx(cells, 1, [
      { col: 0, row: 0, dots: [[0, 0]], color: A },
      { col: 0, row: 0, dots: [[1, 3]], color: B },
    ])
    expect(cellAt(cells, 0)[0]).toBe(0x2881)
  })
})

describe('encodeCells', () => {
  test('round-trips quadrant glyphs', () => {
    const cells = Uint32Array.of(0x259b, A, DEFAULT)
    const back = new Uint32Array(Uint8Array.fromBase64(encodeCells(cells)).buffer)
    expect(Array.from(back)).toEqual([0x259b, A, DEFAULT])
  })

  test('is padded base64 of little-endian u32 triplets', () => {
    const cells = Uint32Array.of(0x2588, 0xff8800, DEFAULT)
    const bytes = Uint8Array.fromBase64(encodeCells(cells))
    expect(Array.from(bytes)).toEqual([
      0x88, 0x25, 0, 0, 0x00, 0x88, 0xff, 0, 0, 0, 0, 0x01,
    ])
  })
})
