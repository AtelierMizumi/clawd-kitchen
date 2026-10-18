// Smoke (an error or a refusal): the dish is burnt and dark smoke pours from the pan. Clawd is startled (eyes wide, a
// hop back, arms up), then coughs with his eyes shut, shaking a cell side to side while an arm fans the smoke away, and
// finally droops: shoulders down, the hat slipping.
import { DATA } from '../../gen/data'
import type { Pose } from '../clawd'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'

export const SMOKE_PUFF = 10
const { pan } = DATA.scenes.comfy
const STARTLE = 3
const COUGH = 20

export const smokeAt = (k: Kitchen): Moment => {
  const n = Math.max(0, Math.floor(k.sinceMood / TICK_MS))
  const pose: Partial<Pose> =
    n < STARTLE
      ? { eyes: 'wide', armL: 'high', armR: 'high', squash: n === 0 ? 1 : -1, legs: n === 0 ? 'stand' : 'hop', lean: n === 0 ? 0 : -1 }
      : n < STARTLE + COUGH
        ? { eyes: 'closed', lean: n % 2 === 0 ? -1 : 0, armR: Math.floor(n / 2) % 2 === 0 ? 'high' : 'lift' }
        : { eyes: 'half', squash: 1, hat: 1 }
  return moment(pose, { tableX: k.tableX, isBurnt: true, smoke: { x: pan[0] + 14, y: pan[1] - DATA.frames.burnt.height - 1, count: SMOKE_PUFF } })
}
