// Pulling the prep table over. Ticks since the mood began drive the pull, not how far the table has come: the table
// moves nearly three pixels a tick, so only the clock gives a rhythm. Clawd leans away and reaches for it on the first
// tick, tugs with a lean and a foot that alternate each tick, and straightens when the table is almost there. Shared by
// typing (to chop) and serving (to put the dish on).
import { DATA } from '../../gen/data'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'

const { rest, work } = DATA.scenes.comfy.table
/** How far along the table must be, from 0 at rest to 1 at the work spot, for Clawd to settle. */
const SETTLE_FROM = 0.8

export const pullAt = (k: Kitchen): Moment => {
  const progress = Math.min(1, Math.max(0, (k.tableX - rest) / (work - rest)))
  const n = Math.max(0, Math.floor(k.sinceMood / TICK_MS))
  const action = { tableX: k.tableX }
  if (n === 0) return moment({ armL: 'out', eyes: 'left', lean: 1 }, action)
  if (progress >= SETTLE_FROM) return moment({ armL: 'out', eyes: 'down', lean: 0 }, action)
  return moment({ armL: 'out', eyes: 'left', lean: n % 2 === 1 ? -1 : 0, legs: n % 2 === 1 ? 'tapL' : 'tapR' }, action)
}
