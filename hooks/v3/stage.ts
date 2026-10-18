// The v3 stage: the band above the prompt, 80 columns by 16 rows: 160x32 quadrant pixels, as Claude Code draws Clawd.
// Everything but Clawd is drawn in 2x2 blocks (one cell wide), so no cell ever holds more than a prop and the
// background. The kitchen: a wall shelf at the top left, the prep table at the left (parked at the far left until it
// is pulled to the board), Clawd, and the stove with its pot right beside him. At rest he idles (hooks/v3/idle.ts); while
// someone types the table is pulled in and every key is a chop (hooks/v3/chop.ts).
import { V3 } from '../gen/v3'
import { createCanvas, draw, toCells } from '../lib/raster'
import type { Canvas, Sprite } from '../lib/raster'
import { drawClawd, pose } from './clawd'
import { LEAVE_FRAMES, createTyping, viewAt } from './chop'
import type { Typing, View } from './chop'
import { blinkAt, breathAt, idleAt } from './idle'
import { MOOD_NAMES, moodAt } from './moods'
import type { MoodName } from './moods'
import { frameAt } from './time'

export const COLUMNS = 80
export const ROWS = 16
const WIDTH = COLUMNS * 2
const HEIGHT = ROWS * 2
const BLOCK = 2
/** Clawd stands on the floor's top row: the floor is a block (two pixels) thick, at the bottom. */
const GROUND = HEIGHT - BLOCK
/** The middle of his body (odd, so the model sits on cell edges): his body fills columns 29..41. */
const CLAWD_X = 71

/** Block positions on the stage: [column, row]. The table's place at the board; food and pile are set from its corner. */
const TABLE: readonly [number, number] = [10, 13]
const FOOD: readonly [number, number] = [6, -2]
const SHELF: readonly [number, number] = [4, 0]
/** The stove stands right by his right arm, as the table does by his left: the pot is on its left burner. */
const STOVE: readonly [number, number] = [44, 12]
const POT: readonly [number, number] = [46, 10]
const WINDOW: readonly [number, number] = [46, 1]
/** The columns the three puffs of steam rise from, on the row above the pot's lid. */
const STEAM_COLS = [47, 49, 51] as const
const STEAM_ROW = 7
const SPARK: readonly [number, number] = [21, 9]
/** The slice leaves the food's end under the blade: a block above it. */
const KNIFE_AT: readonly [number, number] = [13, -3]
/** Where each slice of the pile lies, from the table's corner (row -1 is the board's top, -2 the one above it). */
const PILE: readonly (readonly [number, number])[] = [[1, -1], [2, -1], [3, -1], [4, -1], [5, -1], [2, -2], [3, -2], [4, -2]]
const INGREDIENTS = ['carrot', 'cucumber', 'meat'] as const

const F = V3.frames as unknown as Record<string, Sprite>
const blit = (c: Canvas, frame: string, col: number, row: number) => draw(c, F[frame]!, col * BLOCK, row * BLOCK)
const blitPx = (c: Canvas, frame: string, x: number, y: number) => draw(c, F[frame]!, x, y)

export { blinkAt } from './idle'

/** The ingredient of the `i`th slice thrown: a new one every time the pile is full. */
const ingredientOf = (i: number) => INGREDIENTS[Math.floor(i / PILE.length) % INGREDIENTS.length]!

/** Where a slice in the air is, in pixels: from under the blade to its place on the pile, rising and falling on the way. */
const slicePx = (table: number, age: number, rise: number, index: number): [number, number] => {
  const [sx, sy] = [(TABLE[0] + KNIFE_AT[0]) * BLOCK + table, (TABLE[1] + KNIFE_AT[1]) * BLOCK]
  const [pc, pr] = PILE[index % PILE.length]!
  const [ex, ey] = [(TABLE[0] + pc) * BLOCK + table, (TABLE[1] + pr) * BLOCK]
  const u = (age + 1) / 8
  const even = (v: number) => BLOCK * Math.round(v / BLOCK)
  return [even(sx + (ex - sx) * u), even(sy + (ey - sy) * u - rise)]
}

/** The steam: three puffs, each rising a block every 6 frames and fading, a third of a cycle apart; `from` is its first row. */
const steam = (c: Canvas, f: number, from: number) => {
  STEAM_COLS.forEach((col, k) => {
    const rise = Math.floor(((f + k * 8) % 24) / 6)
    blit(c, `steam${Math.max(0, rise - 1)}`, col + (rise % 2), from - rise)
  })
}

/** What the director tells the stage besides the typing: the mood of the turn, since when, and the answers served. */
export type Scene = { mood?: MoodName | 'idle' | 'typing'; moodSince?: number; served?: number }
/** The thought bubble over his head, in blocks: two small bubbles lead up from the hat to the cloud. */
const TAIL_SMALL: readonly [number, number] = [40, 6]
const TAIL_BIG: readonly [number, number] = [41, 5]
const CLOUD_GROW: readonly [number, number] = [43, 1]
const CLOUD: readonly [number, number] = [41, 0]
/** The dish sits on the plate: the plate's row, in blocks, is 9 held and 7 raised. */
const DISH_AT = { plate_hold: [46, 7], plate_up: [46, 5] } as const

/** Clawd's pose from what the typing mood asks of him, or at rest from the idle sheets. */
const clawdPose = (view: View, f: number, idleStart: number) => {
  if (view.pose === null) return idleAt(f - idleStart)
  // Between chops he breathes and blinks while he holds the knife; in a beat the drawing is the whole pose.
  if (view.stance !== null) return pose({ ...breathAt(f), eyes: blinkAt(f), ...view.pose })
  return pose(view.pose)
}

/** The band `ms` into the stage's life, with whatever typing is going on (none by default: Clawd at rest). */
export const stageCanvas = (ms: number, typing: Typing = createTyping(), scene: Scene = {}): Canvas => {
  const f = frameAt(ms)
  const view = viewAt(typing, ms)
  // A mood plays once the table is away and the knife put down: its clock starts then, or when it began, if later.
  const leaveEnd = typing.leaveAt === null ? 0 : typing.leaveAt + LEAVE_FRAMES
  const sinceFrame = Math.max(frameAt(scene.moodSince ?? 0), leaveEnd)
  const mood = view.stage === 'away' && scene.mood !== undefined && (MOOD_NAMES as readonly string[]).includes(scene.mood) ? moodAt(scene.mood as MoodName, f - sinceFrame, scene.served ?? 0) : null
  const c = createCanvas(WIDTH, HEIGHT)
  const table = view.table

  blit(c, 'wall', 0, 0)
  blit(c, 'floor', 0, ROWS - 1)
  blit(c, 'window', WINDOW[0], WINDOW[1])
  blit(c, 'shelf', SHELF[0], SHELF[1])
  blit(c, 'stove', STOVE[0], STOVE[1])
  const potState = mood?.pot ?? 'lid'
  blit(c, 'pot_body', POT[0], POT[1])
  if (potState === 'lid') blit(c, 'pot_lid', POT[0], POT[1] - 2)
  else blit(c, potState === 'open' ? 'soup' : 'soup_burnt', POT[0], POT[1] - 1)
  if (mood === null || mood.steam) steam(c, f, potState === 'lid' ? STEAM_ROW : STEAM_ROW + 1)
  for (const b of mood?.bubbles ?? []) {
    if (b.popping) blit(c, 'pop', b.x - 1, b.y - 1)
    else blit(c, 'bubble', b.x, b.y)
  }

  // The table, the food on its board, and the slices that have landed.
  const [tx, ty] = [TABLE[0] * BLOCK + table, TABLE[1] * BLOCK]
  blitPx(c, 'table', tx, ty)
  blitPx(c, `food_${ingredientOf(Math.max(0, view.pile - 1))}`, tx + FOOD[0] * BLOCK, ty + FOOD[1] * BLOCK)
  const landed = view.pile % PILE.length || (view.pile > 0 ? PILE.length : 0)
  for (let i = 0; i < landed; i++) {
    const [pc, pr] = PILE[i]!
    blitPx(c, `slice_${ingredientOf(view.pile - 1)}`, tx + pc * BLOCK, ty + pr * BLOCK)
  }

  // After a leave, or a mood, he starts his idling afresh, so he does not begin in the middle of a fidget.
  const idleStart = Math.max(leaveEnd, scene.mood === 'idle' || scene.mood === 'typing' ? frameAt(scene.moodSince ?? 0) : 0)
  const p = mood ? pose(mood.pose) : clawdPose(view, f, idleStart)
  // His shadow on the floor shrinks as he lifts off it.
  const [shadow, half] = (p.lift >= 5 ? ['shadow_small', 5] : p.lift >= 2 ? ['shadow_mid', 9] : ['shadow_wide', 13]) as [string, number]
  blitPx(c, shadow, CLAWD_X + p.dx - half, GROUND)
  drawClawd(c, CLAWD_X, GROUND, p)

  if (mood) {
    if (mood.bubble >= 1) blit(c, 'tail_small', TAIL_SMALL[0], TAIL_SMALL[1])
    if (mood.bubble >= 2) blit(c, 'tail_big', TAIL_BIG[0], TAIL_BIG[1])
    if (mood.bubble === 3) blit(c, 'cloud_grow', CLOUD_GROW[0], CLOUD_GROW[1])
    if (mood.bubble === 4) blit(c, `cloud_${mood.dots}`, CLOUD[0], CLOUD[1])
    if (mood.plate !== null && p.tool !== null && p.tool !== undefined) {
      const at = DISH_AT[p.tool as 'plate_hold' | 'plate_up']
      if (at) blit(c, mood.plate, at[0], at[1])
    }
    for (const fl of mood.flakes) blit(c, `flake_${fl.kind}`, fl.x, fl.y)
    for (const sm of mood.smoke) {
      if (sm.size === 'big') blit(c, 'smoke_big', sm.x - 1, sm.y - 1)
      else blit(c, 'smoke_small', sm.x, sm.y)
    }
    for (const z of mood.zs) blitPx(c, z.size === 'big' ? 'z_big' : 'z_small', z.x, z.y)
    for (const st of mood.stars) blit(c, 'star', st.x, st.y)
  }
  for (const s of view.slices) {
    const [sx, sy] = slicePx(table, s.age, s.rise, s.index)
    blitPx(c, `slice_${ingredientOf(s.index)}`, sx, sy)
  }
  if (view.beat === 'impact' || view.beat === 'hitstop') blit(c, 'spark', SPARK[0], SPARK[1])
  return c
}

/** The band's cells `ms` into the stage's life. */
export const stageCells = (ms: number, typing: Typing = createTyping(), scene: Scene = {}): Uint32Array => toCells(stageCanvas(ms, typing, scene))

/** Measures the gaps between real redraws, keeping the last `keep`. */
export const pace = (keep = 240) => {
  let last: number | undefined
  const gaps: number[] = []
  return {
    mark(t: number) {
      if (last !== undefined) {
        gaps.push(t - last)
        if (gaps.length > keep) gaps.shift()
      }
      last = t
    },
    summary() {
      if (gaps.length === 0) return { count: 0, medianMs: 0, maxMs: 0 }
      const sorted = [...gaps].sort((a, b) => a - b)
      return { count: gaps.length, medianMs: sorted[Math.floor(sorted.length / 2)]!, maxMs: sorted[sorted.length - 1]! }
    },
  }
}
