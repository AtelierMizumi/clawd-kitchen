// Spec for the prep table that Clawd pulls over while you type (hooks/lib/table.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { SLIDE_PX_PER_S, initialKitchen, kitchenStep, sinceArrived, slideTable } from './lib/table'

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
    for (const mood of ['thinking', 'stir', 'serve'] as const) {
      const away = kitchenStep(kitchenStep(initialKitchen(T0), 'typing', T0 + 300), mood, T0 + 400)
      expect(away.tableX * dir).toBeLessThan((rest + dir * SLIDE_PX_PER_S * 0.3) * dir)
    }
  })
})
