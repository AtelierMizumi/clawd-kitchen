// The kitchen scene: props, pan, flames, food and Clawd composed onto one
// canvas, with FX_ROWS cell rows left empty on top for braille effects.
import { DATA } from '../gen/data'
import type { Action } from './actions'
import { NONE } from './actions'
import type { Pose } from './clawd'
import { drawClawd } from './clawd'
import type { Canvas, Fx, Sprite } from './raster'
import { createCanvas, draw, overlayFx, toCells } from './raster'
import { steam } from './steam'

export type SceneName = keyof typeof DATA.scenes
export type FrameName = keyof typeof DATA.frames

export const FX_ROWS = 1
export const FLAME_STEP_MS = 150

export const frame = (name: FrameName): Sprite => DATA.frames[name]

type TableSpec = (typeof DATA.scenes)[SceneName]['table']

/** The dark backsplash behind the food: drawn before Clawd, and only as wide as the food zone. */
const drawBack = (c: Canvas, tab: TableSpec, action: Action, top: number): void => {
  draw(c, frame('prep_back'), Math.round(action.tableX) + tab.backX, tab.backY + top)
}

/** One ingredient column: the sprite's own column, or the flat cut face the knife leaves. */
const foodColumn = (sprite: Sprite, col: number): Sprite => ({
  width: 1,
  height: sprite.height,
  pixels: Array.from({ length: sprite.height }, (_, r) => sprite.pixels[r * sprite.width + col] ?? null),
})

/** The front of the table, drawn after Clawd so it hides his legs, with everything on it. */
const drawFront = (c: Canvas, tab: TableSpec, action: Action, top: number): void => {
  const x = Math.round(action.tableX)
  const y = tab.foodY + top
  draw(c, frame('prep_front'), x, tab.frontY + top)

  const { kind, cut, flying } = action.ingredient
  const food = frame(kind)
  const slice = frame(`${kind}_slice` as FrameName)
  // The pile: one slice per cut so far, each fanned one pixel over the last.
  for (let k = 0; k < cut; k++) draw(c, slice, x + tab.pileX + k, y)
  // What is left slides right to the knife, and ends in a flat cut face.
  const keep = food.width - 2 * (cut + (flying ? 1 : 0))
  const x0 = x + tab.foodEnd - keep + 1
  if (keep === food.width) draw(c, food, x0, y)
  else if (keep > 0) {
    for (let i = 0; i < keep - 1; i++) draw(c, foodColumn(food, i), x0 + i, y)
    draw(c, frame(`${kind}_cut` as FrameName), x0 + keep - 1, y)
  }

  if (action.slice) draw(c, frame(`${action.slice.kind}_slice` as FrameName), action.slice.x, action.slice.y + top)
  if (action.knife) draw(c, frame('knife_v'), action.knife.x, action.knife.hy + top)
  else draw(c, frame('knife'), x + tab.flatKnifeX, tab.flatKnifeY + top)
}

export const renderScene = (name: SceneName, pose: Pose, action: Action = NONE, t = 0): Canvas => {
  const scene = DATA.scenes[name]
  const top = FX_ROWS * 2
  const c = createCanvas(scene.width, scene.height + top)
  for (const [prop, x, y] of scene.props) draw(c, frame(prop as FrameName), x, y + top)
  if (action.isFlameOn) {
    const flame = Math.floor(t / FLAME_STEP_MS) % 2 === 0 ? 'flame_a' : 'flame_b'
    draw(c, frame(flame), scene.flame[0], scene.flame[1] + top)
  }
  draw(c, frame('pan'), scene.pan[0], scene.pan[1] + action.panDy + top)
  drawBack(c, scene.table, action, top)
  drawClawd(c, scene.clawd[0], scene.clawd[1] + top, pose)
  drawFront(c, scene.table, action, top)
  for (const bit of action.bits) {
    const y = bit.y + top
    if (bit.x >= 0 && bit.x < c.width && y >= 0 && y < c.height) c.px[y * c.width + bit.x] = bit.color
  }
  const dot = frame('bubble_dot')
  for (let i = 0; i < action.bubble; i++) draw(c, dot, scene.bubble[0] + i * (dot.width + 1), scene.bubble[1] + top)
  return c
}

const STEAM = { lifeMs: 2600, rise: 9, sway: 1, color: 0xa9b1bb }
/** The scene as Raster cells at `t` ms: pixels, then braille steam in the empty cells. */
export const sceneCells = (
  name: SceneName,
  pose: Pose,
  t: number,
  { steam: withSteam = true, action = NONE }: { steam?: boolean; action?: Action } = {},
): Uint32Array => {
  const scene = DATA.scenes[name]
  const cells = toCells(renderScene(name, pose, action, t))
  const fx: Fx[] = []
  if (withSteam) {
    // A steam source names the empty pixel above a pot or pan; it rises from that pixel's lower dots.
    fx.push(
      ...scene.steam.flatMap(([x, y, count], i) =>
        steam(t + i * 911, { x: x * 2, y: (y + FX_ROWS * 2) * 2 + 1 }, { ...STEAM, count }),
      ),
    )
  }
  overlayFx(cells, scene.width, fx)
  return cells
}
