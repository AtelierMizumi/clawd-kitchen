// Steam: wisps of braille dots rising from a source, swaying, looping.
// Positions are in braille dots (2 per cell across, 4 down).
import type { Dot, Fx } from './raster'

export type SteamOptions = { count: number; lifeMs: number; rise: number; sway: number; color: number }

const toFx = (x: number, y: number, color: number): Fx => {
  const col = Math.floor(x / 2)
  const row = Math.floor(y / 4)
  const dot: Dot = [x - col * 2, y - row * 4]
  return { col, row, dots: [dot], color }
}

export const steam = (t: number, source: { x: number; y: number }, o: SteamOptions): Fx[] => {
  const fx: Fx[] = []
  for (let i = 0; i < o.count; i++) {
    // Each particle lives one life, offset so they leave the source in turn.
    const shifted = t + (i * o.lifeMs) / o.count
    const age = (((shifted % o.lifeMs) + o.lifeMs) % o.lifeMs) / o.lifeMs
    const y = source.y - Math.round(age * o.rise)
    const x = source.x + Math.round(Math.sin(age * Math.PI * 2 + i * 1.7) * o.sway)
    fx.push(toFx(x, y, o.color))
    if (y + 1 <= source.y) fx.push(toFx(x, y + 1, o.color))
  }
  return fx
}
