// Spec for what Clawd's body and the kitchen do in each mood (hooks/lib/actions.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { CHOP_MS, CUTS_PER_ITEM, DISHES, LID_STEP_MS, NONE, PULL_STEP_MS, SIMMER_STEAM, STIR_MS, SWIPE_MS, actionAt } from './lib/actions'
import type { Kitchen } from './lib/actions'
import { idlePose } from './lib/clawd'

const comfy = DATA.scenes.comfy
const { rest, work, foodY, knifeX, pileX } = comfy.table
const [panX, panY] = comfy.pan
const [potX0, potY0] = comfy.pot
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
    expect(action.knife).toEqual({ x: work + knifeX, hy: foodY - 3 })
    expect(action.tableX).toBe(work)
  })

  test('the knife goes up, down and up again each chop, and the hand follows it', () => {
    const hy = [0, 0.3, 0.6, 0.8].map(p => cycle(0, p).action.knife!.hy)
    expect(hy).toEqual([foodY - 3, foodY - 1, foodY + 1, foodY - 1])
    for (const p of [0, 0.3, 0.6, 0.8]) {
      const { pose, action } = cycle(0, p)
      expect(pose.reach).toBe(action.knife!.hy - clawdY)
    }
  })

  test('the blade clears the food when raised and reaches the board when down', () => {
    const blade = DATA.frames.knife_v.height - 1
    const raised = cycle(0, 0).action.knife!.hy
    const down = cycle(0, 0.6).action.knife!.hy
    expect(raised + blade).toBeLessThan(foodY)
    expect(down + blade).toBe(foodY + 3) // the food's last row, on the board
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

describe('thinking: scrolling the phone', () => {
  const at = (cycle: number, phase: number) => actionAt('thinking', Math.floor((cycle + phase) * SWIPE_MS))

  test('Clawd looks at the phone in his raised left hand', () => {
    const { pose } = at(0, 0.5)
    expect(pose.eyes).toBe('left')
    expect(pose.phone).toBe(true)
    expect(pose.reach).toBeUndefined()
  })

  test('the phone is out the whole time Clawd thinks, and only then', () => {
    for (const p of [0, 0.1, 0.5, 0.95]) expect(at(0, p).action.phone).not.toBeNull()
    for (const mood of ['idle', 'typing', 'stir', 'serve'] as const) expect(actionAt(mood, 500).action.phone).toBeNull()
    expect(NONE.phone).toBeNull()
    expect(NONE.dish).toBeNull()
  })

  test('each swipe takes the first fifth: the thumb flicks up the screen in four steps', () => {
    const thumbs = [0.025, 0.075, 0.125, 0.175].map(p => at(0, p).action.phone!.thumb)
    expect(thumbs).toEqual([3, 2, 1, 0])
  })

  test('the screen scrolls with the thumb, then holds still', () => {
    const scrolls = [0.025, 0.075, 0.125, 0.175].map(p => at(0, p).action.phone!.scroll)
    expect(scrolls).toEqual([0, 1, 2, 3])
    expect(at(0, 0.5).action.phone!.scroll).toBe(0)
  })

  test('the bubble is empty while swiping, and the new dish pops in the moment the swipe ends', () => {
    for (const p of [0, 0.1, 0.19]) expect(at(0, p).action.dish).toBeNull()
    expect(at(0, 0.2).action.dish).toBe(DISHES[0])
    expect(at(0, 0.9).action.dish).toBe(DISHES[0])
  })

  test('after the swipe the thumb lifts away', () => {
    for (const p of [0.2, 0.5, 0.9]) expect(at(0, p).action.phone!.thumb).toBeNull()
  })

  test('a new dish every swipe, in order, around again', () => {
    expect(DISHES).toEqual(['burger', 'egg', 'ramen'])
    const seen = [0, 1, 2, 3, 4].map(c => at(c, 0.5).action.dish)
    expect(seen).toEqual(['burger', 'egg', 'ramen', 'burger', 'egg'])
  })

  test('the table stays where it is while Clawd thinks', () => {
    expect(actionAt('thinking', 0, away(-4)).action.tableX).toBe(-4)
  })
})

describe('thinking: tossing in an ingredient', () => {
  const at = (cycle: number, phase: number) => actionAt('thinking', Math.floor((cycle + phase) * SWIPE_MS))
  const [clawdX, clawdY] = comfy.clawd
  const hand = [clawdX + 13, clawdY + 1]
  // Where each dish goes, and the colour of what goes in (read off the dish picture).
  const dest = { burger: [panX + 7, panY], egg: [panX + 7, panY], ramen: [potX0 + 3, potY0] } as const
  const colour = {
    burger: DATA.frames.dish_burger.pixels[4 * 7 + 3],
    egg: DATA.frames.dish_egg.pixels[2 * 7 + 2],
    ramen: DATA.frames.dish_ramen.pixels[1 * 7 + 2],
  } as const
  const flight = (cycle: number) => [0.5, 0.56, 0.62, 0.68, 0.74, 0.79].map(p => at(cycle, p).action.bits)

  test('the right arm goes up to throw for the middle of the cycle, and not otherwise', () => {
    expect([0.45, 0.5, 0.79, 0.8, 0.9].map(p => at(0, p).pose.toss === true)).toEqual([false, true, true, false, false])
  })

  test('one piece of food flies, in the colour of the dish', () => {
    for (const cycle of [0, 1, 2]) {
      const dish = DISHES[cycle]!
      for (const bits of flight(cycle)) {
        expect(bits).toHaveLength(1)
        expect(bits[0]!.color).toBe(colour[dish])
      }
    }
  })

  test('it leaves the right hand and lands in the pan for burger and egg, in the pot for ramen', () => {
    for (const cycle of [0, 1, 2]) {
      const dish = DISHES[cycle]!
      const bits = flight(cycle).map(b => b[0]!)
      expect(Math.abs(bits[0]!.x - hand[0]!)).toBeLessThanOrEqual(1)
      expect(Math.abs(bits[0]!.y - hand[1]!)).toBeLessThanOrEqual(1)
      const last = bits[bits.length - 1]!
      expect(Math.abs(last.x - dest[dish][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(last.y - dest[dish][1])).toBeLessThanOrEqual(1)
    }
  })

  test('it flies in an arc, higher than both the hand and the target', () => {
    for (const cycle of [0, 2]) {
      const dish = DISHES[cycle]!
      const ys = flight(cycle).map(b => b[0]!.y)
      expect(Math.min(...ys)).toBeLessThan(Math.min(hand[1]!, dest[dish][1]))
    }
  })

  test('landing in the pan splashes three drops of it', () => {
    const bits = at(0, 0.85).action.bits
    expect(bits).toHaveLength(3)
    for (const b of bits) {
      expect(b.color).toBe(colour.burger)
      expect(Math.abs(b.x - dest.burger[0])).toBeLessThanOrEqual(1)
      expect(b.y).toBeLessThan(dest.burger[1])
    }
    expect(at(0, 0.85).action.lidDy).toBe(0)
  })

  test('landing in the pot pops its lid and puffs steam out beside it', () => {
    const { action } = at(2, 0.85)
    expect(action.lidDy).toBe(-1)
    expect(action.bits).toHaveLength(2)
  })

  test('before the throw and after the splash nothing flies and the lid is shut', () => {
    for (const p of [0.3, 0.45, 0.95]) {
      const { action } = at(0, p)
      expect(action.bits).toEqual([])
      expect(action.lidDy).toBe(0)
    }
  })

  test('the phone stays in the other hand through the throw', () => {
    expect(at(0, 0.6).action.phone).not.toBeNull()
    expect(at(0, 0.6).pose.phone).toBe(true)
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

describe('simmer: the pot', () => {
  const [potX, potY] = comfy.pot
  const potW = DATA.frames.pot_lid.width
  const at = (i: number) => actionAt('simmer', i * LID_STEP_MS)

  test('Clawd watches the pot, on his right', () => {
    const { pose } = at(0)
    expect(pose.eyes).toBe('right')
    expect(pose.phone).toBeUndefined()
    expect(pose.reach).toBeUndefined()
  })

  test('the lid rattles: one pixel up, down again, every LID_STEP_MS', () => {
    expect([0, 1, 2, 3].map(i => at(i).action.lidDy)).toEqual([0, -1, 0, -1])
  })

  test('the pot steams harder than usual, and no other mood does', () => {
    expect(SIMMER_STEAM).toBeGreaterThan(0)
    expect(at(0).action.potSteam).toBe(SIMMER_STEAM)
    for (const mood of ['idle', 'typing', 'thinking', 'stir', 'serve'] as const) expect(actionAt(mood, 500).action.potSteam).toBe(0)
    expect(NONE.potSteam).toBe(0)
    expect(NONE.lidDy).toBe(0)
  })

  test('steam squeezes out on both sides of the lid whenever it is up, and only then', () => {
    const up = at(1).action.bits
    expect(up).toHaveLength(2)
    expect(up.map(b => b.x).sort((a, b) => a - b)).toEqual([potX - 1, potX + potW])
    expect(new Set(up.map(b => b.y)).size).toBe(1)
    expect(up[0]!.y).toBeLessThanOrEqual(potY)
    expect(at(0).action.bits).toEqual([])
  })

  test('the table stays where it is', () => {
    expect(actionAt('simmer', 0, away(-6)).action.tableX).toBe(-6)
  })
})

describe('moods without their own art yet', () => {
  test('chop, serve, smoke and sleep fall back to the idle pose', () => {
    for (const mood of ['chop', 'serve', 'smoke', 'sleep'] as const) {
      expect(actionAt(mood, 700).pose).toEqual(idlePose(700))
    }
  })
})
