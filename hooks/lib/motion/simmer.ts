// Simmer (the answer is streaming): the pot bubbles. The lid rattles up and down at uneven intervals with a puff of
// steam squeezing out each side whenever it is up, bubbles pop at the rim, and Clawd leans toward the pot to watch,
// now and then giving it a stir with his right arm.
import { DATA } from '../../gen/data'
import type { Bit } from '../action'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'
import { PUFF } from './thinking'

export const SIMMER_STEAM = 7
/** Lid up (1) or shut (0) on each tick of a 16-tick pattern; the intervals are deliberately uneven. */
const LID = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0] as const

const { pot } = DATA.scenes.comfy
const LID_W = DATA.frames.pot_lid.width

export const simmerAt = (k: Kitchen): Moment => {
  const n = Math.max(0, Math.floor(k.sinceMood / TICK_MS))
  const up = LID[n % LID.length] === 1
  const bits: Bit[] = []
  if (up) bits.push({ color: PUFF, x: pot[0] - 1, y: pot[1] }, { color: PUFF, x: pot[0] + LID_W, y: pot[1] })
  if (n % 4 === 1 && !up) bits.push({ color: PUFF, x: pot[0] + 4 + ((n * 3) % 8), y: pot[1] - 1 })
  return moment(
    { eyes: 'right', lean: 1, armR: n % 12 === 8 || n % 12 === 9 ? 'lift' : 'rest' },
    { tableX: k.tableX, lidDy: up ? -1 : 0, potSteam: SIMMER_STEAM, bits },
  )
}
