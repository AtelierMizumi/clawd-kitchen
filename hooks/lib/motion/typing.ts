// Typing: Clawd pulls the prep table over and chops. One chop is five ticks: the knife up (his body stretches),
// down, into the food (a crouch), kicking the slice off (the hat a beat late), and back. The slice flies a short arc
// to the pile and touches down above its place on the next chop's wind-up; four slices to an ingredient, meat then
// cucumber then carrot, each reacting a little differently to its first cut.
import { DATA } from '../../gen/data'
import type { Ingredient } from '../action'
import type { Pose } from '../clawd'
import { CELL_W } from '../raster'
import { TICK_MS } from './keyframes'
import { moment } from './moment'
import type { Kitchen, Moment } from './moment'
import { pullAt } from './pull'

export const CUTS_PER_ITEM = 4
export const KINDS: readonly Ingredient[] = ['meat', 'cucumber', 'carrot']
const TICKS_PER_CHOP = 5
export const CHOP_MS = TICKS_PER_CHOP * TICK_MS

const { work } = DATA.scenes.comfy.table
const { foodY, knifeX, pileX } = DATA.scenes.comfy.table

// Per tick of a chop: the hand's row, the body's squash and the hat's lag.
const HAND = [-4, -2, 0, -2, -3] as const
const SQUASH = [-1, 0, 1, 0, 0] as const
const HAT = [0, 0, 0, 1, 0] as const
/** A little reaction on the first cut of each ingredient. */
const NOD: Record<Ingredient, Partial<Pose>> = { meat: { hat: 1 }, cucumber: { eyes: 'wide' }, carrot: { armR: 'lift' } }

/** The slice's flight: where it is, from the blade (0) to its place on the pile (1), and how high. */
const FLIGHT = [
  { u: 0.35, rise: 3 },
  { u: 0.75, rise: 4 },
  { u: 1, rise: 1 },
] as const

export const typingAt = (k: Kitchen): Moment => {
  if (k.tableX < work) return pullAt(k)
  // Counted from the arrival, or from the start of the mood if that is later: a mood that begins with the table already
  // there still plays from its first keyframe.
  const n = Math.max(0, Math.floor(Math.min(k.sinceArrived, k.sinceMood) / TICK_MS))
  const i = n % TICKS_PER_CHOP
  // Slice j is cut at tick 5j + 2, kicked at 5j + 3, at its apex at 5j + 4, touches down at 5j + 5 and lies in the pile from 5j + 6.
  const landed = n >= 6 ? Math.floor((n - 1) / TICKS_PER_CHOP) : 0
  const flightStep = i >= 3 ? i - 3 : i === 0 && n >= TICKS_PER_CHOP ? 2 : -1
  const kind = KINDS[Math.floor(landed / CUTS_PER_ITEM) % KINDS.length]!
  const cutIndex = i === 2 ? (n - 2) / TICKS_PER_CHOP : -1
  const nod = cutIndex >= 0 && cutIndex % CUTS_PER_ITEM === 0 ? NOD[KINDS[Math.floor(cutIndex / CUTS_PER_ITEM) % KINDS.length]!] : {}

  let slice = null
  if (flightStep >= 0) {
    const { u, rise } = FLIGHT[flightStep]!
    const from = work + knifeX
    const to = work + pileX + (landed % CUTS_PER_ITEM) * CELL_W
    slice = { kind, x: Math.round(from + (to - from) * u), y: foodY - rise }
  }
  return moment(
    { armL: 'hold', handL: HAND[i]!, eyes: 'down', squash: SQUASH[i]!, hat: HAT[i]!, ...nod },
    { tableX: k.tableX, knife: true, ingredient: { kind, cut: landed % CUTS_PER_ITEM, flying: flightStep >= 0 }, slice },
  )
}
