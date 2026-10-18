// The prep table: it slides over to Clawd while you type and back again after.
// Pure functions over a small state, so the hooks and the previews agree.
import { DATA } from '../gen/data'
import type { Mood } from './mood'

const { rest, work } = DATA.scenes.comfy.table

/** Pixels are half a cell wide: ten cells in about half a second, seven ticks, enough to see a pull begin, tug and settle. */
export const SLIDE_PX_PER_S = 36
/** One pass of the phone in the thinking mood: a swipe, a dish, a toss. */
export const DISH_CYCLE_MS = 2000
/** How far into a cycle the swipe ends and the dish appears in the bubble. */
export const DISH_SHOWN_AFTER_MS = 400

export type Kitchen = {
  tableX: number
  /** Time of the last step; the slide is measured from here. */
  at: number
  /** When the table reached Clawd, or null while it is away or on its way. */
  arrivedAt: number | null
  /** The mood of the last step, and when it began: every motion plays from its first keyframe. */
  mood: Mood
  moodAt: number
  /** Dishes the phone has moved on by in earlier spells of thinking, so each new spell shows the next dish. */
  dishBase: number
}

export const slideTable = (x: number, target: number, dtMs: number): number => {
  const step = (SLIDE_PX_PER_S * Math.max(0, dtMs)) / 1000
  return x < target ? Math.min(target, x + step) : Math.max(target, x - step)
}

export const initialKitchen = (now: number): Kitchen => ({ tableX: rest, at: now, arrivedAt: null, mood: 'idle', moodAt: now, dishBase: 0 })

export const kitchenStep = (k: Kitchen, mood: Mood, now: number): Kitchen => {
  // Typing brings the table to chop on; serving brings it to put the dish on.
  const tableX = slideTable(k.tableX, mood === 'typing' || mood === 'serve' ? work : rest, now - k.at)
  const arrivedAt = tableX !== work ? null : (k.arrivedAt ?? now)
  // Leaving thinking moves the rotation on by the cycles played; the interrupted one counts only if its dish had appeared.
  // Counted to the last frame of thinking, which is the previous step: the step that leaves is not a frame of it.
  const spent = k.at - k.moodAt
  const played = Math.floor(spent / DISH_CYCLE_MS) + (spent % DISH_CYCLE_MS >= DISH_SHOWN_AFTER_MS ? 1 : 0)
  const dishBase = k.mood === 'thinking' && mood !== 'thinking' ? k.dishBase + played : k.dishBase
  return { tableX, at: now, arrivedAt, mood, moodAt: mood === k.mood ? k.moodAt : now, dishBase }
}

/** How long Clawd has had the table to work at, in ms; 0 while it is not there. */
export const sinceArrived = (k: Kitchen, now: number): number =>
  k.arrivedAt === null ? 0 : Math.max(0, now - k.arrivedAt)

/** How long the current mood has been playing, in ms. */
export const sinceMood = (k: Kitchen, now: number): number => Math.max(0, now - k.moodAt)
