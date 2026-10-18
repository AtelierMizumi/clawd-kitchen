// Spec for the prep table that Clawd pulls over while you type (hooks/lib/table.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { SLIDE_PX_PER_S, initialKitchen, kitchenStep, sinceArrived, sinceMood, slideTable } from './lib/table'

const { rest, work } = DATA.scenes.comfy.table
const T0 = 50_000
const dir = Math.sign(work - rest) // +1: the table comes in from the left
const travelMs = (Math.abs(work - rest) / SLIDE_PX_PER_S) * 1000

describe('slideTable', () => {
  test('moves toward the target at SLIDE_PX_PER_S', () => {
    expect(SLIDE_PX_PER_S).toBeGreaterThan(0)
    expect(slideTable(rest, work, 100)).toBe(rest + dir * SLIDE_PX_PER_S * 0.1)
    expect(slideTable(work, rest, 100)).toBe(work - dir * SLIDE_PX_PER_S * 0.1)
  })

  test('never overshoots the target, from either side', () => {
    expect(slideTable(work - dir, work, 5000)).toBe(work)
    expect(slideTable(rest + dir, rest, 5000)).toBe(rest)
  })

  test('stays put when it is there or no time has passed', () => {
    expect(slideTable(work, work, 100)).toBe(work)
    expect(slideTable(rest, work, 0)).toBe(rest)
  })
})

describe('kitchenStep', () => {
  test('starts with the table at rest and nobody has arrived', () => {
    const k = initialKitchen(T0)
    expect(k.tableX).toBe(rest)
    expect(sinceArrived(k, T0 + 999)).toBe(0)
  })

  test('typing pulls the table toward Clawd', () => {
    const k = kitchenStep(initialKitchen(T0), 'typing', T0 + 100)
    expect(k.tableX).toBe(rest + dir * SLIDE_PX_PER_S * 0.1)
    expect(sinceArrived(k, T0 + 100)).toBe(0)
  })

  test('arrival is stamped by the step that gets the table there, and counted from then', () => {
    let k = initialKitchen(T0)
    k = kitchenStep(k, 'typing', T0 + travelMs / 2)
    expect(k.tableX * dir).toBeLessThan(work * dir)
    k = kitchenStep(k, 'typing', T0 + travelMs + 200)
    expect(k.tableX).toBe(work)
    expect(sinceArrived(k, T0 + travelMs + 200)).toBe(0)
    k = kitchenStep(k, 'typing', T0 + travelMs + 500)
    expect(sinceArrived(k, T0 + travelMs + 500)).toBe(300)
  })

  test('any other mood sends the table back, and the arrival is forgotten', () => {
    let k = kitchenStep(initialKitchen(T0), 'typing', T0 + travelMs + 100)
    expect(k.tableX).toBe(work)
    k = kitchenStep(k, 'idle', T0 + travelMs + 200)
    expect(k.tableX).toBe(work - dir * SLIDE_PX_PER_S * 0.1)
    expect(sinceArrived(k, T0 + travelMs + 200)).toBe(0)
    for (const mood of ['thinking', 'stir', 'season'] as const) {
      const away = kitchenStep(kitchenStep(initialKitchen(T0), 'typing', T0 + 300), mood, T0 + 400)
      expect(away.tableX * dir).toBeLessThan((rest + dir * SLIDE_PX_PER_S * 0.3) * dir)
    }
  })

  test('serving the finished dish brings the table over too', () => {
    const k = kitchenStep(initialKitchen(T0), 'serve', T0 + 100)
    expect(k.tableX).toBe(rest + dir * SLIDE_PX_PER_S * 0.1)
  })
})

describe('the mood clock', () => {
  test('starts when the kitchen does, and keeps running while the mood stays', () => {
    let k = initialKitchen(T0)
    expect(sinceMood(k, T0 + 250)).toBe(250)
    k = kitchenStep(k, 'idle', T0 + 400)
    expect(sinceMood(k, T0 + 900)).toBe(900)
  })

  test('a change of mood restarts it, so each motion begins at its first keyframe', () => {
    let k = kitchenStep(initialKitchen(T0), 'idle', T0 + 300)
    k = kitchenStep(k, 'thinking', T0 + 500)
    expect(sinceMood(k, T0 + 500)).toBe(0)
    expect(sinceMood(k, T0 + 800)).toBe(300)
    k = kitchenStep(k, 'thinking', T0 + 900)
    expect(sinceMood(k, T0 + 1000)).toBe(500)
    k = kitchenStep(k, 'stir', T0 + 1100)
    expect(sinceMood(k, T0 + 1100)).toBe(0)
  })

  test('is never negative', () => {
    expect(sinceMood(initialKitchen(T0), T0 - 50)).toBe(0)
  })

  test('the table takes about half a second over its ten cells: seven ticks, enough to show a pull begin, tug and settle', () => {
    expect(travelMs).toBeGreaterThanOrEqual(480)
    expect(travelMs).toBeLessThanOrEqual(640)
  })
})

describe('the dish rotation', () => {
  const cycles = (k: ReturnType<typeof initialKitchen>) => k.dishBase

  test('starts at the first dish, and does not move while Clawd thinks', () => {
    let k = initialKitchen(T0)
    expect(cycles(k)).toBe(0)
    k = kitchenStep(k, 'thinking', T0 + 100)
    k = kitchenStep(k, 'thinking', T0 + 5000)
    expect(cycles(k)).toBe(0)
  })

  /** Thinks from T0 to T0 + ms (the last frame of thinking), then moves on to `next` one tick later. */
  const thinkFor = (k: ReturnType<typeof initialKitchen>, from: number, ms: number, next: 'stir' | 'season') => {
    let out = kitchenStep(k, 'thinking', from)
    out = kitchenStep(out, 'thinking', from + ms)
    return kitchenStep(out, next, from + ms + 80)
  }

  test('a spell cut short before the dish appeared moves nothing on: the dish was never seen', () => {
    for (const ms of [0, 150, 399]) expect(cycles(thinkFor(initialKitchen(T0), T0, ms, 'stir'))).toBe(0)
    expect(cycles(thinkFor(initialKitchen(T0), T0, 400, 'stir'))).toBe(1)
  })

  test('leaving thinking moves it on by the cycles played, a cycle whose dish was shown counting as played', () => {
    let k = thinkFor(initialKitchen(T0), T0, 1000, 'stir')
    expect(cycles(k)).toBe(1)
    k = thinkFor(k, T0 + 2000, 4500, 'season')
    expect(cycles(k)).toBe(1 + 3)
  })

  test('other moods leave it alone', () => {
    let k = initialKitchen(T0)
    for (const [i, mood] of (['idle', 'typing', 'stir', 'simmer', 'serve', 'smoke', 'sleep'] as const).entries()) {
      k = kitchenStep(k, mood, T0 + i * 700)
    }
    expect(cycles(k)).toBe(0)
  })
})
