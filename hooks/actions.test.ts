// Spec for choosing what Clawd and the kitchen do in each mood (hooks/lib/actions.ts).
// The motions themselves are specified in motion.*.test.ts; this is the dispatch between them.
import { describe, expect, test } from 'claude-code/testing'

import { DATA } from './gen/data'
import { NONE, actionAt, frameKey } from './lib/actions'
import { idleAt } from './lib/motion/idle'
import { TICK_MS } from './lib/motion/keyframes'
import type { Kitchen } from './lib/motion/moment'
import { SIMMER_STEAM } from './lib/motion/simmer'
import { sleepAt } from './lib/motion/sleep'
import type { Mood } from './lib/mood'
import { initialKitchen, kitchenStep, sinceArrived, sinceMood } from './lib/table'

const { rest, work } = DATA.scenes.comfy.table
const MOODS: Mood[] = ['idle', 'typing', 'thinking', 'stir', 'season', 'serve', 'smoke', 'sleep', 'simmer']
const k = (extra: Partial<Kitchen> = {}): Kitchen => ({ tableX: rest, sinceArrived: 0, sinceMood: 0, ...extra })

describe('actionAt', () => {
  test('idle is the breathing pose with nothing happening in the kitchen, whatever the mood clock says', () => {
    const { pose, action } = actionAt('idle', 5000, k({ sinceMood: 999 }))
    expect(pose).toEqual(idleAt(5000).pose)
    expect(action).toEqual({ ...NONE, tableX: rest })
  })

  test('sleep is the dozing pose on the clock of the whole session', () => {
    expect(actionAt('sleep', 70_000, k()).pose).toEqual(sleepAt(70_000).pose)
    expect(actionAt('sleep', 70_000, k()).action.zee).not.toBeNull()
  })

  test('typing pulls the table until it is there, then chops', () => {
    expect(actionAt('typing', 0, k({ tableX: rest + 6 })).pose.armL).toBe('out')
    const chop = actionAt('typing', 0, k({ tableX: work, sinceArrived: 0 }))
    expect(chop.pose.armL).toBe('hold')
    expect(chop.action.knife).toBe(true)
  })

  test('serving pulls the table until it is there, then drops a dish on a plate', () => {
    expect(actionAt('serve', 0, k({ tableX: rest + 6, served: 1 })).action.plate).toBeNull()
    expect(actionAt('serve', 0, k({ tableX: work, served: 1 })).action.plate).not.toBeNull()
  })

  test('the stove moods each do their own thing', () => {
    expect(actionAt('thinking', 0, k()).action.phone).not.toBeNull()
    expect(actionAt('stir', 0, k({ sinceMood: 3 * TICK_MS })).action.panDy).toBeLessThan(0)
    expect(actionAt('season', 0, k()).action.shaker).not.toBeNull()
    expect(actionAt('smoke', 0, k()).action.isBurnt).toBe(true)
    expect(actionAt('simmer', 0, k()).action.potSteam).toBe(SIMMER_STEAM)
  })

  test('each mood plays from its first keyframe when it begins, whatever the clock of the session says', () => {
    for (const mood of ['thinking', 'stir', 'season', 'smoke', 'simmer'] as const) {
      expect(actionAt(mood, 123_456, k({ sinceMood: 0 }))).toEqual(actionAt(mood, 0, k({ sinceMood: 0 })))
    }
  })

  test('the phone, the shaker and the knife belong to their moods alone', () => {
    for (const mood of MOODS) {
      const { action } = actionAt(mood, 1000, k({ tableX: work, sinceArrived: 400, sinceMood: 400, served: 1 }))
      expect(action.phone !== null).toBe(mood === 'thinking')
      expect(action.shaker !== null).toBe(mood === 'season')
      expect(action.knife).toBe(mood === 'typing')
    }
    expect(NONE.phone).toBeNull()
    expect(NONE.shaker).toBeNull()
    expect(NONE.knife).toBe(false)
  })

  test('the pot steams harder than usual in no other mood', () => {
    for (const mood of MOODS) {
      if (mood !== 'simmer') expect(actionAt(mood, 0, k({ served: 1, tableX: work })).action.potSteam).toBe(0)
    }
  })

  test('the table stays wherever it is for every mood that does not move it', () => {
    for (const mood of MOODS) {
      expect(actionAt(mood, 1000, k({ tableX: -7.5, served: 1 })).action.tableX).toBe(-7.5)
    }
  })

  test('every mood is finite at the start and after days', () => {
    for (const mood of MOODS) {
      for (const sinceMood of [0, 80, 1e6, 1e12]) {
        const { pose, action } = actionAt(mood, sinceMood, k({ tableX: work, sinceArrived: sinceMood, sinceMood, served: 2 }))
        expect(Number.isFinite(pose.glow + pose.squash + pose.lean + pose.hat + pose.handL + pose.handR)).toBe(true)
        expect(Number.isFinite(action.panDy + action.lidDy + action.potSteam)).toBe(true)
        for (const b of action.bits) expect(Number.isFinite(b.x + b.y)).toBe(true)
      }
    }
  })

  test('driven by the kitchen as the mod does, typing goes from pulling to chopping on its own', () => {
    let kitchen = initialKitchen(0)
    const seen = new Set<string>()
    for (let t = 0; t < 3000; t += TICK_MS) {
      kitchen = kitchenStep(kitchen, 'typing', t)
      const { pose } = actionAt('typing', t, { tableX: kitchen.tableX, sinceArrived: sinceArrived(kitchen, t), sinceMood: sinceMood(kitchen, t) })
      seen.add(pose.armL)
    }
    expect(seen).toEqual(new Set(['out', 'hold']))
  })
})

describe('frameKey', () => {
  test('is equal for equal moments and different when anything drawn differs', () => {
    const a = actionAt('typing', 0, k({ tableX: work, sinceArrived: 400, sinceMood: 5000 }))
    const same = actionAt('typing', 0, k({ tableX: work, sinceArrived: 400, sinceMood: 5000 }))
    const next = actionAt('typing', 0, k({ tableX: work, sinceArrived: 480, sinceMood: 5080 }))
    expect(frameKey(a.pose, a.action)).toBe(frameKey(same.pose, same.action))
    expect(frameKey(a.pose, a.action)).not.toBe(frameKey(next.pose, next.action))
  })

  test('tells apart a blink from an open eye, so an idle Clawd is redrawn the moment he blinks', () => {
    const open = idleAt(2000)
    const blink = { ...open, pose: { ...open.pose, eyes: 'closed' as const } }
    expect(frameKey(open.pose, open.action)).not.toBe(frameKey(blink.pose, blink.action))
  })
})
