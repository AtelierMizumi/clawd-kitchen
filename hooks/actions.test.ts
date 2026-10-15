// Spec for what Clawd's body and the kitchen do in each mood (hooks/lib/actions.ts).
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { CHOP_MS, COUGH_STEP_MS, CUTS_PER_ITEM, BOUNCE_MS, DISHES, DROP_MS, LID_STEP_MS, NONE, ZEE_STEP_MS, PULL_STEP_MS, SHAKE_STEP_MS, SPARKLE_STEP_MS, SIMMER_STEAM, STIR_MS, SWIPE_MS, actionAt } from './lib/actions'
import type { Kitchen } from './lib/actions'
import { BREATH_MS, idlePose } from './lib/clawd'

const comfy = DATA.scenes.comfy
const { rest, work, foodY, knifeX, pileX } = comfy.table
const [panX, panY] = comfy.pan
const [potX0, potY0] = comfy.pot
const clawdY = comfy.clawd[1]
const away = (x: number): Kitchen => ({ tableX: x, sinceArrived: 0 })
const atTable = (sinceArrived: number): Kitchen => ({ tableX: work, sinceArrived })
const serving = (sinceArrived: number, served = 1): Kitchen => ({ tableX: work, sinceArrived, served })
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

describe('season: shaking salt into the pan', () => {
  const [clawdX, clawdY] = comfy.clawd
  const at = (ms: number) => actionAt('season', ms)
  const shakerAt = (i: number) => at(i * SHAKE_STEP_MS).action.shaker!

  test('Clawd watches the pan with his right arm up, shaking', () => {
    const { pose } = at(0)
    expect(pose.eyes).toBe('right')
    expect(pose.shake).toBe(true)
    expect(pose.phone).toBeUndefined()
  })

  test('the shaker is held in the right hand, above the pan\'s handle, and nowhere else', () => {
    const s = shakerAt(0)
    expect(s.x).toBe(clawdX + 15)
    expect([clawdY - 4, clawdY - 3]).toContain(s.y)
    for (const mood of ['idle', 'typing', 'thinking', 'stir', 'simmer'] as const) expect(actionAt(mood, 0).action.shaker).toBeNull()
    expect(NONE.shaker).toBeNull()
  })

  test('the shaker jiggles by a pixel every SHAKE_STEP_MS', () => {
    const ys = [0, 1, 2, 3].map(i => shakerAt(i).y)
    expect(new Set(ys).size).toBe(2)
    expect(ys[0]).toBe(ys[2])
    expect(ys[1]).toBe(ys[3])
  })

  test('three grains fall from its mouth into the pan, always below the shaker', () => {
    for (let t = 0; t < 1000; t += 37) {
      const { action } = at(t)
      expect(action.bits).toHaveLength(3)
      for (const b of action.bits) {
        expect(b.y).toBeGreaterThanOrEqual(clawdY - 1)
        expect(b.x).toBeGreaterThanOrEqual(clawdX + 16)
        expect(b.x).toBeLessThan(panX + DATA.frames.pan.width)
      }
    }
    const ys = new Set([0, 100, 200, 300].map(t => at(t).action.bits[0]!.y))
    expect(ys.size).toBeGreaterThan(1)
  })

  test('the table stays where it is', () => {
    expect(actionAt('season', 0, away(-5)).action.tableX).toBe(-5)
  })
})

describe('serve: the finished dish', () => {
  const { frontY, plateX, dishX } = comfy.table
  const dishH = DATA.frames.dish_burger.height
  const dishTop = frontY - 1 - dishH
  const at = (ms: number, served = 1) => actionAt('serve', 0, serving(ms, served))

  test('while the table is still coming, Clawd tugs it over and nothing is on it', () => {
    const { pose, action } = actionAt('serve', 0, away(work - 6))
    expect(pose.eyes).toBe('left')
    expect(action.plate).toBeNull()
    expect(action.tableX).toBe(work - 6)
  })

  test('once it is there Clawd cheers, arms up, feet tapping', () => {
    const poses = [0, 1, 2, 3].map(i => at(i * PULL_STEP_MS * 2).pose)
    expect(poses.every(p => p.arms === 'up' && p.eyes === 'open')).toBe(true)
    expect(new Set(poses.map(p => p.legs))).toEqual(new Set(['stand', 'tap']))
  })

  test('the dish drops onto the plate from above, falling faster and faster, and stops on it', () => {
    const dys = [0, 0.25, 0.5, 0.75, 1].map(f => at(Math.floor(f * DROP_MS)).action.plate!.dy)
    expect(dys[0]).toBe(-dishH)
    expect(dys).toEqual([...dys].sort((a, b) => a - b))
    const steps = dys.slice(1).map((d, i) => d - dys[i]!)
    expect(steps[steps.length - 2]!).toBeGreaterThanOrEqual(steps[0]!)
    expect(at(DROP_MS).action.plate!.dy).toBeLessThanOrEqual(0)
  })

  test('it bounces up one pixel as it lands, then settles', () => {
    expect(at(DROP_MS + 10).action.plate!.dy).toBe(-1)
    expect(at(DROP_MS + BOUNCE_MS + 10).action.plate!.dy).toBe(0)
    expect(at(DROP_MS + BOUNCE_MS + 2000).action.plate!.dy).toBe(0)
  })

  test('the dish is a different one each answer: burger, egg, ramen, burger again', () => {
    expect([1, 2, 3, 4].map(n => at(0, n).action.plate!.dish)).toEqual(['burger', 'egg', 'ramen', 'burger'])
    expect(at(0, 0).action.plate!.dish).toBe('burger')
  })

  test('sparkles twinkle around the dish once it has landed, two at a time, and not before', () => {
    expect(at(0).action.bits).toEqual([])
    expect(at(DROP_MS - 10).action.bits).toEqual([])
    const after = DROP_MS + BOUNCE_MS
    const frames = [0, 1, 2, 3].map(i => at(after + i * SPARKLE_STEP_MS + 5).action.bits)
    for (const bits of frames) {
      expect(bits).toHaveLength(2)
      for (const b of bits) {
        expect(b.x).toBeGreaterThanOrEqual(work + plateX - 2)
        expect(b.x).toBeLessThanOrEqual(work + dishX + 7 + 2)
        expect(b.y).toBeGreaterThanOrEqual(dishTop - 3)
        expect(b.y).toBeLessThanOrEqual(frontY - 1)
      }
    }
    const spots = new Set(frames.map(f => f.map(b => `${b.x},${b.y}`).join('|')))
    expect(spots.size).toBeGreaterThan(1)
  })
})

describe('smoke: a burnt dish', () => {
  const at = (ms: number) => actionAt('smoke', ms)
  const [panX0, panY0] = comfy.pan

  test('Clawd coughs, eyes shut, fanning the smoke with one arm up and down', () => {
    const poses = [0, 1, 2, 3].map(i => at(i * COUGH_STEP_MS).pose)
    expect(poses.every(p => p.eyes === 'closed')).toBe(true)
    expect(new Set(poses.map(p => p.arms))).toEqual(new Set(['rest', 'up']))
    expect(poses[0]!.arms).not.toBe(poses[1]!.arms)
  })

  test('what is left in the pan is burnt', () => {
    expect(at(0).action.isBurnt).toBe(true)
    for (const mood of ['idle', 'typing', 'thinking', 'stir', 'simmer', 'serve', 'season'] as const) {
      expect(actionAt(mood, 0).action.isBurnt).toBe(false)
    }
    expect(NONE.isBurnt).toBe(false)
  })

  test('dark smoke rises from the pan, much thicker than the steam', () => {
    const smoke = at(0).action.smoke
    expect(smoke).not.toBeNull()
    expect(smoke!.count).toBeGreaterThanOrEqual(6)
    expect(smoke!.x).toBeGreaterThanOrEqual(panX0)
    expect(smoke!.x).toBeLessThan(panX0 + DATA.frames.pan.width)
    expect(smoke!.y).toBeLessThanOrEqual(panY0)
    expect(NONE.smoke).toBeNull()
  })

  test('the table stays where it is', () => {
    expect(actionAt('smoke', 0, away(-7)).action.tableX).toBe(-7)
  })
})

describe('sleep: dozing', () => {
  const at = (ms: number) => actionAt('sleep', ms)

  test('Clawd dozes, eyes shut, arms and feet still', () => {
    const { pose } = at(1234)
    expect(pose.eyes).toBe('closed')
    expect(pose.arms).toBe('rest')
    expect(pose.legs).toBe('stand')
  })

  test('breathing is slower than awake: a full breath takes twice as long', () => {
    const glow = (t: number) => at(t).pose.glow
    const awake = (t: number) => actionAt('idle', t).pose.glow
    // Awake, glow has come back to its start after BREATH_MS; asleep it has not yet.
    expect(awake(BREATH_MS)).toBeLessThan(0.001)
    expect(glow(BREATH_MS)).toBeGreaterThan(0.99)
    expect(glow(BREATH_MS * 2)).toBeLessThan(0.001)
  })

  test('a z floats up beside the head, growing from small to big and starting over', () => {
    const zs = [0, 1, 2, 3, 4, 5].map(i => at(i * ZEE_STEP_MS).action.zee)
    expect(zs.every(z => z !== null)).toBe(true)
    const ys = zs.slice(0, 4).map(z => z!.y)
    expect(ys).toEqual([...ys].sort((a, b) => b - a)) // rising: y decreases
    expect(new Set(zs.map(z => z!.big))).toEqual(new Set([false, true]))
    expect(zs[0]).toEqual(zs[4])
  })

  test('the table is away', () => {
    expect(actionAt('sleep', 0, away(-9)).action.tableX).toBe(-9)
  })
})

