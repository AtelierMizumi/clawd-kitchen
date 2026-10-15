// Pixel canvas → Raster cells. Each terminal cell holds two square pixels
// stacked with half blocks; empty pixels keep the terminal's own colour.

/** `0x01000000`: the terminal's default colour in a Raster cell. */
export const DEFAULT = 0x01000000

const SPACE = 0x20
const UPPER = 0x2580
const LOWER = 0x2584
const BRAILLE = 0x2800

export type Color = number
export type Canvas = { width: number; height: number; px: (Color | null)[] }
export type Sprite = { width: number; height: number; pixels: readonly (Color | null)[] }
/** A braille dot: x in 0..1, y in 0..3 within one cell. */
export type Dot = readonly [x: number, y: number]
export type Fx = { col: number; row: number; dots: readonly Dot[]; color: Color }

export const createCanvas = (width: number, height: number): Canvas => ({
  width,
  height,
  px: new Array<Color | null>(width * height).fill(null),
})

export const draw = (
  c: Canvas,
  s: Sprite,
  x: number,
  y: number,
  { flip = false }: { flip?: boolean } = {},
): void => {
  for (let sy = 0; sy < s.height; sy++) {
    const cy = y + sy
    if (cy < 0 || cy >= c.height) continue
    for (let sx = 0; sx < s.width; sx++) {
      const color = s.pixels[sy * s.width + (flip ? s.width - 1 - sx : sx)]
      const cx = x + sx
      if (color == null || cx < 0 || cx >= c.width) continue
      c.px[cy * c.width + cx] = color
    }
  }
}

export const toCells = (c: Canvas): Uint32Array => {
  const rows = Math.ceil(c.height / 2)
  const cells = new Uint32Array(c.width * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < c.width; col++) {
      const top = c.px[row * 2 * c.width + col] ?? null
      const bottom = row * 2 + 1 < c.height ? (c.px[(row * 2 + 1) * c.width + col] ?? null) : null
      const i = (row * c.width + col) * 3
      if (top == null && bottom == null) cells.set([SPACE, DEFAULT, DEFAULT], i)
      else if (bottom == null) cells.set([UPPER, top!, DEFAULT], i)
      else if (top == null) cells.set([LOWER, bottom, DEFAULT], i)
      else cells.set([UPPER, top, bottom], i)
    }
  }
  return cells
}

const DOT_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

export const braille = (dots: readonly Dot[]): number => {
  let bits = 0
  for (const [x, y] of dots) {
    const bit = DOT_BITS[x]?.[y]
    if (bit) bits |= bit
  }
  return BRAILLE + bits
}

const isBraille = (cp: number) => cp >= BRAILLE && cp <= BRAILLE + 0xff

/** Draws braille effects into cells that show no pixels; later effects add dots. */
export const overlayFx = (cells: Uint32Array, columns: number, fx: readonly Fx[]): void => {
  const rows = cells.length / 3 / columns
  for (const { col, row, dots, color } of fx) {
    if (col < 0 || col >= columns || row < 0 || row >= rows) continue
    const i = (row * columns + col) * 3
    const cp = cells[i] ?? SPACE
    if (cp !== SPACE && !isBraille(cp)) continue
    const merged = isBraille(cp) ? cp | braille(dots) : braille(dots)
    if (merged === BRAILLE) continue
    cells[i] = merged
    cells[i + 1] = color
    cells[i + 2] = DEFAULT
  }
}

export const encodeCells = (cells: Uint32Array): string =>
  new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength).toBase64()
