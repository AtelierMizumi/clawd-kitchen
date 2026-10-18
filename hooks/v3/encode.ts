// Eighth-block edges: where one edge of a smooth object (the table, a pan, a lid, an eyelid) crosses a cell, the
// cell shows the edge at its real position to an eighth of a cell instead of the quadrant grid's half. This is what
// lets a slide or a lift move in eighths and read as fluid in plain text.
import { DEFAULT } from '../lib/raster'
import type { Color } from '../lib/raster'

/** The side of the cell the solid is on. */
export type Side = 'left' | 'right' | 'top' | 'bottom'
export type Cell = [codePoint: number, fg: Color, bg: Color]

const SPACE = 0x20
const FULL = 0x2588
/** Left n/8 of a cell, n = 1..7: ▏▎▍▌▋▊▉. */
const leftEighths = (n: number) => 0x2590 - n
/** Lower n/8 of a cell, n = 1..7: ▁▂▃▄▅▆▇. */
const lowerEighths = (n: number) => 0x2580 + n
/** What exists for a right or top solid against the terminal's background: none, an eighth, a half, all. */
const SNAPS = [0, 1, 4, 8] as const
const RIGHT = { 1: 0x2595, 4: 0x2590 } as const // ▕ ▐
const TOP = { 1: 0x2594, 4: 0x2580 } as const // ▔ ▀

/** The cell an edge makes: `fill` (0..1) of it is `solid`, on `side`; the rest is `other`. */
export const eighthCell = (side: Side, fill: number, solid: Color, other: Color): Cell => {
  let n = Math.round(Math.min(1, Math.max(0, fill)) * 8)
  if (n === 0) return [SPACE, solid, other]
  if (n === 8) return [FULL, solid, other]
  if (side === 'left') return [leftEighths(n), solid, other]
  if (side === 'bottom') return [lowerEighths(n), solid, other]
  if (other !== DEFAULT) return side === 'right' ? [leftEighths(8 - n), other, solid] : [lowerEighths(8 - n), other, solid]
  // The terminal's background can only be a background, so the solid must be the foreground: snap to what exists.
  n = SNAPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best))
  if (n === 0) return [SPACE, solid, other]
  if (n === 8) return [FULL, solid, other]
  return [(side === 'right' ? RIGHT : TOP)[n as 1 | 4], solid, other]
}
