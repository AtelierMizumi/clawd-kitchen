// What the kitchen does around Clawd at one moment: the data `renderScene` draws besides his pose.
import { DATA } from '../gen/data'

/** One flying pixel of food, in scene pixels. */
export type Bit = { color: number; x: number; y: number }
export type Ingredient = 'meat' | 'cucumber' | 'carrot'
export type Dish = 'burger' | 'egg' | 'ramen'

export type Action = {
  /** The prep table's left edge in scene pixels; it is drawn on the nearest whole cell. */
  tableX: number
  /** Clawd holds the knife in his left hand; it is drawn at that hand. */
  knife: boolean
  ingredient: { kind: Ingredient; cut: number; flying: boolean }
  /** A slice in the air, in scene pixels, or null. */
  slice: { kind: Ingredient; x: number; y: number } | null
  /** Pan offset in pixels: 0 on the stove, negative when tossed up. */
  panDy: number
  isFlameOn: boolean
  bits: Bit[]
  /** Pixels the pot's lid is lifted: 0 shut, -1 rattling up. */
  lidDy: number
  /** Extra steam particles over the pot. */
  potSteam: number
  /** The pan holds a burnt lump. */
  isBurnt: boolean
  /** Dark smoke rising from here, or null. */
  smoke: { x: number; y: number; count: number } | null
  /** A sleeping Clawd's z, small or big, or null. */
  zee: { x: number; y: number; big: boolean } | null
  /** The finished dish on the table, dropped by `dy` pixels above its place, or null. */
  plate: { dish: Dish; dy: number } | null
  /** The salt shaker in Clawd's right hand, jiggled by `dy` rows, or null. */
  shaker: { dy: number } | null
  /** The phone Clawd is scrolling, or null. */
  phone: { thumb: number | null; scroll: number } | null
  /** The dish shown in the bubble above the phone, or null for an empty bubble. */
  dish: Dish | null
}

export const NONE: Action = {
  tableX: DATA.scenes.comfy.table.rest,
  knife: false,
  ingredient: { kind: 'meat', cut: 0, flying: false },
  slice: null,
  panDy: 0,
  isFlameOn: false,
  bits: [],
  lidDy: 0,
  potSteam: 0,
  plate: null,
  isBurnt: false,
  smoke: null,
  zee: null,
  shaker: null,
  phone: null,
  dish: null,
}
