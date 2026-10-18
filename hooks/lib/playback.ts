// Plays moods from a calm start the way the mod does: the table slides on its own clock, and every tick asks
// `actionAt` for the pose and action. Shared by the tests and the preview tools.
import type { Action } from './actions'
import { actionAt } from './actions'
import type { Pose } from './clawd'
import type { Mood } from './mood'
import { initialKitchen, kitchenStep, sinceArrived, sinceMood } from './table'

export const PLAYBACK_STEP_MS = 80

export type PlayedFrame = { t: number; mood: Mood; pose: Pose; action: Action }

/** A list of (mood, ms) spells played one after another, `rounds` times over, the kitchen carried from one to the next. */
export function* script(
  spells: readonly (readonly [Mood, number])[],
  { step = PLAYBACK_STEP_MS, served = 1, rounds = 1 }: { step?: number; served?: number; rounds?: number } = {},
): Generator<PlayedFrame> {
  let kitchen = initialKitchen(0)
  let t = 0
  for (let round = 0; round < rounds; round++) {
    for (const [mood, ms] of spells) {
      for (let spent = 0; spent < ms; spent += step, t += step) {
        kitchen = kitchenStep(kitchen, mood, t)
        const { pose, action } = actionAt(mood, t, {
          tableX: kitchen.tableX,
          sinceArrived: sinceArrived(kitchen, t),
          sinceMood: sinceMood(kitchen, t),
          served,
          dishBase: kitchen.dishBase,
        })
        yield { t, mood, pose, action }
      }
    }
  }
}

/** One mood for `ms` ms after `start` ms of it already played unseen, and, if `warm`, that long of idle before it. */
export function* playback(
  mood: Mood,
  ms: number,
  { step = PLAYBACK_STEP_MS, start = 0, served = 1, warm = 0 }: { step?: number; start?: number; served?: number; warm?: number } = {},
): Generator<PlayedFrame> {
  const skip = Math.ceil(warm / step) + Math.ceil(start / step)
  let i = 0
  for (const frame of script(warm > 0 ? [['idle', warm], [mood, start + ms]] : [[mood, start + ms]], { step, served })) {
    if (i++ >= skip) yield frame
  }
}
