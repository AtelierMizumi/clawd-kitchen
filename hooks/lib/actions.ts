// What Clawd's body and the kitchen do in each mood, as a pure function of
// time: a Pose for Clawd and an Action for the pan, flames, food and bubble.
import { DATA } from '../gen/data'
import type { Pose } from './clawd'
import { idlePose } from './clawd'
import type { Mood } from './mood'

/** One flying pixel of food, in scene pixels. */
export type Bit = { color: number; x: number; y: number }
export type Kitchen = { tableX: number; sinceArrived: number }
export type Action = {
  tableX: number
  knife: { x: number; hy: number } | null
  ingredient: { kind: 'meat' | 'cucumber' | 'carrot'; cut: number; flying: boolean }
  slice: { kind: 'meat' | 'cucumber' | 'carrot'; x: number; y: number } | null
  /** Pan offset in pixels: 0 on the stove, negative when tossed up. */
  panDy: number
  isFlameOn: boolean
  bits: Bit[]
  /** Pixels the pot's lid is lifted: 0 shut, -1 rattling up. */
  lidDy: number
  /** Extra steam particles over the pot. */
  potSteam: number
  /** The phone Clawd is scrolling, or null. */
  phone: { thumb: number | null; scroll: number } | null
  /** The dish shown in the bubble above the phone, or null for an empty bubble. */
  dish: 'burger' | 'egg' | 'ramen' | null
}

export const NONE: Action = { tableX: DATA.scenes.comfy.table.rest, knife: null, ingredient: { kind: 'meat', cut: 0, flying: false }, slice: null, panDy: 0, isFlameOn: false, bits: [], lidDy: 0, potSteam: 0, phone: null, dish: null }

export const PULL_STEP_MS = 120
export const CHOP_MS = 240
export const CUTS_PER_ITEM = 4
export const LID_STEP_MS = 140
export const SIMMER_STEAM = 7
export const SWIPE_MS = 2000
export const DISHES = ['burger', 'egg', 'ramen'] as const
export const STIR_MS = 1200

const FOOD = [0xe2493b, 0x7cc456, 0xffe27a] // tomato, leaf, corn

const [, CLAWD_Y] = DATA.scenes.comfy.clawd
const { work, foodY, knifeX, pileX } = DATA.scenes.comfy.table
const KINDS = ['meat', 'cucumber', 'carrot'] as const
const [POT_X, POT_Y] = DATA.scenes.comfy.pot
const POT_W = DATA.frames.pot_lid.width
const PUFF = 0xdfe3e8
const [CLAWD_X] = DATA.scenes.comfy.clawd
const [PAN_X, PAN_Y] = DATA.scenes.comfy.pan

/**
 * The knife's handle row through one chop: raised (blade clear of the food), halfway
 * down, down (blade on the board), halfway up. Measured from the food, so the stroke
 * is the same wherever the table stands.
 */
const KNIFE_HY = [foodY - 3, foodY - 1, foodY + 1, foodY - 1]

// The table is still coming: Clawd leans toward it and tugs with quick steps.
const pulling = (t: number, k: Kitchen): { pose: Pose; action: Action } => ({
  pose: {
    eyes: 'left',
    arms: 'up',
    legs: Math.floor(t / PULL_STEP_MS) % 2 === 0 ? 'stand' : 'tap',
    glow: idlePose(t).glow,
  },
  action: { ...NONE, tableX: k.tableX },
})

// The table is here: one chop per CHOP_MS. The knife comes down at the middle of
// the chop and the two-column slice it cuts hops over to the fanned pile on the
// left; meat first, then cucumber, then carrot.
const chopping = (k: Kitchen): { pose: Pose; action: Action } => {
  const s = k.sinceArrived
  const cycle = Math.floor(s / CHOP_MS)
  const phase = (s % CHOP_MS) / CHOP_MS
  const cut = cycle % CUTS_PER_ITEM
  const kind = KINDS[Math.floor(cycle / CUTS_PER_ITEM) % KINDS.length]!
  const hy = KNIFE_HY[Math.min(3, Math.floor(phase * 4))]!
  const isFlying = phase >= 0.5

  let slice: Action['slice'] = null
  if (isFlying) {
    const u = (phase - 0.5) / 0.5
    const from = k.tableX + knifeX
    const to = k.tableX + pileX + cut
    slice = {
      kind,
      x: Math.round(from + (to - from) * u),
      y: foodY - Math.round(Math.sin(Math.PI * u) * 3),
    }
  }

  return {
    pose: { eyes: 'down', arms: 'rest', legs: 'stand', glow: idlePose(s).glow, reach: hy - CLAWD_Y },
    action: {
      ...NONE,
      tableX: k.tableX,
      knife: { x: k.tableX + knifeX, hy },
      ingredient: { kind, cut, flying: isFlying },
      slice,
    },
  }
}

// What goes in for each dish, and where: burger and egg in the pan, ramen in the pot.
// The colour is read off the dish picture so the food matches what is on the phone.
const DISH_FOOD = {
  burger: { color: DATA.frames.dish_burger.pixels[4 * 7 + 3] as number, into: 'pan' },
  egg: { color: DATA.frames.dish_egg.pixels[2 * 7 + 2] as number, into: 'pan' },
  ramen: { color: DATA.frames.dish_ramen.pixels[1 * 7 + 2] as number, into: 'pot' },
} as const

const TOSS_FROM = 0.5
const TOSS_TO = 0.8
const SPLASH_TO = 0.9

// Thinking: Clawd scrolls through dishes on his phone and cooks them. Each cycle:
//   0 – 0.2   the swipe: the thumb flicks up the screen and the bubble is empty
//   0.2 – 0.5 the new dish pops in and the thumb lifts away
//   0.5 – 0.8 the right hand tosses the dish's ingredient into the pan or the pot
//   0.8 – 0.9 it lands: three drops splash from the pan, or the pot's lid pops
const thinking = (t: number): { pose: Pose; action: Action } => {
  const cycle = Math.floor(t / SWIPE_MS)
  const phase = (t % SWIPE_MS) / SWIPE_MS
  const isSwiping = phase < 0.2
  const step = Math.min(3, Math.floor((phase / 0.2) * 4))
  const dish = DISHES[cycle % DISHES.length]!
  const food = DISH_FOOD[dish]
  const isTossing = phase >= TOSS_FROM && phase < TOSS_TO
  const isSplashing = phase >= TOSS_TO && phase < SPLASH_TO
  const [tx, ty] = food.into === 'pot' ? [POT_X + 3, POT_Y] : [PAN_X + 7, PAN_Y]

  let bits: Bit[] = []
  let lidDy = 0
  if (isTossing) {
    const u = (phase - TOSS_FROM) / (TOSS_TO - TOSS_FROM)
    const [hx, hy] = [CLAWD_X + 13, CLAWD_Y + 1]
    bits = [{ color: food.color, x: Math.round(hx + (tx - hx) * u), y: Math.round(hy + (ty - hy) * u - Math.sin(Math.PI * u) * 5) }]
  } else if (isSplashing && food.into === 'pan') {
    bits = [
      { color: food.color, x: tx - 1, y: ty - 1 },
      { color: food.color, x: tx + 1, y: ty - 1 },
      { color: food.color, x: tx, y: ty - 2 },
    ]
  } else if (isSplashing) {
    lidDy = -1
    bits = [
      { color: PUFF, x: POT_X - 1, y: POT_Y },
      { color: PUFF, x: POT_X + POT_W, y: POT_Y },
    ]
  }

  return {
    pose: { eyes: 'left', arms: 'rest', legs: 'stand', glow: idlePose(t).glow, phone: true, toss: isTossing },
    action: {
      ...NONE,
      phone: { thumb: isSwiping ? 3 - step : null, scroll: isSwiping ? step : 0 },
      dish: isSwiping ? null : dish,
      bits,
      lidDy,
    },
  }
}

// The pan sits, rises in two steps, hangs at the top, then drops back.
const panDyAt = (p: number): number => {
  if (p < 0.15) return 0
  if (p < 0.3) return -1
  if (p < 0.6) return -2
  if (p < 0.75) return -1
  return 0
}

const stir = (t: number): { pose: Pose; action: Action } => {
  const p = (t % STIR_MS) / STIR_MS
  const panDy = panDyAt(p)
  const [panX, panY] = DATA.scenes.comfy.pan
  const top = panY + panDy
  const bits: Bit[] = []
  if (panDy < 0) {
    // One arc over the toss; each piece flies a little higher than the last.
    const u = Math.min(1, Math.max(0, (p - 0.15) / 0.6))
    FOOD.forEach((color, i) => {
      bits.push({ color, x: panX + 4 + i * 2, y: top - 1 - Math.round(Math.sin(Math.PI * u) * (1 + i)) })
    })
  }
  return {
    pose: { eyes: 'right', arms: panDy < 0 ? 'up' : 'rest', legs: 'stand', glow: idlePose(t).glow },
    action: { ...NONE, panDy, isFlameOn: panDy < 0, bits },
  }
}

// Simmering: the answer is streaming, so the pot bubbles. The lid rattles up and
// down and steam squeezes out on both sides whenever it is up.
const simmer = (t: number): { pose: Pose; action: Action } => {
  const isUp = Math.floor(t / LID_STEP_MS) % 2 === 1
  const bits: Bit[] = isUp
    ? [
        { color: PUFF, x: POT_X - 1, y: POT_Y },
        { color: PUFF, x: POT_X + POT_W, y: POT_Y },
      ]
    : []
  return {
    pose: { eyes: 'right', arms: 'rest', legs: 'stand', glow: idlePose(t).glow },
    action: { ...NONE, lidDy: isUp ? -1 : 0, potSteam: SIMMER_STEAM, bits },
  }
}

export const actionAt = (
  mood: Mood,
  t: number,
  k: Kitchen = { tableX: NONE.tableX, sinceArrived: 0 },
): { pose: Pose; action: Action } => {
  if (mood === 'typing') return k.tableX < work ? pulling(t, k) : chopping(k)
  const { pose, action } =
    mood === 'thinking'
      ? thinking(t)
      : mood === 'stir'
        ? stir(t)
        : mood === 'simmer'
          ? simmer(t)
          : { pose: idlePose(t), action: NONE }
  return { pose, action: { ...action, tableX: k.tableX } }
}
