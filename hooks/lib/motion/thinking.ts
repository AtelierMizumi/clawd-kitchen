// Thinking: Clawd scrolls through dishes on his phone and cooks them. One cycle is 25 ticks:
//   0 - 4    the swipe: the thumb flicks up the screen and holds at the top, the screen scrolls, the bubble is empty
//   5 - 11   the new dish appears; his eyes go to the bubble, then to the stove
//   12 - 13  the right arm winds up, then releases
//   14 - 19  the dish's ingredient flies an arc into the pan or the pot
//   20 - 23  it lands: three drops splash out of the pan on different ticks, or the pot's lid pops twice
//   24       a beat before the next swipe
import { DATA } from '../../gen/data'
import type { Bit, Dish } from '../action'
import type { Pose } from '../clawd'
import { handAnchor, poseOf } from '../clawd'
import { DISH_CYCLE_MS } from '../table'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'

export const DISHES: readonly Dish[] = ['burger', 'egg', 'ramen']
export const SWIPE_MS = DISH_CYCLE_MS
export const PUFF = 0xdfe3e8
const TICKS = SWIPE_MS / TICK_MS

const { clawd, pan, pot } = DATA.scenes.comfy
const POT_LID_W = DATA.frames.pot_lid.width
/** What goes in for each dish, and where: burger and egg in the pan, ramen in the pot. The colour is read off the dish picture. */
const DISH_FOOD = {
  burger: { color: DATA.frames.dish_burger.pixels[2 * 14 + 4] as number, into: 'pan' },
  egg: { color: DATA.frames.dish_egg.pixels[2 * 14 + 4] as number, into: 'pan' },
  ramen: { color: DATA.frames.dish_ramen.pixels[1 * 14 + 2] as number, into: 'pot' },
} as const

const THUMB = [3, 2, 1, 0, 0] as const
const ARM_R: readonly Pose['armR'][] = ['lift', 'high', 'high', 'high']
const SPLASH_DX = [-3, 0, 3] as const

export const thinkingAt = (k: Kitchen): Moment => {
  const tick = Math.max(0, Math.floor(k.sinceMood / TICK_MS))
  const n = tick % TICKS
  const dish = DISHES[((k.dishBase ?? 0) + Math.floor(tick / TICKS)) % DISHES.length]!
  const food = DISH_FOOD[dish]
  const swiping = n < THUMB.length
  const [tx, ty] = food.into === 'pot' ? [pot[0] + 7, pot[1]] : [pan[0] + 15, pan[1]]

  const eyes: Pose['eyes'] = n < 5 ? 'left' : n < 8 ? 'up' : n < 23 ? 'right' : 'left'
  const armR = n >= 12 && n <= 15 ? ARM_R[n - 12]! : 'rest'
  const pose = { eyes, armL: 'lift', armR, lean: n === 12 || n === 13 ? 1 : 0 } as const

  const bits: Bit[] = []
  let lidDy = 0
  if (n >= 14 && n <= 19) {
    // The bit leaves the raised right hand and arcs to its target, six ticks in the air.
    const [ax, ay] = handAnchor(poseOf({ armR: 'high' }), 'R')
    const [sx, sy] = [clawd[0] + ax + 2, clawd[1] + ay]
    const u = (n - 13) / 7
    bits.push({ color: food.color, x: Math.round(sx + (tx - sx) * u), y: Math.round(sy + (ty - sy) * u - Math.sin(Math.PI * u) * 6) })
  } else if (n >= 20 && n <= 23 && food.into === 'pan') {
    // Drop i leaves on tick 20 + i, up for one tick and falling for the next.
    SPLASH_DX.forEach((dx, i) => {
      const age = n - 20 - i
      if (age === 0 || age === 1) bits.push({ color: food.color, x: tx + dx, y: age === 0 ? ty - 3 : ty - 1 })
    })
  } else if (n >= 20 && n <= 23) {
    // The lid pops at 20 and again at 22, with a puff each side.
    if (n % 2 === 0) {
      lidDy = -1
      bits.push({ color: PUFF, x: pot[0] - 1, y: pot[1] }, { color: PUFF, x: pot[0] + POT_LID_W, y: pot[1] })
    }
  }

  return moment(pose, {
    tableX: k.tableX,
    phone: { thumb: swiping ? THUMB[n]! : null, scroll: swiping ? n : 0 },
    dish: swiping ? null : dish,
    bits,
    lidDy,
  })
}
