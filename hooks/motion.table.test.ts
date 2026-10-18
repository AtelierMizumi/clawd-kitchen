// Spec for the motions at the prep table: pulling it over, chopping while you type, and serving the answer
// (hooks/lib/motion/pull.ts, typing.ts, serve.ts). Time at the table counts in ticks since it arrived.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { NONE } from './lib/action'
import { handAnchor } from './lib/clawd'
import { TICK_MS } from './lib/motion/keyframes'
import type { Kitchen } from './lib/motion/moment'
import { pullAt } from './lib/motion/pull'
import { SPARKLE_COLOR, serveAt } from './lib/motion/serve'
import { CHOP_MS, CUTS_PER_ITEM, KINDS, typingAt } from './lib/motion/typing'
import { playback } from './lib/playback'

const comfy = DATA.scenes.comfy
const { rest, work, foodY, knifeX, pileX, frontY, dishX } = comfy.table
const at = (n: number, extra: Partial<Kitchen> = {}): Kitchen => ({ tableX: work, sinceArrived: n * TICK_MS, sinceMood: n * TICK_MS + 400, ...extra })

describe('pulling the table over', () => {
  const pulling = (tableX: number, sinceMood: number): Kitchen => ({ tableX, sinceArrived: 0, sinceMood })

  test('begins by leaning away and reaching toward the table, eyes on it', () => {
    const { pose, action } = pullAt(pulling(rest + 3, 0))
    expect(pose.lean).toBe(1)
    expect(pose.armL).toBe('out')
    expect(pose.eyes).toBe('left')
    expect(action.knife).toBe(false)
    expect(action.slice).toBeNull()
    expect(action.tableX).toBe(rest + 3)
  })

  test('tugs: the lean and the feet alternate tick by tick, whatever the table has covered', () => {
    const steps = [1, 2, 3, 4].map(n => pullAt(pulling(rest + 8, n * TICK_MS)).pose)
    expect(steps.map(p => p.lean)).toEqual([-1, 0, -1, 0])
    expect(steps.map(p => p.legs)).toEqual(['tapL', 'tapR', 'tapL', 'tapR'])
    for (const p of steps) expect(p.armL).toBe('out')
  })

  test('settles when the table is nearly there: upright, eyes down on the food', () => {
    for (const n of [2, 3, 4]) {
      const { pose } = pullAt(pulling(work - 3, n * TICK_MS))
      expect(pose.lean).toBe(0)
      expect(pose.eyes).toBe('down')
    }
  })

  test('carries the table where it is', () => {
    expect(pullAt(pulling(-7.5, 160)).action.tableX).toBe(-7.5)
  })

  test('driven by the real kitchen from an idle one, it plays anticipation, tugs, settle and then the first chop', () => {
    const frames = [...playback('typing', 1200, { warm: 1000 })]
    const poses = frames.map(f => f.pose)
    expect(poses[0]!.lean).toBe(1)
    expect(poses[0]!.armL).toBe('out')
    const pullEnd = frames.findIndex(f => f.action.knife)
    expect(pullEnd).toBeGreaterThanOrEqual(6)
    const tugging = poses.slice(1, pullEnd - 1)
    expect(new Set(tugging.map(p => p.lean))).toEqual(new Set([-1, 0]))
    expect(new Set(tugging.map(p => p.legs))).toEqual(new Set(['tapL', 'tapR']))
    expect(poses[pullEnd - 1]!.lean).toBe(0)
    expect(poses[pullEnd - 1]!.eyes).toBe('down')
    expect(poses[pullEnd]!.handL).toBe(-4)
  })

  test('serving from an idle kitchen plays the same pull before the dish drops', () => {
    const frames = [...playback('serve', 1500, { warm: 1000 })]
    expect(frames[0]!.pose.lean).toBe(1)
    const dropAt = frames.findIndex(f => f.action.plate)
    expect(dropAt).toBeGreaterThanOrEqual(6)
    expect(frames[dropAt]!.action.plate!.dy).toBe(-10)
    expect(frames[dropAt]!.pose.eyes).toBe('up')
  })
})

describe('chopping', () => {
  const tick = (n: number) => typingAt(at(n))
  const cycle = CHOP_MS / TICK_MS

  test('a chop is five ticks: knife up, down, in the food, kicking the slice, back', () => {
    expect(cycle).toBe(5)
    const hands = [0, 1, 2, 3, 4].map(i => tick(30 + i).pose.handL)
    expect(hands).toEqual([-4, -2, 0, -2, -3])
    for (let i = 0; i < 5; i++) {
      const { pose, action } = tick(30 + i)
      expect(pose.armL).toBe('hold')
      expect(pose.eyes).toBe('down')
      expect(action.knife).toBe(true)
    }
  })

  test('raised, the blade is clear of the food; down, it is in it', () => {
    const [, cy] = comfy.clawd
    const tipAt = (n: number) => {
      const { pose } = tick(n)
      return cy + handAnchor(pose, 'L')[1] + DATA.frames.knife_v.height - 1
    }
    expect(tipAt(30)).toBeLessThan(foodY)
    expect(tipAt(34)).toBeLessThan(foodY)
    expect(tipAt(32)).toBeGreaterThanOrEqual(foodY)
  })

  test('the body stretches up with the knife, squashes on the impact, and the hat is late coming up', () => {
    const [up, mid, hit, kick, back] = [0, 1, 2, 3, 4].map(i => tick(30 + i).pose)
    expect([up!.squash, mid!.squash, hit!.squash, kick!.squash, back!.squash]).toEqual([-1, 0, 1, 0, 0])
    expect([up!.hat, mid!.hat, hit!.hat, kick!.hat, back!.hat]).toEqual([0, 0, 0, 1, 0])
  })

  test('the blade comes down onto the food, no further than into it', () => {
    const [cx, cy] = comfy.clawd
    const { pose } = tick(32)
    const [, ay] = handAnchor(pose, 'L')
    const tip = cy + ay + DATA.frames.knife_v.height - 1
    expect(tip).toBeGreaterThanOrEqual(foodY)
    expect(tip).toBeLessThanOrEqual(foodY + DATA.frames.meat.height - 1)
    expect(cx).toBe(40)
  })

  test('the slice is in the air for the kick, the apex and the touch (which falls on the next chop\'s wind-up), never at the cut', () => {
    const flying = (n: number) => tick(n).action.ingredient.flying
    expect([31, 32].map(flying)).toEqual([false, false])
    expect([33, 34, 35].map(flying)).toEqual([true, true, true])
    expect(flying(36)).toBe(false)
    for (const n of [30, 33, 34, 35]) expect(tick(n).action.slice).not.toBeNull()
    for (const n of [31, 32, 36]) expect(tick(n).action.slice).toBeNull()
  })

  test('the slice flies from the blade to the pile on an arc: it rises, tops out, and touches down just above its place', () => {
    const [kick, apex, touch] = [33, 34, 35].map(n => tick(n).action.slice!)
    const from = work + knifeX
    expect(apex!.y).toBeLessThan(kick!.y)
    expect(apex!.y).toBeLessThan(touch!.y)
    expect(touch!.y).toBe(foodY - 1)
    expect(kick!.x).toBeLessThan(from)
    expect(apex!.x).toBeLessThan(kick!.x)
    expect(touch!.x).toBeLessThan(apex!.x)
    // The slice cut as the 7th (30..34 is slice 6, the 3rd of its item): it lands in slot 2 of the pile.
    expect(touch!.x).toBe(work + pileX + 2 * 2)
  })

  test('the pile grows by one slice as each one lands, four to an item, and the next ingredient comes whole', () => {
    const cuts = (n: number) => tick(n).action.ingredient.cut
    expect([5, 6, 10, 11, 16, 21].map(cuts)).toEqual([0, 1, 1, 2, 3, 0])
    const kind = (n: number) => tick(n).action.ingredient.kind
    expect(CUTS_PER_ITEM).toBe(4)
    expect(KINDS).toEqual(['meat', 'cucumber', 'carrot'])
    expect([6, 26, 46, 66].map(kind)).toEqual(['meat', 'cucumber', 'carrot', 'meat'])
  })

  test('each ingredient gets its own little reaction on its first cut, and the others do not', () => {
    // First cut of item 0, 1, 2 is slice 0, 4, 8: impact at tick 5j + 2.
    const reaction = (j: number) => {
      const p = tick(5 * j + 2).pose
      return `${p.hat} ${p.eyes} ${p.armR}`
    }
    expect(new Set([reaction(0), reaction(4), reaction(8)]).size).toBe(3)
    expect(reaction(1)).toBe(reaction(2))
    expect(reaction(5)).toBe(reaction(6))
  })

  test('from the second chop on, a whole round of three ingredients repeats exactly', () => {
    const round = 3 * CUTS_PER_ITEM * cycle
    for (let n = 6; n < 6 + round; n++) expect(tick(n + round)).toEqual(tick(n))
  })

  test('keeps the table where it was handed', () => {
    expect(typingAt(at(40, { tableX: work })).action.tableX).toBe(work)
  })

  test('a typing mood that begins with the table already there still plays from its first chop', () => {
    const k: Kitchen = { tableX: work, sinceArrived: 99_000, sinceMood: 0 }
    expect(typingAt(k)).toEqual(typingAt({ tableX: work, sinceArrived: 0, sinceMood: 0 }))
    expect(typingAt(k).pose.handL).toBe(-4)
  })

  test('stays finite and inside the scene at the start and after a day of typing', () => {
    for (const n of [0, 1, 7, 1e6, 1e9, 86_400_000 / TICK_MS]) {
      const { pose, action } = tick(n)
      expect(Number.isFinite(pose.handL + pose.squash + pose.hat)).toBe(true)
      if (action.slice) {
        expect(action.slice.x).toBeGreaterThanOrEqual(0)
        expect(action.slice.x + DATA.frames.meat_slice.width).toBeLessThanOrEqual(comfy.width)
        expect(action.slice.y).toBeGreaterThanOrEqual(-2)
        expect(action.slice.y + DATA.frames.meat_slice.height).toBeLessThanOrEqual(comfy.height)
      }
    }
  })
})

describe('serving the answer', () => {
  const tick = (n: number, served = 1) => serveAt(at(n, { served }))
  const plateY = frontY - DATA.frames.plate.height

  test('the table is pulled over first, with no plate on it', () => {
    const { pose, action } = serveAt({ tableX: rest + 6, sinceArrived: 0, sinceMood: 160, served: 1 })
    expect(pose.armL).toBe('out')
    expect(action.plate).toBeNull()
  })

  test('the dish drops onto the plate, lands, and bounces twice before it settles', () => {
    const dys = Array.from({ length: 10 }, (_, n) => tick(n).action.plate!.dy)
    expect(dys).toEqual([-10, -6, -3, 0, -2, 0, -1, 0, 0, 0])
  })

  test('Clawd watches it fall, and is happy once it lands', () => {
    expect([0, 1, 2].map(n => tick(n).pose.eyes)).toEqual(['up', 'up', 'up'])
    for (let n = 3; n < 40; n++) expect(tick(n).pose.eyes).toBe('happy')
  })

  test('then he cheers: both arms high, a crouch, a hop and a landing, over and over', () => {
    const cheer = Array.from({ length: 6 }, (_, i) => tick(3 + i).pose)
    expect(cheer.every(p => p.armL === 'high' || p.armL === 'lift' || p.armL === 'rest')).toBe(true)
    expect(cheer.some(p => p.squash === 1)).toBe(true)
    expect(cheer.some(p => p.squash === -1 && p.legs === 'hop')).toBe(true)
    expect(cheer.some(p => p.armL === 'high' && p.armR === 'high')).toBe(true)
    for (let n = 3; n < 30; n++) expect(tick(n + 6).pose).toEqual(tick(n).pose)
  })

  test('a serve that begins with the table already there still drops its dish from above', () => {
    const k: Kitchen = { tableX: work, sinceArrived: 99_000, sinceMood: 0, served: 1 }
    expect(serveAt(k).action.plate!.dy).toBe(-10)
  })

  test('each answer serves the next dish, round and round', () => {
    const dish = (served: number) => tick(5, served).action.plate!.dish
    expect([0, 1, 2, 3, 4].map(dish)).toEqual(['burger', 'burger', 'egg', 'ramen', 'burger'])
  })

  test('sparkles twinkle in staggered pairs round the dish once it has settled, not before', () => {
    for (let n = 0; n < 8; n++) expect(tick(n).action.bits).toEqual([])
    const pair = (n: number) => tick(n).action.bits.map(b => `${b.x},${b.y}`).join(' ')
    expect(tick(8).action.bits.length).toBeGreaterThan(0)
    for (const b of tick(8).action.bits) expect(b.color).toBe(SPARKLE_COLOR)
    expect(pair(8)).toBe(pair(9))
    expect(pair(10)).not.toBe(pair(8))
    expect(pair(12)).not.toBe(pair(10))
    const dishW = DATA.frames.dish_egg.width
    const left = work + dishX
    for (let n = 8; n < 40; n++) {
      for (const b of tick(n).action.bits) {
        expect(b.x).toBeGreaterThanOrEqual(left - 3)
        expect(b.x).toBeLessThanOrEqual(left + dishW + 3)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeLessThan(comfy.height)
      }
    }
  })

  test('the plate sits on the table front and the table is where it was handed', () => {
    expect(tick(4).action.tableX).toBe(work)
    expect(plateY % 2).toBe(0)
  })

  test('stays finite after a long wait at the table', () => {
    for (const n of [1e6, 1e9]) {
      const { pose, action } = tick(n)
      expect(pose.eyes).toBe('happy')
      expect(action.plate!.dy).toBe(0)
      expect(NONE.plate).toBeNull()
    }
  })
})
