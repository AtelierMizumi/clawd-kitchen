// The prep table: it slides over to Clawd while you type and back again after.
// Pure functions over a small state, so the hooks and the previews agree.
import { DATA } from '../gen/data'
import type { Mood } from './mood'

const { rest, work } = DATA.scenes.comfy.table

export const SLIDE_PX_PER_S = 40

export type Kitchen = {
  tableX: number
  /** Time of the last step; the slide is measured from here. */
  at: number
  /** When the table reached Clawd, or null while it is away or on its way. */
  arrivedAt: number | null
}

export const slideTable = (x: number, target: number, dtMs: number): number => {
  const step = (SLIDE_PX_PER_S * Math.max(0, dtMs)) / 1000
  return x < target ? Math.min(target, x + step) : Math.max(target, x - step)
}

export const initialKitchen = (now: number): Kitchen => ({ tableX: rest, at: now, arrivedAt: null })

export const kitchenStep = (k: Kitchen, mood: Mood, now: number): Kitchen => {
  // Typing brings the table to chop on; serving brings it to put the dish on.
  const tableX = slideTable(k.tableX, mood === 'typing' || mood === 'serve' ? work : rest, now - k.at)
  const arrivedAt = tableX !== work ? null : (k.arrivedAt ?? now)
  return { tableX, at: now, arrivedAt }
}

/** How long Clawd has had the table to work at, in ms; 0 while it is not there. */
export const sinceArrived = (k: Kitchen, now: number): number =>
  k.arrivedAt === null ? 0 : Math.max(0, now - k.arrivedAt)
