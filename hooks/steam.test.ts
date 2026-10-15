// Spec for steam particles (hooks/lib/steam.ts): braille dots that rise from
// a source, sway sideways, and loop forever.
import { describe, expect, test } from 'claude-code/testing'

import { steam } from './lib/steam'

const source = { x: 20, y: 12 } // in braille dots
const opts = { count: 3, lifeMs: 2000, rise: 10, sway: 1, color: 0xc9ced6 }

const dotsOf = (t: number) =>
  steam(t, source, opts).flatMap(f => f.dots.map(([dx, dy]) => ({ x: f.col * 2 + dx, y: f.row * 4 + dy })))

describe('steam', () => {
  test('each particle is a wisp: a head dot and a tail dot just below it', () => {
    const fx = steam(500, source, { ...opts, count: 1 })
    const dots = fx.flatMap(f => f.dots.map(([dx, dy]) => ({ x: f.col * 2 + dx, y: f.row * 4 + dy })))
    expect(fx.every(f => f.color === opts.color)).toBe(true)
    expect(dots).toHaveLength(2)
    const [head, tail] = [...dots].sort((a, b) => a.y - b.y)
    expect(tail!.y).toBe(head!.y + 1)
  })

  test('a tail never hangs below the source', () => {
    for (let t = 0; t < 2000; t += 10) {
      for (const f of steam(t, source, opts)) for (const [, dy] of f.dots) expect(f.row * 4 + dy).toBeLessThanOrEqual(source.y)
    }
  })

  test('every dot is at or above the source and within the rise', () => {
    for (let t = 0; t < 4000; t += 37) {
      expect(dotsOf(t).length).toBeGreaterThanOrEqual(opts.count)
      expect(dotsOf(t).length).toBeLessThanOrEqual(opts.count * 2)
      for (const d of dotsOf(t)) {
        expect(d.y).toBeLessThanOrEqual(source.y)
        expect(d.y).toBeGreaterThanOrEqual(source.y - opts.rise)
        expect(Math.abs(d.x - source.x)).toBeLessThanOrEqual(opts.sway)
      }
    }
  })

  test('a particle rises over its life', () => {
    const y = (t: number) => Math.min(...steam(t, source, { ...opts, count: 1 }).flatMap(f => f.dots.map(([, dy]) => f.row * 4 + dy)))
    expect(y(1500)).toBeLessThan(y(100))
  })

  test('loops: the same time one life later looks the same', () => {
    expect(steam(700, source, opts).length).toBeGreaterThanOrEqual(opts.count)
    expect(steam(700, source, opts)).toEqual(steam(700 + opts.lifeMs, source, opts))
  })

  test('particles are spread over the life, not bunched together', () => {
    const headY = (f: { row: number; dots: readonly (readonly [number, number])[] }) => f.row * 4 + Math.min(...f.dots.map(([, dy]) => dy))
    const heads = new Set(steam(0, source, opts).map(headY))
    expect(heads.size).toBeGreaterThan(1)
  })

  test('count 0 emits nothing', () => {
    expect(steam(0, source, { ...opts, count: 0 })).toEqual([])
  })
})
