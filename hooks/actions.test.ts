// Spec for what Clawd's body and the kitchen do in each mood (hooks/lib/actions.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { BUBBLE_STEP_MS, CHOP_MS, CUTS_PER_ITEM, NONE, PULL_STEP_MS, STIR_MS, actionAt } from './lib/actions'
import type { Kitchen } from './lib/actions'
import { idlePose } from './lib/clawd'

const comfy = DATA.scenes.comfy
const { rest, work, foodY, knifeX, pileX } = comfy.table
const clawdY = comfy.clawd[1]
const away = (x: number): Kitchen => ({ tableX: x, sinceArrived: 0 })
const atTable = (sinceArrived: number): Kitchen => ({ tableX: work, sinceArrived })
const pan = comfy.pan
const panWidth = DATA.frames.pan.width

describe('idle', () => {
  test('is the breathing pose with nothing happening in the kitchen', () => {
    const { pose, action } = actionAt('idle', 1234)
    expect(pose).toEqual(idlePose(1234))
    expect(action).toEqual(NONE)
  })
})

describe('typing: pulling the table over', () => {
  // The table comes in from the left, so "on its way" means short of `work`.
  const onItsWay = away(work - 5)

  test('while the table is on its way Clawd leans in, eyes on it, tugging with quick steps', () => {
    const { pose } = actionAt('typing', 0, onItsWay)
    expect(pose.eyes).toBe('left')
    expect(pose.reach).toBeUndefined()
    const legs = new Set([0, 1, 2, 3].map(i => actionAt('typing', i * PULL_STEP_MS, onItsWay).pose.legs))
    expect(legs).toEqual(new Set(['stand', 'tap']))
  })

  test('the table is reported where it is, and no knife is held yet', () => {
    const { action } = actionAt('typing', 0, onItsWay)
    expect(action.tableX).toBe(work - 5)
    expect(action.knife).toBeNull()
    expect(action.slice).toBeNull()
  })

  test('the table stays wherever it is for every other mood', () => {
    expect(actionAt('idle', 0, away(-3)).action.tableX).toBe(-3)
    expect(actionAt('thinking', 0, away(-6)).action.tableX).toBe(-6)
    expect(actionAt('stir', 0, away(rest)).action.tableX).toBe(rest)
  })
})

describe('typing: chopping at the table', () => {
  const at = (ms: number) => actionAt('typing', 0, atTable(ms))
  const cycle = (c: number, phase: number) => at(Math.floor((c + phase) * CHOP_MS))

  test('Clawd watches his work, holding the knife just beside the food', () => {
    const { pose, action } = at(0)
    expect(pose.eyes).toBe('down')
    expect(action.knife).toEqual({ x: work + knifeX, hy: 1 })
    expect(action.tableX).toBe(work)
  })

  test('the knife goes up, down and up again each chop, and the hand follows it', () => {
    const hy = [0, 0.3, 0.6, 0.8].map(p => cycle(0, p).action.knife!.hy)
    expect(hy).toEqual([1, 3, 5, 3])
    for (const p of [0, 0.3, 0.6, 0.8]) {
      const { pose, action } = cycle(0, p)
      expect(pose.reach).toBe(action.knife!.hy - clawdY)
    }
  })

  test('four cuts of two columns per ingredient: meat, then cucumber, then carrot, then meat again', () => {
    expect(CUTS_PER_ITEM).toBe(4)
    const kinds = [0, 3, 4, 7, 8, 11, 12].map(c => cycle(c, 0.1).action.ingredient.kind)
    expect(kinds).toEqual(['meat', 'meat', 'cucumber', 'cucumber', 'carrot', 'carrot', 'meat'])
  })

  test('each chop cuts the next slice, which flies only after the blade is down', () => {
    for (let c = 0; c < 12; c++) {
      expect(cycle(c, 0.3).action.ingredient).toMatchObject({ cut: c % 4, flying: false })
      expect(cycle(c, 0.6).action.ingredient).toMatchObject({ cut: c % 4, flying: true })
    }
  })

  test('nothing flies before the blade is down', () => {
    for (let c = 0; c < 4; c++) expect(cycle(c, 0.3).action.slice).toBeNull()
    expect(cycle(0, 0.6).action.slice).not.toBeNull()
  })

  test('the slice that flies is the ingredient\'s own slice', () => {
    for (const [c, kind] of [[2, 'meat'], [6, 'cucumber'], [10, 'carrot']] as const) {
      expect(cycle(c, 0.6).action.slice!.kind).toBe(kind)
    }
  })

  test('the slice hops from the cut to its place in the fanned pile, rising and falling', () => {
    const c = 2
    const frames = [0.52, 0.6, 0.7, 0.8, 0.9, 0.98].map(p => cycle(c, p).action.slice!)
    const xs = frames.map(f => f.x)
    expect(xs).toEqual([...xs].sort((a, b) => b - a)) // heading left, away from the knife
    expect(xs[0]!).toBeGreaterThan(xs[5]!)
    const slot = work + pileX + c
    expect(xs[5]!).toBeGreaterThanOrEqual(slot)
    expect(xs[5]!).toBeLessThanOrEqual(slot + 1)
    expect(frames[0]!.x).toBeLessThanOrEqual(work + knifeX)
    const ys = frames.map(f => f.y)
    const top = Math.min(...ys)
    expect(top).toBeLessThan(ys[0]!)
    expect(top).toBeLessThan(ys[5]!)
    expect(ys.every(y => y <= foodY)).toBe(true)
  })

  test('the loop is the same every time the table is worked at', () => {
    expect(at(1234).action).toEqual(at(1234 + CHOP_MS * CUTS_PER_ITEM * 3).action)
  })
})

describe('thinking', () => {
  test('Clawd looks up with the arms raised', () => {
    const { pose } = actionAt('thinking', 0)
    expect(pose.eyes).toBe('up')
    expect(pose.arms).toBe('up')
  })

  test('a thought bubble fills one dot at a time and then empties', () => {
    const dots = [0, 1, 2, 3, 4].map(i => actionAt('thinking', i * BUBBLE_STEP_MS).action.bubble)
    expect(dots).toEqual([1, 2, 3, 0, 1])
  })
})

describe('stir', () => {
  const at = (phase: number) => actionAt('stir', Math.floor(phase * STIR_MS))

  test('the pan goes up in a toss and comes back down, never below the stove', () => {
    const dys = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map(p => at(p).action.panDy)
    expect(Math.min(...dys)).toBe(-2)
    expect(Math.max(...dys)).toBe(0)
    expect(dys.every(dy => dy <= 0 && dy >= -2)).toBe(true)
  })

  test('loops every STIR_MS', () => {
    expect(actionAt('stir', 123).action).toEqual(actionAt('stir', 123 + STIR_MS).action)
  })

  test('flames show while the pan is lifted, and not while it sits on them', () => {
    for (let t = 0; t < STIR_MS; t += 25) {
      const { action } = actionAt('stir', t)
      expect(action.isFlameOn).toBe(action.panDy < 0)
    }
  })

  test('food flies above the pan only during the toss, inside the pan width', () => {
    let flying = 0
    for (let t = 0; t < STIR_MS; t += 25) {
      const { action } = actionAt('stir', t)
      if (action.panDy === 0) expect(action.bits).toEqual([])
      for (const b of action.bits) {
        flying++
        expect(b.x).toBeGreaterThanOrEqual(pan[0])
        expect(b.x).toBeLessThan(pan[0] + panWidth)
        expect(b.y).toBeLessThan(pan[1] + action.panDy)
      }
    }
    expect(flying).toBeGreaterThan(0)
  })

  test('Clawd watches the pan and lifts his arms with each toss', () => {
    for (let t = 0; t < STIR_MS; t += 25) {
      const { pose, action } = actionAt('stir', t)
      expect(pose.eyes).toBe('right')
      expect(pose.arms).toBe(action.panDy < 0 ? 'up' : 'rest')
    }
  })
})

describe('moods without their own art yet', () => {
  test('chop, serve, smoke and sleep fall back to the idle pose', () => {
    for (const mood of ['chop', 'serve', 'smoke', 'sleep'] as const) {
      expect(actionAt(mood, 700).pose).toEqual(idlePose(700))
    }
  })
})
