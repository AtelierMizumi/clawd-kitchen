// Spec for the v3 moods that follow the turn (hooks/v3/moods.ts): thinking (reading a phone, a thought growing),
// simmer (the answer streaming: a slow stir of the pot), stir (a Bash call: a quick one), season (an Edit or a Write:
// the shaker), serve (the answer done: the dish on a plate), smoke (an error: a burnt pot, a cough) and sleep. Each is
// a pure function of the frames since the mood began, on 24 fps sheets.
import { describe, expect, test } from 'claude-code/testing'

import { MOOD_NAMES, moodAt } from './v3/moods'
import type { MoodName, MoodView } from './v3/moods'
import { pose } from './v3/clawd'

const frames = (mood: MoodName, from: number, count: number, served = 0): MoodView[] =>
  Array.from({ length: count }, (_, i) => moodAt(mood, from + i, served))
const same = (a: MoodView, b: MoodView) => JSON.stringify(a) === JSON.stringify(b)
/** Consecutive equal values joined: `[value, frames]`. */
const runs = <T>(values: T[]): [T, number][] => {
  const out: [T, number][] = []
  for (const v of values) {
    const last = out[out.length - 1]
    if (last && JSON.stringify(last[0]) === JSON.stringify(v)) last[1]++
    else out.push([v, 1])
  }
  return out
}

describe('every mood', () => {
  test('is a valid pose and sensible props on every frame, and the same for the same frame', () => {
    for (const mood of MOOD_NAMES) {
      for (let k = 0; k < 400; k++) {
        const v = moodAt(mood, k)
        expect(() => pose(v.pose)).not.toThrow()
        expect(JSON.stringify(v)).toBe(JSON.stringify(moodAt(mood, k)))
        for (const p of [...v.bubbles, ...v.flakes, ...v.smoke, ...v.zs, ...v.stars]) {
          expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true)
        }
      }
    }
  })

  test('there are the seven that follow the turn', () => {
    expect([...MOOD_NAMES].sort()).toEqual(['season', 'serve', 'simmer', 'sleep', 'smoke', 'stir', 'thinking'])
  })
})

describe('thinking', () => {
  test('after a short crouch he holds a phone up in his right hand, seen edge-on, and its screen scrolls: four pictures, on threes, with pauses between flicks', () => {
    const v = frames('thinking', 0, 120)
    expect(v.slice(0, 3).every(f => f.pose.tool === null || f.pose.tool === undefined)).toBe(true)
    expect(v[3]!.pose.tool).toMatch(/^phone_/)
    expect(new Set(v.slice(3).map(f => f.pose.tool))).toEqual(new Set(['phone_0', 'phone_1', 'phone_2', 'phone_3']))
    const scroll = runs(frames('thinking', 8, 12).map(f => f.pose.tool))
    expect(scroll.map(([, n]) => n)).toEqual([3, 3, 3, 3])
  })

  test('he reads it: his eyes are on the phone most of the time, glance away once to think, and blink', () => {
    const v = frames('thinking', 8, 96)
    expect(v.filter(f => f.pose.look === 1).length).toBeGreaterThan(48)
    expect(v.some(f => f.pose.look === -1)).toBe(true)
    expect(v.some(f => f.pose.eyes === 'closed')).toBe(true)
  })

  test('a thought bubble grows as in a comic: a small bubble, a bigger one, a cloud, and the cloud fills with dots one at a time', () => {
    const v = frames('thinking', 8, 96)
    expect(runs(v.map(f => f.bubble)).map(([b]) => b)).toEqual([0, 1, 2, 3, 4, 0])
    expect(v.filter(f => f.bubble !== 4).every(f => f.dots === 0)).toBe(true)
    expect(runs(v.map(f => f.dots)).map(([d]) => d)).toEqual([0, 1, 2, 3, 0])
  })

  test('the hat jumps when the thought arrives', () => {
    const arrive = frames('thinking', 8, 96).findIndex(f => f.bubble === 4) + 8
    expect(moodAt('thinking', arrive).pose.hat?.y).toBeGreaterThan(0)
    expect(moodAt('thinking', arrive + 3).pose.hat?.y ?? 0).toBeLessThanOrEqual(0)
  })

  test('it loops every 96 frames after the entry', () => {
    for (let k = 8; k < 60; k++) expect(same(moodAt('thinking', k), moodAt('thinking', k + 96))).toBe(true)
  })
})

describe('simmer', () => {
  test('the pot is open, he stirs it slowly: the spoon goes round a, b, c, b, six frames each', () => {
    const v = frames('simmer', 6, 48)
    expect(v.every(f => f.pot === 'open')).toBe(true)
    expect(runs(v.slice(0, 24).map(f => f.pose.tool))).toEqual([['spoon_a', 6], ['spoon_b', 6], ['spoon_c', 6], ['spoon_b', 6]])
  })

  test('the soup bubbles and the bubbles pop, and steam rises', () => {
    const v = frames('simmer', 6, 48)
    expect(v.some(f => f.bubbles.some(b => !b.popping))).toBe(true)
    expect(v.some(f => f.bubbles.some(b => b.popping))).toBe(true)
    expect(v.every(f => f.steam)).toBe(true)
  })

  test('he is content, eyes toward the pot, and it loops every 48 frames', () => {
    expect(frames('simmer', 6, 48).filter(f => f.pose.look === 1).length).toBeGreaterThan(30)
    for (let k = 6; k < 60; k++) expect(same(moodAt('simmer', k), moodAt('simmer', k + 48))).toBe(true)
  })
})

describe('stir', () => {
  test('the spoon goes round in 8 frames, a bubbling pot', () => {
    const v = frames('stir', 4, 16)
    expect(runs(v.slice(0, 8).map(f => f.pose.tool))).toEqual([['spoon_a', 2], ['spoon_b', 2], ['spoon_c', 2], ['spoon_b', 2]])
    expect(v.every(f => f.pot === 'open')).toBe(true)
  })

  test('he leans into it: his body squashes on the far side of the stir and the hat bobs', () => {
    const v = frames('stir', 4, 16)
    expect(v.some(f => f.pose.body === 'squash')).toBe(true)
    expect(v.some(f => f.pose.body === 'neutral')).toBe(true)
    expect(new Set(v.map(f => f.pose.hat?.y)).size).toBeGreaterThan(1)
  })
})

describe('season', () => {
  test('the shaker is held, then jerked up and down four times on twos, then held again', () => {
    const tools = frames('season', 0, 40).map(f => f.pose.tool)
    const r = runs(tools)
    expect(r.filter(([t]) => t === 'shaker_up').length).toBe(4)
    expect(r.filter(([t]) => t === 'shaker_down').length).toBe(4)
    expect(r.filter(([t]) => t === 'shaker_up' || t === 'shaker_down').every(([, n]) => n === 2)).toBe(true)
    expect(tools[39]).toBe('shaker_hold')
  })

  test('flakes fall from the can to the soup, a block at a time, and none are left in the air afterwards', () => {
    const v = frames('season', 0, 80)
    expect(v.some(f => f.flakes.length > 0)).toBe(true)
    // a flake falls: follow the lowest-numbered one by its starting frame
    const first = v.findIndex(f => f.flakes.length > 0)
    const ys = v.slice(first, first + 6).map(f => Math.max(...f.flakes.map(p => p.y)))
    expect(ys[ys.length - 1]).toBeGreaterThan(ys[0]!)
    expect(v.slice(60).every(f => f.flakes.length === 0)).toBe(true)
  })

  test('the pot is open for the soup to be seasoned', () => {
    expect(frames('season', 0, 40).every(f => f.pot === 'open')).toBe(true)
  })
})

describe('serve', () => {
  test('no plate until he has crouched and sprung; then it is held up for the flourish, with the dish on it', () => {
    const v = frames('serve', 0, 72)
    expect(v.slice(0, 6).every(f => f.plate === null)).toBe(true)
    expect(v.some(f => f.pose.tool === 'plate_up')).toBe(true)
    expect(v.filter(f => f.plate !== null).every(f => f.plate === 'dish_roast')).toBe(true)
  })

  test('each answer served is a different dish: roast, salad, cake, and round again', () => {
    const dish = (served: number) => moodAt('serve', 20, served).plate
    expect([0, 1, 2, 3].map(dish)).toEqual(['dish_roast', 'dish_salad', 'dish_cake', 'dish_roast'])
  })

  test('he is delighted while the plate is up: happy eyes, stars twinkling, the hat floating', () => {
    const up = frames('serve', 0, 72).filter(f => f.pose.tool === 'plate_up')
    expect(up.every(f => f.pose.eyes === 'happy')).toBe(true)
    expect(up.some(f => f.stars.length > 0)).toBe(true)
    expect(up.some(f => (f.pose.hat?.y ?? 0) < 0)).toBe(true)
    expect(frames('serve', 0, 72).filter(f => f.pose.tool !== 'plate_up').every(f => f.stars.length === 0)).toBe(true)
  })

  test('then a small bow, and the plate is held at his chest until the end', () => {
    const v = frames('serve', 0, 72)
    expect(v.slice(40).some(f => f.pose.body === 'squash')).toBe(true)
    expect(v[71]!.pose.tool).toBe('plate_hold')
  })
})

describe('smoke', () => {
  test('the pot is burnt and smoke pours out, in puffs of two sizes', () => {
    const v = frames('smoke', 0, 84)
    expect(v.every(f => f.pot === 'burnt')).toBe(true)
    expect(v.some(f => f.smoke.some(s => s.size === 'big'))).toBe(true)
    expect(v.some(f => f.smoke.some(s => s.size === 'small'))).toBe(true)
  })

  test('he coughs three times: his body jolts, eyes shut, and he fans the smoke with his arms', () => {
    const v = frames('smoke', 0, 84)
    expect(runs(v.map(f => f.pose.body === 'squash' || f.pose.body === 'stretch')).filter(([b]) => b).length).toBeGreaterThanOrEqual(3)
    expect(v.some(f => f.pose.eyes === 'closed')).toBe(true)
    expect(new Set(v.map(f => f.pose.arms)).size).toBe(2)
  })

  test('it loops while the mood lasts', () => {
    for (let k = 10; k < 60; k++) expect(same(moodAt('smoke', k), moodAt('smoke', k + 84))).toBe(true)
  })
})

describe('sleep', () => {
  test('he yawns and stretches, then slumps: arms up, eyes closed, then down in a squash', () => {
    const v = frames('sleep', 0, 24)
    expect(v.some(f => f.pose.arms === 'up' && f.pose.body === 'stretch')).toBe(true)
    expect(v[23]!.pose.body).toBe('squash')
    expect(v[23]!.pose.eyes).toBe('closed')
  })

  test('asleep he breathes slowly, 72 frames a breath, eyes closed, the hat pressed down', () => {
    const v = frames('sleep', 24, 72)
    expect(v.every(f => f.pose.eyes === 'closed')).toBe(true)
    expect(new Set(v.map(f => f.pose.body))).toEqual(new Set(['squash', 'neutral']))
    expect(v.every(f => (f.pose.hat?.y ?? 0) > 0)).toBe(true)
    // the body repeats at once; the Zs from the second breath on (the first has only one in the air)
    for (let k = 24; k < 60; k++) expect(JSON.stringify(moodAt('sleep', k).pose)).toBe(JSON.stringify(moodAt('sleep', k + 72).pose))
    for (let k = 60; k < 100; k++) expect(same(moodAt('sleep', k), moodAt('sleep', k + 72))).toBe(true)
  })

  test('Zs float up from him, a small one first, a bigger one as it rises', () => {
    const v = frames('sleep', 24, 144)
    const zs = v.filter(f => f.zs.length > 0)
    expect(zs.length).toBeGreaterThan(40)
    const z = v.flatMap(f => f.zs)
    expect(z.some(p => p.size === 'small')).toBe(true)
    expect(z.some(p => p.size === 'big')).toBe(true)
    const track = v.slice(0, 20).map(f => f.zs[0]?.y).filter((y): y is number => y !== undefined)
    expect(track[track.length - 1]).toBeLessThan(track[0]!)
  })
})
