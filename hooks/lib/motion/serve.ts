// Serving: the table comes over, a dish drops onto a plate on it and bounces twice, sparkles twinkle round it in
// staggered pairs, and Clawd watches it fall, then cheers: a crouch, a hop with both arms high, a landing, over and over.
import { DATA } from '../../gen/data'
import type { Bit } from '../action'
import type { Pose } from '../clawd'
import { TICK_MS, hold, sampleTrack, track } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'
import { pullAt } from './pull'
import { DISHES } from './thinking'

export const SPARKLE_COLOR = 0xffe27a

const { work, frontY, dishX } = DATA.scenes.comfy.table
const PLATE_H = DATA.frames.plate.height
const DISH_H = DATA.frames.dish_burger.height

/** How far above its place the dish is at each tick: falling, landing, two bounces. */
const DROP = [-10, -6, -3, 0, -2, 0, -1, 0] as const
const SETTLED = DROP.length

type Beat = Partial<Pose>
const cheer = (b: Beat): Beat => ({ eyes: 'happy', armL: 'high', armR: 'high', ...b })
const CHEER = track<Beat>(
  hold(1, cheer({ squash: 1 })),
  hold(1, cheer({ squash: -1, legs: 'hop' })),
  hold(1, cheer({ squash: -1, legs: 'hop', hat: 1 })),
  hold(1, cheer({ squash: 0 })),
  hold(1, cheer({ squash: 0, armL: 'lift', armR: 'lift' })),
  hold(1, cheer({ squash: 0, armL: 'rest', armR: 'rest' })),
)

export const serveAt = (k: Kitchen): Moment => {
  if (k.tableX < work) return pullAt(k)
  // Counted from the arrival, or from the start of the mood if that is later: a mood that begins with the table already
  // there still plays from its first keyframe.
  const n = Math.max(0, Math.floor(Math.min(k.sinceArrived, k.sinceMood) / TICK_MS))
  const dish = DISHES[Math.max(0, (k.served ?? 0) - 1) % DISHES.length]!
  const dy = n < SETTLED ? DROP[n]! : 0

  const bits: Bit[] = []
  if (n >= SETTLED) {
    // Six places round the dish; two of them twinkle at a time, a step every two ticks.
    const left = k.tableX + dishX
    const top = frontY - PLATE_H - DISH_H
    const w = DATA.frames.dish_egg.width
    const spots: [number, number][] = [
      [left - 2, top + 1],
      [left + w, top + 2],
      [left + 2, top - 2],
      [left + w - 4, top - 3],
      [left + w + 2, top + 3],
      [left - 2, top + 3],
    ]
    const step = Math.floor((n - SETTLED) / 2)
    for (const i of [2 * step, 2 * step + 1]) {
      const [x, y] = spots[i % spots.length]!
      bits.push({ color: SPARKLE_COLOR, x, y })
    }
  }
  const pose: Beat = n < 3 ? { eyes: 'up', armL: 'lift', armR: 'lift' } : sampleTrack(CHEER, (n - 3) * TICK_MS)
  return moment(pose, { tableX: k.tableX, plate: { dish, dy }, bits })
}
