// Quadrant Raster encoder: renders 2x2 sub-pixels per terminal cell,
// doubling horizontal resolution over standard half blocks (8x8 -> 4x8 sub-pixels).

export const DEFAULT = 0x01000000

export type Color = number
export type Canvas = { width: number; height: number; px: (Color | null)[] }

/**
 * 16 Unicode quadrant and half-block glyphs corresponding to mask bits:
 * bit 0: Upper-Left (UL)
 * bit 1: Upper-Right (UR)
 * bit 2: Lower-Left (LL)
 * bit 3: Lower-Right (LR)
 */
export const QUAD_GLYPHS = [
  0x0020, // 0b0000: ' '  (empty)
  0x2598, // 0b0001: '▘'  (UL)
  0x259D, // 0b0010: '▝'  (UR)
  0x2580, // 0b0011: '▀'  (UL, UR = Upper Half)
  0x2596, // 0b0100: '▖'  (LL)
  0x258C, // 0b0101: '▌'  (UL, LL = Left Half)
  0x259E, // 0b0110: '▞'  (UR, LL = Diagonal)
  0x259B, // 0b0111: '▛'  (UL, UR, LL)
  0x2597, // 0b1000: '▗'  (LR)
  0x259A, // 0b1001: '▚'  (UL, LR = Diagonal)
  0x2590, // 0b1010: '▐'  (UR, LR = Right Half)
  0x259C, // 0b1011: '▜'  (UL, UR, LR)
  0x2584, // 0b1100: '▄'  (LL, LR = Lower Half)
  0x2599, // 0b1101: '▙'  (UL, LL, LR)
  0x259F, // 0b1110: '▟'  (UR, LL, LR)
  0x2588, // 0b1111: '█'  (Full block)
] as const

/**
 * Special fractional characters for micro-details:
 * LOWER_QUARTER: '▂' (1/4 block, 2/8 height) - used for eyelid blinks
 * LOWER_EIGHTH:  ' ' (1/8 block, 1/8 height) - used for feet shadows
 */
export const GLYPH_LOWER_QUARTER = 0x2582 // '▂'
export const GLYPH_LOWER_EIGHTH = 0x2581  // ' '

/**
 * Encodes a 2W x 2H Canvas of sub-pixels into W x H terminal cells.
 * Each cell holds 3 uint32 numbers: [codepoint, fg, bg].
 */
export const toQuadrantCells = (c: Canvas): Uint32Array => {
  const cellCols = Math.ceil(c.width / 2)
  const cellRows = Math.ceil(c.height / 2)
  const cells = new Uint32Array(cellCols * cellRows * 3)

  for (let r = 0; r < cellRows; r++) {
    const y0 = r * 2
    const y1 = y0 + 1
    for (let col = 0; col < cellCols; col++) {
      const x0 = col * 2
      const x1 = x0 + 1

      const pUL = c.px[y0 * c.width + x0] ?? null
      const pUR = x1 < c.width ? (c.px[y0 * c.width + x1] ?? null) : null
      const pLL = y1 < c.height ? (c.px[y1 * c.width + x0] ?? null) : null
      const pLR = y1 < c.height && x1 < c.width ? (c.px[y1 * c.width + x1] ?? null) : null

      const sub = [pUL, pUR, pLL, pLR]
      const cellIdx = (r * cellCols + col) * 3

      // Collect unique non-null colors and their counts
      const counts = new Map<Color, number>()
      for (const p of sub) {
        if (p != null) {
          counts.set(p, (counts.get(p) ?? 0) + 1)
        }
      }

      if (counts.size === 0) {
        cells.set([0x0020, DEFAULT, DEFAULT], cellIdx)
        continue
      }

      if (counts.size === 1) {
        const [color, count] = Array.from(counts.entries())[0]!
        if (count === 4) {
          cells.set([0x2588, color, DEFAULT], cellIdx)
        } else {
          let mask = 0
          if (pUL === color) mask |= 1
          if (pUR === color) mask |= 2
          if (pLL === color) mask |= 4
          if (pLR === color) mask |= 8
          cells.set([QUAD_GLYPHS[mask]!, color, DEFAULT], cellIdx)
        }
        continue
      }

      // Fast-path: classic horizontal pair where upper half is color A and lower half is color B
      // Matches standard toCells convention: UPPER half block (0x2580) with top=fg, bottom=bg
      if (pUL !== null && pUL === pUR && pLL !== null && pLL === pLR && pUL !== pLL) {
        cells.set([0x2580, pUL, pLL], cellIdx)
        continue
      }

      const hasNull = sub.some(p => p == null)
      if (hasNull) {
        // Transparent sub-pixels present: bg is DEFAULT, fg is dominant color
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
        const fg = sorted[0]![0]
        let mask = 0
        if (pUL === fg) mask |= 1
        if (pUR === fg) mask |= 2
        if (pLL === fg) mask |= 4
        if (pLR === fg) mask |= 8
        cells.set([QUAD_GLYPHS[mask]!, fg, DEFAULT], cellIdx)
      } else {
        // Two distinct opaque colors without exact upper/lower split:
        // sort by frequency, fg is the pattern, bg is the background
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
        const bg = sorted[0]![0]
        const fg = sorted[1]![0]
        let mask = 0
        if (pUL === fg) mask |= 1
        if (pUR === fg) mask |= 2
        if (pLL === fg) mask |= 4
        if (pLR === fg) mask |= 8
        cells.set([QUAD_GLYPHS[mask]!, fg, bg], cellIdx)
      }
    }
  }

  return cells
}

/**
 * Creates a high-resolution sub-pixel canvas.
 */
export const createSubCanvas = (cellCols: number, cellRows: number): Canvas => ({
  width: cellCols * 2,
  height: cellRows * 2,
  px: new Array<Color | null>(cellCols * 2 * cellRows * 2).fill(null),
})

/**
 * Helper to upscale a classic 1x2 half-block Canvas into a 2x2 Quadrant Canvas.
 * Horizontally doubles each pixel, keeping 100% fidelity with original sprites.
 */
export const upscaleHalfBlockCanvas = (classic: Canvas): Canvas => {
  const out = createSubCanvas(classic.width, Math.ceil(classic.height / 2))
  for (let y = 0; y < classic.height; y++) {
    for (let x = 0; x < classic.width; x++) {
      const color = classic.px[y * classic.width + x]
      out.px[y * out.width + (x * 2)] = color
      out.px[y * out.width + (x * 2 + 1)] = color
    }
  }
  return out
}
