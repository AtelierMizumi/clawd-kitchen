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
  /** Dots filled in the thought bubble, 0 to 3. */
  bubble: number
}

export const NONE: Action = { tableX: DATA.scenes.comfy.table.rest, knife: null, ingredient: { kind: 'meat', cut: 0, flying: false }, slice: null, panDy: 0, isFlameOn: false, bits: [], bubble: 0 }

export const PULL_STEP_MS = 120
export const CHOP_MS = 240
export const CUTS_PER_ITEM = 4
export const BUBBLE_STEP_MS = 420
export const STIR_MS = 1200

const FOOD = [0xe2493b, 0x7cc456, 0xffe27a] // tomato, leaf, corn
const BUBBLE = [1, 2, 3, 0]

const [, CLAWD_Y] = DATA.scenes.comfy.clawd
const { work, foodY, knifeX, pileX } = DATA.scenes.comfy.table
const KINDS = ['meat', 'cucumber', 'carrot'] as const

/** The knife's handle row through one chop: raised, halfway down, down, halfway up. */
const KNIFE_HY = [1, 3, 5, 3]

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

const thinking = (t: number): { pose: Pose; action: Action } => ({
  pose: { eyes: 'up', arms: 'up', legs: 'stand', glow: idlePose(t).glow },
  action: { ...NONE, bubble: BUBBLE[Math.floor(t / BUBBLE_STEP_MS) % BUBBLE.length]! },
})

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

export const actionAt = (
  mood: Mood,
  t: number,
  k: Kitchen = { tableX: NONE.tableX, sinceArrived: 0 },
): { pose: Pose; action: Action } => {
  if (mood === 'typing') return k.tableX < work ? pulling(t, k) : chopping(k)
  const { pose, action } =
    mood === 'thinking' ? thinking(t) : mood === 'stir' ? stir(t) : { pose: idlePose(t), action: NONE }
  return { pose, action: { ...action, tableX: k.tableX } }
}
