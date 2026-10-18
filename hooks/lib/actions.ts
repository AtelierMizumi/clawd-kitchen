// What Clawd's body and the kitchen do in each mood, as a pure function of time: a Pose for Clawd and an Action for
// the pan, flames, food and bubble. Each mood's motion lives in motion/; this chooses between them.
import type { Action } from './action'
import type { Pose } from './clawd'
import { idleAt } from './motion/idle'
import type { Kitchen, Moment } from './motion/moment'
import { seasonAt } from './motion/season'
import { serveAt } from './motion/serve'
import { simmerAt } from './motion/simmer'
import { sleepAt } from './motion/sleep'
import { smokeAt } from './motion/smoke'
import { stirAt } from './motion/stir'
import { thinkingAt } from './motion/thinking'
import { typingAt } from './motion/typing'
import type { Mood } from './mood'

import { NONE } from './action'
export { NONE }
export type { Action, Bit } from './action'
export type { Kitchen } from './motion/moment'

/**
 * The moment of `mood` at `t` ms of the session. Idle and sleep run on the clock of the whole session; every other
 * mood plays from its own first keyframe, `k.sinceMood` ms ago, and carries the table where `k` has it.
 */
export const actionAt = (mood: Mood, t: number, k: Kitchen = { tableX: NONE.tableX, sinceArrived: 0, sinceMood: t }): Moment => {
  if (mood === 'idle' || mood === 'sleep') {
    const { pose, action } = mood === 'idle' ? idleAt(t) : sleepAt(t)
    return { pose, action: { ...action, tableX: k.tableX } }
  }
  if (mood === 'typing') return typingAt(k)
  if (mood === 'serve') return serveAt(k)
  if (mood === 'thinking') return thinkingAt(k)
  if (mood === 'stir') return stirAt(k)
  if (mood === 'season') return seasonAt(k)
  if (mood === 'smoke') return smokeAt(k)
  return simmerAt(k)
}

/** Everything that is drawn, as a string: equal while nothing changes, so the mod redraws the moment something does. */
export const frameKey = (pose: Pose, action: Action): string => JSON.stringify([pose, action])
