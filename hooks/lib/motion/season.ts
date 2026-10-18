// Season (an edit): the right hand shakes salt over the pan. The shaker jiggles a row up and down for six ticks and is
// held still while three grains fall from it at different speeds, one after another, into the pan; Clawd's eyes follow
// the shaker, then the grains, and he nods when he is done. One cycle is 12 ticks.
import { DATA } from '../../gen/data'
import type { Bit } from '../action'
import { handAnchor, poseOf } from '../clawd'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'
import { PUFF } from './thinking'

export const SEASON_TICKS = 12
const JIGGLE = [0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0] as const
/** Grain i leaves on tick 2i and falls for six ticks, drifting toward the pan this many pixels a tick. */
const SPEED = [1.5, 2, 2.5] as const

const [cx, cy] = DATA.scenes.comfy.clawd

export const seasonAt = (k: Kitchen): Moment => {
  const n = Math.max(0, Math.floor(k.sinceMood / TICK_MS)) % SEASON_TICKS
  // The shaker is four rows tall, two above the right hand's top; its mouth is the row below it.
  const [ax, ay] = handAnchor(poseOf({ armR: 'high' }), 'R')
  const [mouthX, mouthY] = [cx + ax + 3, cy + ay + 2]
  const bits: Bit[] = []
  SPEED.forEach((speed, i) => {
    const age = n - 2 * i
    if (age >= 0 && age < 6) bits.push({ color: PUFF, x: mouthX + Math.round(speed * age), y: mouthY + (age >= 3 ? 1 : 0) })
  })
  const eyes = n < 6 ? 'right' : n < 10 ? 'down' : n === 10 ? 'half' : 'happy'
  return moment({ eyes, armR: 'high', hat: n === 10 ? 1 : 0 }, { tableX: k.tableX, shaker: { dy: JIGGLE[n]! }, bits })
}
