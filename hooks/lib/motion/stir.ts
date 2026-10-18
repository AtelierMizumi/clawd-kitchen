// Stir (a Bash call): Clawd grips the pan's handle, crouches, stretches up as the pan rises in steps, hangs it, catches
// it with a dip and settles. Three bits of food fly on arcs of different heights and land one after another; the flames
// show while the pan is in the air. One cycle is 15 ticks.
import { DATA } from '../../gen/data'
import type { Bit } from '../action'
import type { Pose } from '../clawd'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'

export const STIR_TICKS = 15
export const FOOD = [0xe2493b, 0x7cc456, 0xffe27a] // tomato, leaf, corn

const { pan } = DATA.scenes.comfy
const PAN_DY = [0, -1, -2, -3, -3, -2, -1, 1, 0, 0, 0, 0, 0, 0, 0] as const
const SQUASH = [1, -1, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] as const
const HAT = [0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] as const
const ARC = [1, 2, 4] as const
const EYES: readonly Pose['eyes'][] = ['right', 'up', 'up', 'up', 'up', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']

export const stirAt = (k: Kitchen): Moment => {
  const n = Math.max(0, Math.floor(k.sinceMood / TICK_MS)) % STIR_TICKS
  const panDy = PAN_DY[n]!
  const squash = SQUASH[n]!
  const bits: Bit[] = []
  FOOD.forEach((color, i) => {
    // Bit i leaves the pan on tick 1 + i and is back in it five ticks later.
    const u = (n - 1 - i) / 5
    if (u < 0 || u > 1) return
    bits.push({ color, x: pan[0] + 10 + i * 4, y: pan[1] + panDy - 1 - Math.round(Math.sin(Math.PI * u) * ARC[i]!) })
  })
  return moment(
    {
      eyes: EYES[n]!,
      armL: n >= 10 && n <= 12 ? 'lift' : 'rest',
      armR: 'hold',
      // The hand keeps hold of the handle: its row follows the pan, and undoes the body's squash.
      handR: -1 + panDy - squash,
      squash,
      hat: HAT[n]!,
    },
    { tableX: k.tableX, panDy, isFlameOn: panDy < 0, bits },
  )
}
