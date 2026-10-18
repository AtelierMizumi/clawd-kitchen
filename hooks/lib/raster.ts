// Pixel canvas → Raster cells. Each terminal cell holds a 2×2 block of pixels
// drawn with quadrant glyphs; empty pixels keep the terminal's own colour.

/** `0x01000000`: the terminal's default colour in a Raster cell. */
export const DEFAULT = 0x01000000

const SPACE = 0x20
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

/** A cell is 2 pixels wide and 2 tall, shown with one quadrant glyph. */
export const CELL_W = 2
export const CELL_H = 2

/**
 * Glyphs lighting the pixels of a mask: bit 0 top-left, bit 1 top-right, bit 2 bottom-left, bit 3 bottom-right.
 * Claude Code accepts only BMP code points, so these Block Elements are the finest blocks there are.
 */
const QUADRANTS = [
  SPACE, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
] as const

export const quadrantGlyph = (mask: number): number => QUADRANTS[mask] ?? SPACE

const pixelAt = (c: Canvas, x: number, y: number): Color | null | undefined =>
  x < c.width && y < c.height ? (c.px[y * c.width + x] ?? null) : undefined

/** The four pixels of a cell, row-major; `undefined` marks a pixel outside the canvas. */
const cellPixels = (c: Canvas, col: number, row: number): (Color | null | undefined)[] => {
  const out: (Color | null | undefined)[] = []
  for (let dy = 0; dy < CELL_H; dy++) for (let dx = 0; dx < CELL_W; dx++) out.push(pixelAt(c, col * CELL_W + dx, row * CELL_H + dy))
  return out
}

const distinct = (px: readonly (Color | null | undefined)[]): (Color | null)[] => {
  const seen: (Color | null)[] = []
  for (const p of px) if (p !== undefined && !seen.includes(p)) seen.push(p)
  return seen
}

/** Cells that need more than two values (transparent counts as one): the art must avoid them. */
export const overColoured = (c: Canvas): { col: number; row: number }[] => {
  const out: { col: number; row: number }[] = []
  for (let row = 0; row < Math.ceil(c.height / CELL_H); row++) {
    for (let col = 0; col < Math.ceil(c.width / CELL_W); col++) {
      if (distinct(cellPixels(c, col, row)).length > 2) out.push({ col, row })
    }
  }
  return out
}

/** Reduce a cell with more than two values to its two most frequent (earlier pixel wins a tie). */
const degrade = (px: readonly (Color | null)[]): (Color | null)[] => {
  const values = distinct(px)
  const count = (v: Color | null) => px.filter(p => p === v).length
  const ranked = [...values].sort((a, b) => count(b) - count(a) || px.indexOf(a) - px.indexOf(b))
  const keep = ranked.slice(0, 2)
  return px.map(p => (keep.includes(p) ? p : keep[0]!))
}

const encodeCell = (raw: readonly (Color | null | undefined)[]): [number, Color, Color] => {
  let px = raw.map(p => p ?? null)
  if (distinct(raw).length > 2) px = degrade(px)
  const colours = distinct(px)
  const opaque = colours.filter((v): v is Color => v !== null)
  if (opaque.length === 0) return [SPACE, DEFAULT, DEFAULT]
  const fg = px[0] !== null && px[0] !== undefined ? px[0] : opaque[0]!
  const bg = opaque.find(v => v !== fg) ?? DEFAULT
  let mask = 0
  px.forEach((p, i) => {
    if (p === fg) mask |= 1 << i
  })
  return [quadrantGlyph(mask), fg, bg]
}

export const toCells = (c: Canvas): Uint32Array => {
  const cols = Math.ceil(c.width / CELL_W)
  const rows = Math.ceil(c.height / CELL_H)
  const cells = new Uint32Array(cols * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) cells.set(encodeCell(cellPixels(c, col, row)), (row * cols + col) * 3)
  }
  return cells
}

/** A pixel position as braille dots: a cell is 2×2 pixels and 2×4 dots, so one dot across and two down. */
export const pxToDots = (x: number, y: number): [number, number] => [x, y * 2]

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
