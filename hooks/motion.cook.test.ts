// Spec for the moods at the stove: thinking (scrolling the phone, then cooking what it shows), stir (a Bash call),
// simmer (the answer streaming), season (an edit) and smoke (an error). Time counts from when the mood began.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { handAnchor } from './lib/clawd'
import { TICK_MS } from './lib/motion/keyframes'
import type { Kitchen } from './lib/motion/moment'
import { SEASON_TICKS, seasonAt } from './lib/motion/season'
import { SIMMER_STEAM, simmerAt } from './lib/motion/simmer'
import { SMOKE_PUFF, smokeAt } from './lib/motion/smoke'
import { FOOD, STIR_TICKS, stirAt } from './lib/motion/stir'
import { DISHES, PUFF, SWIPE_MS, thinkingAt } from './lib/motion/thinking'
import { DISH_SHOWN_AFTER_MS } from './lib/table'
import { script } from './lib/playback'

const comfy = DATA.scenes.comfy
const [cx, cy] = comfy.clawd
const [panX, panY] = comfy.pan
const [potX, potY] = comfy.pot
const kitchen = (n: number, dishBase = 0): Kitchen => ({ tableX: comfy.table.rest, sinceArrived: 0, sinceMood: n * TICK_MS, dishBase })
const run = <T>(f: (k: Kitchen) => T, from: number, to: number) => Array.from({ length: to - from }, (_, i) => f(kitchen(from + i)))
const CYCLE = SWIPE_MS / TICK_MS

describe('thinking: the phone', () => {
  const tick = (n: number) => thinkingAt(kitchen(n))

  test('is a cycle of 25 ticks, and the phone is in the raised left hand all the while', () => {
    expect(CYCLE).toBe(25)
    for (let n = 0; n < 2 * CYCLE; n++) {
      const { pose, action } = tick(n)
      expect(pose.armL).toBe('lift')
      expect(action.phone).not.toBeNull()
    }
  })

  test('the thumb flicks up the screen, overshoots to the top for a beat, then lifts away', () => {
    const thumbs = run(thinkingAt, 0, 7).map(m => m.action.phone!.thumb)
    expect(thumbs).toEqual([3, 2, 1, 0, 0, null, null])
  })

  test('the screen scrolls a step each tick of the swipe, and rests after', () => {
    expect(run(thinkingAt, 0, 5).map(m => m.action.phone!.scroll)).toEqual([0, 1, 2, 3, 4])
    expect(tick(8).action.phone!.scroll).toBe(0)
  })

  test('the table\'s rule for when a dish counts as seen is the tick the bubble fills', () => {
    const n = DISH_SHOWN_AFTER_MS / TICK_MS
    expect(tick(n - 1).action.dish).toBeNull()
    expect(tick(n).action.dish).not.toBeNull()
  })

  test('the bubble is empty while swiping, then shows the dish; the dish changes every cycle', () => {
    expect(run(thinkingAt, 0, 5).every(m => m.action.dish === null)).toBe(true)
    expect(tick(5).action.dish).toBe(DISHES[0])
    expect(tick(CYCLE + 5).action.dish).toBe(DISHES[1])
    expect(tick(2 * CYCLE + 5).action.dish).toBe(DISHES[2])
    expect(tick(3 * CYCLE + 5).action.dish).toBe(DISHES[0])
  })

  test('coming back to thinking after a stir, a seasoning or a simmer carries on with the next dish, not the first', () => {
    expect(thinkingAt(kitchen(5, 1)).action.dish).toBe(DISHES[1])
    expect(thinkingAt(kitchen(CYCLE + 5, 1)).action.dish).toBe(DISHES[2])
    expect(thinkingAt(kitchen(5, 4)).action.dish).toBe(DISHES[1])
  })

  test('driven by the real kitchen, thoughts interrupted at any moment never skip a dish that was shown', () => {
    const index = (dish: string | null) => DISHES.indexOf(dish as (typeof DISHES)[number])
    for (const ms of [240, 400, 960, 1440, 2400, 2640, 4100]) {
      const frames = [...script([['thinking', ms], ['stir', 400]], { rounds: 8 })]
      const runs: number[] = []
      for (const f of frames) {
        if (f.mood !== 'thinking' || !f.action.dish) continue
        const i = index(f.action.dish)
        if (runs[runs.length - 1] !== i) runs.push(i)
      }
      for (let i = 1; i < runs.length; i++) expect(`${ms} ${i} ${(runs[i]! - runs[i - 1]! + 3) % 3}`).toBe(`${ms} ${i} 1`)
    }
    const frames = [...script([['thinking', 2400], ['stir', 400]], { rounds: 3 })]
    const dishes = frames.filter(f => f.mood === 'thinking' && f.action.dish).map(f => f.action.dish)
    expect([...new Set(dishes)]).toEqual([...DISHES])
  })

  test('the eyes follow what matters: the phone, the bubble, the stove, and back to the phone', () => {
    const runs: string[] = []
    for (const m of run(thinkingAt, 0, CYCLE)) if (runs[runs.length - 1] !== m.pose.eyes) runs.push(m.pose.eyes)
    expect(runs).toEqual(['left', 'up', 'right', 'left'])
  })

  test('winds up with the right arm, releases, and lets go: lift, high, high, then rest', () => {
    expect([12, 13, 14, 15, 16, 20].map(n => tick(n).pose.armR)).toEqual(['lift', 'high', 'high', 'high', 'rest', 'rest'])
    expect(tick(12).pose.lean).toBe(1)
  })

  test('the tossed bit leaves the right hand and flies a true arc to the pan or the pot, one tick at a time', () => {
    for (let c = 0; c < 3; c++) {
      const base = c * CYCLE
      const into = DISHES[c % 3] === 'ramen' ? [potX + 7, potY] : [panX + 15, panY]
      expect([base + 12, base + 13].map(n => tick(n).action.bits.length)).toEqual([0, 0])
      const flight = Array.from({ length: 6 }, (_, i) => tick(base + 14 + i).action.bits[0]!)
      expect(flight.every(b => b !== undefined)).toBe(true)
      const [ax, ay] = handAnchor(tick(base + 14).pose, 'R')
      expect(Math.abs(flight[0]!.x - (cx + ax + 2))).toBeLessThanOrEqual(6)
      expect(Math.abs(flight[0]!.y - (cy + ay))).toBeLessThanOrEqual(6)
      const last = flight[5]!
      expect(Math.abs(last.x - into[0]!)).toBeLessThanOrEqual(5)
      expect(Math.abs(last.y - into[1]!)).toBeLessThanOrEqual(4)
      for (let i = 1; i < 6; i++) expect(flight[i]!.x).toBeGreaterThan(flight[i - 1]!.x)
      // An arc: the middle of the flight is above the straight line from the first to the last point.
      const mid = flight[2]!
      const line = flight[0]!.y + ((last.y - flight[0]!.y) * 2) / 5
      expect(mid.y).toBeLessThan(line)
    }
  })

  test('in the pan the dish splashes in three drops that start on different ticks', () => {
    const counts = [20, 21, 22, 23, 24].map(n => tick(n).action.bits.length)
    expect(counts).toEqual([1, 2, 2, 1, 0])
    const starts = [20, 21, 22].map(n => tick(n).action.bits.map(b => b.x))
    expect(new Set(starts.flat()).size).toBe(3)
  })

  test('in the pot the lid pops twice with a puff each side', () => {
    const ramen = 2 * CYCLE
    expect([20, 21, 22, 23, 24].map(n => tick(ramen + n).action.lidDy)).toEqual([-1, 0, -1, 0, 0])
    for (const n of [20, 22]) {
      const bits = tick(ramen + n).action.bits
      expect(bits.map(b => b.color)).toEqual([PUFF, PUFF])
      expect(bits[0]!.x).toBeLessThan(potX)
      expect(bits[1]!.x).toBeGreaterThanOrEqual(potX + DATA.frames.pot_lid.width)
    }
  })

  test('three dishes make a round that repeats exactly, and a long wait stays finite', () => {
    for (let n = 0; n < 3 * CYCLE; n++) expect(tick(n + 3 * CYCLE)).toEqual(tick(n))
    const { pose, action } = tick(1e9)
    expect(Number.isFinite(pose.squash + pose.lean)).toBe(true)
    expect(action.phone).not.toBeNull()
  })
})

describe('stir: tossing the pan', () => {
  const tick = (n: number) => stirAt(kitchen(n))

  test('the pan crouches, rises in steps, hangs, drops back, dips on the catch and settles', () => {
    expect(run(stirAt, 0, 9).map(m => m.action.panDy)).toEqual([0, -1, -2, -3, -3, -2, -1, 1, 0])
    expect(STIR_TICKS).toBe(15)
  })

  test('flames show exactly while the pan is in the air', () => {
    for (let n = 0; n < STIR_TICKS; n++) expect(tick(n).action.isFlameOn).toBe(tick(n).action.panDy < 0)
  })

  test('the right hand grips the pan handle all the way up and down', () => {
    for (let n = 0; n < STIR_TICKS; n++) {
      const { pose, action } = tick(n)
      expect(pose.armR).toBe('hold')
      const [ax, ay] = handAnchor(pose, 'R')
      expect(cy + ay).toBe(panY + 1 + action.panDy)
      expect(cx + ax).toBeGreaterThanOrEqual(panX)
      expect(cx + ax).toBeLessThan(panX + 8)
    }
  })

  test('he crouches to grab, stretches with the toss, crouches again to catch; the hat is late on the way up', () => {
    const squash = run(stirAt, 0, 9).map(m => m.pose.squash)
    expect(squash[0]).toBe(1)
    expect(squash[1]).toBe(-1)
    expect(squash[6]).toBe(1)
    expect(run(stirAt, 2, 4).every(m => m.pose.hat === 1)).toBe(true)
  })

  test('his eyes follow the food up while the pan is in the air', () => {
    for (let n = 1; n <= 4; n++) expect(tick(n).pose.eyes).toBe('up')
  })

  test('three bits of food fly on arcs of different heights and land one after another', () => {
    const bits = (n: number) => tick(n).action.bits
    expect(bits(0)).toEqual([])
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => bits(n).length)).toEqual([1, 2, 3, 3, 3, 3, 2, 1, 0])
    expect(bits(3).map(b => b.color)).toEqual(FOOD)
    const apex = (color: number) => Math.min(...run(stirAt, 1, 10).flatMap(m => m.action.bits.filter(b => b.color === color).map(b => b.y)))
    const apexes = FOOD.map(apex)
    expect(new Set(apexes).size).toBe(3)
    for (const m of run(stirAt, 0, STIR_TICKS)) for (const b of m.action.bits) expect(b.y).toBeGreaterThanOrEqual(-2)
  })

  test('the food stays over the pan: within its width, above where the pan was lifted to', () => {
    for (let n = 0; n < STIR_TICKS; n++) {
      for (const b of tick(n).action.bits) {
        expect(b.x).toBeGreaterThanOrEqual(panX)
        expect(b.x + 1).toBeLessThan(panX + DATA.frames.pan.width)
        expect(b.y).toBeLessThan(panY + tick(n).action.panDy)
      }
    }
  })

  test('the loop closes and a long wait stays finite', () => {
    for (let n = 0; n < STIR_TICKS; n++) expect(tick(n + STIR_TICKS)).toEqual(tick(n))
    expect(Number.isFinite(tick(1e9).action.panDy)).toBe(true)
  })
})

describe('simmer: the pot bubbles while the answer streams', () => {
  const tick = (n: number) => simmerAt(kitchen(n))

  test('the lid rattles up and down at uneven intervals, and steam is thick over the pot', () => {
    const lid = run(simmerAt, 0, 16).map(m => m.action.lidDy)
    expect(new Set(lid)).toEqual(new Set([0, -1]))
    const runs: number[] = []
    let len = 1
    for (let i = 1; i < lid.length; i++) {
      if (lid[i] === lid[i - 1]) len += 1
      else {
        runs.push(len)
        len = 1
      }
    }
    expect(new Set(runs).size).toBeGreaterThan(1)
    expect(tick(3).action.potSteam).toBe(SIMMER_STEAM)
  })

  test('a puff of steam squeezes out each side exactly while the lid is up', () => {
    for (let n = 0; n < 16; n++) {
      const { action } = tick(n)
      const puffs = action.bits.filter(b => b.y === potY)
      expect(puffs.length).toBe(action.lidDy === -1 ? 2 : 0)
      for (const b of puffs) expect(b.color).toBe(PUFF)
    }
  })

  test('bubbles pop at the rim now and then', () => {
    const rim = run(simmerAt, 0, 16).filter(m => m.action.bits.some(b => b.y === potY - 1))
    expect(rim.length).toBeGreaterThan(0)
    expect(rim.length).toBeLessThan(16)
  })

  test('Clawd leans toward the pot and watches it, and now and then stirs with his right arm', () => {
    for (let n = 0; n < 16; n++) {
      expect(tick(n).pose.lean).toBe(1)
      expect(tick(n).pose.eyes).toBe('right')
    }
    expect(run(simmerAt, 0, 24).some(m => m.pose.armR === 'lift')).toBe(true)
  })

  test('the loop closes', () => {
    for (let n = 0; n < 48; n++) expect(tick(n + 48)).toEqual(tick(n))
  })
})

describe('season: shaking salt over the pan', () => {
  const tick = (n: number) => seasonAt(kitchen(n))

  test('the right arm holds the shaker high, and the shaker jiggles six ticks then is held still', () => {
    for (let n = 0; n < SEASON_TICKS; n++) expect(tick(n).pose.armR).toBe('high')
    expect(run(seasonAt, 0, 12).map(m => m.action.shaker!.dy)).toEqual([0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0])
  })

  test('three grains fall from the shaker at different speeds, one after the other, into the pan', () => {
    const grains = (n: number) => tick(n).action.bits
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => grains(n).length)).toEqual([1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0])
    const [ax, ay] = handAnchor(tick(0).pose, 'R')
    const from = [cx + ax + 3, cy + ay + 2]
    const first = grains(0)[0]!
    expect(Math.abs(first.x - from[0]!)).toBeLessThanOrEqual(3)
    expect(Math.abs(first.y - from[1]!)).toBeLessThanOrEqual(3)
    // Grain i leaves at tick 2i; after four ticks aloft the faster ones have drifted further toward the pan.
    const drift = [0, 1, 2].map(i => grains(2 * i + 4)[0]!.x - grains(2 * i).slice(-1)[0]!.x)
    expect(drift[1]!).toBeGreaterThan(drift[0]!)
    expect(drift[2]!).toBeGreaterThan(drift[1]!)
    for (const b of run(seasonAt, 0, 12).flatMap(m => m.action.bits)) {
      expect(b.x).toBeGreaterThanOrEqual(panX)
      expect(b.x + 1).toBeLessThan(panX + DATA.frames.pan.width)
      expect(b.color).toBe(PUFF)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeLessThan(comfy.height)
    }
  })

  test('his eyes follow the shaker, then the grains, and he nods when he is done', () => {
    expect([0, 3, 5].map(n => tick(n).pose.eyes)).toEqual(['right', 'right', 'right'])
    expect([6, 8].map(n => tick(n).pose.eyes)).toEqual(['down', 'down'])
    expect(tick(10).pose.hat).toBe(1)
    expect(tick(10).pose.eyes).toBe('half')
    expect(tick(11).pose.eyes).toBe('happy')
  })

  test('the loop closes', () => {
    for (let n = 0; n < SEASON_TICKS; n++) expect(tick(n + SEASON_TICKS)).toEqual(tick(n))
  })
})

describe('smoke: a burnt dish', () => {
  const tick = (n: number) => smokeAt(kitchen(n))

  test('the dish is burnt and dark smoke rises from the pan all through', () => {
    for (let n = 0; n < 44; n++) {
      const { action } = tick(n)
      expect(action.isBurnt).toBe(true)
      expect(action.smoke).not.toBeNull()
      expect(action.smoke!.x).toBeGreaterThanOrEqual(panX)
      expect(action.smoke!.x).toBeLessThan(panX + 22)
      expect(action.smoke!.y).toBeLessThan(panY - DATA.frames.burnt.height)
    }
    expect(SMOKE_PUFF).toBeGreaterThan(0)
  })

  test('Clawd reacts in order: he is startled, he coughs, he droops', () => {
    const runs: string[] = []
    for (const m of run(smokeAt, 0, 44)) if (runs[runs.length - 1] !== m.pose.eyes) runs.push(m.pose.eyes)
    expect(runs).toEqual(['wide', 'closed', 'half'])
    expect([0, 1, 2].every(n => tick(n).pose.eyes === 'wide')).toBe(true)
    expect(tick(2).pose.legs).toBe('hop')
    expect(tick(1).pose.squash).toBe(-1)
  })

  test('the cough shakes his body a cell side to side while an arm fans the smoke away', () => {
    const cough = run(smokeAt, 3, 23).map(m => m.pose)
    expect(new Set(cough.map(p => p.lean)).size).toBeGreaterThan(1)
    expect(new Set(cough.map(p => p.armR))).toEqual(new Set(['high', 'lift']))
  })

  test('then the shoulders drop and the hat slips', () => {
    for (let n = 23; n < 44; n++) {
      const { pose } = tick(n)
      expect(pose.squash).toBe(1)
      expect(pose.hat).toBe(1)
      expect([pose.armL, pose.armR]).toEqual(['rest', 'rest'])
    }
  })

  test('stays finite after a long wait', () => {
    expect(tick(1e9).action.isBurnt).toBe(true)
  })
})
